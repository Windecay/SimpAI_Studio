from ui.update_helpers import gr_update

IDENTITY_HIDDEN = "identity-control-hidden"


def identity_control_visibility(component, visible, **changes):
    # Keep the form mounted. Updating Gradio layout visibility also updates
    # its descendants and can overwrite their individual visibility changes.
    classes = changes.pop("elem_classes", getattr(component, "elem_classes", None)) or []
    if isinstance(classes, str):
        classes = [classes]
    classes = [name for name in classes if name != IDENTITY_HIDDEN]
    if visible is not True:
        classes.append(IDENTITY_HIDDEN)
    return gr_update(elem_classes=classes, **changes)


def identity_control_updates(components, result):
    updates = list(result)
    for index, (component, update) in enumerate(zip(components, updates)):
        if isinstance(update, dict) and "visible" in update:
            changes = dict(update)
            visible = changes.pop("visible")
            changes.pop("__type__", None)
            updates[index] = identity_control_visibility(component, visible, **changes)
    return updates
