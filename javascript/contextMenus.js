// based on https://github.com/AUTOMATIC1111/stable-diffusion-webui/blob/v1.6.0/javascript/contextMenus.js

function isContextMenuElementVisible(element) {
    if (!element) {
        return false;
    }
    let current = element;
    while (current && current.nodeType === 1) {
        if (current.hidden || current.getAttribute("aria-hidden") === "true") {
            return false;
        }
        const style = window.getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") {
            return false;
        }
        current = current.parentElement;
    }
    const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : null;
    return !!(element.offsetParent || (rect && (rect.width > 0 || rect.height > 0)));
}

var contextMenuInit = function() {
    let eventListenerApplied = false;
    let menuSpecs = new Map();

    const uid = function() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    };

    function showContextMenu(event, element, menuEntries) {
        let posx = event.clientX + document.body.scrollLeft + document.documentElement.scrollLeft;
        let posy = event.clientY + document.body.scrollTop + document.documentElement.scrollTop;

        let oldMenu = gradioApp().querySelector('#context-menu');
        if (oldMenu) {
            oldMenu.remove();
        }

        let baseStyle = window.getComputedStyle(gradioApp().querySelector('button.selected'));

        const contextMenu = document.createElement('nav');
        contextMenu.id = "context-menu";
        contextMenu.style.background = baseStyle.getPropertyValue('--block-background-fill');
        contextMenu.style.color = baseStyle.color;
        contextMenu.style.fontFamily = baseStyle.fontFamily;
        contextMenu.style.top = posy + 'px';
        contextMenu.style.left = posx + 'px';

        const contextMenuList = document.createElement('ul');
        contextMenuList.className = 'context-menu-items';
        contextMenu.append(contextMenuList);

        menuEntries.forEach(function(entry) {
            let contextMenuEntry = document.createElement('a');
            contextMenuEntry.innerHTML = entry['name'];
            contextMenuEntry.addEventListener("click", function() {
                entry['func']();
            });
            contextMenuList.append(contextMenuEntry);

        });

        gradioApp().appendChild(contextMenu);

        let menuWidth = contextMenu.offsetWidth + 4;
        let menuHeight = contextMenu.offsetHeight + 4;

        let windowWidth = window.innerWidth;
        let windowHeight = window.innerHeight;

        if ((windowWidth - posx) < menuWidth) {
            contextMenu.style.left = windowWidth - menuWidth + "px";
        }

        if ((windowHeight - posy) < menuHeight) {
            contextMenu.style.top = windowHeight - menuHeight + "px";
        }

    }

    function appendContextMenuOption(targetElementSelector, entryName, entryFunction) {

        var currentItems = menuSpecs.get(targetElementSelector);

        if (!currentItems) {
            currentItems = [];
            menuSpecs.set(targetElementSelector, currentItems);
        }
        let newItem = {
            id: targetElementSelector + '_' + uid(),
            name: entryName,
            func: entryFunction,
            isNew: true
        };

        currentItems.push(newItem);
        return newItem['id'];
    }

    function removeContextMenuOption(uid) {
        menuSpecs.forEach(function(v) {
            let index = -1;
            v.forEach(function(e, ei) {
                if (e['id'] == uid) {
                    index = ei;
                }
            });
            if (index >= 0) {
                v.splice(index, 1);
            }
        });
    }

    function addContextMenuEventListener() {
        if (eventListenerApplied) {
            return;
        }
        gradioApp().addEventListener("click", function(e) {
            if (!e.isTrusted) {
                return;
            }

            let oldMenu = gradioApp().querySelector('#context-menu');
            if (oldMenu) {
                oldMenu.remove();
            }
        });
        gradioApp().addEventListener("contextmenu", function(e) {
            let oldMenu = gradioApp().querySelector('#context-menu');
            if (oldMenu) {
                oldMenu.remove();
            }
            menuSpecs.forEach(function(v, k) {
                if (e.composedPath()[0].matches(k)) {
                    showContextMenu(e, e.composedPath()[0], v);
                    e.preventDefault();
                }
            });
        });
        eventListenerApplied = true;

    }

    return [appendContextMenuOption, removeContextMenuOption, addContextMenuEventListener];
};

