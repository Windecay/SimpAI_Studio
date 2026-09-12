(function () {
    'use strict';

    const modules = {
        tooltip: window.SimpAICanvasWorkbenchTooltip || {},
        hoverPreview: window.SimpAICanvasWorkbenchHoverPreviewController || {},
        previewSelect: window.SimpAICanvasWorkbenchPreviewSelect || {},
        danbooruAutocomplete: window.SimpAICanvasWorkbenchDanbooruAutocomplete || {},
        scroll: window.SimpAICanvasWorkbenchScroll || {}
    };

    function createController(module, factoryName, context) {
        const create = module && module[factoryName];
        return typeof create === 'function' ? (create(context) || {}) : {};
    }

    function method(controller, name) {
        return controller && typeof controller[name] === 'function' ? controller[name] : undefined;
    }

    function createCanvasWorkbenchInputPreviewContext(source) {
        const scope = source || {};
        const controllers = {};

        controllers.tooltip = createController(modules.tooltip, 'createCanvasTooltipController', {
            document: scope.getDocument?.(),
            window: scope.getWindow?.(),
            getRoot: scope.getRoot,
            isCanvasPointerGestureActive: scope.isCanvasPointerGestureActive
        });
        const tooltipMethod = name => method(controllers.tooltip, name);

        controllers.hoverPreview = createController(modules.hoverPreview, 'createCanvasHoverPreviewController', {
            document: scope.getDocument?.(),
            window: scope.getWindow?.(),
            getRoot: scope.getRoot,
            getNodesLayer: scope.getNodesLayer,
            getNode: scope.getNode,
            getSystemParams: scope.getSystemParams,
            isCanvasPointerGestureActive: scope.isCanvasPointerGestureActive,
            escapeHtml: scope.escapeHtml,
            t: scope.t,
            workbenchStaticFilePath: scope.workbenchStaticFilePath,
            fetch: scope.fetch,
            Image: scope.Image,
            hideCanvasTooltip: (...args) => tooltipMethod('hideCanvasTooltip')?.(...args)
        });
        const hoverPreviewMethod = name => method(controllers.hoverPreview, name);

        controllers.previewSelect = createController(modules.previewSelect, 'createCanvasPreviewSelectController', {
            document: scope.getDocument?.(),
            window: scope.getWindow?.(),
            getRoot: scope.getRoot,
            escapeHtml: scope.escapeHtml,
            breakablePreviewText: (...args) => hoverPreviewMethod('breakablePreviewText')?.(...args)
                ?? (typeof scope.escapeHtml === 'function' ? scope.escapeHtml(...args) : String(args[0] ?? '')),
            hideHoverPreview: (...args) => hoverPreviewMethod('hideHoverPreview')?.(...args)
        });
        const previewSelectMethod = name => method(controllers.previewSelect, name);

        controllers.danbooruAutocomplete = createController(
            modules.danbooruAutocomplete,
            'createCanvasDanbooruAutocompleteController',
            {
                danbooruAutocomplete: scope.danbooruAutocomplete,
                document: scope.getDocument?.(),
                window: scope.getWindow?.(),
                getRoot: scope.getRoot,
                escapeHtml: scope.escapeHtml,
                t: scope.t,
                maybeShowRuntimeNotice: scope.maybeShowRuntimeNotice,
                dispatchTextControlInput: scope.dispatchTextControlInput
            }
        );
        const danbooruMethod = name => method(controllers.danbooruAutocomplete, name);

        controllers.scroll = createController(modules.scroll, 'createCanvasScrollController', {
            isPreviewSelectMenuOpen: (...args) => previewSelectMethod('isPreviewSelectMenuOpen')?.(...args),
            previewSelectMenuContains: (...args) => previewSelectMethod('previewSelectMenuContains')?.(...args),
            closePreviewSelectMenu: (...args) => previewSelectMethod('closePreviewSelectMenu')?.(...args),
            updateVlmChatJumpButton: scope.updateVlmChatJumpButton,
            mediaBrowserShouldAutoLoadMore: scope.mediaBrowserShouldAutoLoadMore,
            getNode: scope.getNode,
            mediaBrowserRuntimeFor: scope.mediaBrowserRuntimeFor,
            loadMoreMediaBrowserNode: scope.loadMoreMediaBrowserNode,
            hasDanbooruAutocompleteField: (...args) => danbooruMethod('hasActiveField')?.(...args),
            positionDanbooruAutocompleteDropdown: (...args) => danbooruMethod('positionDanbooruAutocompleteDropdown')?.(...args),
            warn: scope.warn
        });
        const scrollMethod = name => method(controllers.scroll, name);

        return {
            CANVAS_TOOLTIP_CONTROLLER: controllers.tooltip,
            hideCanvasTooltip: tooltipMethod('hideCanvasTooltip'),
            onTooltipPointerOver: tooltipMethod('onTooltipPointerOver'),
            onTooltipPointerMove: tooltipMethod('onTooltipPointerMove'),
            onTooltipPointerOut: tooltipMethod('onTooltipPointerOut'),
            onTooltipFocusIn: tooltipMethod('onTooltipFocusIn'),
            CANVAS_HOVER_PREVIEW_CONTROLLER: controllers.hoverPreview,
            breakablePreviewText: hoverPreviewMethod('breakablePreviewText'),
            showHoverPreviewFor: hoverPreviewMethod('showHoverPreviewFor'),
            hideHoverPreview: hoverPreviewMethod('hideHoverPreview'),
            onHoverPreviewPointerOver: hoverPreviewMethod('onHoverPreviewPointerOver'),
            onHoverPreviewPointerMove: hoverPreviewMethod('onHoverPreviewPointerMove'),
            onHoverPreviewPointerOut: hoverPreviewMethod('onHoverPreviewPointerOut'),
            onHoverPreviewFocusIn: hoverPreviewMethod('onHoverPreviewFocusIn'),
            CANVAS_PREVIEW_SELECT_CONTROLLER: controllers.previewSelect,
            closePreviewSelectMenu: previewSelectMethod('closePreviewSelectMenu'),
            isPreviewSelectMenuOpen: previewSelectMethod('isPreviewSelectMenuOpen'),
            previewSelectMenuContains: previewSelectMethod('previewSelectMenuContains'),
            onPreviewSelectPointerDown: previewSelectMethod('onPreviewSelectPointerDown'),
            onPreviewSelectKeyDown: previewSelectMethod('onPreviewSelectKeyDown'),
            CANVAS_DANBOORU_AUTOCOMPLETE_CONTROLLER: controllers.danbooruAutocomplete,
            shouldEnableDanbooruAutocomplete: danbooruMethod('shouldEnableDanbooruAutocomplete'),
            danbooruAutocompleteAttrs: danbooruMethod('danbooruAutocompleteAttrs'),
            hideDanbooruAutocomplete: danbooruMethod('hideDanbooruAutocomplete'),
            positionDanbooruAutocompleteDropdown: danbooruMethod('positionDanbooruAutocompleteDropdown'),
            warmDanbooruAutocompleteIndex: danbooruMethod('warmDanbooruAutocompleteIndex'),
            handleDanbooruAutocompleteInput: danbooruMethod('handleDanbooruAutocompleteInput'),
            onDanbooruAutocompleteKeyDown: danbooruMethod('onDanbooruAutocompleteKeyDown'),
            onDanbooruAutocompletePointerDown: danbooruMethod('onDanbooruAutocompletePointerDown'),
            onDanbooruAutocompleteFocusIn: danbooruMethod('onDanbooruAutocompleteFocusIn'),
            onDanbooruAutocompleteFocusOut: danbooruMethod('onDanbooruAutocompleteFocusOut'),
            hasDanbooruAutocompleteField: danbooruMethod('hasActiveField'),
            CANVAS_SCROLL_CONTROLLER: controllers.scroll,
            onCanvasWorkbenchScroll: scrollMethod('onScroll')
        };
    }

    window.SimpAICanvasWorkbenchInputPreviewContext = Object.assign(
        {},
        window.SimpAICanvasWorkbenchInputPreviewContext || {},
        { createCanvasWorkbenchInputPreviewContext }
    );
})();
