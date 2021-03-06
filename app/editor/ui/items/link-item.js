import { MenuItem, TextField, openPrompt } from '../elements';
import { markActive, toggleMark } from '../../commands';

export function linkItem(markType, options) {
  let passedOptions = {
    active(state) { return markActive(state, markType) },
    enable(state) { return !state.selection.empty },
    run(state, dispatch, view) {
      if (markActive(state, markType)) {
        toggleMark(markType)(state, dispatch)
        return true
      }
      openPrompt({
        title: "Create a link",
        fields: {
          href: new TextField({
            label: "Link target",
            required: true
          }),
          title: new TextField({label: "Title"})
        },
        callback(attrs) {
          toggleMark(markType, attrs)(view.state, view.dispatch)
          view.focus()
        }
      })
    }
  };

  for (let prop in options) passedOptions[prop] = options[prop];
  return new MenuItem(passedOptions);
}
