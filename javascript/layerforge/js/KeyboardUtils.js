export function isEditingText(event) {
    if (event.isComposing || event.keyCode === 229) return true;
    const target = event.target;
    return !!(target?.isContentEditable || target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]'));
}

export function nextBrushSize(value, direction, maximum = 200) {
    const size = Number(value) || 1;
    const reference = direction < 0 ? size - 1 : size;
    const step = reference < 10 ? 1 : reference < 100 ? 5 : 10;
    return Math.max(1, Math.min(maximum, size + direction * step));
}
