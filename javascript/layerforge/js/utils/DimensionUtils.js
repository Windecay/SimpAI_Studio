export function dimensionStep(value) {
    const step = Number(value);
    return [8, 16, 32, 64].includes(step) ? step : 0;
}

export function normalizeDimension(value, step, maximum = Infinity) {
    step = dimensionStep(step);
    if (!step) return value;
    // An image smaller than one step cannot contain a full aligned crop.
    if (maximum < step) return maximum;
    return Math.min(Math.floor(maximum / step) * step,
        Math.max(step, Math.round(value / step) * step));
}

export function normalizeCropBounds(bounds, imageWidth, imageHeight, step, anchorRight = false, anchorBottom = false) {
    if (!dimensionStep(step)) return { ...bounds };
    const width = normalizeDimension(bounds.width, step, imageWidth);
    const height = normalizeDimension(bounds.height, step, imageHeight);
    return {
        x: Math.max(0, Math.min(imageWidth - width,
            anchorRight ? bounds.x + bounds.width - width : bounds.x)),
        y: Math.max(0, Math.min(imageHeight - height,
            anchorBottom ? bounds.y + bounds.height - height : bounds.y)),
        width,
        height
    };
}
