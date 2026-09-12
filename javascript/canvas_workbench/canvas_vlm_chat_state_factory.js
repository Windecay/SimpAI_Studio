(function () {
    'use strict';

    function isRecord(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function createCanvasVlmChatStateFactoryController(context) {
        const scope = context || {};
        const cloneRunValue = typeof scope.cloneRunValue === 'function'
            ? scope.cloneRunValue
            : ((value, fallback) => {
                try {
                    return JSON.parse(JSON.stringify(value ?? fallback));
                } catch (err) {
                    return fallback;
                }
            });

        function cloneRecord(value) {
            if (!isRecord(value)) return {};
            const cloned = cloneRunValue(value, {});
            return isRecord(cloned) ? cloned : {};
        }

        function hasOwn(target, key) {
            return !!target && Object.prototype.hasOwnProperty.call(target, key);
        }

        function cloneArray(value) {
            const cloned = cloneRunValue(Array.isArray(value) ? value : [], []);
            return Array.isArray(cloned) ? cloned : [];
        }

        function buildVlmChatStatePatch(node, options) {
            if (!node || node.type !== 'vlm') return {};
            const config = options || {};
            const defaults = {
                messages: [],
                pending_images: [],
                conversation_id: '',
                agent_tool_state: {},
                updated_at: ''
            };
            const initialState = cloneRecord(config.initialState);
            const statePatch = cloneRecord(config.statePatch);
            const current = cloneRecord(node.chat);
            const state = Object.assign({}, defaults, initialState, current, statePatch);
            return {
                messages: cloneArray(hasOwn(config, 'messages') ? config.messages : state.messages),
                pending_images: cloneArray(hasOwn(config, 'pendingImages') ? config.pendingImages : state.pending_images),
                conversation_id: String(hasOwn(config, 'conversationId') ? config.conversationId : (state.conversation_id || '')),
                agent_tool_state: cloneRecord(hasOwn(config, 'agentToolState') ? config.agentToolState : state.agent_tool_state),
                updated_at: String(hasOwn(config, 'updatedAt') ? config.updatedAt : (state.updated_at || ''))
            };
        }

        function buildVlmChatStoragePatch(node, options) {
            if (!node || node.type !== 'vlm' || !isRecord(node.chat)) return {};
            const config = options || {};
            const compactAsset = typeof config.compactAsset === 'function' ? config.compactAsset : null;
            const chat = cloneRecord(node.chat);
            if (compactAsset && Array.isArray(chat.pending_images)) {
                chat.pending_images.forEach(compactAsset);
            }
            if (compactAsset && Array.isArray(chat.messages)) {
                chat.messages.forEach((message) => {
                    if (Array.isArray(message?.images)) message.images.forEach(compactAsset);
                });
            }
            return { chat: cloneRecord(chat) };
        }

        function buildVlmChatToolStatePatch(node, patch) {
            if (!node || node.type !== 'vlm') return {};
            return {
                agent_tool_state: Object.assign(
                    {},
                    cloneRecord(node.chat?.agent_tool_state),
                    cloneRecord(patch)
                )
            };
        }

        return {
            buildVlmChatStatePatch,
            buildVlmChatStoragePatch,
            buildVlmChatToolStatePatch
        };
    }

    window.SimpAICanvasWorkbenchVlmChatStateFactory = Object.assign({}, window.SimpAICanvasWorkbenchVlmChatStateFactory || {}, {
        createCanvasVlmChatStateFactoryController
    });
})();
