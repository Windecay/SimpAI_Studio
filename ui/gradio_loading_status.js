// Gradio sends its entire status table after each dependency update. Preserve
// every change, but avoid repeating identical scalar status assignments.
const simpleai_loading_status_cache = new WeakMap();

function simpleai_reset_loading_status(owner) {
    simpleai_loading_status_cache.delete(owner);
}

function simpleai_skip_unchanged_loading_status(owner, id, data, checkVisibility) {
    if (!data || !Object.prototype.hasOwnProperty.call(data, "loading_status")) return false;
    let cache = simpleai_loading_status_cache.get(owner);
    const status = data.loading_status;
    if (checkVisibility !== false || Object.keys(data).length !== 1
            || !status || typeof status !== "object" || Array.isArray(status)) {
        cache?.delete(id);
        return false;
    }
    if (!cache) {
        cache = new Map();
        simpleai_loading_status_cache.set(owner, cache);
    }
    const previous = cache.get(id);
    const keys = Object.keys(status);
    const unchanged = previous && keys.length === Object.keys(previous).length
        && keys.every((key) => Object.prototype.hasOwnProperty.call(previous, key)
            && Object.is(previous[key], status[key])
            // Progress payloads can be mutated in place; always forward them.
            && (status[key] === null || typeof status[key] !== "object"));
    if (unchanged) return true;
    cache.set(id, { ...status });
    return false;
}
