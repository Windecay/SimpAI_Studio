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
        const tooltipSource = scope.tooltipSource || {};
        const hoverPreviewSource = scope.hoverPreviewSource || {};
        const previewSelectSource = scope.previewSelectSource || {};
        const danbooruAutocompleteSource = scope.danbooruAutocompleteSource || {};
        const scrollSource = scope.scrollSource || {};
        const scrollPreviewSource = scrollSource.previewSource || {};
        const scrollDanbooruSource = scrollSource.danbooruSource || {};
        const controllers = {};

        controllers.tooltip = createController(
            modules.tooltip,
            'createCanvasTooltipController',
            tooltipSource
        );
        const tooltipMethod = name => method(controllers.tooltip, name);

        controllers.hoverPreview = createController(
            modules.hoverPreview,
            'createCanvasHoverPreviewController',
            Object.assign({}, hoverPreviewSource, {
                tooltipSource: Object.assign({}, hoverPreviewSource.tooltipSource || {}, {
                    hideCanvasTooltip: (...args) => tooltipMethod('hideCanvasTooltip')?.(...args)
                })
            })
        );
        const hoverPreviewMethod = name => method(controllers.hoverPreview, name);

        controllers.previewSelect = createController(
            modules.previewSelect,
            'createCanvasPreviewSelectController',
            Object.assign({}, previewSelectSource, {
                utilitySource: Object.assign({}, previewSelectSource.utilitySource || {}, {
                    breakablePreviewText: (...args) => hoverPreviewMethod('breakablePreviewText')?.(...args)
                        ?? (typeof previewSelectSource.utilitySource?.escapeHtml === 'function'
                            ? previewSelectSource.utilitySource.escapeHtml(...args)
                            : String(args[0] ?? ''))
                }),
                hoverPreviewSource: Object.assign({}, previewSelectSource.hoverPreviewSource || {}, {
                    hideHoverPreview: (...args) => hoverPreviewMethod('hideHoverPreview')?.(...args)
                })
            })
        );
        const previewSelectMethod = name => method(controllers.previewSelect, name);

        controllers.danbooruAutocomplete = createController(
            modules.danbooruAutocomplete,
            'createCanvasDanbooruAutocompleteController',
            danbooruAutocompleteSource
        );
        const danbooruMethod = name => method(controllers.danbooruAutocomplete, name);

        controllers.scroll = createController(
            modules.scroll,
            'createCanvasScrollController',
            Object.assign({}, scrollSource, {
                previewSource: Object.assign({}, scrollPreviewSource, {
                    isPreviewSelectMenuOpen: (...args) => previewSelectMethod('isPreviewSelectMenuOpen')?.(...args),
                    previewSelectMenuContains: (...args) => previewSelectMethod('previewSelectMenuContains')?.(...args),
                    closePreviewSelectMenu: (...args) => previewSelectMethod('closePreviewSelectMenu')?.(...args)
                }),
                danbooruSource: Object.assign({}, scrollDanbooruSource, {
                    hasDanbooruAutocompleteField: (...args) => danbooruMethod('hasActiveField')?.(...args),
                    positionDanbooruAutocompleteDropdown: (...args) => danbooruMethod('positionDanbooruAutocompleteDropdown')?.(...args)
                })
            })
        );
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
