import crel from 'crel';

const prefix = 'ProseMirror-menu';

// MenuItemSpec:: interface
// The configuration object passed to the `MenuItem` constructor.
//
//   run:: (EditorState, (Transaction), EditorView, dom.Event)
//   The function to execute when the menu item is activated.
//
//   select:: ?(EditorState) → bool
//   Optional function that is used to determine whether the item is
//   appropriate at the moment. Deselected items will be hidden.
//
//   enable:: ?(EditorState) → bool
//   Function that is used to determine if the item is enabled. If
//   given and returning false, the item will be given a disabled
//   styling.
//
//   active:: ?(EditorState) → bool
//   A predicate function to determine whether the item is 'active' (for
//   example, the item for toggling the strong mark might be active then
//   the cursor is in strong text).
//
//   render:: ?(EditorView) → dom.Node
//   A function that renders the item. You must provide either this,
//   [`icon`](#menu.MenuItemSpec.icon), or [`label`](#MenuItemSpec.label).
//
//   icon:: ?Object
//   Describes an icon to show for this item. The object may specify
//   an SVG icon, in which case its `path` property should be an [SVG
//   path
//   spec](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d),
//   and `width` and `height` should provide the viewbox in which that
//   path exists. Alternatively, it may have a `text` property
//   specifying a string of text that makes up the icon, with an
//   optional `css` property giving additional CSS styling for the
//   text. _Or_ it may contain `dom` property containing a DOM node.
//
//   label:: ?string
//   Makes the item show up as a text label. Mostly useful for items
//   wrapped in a [drop-down](#menu.Dropdown) or similar menu. The object
//   should have a `label` property providing the text to display.
//
//   title:: ?union<string, (EditorState) → string>
//   Defines DOM title (mouseover) text for the item.
//
//   class:: ?string
//   Optionally adds a CSS class to the item's DOM representation.
//
//   css:: ?string
//   Optionally adds a string of inline CSS to the item's DOM
//   representation.
//
//   execEvent:: ?string
//   Defines which event on the command's DOM representation should
//   trigger the execution of the command. Defaults to mousedown.

let lastMenuEvent = {time: 0, node: null}
function markMenuEvent(e) {
  lastMenuEvent.time = Date.now()
  lastMenuEvent.node = e.target
}
function isMenuEvent(wrapper) {
  return Date.now() - 100 < lastMenuEvent.time &&
    lastMenuEvent.node && wrapper.contains(lastMenuEvent.node)
}

// ::- A drop-down menu, displayed as a label with a downwards-pointing
// triangle to the right of it.
export class Dropdown {
  // :: ([MenuElement], ?Object)
  // Create a dropdown wrapping the elements. Options may include
  // the following properties:
  //
  // **`label`**`: string`
  //   : The label to show on the drop-down control.
  //
  // **`title`**`: string`
  //   : Sets the
  //     [`title`](https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/title)
  //     attribute given to the menu control.
  //
  // **`class`**`: string`
  //   : When given, adds an extra CSS class to the menu control.
  //
  // **`css`**`: string`
  //   : When given, adds an extra set of CSS styles to the menu control.
  constructor(content, options) {
    this.options = options || {}
    this.content = Array.isArray(content) ? content : [content]
  }

  // :: (EditorView) → {dom: dom.Node, update: (EditorState)}
  // Render the dropdown menu and sub-items.
  render(view) {
    let content = renderDropdownItems(this.content, view)

    let label = crel("div", {class: prefix + "-dropdown " + (this.options.class || ""),
                             style: this.options.css},
                     translate(view, this.options.label))
    if (this.options.title) label.setAttribute("title", translate(view, this.options.title))
    let wrap = crel("div", {class: prefix + "-dropdown-wrap"}, label)
    let open = null, listeningOnClose = null
    let close = () => {
      if (open && open.close()) {
        open = null
        window.removeEventListener("mousedown", listeningOnClose)
      }
    }
    label.addEventListener("mousedown", e => {
      e.preventDefault()
      markMenuEvent(e)
      if (open) {
        close()
      } else {
        open = this.expand(wrap, content.dom)
        window.addEventListener("mousedown", listeningOnClose = () => {
          if (!isMenuEvent(wrap)) close()
        })
      }
    })

    function update(state) {
      let inner = content.update(state)
      wrap.style.display = inner ? "" : "none"
      return inner
    }

    return {dom: wrap, update}
  }

  expand(dom, items) {
    let menuDOM = crel("div", {class: prefix + "-dropdown-menu " + (this.options.class || "")}, items)

    let done = false
    function close() {
      if (done) return
      done = true
      dom.removeChild(menuDOM)
      return true
    }
    dom.appendChild(menuDOM)
    return {close, node: menuDOM}
  }
}

function renderDropdownItems(items, view) {
  let rendered = [], updates = []
  for (let i = 0; i < items.length; i++) {
    let {dom, update} = items[i].render(view)
    rendered.push(crel("div", {class: prefix + "-dropdown-item"}, dom))
    updates.push(update)
  }
  return {dom: rendered, update: combineUpdates(updates, rendered)}
}

function combineUpdates(updates, nodes) {
  return state => {
    let something = false
    for (let i = 0; i < updates.length; i++) {
      let up = updates[i](state)
      nodes[i].style.display = up ? "" : "none"
      if (up) something = true
    }
    return something
  }
}

// ::- Represents a submenu wrapping a group of elements that start
// hidden and expand to the right when hovered over or tapped.
export class DropdownSubmenu {
  // :: ([MenuElement], ?Object)
  // Creates a submenu for the given group of menu elements. The
  // following options are recognized:
  //
  // **`label`**`: string`
  //   : The label to show on the submenu.
  constructor(content, options) {
    this.options = options || {}
    this.content = Array.isArray(content) ? content : [content]
  }

  // :: (EditorView) → {dom: dom.Node, update: (EditorState) → bool}
  // Renders the submenu.
  render(view) {
    let items = renderDropdownItems(this.content, view)

    let label = crel("div", {class: prefix + "-submenu-label"}, translate(view, this.options.label))
    let wrap = crel("div", {class: prefix + "-submenu-wrap"}, label,
                   crel("div", {class: prefix + "-submenu"}, items.dom))
    let listeningOnClose = null
    label.addEventListener("mousedown", e => {
      e.preventDefault()
      markMenuEvent(e)
      setClass(wrap, prefix + "-submenu-wrap-active")
      if (!listeningOnClose)
        window.addEventListener("mousedown", listeningOnClose = () => {
          if (!isMenuEvent(wrap)) {
            wrap.classList.remove(prefix + "-submenu-wrap-active")
            window.removeEventListener("mousedown", listeningOnClose)
            listeningOnClose = null
          }
        })
    })

    function update(state) {
      let inner = items.update(state)
      wrap.style.display = inner ? "" : "none"
      return inner
    }
    return {dom: wrap, update}
  }
}

function translate(view, text) {
  return view._props.translate ? view._props.translate(text) : text
}

// Work around classList.toggle being broken in IE11
function setClass(dom, cls, on) {
  if (on) dom.classList.add(cls)
  else dom.classList.remove(cls)
}