var initResponse = contextMenuInit();
var appendContextMenuOption = initResponse[0];
var removeContextMenuOption = initResponse[1];
var addContextMenuEventListener = initResponse[2];

let cancelGenerateForever = function() {
    clearInterval(window.generateOnRepeatInterval);
    window.generateOnRepeatLastTriggerAt = null;
};

(function() {
    //Start example Context Menu Items
    let generateOnRepeat = function(genbuttonid, interruptbuttonid) {
        const RELAXED_TRIGGER_AFTER_MS = 15000;
        const FORCE_TRIGGER_AFTER_MS = 45000;

        let getTriggerState = function() {
            let genbutton = gradioApp().querySelector(genbuttonid);
            let interruptbutton = gradioApp().querySelector(interruptbuttonid);
            let interruptVisible = isContextMenuElementVisible(interruptbutton);
            if (!genbutton) {
                return {
                    strictReady: false,
                    relaxedReady: false,
                    forceReady: false,
                    genbutton: genbutton,
                    interruptbutton: interruptbutton,
                    interruptVisible: interruptVisible
                };
            }
            if (genbutton.disabled || genbutton.getAttribute("aria-disabled") === "true") {
                return {
                    strictReady: false,
                    relaxedReady: !interruptVisible,
                    forceReady: true,
                    genbutton: genbutton,
                    interruptbutton: interruptbutton,
                    interruptVisible: interruptVisible
                };
            }

            let sceneVideoPlaceholder = gradioApp().querySelector("#scene_video_placeholder");
            let sceneVideoBusy = isContextMenuElementVisible(sceneVideoPlaceholder);
            let sceneAudioPlaceholder = gradioApp().querySelector("#scene_audio_placeholder");
            let sceneAudioBusy = isContextMenuElementVisible(sceneAudioPlaceholder);
            if (interruptVisible) {
                return {
                    strictReady: false,
                    relaxedReady: false,
                    forceReady: false,
                    genbutton: genbutton,
                    interruptbutton: interruptbutton,
                    interruptVisible: interruptVisible
                };
            }

            return {
                strictReady: !sceneVideoBusy && !sceneAudioBusy,
                relaxedReady: !sceneVideoBusy && !sceneAudioBusy,
                forceReady: true,
                genbutton: genbutton,
                interruptbutton: interruptbutton,
                interruptVisible: interruptVisible
            };
        };

        let tryTrigger = function() {
            const now = Date.now();
            if (window.generateOnRepeatLastTriggerAt == null) {
                window.generateOnRepeatLastTriggerAt = now;
            }

            const state = getTriggerState();
            if (state.strictReady && state.genbutton) {
                state.genbutton.click();
                window.generateOnRepeatLastTriggerAt = now;
                return;
            }

            const blockedMs = now - window.generateOnRepeatLastTriggerAt;
            if (state.relaxedReady && state.genbutton && blockedMs >= RELAXED_TRIGGER_AFTER_MS) {
                state.genbutton.click();
                window.generateOnRepeatLastTriggerAt = now;
                return;
            }

            if (state.forceReady && state.genbutton && blockedMs >= FORCE_TRIGGER_AFTER_MS) {
                state.genbutton.disabled = false;
                state.genbutton.setAttribute("aria-disabled", "false");
                state.genbutton.click();
                window.generateOnRepeatLastTriggerAt = now;
            }
        };

        tryTrigger();
        clearInterval(window.generateOnRepeatInterval);
        window.generateOnRepeatInterval = setInterval(function() {
            tryTrigger();
        },
        500);
    };

    let generateOnRepeatForButtons = function() {
        generateOnRepeat('#generate_button', '#stop_button');
    };
    appendContextMenuOption('#generate_button', 'Generate forever', generateOnRepeatForButtons);

})();
//End example Context Menu Items

document.onreadystatechange = function () {
    if (document.readyState == "complete") {
        addContextMenuEventListener();
    }
};
