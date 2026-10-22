// @ts-ignore
import { $el } from "../comfy_shim.js?v=patch26";
import { createModuleLogger } from "./LoggerUtils.js?v=patch26";
import { withErrorHandling, createValidationError, createNetworkError } from "../ErrorHandler.js?v=patch26";
const log = createModuleLogger('ResourceManager');
export const addStylesheet = withErrorHandling(function (url) {
    if (!url) {
        throw createValidationError("URL is required", { url });
    }
    log.debug('Adding stylesheet:', { url });
    if (url.endsWith(".js")) {
        url = url.substr(0, url.length - 2) + "css";
    }
    $el("link", {
        parent: document.head,
        rel: "stylesheet",
        type: "text/css",
        href: url.startsWith("http") ? url : getUrl(url),
    });
    log.debug('Stylesheet added successfully:', { finalUrl: url });
}, 'addStylesheet');
export function getUrl(path, baseUrl) {
    if (!path) {
        throw createValidationError("Path is required", { path });
    }
    
    return new URL(path, baseUrl || new URL('../', import.meta.url)).href;
}
export const loadTemplate = withErrorHandling(async function (path, baseUrl) {
    if (!path) {
        throw createValidationError("Path is required", { path });
    }
    const url = getUrl(path, baseUrl);
    log.debug('Loading template:', { path, url });
    const response = await fetch(url);
    if (!response.ok) {
        throw createNetworkError(`Failed to load template: ${url}`, {
            url,
            status: response.status,
            statusText: response.statusText
        });
    }
    const content = await response.text();
    log.debug('Template loaded successfully:', { path, contentLength: content.length });
    return content;
}, 'loadTemplate');
