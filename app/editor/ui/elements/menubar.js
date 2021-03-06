import crel from "crel"

const prefix = 'ProseMirror-menubar';
const itemPrefix = 'ProseMirror-menu';

export class MenuBarView {
  constructor(editorView, options) {
    this.editorView = editorView
    this.options = options

    this.wrapper = crel("div", {class: prefix + "-wrapper"})
    this.menu = this.wrapper.appendChild(crel("div", {class: prefix}))
    this.menu.className = prefix
    this.spacer = null

    editorView.dom.parentNode.replaceChild(this.wrapper, editorView.dom)
    this.wrapper.appendChild(editorView.dom)

    this.maxHeight = 0
    this.widthForMaxHeight = 0
    this.floating = false

    let {dom, update} = renderGrouped(this.editorView, this.options.content)
    this.contentUpdate = update
    this.menu.appendChild(dom)
    this.update()

    if (options.floating && !isIOS()) {
      this.updateFloat()
      let potentialScrollers = getAllWrapping(this.wrapper)
      this.scrollFunc = (e) => {
        let root = this.editorView.root
        if (!(root.body || root).contains(this.wrapper)) {
            potentialScrollers.forEach(el => el.removeEventListener("scroll", this.scrollFunc))
        } else {
            this.updateFloat(e.target.getBoundingClientRect && e.target)
        }
      }
      potentialScrollers.forEach(el => el.addEventListener('scroll', this.scrollFunc))
    }
  }

  update() {
    this.contentUpdate(this.editorView.state)

    if (this.floating) {
      this.updateScrollCursor()
    } else {
      if (this.menu.offsetWidth != this.widthForMaxHeight) {
        this.widthForMaxHeight = this.menu.offsetWidth
        this.maxHeight = 0
      }
      if (this.menu.offsetHeight > this.maxHeight) {
        this.maxHeight = this.menu.offsetHeight
        this.menu.style.minHeight = this.maxHeight + "px"
      }
    }
  }

  updateScrollCursor() {
    let selection = this.editorView.root.getSelection()
    if (!selection.focusNode) return
    let rects = selection.getRangeAt(0).getClientRects()
    let selRect = rects[selectionIsInverted(selection) ? 0 : rects.length - 1]
    if (!selRect) return
    let menuRect = this.menu.getBoundingClientRect()
    if (selRect.top < menuRect.bottom && selRect.bottom > menuRect.top) {
      let scrollable = findWrappingScrollable(this.wrapper)
      if (scrollable) scrollable.scrollTop -= (menuRect.bottom - selRect.top)
    }
  }

  updateFloat(scrollAncestor) {
    let parent = this.wrapper, editorRect = parent.getBoundingClientRect(),
        top = scrollAncestor ? Math.max(0, scrollAncestor.getBoundingClientRect().top) : 0

    if (this.floating) {
      if (editorRect.top >= top || editorRect.bottom < this.menu.offsetHeight + 10) {
        this.floating = false
        this.menu.style.position = this.menu.style.left = this.menu.style.top = this.menu.style.width = ""
        this.menu.style.display = ""
        this.spacer.parentNode.removeChild(this.spacer)
        this.spacer = null
      } else {
        let border = (parent.offsetWidth - parent.clientWidth) / 2
        this.menu.style.left = (editorRect.left + border) + "px"
        this.menu.style.display = (editorRect.top > window.innerHeight ? "none" : "")
        if (scrollAncestor) this.menu.style.top = top + "px"
      }
    } else {
      if (editorRect.top < top && editorRect.bottom >= this.menu.offsetHeight + 10) {
        this.floating = true
        let menuRect = this.menu.getBoundingClientRect()
        this.menu.style.left = menuRect.left + "px"
        this.menu.style.width = menuRect.width + "px"
        if (scrollAncestor) this.menu.style.top = top + "px"
        this.menu.style.position = "fixed"
        this.spacer = crel("div", {class: prefix + "-spacer", style: `height: ${menuRect.height}px`})
        parent.insertBefore(this.spacer, this.menu)
      }
    }
  }

  destroy() {
    if (this.wrapper.parentNode)
      this.wrapper.parentNode.replaceChild(this.editorView.dom, this.wrapper)
  }
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

// :: (EditorView, [union<MenuElement, [MenuElement]>]) → {dom: ?dom.DocumentFragment, update: (EditorState) → bool}
// Render the given, possibly nested, array of menu elements into a
// document fragment, placing separators between them (and ensuring no
// superfluous separators appear when some of the groups turn out to
// be empty).
export function renderGrouped(view, content) {
  let result = document.createDocumentFragment()
  let updates = [], separators = []
  for (let i = 0; i < content.length; i++) {
    let items = content[i], localUpdates = [], localNodes = []
    for (let j = 0; j < items.length; j++) {
      let {dom, update} = items[j].render(view)
      let span = crel("span", {class: itemPrefix + "item"}, dom)
      result.appendChild(span)
      localNodes.push(span)
      localUpdates.push(update)
    }
    if (localUpdates.length) {
      updates.push(combineUpdates(localUpdates, localNodes))
      if (i < content.length - 1)
        separators.push(result.appendChild(separator()))
    }
  }

  function update(state) {
    let something = false, needSep = false
    for (let i = 0; i < updates.length; i++) {
      let hasContent = updates[i](state)
      if (i) separators[i - 1].style.display = needSep && hasContent ? "" : "none"
      needSep = hasContent
      if (hasContent) something = true
    }
    return something
  }
  return {dom: result, update}
}

function separator() {
  return crel("span", {class: itemPrefix + "separator"})
}

function isIOS() {
  if (typeof navigator == "undefined") return false
  let agent = navigator.userAgent
  return !/Edge\/\d/.test(agent) && /AppleWebKit/.test(agent) && /Mobile\/\w+/.test(agent)
}

// Not precise, but close enough
function selectionIsInverted(selection) {
  if (selection.anchorNode == selection.focusNode) return selection.anchorOffset > selection.focusOffset
  return selection.anchorNode.compareDocumentPosition(selection.focusNode) == Node.DOCUMENT_POSITION_FOLLOWING
}

function findWrappingScrollable(node) {
  for (let cur = node.parentNode; cur; cur = cur.parentNode)
    if (cur.scrollHeight > cur.clientHeight) return cur
}

function getAllWrapping(node) {
    let res = [window]
    for (let cur = node.parentNode; cur; cur = cur.parentNode)
        res.push(cur)
    return res
}
