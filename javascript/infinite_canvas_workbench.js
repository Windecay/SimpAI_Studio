(function () {
    'use strict';

    const WORKBENCH_UTILS = window.SimpAICanvasWorkbenchUtils || {};
    const WORKBENCH_PROJECT = window.SimpAICanvasWorkbenchProject || {};
    const WORKBENCH_VIEWPORT = window.SimpAICanvasWorkbenchViewport || {};
    const WORKBENCH_REGISTRY = window.SimpAICanvasWorkbenchRegistry || {};
    const WORKBENCH_API = window.SimpAICanvasWorkbenchApi || {};
    const WORKBENCH_SCHEDULER = window.SimpAICanvasWorkbenchScheduler || {};
    const WORKBENCH_MEDIA_HELPERS = window.SimpAICanvasWorkbenchMediaHelpers || {};
    const WORKBENCH_ASSET_NODES = window.SimpAICanvasWorkbenchAssetNodes || {};
    const WORKBENCH_PENDING_CONNECTION = window.SimpAICanvasWorkbenchPendingConnection || {};
    const WORKBENCH_DANBOORU_GALLERY = window.SimpAICanvasWorkbenchDanbooruGallery || {};
    const WORKBENCH_PRESET_RUN_LOCK = window.SimpAICanvasWorkbenchPresetRunLock || {};
    const WORKBENCH_MEDIA_BROWSER_PAINT = window.SimpAICanvasWorkbenchMediaBrowserPaint || {};
    const WORKBENCH_ASSET_NODE_API = typeof WORKBENCH_ASSET_NODES.createAssetNodeApi === 'function'
        ? WORKBENCH_ASSET_NODES.createAssetNodeApi({
            utilitySource: {
                clamp: WORKBENCH_UTILS.clamp,
                formatBytes: WORKBENCH_UTILS.formatBytes
            },
            assetRootSource: {
                getAssetRoot: () => window.SimpAICanvasWorkbenchAssetRoot || ''
            }
        })
        : WORKBENCH_ASSET_NODES;
    const WORKBENCH_ASSET_MANAGER = window.SimpAICanvasWorkbenchAssetManager || {};
    const WORKBENCH_NODE_BROWSER = window.SimpAICanvasWorkbenchNodeBrowser || {};
    const WORKBENCH_PROJECT_MANAGER = window.SimpAICanvasWorkbenchProjectManager || {};
    const WORKBENCH_GROUP_LIST = window.SimpAICanvasWorkbenchGroupList || {};
    const WORKBENCH_MASK_EDITOR = window.SimpAICanvasWorkbenchMaskEditor || {};
    const WORKBENCH_MEDIA_VIEWERS = window.SimpAICanvasWorkbenchMediaViewers || {};
    const WORKBENCH_CANVAS_MEDIA_VIEWER_CONTEXT = window.SimpAICanvasWorkbenchMediaViewerContext || {};
    const WORKBENCH_CANVAS_NODE_BROWSER_CONTEXT = window.SimpAICanvasWorkbenchNodeBrowserContext || {};
    const WORKBENCH_CANVAS_PROJECT_MANAGER_CONTEXT = window.SimpAICanvasWorkbenchProjectManagerContext || {};
    const WORKBENCH_CANVAS_GROUP_LIST_CONTEXT = window.SimpAICanvasWorkbenchGroupListContext || {};
    const WORKBENCH_CANVAS_ASSET_MANAGER_CONTEXT = window.SimpAICanvasWorkbenchAssetManagerContext || {};
    const WORKBENCH_CANVAS_MASK_EDITOR_CONTEXT = window.SimpAICanvasWorkbenchMaskEditorContext || {};
    const WORKBENCH_CANVAS_MASK_RUNTIME = window.SimpAICanvasWorkbenchMaskRuntime || {};
    const WORKBENCH_CANVAS_WD14_RUNTIME = window.SimpAICanvasWorkbenchWd14Runtime || {};
    const WORKBENCH_CANVAS_LIVEPORTRAIT_VIDEO_EDITOR = window.SimpAICanvasWorkbenchLivePortraitVideoExpressionEditor || {};
    const WORKBENCH_CANVAS_H3_STORYBOARD_PRESET_DATA = window.SimpAICanvasWorkbenchMiniMaxH3StoryboardPresetData || {};
    const WORKBENCH_CANVAS_H3_STORYBOARD_PRESET_EDITOR = window.SimpAICanvasWorkbenchMiniMaxH3StoryboardPresetEditor || {};
    const WORKBENCH_CANVAS_LTX23_GUIDE_EDITOR = window.SimpAICanvasWorkbenchLtx23GuideEditor || {};
    const WORKBENCH_CANVAS_TIMELINE_NODE_CONTEXT = window.SimpAICanvasWorkbenchTimelineNodeContext || {};
    const WORKBENCH_CANVAS_COMPARE_NODE_CONTEXT = window.SimpAICanvasWorkbenchCompareNodeContext || {};
    const WORKBENCH_CANVAS_COMPARE_CREATION = window.SimpAICanvasWorkbenchCompareCreation || {};
    const WORKBENCH_CANVAS_COMPARE_STATE = window.SimpAICanvasWorkbenchCompareState || {};
    const WORKBENCH_CANVAS_SPECIAL_NODE_CONTEXT = window.SimpAICanvasWorkbenchSpecialNodeContext || {};
    const WORKBENCH_CANVAS_SPECIAL_NODE_EDITOR = window.SimpAICanvasWorkbenchSpecialNodeEditor || {};
    const WORKBENCH_CANVAS_LAZY_ASSET_RUNTIME = window.SimpAICanvasWorkbenchLazyAssetRuntime || {};
    const WORKBENCH_RUN_HISTORY = window.SimpAICanvasWorkbenchRunHistoryPanel || {};
    const WORKBENCH_RUN_QUEUE = window.SimpAICanvasWorkbenchRunQueuePanel || {};
    const WORKBENCH_CANVAS_RUN_STATE = window.SimpAICanvasWorkbenchRunState || {};
    const WORKBENCH_RUN_VALUE_SERIALIZER = window.SimpAICanvasWorkbenchRunValueSerializer || {};
    const WORKBENCH_CANVAS_XYZ_MATRIX_EDITOR = window.SimpAICanvasWorkbenchXyzMatrixEditor || {};
    const WORKBENCH_CANVAS_XYZ_MATRIX_MODAL_RENDERER = window.SimpAICanvasWorkbenchXyzMatrixModalRenderer || {};
    const WORKBENCH_CANVAS_XYZ_MATRIX_NODE = window.SimpAICanvasWorkbenchXyzMatrixNode || {};
    const WORKBENCH_CANVAS_NODE_STATE = window.SimpAICanvasWorkbenchNodeState || {};
    const WORKBENCH_CANVAS_SCHEDULER_STATE = window.SimpAICanvasWorkbenchSchedulerState || {};
    const WORKBENCH_CANVAS_SCHEDULER_STEP = window.SimpAICanvasWorkbenchSchedulerStep || {};
    const WORKBENCH_CANVAS_SCHEDULER_RUN = window.SimpAICanvasWorkbenchSchedulerRun || {};
    const WORKBENCH_CANVAS_RUN_STATUS = window.SimpAICanvasWorkbenchRunStatus || {};
    const WORKBENCH_CANVAS_RUN_POLLING = window.SimpAICanvasWorkbenchRunPolling || {};
    const WORKBENCH_CANVAS_GALLERY_REFRESH = window.SimpAICanvasWorkbenchGalleryRefresh || {};
    const WORKBENCH_CANVAS_GALLERY_FROST = window.SimpAICanvasWorkbenchGalleryFrost || {};
    const WORKBENCH_CANVAS_TEXTAREA_EDITOR = window.SimpAICanvasWorkbenchTextareaEditor || {};
    const WORKBENCH_CANVAS_INTERACTIVE_TARGET = window.SimpAICanvasWorkbenchInteractiveTarget || {};
    const WORKBENCH_CANVAS_MEDIA_SEEK = window.SimpAICanvasWorkbenchMediaSeek || {};
    const WORKBENCH_CANVAS_MEDIA_EDIT = window.SimpAICanvasWorkbenchMediaEdit || {};
    const WORKBENCH_CANVAS_MEDIA_PLAYBACK = window.SimpAICanvasWorkbenchMediaPlayback || {};
    const WORKBENCH_CANVAS_PRESET_SPECIAL_VIEWER = window.SimpAICanvasWorkbenchPresetSpecialViewer || {};
    const WORKBENCH_CANVAS_PRESET_MODEL_STATUS = window.SimpAICanvasWorkbenchPresetModelStatus || {};
    const WORKBENCH_CANVAS_MISSING_MODEL_DIALOG = window.SimpAICanvasWorkbenchMissingModelDialog || {};
    const WORKBENCH_CANVAS_TAG_CART = window.SimpAICanvasWorkbenchTagCart || {};
    const WORKBENCH_CANVAS_TOAST = window.SimpAICanvasWorkbenchToast || {};
    const WORKBENCH_CANVAS_WILDCARDS_V2 = window.SimpAICanvasWorkbenchWildcardsV2 || {};
    const WORKBENCH_CANVAS_WILDCARDS_RUNTIME = window.SimpAICanvasWorkbenchWildcardsRuntime || {};
    const WORKBENCH_CANVAS_MINIMAP = window.SimpAICanvasWorkbenchMinimap || {};
    const WORKBENCH_CANVAS_GROUP_INTERACTION = window.SimpAICanvasWorkbenchGroupInteraction || {};
    const WORKBENCH_CANVAS_GROUP_RENDERER = window.SimpAICanvasWorkbenchGroupRenderer || {};
    const WORKBENCH_CANVAS_SHELL_RENDERER = window.SimpAICanvasWorkbenchShellRenderer || {};
    const WORKBENCH_CANVAS_RUN_PANELS = window.SimpAICanvasWorkbenchRunPanels || {};
    const WORKBENCH_CANVAS_NODE_RESIZE = window.SimpAICanvasWorkbenchNodeResize || {};
    const WORKBENCH_CANVAS_NODE_DRAG = window.SimpAICanvasWorkbenchNodeDrag || {};
    const WORKBENCH_CANVAS_NODE_POINTER = window.SimpAICanvasWorkbenchNodePointer || {};
    const WORKBENCH_CANVAS_NODE_EVENT = window.SimpAICanvasWorkbenchNodeEvent || {};
    const WORKBENCH_CANVAS_EVENT = window.SimpAICanvasWorkbenchEvent || {};
    const WORKBENCH_CANVAS_PAN = window.SimpAICanvasWorkbenchPan || {};
    const WORKBENCH_CANVAS_MARQUEE = window.SimpAICanvasWorkbenchMarquee || {};
    const WORKBENCH_CANVAS_VIEWPORT_POINTER = window.SimpAICanvasWorkbenchViewportPointer || {};
    const WORKBENCH_CANVAS_CONNECTION = window.SimpAICanvasWorkbenchConnection || {};
    const WORKBENCH_CANVAS_VIEWPORT_RENDER = window.SimpAICanvasWorkbenchViewportRender || {};
    const WORKBENCH_CANVAS_VIEWPORT_RENDER_SCHEDULER = window.SimpAICanvasWorkbenchViewportRenderScheduler || {};
    const WORKBENCH_CANVAS_NODE_SPATIAL_INDEX = window.SimpAICanvasWorkbenchNodeSpatialIndex || {};
    const WORKBENCH_CANVAS_NODE_FACTORY = window.SimpAICanvasWorkbenchNodeFactory || {};
    const WORKBENCH_CANVAS_TIMELINE_CONTEXT = window.SimpAICanvasWorkbenchTimelineContext || {};
    const WORKBENCH_CANVAS_TIMELINE_PARAM = window.SimpAICanvasWorkbenchTimelineParam || {};
    const WORKBENCH_CANVAS_TIMELINE_COMMAND = window.SimpAICanvasWorkbenchTimelineCommand || {};
    const WORKBENCH_CANVAS_RESOLUTION_DRAG = window.SimpAICanvasWorkbenchResolutionDrag || {};
    const WORKBENCH_CANVAS_MEDIA_NODE_CONTEXT = window.SimpAICanvasWorkbenchMediaNodeContext || {};
    const WORKBENCH_IMAGE_NODE = window.SimpAICanvasWorkbenchImageNode || {};
    const WORKBENCH_VIDEO_NODE = window.SimpAICanvasWorkbenchVideoNode || {};
    const WORKBENCH_AUDIO_NODE = window.SimpAICanvasWorkbenchAudioNode || {};
    const WORKBENCH_COMPARE_NODE = window.SimpAICanvasWorkbenchCompareNode || {};
    const WORKBENCH_SAM3_VIDEO_MASK_NODE = window.SimpAICanvasWorkbenchSam3VideoMaskNode || {};
    const WORKBENCH_CAMERA_MOTION_NODE = window.SimpAICanvasWorkbenchCameraMotionNode || {};
    const WORKBENCH_POSE_STUDIO_NODE = window.SimpAICanvasWorkbenchPoseStudioNode || {};
    const WORKBENCH_GAUSSIAN_STUDIO_NODE = window.SimpAICanvasWorkbenchGaussianStudioNode || {};
    const WORKBENCH_LIVEPORTRAIT_EXPRESSION_NODE = window.SimpAICanvasWorkbenchLivePortraitExpressionNode || {};
    const WORKBENCH_QWEN_TTS_NODE = window.SimpAICanvasWorkbenchQwenTtsNode || {};
    const WORKBENCH_CANVAS_QWEN_TTS_RUNTIME = window.SimpAICanvasWorkbenchQwenTtsRuntime || {};
    const WORKBENCH_CANVAS_BATCH_ANY_RUNTIME = window.SimpAICanvasWorkbenchBatchAnyRuntime || {};
    const WORKBENCH_CANVAS_BATCH_ANY_CONNECTION = window.SimpAICanvasWorkbenchBatchAnyConnection || {};
    const WORKBENCH_CANVAS_PRESET_RUN_SERIALIZATION = window.SimpAICanvasWorkbenchPresetRunSerialization || {};
    const WORKBENCH_CANVAS_DIRECTOR_PRESET_VALIDATION = window.SimpAICanvasWorkbenchDirectorPresetValidation || {};
    const WORKBENCH_CANVAS_DIRECTOR_SEGMENT_PAYLOAD = window.SimpAICanvasWorkbenchDirectorSegmentPayload || {};
    const WORKBENCH_CANVAS_DIRECTOR_SEGMENT_TIMELINE = window.SimpAICanvasWorkbenchDirectorSegmentTimeline || {};
    const WORKBENCH_CANVAS_DIRECTOR_SEGMENT_PROMPT_PREFLIGHT = window.SimpAICanvasWorkbenchDirectorSegmentPromptPreflight || {};
    const WORKBENCH_CANVAS_PRESET_RUN_FINGERPRINT = window.SimpAICanvasWorkbenchPresetRunFingerprint || {};
    const WORKBENCH_CANVAS_RESULT_STALENESS = window.SimpAICanvasWorkbenchResultStaleness || {};
    const WORKBENCH_CANVAS_PRESET_RUN_RUNTIME = window.SimpAICanvasWorkbenchPresetRunRuntime || {};
    const WORKBENCH_CANVAS_ASSET_MEDIA = window.SimpAICanvasWorkbenchAssetMedia || {};
    const WORKBENCH_CANVAS_SPECIAL_MEDIA_SOURCE = window.SimpAICanvasWorkbenchSpecialMediaSource || {};
    const WORKBENCH_CANVAS_CONNECTION_MEDIA = window.SimpAICanvasWorkbenchConnectionMedia || {};
    const WORKBENCH_CANVAS_UPLOAD_CONNECTION = window.SimpAICanvasWorkbenchUploadConnection || {};
    const WORKBENCH_CANVAS_SPECIAL_RESULT_BRIDGE = window.SimpAICanvasWorkbenchSpecialResultBridge || {};
    const WORKBENCH_CANVAS_SPECIAL_IMAGE_CONNECTION = window.SimpAICanvasWorkbenchSpecialImageConnection || {};
    const WORKBENCH_CANVAS_CONFIG_CONNECTION = window.SimpAICanvasWorkbenchConfigConnection || {};
    const WORKBENCH_CANVAS_MODEL_CONFIG_CATALOG = window.SimpAICanvasWorkbenchModelConfigCatalog || {};
    const WORKBENCH_CANVAS_CONFIG_EDIT = window.SimpAICanvasWorkbenchConfigEdit || {};
    const WORKBENCH_CANVAS_CONFIG_VALUES = window.SimpAICanvasWorkbenchConfigValues || {};
    const WORKBENCH_CANVAS_STYLE_CATALOG = window.SimpAICanvasWorkbenchStyleCatalog || {};
    const WORKBENCH_CANVAS_STYLE_CONFIG_RENDERER = window.SimpAICanvasWorkbenchStyleConfigRenderer || {};
    const WORKBENCH_CANVAS_DETECTION_CONFIG_RENDERER = window.SimpAICanvasWorkbenchDetectionConfigRenderer || {};
    const WORKBENCH_CANVAS_ADVANCED_CONFIG_RENDERER = window.SimpAICanvasWorkbenchAdvancedConfigRenderer || {};
    const WORKBENCH_CANVAS_MODEL_CONFIG_RENDERER = window.SimpAICanvasWorkbenchModelConfigRenderer || {};
    const WORKBENCH_CANVAS_RESOLUTION_CONFIG_RENDERER = window.SimpAICanvasWorkbenchResolutionConfigRenderer || {};
    const WORKBENCH_CANVAS_CONFIG_CREATION = window.SimpAICanvasWorkbenchConfigCreation || {};
    const WORKBENCH_CANVAS_TEXT_CONNECTION = window.SimpAICanvasWorkbenchTextConnection || {};
    const WORKBENCH_CANVAS_MEDIA_INPUT_CONNECTION = window.SimpAICanvasWorkbenchMediaInputConnection || {};
    const WORKBENCH_CANVAS_TIMELINE_CONNECTION = window.SimpAICanvasWorkbenchTimelineConnection || {};
    const WORKBENCH_CANVAS_RESULT_CONNECTION = window.SimpAICanvasWorkbenchResultConnection || {};
    const WORKBENCH_CANVAS_TIMELINE_CREATION = window.SimpAICanvasWorkbenchTimelineCreation || {};
    const WORKBENCH_CANVAS_INPUT_CREATION = window.SimpAICanvasWorkbenchInputCreation || {};
    const WORKBENCH_CANVAS_MEDIA_IMPORT = window.SimpAICanvasWorkbenchMediaImport || {};
    const WORKBENCH_CANVAS_MEDIA_BROWSER_STATE = window.SimpAICanvasWorkbenchMediaBrowserState || {};
    const WORKBENCH_CANVAS_MEDIA_BROWSER_DATA = window.SimpAICanvasWorkbenchMediaBrowserData || {};
    const WORKBENCH_CANVAS_MEDIA_BROWSER_INTERACTION = window.SimpAICanvasWorkbenchMediaBrowserInteraction || {};
    const WORKBENCH_CANVAS_MEDIA_BROWSER_PANEL = window.SimpAICanvasWorkbenchMediaBrowserPanel || {};
    const WORKBENCH_CANVAS_MEDIA_BROWSER_ACTION = window.SimpAICanvasWorkbenchMediaBrowserAction || {};
    const WORKBENCH_CANVAS_GENERATION_METADATA = window.SimpAICanvasWorkbenchGenerationMetadata || {};
    const WORKBENCH_CANVAS_GENERATION_METADATA_INSPECTOR = window.SimpAICanvasWorkbenchGenerationMetadataInspector || {};
    const WORKBENCH_CANVAS_NOTE_EDIT = window.SimpAICanvasWorkbenchNoteEdit || {};
    const WORKBENCH_CANVAS_NOTE_GEOMETRY = window.SimpAICanvasWorkbenchNoteGeometry || {};
    const WORKBENCH_CANVAS_NOTE_RENDERER = window.SimpAICanvasWorkbenchNoteRenderer || {};
    const WORKBENCH_CANVAS_AUX_NODE_CREATION = window.SimpAICanvasWorkbenchAuxNodeCreation || {};
    const WORKBENCH_CANVAS_NOTE_INSPECTOR = window.SimpAICanvasWorkbenchNoteInspector || {};
    const WORKBENCH_CANVAS_BATCH_ANY_CREATION = window.SimpAICanvasWorkbenchBatchAnyCreation || {};
    const WORKBENCH_CANVAS_BATCH_ANY_EDIT = window.SimpAICanvasWorkbenchBatchAnyEdit || {};
    const WORKBENCH_CANVAS_BATCH_ANY_QUERIES = window.SimpAICanvasWorkbenchBatchAnyQueries || {};
    const WORKBENCH_CANVAS_BATCH_ANY_INSPECTOR = window.SimpAICanvasWorkbenchBatchAnyInspector || {};
    const WORKBENCH_CANVAS_RESULT_ASSET = window.SimpAICanvasWorkbenchResultAsset || {};
    const WORKBENCH_CANVAS_RESULT_RUN_ACTION = window.SimpAICanvasWorkbenchResultRunAction || {};
    const WORKBENCH_CANVAS_RESULT_MEDIA_CONVERSION = window.SimpAICanvasWorkbenchResultMediaConversion || {};
    const WORKBENCH_CANVAS_RESULT_METADATA = window.SimpAICanvasWorkbenchResultMetadata || {};
    const WORKBENCH_CANVAS_RESULT_INSPECTOR = window.SimpAICanvasWorkbenchResultInspector || {};
    const WORKBENCH_CANVAS_RESULT_CONTEXT_MENU = window.SimpAICanvasWorkbenchResultContextMenu || {};
    const WORKBENCH_CANVAS_MEDIA_CONTEXT_MENU = window.SimpAICanvasWorkbenchMediaContextMenu || {};
    const WORKBENCH_CANVAS_NODE_CONTEXT_MENU = window.SimpAICanvasWorkbenchNodeContextMenu || {};
    const WORKBENCH_CANVAS_NODE_ACTION = window.SimpAICanvasWorkbenchNodeAction || {};
    const WORKBENCH_CANVAS_NODE_APPEARANCE = window.SimpAICanvasWorkbenchNodeAppearance || {};
    const WORKBENCH_DIRECTOR_TIMELINE_NODE = window.SimpAICanvasWorkbenchDirectorTimelineNode || {};
    const WORKBENCH_STYLE_SELECTOR_NODE = window.SimpAICanvasWorkbenchStyleSelectorNode || {};
    const WORKBENCH_VLM = window.SimpAICanvasWorkbenchVlm || {};
    const normalizeVlmAgentMode = (...args) => WORKBENCH_VLM.normalizeVlmAgentMode?.(...args) || 'persona';
    const WORKBENCH_CANVAS_AGENT = window.SimpAICanvasWorkbenchCanvasAgent || {};
    const WORKBENCH_CANVAS_STATUS = window.SimpAICanvasWorkbenchStatus || {};
    const WORKBENCH_CANVAS_RENDER = window.SimpAICanvasWorkbenchRender || {};
    const WORKBENCH_CANVAS_NODE_RENDER = window.SimpAICanvasWorkbenchNodeRender || {};
    const WORKBENCH_CANVAS_VLM_MODEL_OPTIONS = window.SimpAICanvasWorkbenchVlmModelOptions || {};
    const WORKBENCH_CANVAS_NODE_RENDER_SIGNATURE = window.SimpAICanvasWorkbenchNodeRenderSignature || {};
    const WORKBENCH_CANVAS_EDGE_RUNTIME = window.SimpAICanvasWorkbenchEdgeRuntime || {};
    const WORKBENCH_CANVAS_VLM_CHAT_SCROLL = window.SimpAICanvasWorkbenchVlmChatScroll || {};
    const WORKBENCH_CANVAS_TRANSLATION = window.SimpAICanvasWorkbenchTranslation || {};
    const WORKBENCH_CANVAS_RUN_REFRESH_WAIT = window.SimpAICanvasWorkbenchRunRefreshWait || {};
    const WORKBENCH_CANVAS_POSE_STUDIO_SMOKE = window.SimpAICanvasWorkbenchPoseStudioSmoke || {};
    const WORKBENCH_CANVAS_TIMING = window.SimpAICanvasWorkbenchTiming || {};
    const WORKBENCH_CANVAS_WORKSPACE_RECOVERY = window.SimpAICanvasWorkbenchWorkspaceRecovery || {};
    const WORKBENCH_CANVAS_PERFORMANCE_DIAGNOSTICS = window.SimpAICanvasWorkbenchPerformanceDiagnostics || {};
    const WORKBENCH_CANVAS_NODE_RENDERER = window.SimpAICanvasWorkbenchNodeRenderer || {};
    const WORKBENCH_CANVAS_EDGE_RENDERER = window.SimpAICanvasWorkbenchEdgeRenderer || {};
    const WORKBENCH_CANVAS_CHAIN_RUN_OVERLAY = window.SimpAICanvasWorkbenchChainRunOverlay || {};
    const WORKBENCH_CANVAS_ASSET_NODE_RENDERER = window.SimpAICanvasWorkbenchAssetNodeRenderer || {};
    const WORKBENCH_CANVAS_RESULT_PREVIEW = window.SimpAICanvasWorkbenchResultPreview || {};
    const WORKBENCH_CANVAS_RESULT_STATUS_DOM = window.SimpAICanvasWorkbenchResultStatusDom || {};
    const WORKBENCH_CANVAS_NODE_LAYOUT = window.SimpAICanvasWorkbenchNodeLayout || {};
    const WORKBENCH_CANVAS_PRESET_PARAM_RENDERER = window.SimpAICanvasWorkbenchPresetParamRenderer || {};
    const WORKBENCH_CANVAS_PRESET_NODE_RENDERER = window.SimpAICanvasWorkbenchPresetNodeRenderer || {};
    const WORKBENCH_CANVAS_INSPECTOR = window.SimpAICanvasWorkbenchInspector || {};
    const WORKBENCH_CANVAS_NODE_PARAM = window.SimpAICanvasWorkbenchNodeParam || {};
    const WORKBENCH_CANVAS_AGENT_CONTEXT = window.SimpAICanvasWorkbenchAgentContext || {};
    const WORKBENCH_CANVAS_AGENT_IMAGE_WORKFLOWS = window.SimpAICanvasWorkbenchImageWorkflows || {};
    const WORKBENCH_CANVAS_AGENT_IMAGE_TOOLS = window.SimpAICanvasWorkbenchImageTools || {};
    const WORKBENCH_CANVAS_AGENT_VIDEO_TOOLS = window.SimpAICanvasWorkbenchVideoTools || {};
    const WORKBENCH_CANVAS_AGENT_VIDEO_WORKFLOWS = window.SimpAICanvasWorkbenchVideoWorkflows || {};
    const WORKBENCH_CANVAS_AGENT_AUDIO_WORKFLOWS = window.SimpAICanvasWorkbenchAudioWorkflows || {};
    const WORKBENCH_CANVAS_AGENT_AUDIO_TOOLS = window.SimpAICanvasWorkbenchAudioTools || {};
    const WORKBENCH_CANVAS_AGENT_TOOL_DISPATCH = window.SimpAICanvasWorkbenchToolDispatch || {};
    const WORKBENCH_CANVAS_AGENT_WORKFLOW_LAYOUT = window.SimpAICanvasWorkbenchAgentWorkflowLayout || {};
    const WORKBENCH_CANVAS_AGENT_MASK_WORKFLOW = window.SimpAICanvasWorkbenchAgentMaskWorkflow || {};
    const WORKBENCH_CANVAS_AGENT_SAM3_WORKFLOW = window.SimpAICanvasWorkbenchAgentSam3Workflow || {};
    const WORKBENCH_CANVAS_AGENT_PRESET_RUNTIME = window.SimpAICanvasWorkbenchAgentPresetRuntime || {};
    const WORKBENCH_CANVAS_AGENT_TARGET = window.SimpAICanvasWorkbenchCanvasAgentTarget || {};
    const WORKBENCH_CANVAS_AGENT_ACTION = window.SimpAICanvasWorkbenchCanvasAgentAction || {};
    const WORKBENCH_CANVAS_AGENT_ACTION_EXECUTION = window.SimpAICanvasWorkbenchCanvasAgentActionExecution || {};
    const WORKBENCH_CANVAS_AGENT_PANEL_VIEWS = window.SimpAICanvasWorkbenchPanelViews || {};
    const WORKBENCH_CANVAS_AGENT_PANEL_CONTEXT = window.SimpAICanvasWorkbenchAgentPanelContext || {};
    const WORKBENCH_CANVAS_HISTORY = window.SimpAICanvasWorkbenchHistory || {};
    const WORKBENCH_CANVAS_BACKEND_CONTEXT = window.SimpAICanvasWorkbenchBackendContext || {};
    const WORKBENCH_VLM_MODEL_DOWNLOAD = window.SimpAICanvasWorkbenchVlmModelDownload || {};
    const WORKBENCH_CANVAS_VLM_CUSTOM_API_PROFILES = window.SimpAICanvasWorkbenchVlmCustomApiProfiles || {};
    const WORKBENCH_CANVAS_AGENT_PANEL_CONTROLLER = window.SimpAICanvasWorkbenchPanelController || {};
    const WORKBENCH_CANVAS_SELECTION = window.SimpAICanvasWorkbenchSelection || {};
    const WORKBENCH_CANVAS_GRAPH_DELETE = window.SimpAICanvasWorkbenchGraphDelete || {};
    const WORKBENCH_CANVAS_CLIPBOARD = window.SimpAICanvasWorkbenchClipboard || {};
    const WORKBENCH_CANVAS_AGENT_INSTRUCTION_PLANNER = window.SimpAICanvasWorkbenchInstructionPlanner || {};
    const WORKBENCH_CANVAS_AGENT_PROMPT_CONTEXT = window.SimpAICanvasWorkbenchAgentPromptContext || {};
    const WORKBENCH_CANVAS_AGENT_PROMPT_BOOTSTRAP_CONTEXT = window.SimpAICanvasWorkbenchAgentPromptBootstrapContext || {};
    const WORKBENCH_CANVAS_AGENT_VLM_INSTRUCTION = window.SimpAICanvasWorkbenchVlmInstruction || {};
    const WORKBENCH_CANVAS_AGENT_INSTRUCTION_CONTEXT = window.SimpAICanvasWorkbenchAgentInstructionContext || {};
    const WORKBENCH_CANVAS_AGENT_MEDIA_CONTEXT = window.SimpAICanvasWorkbenchAgentMediaContext || {};
    const WORKBENCH_CANVAS_TEXT_NODE_RENDERER = window.SimpAICanvasWorkbenchTextNodeRenderer || {};
    const WORKBENCH_CANVAS_NODE_VIEW_CONTEXT = window.SimpAICanvasWorkbenchNodeViewContext || {};
    const WORKBENCH_CANVAS_NODE_INTERACTION_CONTEXT = window.SimpAICanvasWorkbenchNodeInteractionContext || {};
    const WORKBENCH_CANVAS_FACTORY_CONTEXT = window.SimpAICanvasWorkbenchFactoryContext || {};
    const WORKBENCH_CANVAS_RUNTIME_CONTEXT = window.SimpAICanvasWorkbenchRuntimeContext || {};
    const WORKBENCH_CANVAS_INPUT_CONTEXT = window.SimpAICanvasWorkbenchInputContext || {};
    const WORKBENCH_CANVAS_VLM_NODE = window.SimpAICanvasWorkbenchVlmNode || {};
    const WORKBENCH_CANVAS_VLM_NODE_VIEW = window.SimpAICanvasWorkbenchVlmNodeView || {};
    const WORKBENCH_CANVAS_VLM_CHAT = window.SimpAICanvasWorkbenchVlmChat || {};
    const WORKBENCH_CANVAS_VLM_CHAT_CONTEXT = window.SimpAICanvasWorkbenchVlmChatContext || {};
    const WORKBENCH_CANVAS_VLM_CONTEXT = window.SimpAICanvasWorkbenchVlmContext || {};
    const WORKBENCH_CANVAS_TEMPLATE_CONTEXT = window.SimpAICanvasWorkbenchTemplateContext || {};
    const WORKBENCH_CANVAS_UI_CONTEXT = window.SimpAICanvasWorkbenchUiContext || {};
    const WORKBENCH_CANVAS_LIFECYCLE_CONTEXT = window.SimpAICanvasWorkbenchLifecycleContext || {};
    const WORKBENCH_CANVAS_CONTROL_CONTEXT = window.SimpAICanvasWorkbenchControlContext || {};
    const WORKBENCH_CANVAS_PROJECT_CONTEXT = window.SimpAICanvasWorkbenchProjectContext || {};
    const WORKBENCH_TIMELINE = window.SimpAICanvasWorkbenchMediaTimeline || {};
    const WORKBENCH_CANVAS_CONTEXT_MENU_CONTEXT = window.SimpAICanvasWorkbenchContextMenuContext || {};
    const WORKBENCH_NODE_MENUS = window.SimpAICanvasWorkbenchNodeMenus || {};
    const WORKBENCH_CANVAS_NODE_MENU_CONTEXT = window.SimpAICanvasWorkbenchNodeMenuContext || {};
    const WORKBENCH_PRESET_CATALOG = window.SimpAICanvasWorkbenchPresetCatalog || {};
    const WORKBENCH_CANVAS_PRESET_CONTEXT = window.SimpAICanvasWorkbenchPresetContext || {};
    const WORKBENCH_CANVAS_PRESET_NODE_CLASSIFIER = window.SimpAICanvasWorkbenchPresetNodeClassifier || {};
    const WORKBENCH_CANVAS_PRESET_SPECIAL_PANEL_RENDERER = window.SimpAICanvasWorkbenchPresetSpecialPanelRenderer || {};
    let projectPersistenceRuntime = null;
    const scheduleSave = (...args) => projectPersistenceRuntime?.scheduleSave?.(...args);
    const scheduleViewportSave = (...args) => projectPersistenceRuntime?.scheduleViewportSave?.(...args);
    const utilsTranslate = WORKBENCH_UTILS.t;
    const utilsTranslateOption = WORKBENCH_UTILS.tOption;
    const utilsGetUiLang = WORKBENCH_UTILS.getUiLang;
    const t = utilsTranslate || ((en, cn) => cn || en);
    const tOption = utilsTranslateOption || ((value) => String(value ?? ''));
    const getUiLang = utilsGetUiLang || (window.SimpAII18n?.getUiLang) || (() => 'en');
    function runtimeUiLang(source) {
        return getUiLang(source || window.simpleaiTopbarSystemParams || {});
    }
    const projectLegacyStorageKey = WORKBENCH_PROJECT.LEGACY_STORAGE_KEY;
    const projectDefaultId = WORKBENCH_PROJECT.PROJECT_ID;
    const projectDefaultSettings = WORKBENCH_PROJECT.DEFAULT_SETTINGS;
    const registrySlotOrder = WORKBENCH_REGISTRY.SLOT_ORDER;
    const registrySlotLabels = WORKBENCH_REGISTRY.SLOT_LABELS;
    const registryVlmVersionChoices = WORKBENCH_REGISTRY.VLM_VERSION_CHOICES;
    const registryVlmModelLabels = WORKBENCH_REGISTRY.VLM_MODEL_LABELS;
    const registryVlmModelCatalog = WORKBENCH_REGISTRY.VLM_MODEL_CATALOG;
    const registryVlmImageSlots = WORKBENCH_REGISTRY.VLM_IMAGE_SLOTS;
    const registryVlmContextWindows = WORKBENCH_REGISTRY.VLM_CONTEXT_WINDOWS;
    const vlmVersionChoices = WORKBENCH_VLM.VLM_VERSION_CHOICES;
    const vlmModelLabels = WORKBENCH_VLM.VLM_MODEL_LABELS;
    const vlmModelCatalog = WORKBENCH_VLM.VLM_MODEL_CATALOG;
    const vlmImageSlots = WORKBENCH_VLM.VLM_IMAGE_SLOTS;
    const vlmSingleNodeSize = WORKBENCH_VLM.VLM_SINGLE_NODE_SIZE;
    const vlmChatNodeSize = WORKBENCH_VLM.VLM_CHAT_NODE_SIZE;
    const vlmChatDefaultFontSize = WORKBENCH_VLM.VLM_CHAT_DEFAULT_FONT_SIZE;
    const vlmChatDefaultMaxHistory = WORKBENCH_VLM.VLM_CHAT_DEFAULT_MAX_HISTORY;
    const vlmChatContextCharsMin = WORKBENCH_VLM.VLM_CHAT_CONTEXT_CHARS_MIN;
    const vlmChatDefaultContextChars = WORKBENCH_VLM.VLM_CHAT_DEFAULT_CONTEXT_CHARS;
    const vlmChatContextCharsHardMax = WORKBENCH_VLM.VLM_CHAT_CONTEXT_CHARS_HARD_MAX;
    const vlmContextWindows = WORKBENCH_VLM.VLM_CONTEXT_WINDOWS;
    const vlmCustomApiStorageKey = WORKBENCH_VLM.VLM_CUSTOM_API_STORAGE_KEY;
    const vlmAgentModeChoices = WORKBENCH_VLM.VLM_AGENT_MODE_CHOICES;
    const vlmChatToolCommands = WORKBENCH_VLM.VLM_CHAT_TOOL_COMMANDS;
    const vlmModelStatusCacheTtlMs = WORKBENCH_VLM.VLM_MODEL_STATUS_CACHE_TTL_MS;
    const vlmCustomApiProviders = WORKBENCH_VLM.CUSTOM_API_PROVIDERS;
    const canvasAgentPresetQueueStorageKey = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_PRESET_QUEUE_STORAGE_KEY;
    const canvasAgentDefaultT2iPresetQueue = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_T2I_PRESET_QUEUE;
    const canvasAgentDefaultEditPresetQueue = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_EDIT_PRESET_QUEUE;
    const canvasAgentDefaultI2vPresetQueue = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_I2V_PRESET_QUEUE;
    const canvasAgentDefaultT2vPresetQueue = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_T2V_PRESET_QUEUE;
    const canvasAgentDefaultVideoEditPresetQueue = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_VIDEO_EDIT_PRESET_QUEUE;
    const canvasAgentDefaultReferenceToVideoPresetQueue = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_REFERENCE_TO_VIDEO_PRESET_QUEUE;
    const canvasAgentDefaultAudioToVideoPresetQueue = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_AUDIO_TO_VIDEO_PRESET_QUEUE;
    const canvasAgentDefaultAudioImageToVideoPresetQueue = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_AUDIO_IMAGE_TO_VIDEO_PRESET_QUEUE;
    const canvasAgentDefaultVideoOutpaintPreset = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_VIDEO_OUTPAINT_PRESET;
    const canvasAgentDefaultVideoErasePreset = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_VIDEO_ERASE_PRESET;
    const canvasAgentDefaultVideoReplacePreset = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_VIDEO_REPLACE_PRESET;
    const canvasAgentDefaultVideoFaceSwapPreset = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_VIDEO_FACE_SWAP_PRESET;
    const canvasAgentDefaultVideoFaceSwapTheme = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_VIDEO_FACE_SWAP_THEME;
    const canvasAgentDefaultVideoMotionTransferPreset = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_VIDEO_MOTION_TRANSFER_PRESET;
    const canvasAgentDefaultVideoMotionTransferTheme = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_VIDEO_MOTION_TRANSFER_THEME;
    const canvasAgentDefaultVideoUpscalePreset = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_VIDEO_UPSCALE_PRESET;
    const canvasAgentDefaultAudioPresetQueue = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_DEFAULT_AUDIO_PRESET_QUEUE;
    const canvasAgentPromptRewriteTimeoutMs = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_PROMPT_REWRITE_TIMEOUT_MS;
    const canvasAgentVlmPlanTimeoutMs = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_VLM_PLAN_TIMEOUT_MS;
    const canvasAgentPresetStatusCacheTtlMs = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_PRESET_STATUS_CACHE_TTL_MS;
    const canvasAgentPresetStatusScanConcurrency = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_PRESET_STATUS_SCAN_CONCURRENCY;
    const canvasAgentMaxImageReferences = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_MAX_IMAGE_REFERENCES;
    const canvasAgentMaxExtraImageReferences = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_MAX_EXTRA_IMAGE_REFERENCES;
    const canvasAgentMaxVideoReferences = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_MAX_VIDEO_REFERENCES;
    const canvasAgentMaxAudioReferences = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_MAX_AUDIO_REFERENCES;
    const canvasAgentMaxTextReferences = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_MAX_TEXT_REFERENCES;
    const canvasAgentAspectOptions = WORKBENCH_CANVAS_AGENT.CANVAS_AGENT_ASPECT_OPTIONS;
    const LEGACY_STORAGE_KEY = projectLegacyStorageKey || 'simpai.infiniteCanvasWorkbench.v1';
    const PROJECT_ID = projectDefaultId || 'default';
    const SLOT_ORDER = registrySlotOrder || ['scene_canvas_image', 'scene_input_image1', 'scene_input_image2', 'scene_input_image3', 'scene_input_image4', 'scene_input_image5', 'scene_input_image6', 'scene_input_image7', 'scene_input_image8', 'scene_video', 'scene_reference_video', 'scene_reference_video2', 'sam3_input_video', 'sam3_mask_video', 'scene_audio', 'scene_audio2', 'scene_audio3'];
    const SLOT_LABELS = registrySlotLabels || {
        scene_canvas_image: t('Canvas / Main Image', '画布 / 主图'),
        scene_input_image1: t('Input Image 1', '输入图 1'),
        scene_input_image2: t('Input Image 2', '输入图 2'),
        scene_input_image3: t('Input Image 3', '输入图 3'),
        scene_input_image4: t('Input Image 4', '输入图 4'),
        scene_input_image5: t('Input Image 5', '输入图 5'),
        scene_input_image6: t('Input Image 6', '输入图 6'),
        scene_input_image7: t('Input Image 7', '输入图 7'),
        scene_input_image8: t('Input Image 8', '输入图 8'),
        scene_video: t('Scene Video', '场景视频'),
        scene_reference_video: t('Reference Video', '参考视频'),
        scene_reference_video2: t('Additional Reference Video', '附加参考视频'),
        sam3_input_video: t('SAM3 Input Video', 'SAM3 输入视频'),
        sam3_mask_video: t('SAM3 Mask Video', 'SAM3 遮罩视频'),
        scene_audio: t('Scene Audio 1', '场景音频 1'),
        scene_audio2: t('Scene Audio 2', '场景音频 2'),
        scene_audio3: t('Scene Audio 3', '场景音频 3')
    };
    const VLM_VERSION_CHOICES = vlmVersionChoices || registryVlmVersionChoices || [
        'Qwen3.5-9B-abliterated-Q4_K_M',
        'Qwen3.5-9B-abliterated-Q6_K',
        'Qwen3.5-9B-abliterated-Q8_0',
        'Gemma4-12B-it-heretic-Q4_K_XL',
        'Qwen3VL-4B-TextEncoder',
        'Custom'
    ];
    const VLM_MODEL_LABELS = vlmModelLabels || registryVlmModelLabels || {};
    const VLM_MODEL_CATALOG = vlmModelCatalog || registryVlmModelCatalog || [];
    const vlmModelOptionsService = WORKBENCH_CANVAS_VLM_MODEL_OPTIONS.createCanvasVlmModelOptions({
        languageSource: {
            t,
            getLanguageState: () => window.simpleaiTopbarSystemParams || {}
        },
        modelSource: {
            getVersionChoices: () => VLM_VERSION_CHOICES,
            getModelLabels: () => VLM_MODEL_LABELS,
            getModelCatalog: () => VLM_MODEL_CATALOG
        },
        utilitySource: { escapeHtml: (...args) => escapeHtml(...args) }
    });
    const vlmModelChoicesFor = (...args) => vlmModelOptionsService.modelChoicesFor(...args);
    const vlmModelDisplayLabel = (...args) => vlmModelOptionsService.modelDisplayLabel(...args);
    const vlmModelOptionsHtml = (...args) => vlmModelOptionsService.modelOptionsHtml(...args);
    const VLM_IMAGE_SLOTS = vlmImageSlots || registryVlmImageSlots || [
        { key: 'image_1', label: t('Image 1', '图像 1') },
        { key: 'image_2', label: t('Image 2', '图像 2') },
        { key: 'image_3', label: t('Image 3', '图像 3') }
    ];
    const VLM_SINGLE_NODE_SIZE = vlmSingleNodeSize || { w: 360, h: 520 };
    const VLM_CHAT_NODE_SIZE = vlmChatNodeSize || { w: 500, h: 720 };
    const VLM_CHAT_DEFAULT_FONT_SIZE = vlmChatDefaultFontSize || 14;
    const VLM_CHAT_DEFAULT_MAX_HISTORY = vlmChatDefaultMaxHistory || 12;
    const VLM_CHAT_CONTEXT_CHARS_MIN = vlmChatContextCharsMin || 1200;
    const VLM_CHAT_DEFAULT_CONTEXT_CHARS = vlmChatDefaultContextChars || 6000;
    const VLM_CHAT_CONTEXT_CHARS_HARD_MAX = vlmChatContextCharsHardMax || 18000;
    const COLLAPSED_PROMPT_NODE_DEFAULT_HEIGHT = 280;
    const COLLAPSED_PROMPT_NODE_MIN_HEIGHT = 220;
    const COLLAPSED_PROMPT_NODE_MAX_HEIGHT = 520;
    const COLLAPSED_PROMPT_PORT_ROW_HEIGHT = 32;
    const COLLAPSED_PROMPT_TEXT_BLOCK_HEIGHT = 150;
    const VLM_CONTEXT_WINDOWS = vlmContextWindows || registryVlmContextWindows || {
        'Qwen3.5-9B-abliterated-Q4_K_M': 8192,
        'Custom': 32768
    };

    const VLM_CUSTOM_API_STORAGE_KEY = vlmCustomApiStorageKey || 'simpai.canvas.vlmCustomApiProfiles.v1';
    const VLM_AGENT_MODE_CHOICES = vlmAgentModeChoices || [
        { key: 'raw', label: t('Raw Model', '原始模型') },
        { key: 'persona', label: t('Persona Chat', '人格聊天') },
        { key: 'canvas_agent', label: t('Canvas Tool Agent', '画布工具 Agent') }
    ];
    const VLM_CHAT_TOOL_COMMANDS = vlmChatToolCommands || [
        { command: '/t2i', label: t('Generate image', '生成图片') },
        { command: '/edit', label: t('Edit selected image', '编辑选中图片') },
        { command: '/Regen', label: t('Regenerate last target', '再来一张') },
        { command: '/outpaint', label: t('Outpaint', '扩图') },
        { command: '/erase', label: t('Erase', '擦除') },
        { command: '/replace', label: t('Replace', '替换') },
        { command: '/upscale', label: t('Upscale', '放大') },
        { command: '/status', label: t('Tool status', '工具状态') }
    ];
    const CANVAS_AGENT_PRESET_QUEUE_STORAGE_KEY = canvasAgentPresetQueueStorageKey || 'simpai.canvas.agentPresetQueues.v1';
    const CANVAS_AGENT_DEFAULT_T2I_PRESET_QUEUE = canvasAgentDefaultT2iPresetQueue || ['Z-imageT'];
    const CANVAS_AGENT_DEFAULT_EDIT_PRESET_QUEUE = canvasAgentDefaultEditPresetQueue || ['Qwen2.1-Edit', 'Flux2-KleinEdit', 'MiniMax-H3(R2I)'];
    const CANVAS_AGENT_DEFAULT_I2V_PRESET_QUEUE = canvasAgentDefaultI2vPresetQueue || ['Wan(I2V)', 'MiniMax-H3(I2V)', 'MiniMax-H3(R2V)', 'Dasiwa(I2V)'];
    const CANVAS_AGENT_DEFAULT_T2V_PRESET_QUEUE = canvasAgentDefaultT2vPresetQueue || ['Wan(T2V)', 'MiniMax-H3(T2V)', 'Wan-TTP'];
    const CANVAS_AGENT_DEFAULT_VIDEO_EDIT_PRESET_QUEUE = canvasAgentDefaultVideoEditPresetQueue || ['Bernini-VideoEdit', 'Wan-Extent', 'Dasiwa-Extent'];
    const CANVAS_AGENT_DEFAULT_REFERENCE_TO_VIDEO_PRESET_QUEUE = canvasAgentDefaultReferenceToVideoPresetQueue || ['MiniMax-H3(R2V)'];
    const CANVAS_AGENT_DEFAULT_AUDIO_TO_VIDEO_PRESET_QUEUE = canvasAgentDefaultAudioToVideoPresetQueue || ['MiniMax-H3(R2V)', 'LTX(TA2V)', 'LTX(IA2V)'];
    const CANVAS_AGENT_DEFAULT_AUDIO_IMAGE_TO_VIDEO_PRESET_QUEUE = canvasAgentDefaultAudioImageToVideoPresetQueue || ['MiniMax-H3(R2V)', 'LTX(IA2V)', 'LTX(TA2V)'];
    const CANVAS_AGENT_DEFAULT_VIDEO_OUTPAINT_PRESET = canvasAgentDefaultVideoOutpaintPreset || 'LTX-Outpaint';
    const CANVAS_AGENT_DEFAULT_VIDEO_ERASE_PRESET = canvasAgentDefaultVideoErasePreset || 'Wan-Remover';
    const CANVAS_AGENT_DEFAULT_VIDEO_REPLACE_PRESET = canvasAgentDefaultVideoReplacePreset || 'Bernini-VideoEdit';
    const CANVAS_AGENT_DEFAULT_VIDEO_FACE_SWAP_PRESET = canvasAgentDefaultVideoFaceSwapPreset || 'ReActor-FaceSwap';
    const CANVAS_AGENT_DEFAULT_VIDEO_FACE_SWAP_THEME = canvasAgentDefaultVideoFaceSwapTheme || 'ReActor Face Swap';
    const CANVAS_AGENT_DEFAULT_VIDEO_MOTION_TRANSFER_PRESET = canvasAgentDefaultVideoMotionTransferPreset || 'Wan-SCAIL2';
    const CANVAS_AGENT_DEFAULT_VIDEO_MOTION_TRANSFER_THEME = canvasAgentDefaultVideoMotionTransferTheme || 'Character Motion Transfer';
    const CANVAS_AGENT_DEFAULT_VIDEO_UPSCALE_PRESET = canvasAgentDefaultVideoUpscalePreset || 'Nvidia-VSR';
    const CANVAS_AGENT_DEFAULT_AUDIO_PRESET_QUEUE = canvasAgentDefaultAudioPresetQueue || [];
    const CANVAS_AGENT_PROMPT_REWRITE_TIMEOUT_MS = Math.max(5000, Number(canvasAgentPromptRewriteTimeoutMs || 25000));
    const CANVAS_AGENT_VLM_PLAN_TIMEOUT_MS = Math.max(5000, Number(canvasAgentVlmPlanTimeoutMs || 90000));
    let CANVAS_AGENT_VLM_INSTRUCTION_CONTROLLER = null;
    let CANVAS_AGENT_PROMPT_REWRITE_CONTROLLER = null;
    let CANVAS_AGENT_TEXT_WORKFLOW_CONTROLLER = null;
    let CANVAS_AGENT_TEXT_NODE_CONTROLLER = null;
    let CANVAS_AGENT_SETTINGS_CONTROLLER = null;
    let CANVAS_AGENT_PANEL_CONTROLLER = null;
    let CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER = null;
    let CANVAS_AGENT_TARGET_CONTROLLER = null;
    let CANVAS_AGENT_ACTION_CONTROLLER = null;
    let CANVAS_AGENT_ACTION_EXECUTION_CONTROLLER = null;
    let CANVAS_OUTPAINT_CONTROLLER = null;
    let CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER = {};
    let CANVAS_TEXT_NODE_RENDERER = null;
    let CANVAS_VLM_NODE_CONTROLLER = null;
    let CANVAS_VLM_NODE_VIEW_CONTROLLER = null;
    let CANVAS_VLM_CHAT_CONTROLLER = null;
    let CANVAS_VLM_AGENT_CONTEXT = {};
    let GROUP_LIST_CONTEXT = {};
    let CANVAS_PRESET_PARAM_RENDERER = null;
    let CANVAS_INSPECTOR_CONTROLLER = null;
    let CANVAS_NODE_PARAM_CONTROLLER = null;
    let CANVAS_TIMELINE_PARAM_CONTROLLER = null;
    let CANVAS_TIMELINE_COMMAND_CONTROLLER = null;
    let CANVAS_TIMELINE_PLAYBACK_CONTROLLER = null;
    let CANVAS_TIMELINE_RENDER_CONTROLLER = null;
    let CANVAS_TIMELINE_FRAME_CONTROLLER = null;
    let CANVAS_TIMELINE_COMPARE_CONTROLLER = null;
    let CANVAS_PRESET_MODEL_STATUS_CONTROLLER = {};
    let CANVAS_MISSING_MODEL_DIALOG_CONTROLLER = {};
    let CANVAS_RUN_STATE_CONTROLLER = {};
    let CANVAS_NODE_STATE_CONTROLLER = {};
    let CANVAS_SCHEDULER_STATE_CONTROLLER = {};
    let CANVAS_SCHEDULER_STEP_CONTROLLER = {};
    let CANVAS_SCHEDULER_RUN_CONTROLLER = {};
    let CANVAS_TOAST_CONTROLLER = {};
    let CANVAS_WILDCARDS_V2_CONTROLLER = {};
    let CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER = {};
    let CANVAS_POSE_STUDIO_SMOKE_CONTROLLER = {};
    let CANVAS_TIMING_CONTROLLER = {};
    let CANVAS_WORKSPACE_RECOVERY_CONTROLLER = {};
    let CANVAS_PERFORMANCE_DIAGNOSTICS_CONTROLLER = {};
    let CANVAS_BATCH_ANY_RUNTIME_CONTROLLER = {};
    let CANVAS_BATCH_ANY_CONNECTION_CONTROLLER = {};
    let CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER = {};
    let CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER = {};
    let CANVAS_DIRECTOR_SEGMENT_PAYLOAD_CONTROLLER = {};
    let CANVAS_DIRECTOR_SEGMENT_TIMELINE_CONTROLLER = {};
    let CANVAS_DIRECTOR_SEGMENT_PROMPT_PREFLIGHT_CONTROLLER = {};
    let CANVAS_PRESET_RUN_FINGERPRINT_CONTROLLER = {};
    let CANVAS_RESULT_STALENESS_CONTROLLER = {};
    let CANVAS_RESULT_RUN_ACTION_CONTROLLER = {};
    let CANVAS_RESULT_MEDIA_CONVERSION_CONTROLLER = {};
    let CANVAS_RESULT_METADATA_CONTROLLER = {};
    let CANVAS_RESULT_INSPECTOR_CONTROLLER = {};
    let CANVAS_RESULT_CONTEXT_MENU_CONTROLLER = {};
    let CANVAS_MEDIA_CONTEXT_MENU_CONTROLLER = {};
    let CANVAS_NODE_CONTEXT_MENU_CONTROLLER = {};
    let CANVAS_RESULT_STATUS_DOM_CONTROLLER = {};
    let CANVAS_ASSET_MEDIA_CONTROLLER = {};
    let CANVAS_SPECIAL_MEDIA_SOURCE_CONTROLLER = {};
    let CANVAS_CONNECTION_MEDIA_CONTROLLER = {};
    let CANVAS_UPLOAD_CONNECTION_CONTROLLER = {};
    let CANVAS_SPECIAL_RESULT_BRIDGE_CONTROLLER = {};
    let CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER = {};
    let CANVAS_CONFIG_CONNECTION_CONTROLLER = {};
    let CANVAS_MODEL_CONFIG_CATALOG_CONTROLLER = {};
    let CANVAS_CONFIG_EDIT_CONTROLLER = {};
    let CANVAS_CONFIG_VALUES_CONTROLLER = {};
    let CANVAS_STYLE_CATALOG_CONTROLLER = {};
    let CANVAS_STYLE_CONFIG_RENDERER = {};
    let CANVAS_DETECTION_CONFIG_RENDERER = {};
    let CANVAS_ADVANCED_CONFIG_RENDERER = {};
    let CANVAS_MODEL_CONFIG_RENDERER = {};
    let CANVAS_RESOLUTION_CONFIG_RENDERER = {};
    let CANVAS_CONFIG_CREATION_CONTROLLER = {};
    let CANVAS_TEXT_CONNECTION_CONTROLLER = {};
    let CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER = {};
    let CANVAS_TIMELINE_CONNECTION_CONTROLLER = {};
    let CANVAS_RESULT_CONNECTION_CONTROLLER = {};
    let CANVAS_TIMELINE_CREATION_CONTROLLER = {};
    let CANVAS_COMPARE_CREATION_CONTROLLER = {};
    let CANVAS_INPUT_CREATION_CONTROLLER = {};
    let CANVAS_MEDIA_IMPORT_CONTROLLER = {};
    let CANVAS_MEDIA_BROWSER_STATE_CONTROLLER = {};
    let CANVAS_GALLERY_FROST_CONTROLLER = {};
    let CANVAS_MEDIA_BROWSER_DATA_CONTROLLER = {};
    let CANVAS_MEDIA_BROWSER_INTERACTION_CONTROLLER = {};
    let CANVAS_MEDIA_BROWSER_PANEL_CONTROLLER = {};
    let CANVAS_MEDIA_BROWSER_ACTION_CONTROLLER = {};
    let CANVAS_GENERATION_METADATA_CONTROLLER = {};
    let CANVAS_GENERATION_METADATA_INSPECTOR_CONTROLLER = {};
    let CANVAS_NOTE_EDIT_CONTROLLER = {};
    let CANVAS_NOTE_GEOMETRY_CONTROLLER = {};
    let CANVAS_NOTE_RENDERER_CONTROLLER = {};
    let CANVAS_AUX_NODE_CREATION_CONTROLLER = {};
    let CANVAS_NOTE_INSPECTOR_CONTROLLER = {};
    let CANVAS_BATCH_ANY_CREATION_CONTROLLER = {};
    let CANVAS_BATCH_ANY_EDIT_CONTROLLER = {};
    let CANVAS_BATCH_ANY_QUERIES_CONTROLLER = {};
    let CANVAS_BATCH_ANY_INSPECTOR_CONTROLLER = {};
    const scheduleAutoPresetModelChecks = (...args) => CANVAS_PRESET_MODEL_STATUS_CONTROLLER?.scheduleAutoPresetModelChecks?.(...args);
    const schedulePresetModelListRefreshes = (...args) => CANVAS_PRESET_MODEL_STATUS_CONTROLLER?.schedulePresetModelListRefreshes?.(...args);
    const showToast = (...args) => CANVAS_TOAST_CONTROLLER?.showToast?.(...args);
    const CANVAS_LAZY_ASSET_RUNTIME_CONTROLLER = typeof WORKBENCH_CANVAS_LAZY_ASSET_RUNTIME.createCanvasLazyAssetRuntimeController === 'function'
        ? WORKBENCH_CANVAS_LAZY_ASSET_RUNTIME.createCanvasLazyAssetRuntimeController({
            lazyAssetRuntimeSource: {
                runtimeSource: {
                    getLazyAssetGroupLoader: () => window.loadSimpleAILazyAssetGroup,
                    getLayerForgeAdapter: () => window.SimpAILayerForgeAdapter,
                    getDocument: () => document,
                    workbenchStaticFilePath: path => WORKBENCH_UTILS.workbenchStaticFilePath(path, document),
                    warn: (...args) => console.warn(...args),
                    showToast
                }
            }
        })
        : {};
    const nodeStatusState = (...args) => CANVAS_RUN_STATE_CONTROLLER?.nodeStatusState?.(...args) || '';
    const isCanvasRunActiveState = (...args) => !!CANVAS_RUN_STATE_CONTROLLER?.isCanvasRunActiveState?.(...args);
    const isTerminalRunState = (...args) => !!CANVAS_RUN_STATE_CONTROLLER?.isTerminalRunState?.(...args);
    const isNodeVisuallyRunning = (...args) => !!CANVAS_RUN_STATE_CONTROLLER?.isNodeVisuallyRunning?.(...args);
    const ensureVlmNodeModeSize = (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.ensureVlmNodeModeSize?.(...args) || false;
    const getWildcardsV2State = (...args) => CANVAS_WILDCARDS_V2_CONTROLLER?.getWildcardsV2State?.(...args) || null;
    const closeWildcardsV2Panel = (...args) => CANVAS_WILDCARDS_V2_CONTROLLER?.closeWildcardsV2Panel?.(...args);
    const openWildcardsV2Panel = (...args) => CANVAS_WILDCARDS_V2_CONTROLLER?.openWildcardsV2Panel?.(...args);
    const openWildcardsInsertMenu = (...args) => CANVAS_WILDCARDS_V2_CONTROLLER?.openWildcardsInsertMenu?.(...args);
    const promptAndAppendWildcardTag = (...args) => CANVAS_WILDCARDS_V2_CONTROLLER?.promptAndAppendWildcardTag?.(...args);
    const openWildcardsManager = (...args) => CANVAS_WILDCARDS_V2_CONTROLLER?.openWildcardsManager?.(...args);
    const runPoseStudioCanvasSmoke = (...args) => CANVAS_POSE_STUDIO_SMOKE_CONTROLLER?.runPoseStudioCanvasSmoke?.(...args)
        || Promise.resolve({ ok: false, error: 'pose studio smoke controller is unavailable' });
    const requestCanvasFrame = (...args) => CANVAS_TIMING_CONTROLLER?.requestAnimationFrame?.(...args) ?? null;
    const cancelCanvasFrame = (...args) => CANVAS_TIMING_CONTROLLER?.cancelAnimationFrame?.(...args);
    const canvasPerformanceNow = (...args) => Number(CANVAS_TIMING_CONTROLLER?.performanceNow?.(...args)) || 0;
    const canvasNow = (...args) => Number(CANVAS_TIMING_CONTROLLER?.now?.(...args)) || 0;
    const waitNextFrame = (...args) => CANVAS_TIMING_CONTROLLER?.waitNextFrame?.(...args) || Promise.resolve();
    const canvasAgentUploadSlotsForNode = (...args) => {
        const slots = CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentUploadSlotsForNode?.(...args);
        return Array.isArray(slots) ? slots : [];
    };
    const isCanvasAgentMaskSlot = (...args) => !!CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.isCanvasAgentMaskSlot?.(...args);
    const renderTextNodeHtml = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderTextNodeHtml?.(...args) || '';
    const renderTextMergeNodeHtml = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderTextMergeNodeHtml?.(...args) || '';
    const renderTranslationNodeHtml = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderTranslationNodeHtml?.(...args) || '';
    const renderTagCartNodeHtml = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderTagCartNodeHtml?.(...args) || '';
    const renderTextInspectorFromRenderer = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderTextInspector?.(...args) || '';
    const renderTextMergeInspectorFromRenderer = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderTextMergeInspector?.(...args) || '';
    const renderTranslationInspectorFromRenderer = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderTranslationInspector?.(...args) || '';
    const renderTagCartInspectorFromRenderer = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderTagCartInspector?.(...args) || '';
    const renderWd14InspectorFromRenderer = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderWd14Inspector?.(...args) || '';
    const renderClassicInspectorFromRenderer = (...args) => CANVAS_PRESET_NODE_RENDERER?.renderClassicInspector?.(...args) || '';
    const renderPresetInspectorFromRenderer = (...args) => CANVAS_PRESET_NODE_RENDERER?.renderPresetInspector?.(...args) || '';
    const renderWd14NodeHtml = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderWd14NodeHtml?.(...args) || '';
    const renderWildcardsHelperNodeHtml = (...args) => CANVAS_TEXT_NODE_RENDERER?.renderWildcardsHelperNodeHtml?.(...args) || '';
    const buildVlmNode = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmNode?.(...args) || null;
    const buildVlmModelUnknownStatus = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmModelUnknownStatus?.(...args) || null;
    const buildVlmModelCheckingStatus = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmModelCheckingStatus?.(...args) || null;
    const buildVlmParamsPatch = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmParamsPatch?.(...args) || {};
    const buildVlmTextPatch = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmTextPatch?.(...args) || {};
    const buildVlmLastResponsePatch = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmLastResponsePatch?.(...args) || {};
    const buildVlmCustomModelChoicesPatch = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmCustomModelChoicesPatch?.(...args) || {};
    const buildVlmNodeSizePatch = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmNodeSizePatch?.(...args) || {};
    const buildVlmImageInputsPatch = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmImageInputsPatch?.(...args) || {};
    const buildVlmRunStatusPatch = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmRunStatusPatch?.(...args) || {};
    const buildVlmModelStatusPatch = (...args) => CANVAS_VLM_NODE_CONTROLLER?.buildVlmModelStatusPatch?.(...args) || {};
    const applyVlmModelStatus = (...args) => CANVAS_VLM_NODE_CONTROLLER?.applyVlmModelStatus?.(...args);
    const renderVlmModelStatusHtml = (...args) => CANVAS_VLM_NODE_VIEW_CONTROLLER?.renderVlmModelStatusHtml?.(...args) || '';
    const renderVlmInputRows = (...args) => CANVAS_VLM_NODE_VIEW_CONTROLLER?.renderVlmInputRows?.(...args) || '';
    const renderVlmPendingImages = (...args) => CANVAS_VLM_NODE_VIEW_CONTROLLER?.renderVlmPendingImages?.(...args) || '';
    const renderVlmAgentModeSelect = (...args) => CANVAS_VLM_NODE_VIEW_CONTROLLER?.renderVlmAgentModeSelect?.(...args) || '';
    const renderVlmNodeHtml = (...args) => CANVAS_VLM_NODE_VIEW_CONTROLLER?.renderVlmNodeHtml?.(...args) || '';
    const renderVlmInspector = (...args) => CANVAS_VLM_NODE_VIEW_CONTROLLER?.renderVlmInspector?.(...args) || '';
    const vlmModelStatusState = (...args) => CANVAS_VLM_NODE_CONTROLLER?.vlmModelStatusState?.(...args) || 'unknown';
    const renderVlmSystemPromptTemplatePicker = (...args) => CANVAS_VLM_NODE_CONTROLLER?.renderVlmSystemPromptTemplatePicker?.(...args) || '';
    const syncVlmSystemPromptTemplateDom = (...args) => CANVAS_VLM_NODE_CONTROLLER?.syncVlmSystemPromptTemplateDom?.(...args);
    const applyVlmSystemPromptTemplate = (...args) => CANVAS_VLM_NODE_CONTROLLER?.applyVlmSystemPromptTemplate?.(...args);
    const getVlmCustomKeyInput = (...args) => CANVAS_VLM_NODE_CONTROLLER?.getVlmCustomKeyInput?.(...args) || null;
    const refreshVlmChatReadabilityDom = (nodeEl, node) => CANVAS_VLM_NODE_CONTROLLER?.refreshVlmChatReadabilityDom?.(node, nodeEl);
    const updateVlmParam = (...args) => CANVAS_VLM_NODE_CONTROLLER?.updateVlmParam?.(...args);
    const handleVlmParamFieldChange = (...args) => CANVAS_VLM_NODE_CONTROLLER?.handleVlmParamFieldChange?.(...args);
    const handleCanvasRelightLightButtonEvent = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.handleCanvasRelightLightButtonEvent?.(...args) || false;
    const setPresetTheme = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.setPresetTheme?.(...args);
    const bindInspectorThemeEvents = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.bindInspectorThemeEvents?.(...args) || false;
    const bindInspectorVlmEvents = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.bindInspectorVlmEvents?.(...args) || false;
    const bindInspectorParamButtonEvents = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.bindInspectorParamButtonEvents?.(...args) || false;
    const handlePresetThemeChange = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.handlePresetThemeChange?.(...args) || false;
    const renderInspector = (...args) => CANVAS_INSPECTOR_CONTROLLER?.renderInspector?.(...args);
    const updateNodeParam = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.updateNodeParam?.(...args);
    const injectParamResetButtons = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.injectParamResetButtons?.(...args);
    const handleNodeParamFieldChange = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.handleNodeParamFieldChange?.(...args) || false;
    const handleNodeParamEvent = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.handleNodeParamEvent?.(...args) || false;
    const handleVlmParamResetClick = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.handleVlmParamResetClick?.(...args) || false;
    const handlePresetParamResetClick = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.handlePresetParamResetClick?.(...args) || false;
    const handleClassicNodeChangeEvent = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.handleClassicNodeChangeEvent?.(...args) || false;
    const handleInspectorNodeFieldChange = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.handleInspectorNodeFieldChange?.(...args) || false;
    const bindInspectorNodeFieldEvents = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.bindInspectorNodeFieldEvents?.(...args) || false;
    const bindInspectorParamEvents = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.bindInspectorParamEvents?.(...args) || false;
    const bindClassicInspectorEvents = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.bindClassicInspectorEvents?.(...args) || false;
    const bindTextInspectorEvents = (...args) => CANVAS_NODE_PARAM_CONTROLLER?.bindTextInspectorEvents?.(...args) || false;
    const updateTimelineParam = (...args) => CANVAS_TIMELINE_PARAM_CONTROLLER?.updateTimelineParam?.(...args);
    const updateTimelineClipParam = (...args) => CANVAS_TIMELINE_PARAM_CONTROLLER?.updateTimelineClipParam?.(...args);
    const handleTimelineNodeParamEvent = (...args) => CANVAS_TIMELINE_PARAM_CONTROLLER?.handleTimelineNodeParamEvent?.(...args) || false;
    const resetTimelineParam = (...args) => CANVAS_TIMELINE_PARAM_CONTROLLER?.resetTimelineParam?.(...args);
    const resetTimelineClipParam = (...args) => CANVAS_TIMELINE_PARAM_CONTROLLER?.resetTimelineClipParam?.(...args);
    const bindInspectorTimelineParamEvents = (...args) => CANVAS_TIMELINE_PARAM_CONTROLLER?.bindInspectorTimelineParamEvents?.(...args) || false;
    const bindInspectorTimelineResetEvents = (...args) => CANVAS_TIMELINE_PARAM_CONTROLLER?.bindInspectorTimelineResetEvents?.(...args) || false;
    const selectTimelineClip = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.selectTimelineClip?.(...args) || null;
    const moveTimelineTrack = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.moveTimelineTrack?.(...args);
    const handleTimelineClick = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.handleTimelineClick?.(...args) || false;
    const resetTimelineActiveTool = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.resetTimelineActiveTool?.(...args) || false;
    const upsertTimelineClipKeyframe = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.upsertTimelineClipKeyframe?.(...args) || false;
    const deleteTimelineClipKeyframeAtPlayhead = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.deleteTimelineClipKeyframeAtPlayhead?.(...args) || false;
    const jumpTimelineToKeyframe = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.jumpTimelineToKeyframe?.(...args) || false;
    const jumpTimelineKeyframeFromElement = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.jumpTimelineKeyframeFromElement?.(...args) || false;
    const setTimelineKeyframeEasing = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.setTimelineKeyframeEasing?.(...args) || false;
    const jumpTimelineClipKeyframe = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.jumpTimelineClipKeyframe?.(...args) || false;
    const openTimelineKeyframeContextMenu = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.openTimelineKeyframeContextMenu?.(...args) || false;
    const handleTimelineAction = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.handleTimelineAction?.(...args) || false;
    const setTimelineDurationToPlayhead = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.setTimelineDurationToPlayhead?.(...args) || false;
    const setTimelineDurationToContent = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.setTimelineDurationToContent?.(...args) || false;
    const swapTimelineSize = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.swapTimelineSize?.(...args) || false;
    const openTimelineClipContextMenu = (...args) => CANVAS_TIMELINE_COMMAND_CONTROLLER?.openTimelineClipContextMenu?.(...args) || false;
    const toggleTimelinePreviewPlayback = (...args) => CANVAS_TIMELINE_PLAYBACK_CONTROLLER?.toggleTimelinePreviewPlayback?.(...args) || false;
    const playTimelineFromStart = (...args) => CANVAS_TIMELINE_PLAYBACK_CONTROLLER?.playTimelineFromStart?.(...args) || false;
    const stopTimelinePlayback = (...args) => CANVAS_TIMELINE_PLAYBACK_CONTROLLER?.stopTimelinePlayback?.(...args) || false;
    const renderTimelineToResult = (...args) => CANVAS_TIMELINE_RENDER_CONTROLLER?.renderTimelineToResult?.(...args)
        || Promise.resolve({ ok: false, error: 'timeline render controller is unavailable' });
    const computeTimelineRunFingerprint = (...args) => CANVAS_TIMELINE_RENDER_CONTROLLER?.computeTimelineRunFingerprint?.(...args) || '';
    const getActiveTimelineVisualClips = (...args) => CANVAS_TIMELINE_FRAME_CONTROLLER?.getActiveTimelineVisualClips?.(...args) || [];
    const renderTimelinePreviewFrameDataUrl = (...args) => CANVAS_TIMELINE_FRAME_CONTROLLER?.renderTimelinePreviewFrameDataUrl?.(...args)
        || Promise.resolve('');
    const compareTimelineFrameImages = (...args) => CANVAS_TIMELINE_FRAME_CONTROLLER?.compareTimelineFrameImages?.(...args)
        || Promise.reject(new Error('timeline frame controller is unavailable'));
    const compareTimelineFrameWithBackend = (...args) => CANVAS_TIMELINE_COMPARE_CONTROLLER?.compareTimelineFrameWithBackend?.(...args)
        || Promise.resolve(undefined);
    const MEDIA_HELPERS_CONTEXT_SOURCE = {
        documentSource: {
            getDocument: () => typeof document !== 'undefined' ? document : null
        },
        browserSource: {
            createFileReader: () => typeof window.FileReader === 'function' ? new window.FileReader() : null,
            createImage: () => typeof window.Image === 'function' ? new window.Image() : null,
            getAudioContext: () => window.AudioContext || window.webkitAudioContext || null
        },
        timingSource: {
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
        }
    };
    const MEDIA_HELPERS_CONTEXT = typeof WORKBENCH_MEDIA_HELPERS.createMediaHelpersContext === 'function'
        ? WORKBENCH_MEDIA_HELPERS.createMediaHelpersContext({
            mediaHelpersSource: MEDIA_HELPERS_CONTEXT_SOURCE
        })
        : WORKBENCH_MEDIA_HELPERS;
    const isImageFile = MEDIA_HELPERS_CONTEXT.isImageFile;
    const isVideoFile = MEDIA_HELPERS_CONTEXT.isVideoFile;
    const isAudioFile = MEDIA_HELPERS_CONTEXT.isAudioFile;
    const isMediaFile = MEDIA_HELPERS_CONTEXT.isMediaFile;
    const isBatchTextFile = MEDIA_HELPERS_CONTEXT.isBatchTextFile;
    const isWorkbenchProjectFile = MEDIA_HELPERS_CONTEXT.isWorkbenchProjectFile;
    const pickLocalVideoFile = MEDIA_HELPERS_CONTEXT.pickLocalVideoFile;
    const pickLocalImageFile = MEDIA_HELPERS_CONTEXT.pickLocalImageFile;
    const pickLocalAudioFile = MEDIA_HELPERS_CONTEXT.pickLocalAudioFile;
    const readFileAsDataUrl = MEDIA_HELPERS_CONTEXT.readFileAsDataUrl;
    const readFileAsText = MEDIA_HELPERS_CONTEXT.readFileAsText;
    const loadImageElementForCanvas = MEDIA_HELPERS_CONTEXT.loadImageElementForCanvas;
    const normalizeLayerForgeDataUrl = MEDIA_HELPERS_CONTEXT.normalizeLayerForgeDataUrl;
    const createAlphaMaskDataUrl = MEDIA_HELPERS_CONTEXT.createAlphaMaskDataUrl;
    const mergeMaskDataUrls = MEDIA_HELPERS_CONTEXT.mergeMaskDataUrls;
    const getImageDimensions = MEDIA_HELPERS_CONTEXT.getImageDimensions;
    const getMediaMetadata = MEDIA_HELPERS_CONTEXT.getMediaMetadata;
    const createThumbnailDataUrl = MEDIA_HELPERS_CONTEXT.createThumbnailDataUrl;
    const createVideoStoryboardDataUrls = MEDIA_HELPERS_CONTEXT.createVideoStoryboardDataUrls;
    const extractVideoFirstFrameDataUrl = MEDIA_HELPERS_CONTEXT.extractVideoFirstFrameDataUrl;
    const createAudioWaveformPeaks = MEDIA_HELPERS_CONTEXT.createAudioWaveformPeaks;
    const MEDIA_BROWSER_PAINT_CONTEXT_SOURCE = {
        timingSource: {
            performanceNow: () => canvasPerformanceNow(),
            requestAnimationFrame: (callback) => requestCanvasFrame(callback),
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
        },
        renderSource: {
            renderMediaBrowserPanel: (...args) => CANVAS_MEDIA_BROWSER_PANEL_CONTROLLER.renderMediaBrowserPanel(...args),
            findMediaBrowserNodeElement: (nodeId) => {
                if (!nodeId || !nodesLayer) return null;
                return nodesLayer.querySelector(`[data-node-id="${CSS.escape(nodeId)}"]`);
            }
        }
    };
    const MEDIA_BROWSER_PAINT_CONTROLLER = typeof WORKBENCH_MEDIA_BROWSER_PAINT.createCanvasMediaBrowserPaintController === 'function'
        ? WORKBENCH_MEDIA_BROWSER_PAINT.createCanvasMediaBrowserPaintController({
            mediaBrowserPaintSource: MEDIA_BROWSER_PAINT_CONTEXT_SOURCE
        })
        : {};
    const getMediaBrowserScrollMemory = () => MEDIA_BROWSER_PAINT_CONTROLLER.getMediaBrowserScrollMemory?.() || new Map();
    const captureMediaBrowserScroll = (...args) => MEDIA_BROWSER_PAINT_CONTROLLER.captureMediaBrowserScroll?.(...args) || null;
    const restoreMediaBrowserScroll = (...args) => MEDIA_BROWSER_PAINT_CONTROLLER.restoreMediaBrowserScroll?.(...args);
    const primeMediaBrowserThumbImages = (...args) => MEDIA_BROWSER_PAINT_CONTROLLER.primeMediaBrowserThumbImages?.(...args);
    const nudgeMediaBrowserPaint = (...args) => MEDIA_BROWSER_PAINT_CONTROLLER.nudgeMediaBrowserPaint?.(...args);
    const scheduleMediaBrowserPaintRefresh = (...args) => MEDIA_BROWSER_PAINT_CONTROLLER.scheduleMediaBrowserPaintRefresh?.(...args);
    const scheduleMediaBrowserNodePaintRefresh = (...args) => MEDIA_BROWSER_PAINT_CONTROLLER.scheduleMediaBrowserNodePaintRefresh?.(...args);
    const TEXTAREA_EDITOR_CONTEXT_SOURCE = {
        domSource: {
            getDocument: () => typeof document !== 'undefined' ? document : null,
            getRoot: () => root,
            getNodesLayer: () => nodesLayer,
            getInspector: () => inspector
        },
        overlaySource: {
            getOverlayHost: () => canvasOverlayHost()
        },
        languageSource: {
            t
        },
        utilitySource: {
            escapeHtml: (...args) => escapeHtml(...args),
            cssEscape: (...args) => cssEscape(...args),
            detectTheme: (...args) => detectWorkbenchTheme(...args)
        },
        timingSource: {
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
        },
        eventSource: {
            createEvent: (type, init) => {
                const EventCtor = typeof window.Event === 'function' ? window.Event : null;
                return EventCtor ? new EventCtor(type, init) : null;
            }
        },
        selectionSource: {
            getSelectedNodeId: () => selectedNodeId,
            getNode: (id) => getNode(id)
        },
        toolSource: {
            openWildcardsInsertMenu: (...args) => openWildcardsInsertMenu(...args),
            openTagCartForField: (...args) => openTagCartForField(...args)
        },
        formSource: {
            ensureFormNames: (...args) => ensureWorkbenchFormFieldNames(...args)
        }
    };
    const TEXTAREA_EDITOR_CONTROLLER = typeof WORKBENCH_CANVAS_TEXTAREA_EDITOR.createCanvasTextareaEditorController === 'function'
        ? WORKBENCH_CANVAS_TEXTAREA_EDITOR.createCanvasTextareaEditorController({
            textareaEditorSource: TEXTAREA_EDITOR_CONTEXT_SOURCE
        })
        : {};
    const getTextareaEditorState = () => TEXTAREA_EDITOR_CONTROLLER.getTextareaEditorState?.() || null;
    const textareaEditorFieldFromTitleClick = (...args) => TEXTAREA_EDITOR_CONTROLLER.textareaEditorFieldFromTitleClick?.(...args) || null;
    const CANVAS_INTERACTIVE_TARGET_CONTROLLER = typeof WORKBENCH_CANVAS_INTERACTIVE_TARGET.createCanvasInteractiveTargetController === 'function'
        ? WORKBENCH_CANVAS_INTERACTIVE_TARGET.createCanvasInteractiveTargetController({
            isTextareaEditorTitleTarget: (target) => !!textareaEditorFieldFromTitleClick(target)
        })
        : {};
    const isInteractiveTarget = (...args) => CANVAS_INTERACTIVE_TARGET_CONTROLLER.isInteractiveTarget?.(...args) || false;
    const bindInspectorTextareaTitleEvents = (...args) => TEXTAREA_EDITOR_CONTROLLER.bindInspectorTextareaTitleEvents?.(...args) || false;
    const openTextareaEditor = (...args) => TEXTAREA_EDITOR_CONTROLLER.openTextareaEditor?.(...args);
    const MISSING_MODEL_DIALOG_CONTEXT_SOURCE = {
        domSource: {
            getDocument: () => document,
            getRoot: () => root,
            detectWorkbenchTheme,
            ensureWorkbenchFormFieldNames
        },
        utilitySource: { escapeHtml: (...args) => escapeHtml(...args) },
        languageSource: {
            getLanguageState: () => Object.assign({}, window.simpleaiTopbarSystemParams || {}, { __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        },
        modelSource: {
            queuePresetModelDownloads: (...args) => queuePresetModelDownloads(...args),
            queueVlmModelDownloads: (...args) => queueVlmModelDownloads(...args)
        }
    };
    CANVAS_MISSING_MODEL_DIALOG_CONTROLLER = typeof WORKBENCH_CANVAS_MISSING_MODEL_DIALOG.createCanvasMissingModelDialogController === 'function'
        ? WORKBENCH_CANVAS_MISSING_MODEL_DIALOG.createCanvasMissingModelDialogController({
            missingModelDialogSource: MISSING_MODEL_DIALOG_CONTEXT_SOURCE
        })
        : {};
    const TAG_CART_CONTEXT_SOURCE = {
        nodeSource: {
            isNodeLocked,
            getNode,
            getSelectedNodeId: () => selectedNodeId,
            getNodeTextOutput: (...args) => getNodeTextOutput(...args),
            getTextNodeInputSource: (...args) => getTextNodeInputSource(...args),
            buildTagCartSizePatch: (...args) => buildTagCartSizePatch(...args),
            buildTagCartStatePatch: (...args) => buildTagCartStatePatch(...args)
        },
        adapterSource: { getAdapter: () => window.SimpAITagCartAdapter || null },
        domSource: {
            getRoot: () => root,
            hasNodesLayer: () => !!nodesLayer,
            getNodeElement: id => nodesLayer?.querySelector('[data-node-id="' + cssEscape(id) + '"]') || null,
            getInlineHost: nodeEl => nodeEl?.querySelector('[data-tag-cart-inline-host]') || null,
            removeInlineReopenButtons: host => host?.querySelectorAll('.sai-tag-cart-inline-reopen').forEach(item => item.remove())
        },
        stateSource: {
            getActiveInlineTagCartNodeId: () => activeInlineTagCartNodeId,
            setActiveInlineTagCartNodeId: value => { activeInlineTagCartNodeId = value; }
        },
        languageSource: {
            t: (en, cn) => t(en, cn, { __lang: runtimeUiLang() })
        },
        runtimeSource: {
            ensureWorkbenchLazyRuntime,
            showToast,
            setTranslatedFieldValue,
            renderAll: (...args) => renderAll(...args),
            scheduleSave,
            renderEdges,
            renderNodes: (...args) => renderNodes(...args),
            renderMinimap: (...args) => renderMinimap(...args),
            renderInspector,
            renderStatus: (...args) => renderStatus(...args),
            pushHistoryBatch: (...args) => pushHistoryBatch(...args),
            nowIso: (...args) => nowIso(...args),
            syncTextOutputDom,
            refreshTextMergeDependents,
            nodeRenderKey: (...args) => nodeRenderKey(...args)
        }
    };
    const CANVAS_TAG_CART_CONTROLLER = typeof WORKBENCH_CANVAS_TAG_CART.createCanvasTagCartController === 'function'
        ? WORKBENCH_CANVAS_TAG_CART.createCanvasTagCartController({ tagCartSource: TAG_CART_CONTEXT_SOURCE })
        : {};

    const PRESET_MODEL_STATUS_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isPresetNode: (node) => !!node && ['preset', 'classic'].includes(node.type)
        },
        modelSource: {
            buildPresetModelStatusPatch: (...args) => buildPresetModelStatusPatch(...args),
            buildPresetModelCheckingStatus: (...args) => buildPresetModelCheckingStatus(...args),
            sendCanvasPresetModelStatusRequest: (...args) => sendCanvasPresetModelStatusRequest(...args),
            sendCanvasPresetModelDownloadsRequest: (...args) => sendCanvasPresetModelDownloadsRequest(...args),
            applyPresetModelStatus: (...args) => applyPresetModelStatus(...args)
        },
        uiSource: {
            openMainMissingModelListForPreset: (...args) => openMainMissingModelListForPreset(...args),
            renderAll: (...args) => renderAll(...args),
            mutate: (...args) => mutate(...args),
            showToast: (...args) => showToast(...args),
            translate: (en, cn) => t(en, cn)
        },
        timingSource: {
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
        },
        diagnosticsSource: {
            warn: (...args) => console.warn(...args)
        }
    };
    CANVAS_PRESET_MODEL_STATUS_CONTROLLER = typeof WORKBENCH_CANVAS_PRESET_MODEL_STATUS.createCanvasPresetModelStatusController === 'function'
        ? WORKBENCH_CANVAS_PRESET_MODEL_STATUS.createCanvasPresetModelStatusController({
            presetModelStatusSource: PRESET_MODEL_STATUS_CONTEXT_SOURCE
        })
        : {};
    const TOAST_CONTEXT_SOURCE = {
        domSource: {
            getToastElement: () => toastEl
        },
        timingSource: {
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined,
            clearTimeout: (...args) => typeof window.clearTimeout === 'function' ? window.clearTimeout(...args) : undefined
        }
    };
    CANVAS_TOAST_CONTROLLER = typeof WORKBENCH_CANVAS_TOAST.createCanvasToastController === 'function'
        ? WORKBENCH_CANVAS_TOAST.createCanvasToastController({
            toastSource: TOAST_CONTEXT_SOURCE
        })
        : {};
    const WILDCARDS_V2_CONTEXT_SOURCE = {
        domSource: {
            getDocument: () => document,
            getRoot: () => root,
            getOverlayHost: () => root || document.body
        },
        languageSource: {
            t
        },
        utilitySource: {
            escapeHtml: (...args) => escapeHtml(...args),
            detectTheme: (...args) => detectWorkbenchTheme(...args)
        },
        configSource: {
            getTargets: () => WILDCARDS_HELPER_TARGETS,
            getMethods: () => WILDCARDS_HELPER_METHODS,
            getSeedModes: () => WILDCARDS_HELPER_SEED_MODES
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isNodeLocked: (...args) => isNodeLocked(...args),
            buildWildcardsHelperStatePatch: (...args) => buildWildcardsHelperStatePatch(...args),
            wildcardHelperBuildTag: (...args) => wildcardHelperBuildTag(...args)
        },
        catalogSource: {
            refreshWildcardsCatalog: (...args) => refreshWildcardsCatalog(...args)
        },
        apiSource: {
            isPersonalWildcardsAvailable: () => typeof apiPersonalWildcards === 'function',
            personalWildcards: (...args) => typeof apiPersonalWildcards === 'function'
                ? apiPersonalWildcards(...args)
                : null
        },
        mutationSource: {
            updateNodeParam: (...args) => updateNodeParam(...args),
            addWildcardsHelperNode: (...args) => addWildcardsHelperNode(...args)
        },
        runtimeSource: {
            pushHistoryBatch: (...args) => pushHistoryBatch(...args),
            nowIso: (...args) => nowIso(...args),
            mutate
        },
        viewportSource: {
            viewportCenterWorld: (...args) => viewportCenterWorld(...args)
        },
        uiSource: {
            closeContextMenu: (...args) => closeContextMenu(...args)
        },
        userSource: {
            getWorkbenchUserContext: (...args) => getWorkbenchUserContext(...args)
        },
        formSource: {
            ensureFormNames: (...args) => ensureWorkbenchFormFieldNames(...args)
        },
        timingSource: {
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
        }
    };
    CANVAS_WILDCARDS_V2_CONTROLLER = typeof WORKBENCH_CANVAS_WILDCARDS_V2.createCanvasWildcardsV2Controller === 'function'
        ? WORKBENCH_CANVAS_WILDCARDS_V2.createCanvasWildcardsV2Controller({
            wildcardsV2Source: WILDCARDS_V2_CONTEXT_SOURCE
        })
        : {};
    const PROJECT_STORE_SOURCE = {
        languageSource: {
            t,
            getUiLang
        },
        utilitySource: {
            clamp: WORKBENCH_UTILS.clamp,
            sanitizeStoragePart: WORKBENCH_UTILS.sanitizeStoragePart,
            shortIdentity: WORKBENCH_UTILS.shortIdentity
        },
        timeSource: {
            nowIso: WORKBENCH_UTILS.nowIso
        },
        systemSource: {
            getSystemParams: () => window.simpleaiTopbarSystemParams
        },
        storageSource: {
            getStorage: () => typeof localStorage !== 'undefined' ? localStorage : null
        },
        registrySource: {
            defaultNodeSize
        },
        builderSource: {
            getProjectStoreOptions: () => projectStoreOptions()
        }
    };
    const WORKBENCH_PROJECT_STORE = typeof WORKBENCH_PROJECT.createCanvasProjectStoreController === 'function'
        ? WORKBENCH_PROJECT.createCanvasProjectStoreController({
            projectStoreSource: PROJECT_STORE_SOURCE
        })
        : WORKBENCH_PROJECT;
    const projectStoreBuildProjectStorageInfo = WORKBENCH_PROJECT_STORE.buildProjectStorageInfo;
    const projectStoreGetCanvasTitle = WORKBENCH_PROJECT_STORE.getCanvasTitle;
    const projectStoreGetStorageScope = WORKBENCH_PROJECT_STORE.getStorageScope;
    const projectStoreGetStorageKey = WORKBENCH_PROJECT_STORE.getStorageKey;
    const projectStoreCreateDefaultProject = WORKBENCH_PROJECT_STORE.createDefaultProject;
    const projectStoreSanitizeProject = WORKBENCH_PROJECT_STORE.sanitizeProject;
    const projectStoreLoadProject = WORKBENCH_PROJECT_STORE.loadProject;
    const projectStoreCompactProjectForStorage = WORKBENCH_PROJECT_STORE.compactProjectForStorage;
    const readImageInfo = WORKBENCH_ASSET_NODE_API.readImageInfo;
    const assetDisplaySrc = WORKBENCH_ASSET_NODE_API.assetDisplaySrc;
    const readAssetInfo = WORKBENCH_ASSET_NODE_API.readAssetInfo;
    const mediaAspectStyle = WORKBENCH_ASSET_NODE_API.mediaAspectStyle;
    const assetNodeMediaEditRange = WORKBENCH_ASSET_NODE_API.mediaEditRange;
    const serializeAssetForRun = WORKBENCH_ASSET_NODE_API.serializeAssetForRun;
    const serializeMaskForRun = WORKBENCH_ASSET_NODE_API.serializeMaskForRun;
    const assetNodeThumbSrc = WORKBENCH_ASSET_NODE_API.assetThumbSrc;
    const assetNodeSerializeAssetSourceForRun = WORKBENCH_ASSET_NODE_API.serializeAssetSourceForRun;
    const assetNodeFormatDuration = WORKBENCH_ASSET_NODE_API.formatDuration;
    const getMediaEditRange = (...args) => assetNodeMediaEditRange(...args);
    const formatAssetDuration = (...args) => assetNodeFormatDuration(...args);
    const readAssetSize = WORKBENCH_ASSET_NODE_API.readAssetSize;
    const getMediaViewerNodeImageSrc = WORKBENCH_MEDIA_VIEWERS.getNodeImageSrc;
    const mediaViewerNodeHasViewableImage = WORKBENCH_MEDIA_VIEWERS.nodeHasViewableImage;
    const getNodeImageSrc = getMediaViewerNodeImageSrc;
    const mediaViewerOpenImage = WORKBENCH_MEDIA_VIEWERS.openImageViewer;
    const mediaViewerOpenAsset = WORKBENCH_MEDIA_VIEWERS.openAssetViewer;
    const mediaViewerOpenNodeFullscreen = WORKBENCH_MEDIA_VIEWERS.openNodeMediaFullscreen;
    const mediaViewerOpenMedia = WORKBENCH_MEDIA_VIEWERS.openMediaViewer;
    const mediaViewerOpenCompare = WORKBENCH_MEDIA_VIEWERS.openCompareFullscreen;
    const imageNodeRenderNodeHtml = WORKBENCH_IMAGE_NODE.renderNodeHtml;
    const imageNodeRenderInspector = WORKBENCH_IMAGE_NODE.renderInspector;
    const videoNodeRenderNodeHtml = WORKBENCH_VIDEO_NODE.renderNodeHtml;
    const videoNodeRenderInspector = WORKBENCH_VIDEO_NODE.renderInspector;
    const audioNodeRenderNodeHtml = WORKBENCH_AUDIO_NODE.renderNodeHtml;
    const audioNodeRenderInspector = WORKBENCH_AUDIO_NODE.renderInspector;
    const nodeBrowserOpenSearchPanel = WORKBENCH_NODE_BROWSER.openNodeSearchPanel;
    const nodeBrowserOpenCanvasManual = WORKBENCH_NODE_BROWSER.openCanvasManual;
    const registryDefaultNodeSize = WORKBENCH_REGISTRY.defaultNodeSize;
    const registryClassicModes = WORKBENCH_REGISTRY.CLASSIC_MODES;
    const registryClassicOutpaintDirs = WORKBENCH_REGISTRY.CLASSIC_OUTPAINT_DIRS;
    const registryClassicInpaintMethods = WORKBENCH_REGISTRY.CLASSIC_INPAINT_METHODS;
    const registryClassicIpControlTypes = WORKBENCH_REGISTRY.CLASSIC_IP_CONTROL_TYPES;
    const registryClassicIpFilters = WORKBENCH_REGISTRY.CLASSIC_IP_FILTERS;
    const registryClassicUovMethodsFlux = WORKBENCH_REGISTRY.CLASSIC_UOV_METHODS_FLUX;
    const registryClassicUovMethods = WORKBENCH_REGISTRY.CLASSIC_UOV_METHODS;
    const registryClassicUovMethodsDefault = WORKBENCH_REGISTRY.CLASSIC_UOV_METHODS_DEFAULT;
    const registryClassicInpaintEngines = WORKBENCH_REGISTRY.CLASSIC_INPAINT_ENGINES;
    const registryClassicEnhanceUovProcessingOrder = WORKBENCH_REGISTRY.CLASSIC_ENHANCE_UOV_PROCESSING_ORDER;
    const registryClassicEnhanceUovPromptTypes = WORKBENCH_REGISTRY.CLASSIC_ENHANCE_UOV_PROMPT_TYPES;
    const registryClassicIpMaxImages = WORKBENCH_REGISTRY.CLASSIC_IP_MAX_IMAGES;
    const registryClassicEnhanceRegionDefaults = WORKBENCH_REGISTRY.CLASSIC_ENHANCE_REGION_DEFAULTS;
    const registryClassicEnhanceMaskModels = WORKBENCH_REGISTRY.CLASSIC_ENHANCE_MASK_MODELS;
    const registryClassicEnhanceClothCategories = WORKBENCH_REGISTRY.CLASSIC_ENHANCE_CLOTH_CATEGORIES;
    const registryClassicEnhanceSamModels = WORKBENCH_REGISTRY.CLASSIC_ENHANCE_SAM_MODELS;
    const viewportGetMinimapBounds = WORKBENCH_VIEWPORT.getMinimapBounds;
    const viewportHasCanvasOverflow = WORKBENCH_VIEWPORT.hasCanvasOverflow;
    const viewportGetVisibleWorldRect = WORKBENCH_VIEWPORT.getVisibleWorldRect;
    const viewportClientToWorld = WORKBENCH_VIEWPORT.clientToWorld;
    const viewportCenterWorldFromState = WORKBENCH_VIEWPORT.viewportCenterWorld;
    const viewportGetHandleCenterWorldPoint = WORKBENCH_VIEWPORT.getHandleCenterWorldPoint;
    const viewportGetNodeRenderWorldRect = WORKBENCH_VIEWPORT.getNodeRenderWorldRect;
    const viewportShouldRenderNodeInViewport = WORKBENCH_VIEWPORT.shouldRenderNodeInViewport;
    const viewportGetNodeRect = WORKBENCH_VIEWPORT.getNodeRect;
    const viewportRectsOverlap = WORKBENCH_VIEWPORT.rectsOverlap;
    const viewportRectContainsRect = WORKBENCH_VIEWPORT.rectContainsRect;
    const viewportSnapCanvasCoord = WORKBENCH_VIEWPORT.snapCanvasCoord;
    const viewportSnapCanvasSizeFromOrigin = WORKBENCH_VIEWPORT.snapCanvasSizeFromOrigin;
    const snapCanvasCoord = (value) => viewportSnapCanvasCoord(value, CANVAS_GRID_SIZE);
    const snapCanvasSizeFromOrigin = (origin, size, min, max) => (
        viewportSnapCanvasSizeFromOrigin(origin, size, min, max, CANVAS_GRID_SIZE)
    );
    const viewportFindOpenNodePosition = WORKBENCH_VIEWPORT.findOpenNodePosition;
    const viewportShouldRenderEdgeInViewport = WORKBENCH_VIEWPORT.shouldRenderEdgeInViewport;
    const viewportCurvePath = WORKBENCH_VIEWPORT.curvePath;
    const viewportGetEdgeSvgBounds = WORKBENCH_VIEWPORT.getEdgeSvgBounds;
    const schedulerBuildPlan = WORKBENCH_SCHEDULER.buildPlan;
    const schedulerRunPlan = WORKBENCH_SCHEDULER.runPlan;
    const schedulerBuildBlockedState = WORKBENCH_SCHEDULER.buildSchedulerBlockedState;
    const schedulerBuildWaitingState = WORKBENCH_SCHEDULER.buildSchedulerWaitingState;
    const schedulerBuildRunningState = WORKBENCH_SCHEDULER.buildSchedulerRunningState;
    const schedulerBuildResetPatch = WORKBENCH_SCHEDULER.buildSchedulerResetPatch;
    const schedulerBuildResumePatch = WORKBENCH_SCHEDULER.buildSchedulerResumePatch;
    const schedulerBuildStepStartPatch = WORKBENCH_SCHEDULER.buildSchedulerStepStartPatch;
    const schedulerBuildStepEndPatch = WORKBENCH_SCHEDULER.buildSchedulerStepEndPatch;
    const schedulerBuildErrorPatch = WORKBENCH_SCHEDULER.buildSchedulerErrorPatch;
    const schedulerBuildFinishedPatch = WORKBENCH_SCHEDULER.buildSchedulerFinishedPatch;
    const runQueueOpenPanel = WORKBENCH_RUN_QUEUE.openPanel;
    const runQueueClosePanel = WORKBENCH_RUN_QUEUE.closePanel;
    const runQueueRenderPanel = WORKBENCH_RUN_QUEUE.renderPanel;
    const runQueueHandleAction = WORKBENCH_RUN_QUEUE.handleAction;
    const runHistoryOpenPanel = WORKBENCH_RUN_HISTORY.openPanel;
    const runHistoryClosePanel = WORKBENCH_RUN_HISTORY.closePanel;
    const runHistoryRenderPanel = WORKBENCH_RUN_HISTORY.renderPanel;
    const runHistoryHandleAction = WORKBENCH_RUN_HISTORY.handleAction;
    const groupListOpenPanel = WORKBENCH_GROUP_LIST.openPanel;
    const projectManagerOpenPanel = WORKBENCH_PROJECT_MANAGER.openPanel;
    const assetManagerOpenPanel = WORKBENCH_ASSET_MANAGER.openPanel;
    const assetManagerCopyAssetPath = WORKBENCH_ASSET_MANAGER.copyAssetPath;
    const maskEditorReplaceNodeImage = WORKBENCH_MASK_EDITOR.replaceNodeImage;
    const maskEditorOpen = WORKBENCH_MASK_EDITOR.openMaskEditor;
    const utilsFormatBytes = WORKBENCH_UTILS.formatBytes;
    const timelineCreateNode = WORKBENCH_TIMELINE.createNode;
    const timelineDefaultParams = WORKBENCH_TIMELINE.DEFAULT_PARAMS;
    const timelineDefaultTracks = WORKBENCH_TIMELINE.DEFAULT_TRACKS;
    const timelineBuildNodeStatePatch = WORKBENCH_TIMELINE.buildTimelineNodeStatePatch;
    const timelineBuildClipMediaBoundsPatch = WORKBENCH_TIMELINE.buildTimelineClipMediaBoundsPatch;
    const timelineNormalizeNode = WORKBENCH_TIMELINE.normalizeNode;
    const timelineDuration = WORKBENCH_TIMELINE.timelineDuration;
    const timelineBuildTrackClipLayout = WORKBENCH_TIMELINE.buildTrackClipLayout;
    const timelineNormalizeKeyframes = WORKBENCH_TIMELINE.normalizeKeyframes;
    const timelineClipMaskDataUrl = WORKBENCH_TIMELINE.clipMaskDataUrl;
    const timelineClipAtTime = WORKBENCH_TIMELINE.clipAtTime;
    const timelineEffectiveClipIn = WORKBENCH_TIMELINE.effectiveClipIn;
    const timelineRenderPenOverlay = WORKBENCH_TIMELINE.renderPenOverlay;
    const timelineAssetMediaKind = WORKBENCH_TIMELINE.assetMediaKind;
    const timelineIsTimelineSource = WORKBENCH_TIMELINE.isTimelineSource;
    const timelineGetTimelineSourceAsset = WORKBENCH_TIMELINE.getTimelineSourceAsset || WORKBENCH_TIMELINE.sourceAsset;
    const timelineRenderNodeHtml = WORKBENCH_TIMELINE.renderNodeHtml;
    const timelineRenderInspector = WORKBENCH_TIMELINE.renderInspector;
    const timelineDefaultTrackId = WORKBENCH_TIMELINE.defaultTrackId;
    const timelineNextStartForTrack = WORKBENCH_TIMELINE.nextStartForTrack;
    const timelineCreateClipFromSource = WORKBENCH_TIMELINE.createClipFromSource;
    const timelineCreateFallbackClipFromSource = WORKBENCH_TIMELINE.createFallbackClipFromSource;
    const timelineBuildClipPatch = WORKBENCH_TIMELINE.buildTimelineClipPatch;
    const timelineBuildClipMaskPatch = WORKBENCH_TIMELINE.buildTimelineClipMaskPatch;
    const timelineBuildClipMaskPointPatch = WORKBENCH_TIMELINE.buildTimelineClipMaskPointPatch;
    const timelineBuildClipAppendPatch = WORKBENCH_TIMELINE.buildTimelineClipAppendPatch;
    const timelineBuildParamsPatch = WORKBENCH_TIMELINE.buildTimelineParamsPatch;
    const timelineBuildSourcePatch = WORKBENCH_TIMELINE.buildTimelineSourcePatch;
    const timelineBuildDebugPatch = WORKBENCH_TIMELINE.buildTimelineDebugPatch;
    const timelineBuildParamUpdatePatch = WORKBENCH_TIMELINE.buildTimelineParamUpdatePatch;
    const timelineBuildClipParamUpdatePatch = WORKBENCH_TIMELINE.buildTimelineClipParamUpdatePatch;
    const timelineBuildTracksPatch = WORKBENCH_TIMELINE.buildTimelineTracksPatch;
    const timelineBuildKeyframesPatch = WORKBENCH_TIMELINE.buildTimelineKeyframesPatch;
    const timelineBuildClipResetPatch = WORKBENCH_TIMELINE.buildTimelineClipResetPatch;
    const timelineBuildClipDeletePatch = WORKBENCH_TIMELINE.buildTimelineClipDeletePatch;
    const timelineSerializeTimeline = WORKBENCH_TIMELINE.serializeTimeline;
    const timelineSerializeTimelineRenderPayload = WORKBENCH_TIMELINE.serializeTimelineRenderPayload;
    const timelineClipLayerGeometry = WORKBENCH_TIMELINE.clipLayerGeometry;
    const timelineClipEnd = WORKBENCH_TIMELINE.clipEnd;
    const timelineTrackCompatible = WORKBENCH_TIMELINE.trackCompatible;
    const timelineClipAvailableDurationImpl = WORKBENCH_TIMELINE.clipAvailableDuration;
    const timelineEnforceClipMediaBoundsImpl = WORKBENCH_TIMELINE.enforceClipMediaBounds;
    const timelineSnapTimeImpl = WORKBENCH_TIMELINE.snapTime;
    const snapTimelineTime = (...args) => typeof timelineSnapTimeImpl === 'function'
        ? timelineSnapTimeImpl(...args, { clamp })
        : args[1];
    const timelineClipAvailableDuration = (node, clip) => typeof timelineClipAvailableDurationImpl === 'function'
        ? timelineClipAvailableDurationImpl(node, clip, {
            getNode: (id) => getNode(id),
            getTimelineSourceAsset: (source) => getTimelineSourceAsset(source),
            getMediaEditRange: (asset) => getMediaEditRange(asset),
            buildTimelineClipMediaBoundsPatch: timelineBuildClipMediaBoundsPatch,
            clamp
        })
        : Infinity;
    const enforceTimelineClipMediaBounds = (node, clip) => typeof timelineEnforceClipMediaBoundsImpl === 'function'
        ? timelineEnforceClipMediaBoundsImpl(node, clip, {
            getNode: (id) => getNode(id),
            getTimelineSourceAsset: (source) => getTimelineSourceAsset(source),
            getMediaEditRange: (asset) => getMediaEditRange(asset),
            clamp
        })
        : false;
    const timelineSelectedVisualClip = WORKBENCH_TIMELINE.selectedVisualClip;
    const timelineKeyframeTime = WORKBENCH_TIMELINE.keyframeTime;
    const timelineKeyframeIndexAt = WORKBENCH_TIMELINE.keyframeIndexAt;
    const timelineKeyframeValuesAtPlayhead = WORKBENCH_TIMELINE.keyframeValuesAtPlayhead;
    const timelineSyncClipTransformKeyframeAtPlayhead = WORKBENCH_TIMELINE.syncClipTransformKeyframeAtPlayhead;
    const syncTimelineClipTransformKeyframeAtPlayhead = (...args) => typeof timelineSyncClipTransformKeyframeAtPlayhead === 'function'
        ? timelineSyncClipTransformKeyframeAtPlayhead(...args, {
            uid,
            buildTimelineKeyframesPatch: timelineBuildKeyframesPatch
        })
        : false;
    const apiBuildPresetRunNode = WORKBENCH_API.buildPresetRunNode;
    const apiDryRun = WORKBENCH_API.dryRun;
    const apiRunNode = WORKBENCH_API.runNode;
    const apiPollRun = WORKBENCH_API.pollRun;
    const apiControlRun = WORKBENCH_API.controlRun;
    const apiSaveProject = WORKBENCH_API.saveProject;
    const apiLoadProject = WORKBENCH_API.loadProject;
    const apiListProjects = WORKBENCH_API.listProjects;
    const apiDeleteProject = WORKBENCH_API.deleteProject;
    const apiClearProject = WORKBENCH_API.clearProject;
    const apiSaveTemplate = WORKBENCH_API.saveTemplate;
    const apiListTemplates = WORKBENCH_API.listTemplates;
    const apiLoadTemplate = WORKBENCH_API.loadTemplate;
    const apiDeleteTemplate = WORKBENCH_API.deleteTemplate;
    const apiQwenTtsRun = WORKBENCH_API.qwenTtsRun;
    const apiQwenTtsPoll = WORKBENCH_API.qwenTtsPoll;
    const apiQwenTtsControl = WORKBENCH_API.qwenTtsControl;
    const apiQwenTtsPresets = WORKBENCH_API.qwenTtsPresets;
    const apiModelCatalog = WORKBENCH_API.modelCatalog;
    const apiPresetModelStatus = WORKBENCH_API.presetModelStatus;
    const apiPresetModelDownloads = WORKBENCH_API.presetModelDownloads;
    const apiVlmModelStatus = WORKBENCH_API.vlmModelStatus;
    const apiVlmModelDownloads = WORKBENCH_API.vlmModelDownloads;
    const apiVlmModelDownloadStatus = WORKBENCH_API.vlmModelDownloadStatus;
    const apiVlmModelDownloadCancel = WORKBENCH_API.vlmModelDownloadCancel;
    const apiCustomLlmModels = WORKBENCH_API.customLlmModels;
    const apiVlmSystemPromptTemplates = WORKBENCH_API.vlmSystemPromptTemplates;
    const apiListAssets = WORKBENCH_API.listAssets;
    const apiDeleteAssets = WORKBENCH_API.deleteAssets;
    const apiMaterializeAsset = WORKBENCH_API.materializeAsset;
    const apiGenerateMask = WORKBENCH_API.generateMask;
    const apiGenerateCameraMotionReference = WORKBENCH_API.generateCameraMotionReference;
    const apiGenerateSam3VideoMask = WORKBENCH_API.generateSam3VideoMask;
    const apiCancelSam3VideoMask = WORKBENCH_API.cancelSam3VideoMask;
    const apiNormalizeSam3MaskVideo = WORKBENCH_API.normalizeSam3MaskVideo;
    const apiRenderTimeline = WORKBENCH_API.renderTimeline;
    const apiRenderTimelineFrame = WORKBENCH_API.renderTimelineFrame;
    const apiWd14Tag = WORKBENCH_API.wd14Tag;
    const apiTranslateRun = WORKBENCH_API.translateRun;
    const apiTranslatePoll = WORKBENCH_API.translatePoll;
    const apiDanbooruAutocomplete = WORKBENCH_API.danbooruAutocomplete;
    const apiDanbooruTagLookup = WORKBENCH_API.danbooruTagLookup;
    const apiMediaGallery = WORKBENCH_API.mediaGallery;
    const apiMediaGalleryDelete = WORKBENCH_API.mediaGalleryDelete;
    const apiPersonalWildcards = WORKBENCH_API.personalWildcards;
    const apiPresetCatalog = WORKBENCH_API.presetCatalog;
    const apiPromptPreflight = WORKBENCH_API.promptPreflight;
    const apiVlmCancel = WORKBENCH_API.vlmCancel;
    const apiVlmRun = WORKBENCH_API.vlmRun;
    const apiVlmUnload = WORKBENCH_API.vlmUnload;
    const apiWildcardsCatalog = WORKBENCH_API.wildcardsCatalog;
    const apiWildcardsPreview = WORKBENCH_API.wildcardsPreview;
    const apiXyzAxisOptions = WORKBENCH_API.xyzAxisOptions;
    const apiXyzPreview = WORKBENCH_API.xyzPreview;
    const BACKEND_API_FACADE = {
        dryRun: apiDryRun,
        runNode: apiRunNode,
        pollRun: apiPollRun,
        controlRun: apiControlRun,
        saveProject: apiSaveProject,
        loadProject: apiLoadProject,
        listProjects: apiListProjects,
        deleteProject: apiDeleteProject,
        clearProject: apiClearProject,
        qwenTtsRun: apiQwenTtsRun,
        qwenTtsPoll: apiQwenTtsPoll,
        qwenTtsControl: apiQwenTtsControl,
        qwenTtsPresets: apiQwenTtsPresets,
        modelCatalog: apiModelCatalog,
        presetModelStatus: apiPresetModelStatus,
        presetModelDownloads: apiPresetModelDownloads,
        vlmModelStatus: apiVlmModelStatus,
        vlmModelDownloads: apiVlmModelDownloads,
        vlmModelDownloadStatus: apiVlmModelDownloadStatus,
        vlmModelDownloadCancel: apiVlmModelDownloadCancel,
        customLlmModels: apiCustomLlmModels,
        vlmSystemPromptTemplates: apiVlmSystemPromptTemplates,
        listAssets: apiListAssets,
        deleteAssets: apiDeleteAssets,
        materializeAsset: apiMaterializeAsset,
        generateMask: apiGenerateMask,
        renderTimeline: apiRenderTimeline,
        renderTimelineFrame: apiRenderTimelineFrame,
        wd14Tag: apiWd14Tag,
        translateRun: apiTranslateRun,
        translatePoll: apiTranslatePoll
    };
    const compareNodeAddNode = WORKBENCH_COMPARE_NODE.addNode;
    const compareNodeBuildStatePatch = WORKBENCH_COMPARE_NODE.buildCompareStatePatch;
    const compareNodeSourceSignature = WORKBENCH_COMPARE_NODE.sourceSignature;
    const compareNodeRenderStageHtml = WORKBENCH_COMPARE_NODE.renderStageHtml;
    const compareNodeRenderControls = WORKBENCH_COMPARE_NODE.renderControls;
    const compareNodeRenderNodeHtml = WORKBENCH_COMPARE_NODE.renderNodeHtml;
    const compareNodeRenderInspector = WORKBENCH_COMPARE_NODE.renderInspector;
    const sam3AddNode = WORKBENCH_SAM3_VIDEO_MASK_NODE.addNode;
    const sam3IsSource = WORKBENCH_SAM3_VIDEO_MASK_NODE.isSource;
    const sam3OpenPointEditor = WORKBENCH_SAM3_VIDEO_MASK_NODE.openPointEditor;
    const sam3RenderInspector = WORKBENCH_SAM3_VIDEO_MASK_NODE.renderInspector;
    const sam3RenderNodeHtml = WORKBENCH_SAM3_VIDEO_MASK_NODE.renderNodeHtml;
    const sam3RunNode = WORKBENCH_SAM3_VIDEO_MASK_NODE.runNode;
    const sam3StopNode = WORKBENCH_SAM3_VIDEO_MASK_NODE.stopNode;
    const sam3UnloadMaskForNode = WORKBENCH_SAM3_VIDEO_MASK_NODE.unloadMaskForNode;
    const sam3UpdateParam = WORKBENCH_SAM3_VIDEO_MASK_NODE.updateParam;
    const sam3UploadMaskForNode = WORKBENCH_SAM3_VIDEO_MASK_NODE.uploadMaskForNode;
    const directorTimelineAddNode = WORKBENCH_DIRECTOR_TIMELINE_NODE.addNode;
    const directorTimelineIsNode = WORKBENCH_DIRECTOR_TIMELINE_NODE.isNode;
    const directorTimelineMediaSourceKind = WORKBENCH_DIRECTOR_TIMELINE_NODE.mediaSourceKind;
    const directorTimelineMediaSourceForSlot = WORKBENCH_DIRECTOR_TIMELINE_NODE.isMediaSourceForSlot;
    const directorTimelineNormalizeTimeline = WORKBENCH_DIRECTOR_TIMELINE_NODE.normalizeTimeline;
    const directorTimelinePromptOverrideForTimeline = WORKBENCH_DIRECTOR_TIMELINE_NODE.promptOverrideForTimeline;
    const directorTimelineRenderInspector = WORKBENCH_DIRECTOR_TIMELINE_NODE.renderInspector;
    const directorTimelineRenderNodeHtml = WORKBENCH_DIRECTOR_TIMELINE_NODE.renderNodeHtml;
    const directorTimelineSerializeForRun = WORKBENCH_DIRECTOR_TIMELINE_NODE.serializeForRun;
    const directorTimelineMediaSlotSpecs = WORKBENCH_DIRECTOR_TIMELINE_NODE.MEDIA_SLOT_SPECS;
    const directorTimelineMediaKindGroups = WORKBENCH_DIRECTOR_TIMELINE_NODE.MEDIA_KIND_GROUPS;
    const directorPreviousSegmentVideoRef = WORKBENCH_DIRECTOR_TIMELINE_NODE.PREVIOUS_SEGMENT_VIDEO_REF;
    const directorPreviousSegmentImageRef = WORKBENCH_DIRECTOR_TIMELINE_NODE.PREVIOUS_SEGMENT_IMAGE_REF;
    const cameraMotionAddNode = WORKBENCH_CAMERA_MOTION_NODE.addNode;
    const cameraMotionRenderInspector = WORKBENCH_CAMERA_MOTION_NODE.renderInspector;
    const cameraMotionRenderNodeHtml = WORKBENCH_CAMERA_MOTION_NODE.renderNodeHtml;
    const cameraMotionRunNode = WORKBENCH_CAMERA_MOTION_NODE.runNode;
    const cameraMotionUpdateParam = WORKBENCH_CAMERA_MOTION_NODE.updateParam;
    const cameraMotionClearNode = WORKBENCH_CAMERA_MOTION_NODE.clearNode;
    const poseStudioAddNode = WORKBENCH_POSE_STUDIO_NODE.addNode;
    const poseStudioIsSource = WORKBENCH_POSE_STUDIO_NODE.isSource;
    const poseStudioOpenEditor = WORKBENCH_POSE_STUDIO_NODE.openEditor;
    const poseStudioRenderInspector = WORKBENCH_POSE_STUDIO_NODE.renderInspector;
    const poseStudioRenderNodeHtml = WORKBENCH_POSE_STUDIO_NODE.renderNodeHtml;
    const gaussianStudioAddNode = WORKBENCH_GAUSSIAN_STUDIO_NODE.addNode;
    const gaussianStudioIsSource = WORKBENCH_GAUSSIAN_STUDIO_NODE.isSource;
    const gaussianStudioOpenEditor = WORKBENCH_GAUSSIAN_STUDIO_NODE.openEditor;
    const gaussianStudioRenderInspector = WORKBENCH_GAUSSIAN_STUDIO_NODE.renderInspector;
    const gaussianStudioRenderNodeHtml = WORKBENCH_GAUSSIAN_STUDIO_NODE.renderNodeHtml;
    const livePortraitAddNode = WORKBENCH_LIVEPORTRAIT_EXPRESSION_NODE.addNode;
    const livePortraitIsSource = WORKBENCH_LIVEPORTRAIT_EXPRESSION_NODE.isSource;
    const livePortraitOpenEditor = WORKBENCH_LIVEPORTRAIT_EXPRESSION_NODE.openEditor;
    const livePortraitRenderInspector = WORKBENCH_LIVEPORTRAIT_EXPRESSION_NODE.renderInspector;
    const livePortraitRenderNodeHtml = WORKBENCH_LIVEPORTRAIT_EXPRESSION_NODE.renderNodeHtml;
    const qwenTtsModeLabelForMode = WORKBENCH_QWEN_TTS_NODE.modeLabel;
    const qwenTtsIsNode = WORKBENCH_QWEN_TTS_NODE.isNode;
    const qwenTtsIsAudioSource = WORKBENCH_QWEN_TTS_NODE.isAudioSource;
    const qwenTtsModeFromNode = WORKBENCH_QWEN_TTS_NODE.modeFromNode;
    const qwenTtsAudioInputSlotsForNode = WORKBENCH_QWEN_TTS_NODE.audioInputSlotsForNode;
    const qwenTtsStylePresetInstruction = WORKBENCH_QWEN_TTS_NODE.stylePresetInstruction;
    const qwenTtsAddNode = WORKBENCH_QWEN_TTS_NODE.addNode;
    const qwenTtsRenderInspector = WORKBENCH_QWEN_TTS_NODE.renderInspector;
    const qwenTtsRenderNodeHtml = WORKBENCH_QWEN_TTS_NODE.renderNodeHtml;
    const styleSelectorAddNode = WORKBENCH_STYLE_SELECTOR_NODE.addNode;
    const styleSelectorGetPrompt = WORKBENCH_STYLE_SELECTOR_NODE.getPrompt;
    const styleSelectorRenderInspector = WORKBENCH_STYLE_SELECTOR_NODE.renderInspector;
    const styleSelectorRenderNodeHtml = WORKBENCH_STYLE_SELECTOR_NODE.renderNodeHtml;
    const styleSelectorSetSelectedStyle = WORKBENCH_STYLE_SELECTOR_NODE.setSelectedStyle;
    const styleSelectorRunPresetNodeFromUi = WORKBENCH_STYLE_SELECTOR_NODE.runPresetNodeFromUi;
    const styleSelectorRunStyleTransferPresetNode = WORKBENCH_STYLE_SELECTOR_NODE.runStyleTransferPresetNode;
    const styleSelectorRunTargetPreset = WORKBENCH_STYLE_SELECTOR_NODE.runStyleSelectorTargetPreset;
    const styleSelectorSelectStyle = WORKBENCH_STYLE_SELECTOR_NODE.selectStyle;
    const styleSelectorApplyToPreset = WORKBENCH_STYLE_SELECTOR_NODE.applyStyleSelectorToPreset;
    const styleSelectorFindForPreset = WORKBENCH_STYLE_SELECTOR_NODE.findStyleSelectorForPreset;
    const styleSelectorLinkedPresetForNode = WORKBENCH_STYLE_SELECTOR_NODE.styleSelectorLinkedPreset;
    const styleSelectorLinkToPreset = WORKBENCH_STYLE_SELECTOR_NODE.linkStyleSelectorToPreset;
    const styleSelectorHandleCardClick = WORKBENCH_STYLE_SELECTOR_NODE.handleCardClick;
    const styleSelectorStyleByName = WORKBENCH_STYLE_SELECTOR_NODE.styleByName;
    const styleSelectorSelectedStyle = WORKBENCH_STYLE_SELECTOR_NODE.selectedStyle;
    const styleSelectorFilterNodeDom = WORKBENCH_STYLE_SELECTOR_NODE.filterNodeDom;
    const styleSelectorHandleSearchInput = WORKBENCH_STYLE_SELECTOR_NODE.handleSearchInput;
    const setCanvasAgentRunInfo = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.setCanvasAgentRunInfo?.(...args);
    const clearCanvasAgentRunInfo = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.clearCanvasAgentRunInfo?.(...args);
    const resetCanvasAgentRunInfo = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.resetCanvasAgentRunInfo?.(...args);
    const renderCanvasAgentPanel = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.renderCanvasAgentPanel?.(...args);
    const positionCanvasAgentPanel = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.positionCanvasAgentPanel?.(...args);
    const setCanvasAgentMessage = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.setCanvasAgentMessage?.(...args);
    const resolveCanvasAgentDecision = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.resolveCanvasAgentDecision?.(...args);
    const askCanvasAgentDecision = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.askCanvasAgentDecision?.(...args);
    const syncCanvasAgentDecisionPromptFromPreset = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.syncCanvasAgentDecisionPromptFromPreset?.(...args);
    const handleCanvasAgentDecisionFieldInput = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.handleCanvasAgentDecisionFieldInput?.(...args);
    const handleCanvasAgentPanelAction = (...args) => CANVAS_AGENT_PANEL_CONTROLLER?.handleCanvasAgentPanelAction?.(...args);
    const runCanvasAgentTextRefine = async (...args) => CANVAS_AGENT_TEXT_WORKFLOW_CONTROLLER?.runCanvasAgentTextRefine?.(...args);
    const canvasAgentCustomParamsFromSettings = (...args) => CANVAS_AGENT_SETTINGS_CONTROLLER?.canvasAgentCustomParamsFromSettings?.(...args) || {};
    const getCanvasAgentCustomRuntimeParams = (...args) => CANVAS_AGENT_SETTINGS_CONTROLLER?.getCanvasAgentCustomRuntimeParams?.(...args) || {};
    const setCanvasAgentResolutionPatchBeforeUi = (...args) => CANVAS_AGENT_SETTINGS_CONTROLLER?.setCanvasAgentResolutionPatch?.(...args);
    const setCanvasAgentResolutionOpenBeforeUi = (...args) => CANVAS_AGENT_SETTINGS_CONTROLLER?.setCanvasAgentResolutionOpen?.(...args);
    const handleCanvasAgentModelModeInputBeforeUi = (...args) => CANVAS_AGENT_SETTINGS_CONTROLLER?.handleCanvasAgentModelModeInput?.(...args);
    const getPromptTextSourceNode = (...args) => CANVAS_AGENT_TEXT_NODE_CONTROLLER?.getPromptTextSourceNode?.(...args) || null;
    const getTextNodeInputSource = (...args) => CANVAS_AGENT_TEXT_NODE_CONTROLLER?.getTextNodeInputSource?.(...args) || null;
    const wildcardHelperBuildTag = (...args) => CANVAS_AGENT_TEXT_NODE_CONTROLLER?.wildcardHelperBuildTag?.(...args) || '';
    const textMergeInputSlots = (...args) => CANVAS_AGENT_TEXT_NODE_CONTROLLER?.textMergeInputSlots?.(...args) || [];
    const getTextMergeInputSource = (...args) => CANVAS_AGENT_TEXT_NODE_CONTROLLER?.getTextMergeInputSource?.(...args) || null;
    const decodeTextMergeSeparator = (...args) => CANVAS_AGENT_TEXT_NODE_CONTROLLER?.decodeTextMergeSeparator?.(...args) || '';
    const getTextMergeOutput = (...args) => CANVAS_AGENT_TEXT_NODE_CONTROLLER?.getTextMergeOutput?.(...args) || '';
    const isTextOutputNode = (...args) => !!CANVAS_AGENT_TEXT_NODE_CONTROLLER?.isTextOutputNode?.(...args);
    const getNodeTextOutput = (...args) => CANVAS_AGENT_TEXT_NODE_CONTROLLER?.getNodeTextOutput?.(...args) || '';
    const wouldCreateTextCycle = (...args) => !!CANVAS_AGENT_TEXT_NODE_CONTROLLER?.wouldCreateTextCycle?.(...args);
    const cancelOutpaintEdgeDrag = (...args) => CANVAS_OUTPAINT_CONTROLLER?.cancelOutpaintEdgeDrag?.(...args);
    const showOutpaintOverlay = (...args) => CANVAS_OUTPAINT_CONTROLLER?.showOutpaintOverlay?.(...args);
    const hideOutpaintOverlay = (...args) => CANVAS_OUTPAINT_CONTROLLER?.hideOutpaintOverlay?.(...args);
    const renderOutpaintControlPanel = (...args) => CANVAS_OUTPAINT_CONTROLLER?.renderOutpaintControlPanel?.(...args) || '';
    const ensureOutpaintOverlayMatchesAgentTarget = (...args) => CANVAS_OUTPAINT_CONTROLLER?.ensureOutpaintOverlayMatchesAgentTarget?.(...args);
    const getOutpaintTargetNode = (...args) => CANVAS_OUTPAINT_CONTROLLER?.getOutpaintTargetNode?.(...args) || null;
    const getOutpaintMediaGeometry = (...args) => CANVAS_OUTPAINT_CONTROLLER?.getOutpaintMediaGeometry?.(...args) || null;
    const getOutpaintMediaSize = (...args) => CANVAS_OUTPAINT_CONTROLLER?.getOutpaintMediaSize?.(...args) || null;
    const syncOutpaintOverlayPosition = (...args) => CANVAS_OUTPAINT_CONTROLLER?.syncOutpaintOverlayPosition?.(...args);
    const requestCanvasAgentVlmInstructionPlan = (...args) => CANVAS_AGENT_VLM_INSTRUCTION_CONTROLLER?.requestCanvasAgentVlmInstructionPlan?.(...args)
        || Promise.resolve({ ok: false, error: t('VLM planner is unavailable.', 'VLM 计划模块不可用。') });
    const invokeCanvasAgentPromptRewrite = (...args) => CANVAS_AGENT_PROMPT_REWRITE_CONTROLLER?.rewriteCanvasAgentPromptWithLlm?.(...args);
    const WILDCARDS_HELPER_TARGETS = ['Array (batch)', 'Single in prompt'];
    const WILDCARDS_HELPER_METHODS = ['Random Select', 'In order'];
    const WILDCARDS_HELPER_SEED_MODES = ['Fixed seed', 'Random seed'];
    const PRESET_CONFIG_KINDS = ['models', 'styles', 'resolution', 'advanced'];
    const STYLE_CHOICES_FALLBACK = [
        'Fooocus V2',
        'Random Style',
        'Fooocus Enhance',
        'Fooocus Sharp',
        'Fooocus Masterpiece',
        'Fooocus Photograph',
        'Fooocus Cinematic',
        'Fooocus Negative',
        'Fooocus Pony'
    ];
    const ADVANCED_SAMPLER_CHOICES = [
        'euler', 'euler_ancestral', 'heun', 'dpm_2', 'dpm_2_ancestral', 'lms',
        'dpmpp_2s_ancestral', 'dpmpp_sde', 'dpmpp_sde_gpu', 'dpmpp_2m',
        'dpmpp_2m_sde', 'dpmpp_2m_sde_gpu', 'dpmpp_3m_sde', 'dpmpp_3m_sde_gpu',
        'ddim', 'uni_pc', 'uni_pc_bh2', 'er_sde'
    ];
    const ADVANCED_SCHEDULER_CHOICES = [
        'normal', 'karras', 'exponential', 'sgm_uniform', 'simple',
        'ddim_uniform', 'beta', 'linear_quadratic', 'kl_optimal',
        'bong_tangent', 'beta57'
    ];
    const CANVAS_AGENT_PRESET_STATUS_CACHE_TTL_MS = canvasAgentPresetStatusCacheTtlMs || 5 * 60 * 1000;
    const CANVAS_AGENT_PRESET_STATUS_SCAN_CONCURRENCY = canvasAgentPresetStatusScanConcurrency || 4;
    const VLM_MODEL_STATUS_CACHE_TTL_MS = vlmModelStatusCacheTtlMs || 5 * 60 * 1000;
    const TEMPLATE_LIBRARY_MANIFEST_PATH = workbenchStaticFilePath('javascript/canvas_workbench/templates/template-library.json');
    const TEMPLATE_PREVIEW_ROOT = 'javascript/canvas_workbench/templates/previews/';
    const CANVAS_AGENT_MAX_IMAGE_REFERENCES = canvasAgentMaxImageReferences || 9;
    const CANVAS_AGENT_MAX_EXTRA_IMAGE_REFERENCES = canvasAgentMaxExtraImageReferences || 8;
    const CANVAS_AGENT_MAX_VIDEO_REFERENCES = canvasAgentMaxVideoReferences || 3;
    const CANVAS_AGENT_MAX_AUDIO_REFERENCES = canvasAgentMaxAudioReferences || 3;
    const CANVAS_AGENT_MAX_TEXT_REFERENCES = canvasAgentMaxTextReferences || 4;
    const CANVAS_AGENT_ASPECT_OPTIONS = canvasAgentAspectOptions || [
        { key: 'auto', label: t('Auto', '自适应'), icon: 'fa-image', value: '' },
        { key: '1:1', label: '1:1', value: '1024*1024' },
        { key: '16:9', label: '16:9', value: '1344*768' },
        { key: '9:16', label: '9:16', value: '768*1344' },
        { key: '4:3', label: '4:3', value: '1152*864' },
        { key: '3:4', label: '3:4', value: '864*1152' },
        { key: '2:3', label: '2:3', value: '832*1216' },
        { key: '3:2', label: '3:2', value: '1216*832' },
        { key: '7:4', label: '7:4', value: '1344*768' },
        { key: '4:7', label: '4:7', value: '768*1344' }
    ];
    const WORKBENCH_RESOLUTION_RATIO_FALLBACKS = {
        Scene: [],
        SDXL: [
            '704*1408', '704*1344', '720*1280', '768*1344', '768*1280', '832*1216', '832*1152', '864*1152',
            '896*1152', '896*1088', '960*1088', '960*1024', '1024*1024', '1024*960',
            '1088*960', '1088*896', '1152*896', '1152*864', '1152*832', '1216*832', '1280*768',
            '1280*720', '1344*768', '1344*704', '1408*704'
        ],
        Common: [
            '576*1344', '768*1152', '896*1152', '768*1280', '960*1280',
            '1024*1024', '1024*1280', '1280*1280', '1280*1024',
            '1280*960', '1280*768', '1152*896', '1152*768', '1344*576'
        ],
        Flux: [
            '576*1344', '768*1152', '896*1152', '720*1280', '768*1280', '960*1280',
            '1024*1024', '1024*1280', '1280*1280', '1280*1024',
            '1280*960', '1280*768', '1280*720', '1152*896', '1152*768', '1344*576'
        ],
        Wan: [
            '576*704', '592*688', '608*672', '640*640', '672*608', '688*592', '704*576',
            '768*896', '784*880', '800*864', '832*832', '864*800', '880*784', '896*768',
            '960*1088', '976*1072', '992*1056', '1024*1024', '1056*992', '1072*976', '1088*960'
        ]
    };
    const CANVAS_AGENT_DEFAULT_SETTINGS = {
        enabled: true,
        executionRoute: 'programmatic',
        promptStrategy: 'ask',
        rewriteModel: VLM_VERSION_CHOICES[0] || 'Qwen3.5-9B-abliterated-Q4_K_M',
        videoFrames: 25,
        t2iPresetMode: 'auto',
        t2iPreset: '',
        editPresetMode: 'auto',
        editPreset: '',
        i2vPresetMode: 'auto',
        i2vPreset: '',
        t2vPresetMode: 'auto',
        t2vPreset: '',
        videoEditPresetMode: 'auto',
        videoEditPreset: '',
        audioPresetMode: 'auto',
        audioPreset: '',
        outpaintPreset: 'OneKey-Outpaint',
        erasePreset: 'QwenEraser',
        replacePreset: 'Swap+',
        upscalePresetMode: 'uov_auto',
        upscalePreset: '',
        videoOutpaintPreset: CANVAS_AGENT_DEFAULT_VIDEO_OUTPAINT_PRESET,
        videoErasePreset: CANVAS_AGENT_DEFAULT_VIDEO_ERASE_PRESET,
        videoReplacePreset: CANVAS_AGENT_DEFAULT_VIDEO_REPLACE_PRESET,
        videoFaceSwapPreset: CANVAS_AGENT_DEFAULT_VIDEO_FACE_SWAP_PRESET,
        videoFaceSwapTheme: CANVAS_AGENT_DEFAULT_VIDEO_FACE_SWAP_THEME,
        videoMotionTransferPreset: CANVAS_AGENT_DEFAULT_VIDEO_MOTION_TRANSFER_PRESET,
        videoMotionTransferTheme: CANVAS_AGENT_DEFAULT_VIDEO_MOTION_TRANSFER_THEME,
        videoEditQuickToolDefaultMigrated: false,
        videoUpscalePreset: CANVAS_AGENT_DEFAULT_VIDEO_UPSCALE_PRESET,
        outpaintUpPercent: 15,
        outpaintDownPercent: 15,
        outpaintLeftPercent: 15,
        outpaintRightPercent: 15,
        customApiCollapsed: true,
        customProvider: 'openai',
        customApiName: 'OpenAI',
        customApiFormat: 'openai_compatible',
        customBaseUrl: 'https://api.openai.com/v1',
        customModel: '',
        customSupportsImages: true,
        attachPaused: true,
        minimized: false,
        panelPosition: null,
        bubblePosition: null,
        allowPresetInstructionOverride: true
    };
    const VLM_CUSTOM_API_PROVIDERS = vlmCustomApiProviders || [
        { key: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'google', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', format: 'openai_compatible', supportsImages: true },
        { key: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', format: 'openai_compatible', supportsImages: false },
        { key: 'xai', label: 'xAI', baseUrl: 'https://api.x.ai/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'zai', label: 'Z.ai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', format: 'openai_compatible', supportsImages: true },
        { key: 'minimax_global', label: 'MiniMax Global', baseUrl: 'https://api.minimax.io/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'kimi_global', label: 'Kimi Global', baseUrl: 'https://api.moonshot.ai/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'byteplus', label: 'BytePlus', baseUrl: 'https://ark.ap-southeast.bytepluses.com/api/v3', format: 'openai_compatible', supportsImages: true },
        { key: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'novita', label: 'Novita', baseUrl: 'https://api.novita.ai/v3/openai', format: 'openai_compatible', supportsImages: true },
        { key: 'siliconflow', label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'alibaba', label: '阿里云 DashScope', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'tencent', label: '腾讯云', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'ppio', label: 'PPIO', baseUrl: 'https://api.ppinfra.com/v3/openai', format: 'openai_compatible', supportsImages: true },
        { key: 'ollama_cloud', label: 'Ollama Cloud', baseUrl: 'https://ollama.com/v1', format: 'openai_compatible', supportsImages: true },
        { key: 'custom', label: 'Custom OpenAI API', baseUrl: '', format: 'openai_compatible', supportsImages: true }
    ];
    const CANVAS_VLM_CUSTOM_API_PROFILES = typeof WORKBENCH_CANVAS_VLM_CUSTOM_API_PROFILES.createCanvasVlmCustomApiProfilesController === 'function'
        ? WORKBENCH_CANVAS_VLM_CUSTOM_API_PROFILES.createCanvasVlmCustomApiProfilesController({
            vlmCustomApiProfilesSource: {
                getProviders: () => VLM_CUSTOM_API_PROVIDERS,
                getStorage: () => localStorage,
                getStorageKey: () => VLM_CUSTOM_API_STORAGE_KEY
            }
        })
        : {};
    const DEFAULT_SETTINGS = Object.assign({
        __lang: runtimeUiLang()
    }, projectDefaultSettings || {
        grid: true,
        snap: false,
        minimap: true,
        edgeLabels: true,
        reducedMotion: false,
        inspectorCollapsed: false
    });
    const MEDIA_BROWSER_PAGE_SIZE = 96;
    const VLM_CHAT_IMAGE_PREVIEW_TARGET_PIXELS = 40000;
    const MEDIA_BROWSER_DRAG_MIME = 'application/x-simpleai-media-browser-item';
    const DANBOORU_GALLERY_ENDPOINT = '/canvas-workbench/danbooru-gallery';
    const CONNECTION_SNAP_RADIUS_PX = 36;
    const CANVAS_GRID_SIZE = 24;
    const NODE_RENDER_OVERSCAN_PX = 560;
    const CANVAS_OVERVIEW_ENTER_ZOOM = 0.32;
    const CANVAS_OVERVIEW_EXIT_ZOOM = 0.42;
    const WHEEL_PREVIEW_LOD_NODE_COUNT = 180;
    const WHEEL_PREVIEW_LOD_MAX_ZOOM = CANVAS_OVERVIEW_EXIT_ZOOM;
    const WHEEL_PREVIEW_LOD_SETTLE_MS = 720;
    const PAN_PREVIEW_NODE_BUDGET = 140;
    const PAN_PREVIEW_DEFER_COVERAGE_PAD_PX = 1200;
    const CANVAS_EDGE_FINAL_RENDER_MIN_EDGES = 900;
    const EDGE_RENDER_OVERSCAN_PX = 1;
    const EDGE_POINT_CACHE_MIN_EDGES = 900;
    const EDGE_INCIDENT_INDEX_MIN_EDGES = 900;
    const PAN_EDGE_SETTLE_LOD_MIN_EDGES = 900;
    const DRAG_EDGE_LOD_MIN_EDGES = 900;
    const NODE_SPATIAL_INDEX_MIN_NODES = 180;
    const NODE_SPATIAL_INDEX_CELL_SIZE = 960;
    const XYZ_PLOT_SCRIPT_NAME = 'X/Y/Z plot';
    const XYZ_AXIS_FALLBACKS = [
        { label: 'Nothing', type: 'str', cost: 0, mode: 'both', has_choices: false },
        { label: 'Prompt', type: 'str', cost: 0, mode: 'both', has_choices: false },
        { label: 'Negative Prompt', type: 'str', cost: 0, mode: 'both', has_choices: false },
        { label: 'Seed', type: 'int', cost: 0, mode: 'both', has_choices: false },
        { label: 'Base Model', type: 'str', cost: 1, mode: 'both', has_choices: true, choices: [] },
        { label: 'Refiner', type: 'str', cost: 1, mode: 'both', has_choices: true, choices: [] },
        { label: 'CLIP', type: 'str', cost: 0.7, mode: 'both', has_choices: true, choices: [] },
        { label: 'VAE', type: 'str', cost: 0.7, mode: 'both', has_choices: true, choices: [] },
        { label: 'Upscale Model', type: 'str', cost: 0, mode: 'both', has_choices: true, choices: [] },
        { label: 'Styles', type: 'str', cost: 0, mode: 'both', has_choices: true, choices: [] },
        { label: 'Resolution Template', type: 'str', cost: 0, mode: 'both', has_choices: true, choices: Object.keys(WORKBENCH_RESOLUTION_RATIO_FALLBACKS) },
        { label: 'Aspect Ratio', type: 'str', cost: 0, mode: 'both', has_choices: true, choices: Object.values(WORKBENCH_RESOLUTION_RATIO_FALLBACKS).flat() },
        { label: 'Random Size', type: 'str', cost: 0, mode: 'both', has_choices: true, choices: ['False', 'True'] },
        { label: 'Width', type: 'int', cost: 0, mode: 'both', has_choices: false },
        { label: 'Height', type: 'int', cost: 0, mode: 'both', has_choices: false },
        { label: 'Normalize', type: 'int', cost: 0, mode: 'both', has_choices: true, choices: [1, 8, 16, 32, 64] },
        { label: 'Resolution Scale', type: 'float', cost: 0, mode: 'both', has_choices: false },
        { label: 'Resolution Edit Mode', type: 'str', cost: 0, mode: 'both', has_choices: true, choices: ['proportional', 'crop', 'scale', 'pad'] },
        { label: 'Guidance Scale', type: 'float', cost: 0, mode: 'both', has_choices: false },
        { label: 'Forced Sampling Steps', type: 'int', cost: 0, mode: 'both', has_choices: false },
        { label: 'Sampler', type: 'str', cost: 0, mode: 'both', has_choices: true, choices: ADVANCED_SAMPLER_CHOICES },
        { label: 'Scheduler', type: 'str', cost: 0, mode: 'both', has_choices: true, choices: ADVANCED_SCHEDULER_CHOICES }
    ];
    const nowIso = WORKBENCH_UTILS.nowIso;
    const formatLocalTime = WORKBENCH_UTILS.formatLocalTime;
    const clamp = WORKBENCH_UTILS.clamp;
    const stableStringify = WORKBENCH_UTILS.stableStringify;
    const stableHash = WORKBENCH_UTILS.stableHash;
    const escapeHtml = WORKBENCH_UTILS.escapeHtml;
    const normalizePresetName = WORKBENCH_UTILS.normalizePresetName;
    const sanitizeStoragePart = WORKBENCH_UTILS.sanitizeStoragePart;
    const shortIdentity = WORKBENCH_UTILS.shortIdentity;
    const CANVAS_TIMING_CONTEXT_SOURCE = {
        timingSource: {
            performanceNow: () => typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now()
                : 0,
            now: () => Date.now(),
            requestAnimationFrame: (callback) => typeof window.requestAnimationFrame === 'function'
                ? window.requestAnimationFrame(callback)
                : null,
            cancelAnimationFrame: (...args) => typeof window.cancelAnimationFrame === 'function'
                ? window.cancelAnimationFrame(...args)
                : undefined
        }
    };
    CANVAS_TIMING_CONTROLLER = typeof WORKBENCH_CANVAS_TIMING.createCanvasTimingController === 'function'
        ? WORKBENCH_CANVAS_TIMING.createCanvasTimingController(CANVAS_TIMING_CONTEXT_SOURCE)
        : {};
    const uid = (prefix) => WORKBENCH_UTILS.uid(prefix, { now: canvasNow });
    const CANVAS_SKETCH_ADAPTER = typeof window.SimpAIWorkbenchSketchAdapter?.createSketchAdapter === 'function'
        ? window.SimpAIWorkbenchSketchAdapter.createSketchAdapter({
            domSource: {
                getDocument: () => typeof document !== 'undefined' ? document : null,
                getTheme: () => {
                    const workbench = typeof document !== 'undefined'
                        ? document.querySelector('.sai-canvas-workbench')
                        : null;
                    return workbench?.dataset?.canvasTheme || 'dark';
                },
                getViewportSize: () => ({
                    width: typeof window !== 'undefined' ? window.innerWidth : 880,
                    height: typeof window !== 'undefined' ? window.innerHeight : 760
                })
            },
            identitySource: {
                uid
            },
            runtimeSource: {
                loadLazyAssetGroup: () => typeof window.loadSimpleAILazyAssetGroup === 'function'
                    ? window.loadSimpleAILazyAssetGroup('customSketch')
                    : null
            },
            timingSource: {
                performanceNow: () => canvasPerformanceNow(),
                setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
            },
            windowSource: {
                getSketch: rootElement => window.SimpAISketch?.get?.(rootElement) || null
            }
        })
        : null;
    const getCanvasSketchAdapter = () => CANVAS_SKETCH_ADAPTER || window.SimpAIWorkbenchSketchAdapter || {};
    const EDGE_RUNTIME_CONTEXT_SOURCE = {
        domSource: {
            getRoot: () => root,
            getEdgesCanvas: () => edgesCanvas,
        },
        projectSource: {
            getProject: () => project,
        },
        interactionSource: {
            isPanning: () => isPanning(),
        },
        timingSource: {
            performanceNow: () => canvasPerformanceNow(),
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined,
            clearTimeout: (...args) => typeof window.clearTimeout === 'function' ? window.clearTimeout(...args) : undefined,
        },
        configSource: {
            edgeIncidentIndexMinEdges: () => EDGE_INCIDENT_INDEX_MIN_EDGES,
        },
        renderSource: {
            renderEdges: (...args) => renderEdges(...args),
        },
    };
    const CANVAS_EDGE_RUNTIME_CONTROLLER = typeof WORKBENCH_CANVAS_EDGE_RUNTIME.createCanvasEdgeRuntimeController === 'function'
        ? WORKBENCH_CANVAS_EDGE_RUNTIME.createCanvasEdgeRuntimeController({
            edgeRuntimeSource: EDGE_RUNTIME_CONTEXT_SOURCE
        })
        : {};
    const buildEdgeIncidentIndex = (...args) => CANVAS_EDGE_RUNTIME_CONTROLLER?.buildEdgeIncidentIndex?.(...args) || null;
    const getEdgeIncidentIndex = (...args) => CANVAS_EDGE_RUNTIME_CONTROLLER?.getEdgeIncidentIndex?.(...args) || null;
    const getIncidentEdgeRecordsForNodeIds = (...args) => CANVAS_EDGE_RUNTIME_CONTROLLER?.getIncidentEdgeRecordsForNodeIds?.(...args) || {
        indexed: false,
        records: []
    };
    const cancelEdgeIncidentIndexWarmup = (...args) => CANVAS_EDGE_RUNTIME_CONTROLLER?.cancelEdgeIncidentIndexWarmup?.(...args);
    const scheduleEdgeIncidentIndexWarmup = (...args) => CANVAS_EDGE_RUNTIME_CONTROLLER?.scheduleEdgeIncidentIndexWarmup?.(...args);
    const setEdgeIncidentIndex = (...args) => CANVAS_EDGE_RUNTIME_CONTROLLER?.setEdgeIncidentIndex?.(...args);
    const shouldUseCanvasEdgeRendering = (...args) => !!CANVAS_EDGE_RUNTIME_CONTROLLER?.shouldUseCanvasEdgeRendering?.(...args);
    const preferSvgEdgesForViewportInteraction = (...args) => CANVAS_EDGE_RUNTIME_CONTROLLER?.preferSvgEdgesForViewportInteraction?.(...args);
    const renderEdgesWithSvgFallback = (...args) => CANVAS_EDGE_RUNTIME_CONTROLLER?.renderEdgesWithSvgFallback?.(...args);
    const renderEdgesWithCanvasPreferred = (...args) => CANVAS_EDGE_RUNTIME_CONTROLLER?.renderEdgesWithCanvasPreferred?.(...args);
    const getSvgFallbackUntil = (...args) => Number(CANVAS_EDGE_RUNTIME_CONTROLLER?.getSvgFallbackUntil?.(...args)) || 0;
    const getSvgFallbackLock = (...args) => Number(CANVAS_EDGE_RUNTIME_CONTROLLER?.getSvgFallbackLock?.(...args)) || 0;
    const isSvgFallbackActive = (...args) => !!CANVAS_EDGE_RUNTIME_CONTROLLER?.isSvgFallbackActive?.(...args);
    const EDGE_RENDERER_CONTEXT_SOURCE = {
        domSource: {
            getRoot: () => root,
            getDocument: () => document,
            getEdgesLayer: () => edgesLayer,
            getEdgesCanvas: () => edgesCanvas,
            getNodesLayer: () => nodesLayer
        },
        canvasSource: {
            getComputedStyle: target => typeof window.getComputedStyle === 'function' ? window.getComputedStyle(target) : null
        },
        projectSource: { getProject: () => project },
        geometrySource: {
            getEdgeSvgBounds: (...args) => getEdgeSvgBounds(...args),
            getVisibleWorldRect: (...args) => getVisibleWorldRect(...args),
            getEdgeRenderWorldRect: (...args) => getEdgeRenderWorldRect(...args),
            cssEscape,
            shouldRenderEdgeInViewport: (...args) => shouldRenderEdgeInViewport(...args),
            curvePath
        },
        nodeSource: {
            defaultNodeSize: (...args) => defaultNodeSize(...args),
            getVisibleUploadSlots: (...args) => getVisibleUploadSlots(...args),
            isQwenTtsNode: (...args) => isQwenTtsNode(...args)
        },
        noteSource: { renderNoteTailSvg },
        edgeIndexSource: { getIncidentEdgeRecordsForNodeIds },
        renderSource: {
            shouldUseCanvasEdgeRendering,
            getSlotLabel: (...args) => getSlotLabel(...args),
            escapeHtml
        },
        configSource: { edgePointCacheMinEdges: () => EDGE_POINT_CACHE_MIN_EDGES },
        selectionSource: {
            getSelectedEdgeId: () => selectedEdgeId,
            updateSelectionDomClasses: (...args) => updateSelectionDomClasses(...args)
        },
        cacheSource: {
            getEdgeRenderCacheKey: () => edgeRenderCacheKey,
            setEdgeRenderCacheKey: value => { edgeRenderCacheKey = value; }
        },
        timingSource: { performanceNow: () => canvasPerformanceNow() },
        connectionSource: {
            isConnecting: (...args) => isConnecting(...args),
            updateTempEdge: (...args) => updateTempEdge(...args)
        },
        perfSource: { getPerfStats: () => perfStats },
        viewportSource: { clientToWorld }
    };
    const CANVAS_EDGE_RENDERER = typeof WORKBENCH_CANVAS_EDGE_RENDERER.createCanvasEdgeRenderer === 'function'
        ? WORKBENCH_CANVAS_EDGE_RENDERER.createCanvasEdgeRenderer({ edgeRendererSource: EDGE_RENDERER_CONTEXT_SOURCE })
        : {};
    const renderTempEdge = state => CANVAS_EDGE_RENDERER.renderTempEdge(state);
    const GROUP_RENDERER_CONTEXT_SOURCE = {
        domSource: {
            getGroupsLayer: () => groupsLayer,
            getDocument: () => document,
            getRenderedNodeElement: id => getRenderedNodeElement(id)
        },
        groupSource: {
            ensureProjectGroups: () => ensureProjectGroups(),
            getGroup: id => getGroup(id)
        },
        projectSource: {
            getProject: () => project,
            getNode: id => getNode(id),
            getSelectedGroupId: () => selectedGroupId
        },
        geometrySource: { getNodeRect: node => getNodeRect(node) },
        selectionSource: { getSelectedNodeIdList: () => getSelectedNodeIdList() },
        patchSource: {
            buildGroupIdPatch: (...args) => buildGroupIdPatch(...args),
            buildGroupFieldPatch: (...args) => buildGroupFieldPatch(...args)
        },
        utilitySource: {
            cssEscape: value => CSS.escape(value),
            escapeHtml: value => escapeHtml(value),
            normalizeCanvasColor: (...args) => normalizeCanvasColor(...args),
            clamp: (...args) => clamp(...args),
            rectsOverlap: (...args) => rectsOverlap(...args)
        },
        languageSource: { t: (...args) => t(...args) }
    };
    const CANVAS_GROUP_RENDERER = typeof WORKBENCH_CANVAS_GROUP_RENDERER.createCanvasGroupRenderer === 'function'
        ? WORKBENCH_CANVAS_GROUP_RENDERER.createCanvasGroupRenderer({ groupRendererSource: GROUP_RENDERER_CONTEXT_SOURCE })
        : {};
    const CHAIN_RUN_OVERLAY_RENDERER_CONTEXT_SOURCE = {
        domSource: { getOverlay: () => chainRunOverlay },
        selectionSource: {
            getSelectedNodeIdList: () => getSelectedNodeIdList(),
            isMarqueeSelecting: () => isMarqueeSelecting()
        },
        projectSource: {
            getProject: () => project,
            getNode: id => getNode(id),
            isImageCompareSource: node => isImageCompareSource(node)
        },
        geometrySource: { getNodeRect: node => getNodeRect(node) },
        schedulerSource: { buildPlan: (...args) => typeof schedulerBuildPlan === 'function' ? schedulerBuildPlan(...args) : null },
        renderSource: { renderIconHtml: (...args) => renderIconHtml(...args) },
        languageSource: { t: (...args) => t(...args) }
    };
    const CANVAS_CHAIN_RUN_OVERLAY_RENDERER = typeof WORKBENCH_CANVAS_CHAIN_RUN_OVERLAY.createCanvasChainRunOverlayRenderer === 'function'
        ? WORKBENCH_CANVAS_CHAIN_RUN_OVERLAY.createCanvasChainRunOverlayRenderer({
            overlayRendererSource: CHAIN_RUN_OVERLAY_RENDERER_CONTEXT_SOURCE
        })
        : {};
    const VIEWPORT_RENDER_SCHEDULER_CONTEXT_SOURCE = {
        domSource: {
            getRoot: () => root,
            getViewportElement: () => viewport,
            getStageElement: () => stage,
            getPerfHudElement: () => perfHudEl,
        },
        projectSource: {
            getProject: () => project,
        },
        timingSource: {
            getPerfStats: () => perfStats,
            performanceNow: () => canvasPerformanceNow(),
            requestAnimationFrame: (callback) => requestCanvasFrame(callback),
            cancelAnimationFrame: (...args) => cancelCanvasFrame(...args),
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined,
            clearTimeout: (...args) => typeof window.clearTimeout === 'function' ? window.clearTimeout(...args) : undefined,
        },
        configSource: {
            canvasGridSize: () => CANVAS_GRID_SIZE,
            canvasOverviewEnterZoom: () => CANVAS_OVERVIEW_ENTER_ZOOM,
            canvasOverviewExitZoom: () => CANVAS_OVERVIEW_EXIT_ZOOM,
            wheelPreviewLodNodeCount: () => WHEEL_PREVIEW_LOD_NODE_COUNT,
            wheelPreviewLodMaxZoom: () => WHEEL_PREVIEW_LOD_MAX_ZOOM,
            wheelPreviewLodSettleMs: () => WHEEL_PREVIEW_LOD_SETTLE_MS,
            canvasEdgeFinalRenderMinEdges: () => CANVAS_EDGE_FINAL_RENDER_MIN_EDGES,
            panEdgeSettleLodMinEdges: () => PAN_EDGE_SETTLE_LOD_MIN_EDGES,
            dragEdgeLodMinEdges: () => DRAG_EDGE_LOD_MIN_EDGES,
        },
        renderSource: {
            renderNodes: (...args) => CANVAS_NODE_RENDER_CONTROLLER?.renderNodes?.(...args),
            renderEdges: (...args) => renderEdges(...args),
            renderEdgesWithSvgFallback: (...args) => renderEdgesWithSvgFallback(...args),
            renderEdgesWithCanvasPreferred: (...args) => renderEdgesWithCanvasPreferred(...args),
            renderSelectedChainOverlay: (...args) => renderSelectedChainOverlay(...args),
            renderMinimap: (...args) => CANVAS_MINIMAP_CONTROLLER?.renderMinimap?.(...args),
            updateInteractiveEdgeDom: (...args) => updateInteractiveEdgeDom(...args),
        },
        interactionSource: {
            isPanning: (...args) => CANVAS_PAN_CONTROLLER?.isPanning?.(...args) || false,
            isNodeDragging: (...args) => isNodeDragging(...args),
            isGroupDragging: (...args) => isGroupDragging(...args),
            isVisibleWorldRectCoveredByRenderedNodes: (...args) => isVisibleWorldRectCoveredByRenderedNodes(...args),
            shouldDeferPanNodeRender: (...args) => shouldDeferPanNodeRender(...args),
        },
        nodeSource: {
            getRenderedNodeElement: (...args) => CANVAS_NODE_RENDER_CONTROLLER?.getRenderedNodeElement?.(...args),
            isNodeVisuallyRunning: (...args) => isNodeVisuallyRunning(...args),
            isResultRefreshing: (...args) => isResultRefreshing(...args),
            getConnectingFromId: (...args) => getConnectingFromId(...args),
            isDraggingNode: (...args) => isDraggingNode(...args),
            getNodeResizeNodeId: (...args) => getNodeResizeNodeId(...args),
            getActiveInlineTagCartNodeId: () => activeInlineTagCartNodeId,
        },
        viewportSource: {
            getNodeRenderWorldRect: (...args) => getNodeRenderWorldRect(...args),
        },
        edgeSource: {
            getSvgFallbackUntil: () => getSvgFallbackUntil(),
        },
        stateSource: {
            setEdgeRenderCacheKey: (value) => { edgeRenderCacheKey = value; },
        },
        uiSource: {
            positionCanvasAgentPanel: (...args) => positionCanvasAgentPanel(...args),
            syncMinimapViewRect: (...args) => CANVAS_MINIMAP_CONTROLLER?.syncMinimapViewRect?.(...args),
        },
        utilitySource: {
            escapeHtml,
        },
    };
    CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER = typeof WORKBENCH_CANVAS_VIEWPORT_RENDER_SCHEDULER.createCanvasViewportRenderSchedulerController === 'function'
        ? WORKBENCH_CANVAS_VIEWPORT_RENDER_SCHEDULER.createCanvasViewportRenderSchedulerController({
            viewportRenderSchedulerSource: VIEWPORT_RENDER_SCHEDULER_CONTEXT_SOURCE
        })
        : {};
    const applyViewport = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.applyViewport?.(...args);
    const updateCanvasRenderMode = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.updateCanvasRenderMode?.(...args) || 'full';
    const resetCanvasRenderModeForProject = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.resetCanvasRenderModeForProject?.(...args) || 'full';
    const getCanvasRenderMode = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.getCanvasRenderMode?.(...args) || 'full';
    const isWheelPreviewLodActive = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.isWheelPreviewLodActive?.(...args) || false;
    const flushWheelPreviewLodRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.flushWheelPreviewLodRender?.(...args);
    const cancelWheelPreviewLod = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.cancelWheelPreviewLod?.(...args);
    const beginWheelPreviewLod = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.beginWheelPreviewLod?.(...args);
    const scheduleViewportNodeRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.scheduleViewportNodeRender?.(...args);
    const scheduleViewportZoomSettleRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.scheduleViewportZoomSettleRender?.(...args);
    const scheduleInteractiveLinkRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.scheduleInteractiveLinkRender?.(...args);
    const flushInteractiveLinkRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.flushInteractiveLinkRender?.(...args);
    const beginDragEdgeLod = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.beginDragEdgeLod?.(...args);
    const isDragEdgeLodActive = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.isDragEdgeLodActive?.(...args) || false;
    const scheduleDragEdgeSettleRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.scheduleDragEdgeSettleRender?.(...args);
    const cancelDragEdgeSettleRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.cancelDragEdgeSettleRender?.(...args);
    const endDragEdgeLodVisual = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.endDragEdgeLodVisual?.(...args);
    const cancelPanEdgeSettleRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.cancelPanEdgeSettleRender?.(...args);
    const schedulePanEdgeSettleRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.schedulePanEdgeSettleRender?.(...args);
    const schedulePanNodeRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.schedulePanNodeRender?.(...args);
    const clearPanNodeRenderTimer = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.clearPanNodeRenderTimer?.(...args);
    const shouldDeferPanEdgeSettleRender = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.shouldDeferPanEdgeSettleRender?.(...args) || false;
    const startPerformanceHud = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.startPerformanceHud?.(...args);
    const stopPerformanceHud = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.stopPerformanceHud?.(...args);
    const resetPerformanceState = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.resetPerformanceState?.(...args);
    const renderPerformanceHud = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.renderPerformanceHud?.(...args);
    const isInteractiveLinkRenderPending = (...args) => CANVAS_VIEWPORT_RENDER_SCHEDULER_CONTROLLER?.isInteractiveLinkRenderPending?.(...args) || false;
    let MEDIA_VIEWER_CONTEXT = null;
    let NODE_BROWSER_CONTEXT = null;
    let PROJECT_MANAGER_CONTEXT = null;
    let ASSET_MANAGER_CONTEXT = null;
    let MASK_EDITOR_CONTEXT = null;
    let TIMELINE_NODE_CONTEXT = null;
    let IMAGE_NODE_CONTEXT = null;
    let VIDEO_NODE_CONTEXT = null;
    let AUDIO_NODE_CONTEXT = null;
    let COMPARE_NODE_CONTEXT = null;
    let SAM3_VIDEO_MASK_NODE_CONTEXT = null;
    let CAMERA_MOTION_NODE_CONTEXT = null;
    let POSE_STUDIO_NODE_CONTEXT = null;
    let GAUSSIAN_STUDIO_NODE_CONTEXT = null;
    let LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT = null;
    let QWEN_TTS_NODE_CONTEXT = null;
    let STYLE_SELECTOR_NODE_CONTEXT = null;
    let DIRECTOR_TIMELINE_NODE_CONTEXT = null;
    let CANVAS_AGENT_PROMPT_CONTEXT = null;
    const canvasAgentPresetPromptDefaults = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPresetPromptDefaults?.(...args) || {};
    const canvasAgentPresetDefaultPrompt = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPresetDefaultPrompt?.(...args) || '';
    const canvasAgentPromptLooksDanbooru = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptLooksDanbooru?.(...args) || false;
    const canvasAgentPromptLooksDanbooruTagListish = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptLooksDanbooruTagListish?.(...args) || false;
    const canvasAgentPromptNeedsTargetRewrite = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptNeedsTargetRewrite?.(...args) || false;
    const canvasAgentPromptMediaIntent = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptMediaIntent?.(...args) || {};
    const canvasAgentPromptDefaultsForPurpose = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptDefaultsForPurpose?.(...args) || {};
    const canvasAgentPresetPromptDefaultsFacts = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPresetPromptDefaultsFacts?.(...args) || [];
    const canvasAgentPromptTargetLabel = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptTargetLabel?.(...args) || '';
    const canvasAgentPromptTargetNeedsDanbooru = (...args) => !!CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptTargetNeedsDanbooru?.(...args);
    const canvasAgentPromptTargetInstruction = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptTargetInstruction?.(...args) || '';
    const canvasAgentPromptTargetContextLine = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptTargetContextLine?.(...args) || '';
    const canvasAgentPromptTargetFact = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptTargetFact?.(...args) || null;
    const canvasAgentPromptValidationFact = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptValidationFact?.(...args) || null;
    const canvasAgentPromptSourceLabel = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptSourceLabel?.(...args) || '';
    const canvasAgentPromptTargetFromMeta = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptTargetFromMeta?.(...args) || {};
    const canvasAgentPromptTargetFromEntry = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptTargetFromEntry?.(...args) || {};
    const canvasAgentPromptTargetFromNode = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptTargetFromNode?.(...args) || {};
    const canvasAgentPromptTargetFromPurpose = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptTargetFromPurpose?.(...args) || {};
    const canvasAgentPromptTargetEntryForPurpose = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPromptTargetEntryForPurpose?.(...args) || null;
    const canvasAgentPushDanbooruTag = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentPushDanbooruTag?.(...args);
    const canvasAgentFormatDanbooruTag = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentFormatDanbooruTag?.(...args) || '';
    const canvasAgentFormatDanbooruPrompt = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentFormatDanbooruPrompt?.(...args) || '';
    const canvasAgentDanbooruTagIsLowSignal = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentDanbooruTagIsLowSignal?.(...args) || false;
    const canvasAgentDanbooruTagLooksFabricated = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentDanbooruTagLooksFabricated?.(...args) || false;
    const canvasAgentDanbooruTextHasHumanIntent = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentDanbooruTextHasHumanIntent?.(...args) || false;
    const canvasAgentDanbooruTextHasSceneryIntent = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentDanbooruTextHasSceneryIntent?.(...args) || false;
    const vlmAgentUserPromptHasAssistantPersonaImageIntent = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.vlmAgentUserPromptHasAssistantPersonaImageIntent?.(...args) || false;
    const canvasAgentFilterPersonaLeakTags = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentFilterPersonaLeakTags?.(...args) || [];
    const canvasAgentCanonicalDanbooruTagsFromPrompt = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentCanonicalDanbooruTagsFromPrompt?.(...args) || [];
    const vlmAgentExplicitSubjectCountsFromText = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.vlmAgentExplicitSubjectCountsFromText?.(...args) || { girls: 0, boys: 0, total: 0 };
    const canvasAgentSubjectCountsFromDanbooruTags = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentSubjectCountsFromDanbooruTags?.(...args) || { girls: 0, boys: 0, others: 0, total: 0 };
    const canvasAgentRepairMultiCharacterDanbooruTags = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentRepairMultiCharacterDanbooruTags?.(...args) || [];
    const canvasAgentCanonicalizeDanbooruPrompt = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentCanonicalizeDanbooruPrompt?.(...args) || String(args[0] || '');
    const canvasAgentDanbooruFallbackPrompt = (...args) => CANVAS_AGENT_PROMPT_CONTEXT?.canvasAgentDanbooruFallbackPrompt?.(...args) || '';
    const vlmAgentActionExecutionState = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionExecutionState?.(...args) || '';
    const vlmAgentActionNeedsVisibleControls = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionNeedsVisibleControls?.(...args);
    const shouldCollapseVlmChatActionDetails = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.shouldCollapseVlmChatActionDetails?.(...args);
    const vlmChatActionStateLabel = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatActionStateLabel?.(...args) || '';
    const markVlmAgentActionCardBusy = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.markVlmAgentActionCardBusy?.(...args);
    const vlmAgentActionPrompt = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionPrompt?.(...args) || '';
    const normalizeVlmExecutableActionType = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.normalizeVlmExecutableActionType?.(...args) || '';
    const vlmAgentActionPurpose = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionPurpose?.(...args) || '';
    const isVlmImageToolActionType = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.isVlmImageToolActionType?.(...args);
    const extractVlmAgentActionsFromText = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.extractVlmAgentActionsFromText?.(...args) || [];
    const vlmAgentAutoConfirmEnabled = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentAutoConfirmEnabled?.(...args);
    const vlmAgentActionRequiresManualConfirm = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionRequiresManualConfirm?.(...args);
    const vlmAgentActionWasSynthesized = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionWasSynthesized?.(...args);
    const isVlmAgentRunAlreadyPreparingResult = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.isVlmAgentRunAlreadyPreparingResult?.(...args);
    const vlmAgentToolResultMessage = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentToolResultMessage?.(...args) || null;
    const isVlmAgentPromptReviewRejected = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.isVlmAgentPromptReviewRejected?.(...args);
    const isVlmAgentPromptReviewBypassable = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.isVlmAgentPromptReviewBypassable?.(...args);
    const vlmAgentPreviousUserPrompt = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentPreviousUserPrompt?.(...args) || '';
    const vlmAgentUserExplicitlyRequestedGenerationControl = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentUserExplicitlyRequestedGenerationControl?.(...args);
    const vlmAgentActionHasBackendResolution = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionHasBackendResolution?.(...args);
    const vlmAgentActionExecutionPlan = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionExecutionPlan?.(...args) || null;
    const vlmAgentActionTargetId = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionTargetId?.(...args) || '';
    const vlmAgentActionNegativePrompt = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionNegativePrompt?.(...args) || '';
    const stripVlmAgentUnrequestedNegativePrompt = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.stripVlmAgentUnrequestedNegativePrompt?.(...args) || args[0];
    const detectVlmImageGenerationIntent = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.detectVlmImageGenerationIntent?.(...args);
    const vlmAssistantPretendsGenerationComplete = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.vlmAssistantPretendsGenerationComplete?.(...args);
    const vlmVisualScenePromptHint = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.vlmVisualScenePromptHint?.(...args);
    const vlmAgentPositiveVisualContextText = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentPositiveVisualContextText?.(...args) || '';
    const vlmAgentDanbooruContextTextForPrompt = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentDanbooruContextTextForPrompt?.(...args)
        || String(args[0] || '').trim();
    const vlmFallbackToolActionsForPrompt = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmFallbackToolActionsForPrompt?.(...args) || [];
    const sanitizeVlmAgentGenerationControlFields = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.sanitizeVlmAgentGenerationControlFields?.(...args) || {};
    const extractRequestedImageCount = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.extractRequestedImageCount?.(...args) ?? null;
    const mergeVlmImageGenerationActions = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.mergeVlmImageGenerationActions?.(...args) || [];
    const findVlmAutoConfirmActionIndex = (...args) => Number(CANVAS_VLM_CHAT_CONTROLLER?.findVlmAutoConfirmActionIndex?.(...args) ?? -1);
    const prepareVlmAgentActionsForDisplay = async (...args) => CANVAS_VLM_CHAT_CONTROLLER?.prepareVlmAgentActionsForDisplay?.(...args) || [];
    const cleanVlmAssistantDisplayText = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.cleanVlmAssistantDisplayText?.(...args) || '';
    const renderVlmChatActionSummary = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.renderVlmChatActionSummary?.(...args) || '';
    const renderVlmChatLog = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.renderVlmChatLog?.(...args) || '';
    const renderVlmAgentActions = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.renderVlmAgentActions?.(...args) || '';
    const snapshotVlmChatImages = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.snapshotVlmChatImages?.(...args) || [];
    const addVlmPendingImageFromFile = async (...args) => CANVAS_VLM_CHAT_CONTROLLER?.addVlmPendingImageFromFile?.(...args) || false;
    const removeVlmPendingImage = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.removeVlmPendingImage?.(...args);
    const vlmChatMessageContextText = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatMessageContextText?.(...args) || '';
    const vlmChatContextWindowForVersion = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatContextWindowForVersion?.(...args) || 8192;
    const vlmChatContextBudgetMax = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatContextBudgetMax?.(...args) || VLM_CHAT_DEFAULT_CONTEXT_CHARS;
    const clampVlmChatContextBudget = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.clampVlmChatContextBudget?.(...args) || VLM_CHAT_DEFAULT_CONTEXT_CHARS;
    const vlmDefaultParamValue = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmDefaultParamValue?.(...args);
    const buildVlmRollingHistoryMessages = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.buildVlmRollingHistoryMessages?.(...args) || { messages: [], info: { omitted: 0, chars: 0, max_history: 0, budget: 0 } };
    const getVlmChatImageLinkedAsset = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.getVlmChatImageLinkedAsset?.(...args) || null;
    const vlmChatImageAsset = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatImageAsset?.(...args) || {};
    const vlmChatImageDisplaySrc = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatImageDisplaySrc?.(...args) || '';
    const getVlmChatMessage = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.getVlmChatMessage?.(...args) || null;
    const getVlmChatToolState = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.getVlmChatToolState?.(...args) || {};
    const setVlmChatToolState = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.setVlmChatToolState?.(...args);
    const rememberVlmChatToolResult = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.rememberVlmChatToolResult?.(...args);
    const latestVlmChatResultNode = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.latestVlmChatResultNode?.(...args) || null;
    const vlmChatImageFromResultNode = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatImageFromResultNode?.(...args) || null;
    const vlmChatImagesFromResultNode = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatImagesFromResultNode?.(...args) || [];
    const appendVlmChatToolMessage = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.appendVlmChatToolMessage?.(...args);
    const applyVlmChatState = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.applyVlmChatState?.(...args);
    const vlmChatMessageText = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatMessageText?.(...args) || '';
    const copyVlmChatMessage = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.copyVlmChatMessage?.(...args);
    const quoteVlmChatMessage = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.quoteVlmChatMessage?.(...args);
    const lastVlmAssistantText = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.lastVlmAssistantText?.(...args) || '';
    const pendingVlmChatMessages = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.pendingVlmChatMessages?.(...args) || [];
    const hasPendingVlmChatMessage = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.hasPendingVlmChatMessage?.(...args);
    const applyVlmChatContextEdit = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.applyVlmChatContextEdit?.(...args);
    const rollbackVlmChatToMessage = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.rollbackVlmChatToMessage?.(...args);
    const deleteVlmChatMessage = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.deleteVlmChatMessage?.(...args);
    const openVlmChatImage = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.openVlmChatImage?.(...args);
    const getVlmAgentAction = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.getVlmAgentAction?.(...args) || null;
    const setVlmAgentActionExecution = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.setVlmAgentActionExecution?.(...args);
    const patchVlmAgentAction = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.patchVlmAgentAction?.(...args);
    const ignoreVlmAgentAction = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.ignoreVlmAgentAction?.(...args);
    const retryVlmAgentAction = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.retryVlmAgentAction?.(...args);
    const allowRejectedVlmAgentAction = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.allowRejectedVlmAgentAction?.(...args);
    const clearVlmChat = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.clearVlmChatNode?.(...args);
    const serializeVlmPendingImageSource = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.serializeVlmPendingImageSource?.(...args) || null;
    const startVlmChatRequest = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.startVlmChatRequest?.(...args) || null;
    const getVlmChatRequest = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.getVlmChatRequest?.(...args) || null;
    const canvasVlmChatRequestIsActive = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.isVlmChatRequestActive?.(...args);
    const clearCanvasVlmChatRequest = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.clearVlmChatRequest?.(...args);
    const replaceVlmChatPendingMessage = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.replaceVlmChatPendingMessage?.(...args);
    const prepareVlmChatAssistantResponse = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.prepareVlmChatAssistantResponse?.(...args) || {
        messages: Array.isArray(args[0]) ? args[0].slice(-40) : [],
        assistant_index: -1,
        auto_action_index: -1,
        conversation_id: args[1]?.conversation_id || args[4]?.conversationId || ''
    };
    const prepareVlmChatFailureResponse = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.prepareVlmChatFailureResponse?.(...args) || {
        messages: Array.isArray(args[0]) ? args[0].slice(-40) : [],
        pending_images: Array.isArray(args[2]?.submittedPendingImages) ? args[2].submittedPendingImages : [],
        restore_prompt: true,
        prompt: String(args[2]?.userPrompt || '')
    };
    const prepareVlmAgentRetryContext = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.prepareVlmAgentRetryContext?.(...args) || {
        ok: false,
        reason: 'retry_context_unavailable'
    };
    const vlmAgentActionResultState = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionResultState?.(...args)
        || (args[0]?.ok ? (args[0]?.runResponse?.state || 'done') : (args[1] ? 'running' : 'failed'));
    const vlmAgentActionResultMessage = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionResultMessage?.(...args)
        || args[0]?.message
        || (args[0]?.ok ? t('Done.', '已完成') : t('Failed.', '执行失败'));
    const vlmAgentPromptReviewGate = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentPromptReviewGate?.(...args) || {
        allowed: true,
        message: '',
        prompt_review: args[0]?.prompt_review && typeof args[0].prompt_review === 'object' ? args[0].prompt_review : null
    };
    const prepareVlmAgentPromptReviewBypass = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.prepareVlmAgentPromptReviewBypass?.(...args) || {
        ok: false,
        message: t('VLM prompt review bypass is unavailable.', 'VLM prompt review 放行不可用。')
    };
    const executeVlmAgentAction = async (...args) => {
        if (typeof CANVAS_VLM_CHAT_CONTROLLER?.executeVlmAgentAction !== 'function') {
            return { ok: false, message: t('VLM action execution is unavailable.', 'VLM action 执行不可用。') };
        }
        return CANVAS_VLM_CHAT_CONTROLLER.executeVlmAgentAction(...args);
    };
    const prepareVlmNodeRunContext = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.prepareVlmNodeRunContext?.(...args) || {
        params: getVlmCustomRuntimeParams(args[0]),
        isChat: false,
        connectedSources: [],
        userPrompt: String(getVlmCustomRuntimeParams(args[0])?.prompt || '').trim()
    };
    const prepareVlmNodeRunState = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.prepareVlmNodeRunState?.(...args) || args[0];
    const prepareVlmNodeRunInput = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.prepareVlmNodeRunInput?.(...args) || {};
    const executeVlmNodeRun = async (...args) => CANVAS_VLM_CHAT_CONTROLLER?.executeVlmNodeRun?.(...args) || {
        ok: false,
        error: 'VLM node execution is unavailable'
    };
    const runVlmNode = async (...args) => CANVAS_VLM_CHAT_CONTROLLER?.runVlmNode?.(...args) || {
        ok: false,
        error: 'VLM node execution is unavailable'
    };
    const isVlmNodeBusy = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.isVlmNodeBusy?.(...args);
    const isVlmModelStatusFresh = (...args) => !!CANVAS_VLM_CHAT_CONTROLLER?.isVlmModelStatusFresh?.(...args);
    const cleanVlmToolPrompt = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.cleanVlmToolPrompt?.(...args) || '';
    const queueVlmModelDownloads = async (...args) => CANVAS_VLM_CHAT_CONTROLLER?.queueVlmModelDownloads?.(...args) || {
        ok: false,
        error: 'VLM model download coordination is unavailable'
    };
    const handleVlmModelAction = async (...args) => CANVAS_VLM_CHAT_CONTROLLER?.checkVlmModelAction?.(...args) || {
        ok: false,
        error: 'VLM model check is unavailable'
    };
    const unloadVlmModel = async (...args) => CANVAS_VLM_CHAT_CONTROLLER?.unloadVlmNodeModel?.(...args) || {
        ok: false,
        error: 'VLM unload is unavailable'
    };
    const cancelCanvasVlmChatRequest = async (...args) => {
        if (typeof CANVAS_VLM_CHAT_CONTROLLER?.cancelVlmChatRequest !== 'function') {
            return { ok: false, error: 'VLM cancel API is unavailable' };
        }
        return CANVAS_VLM_CHAT_CONTROLLER.cancelVlmChatRequest(...args);
    };
    const stopVlmChatNode = async (...args) => {
        if (typeof CANVAS_VLM_CHAT_CONTROLLER?.stopVlmChatNode !== 'function') {
            return { ok: false, error: 'VLM chat controller is unavailable' };
        }
        return CANVAS_VLM_CHAT_CONTROLLER.stopVlmChatNode(...args);
    };
    const getVlmCustomApiKey = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.getVlmCustomApiKey?.(...args) || '';
    const getVlmCustomRuntimeParams = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.getVlmCustomRuntimeParams?.(...args) || {};
    const saveVlmCustomSecret = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.saveVlmCustomSecret?.(...args);
    const loadVlmCustomSecret = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.loadVlmCustomSecret?.(...args);
    const deleteVlmCustomSecret = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.deleteVlmCustomSecret?.(...args);
    const fetchVlmCustomModels = async (...args) => CANVAS_VLM_CHAT_CONTROLLER?.fetchVlmCustomModels?.(...args) || {
        ok: false,
        error: 'VLM custom model fetch is unavailable'
    };
    const toggleVlmCustomApi = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.toggleVlmCustomApi?.(...args);
    const testVlmCustomApi = async (...args) => CANVAS_VLM_CHAT_CONTROLLER?.testVlmCustomApi?.(...args) || {
        ok: false,
        error: 'VLM custom API test is unavailable'
    };
    const syncVlmCustomFromAgent = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.syncVlmCustomFromAgent?.(...args);
    const syncVlmCustomToAgent = (...args) => CANVAS_VLM_CHAT_CONTROLLER?.syncVlmCustomToAgent?.(...args);
    const FACTORY_CONTEXT_SOURCE = {
            textNodeSource: {
                identitySource: {
                    uid
                },
                timeSource: {
                    nowIso
                },
                languageSource: {
                    t,
                    tagCartLabel
                },
                layoutSource: {
                    defaultNodeSize
                },
                serializationSource: {
                    cloneRunValue
                }
            },
            auxNodeSource: {
                identitySource: {
                    uid
                },
                timeSource: {
                    nowIso
                },
                languageSource: {
                    t,
                    mediaBrowserLabel
                },
                layoutSource: {
                    defaultNodeSize
                },
                serializationSource: {
                    cloneRunValue
                },
                mediaBrowserSource: {
                    mediaBrowserInitialState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserInitialState(...args),
                    serializableMediaBrowserState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.serializableMediaBrowserState(...args)
                },
                viewportSource: {
                    getViewportCenterWorld: () => viewportCenterWorld()
                }
            },
            batchAnyNodeSource: {
                identitySource: {
                    uid
                },
                layoutSource: {
                    defaultNodeSize
                },
                serializationSource: {
                    cloneRunValue
                }
            },
            maskNodeSource: {
                identitySource: {
                    uid
                },
                languageSource: {
                    advancedMaskingLabel
                },
                serializationSource: {
                    cloneRunValue
                }
            },
            resultNodeSource: {
                identitySource: {
                    uid
                },
                languageSource: { t },
                serializationSource: {
                    cloneRunValue
                },
                timeSource: {
                    nowIso
                },
                layoutSource: {
                    defaultResultNodeSize: (...args) => defaultResultNodeSize(...args)
                }
            },
            mediaNodeSource: {
                identitySource: {
                    uid
                },
                serializationSource: {
                    cloneRunValue
                },
                layoutSource: {
                    defaultNodeSize
                },
                mediaSource: {
                    getAssetMediaKind: assetMediaKind
                }
            },
            inputNodeSource: {
                identitySource: {
                    uid
                },
                languageSource: {
                    t
                },
                layoutSource: {
                    defaultNodeSize
                }
            },
            uploadNodeSource: {
                identitySource: {
                    uid
                },
                timeSource: {
                    nowIso
                },
                layoutSource: {
                    defaultNodeSize
                }
            },
            batchItemSource: {
                identitySource: {
                    uid
                },
                timeSource: {
                    nowIso
                },
                languageSource: {
                    t
                },
                serializationSource: {
                    cloneRunValue
                }
            },
            configNodeSource: {
                identitySource: {
                    uid
                },
                timeSource: {
                    nowIso
                },
                serializationSource: {
                    cloneRunValue
                }
            },
            xyzMatrixNodeSource: {
                identitySource: {
                    uid
                },
                timeSource: {
                    nowIso
                },
                languageSource: {
                    t
                },
                layoutSource: {
                    defaultNodeSize
                },
                serializationSource: {
                    cloneRunValue
                },
                scriptSource: {
                    script: XYZ_PLOT_SCRIPT_NAME
                }
            },
            groupSource: {
                identitySource: {
                    uid
                },
                languageSource: {
                    t
                },
                utilitySource: {
                    clamp,
                    normalizeCanvasColor
                }
            },
            runRecordSource: {
                timeSource: {
                    nowIso
                },
                serializationSource: {
                    cloneRunValue
                },
                utilitySource: {
                    clamp
                },
                statusSource: {
                    isTerminalRunState
                }
            },
            batchJobSource: {
                timeSource: {
                    nowIso
                },
                serializationSource: {
                    cloneRunValue
                },
                scriptSource: {
                    xyzScript: XYZ_PLOT_SCRIPT_NAME
                }
            },
            edgeSource: {
                identitySource: {
                    uid
                }
            },
            projectPatchSource: {},
            assetSource: {
                identitySource: {
                    uid
                },
                timeSource: {
                    nowIso
                },
                serializationSource: {
                    cloneRunValue
                }
            },
            specialNodePatchSource: {
                timeSource: {
                    nowIso
                },
                serializationSource: {
                    cloneRunValue
                }
            },
            agentPatchSource: {
                timeSource: {
                    nowIso
                },
                serializationSource: {
                    cloneRunValue
                }
            },
            vlmChatStateSource: {
                serializationSource: {
                    cloneRunValue
                }
            },
    };
    const CANVAS_FACTORY_CONTEXT = typeof WORKBENCH_CANVAS_FACTORY_CONTEXT.createCanvasWorkbenchFactoryContext === 'function'
        ? WORKBENCH_CANVAS_FACTORY_CONTEXT.createCanvasWorkbenchFactoryContext({
            factorySource: FACTORY_CONTEXT_SOURCE
        })
        : {};
    const {
        buildTextNode, buildTextNodeStatePatch, buildTextMergeNode, buildTranslationNode, buildTranslationStatus,
        buildTranslationStatePatch, buildTextMergeStatePatch, buildWd14Status, buildWd14StatePatch,
        buildTagCartNode, buildTagCartStatePatch, buildTagCartSizePatch, buildWd14Node,
        buildWildcardsHelperNode, buildWildcardsHelperStatePatch, buildMediaBrowserNode, buildMediaBrowserStatePatch,
        buildNoteNode, buildNoteStatePatch, buildBatchAnyNode, buildBatchAnyStatePatch, buildBatchAnyItemStatePatch,
        buildBatchAnyLegacyTypePatch, buildMaskNode, buildMaskStatus, buildMaskStatePatch,
        buildManualOutputNode, buildReservedResultNode, buildQueuedResultNode, buildDirectorSegmentResultNode,
        buildTimelineOutputResultNode, buildTimelineCompareResultNode, buildResultStatusPatch, buildResultAssetPatch,
        buildResultSelectedAssetMetadataPatch, buildResultPreviewPatch, buildResultProducerPatch, buildResultSourcePatch,
        buildCanvasAgentReservedResultSource, buildTimelineResultPatch, buildResultRunMetadataPatch, buildResultOutputPatch,
        buildResultRefreshPreparingPatch, buildResultRefreshReconciledPatch, buildResultRefreshClearedPatch,
        buildResultRefreshFailurePatch, buildResultStaleStatePatch, buildResultFingerprintPatch,
        buildResultDryRunSourcePatch, buildResultManualReplacementPatch, buildResultMaterializationPatch,
        buildResultAssetSelectionPatch, buildResultBatchMetadataPatch, buildResultLayoutPatch,
        buildImageNodeFromAsset, buildMediaNodeFromAsset, buildMediaNodeSourcePatch, buildMediaNodeStatePatch,
        buildEmptyImageNodeForInput, buildEmptyMediaNodeForInput, buildOutputGalleryMediaNode,
        buildImageNodeFromTransferItem, buildImageNodeFromFile, buildMediaNodeFromFile,
        buildTextBatchItemFromFile, buildMediaBatchItemFromFile, buildTextBatchItemFromSource,
        buildMediaBatchItemFromSource, buildConfigNode, buildConfigStatePatch, buildXyzMatrixNode,
        buildXyzMatrixStatePatch, buildAgentWorkflowGroup, buildAreaGroup, buildGroupIdPatch, buildGroupFieldPatch,
        buildQwenTtsRunRecord, buildPresetRunRecord, buildDirectorSegmentRunRecord, buildRunStoragePatch,
        buildQwenTtsRunResponsePatch, buildCanvasRunResponsePatch, buildCanvasDryRunPatch, buildXyzBatchJob,
        buildBatchAnyJob, buildBatchJobStatePatch, buildBatchJobRunIdsPatch, buildBatchJobFailurePatch,
        buildBatchJobCompletionPatch, buildCanvasEdge, buildProjectNodeAppendPatch, buildProjectMetadataPatch,
        buildProjectIdentityPatch, buildProjectDefaultPatch, buildProjectDemoPatch, buildProjectUpdatedAtPatch,
        buildProjectCollectionsPatch, buildProjectNodesPatch, buildProjectRunsPatch, buildProjectGroupsPatch,
        buildProjectGroupAppendPatch, buildProjectGroupDeletePatch, buildProjectRunAppendPatch,
        buildProjectBatchJobAppendPatch, buildProjectCanvasClearPatch, buildProjectStorageInfoPatch,
        buildProjectStoragePatch, buildProjectEdgeAppendPatch, buildProjectEdgeFilterPatch,
        buildProjectTimelineClipEdgeDeletePatch, buildProjectViewportPatch, buildProjectSettingsPatch,
        buildProjectSettingsMergePatch, buildProjectSchedulerPatch, buildProjectNodeStoragePatch,
        buildBrowserImageAsset, buildBrowserMediaAsset, buildImageOutputAsset, buildTimelineRenderAsset,
        buildTimelinePreviewAsset, buildTimelineCompareAsset, buildGeneratedMaskAsset, buildVideoResponseAsset,
        buildAssetReference, buildMaskAsset, buildMaterializedAsset, buildAssetMetadataPatch, buildMediaTrimAsset,
        buildMediaEditAsset, buildSam3SourcePatch, buildSam3StatePatch, buildDirectorTimelineStatePatch,
        buildCameraMotionSourcePatch, buildCameraMotionParamsPatch, buildCameraMotionStatePatch,
        buildSpecialNodeConnectionPatch, buildSpecialNodeStatusPatch, buildPresetSpecialControllerStatePatch,
        buildLivePortraitVideoExpressionStatePatch, buildLtx23GuidesStatePatch, buildH3StoryboardStatePatch,
        buildPoseStudioConfirmPatch, buildLivePortraitStatePatch, buildLivePortraitConfirmPatch,
        buildPoseStudioStatePatch, buildLivePortraitNodeStatePatch, buildGaussianStudioStatePatch,
        buildStyleSelectorStatePatch, buildQwenTtsStatePatch, buildGaussianCachePatch, buildGaussianConfirmPatch,
        buildAgentDecisionFormPatch, buildAgentCreatedNodePatch, buildAgentWorkflowPresetPatch,
        buildAgentReferencePlaceholderPatch, buildVlmChatStatePatch, buildVlmChatStoragePatch,
        buildVlmChatToolStatePatch
    } = CANVAS_FACTORY_CONTEXT;
    const VLM_CHAT_SCROLL_CONTEXT_SOURCE = {
        domSource: {
            getNodesLayer: () => nodesLayer,
            getDocument: () => document,
            getComputedStyle: (element) => window.getComputedStyle(element),
        },
        projectSource: {
            getProject: () => project,
        },
        nodeSource: {
            nodeStatusState,
        },
        renderSource: {
            nodeRenderKey: (...args) => nodeRenderKey(...args),
        },
        timingSource: {
            performanceNow: () => canvasPerformanceNow(),
            requestAnimationFrame: (callback) => requestCanvasFrame(callback),
        },
        utilitySource: {
            cssEscape: (value) => CSS.escape(value),
        },
        diagnosticsSource: {
            warn: (...args) => console.warn(...args),
            info: (...args) => console.info(...args),
        },
    };
    const CANVAS_VLM_CHAT_SCROLL_CONTROLLER = typeof WORKBENCH_CANVAS_VLM_CHAT_SCROLL.createCanvasVlmChatScrollController === 'function'
        ? WORKBENCH_CANVAS_VLM_CHAT_SCROLL.createCanvasVlmChatScrollController({
            vlmChatScrollSource: VLM_CHAT_SCROLL_CONTEXT_SOURCE
        })
        : {};
    const captureVlmChatScroll = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.captureVlmChatScroll?.(...args) || null;
    const restoreVlmChatScroll = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.restoreVlmChatScroll?.(...args);
    const scrollVlmChatToBottom = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.scrollVlmChatToBottom?.(...args);
    const scrollVlmChatLogToBottom = (...args) => !!CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.scrollVlmChatLogToBottom?.(...args);
    const handleVlmChatJumpClick = (...args) => !!CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.handleVlmChatJumpClick?.(...args);
    const rememberVlmChatScrollFromLog = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.rememberVlmChatScrollFromLog?.(...args) || null;
    const vlmChatScrollSnapshot = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.vlmChatScrollSnapshot?.(...args) || null;
    const updateVlmChatJumpButton = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.updateVlmChatJumpButton?.(...args);
    const bindVlmChatScrollControls = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.bindVlmChatScrollControls?.(...args);
    const markVlmChatStickToBottom = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.markVlmChatStickToBottom?.(...args);
    const getVlmChatScrollMemory = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.getVlmChatScrollMemory?.(...args) || new Map();
    const getVlmRenderDebugEnabled = (...args) => !!CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.getVlmRenderDebugEnabled?.(...args);
    const logVlmRenderKeyChange = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.logVlmRenderKeyChange?.(...args);
    const setVlmRenderDebug = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.setVlmRenderDebug?.(...args) || {
        enabled: false,
        vlm_nodes: []
    };
    const vlmRenderDebugSummary = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.vlmRenderDebugSummary?.(...args) || [];
    const vlmChatScrollDebug = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.vlmChatScrollDebug?.(...args) || null;
    const getVlmRenderDebugLastDiffs = (...args) => CANVAS_VLM_CHAT_SCROLL_CONTROLLER?.getVlmRenderDebugLastDiffs?.(...args) || [];
    const RUNTIME_CONTEXT_SOURCE = {
            pointerInteractionSource: {
                isNodeDragging: () => isNodeDragging(),
                isGroupDragging: () => isGroupDragging(),
                isNodeResizing: () => isNodeResizing(),
                isNoteTailDragging: () => isNoteTailDragging(),
                isGroupResizing: () => isGroupResizing(),
                isPanning: () => isPanning(),
                isMinimapDragging: () => isMinimapDragging(),
                isMarqueeSelecting: () => isMarqueeSelecting(),
                isConnecting: () => isConnecting(),
                isComparePositionDragging: () => isComparePositionDragging(),
                isTimelineClipDragging: () => isTimelineClipDragging(),
                isTimelinePlayheadDragging: () => isTimelinePlayheadDragging(),
                isTimelinePreviewDragging: () => isTimelinePreviewDragging(),
                isDirectorTimelineDragging: () => isDirectorTimelineDragging(),
                isTimelineMaskPointerActive: () => isTimelineMaskPointerActive(),
                isTimelineKeyframeDragging: () => isTimelineKeyframeDragging(),
            },
            selectionSource: {
                getSelectionState: () => ({
                    selectedNodeId,
                    selectedNodeIds: new Set(selectedNodeIds),
                    selectedEdgeId,
                    selectedGroupId,
                }),
                setSelectionState: (state) => {
                    const next = state || {};
                    selectedNodeId = next.selectedNodeId || null;
                    selectedNodeIds = next.selectedNodeIds instanceof Set
                        ? new Set(next.selectedNodeIds)
                        : new Set(Array.isArray(next.selectedNodeIds) ? next.selectedNodeIds : []);
                    selectedEdgeId = next.selectedEdgeId || null;
                    selectedGroupId = next.selectedGroupId || null;
                },
            },
            projectSource: { getProject: () => project },
            groupSource: { ensureProjectGroups: () => ensureProjectGroups() },
            statusSource: {
                languageSource: {
                    getLanguageState: () => ({ __lang: runtimeUiLang() }),
                    t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                    tOption: (value, options, state) => tOption(value, options, state || { __lang: runtimeUiLang() }),
                },
                domSource: {
                    getRoot: () => root,
                    getZoomLabel: () => zoomLabel,
                },
                projectSource: {
                    getProject: () => project,
                },
                storageSource: {
                    getStorageScope: () => storageScope,
                    getStorageKey: () => storageKey,
                    storageDisplayLocation: () => storageDisplayLocation(),
                    storageDisplayPath: () => storageDisplayPath(),
                },
                uiSource: {
                    getCanvasTitle: () => getCanvasTitle(),
                    renderHistoryButtons: (...args) => CANVAS_HISTORY_CONTROLLER?.renderHistoryButtons?.(...args),
                    renderSystemInfo: (...args) => CANVAS_RUN_STATUS_CONTROLLER?.renderSystemInfo?.(...args),
                    renderRunQueueWidget: (...args) => CANVAS_RUN_STATUS_CONTROLLER?.renderRunQueueWidget?.(...args),
                },
            },
            presetNodeRendererSource: {
                languageSource: {
                    t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                    tOption,
                    localizeCanvasLabel,
                },
                utilitySource: {
                    clamp,
                    escapeHtml,
                    normalizeCanvasColor,
                },
                projectSource: {
                    getProject: () => project,
                    getNode,
                },
                classicSource: {
                    getClassicModes: () => registryClassicModes,
                    getClassicOutpaintDirs: () => registryClassicOutpaintDirs,
                    getClassicInpaintMethods: () => registryClassicInpaintMethods,
                    getClassicEnhanceUovProcessingOrder: () => registryClassicEnhanceUovProcessingOrder,
                    getClassicEnhanceUovPromptTypes: () => registryClassicEnhanceUovPromptTypes,
                    getClassicIpMaxImages,
                    getClassicIpCount,
                    getClassicUovMethods,
                    getClassicIpTypes,
                    getClassicInpaintEngines,
                    normalizeClassicInpaintMode,
                    getInpaintModeDefaults,
                    getClassicEnhanceRegionValues,
                    getClassicEnhanceRegionDefault,
                    detectionSlotForRegion,
                    getDetectionConfigLabel,
                    enhanceRegionKey,
                },
                promptSource: {
                    getPromptTextSourceNode,
                    getNodeTextOutput,
                    canvasAgentPresetPromptDefaults,
                },
                uploadSource: {
                    danbooruAutocompleteAttrs: (...args) => DANBOORU_AUTOCOMPLETE_CONTROLLER?.danbooruAutocompleteAttrs?.(...args) || '',
                    getVisibleClassicUploadSlots,
                    getVisibleUploadSlots,
                    getUploadSlotMediaKind,
                },
                portSource: {
                    portHintText: (...args) => CANVAS_NODE_RENDERER?.portHintText?.(...args) || '',
                    collapsedKeepClass,
                    slotPortTitle: (...args) => CANVAS_NODE_RENDERER?.slotPortTitle?.(...args) || '',
                    slotPortButtonTitle: (...args) => CANVAS_NODE_RENDERER?.slotPortButtonTitle?.(...args) || '',
                    slotPortHintText: (...args) => CANVAS_NODE_RENDERER?.slotPortHintText?.(...args) || '',
                    notConnectedText: (...args) => CANVAS_NODE_RENDERER?.notConnectedText?.(...args) || '',
                },
                presetSource: {
                    getPresetConfigKinds: () => PRESET_CONFIG_KINDS,
                    getSlotLabels: () => SLOT_LABELS,
                    getPresetSchema,
                    getPresetTheme,
                    getPresetThemeInfo,
                    presetSpecialViewerUrl,
                    presetModelStatusState,
                    isStyleTransferPresetNode,
                    isLivePortraitVideoExpressionPresetNode,
                    isLtx23MultiGuidePresetNode,
                    isMiniMaxH3PresetNode,
                },
                renderSource: {
                    renderPresetParamControl: (...args) => CANVAS_PRESET_PARAM_RENDERER?.renderPresetParamControl?.(...args) || '',
                    renderTranslatableTextarea: (...args) => CANVAS_PRESET_PARAM_RENDERER?.renderTranslatableTextarea?.(...args) || '',
                    getTranslationFieldState,
                    renderNodeStateBadges: (...args) => CANVAS_NODE_RENDERER?.renderNodeStateBadges?.(...args) || '',
                    renderRunnableNodeStatusFoot: (...args) => CANVAS_NODE_RENDERER?.renderRunnableNodeStatusFoot?.(...args) || '',
                    renderPresetConfigPortRow: (...args) => CANVAS_NODE_RENDERER?.renderPresetConfigPortRow?.(...args) || '',
                    renderStyleTransferPresetController,
                    renderLivePortraitVideoExpressionPresetController,
                    renderLtx23GuidePresetController,
                    renderMiniMaxH3StoryboardPresetController,
                },
            },
            runtimeServiceSource: {
                renderSource: {
                    domSource: {
                        getRoot: () => root,
                        getRunHistoryPanel: () => runHistoryPanel,
                    },
                    runtimeSource: {
                        getPerfStats: () => perfStats,
                        performanceNow: () => canvasPerformanceNow(),
                    },
                    interactionSource: {
                        cancelPanEdgeSettleRender: (...args) => cancelPanEdgeSettleRender(...args),
                        isNodeDragging: (...args) => isNodeDragging(...args),
                        isGroupDragging: (...args) => isGroupDragging(...args),
                        cancelDragEdgeSettleRender: (...args) => cancelDragEdgeSettleRender(...args),
                        endDragEdgeLodVisual: (...args) => endDragEdgeLodVisual(...args),
                    },
                    selectionSource: {
                        reconcileSelection: (...args) => reconcileSelection(...args),
                    },
                    renderSource: {
                        applyThemeClass: (...args) => applyThemeClass(...args),
                        applyViewport: (...args) => applyViewport(...args),
                        renderGroups: (...args) => renderGroups(...args),
                        renderMode: () => getCanvasRenderMode(),
                        renderEdges: (...args) => renderEdges(...args),
                        renderSelectedChainOverlay: (...args) => renderSelectedChainOverlay(...args),
                    },
                    uiSource: {
                        renderInspector: (...args) => renderInspector(...args),
                        renderCanvasSettingsPanel: (...args) => renderCanvasSettingsPanel(...args),
                        renderMinimap: (...args) => CANVAS_MINIMAP_CONTROLLER?.renderMinimap?.(...args),
                        renderCanvasAgentPanel: (...args) => renderCanvasAgentPanel(...args),
                        renderRunQueuePanelIfOpen: (...args) => renderRunQueuePanelIfOpen(...args),
                        renderRunHistoryPanel: (...args) => renderRunHistoryPanel(...args),
                        renderPerformanceHud: (...args) => renderPerformanceHud(...args),
                        scheduleEdgeIncidentIndexWarmup: (...args) => scheduleEdgeIncidentIndexWarmup(...args),
                        invalidateMinimapStaticCache: (...args) => CANVAS_MINIMAP_CONTROLLER?.invalidateMinimapStaticCache?.(...args),
                        invalidateNodeSpatialIndex: (...args) => CANVAS_NODE_SPATIAL_INDEX_CONTROLLER?.invalidateNodeSpatialIndex?.(...args),
                    },
                },
                runStatusSource: {
                    languageSource: {
                        t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                        formatLocalTime,
                    },
                    utilitySource: {
                        cloneRunValue,
                        escapeHtml,
                        clamp,
                    },
                    projectSource: {
                        getProject: () => project,
                        getNode,
                    },
                    windowSource: {
                        getWindow: () => window,
                    },
                    runtimeSource: {
                        isStandaloneCanvasWorkbench,
                        isCanvasRunActiveState,
                        isTerminalRunState,
                        fetchStatus: (...args) => window.fetch(...args),
                        now: () => canvasNow(),
                        setInterval: (...args) => window.setInterval(...args),
                        clearInterval: (...args) => window.clearInterval(...args),
                    },
                    domSource: {
                        getRunQueueWidget: () => runQueueWidget,
                        getRunQueuePanel: () => runQueuePanel,
                        getSystemInfoElement: () => systemInfoEl,
                        getBackendAlertElement: () => backendAlertEl,
                    },
                },
                minimapSource: {
                    projectSource: {
                        getProject: () => project,
                    },
                    domSource: {
                        getMinimapElement: () => minimapEl,
                        getDocument: () => document,
                    },
                    viewportSource: {
                        getViewport: () => viewport,
                        getVisibleWorldRect: (...args) => CANVAS_VIEWPORT_RENDER_CONTROLLER?.getVisibleWorldRect?.(...args)
                            || (typeof viewportGetVisibleWorldRect === 'function'
                                ? viewportGetVisibleWorldRect(viewport, project?.viewport)
                                : null),
                        getMinimapBounds: (items, visible, options) => typeof viewportGetMinimapBounds === 'function'
                            ? viewportGetMinimapBounds(items, visible, options || { defaultNodeSize, getNodeLayoutSize })
                            : null,
                        hasCanvasOverflow: (items, visible, options) => typeof viewportHasCanvasOverflow === 'function'
                            ? viewportHasCanvasOverflow(items, visible, options || { defaultNodeSize, getNodeLayoutSize })
                            : false,
                    },
                    layoutSource: {
                        getNodeRect: (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.getNodeRect?.(...args)
                            || (typeof viewportGetNodeRect === 'function' ? viewportGetNodeRect(...args) : null),
                        defaultNodeSize,
                        getNodeLayoutSize: (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.getNodeLayoutSize?.(...args)
                            || getNodeRect(...args),
                    },
                    groupSource: {
                        getGroupRect,
                        ensureProjectGroups,
                    },
                    selectionSource: {
                        getSelectedNodeId: () => selectedNodeId,
                        getSelectedNodeIds: () => selectedNodeIds,
                        getSelectedGroupId: () => selectedGroupId,
                    },
                    utilitySource: {
                        nodeCustomColor,
                        expandCanvasHexColor,
                        escapeHtml,
                    },
                    runtimeSource: {
                        getWindow: () => window,
                        getPerfStats: () => perfStats,
                        performanceNow: () => canvasPerformanceNow(),
                        setTimeout: (...args) => window.setTimeout(...args),
                        clearTimeout: (...args) => window.clearTimeout(...args),
                    },
                    interactionSource: {
                        buildProjectViewportPatch,
                        preferSvgEdgesForViewportInteraction,
                        applyViewport,
                        renderStatus: (...args) => CANVAS_STATUS_CONTROLLER?.renderStatus?.(...args),
                        scheduleViewportNodeRender,
                    },
                    persistenceSource: {
                        scheduleViewportSave,
                    },
                },
                historySource: {
                    languageSource: {
                        t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                    },
                    configSource: {
                        getHistoryLimit: () => 32,
                        getHistoryMemoryBudgetBytes: () => 48 * 1024 * 1024,
                    },
                    projectSource: {
                        getProject: () => project,
                        setProject: (value) => { project = value; },
                        compactProjectForStorage,
                        sanitizeProject,
                    },
                    storageSource: {
                        buildProjectStorageInfo: (...args) => buildProjectStorageInfo(...args),
                        getStorageKey: () => storageKey,
                        getStorageScope: () => storageScope,
                    },
                    selectionSource: {
                        getSelectionState: () => ({
                            selectedNodeId,
                            selectedNodeIds: new Set(selectedNodeIds),
                            selectedEdgeId,
                            selectedGroupId,
                        }),
                        setSelectionState: (state) => {
                            const next = state || {};
                            selectedNodeId = next.selectedNodeId || null;
                            selectedNodeIds = next.selectedNodeIds instanceof Set
                                ? new Set(next.selectedNodeIds)
                                : new Set(Array.isArray(next.selectedNodeIds) ? next.selectedNodeIds : []);
                            selectedEdgeId = next.selectedEdgeId || null;
                            selectedGroupId = next.selectedGroupId || null;
                        },
                    },
                    domSource: {
                        getRoot: () => root,
                    },
                    runtimeSource: {
                        setTimeout: (...args) => window.setTimeout(...args),
                        clearTimeout: (...args) => window.clearTimeout(...args),
                    },
                    renderSource: {
                        resetRenderedProjectDomCache: (...args) => CANVAS_NODE_RENDER_CONTROLLER?.resetRenderedProjectDomCache?.(...args),
                        renderAll: (...args) => CANVAS_RENDER_CONTROLLER?.renderAll?.(...args),
                    },
                    interactionSource: {
                        closeContextMenu: (...args) => closeContextMenu(...args),
                    },
                    persistenceSource: {
                        scheduleSave: (...args) => scheduleSave(...args),
                    },
                    uiSource: {
                        showToast,
                    },
                },
            },
            assetNodeRenderSource: {
                languageSource: {
                    getLanguageState: () => ({ __lang: runtimeUiLang() }),
                    t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                },
                utilitySource: {
                    clamp,
                    escapeHtml,
                     assetMediaKind,
                     assetMediaIcon,
                     safeAssetDisplaySrc: (...args) => CANVAS_PROJECT_ASSETS_CONTROLLER?.safeAssetDisplaySrc?.(...args) || '',
                     safeAssetFullDisplaySrc: (...args) => CANVAS_PROJECT_ASSETS_CONTROLLER?.safeAssetFullDisplaySrc?.(...args) || '',
                     safeAssetFallbackSrc: (...args) => CANVAS_PROJECT_ASSETS_CONTROLLER?.safeAssetFallbackSrc?.(...args) || '',
                    readAssetInfo,
                    mediaAspectStyle,
                    inferChatImageRelativePath: (...args) => inferChatImageRelativePath(...args),
                    localizedDefaultTitle,
                    formatBytes: WORKBENCH_UTILS.formatBytes,
                },
                renderSource: {
                    renderNodeStateBadges: (...args) => CANVAS_NODE_RENDERER?.renderNodeStateBadges?.(...args) || '',
                    collapsedKeepClass,
                    syncGalleryFrostClass: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.syncGalleryFrostClass(...args),
                },
                statusSource: {
                    isCanvasRunActiveState,
                    isResultStale,
                    isResultRefreshing,
                    resultMediaDisplayAsset,
                 },
                 batchSource: {
                     getResultMetadataRows: (...args) => resultMetadataRows(...args),
                     batchAnyMediaKindFromAsset,
                    batchAnyMediaKind,
                    batchAnyPortKind,
                    batchAnyMediaLabel,
                    batchAnyMediaIcon,
                    batchAnyCurrentItem,
                    batchAnySelectedItemIds,
                    batchAnyTargets,
                    batchAnyTargetLabel,
                    batchAnyTextFromItem,
                },
                  mediaSource: {
                      mediaBrowserNodeState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserNodeState(...args),
                      mediaBrowserRuntimeFor: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserRuntimeFor(...args),
                      isGalleryFrostEnabled: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.isGalleryFrostEnabled(...args),
                      selectedMediaBrowserItemFrom: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.selectedMediaBrowserItemFrom(...args),
                     danbooruPostMediaType: (...args) => danbooruPostMediaType(...args),
                 },
                 maskNodeSource: {
                     getNode,
                 },
                 maskSource: {
                     notConnectedText: (...args) => CANVAS_NODE_RENDERER?.notConnectedText?.(...args) || t('Not connected', '未连接'),
                     portHintText: (...args) => CANVAS_NODE_RENDERER?.portHintText?.(...args) || '',
                     imagePortTitle: (...args) => CANVAS_NODE_RENDERER?.imagePortTitle?.(...args) || t('Image input', '图像输入'),
                     danbooruAutocompleteAttrs: (...args) => DANBOORU_AUTOCOMPLETE_CONTROLLER?.danbooruAutocompleteAttrs?.(...args) || '',
                     localizeMaskStatus,
                 },
             },
              resultPreviewSource: {
                 previewSource: {
                     resultPreviewFrameSrc: (...args) => CANVAS_ASSET_NODE_RENDERER?.resultPreviewFrameSrc?.(...args) || '',
                     resultPreviewFrameAspect: (...args) => CANVAS_ASSET_NODE_RENDERER?.resultPreviewFrameAspect?.(...args) || 0,
                     resultPreviewAspectSource: (...args) => CANVAS_ASSET_NODE_RENDERER?.resultPreviewAspectSource?.(...args) || null,
                     renderResultPreviewStripHtml: (...args) => CANVAS_ASSET_NODE_RENDERER?.renderResultPreviewStripHtml?.(...args) || '',
                 },
                 nodeSource: {
                     getNode,
                     getNodeElement: (id) => nodesLayer?.querySelector?.(`[data-node-id="${CSS.escape(id)}"]`),
                     nodeStatusState,
                 },
                 statusSource: {
                     isCanvasRunActiveState,
                 },
                 resultSource: {
                     buildResultPreviewPatch,
                     getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
                 },
                 renderSource: {
                     renderResultMediaHtml: (...args) => renderResultMediaHtml(...args),
                 },
                 assetSource: {
                     safeAssetFallbackSrc: (...args) => safeAssetFallbackSrc(...args),
                     safeAssetFullDisplaySrc: (...args) => safeAssetFullDisplaySrc(...args),
                  },
                  eventSource: {
                      bindNodeMediaControlEvents: (...args) => CANVAS_MEDIA_PLAYBACK_CONTROLLER.bindNodeMediaControlEvents(...args),
                 },
                 utilitySource: {
                     escapeHtml,
                     clamp,
                     cloneRunValue,
                 },
                 runtimeSource: {
                     maxFrames: 96,
                     setInterval: (...args) => window.setInterval(...args),
                     clearInterval: (...args) => window.clearInterval(...args),
                  },
              },
              nodeLayoutSource: {
                  utilitySource: {
                      clamp,
                  },
                  nodeSource: {
                      collapsedPromptDefaultHeight: COLLAPSED_PROMPT_NODE_DEFAULT_HEIGHT,
                      collapsedPromptMinHeight: COLLAPSED_PROMPT_NODE_MIN_HEIGHT,
                      collapsedPromptMaxHeight: COLLAPSED_PROMPT_NODE_MAX_HEIGHT,
                      collapsedPromptPortRowHeight: COLLAPSED_PROMPT_PORT_ROW_HEIGHT,
                      collapsedPromptTextBlockHeight: COLLAPSED_PROMPT_TEXT_BLOCK_HEIGHT,
                      defaultNodeSize,
                      buildVlmNodeSizePatch,
                      isNodeCollapsed: (node) => isNodeCollapsed(node),
                      getVisibleUploadSlots: (node) => getVisibleUploadSlots(node),
                      getVisibleClassicUploadSlots: (node) => getVisibleClassicUploadSlots(node),
                      getPresetConfigKinds: () => PRESET_CONFIG_KINDS,
                      getVisiblePresetParams: (node) => getVisiblePresetParams(node),
                      getMeasuredNodeLayout: (...args) => CANVAS_NODE_RENDER_CONTROLLER?.getMeasuredNodeLayout?.(...args) || null,
                  },
                  projectSource: {
                      hasProject: () => !!project,
                      getProjectNodes: () => project?.nodes || [],
                      getProjectEdges: () => project?.edges || [],
                  },
                  viewportSource: {
                      getVisibleWorldRect: (...args) => CANVAS_VIEWPORT_RENDER_CONTROLLER?.getVisibleWorldRect?.(...args) || {},
                      viewportFindOpenNodePosition,
                      viewportGetNodeRect,
                  },
                  patchSource: {
                      buildResultLayoutPatch,
                      buildNodeLayoutPatch: (...args) => CANVAS_NODE_FACTORY_CONTROLLER?.buildNodeLayoutPatch?.(...args) || {},
                  },
                  persistenceSource: {
                      scheduleSave: (...args) => scheduleSave(...args),
                  },
              },
              viewportRenderSource: {
                  projectSource: {
                      getProject: () => project,
                  },
                  viewportSource: {
                      getViewport: () => viewport,
                      viewportGetVisibleWorldRect,
                      viewportGetNodeRenderWorldRect,
                      viewportShouldRenderNodeInViewport,
                      viewportShouldRenderEdgeInViewport,
                      viewportGetEdgeSvgBounds,
                  },
                  layoutSource: {
                      defaultNodeSize,
                      getNodeLayoutSize: (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.getNodeLayoutSize?.(...args),
                  },
                  selectionSource: {
                      getSelectedNodeId: () => selectedNodeId,
                      getSelectedNodeIds: () => selectedNodeIds,
                      getSelectedEdgeId: () => selectedEdgeId,
                  },
                  connectionSource: {
                      getConnectingFromId: () => getConnectingFromId(),
                  },
                  nodeSource: {
                      isNodeVisuallyRunning,
                  },
                  configSource: {
                      nodeRenderOverscanPx: NODE_RENDER_OVERSCAN_PX,
                      edgeRenderOverscanPx: EDGE_RENDER_OVERSCAN_PX,
                      edgePointCacheMinEdges: EDGE_POINT_CACHE_MIN_EDGES,
                  },
              },
              viewportFitSource: {
                  projectSource: {
                      getProject: () => project,
                      ensureProjectGroups: () => ensureProjectGroups(),
                      getNode: (id) => getNode(id),
                      getGroup: (id) => getGroup(id),
                  },
                  groupSource: {
                      getGroupRect: (...args) => getGroupRect(...args),
                  },
                  selectionSource: {
                      getSelectedNodeId: () => selectedNodeId,
                      getSelectedGroupId: () => selectedGroupId,
                  },
                  layoutSource: {
                      defaultNodeSize: (...args) => defaultNodeSize(...args),
                  },
                  viewportSource: {
                      getViewport: () => viewport,
                      clamp: (...args) => clamp(...args),
                      applyProjectViewportPatch: (...args) => applyProjectViewportPatch(...args),
                  },
                  actionSource: {
                      focusGroup: (...args) => focusGroup(...args),
                  },
                  renderSource: {
                      renderAll: (...args) => renderAll(...args),
                  },
                  persistenceSource: {
                      scheduleSave: (...args) => scheduleSave(...args),
                  },
              },
              viewportZoomSource: {
                  projectSource: {
                      getProject: () => project,
                  },
                  viewportSource: {
                      getViewport: () => viewport,
                      clientToWorld: (...args) => clientToWorld(...args),
                      clamp: (...args) => clamp(...args),
                      applyProjectViewportPatch: (...args) => applyProjectViewportPatch(...args),
                  },
                  interactionSource: {
                      cancelPanEdgeSettleRender: (...args) => cancelPanEdgeSettleRender(...args),
                      cancelDragEdgeSettleRender: (...args) => cancelDragEdgeSettleRender(...args),
                      endDragEdgeLodVisual: (...args) => endDragEdgeLodVisual(...args),
                      beginWheelPreviewLod: (...args) => beginWheelPreviewLod(...args),
                  },
                  renderSource: {
                      preferSvgEdgesForViewportInteraction: (...args) => preferSvgEdgesForViewportInteraction(...args),
                      applyViewport: (...args) => applyViewport(...args),
                      scheduleViewportNodeRender: (...args) => scheduleViewportNodeRender(...args),
                      scheduleViewportZoomSettleRender: (...args) => scheduleViewportZoomSettleRender(...args),
                      renderStatus: (...args) => renderStatus(...args),
                      updateMinimapForViewportInteraction: (...args) => updateMinimapForViewportInteraction(...args),
                  },
                  persistenceSource: {
                      scheduleViewportSave: (...args) => scheduleViewportSave(...args),
                  },
              },
              nodeSpatialIndexSource: {
                  projectSource: {
                      getProject: () => project,
                  },
                  layoutSource: {
                      getNodeRect: (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.getNodeRect?.(...args),
                  },
                  nodeSource: {
                      isNodeVisuallyRunning,
                      isResultRefreshing,
                  },
                  viewportSource: {
                      shouldRenderNodeInViewport: (...args) => CANVAS_VIEWPORT_RENDER_CONTROLLER?.shouldRenderNodeInViewport?.(...args),
                      getCanvasRenderMode: () => getCanvasRenderMode(),
                  },
                  runtimeSource: {
                      getPerfStats: () => perfStats,
                      isPanning: () => isPanning(),
                  },
                  configSource: {
                      nodeSpatialIndexMinNodes: NODE_SPATIAL_INDEX_MIN_NODES,
                      nodeSpatialIndexCellSize: NODE_SPATIAL_INDEX_CELL_SIZE,
                      canvasOverviewExitZoom: CANVAS_OVERVIEW_EXIT_ZOOM,
                      panPreviewNodeBudget: PAN_PREVIEW_NODE_BUDGET,
                      nodeRenderOverscanPx: NODE_RENDER_OVERSCAN_PX,
                      panPreviewDeferCoveragePadPx: PAN_PREVIEW_DEFER_COVERAGE_PAD_PX,
                  },
                  utilitySource: {
                      rectsOverlap: viewportRectsOverlap,
                  },
                  renderSource: {
                      setNodeRenderCoverageRect: (...args) => CANVAS_NODE_RENDER_CONTROLLER?.setNodeRenderCoverageRect?.(...args),
                  },
                  selectionSource: {
                      getSelectedNodeId: () => selectedNodeId,
                      getSelectedNodeIds: () => selectedNodeIds,
                  },
                  connectionSource: {
                      getConnectingFromId: () => getConnectingFromId(),
                  },
                  interactionSource: {
                      getDraggingNodeIds: () => getDraggingNodeIds(),
                      getNodeResizeNodeId: () => getNodeResizeNodeId(),
                      getActiveInlineTagCartNodeId: () => activeInlineTagCartNodeId,
                  },
              },
              nodeFactorySource: {
                  languageSource: {
                      t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                  },
                  runtimeSource: {
                      uid,
                      cloneRunValue,
                      nowIso,
                  },
                  presetSource: {
                      normalizePresetName,
                      canvasAgentPresetPromptDefaults,
                      getClassicIpTypes,
                      enhanceRegionKey,
                      registryClassicEnhanceRegionDefaults,
                      registryClassicIpControlTypes,
                      getVisiblePresetParams: (...args) => CANVAS_PRESET_NODE_RENDERER?.getVisiblePresetParams?.(...args) || [],
                      getVisibleUploadSlots,
                      ensurePresetSpecialControllerState,
                  },
              },
              nodeRendererSource: {
                 languageSource: {
                     t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                     mediaBrowserLabel,
                     tagCartLabel,
                     localizeCanvasLabel,
                     getDetectionConfigLabel,
                 },
                 utilitySource: {
                     escapeHtml,
                 },
                 nodeSource: {
                     isDirectorTimelineNode,
                     isQwenTtsNode,
                     nodeStatusState,
                     getNode,
                     isNodeLocked,
                     isNodeIgnored,
                     isNodeCollapsed,
                 },
                 assetSource: {
                     getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
                     getVlmSourceAsset,
                     getTimelineSourceAsset,
                     safeAssetDisplaySrc: (...args) => CANVAS_PROJECT_ASSETS_CONTROLLER?.safeAssetDisplaySrc?.(...args) || '',
                     readAssetInfo,
                 },
                 portSource: {
                     getVisibleClassicUploadSlots,
                     getVisibleUploadSlots,
                     detectionSlotForRegion,
                     textMergeInputSlots,
                     qwenTtsAudioInputSlots,
                     batchAnyPortKind,
                     getUploadSlotMediaKind,
                     getPresetConfigKinds: () => PRESET_CONFIG_KINDS,
                     getVlmImageSlots: () => VLM_IMAGE_SLOTS,
                     getDirectorTimelineMediaKindGroups: () => directorTimelineMediaKindGroups,
                 },
                 renderSource: {
                     renderConfigNodeHtml,
                     renderClassicNodeHtml: (...args) => CANVAS_PRESET_NODE_RENDERER?.renderClassicNodeHtml?.(...args) || '',
                     renderPresetNodeHtml: (...args) => CANVAS_PRESET_NODE_RENDERER?.renderPresetNodeHtml?.(...args) || '',
                     renderResultNodeHtml: (...args) => CANVAS_ASSET_NODE_RENDERER?.renderResultNodeHtml?.(...args) || '',
                     renderCompareNodeHtml,
                     renderBatchAnyNodeHtml: (...args) => CANVAS_ASSET_NODE_RENDERER?.renderBatchAnyNodeHtml?.(...args) || '',
                     renderXyzMatrixNodeHtml,
                     renderTimelineNodeHtml,
                     renderDirectorTimelineNodeHtml,
                     renderMediaBrowserNodeHtml: (...args) => CANVAS_ASSET_NODE_RENDERER?.renderMediaBrowserNodeHtml?.(...args) || '',
                     renderStyleSelectorNodeHtml,
                     renderVideoNodeHtml,
                     renderAudioNodeHtml,
                     renderNoteNodeHtml,
                     renderWildcardsHelperNodeHtml,
                     renderTextNodeHtml,
                     renderTextMergeNodeHtml,
                     renderTranslationNodeHtml,
                     renderTagCartNodeHtml,
                     renderWd14NodeHtml,
                     renderVlmNodeHtml,
                     renderMaskNodeHtml: (...args) => CANVAS_ASSET_NODE_RENDERER?.renderMaskNodeHtml?.(...args) || '',
                     renderSam3VideoMaskNodeHtml,
                     renderCameraMotionNodeHtml,
                     renderPoseStudioNodeHtml,
                     renderGaussianStudioNodeHtml,
                     renderLivePortraitExpressionNodeHtml,
                     renderQwenTtsNodeHtml,
                     renderImageNodeHtml,
                     collapsedKeepClass,
                 },
                 statusSource: {
                     isResultRefreshing,
                     isResultStale,
                     isCanvasRunActiveState,
                 },
                  mediaSource: {
                      mediaBrowserRuntimeFor: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserRuntimeFor(...args),
                 },
             },
             nodeRenderSource: {
                domSource: {
                    getRoot: () => root,
                    getNodesLayer: () => nodesLayer,
                    getGroupsLayer: () => groupsLayer,
                    getEdgesLayer: () => edgesLayer,
                    getChainRunOverlay: () => chainRunOverlay,
                    getDocument: () => document,
                },
                projectSource: {
                    getProject: () => project,
                    getNode,
                },
                selectionSource: {
                    getSelectedNodeId: () => selectedNodeId,
                    getSelectedNodeIds: () => selectedNodeIds,
                },
                runtimeSource: {
                    getPerfStats: () => perfStats,
                    performanceNow: () => canvasPerformanceNow(),
                    getMediaBrowserNodeRuntime: () => mediaBrowserNodeRuntime,
                    getMediaBrowserScrollMemory: () => getMediaBrowserScrollMemory(),
                    getVlmChatScrollMemory: () => getVlmChatScrollMemory(),
                    getVlmRenderDebugEnabled: () => getVlmRenderDebugEnabled(),
                    requestAnimationFrame: (callback) => requestCanvasFrame(callback),
                    setTimeout: (...args) => window.setTimeout(...args),
                },
                edgeSource: {
                    setEdgeRenderCacheKey: (value) => { edgeRenderCacheKey = value; },
                    setEdgeIncidentIndex,
                    setActiveInlineTagCartNodeId: (value) => { activeInlineTagCartNodeId = value; },
                    clearTempEdge,
                    cancelEdgeIncidentIndexWarmup,
                    clearEdgeCanvas,
                    invalidateMinimapStaticCache: (...args) => CANVAS_MINIMAP_CONTROLLER?.invalidateMinimapStaticCache?.(...args),
                },
                utilitySource: {
                    cssEscape: (value) => CSS.escape(value),
                },
                viewportSource: {
                    updateCanvasRenderMode,
                    rectContainsRect: viewportRectContainsRect,
                    getNodeRenderWorldRect: (...args) => CANVAS_VIEWPORT_RENDER_CONTROLLER?.getNodeRenderWorldRect?.(...args),
                    getVisibleNodeRecords: (...args) => CANVAS_NODE_SPATIAL_INDEX_CONTROLLER?.getVisibleNodeRecords?.(...args) || { nodes: [], projectIds: new Set() },
                    isPanning: (...args) => CANVAS_PAN_CONTROLLER?.isPanning?.(...args) || false,
                    scheduleMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.scheduleMinimapRender?.(...args),
                    renderMinimap: (...args) => CANVAS_MINIMAP_CONTROLLER?.renderMinimap?.(...args),
                    positionCanvasAgentPanel,
                },
                renderModeSource: {
                    getCanvasRenderMode: () => getCanvasRenderMode(),
                    getConnectingFromId: () => getConnectingFromId(),
                    isDraggingNode: (id) => isDraggingNode(id),
                    getNodeResizeNodeId: () => getNodeResizeNodeId(),
                    getActiveInlineTagCartNodeId: () => activeInlineTagCartNodeId,
                    isResultRefreshing: (node) => isResultRefreshing(node),
                },
                layoutSource: {
                    getNodeLayoutSize: (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.getNodeLayoutSize?.(...args),
                    ensureVlmNodeModeSize,
                    ensureResultNodeReadableSize: (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.ensureResultNodeReadableSize?.(...args) || false,
                    ensureMediaBrowserNodeReadableSize: (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.ensureMediaBrowserNodeReadableSize?.(...args) || false,
                    defaultNodeSize,
                    supportsCollapsedPromptHeight,
                    collapsedPromptNodeHeight,
                    shouldFixNodeHeight,
                },
                nodeSource: {
                    isNodeCollapsed,
                    isNodeLocked,
                    isNodeIgnored,
                    isImageNodeFrameless,
                    isNodeVisuallyRunning,
                    isNodeSchedulerBlocked,
                    isNodeSchedulerWaiting,
                    isResultStale,
                    nodeOverviewRenderSignature,
                    nodeRenderSignature,
                },
                assetSource: {
                    getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
                    resultPreviewAspectSource: (...args) => CANVAS_ASSET_NODE_RENDERER?.resultPreviewAspectSource?.(...args),
                    mediaBrowserRuntimeFor: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserRuntimeFor(...args),
                    refreshMediaBrowserNode: (...args) => CANVAS_MEDIA_BROWSER_DATA_CONTROLLER.refreshMediaBrowserNode(...args),
                    captureVlmChatScroll,
                    captureMediaBrowserScroll,
                    restoreVlmChatScroll,
                    refreshVlmChatReadabilityDom,
                    restoreMediaBrowserScroll,
                    syncResultPreviewPlayerDom: (...args) => CANVAS_RESULT_PREVIEW_CONTROLLER?.syncResultPreviewPlayerDom?.(...args),
                },
                renderSource: {
                    logVlmRenderKeyChange,
                    applyNodeCustomColorVars,
                    renderNodeHtml: (...args) => CANVAS_NODE_RENDERER?.renderNodeHtml?.(...args) || '',
                    ensureWorkbenchFormFieldNames,
                    ensureNodeCollapseButton,
                    ensureNodeResizeHandle,
                    bindNodeEvents,
                    restoreInlineTagCartAfterRender,
                    syncOutpaintOverlayPosition,
                    renderEdges,
                },
                presetSource: {
                    getPresetSpecialControllerKind: (...args) => CANVAS_PRESET_NODE_RENDERER?.getPresetSpecialControllerKind?.(...args),
                    bindPresetSpecialViewerEvents: (...args) => bindPresetSpecialViewerEvents(...args),
                    refreshPresetSpecialNodeDom,
                },
                spatialSource: {
                    refreshNodeSpatialIndexRecord: (...args) => CANVAS_NODE_SPATIAL_INDEX_CONTROLLER?.refreshNodeSpatialIndexRecord?.(...args),
                    invalidateNodeSpatialIndex: (...args) => CANVAS_NODE_SPATIAL_INDEX_CONTROLLER?.invalidateNodeSpatialIndex?.(...args),
                },
            },
            selectionSource: {
                languageSource: {
                    getLanguageState: () => ({ __lang: runtimeUiLang() }),
                    t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                },
                projectSource: {
                    getProject: () => project,
                },
                selectionSource: {
                    getSelectionState: () => ({
                        selectedNodeId,
                        selectedNodeIds: new Set(selectedNodeIds),
                        selectedEdgeId,
                        selectedGroupId,
                    }),
                    setSelectionState: (state) => {
                        const next = state || {};
                        selectedNodeId = next.selectedNodeId || null;
                        selectedNodeIds = next.selectedNodeIds instanceof Set
                            ? new Set(next.selectedNodeIds)
                            : new Set(Array.isArray(next.selectedNodeIds) ? next.selectedNodeIds : []);
                        selectedEdgeId = next.selectedEdgeId || null;
                        selectedGroupId = next.selectedGroupId || null;
                    },
                    setSelectedNodeId: (value) => { selectedNodeId = value; },
                    setSelectedNodeIds: (values) => { selectedNodeIds = new Set(values || []); },
                    setSelectedEdgeId: (value) => { selectedEdgeId = value; },
                    setSelectedGroupId: (value) => { selectedGroupId = value; },
                },
                domSource: {
                    getNodesLayer: () => nodesLayer,
                    getEdgesLayer: () => edgesLayer,
                    getGroupsLayer: () => groupsLayer,
                },
                nodeSource: {
                    getNode,
                    isNodeLocked,
                },
                layoutSource: {
                    getNodeRect: (...args) => viewportGetNodeRect(...args),
                },
                viewportSource: {
                    getCanvasRenderMode: () => getCanvasRenderMode(),
                    snapCanvasCoord: (value) => snapCanvasCoord(value),
                },
                patchSource: {
                    buildNodeLayoutPatch: (...args) => CANVAS_NODE_FACTORY_CONTROLLER?.buildNodeLayoutPatch?.(...args),
                    buildNodeFlagPatch: (...args) => CANVAS_NODE_FACTORY_CONTROLLER?.buildNodeFlagPatch?.(...args),
                },
                renderSource: {
                    renderNodes: (...args) => CANVAS_NODE_RENDER_CONTROLLER?.renderNodes?.(...args),
                    renderEdges,
                    renderSelectedChainOverlay,
                    renderInspector,
                    renderAll: (...args) => CANVAS_RENDER_CONTROLLER?.renderAll?.(...args),
                },
                minimapSource: {
                    invalidateMinimapStaticCache: (...args) => CANVAS_MINIMAP_CONTROLLER?.invalidateMinimapStaticCache?.(...args),
                    renderMinimap: (...args) => CANVAS_MINIMAP_CONTROLLER?.renderMinimap?.(...args),
                },
                historySource: {
                    pushHistory: (...args) => CANVAS_HISTORY_CONTROLLER?.pushHistory?.(...args),
                },
                uiStateSource: {
                    renderCanvasAgentPanel,
                    mutate,
                    showToast,
                },
                runtimeSource: {
                    setTimeout: (...args) => window.setTimeout(...args),
                },
            },
            graphDeleteSource: {
                languageSource: {
                    getLanguageState: () => ({ __lang: runtimeUiLang() }),
                    t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                },
                projectSource: {
                    getProject: () => project,
                },
                selectionSource: {
                    getSelectionState: () => ({
                        selectedNodeId,
                        selectedNodeIds: new Set(selectedNodeIds),
                        selectedEdgeId,
                        selectedGroupId,
                    }),
                    setSelectionState: (state) => {
                        const next = state || {};
                        selectedNodeId = next.selectedNodeId || null;
                        selectedNodeIds = next.selectedNodeIds instanceof Set
                            ? new Set(next.selectedNodeIds)
                            : new Set(Array.isArray(next.selectedNodeIds) ? next.selectedNodeIds : []);
                        selectedEdgeId = next.selectedEdgeId || null;
                        selectedGroupId = next.selectedGroupId || null;
                    },
                },
                nodeSource: {
                    getNode,
                    isNodeLocked,
                    isQwenTtsNode,
                    isDirectorTimelineNode,
                },
                patchSource: {
                    buildProjectNodesPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildProjectNodesPatch?.(...args),
                    buildProjectEdgeFilterPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildProjectEdgeFilterPatch?.(...args),
                    buildPresetUploadSlotPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildPresetUploadSlotPatch?.(...args),
                    buildPresetTextInputPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildPresetTextInputPatch?.(...args),
                    buildPresetConfigPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildPresetConfigPatch?.(...args),
                    buildTextNodeStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildTextNodeStatePatch?.(...args),
                    buildTextMergeStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildTextMergeStatePatch?.(...args),
                    buildCompareStatePatch: (...args) => compareNodeBuildStatePatch(...args),
                    buildTimelineClipDeletePatch: timelineBuildClipDeletePatch,
                    buildBatchAnyStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildBatchAnyStatePatch?.(...args),
                    buildClassicNodeStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildClassicNodeStatePatch?.(...args),
                    buildSpecialNodeConnectionPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildSpecialNodeConnectionPatch?.(...args),
                    buildStyleSelectorStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildStyleSelectorStatePatch?.(...args),
                    buildSam3SourcePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildSam3SourcePatch?.(...args),
                    buildMaskStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildMaskStatePatch?.(...args),
                    buildDirectorTimelineStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildDirectorTimelineStatePatch?.(...args),
                    buildTranslationStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildTranslationStatePatch?.(...args),
                    buildTagCartStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildTagCartStatePatch?.(...args),
                    buildWd14StatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildWd14StatePatch?.(...args),
                    buildConfigStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildConfigStatePatch?.(...args),
                    buildVlmImageInputsPatch,
                    buildQwenTtsStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildQwenTtsStatePatch?.(...args),
                    buildResultProducerPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildResultProducerPatch?.(...args),
                },
                statusSource: {
                    mergeCanvasRunStatus: (...args) => mergeCanvasRunStatus(...args),
                    buildResultStatusPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildResultStatusPatch?.(...args),
                    buildVlmRunStatusPatch,
                    buildSam3StatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildSam3StatePatch?.(...args),
                    buildMaskStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildMaskStatePatch?.(...args),
                    buildSpecialNodeStatusPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildSpecialNodeStatusPatch?.(...args),
                    buildTranslationStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildTranslationStatePatch?.(...args),
                    buildWd14StatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildWd14StatePatch?.(...args),
                    updateDirectorStatus,
                },
                actionSource: {
                    deleteSelectedGroup,
                    deleteTimelineClipById: (...args) => deleteTimelineClipById(...args),
                    stopResultPreviewPlayer: (...args) => CANVAS_RESULT_PREVIEW_CONTROLLER?.stopResultPreviewPlayer?.(...args),
                    interruptDeletedResultRuns,
                    getOutpaintOverlayState: () => outpaintOverlayState,
                    hideOutpaintOverlay,
                    getActiveInlineTagCartNodeId: () => activeInlineTagCartNodeId,
                    setActiveInlineTagCartNodeId: (value) => { activeInlineTagCartNodeId = value; },
                    handleCanvasAgentWorkflowNodeDeletion: (...args) => CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER?.handleCanvasAgentWorkflowNodeDeletion?.(...args),
                    handleCanvasAgentWorkflowEdgeDeletion: (...args) => CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER?.handleCanvasAgentWorkflowEdgeDeletion?.(...args),
                    refreshBatchAnyActiveItem,
                },
                renderSource: {
                    refreshPresetSpecialNodeDom,
                },
                historySource: {
                    pushHistory: (...args) => CANVAS_HISTORY_CONTROLLER?.pushHistory?.(...args),
                },
                persistenceSource: {
                    scheduleSave: (...args) => scheduleSave(...args),
                    mutate,
                },
                utilitySource: {
                    parseDetectionSlot,
                    configKeyForKind,
                },
                 uiSource: {
                     showToast,
                 },
             },
             resolutionDragSource: {
                 domSource: {
                     getDocument: () => document,
                 },
                 configSource: {
                     getResolutionRenderValues: (node) => getResolutionRenderValues(node),
                     getResolutionPreview: (values) => getResolutionPreview(values, []),
                     buildConfigStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildConfigStatePatch?.(...args),
                     applyConfigNodeToPreset: (node) => applyConfigNodeToPreset(node),
                 },
                 utilitySource: {
                     clamp,
                     quantizeResolutionValue: (value, step) => quantizeResolutionValue(value, step),
                     nowIso,
                 },
                 persistenceSource: {
                     scheduleSave: (...args) => scheduleSave(...args),
                 },
             },
             clipboardSource: {
                 languageSource: {
                     getLanguageState: () => ({ __lang: runtimeUiLang() }),
                     t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                 },
                 projectSource: {
                     getProject: () => project,
                 },
                 selectionSource: {
                     getSelectionState: () => ({
                         selectedNodeId,
                         selectedNodeIds: new Set(selectedNodeIds),
                         selectedEdgeId,
                         selectedGroupId,
                     }),
                     setSelectionState: (state) => {
                         const next = state || {};
                         selectedNodeId = next.selectedNodeId || null;
                         selectedNodeIds = next.selectedNodeIds instanceof Set
                             ? new Set(next.selectedNodeIds)
                             : new Set(Array.isArray(next.selectedNodeIds) ? next.selectedNodeIds : []);
                         selectedEdgeId = next.selectedEdgeId || null;
                         selectedGroupId = next.selectedGroupId || null;
                     },
                     getSelectedNodeIdList: (...args) => CANVAS_SELECTION_CONTROLLER?.getSelectedNodeIdList?.(...args) || [],
                 },
                 nodeSource: {
                     getNode,
                     textMergeInputSlots,
                     isTextOutputNode,
                     wouldCreateTextCycle,
                     isPoseStudioImageSource,
                     isLivePortraitExpressionImageSource,
                     isVlmMediaSource,
                     isSam3VideoMaskSource,
                     isQwenTtsAudioSource,
                     isQwenTtsNode,
                     isDirectorTimelineNode,
                     isDirectorMediaSourceForSlot,
                     isImageCompareSource,
                     isTimelineSource,
                 },
                 layoutSource: {
                     getNodeRect: (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.getNodeRect?.(...args) || null,
                 },
                 configSource: {
                     getVlmImageSlots: () => VLM_IMAGE_SLOTS,
                     getVisibleClassicUploadSlots,
                     getVisibleUploadSlots,
                     normalizeTimelineNode: timelineNormalizeNode,
                     applyConfigNodeToPreset,
                 },
                 patchSource: {
                     buildProjectNodesPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildProjectNodesPatch?.(...args),
                     buildProjectEdgeAppendPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildProjectEdgeAppendPatch?.(...args),
                     buildNodeFlagPatch: (...args) => CANVAS_NODE_FACTORY_CONTROLLER?.buildNodeFlagPatch?.(...args),
                     buildSpecialNodeConnectionPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildSpecialNodeConnectionPatch?.(...args),
                     buildSam3SourcePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildSam3SourcePatch?.(...args),
                     buildMaskStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildMaskStatePatch?.(...args),
                     buildStyleSelectorStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildStyleSelectorStatePatch?.(...args),
                     buildDirectorTimelineStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildDirectorTimelineStatePatch?.(...args),
                     buildTranslationStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildTranslationStatePatch?.(...args),
                     buildTagCartStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildTagCartStatePatch?.(...args),
                     buildWd14StatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildWd14StatePatch?.(...args),
                     buildWildcardsHelperStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildWildcardsHelperStatePatch?.(...args),
                     buildConfigStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildConfigStatePatch?.(...args),
                     buildPresetConfigPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildPresetConfigPatch?.(...args),
                     buildPresetUploadSlotPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildPresetUploadSlotPatch?.(...args),
                     buildClassicNodeStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildClassicNodeStatePatch?.(...args),
                     buildNodeLayoutPatch: (...args) => CANVAS_NODE_FACTORY_CONTROLLER?.buildNodeLayoutPatch?.(...args),
                     buildPresetTextInputPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildPresetTextInputPatch?.(...args),
                     buildTextMergeStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildTextMergeStatePatch?.(...args),
                     buildTextNodeStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildTextNodeStatePatch?.(...args),
                     buildCompareStatePatch: (...args) => compareNodeBuildStatePatch(...args),
                     buildNoteStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildNoteStatePatch?.(...args),
                     buildVlmChatStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildVlmChatStatePatch?.(...args),
                     buildVlmParamsPatch,
                     buildVlmImageInputsPatch,
                     buildResultProducerPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildResultProducerPatch?.(...args),
                     buildQwenTtsStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildQwenTtsStatePatch?.(...args),
                     buildPoseStudioStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildPoseStudioStatePatch?.(...args),
                     buildGaussianStudioStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildGaussianStudioStatePatch?.(...args),
                     buildLivePortraitNodeStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildLivePortraitNodeStatePatch?.(...args),
                     buildLivePortraitVideoExpressionStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildLivePortraitVideoExpressionStatePatch?.(...args),
                 },
                 statusSource: {
                     mergeCanvasRunStatus: (...args) => mergeCanvasRunStatus(...args),
                     buildResultStatusPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildResultStatusPatch?.(...args),
                     buildVlmRunStatusPatch,
                     buildMaskStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildMaskStatePatch?.(...args),
                     buildTranslationStatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildTranslationStatePatch?.(...args),
                     buildWd14StatePatch: (...args) => CANVAS_FACTORY_CONTEXT.buildWd14StatePatch?.(...args),
                     buildSpecialNodeStatusPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildSpecialNodeStatusPatch?.(...args),
                     buildCanvasNodeStatusPatch: (...args) => CANVAS_RUN_STATUS_CONTROLLER?.buildCanvasNodeStatusPatch?.(...args),
                 },
                 actionSource: {
                     addTimelineClipFromSource,
                     updateDirectorStatus,
                 },
                 historySource: {
                     pushHistory: (...args) => CANVAS_HISTORY_CONTROLLER?.pushHistory?.(...args),
                 },
                 persistenceSource: {
                     mutate,
                 },
                 utilitySource: {
                     cloneRunValue,
                     uid,
                     nowIso,
                 },
                 viewportSource: {
                     viewportCenterWorld,
                 },
                 uiSource: {
                     showToast,
                 },
             },
             groupInteractionSource: {
                 languageSource: {
                     getLanguageState: () => ({ __lang: runtimeUiLang() }),
                     t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                 },
                 factorySource: {
                     buildAreaGroup: (...args) => buildAreaGroup(...args),
                 },
                 projectSource: {
                     getProject: () => project,
                     buildProjectGroupAppendPatch: (...args) => buildProjectGroupAppendPatch(...args),
                     buildProjectGroupDeletePatch: (...args) => buildProjectGroupDeletePatch(...args),
                 },
                 domSource: {
                     getGroupsLayer: () => groupsLayer,
                     getDocument: () => document,
                 },
                 groupSource: {
                     getGroup: (id) => getGroup(id),
                     getNodesInsideGroup: (group) => getNodesInsideGroup(group),
                     getGroupRect: (...args) => getGroupRect(...args),
                     selectedNodesBounds: (...args) => selectedNodesBounds(...args),
                     getSelectedGroupId: () => selectedGroupId,
                 },
                 nodeSource: {
                     getNode,
                     isNodeLocked,
                 },
                 selectionSource: {
                     selectGroupLight: (...args) => CANVAS_SELECTION_CONTROLLER?.selectGroupLight?.(...args),
                     setGroupSelection: id => CANVAS_SELECTION_CONTROLLER.setGroupSelectionState(id),
                 },
                 layoutSource: {
                     buildNodeLayoutPatch: (...args) => CANVAS_NODE_FACTORY_CONTROLLER?.buildNodeLayoutPatch?.(...args),
                 },
                 patchSource: {
                     buildGroupFieldPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildGroupFieldPatch?.(...args),
                 },
                 viewportSource: {
                     snapCanvasCoord,
                     snapCanvasSizeFromOrigin,
                     viewportCenterWorld: (...args) => viewportCenterWorld(...args),
                     centerViewportOnWorld: (...args) => centerViewportOnWorld(...args),
                 },
                 renderSource: {
                     beginDragEdgeLod: (...args) => beginDragEdgeLod(...args),
                     isDragEdgeLodActive: (...args) => isDragEdgeLodActive(...args),
                     scheduleDragEdgeSettleRender: (...args) => scheduleDragEdgeSettleRender(...args),
                     flushInteractiveLinkRender: (...args) => flushInteractiveLinkRender(...args),
                     updateGroupPositionDom: (...args) => updateGroupPositionDom(...args),
                     updateNodePositionDom: (...args) => updateNodePositionDom(...args),
                     scheduleInteractiveLinkRender: (...args) => scheduleInteractiveLinkRender(...args),
                     renderGroups: (...args) => renderGroups(...args),
                     renderInspector: (...args) => renderInspector(...args),
                     mutate: (...args) => mutate(...args),
                 },
                 minimapSource: {
                     invalidateMinimapStaticCache: (...args) => CANVAS_MINIMAP_CONTROLLER?.invalidateMinimapStaticCache?.(...args),
                     invalidateNodeSpatialIndex: (...args) => CANVAS_NODE_SPATIAL_INDEX_CONTROLLER?.invalidateNodeSpatialIndex?.(...args),
                     scheduleMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.scheduleMinimapRender?.(...args),
                     flushMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.flushMinimapRender?.(...args),
                 },
                 actionSource: {
                     updateGroupField: (...args) => updateGroupField(...args),
                 },
                 historySource: {
                     pushHistory: (...args) => CANVAS_HISTORY_CONTROLLER?.pushHistory?.(...args),
                     pushHistoryBatch: (...args) => pushHistoryBatch(...args),
                 },
                 persistenceSource: {
                     scheduleSave: (...args) => scheduleSave(...args),
                 },
                 uiSource: {
                     showToast,
                     openContextMenu: (...args) => openContextMenu(...args),
              },
             },
              runPanelsSource: {
                 languageSource: {
                     getLanguageState: () => ({ __lang: runtimeUiLang() }),
                     t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                 },
                 projectSource: {
                     getProject: () => project,
                 },
                 domSource: {
                     getRoot: () => root,
                     getRunQueuePanel: () => runQueuePanel,
                     getRunHistoryPanel: () => runHistoryPanel,
                 },
                 stateSource: {
                     getRunHistorySelectedId: () => null,
                     setRunHistorySelectedId: () => {},
                 },
                 queueSource: {
                     openPanel: runQueueOpenPanel,
                     closePanel: runQueueClosePanel,
                     renderPanel: runQueueRenderPanel,
                     handleAction: runQueueHandleAction,
                 },
                 historySource: {
                     openPanel: runHistoryOpenPanel,
                     closePanel: runHistoryClosePanel,
                     renderPanel: runHistoryRenderPanel,
                     handleAction: runHistoryHandleAction,
                 },
                 statusSource: {
                     isTerminalRunState,
                 },
                 utilitySource: {
                     escapeHtml,
                     formatLocalTime,
                 },
                 timeSource: {
                     parseDate: (value) => Date.parse(value || ''),
                 },
                 clipboardSource: {
                     writeText: (value) => {
                         const clipboard = window.navigator?.clipboard;
                         return clipboard && typeof clipboard.writeText === 'function'
                             ? clipboard.writeText(value)
                             : false;
                     },
                 },
                 uiSource: {
                     showToast,
                 },
                 nodeSource: {
                     getNode,
                 },
                 actionSource: {
                     closeCanvasSettingsPanel: (...args) => closeCanvasSettingsPanel(...args),
                     controlResultRun: (...args) => controlResultRun(...args),
                     retryResultRun: (...args) => retryResultRun(...args),
                     selectAndFitNode: (node) => {
                         if (!node) return;
                         CANVAS_SELECTION_CONTROLLER?.selectNode?.(node.id);
                         fitSelection();
                     },
                 },
                  renderSource: {
                      renderRunQueueWidget: (...args) => CANVAS_RUN_STATUS_CONTROLLER?.renderRunQueueWidget?.(...args),
                  },
              },
              nodeResizeSource: {
                  projectSource: {
                      getProject: () => project,
                  },
                  domSource: {
                      getDocument: () => document,
                  },
                  nodeSource: {
                      getNode,
                      isNodeLocked,
                  },
                  layoutSource: {
                      getNodeRect: (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.getNodeRect?.(...args) || null,
                      minResizableNodeSize: (...args) => CANVAS_NODE_LAYOUT_CONTROLLER?.minResizableNodeSize?.(...args) || null,
                      supportsCollapsedPromptHeight,
                      collapsedPromptNodeHeight,
                  },
                  selectionSource: {
                      getSelectionState: () => ({
                          selectedNodeId,
                          selectedNodeIds: new Set(selectedNodeIds),
                          selectedEdgeId,
                          selectedGroupId,
                      }),
                      setSelectionState: (state) => {
                          const next = state || {};
                          selectedNodeId = next.selectedNodeId || null;
                          selectedNodeIds = next.selectedNodeIds instanceof Set
                              ? new Set(next.selectedNodeIds)
                              : new Set(Array.isArray(next.selectedNodeIds) ? next.selectedNodeIds : []);
                          selectedEdgeId = next.selectedEdgeId || null;
                          selectedGroupId = next.selectedGroupId || null;
                      },
                      refreshSelectionUi: (...args) => CANVAS_SELECTION_CONTROLLER?.refreshSelectionUi?.(...args),
                      getSelectedNodeId: () => selectedNodeId,
                  },
                  utilitySource: {
                      clamp,
                  },
                  viewportSource: {
                      snapCanvasSizeFromOrigin,
                  },
                  patchSource: {
                      buildNodeLayoutPatch: (...args) => CANVAS_NODE_FACTORY_CONTROLLER?.buildNodeLayoutPatch?.(...args),
                  },
                  historySource: {
                      pushHistory: (...args) => CANVAS_HISTORY_CONTROLLER?.pushHistory?.(...args),
                  },
                  renderSource: {
                      updateNodePositionDom: (...args) => updateNodePositionDom(...args),
                      refreshNoteDom: (...args) => refreshNoteDom(...args),
                      scheduleInteractiveLinkRender: (...args) => scheduleInteractiveLinkRender(...args),
                      flushInteractiveLinkRender: (...args) => flushInteractiveLinkRender(...args),
                      renderInspector: (...args) => renderInspector(...args),
                  },
                  minimapSource: {
                      invalidateMinimapStaticCache: (...args) => CANVAS_MINIMAP_CONTROLLER?.invalidateMinimapStaticCache?.(...args),
                      invalidateNodeSpatialIndex: (...args) => CANVAS_NODE_SPATIAL_INDEX_CONTROLLER?.invalidateNodeSpatialIndex?.(...args),
                      scheduleMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.scheduleMinimapRender?.(...args),
                      flushMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.flushMinimapRender?.(...args),
                  },
                  persistenceSource: {
                      scheduleSave: (...args) => scheduleSave(...args),
                  },
              },
              nodeDragSource: {
                  languageSource: {
                      getLanguageState: () => ({ __lang: runtimeUiLang() }),
                      t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                  },
                  projectSource: {
                      getProject: () => project,
                  },
                  domSource: {
                      getDocument: () => document,
                  },
                  nodeSource: {
                      getNode,
                      getSelectedNodeIds: () => selectedNodeIds,
                      isNodeLocked,
                  },
                  selectionSource: {
                      getSelectedNodeIdList: (...args) => getSelectedNodeIdList(...args),
                      getSelectedNodeId: () => selectedNodeId,
                      getSelectedEdgeId: () => selectedEdgeId,
                      setSelectedNodeIds: (value) => { selectedNodeIds = value; },
                      setSelectedNodeId: (value) => { selectedNodeId = value; },
                      setSelectedEdgeId: (value) => { selectedEdgeId = value; },
                      toggleNodeSelectionLight: (...args) => toggleNodeSelectionLight(...args),
                      selectNodeLight: (...args) => selectNodeLight(...args),
                      refreshSelectionUi: (...args) => refreshSelectionUi(...args),
                  },
                  clipboardSource: {
                      duplicateSelection: (...args) => duplicateSelection(...args),
                  },
                  runtimeSource: {
                      performanceNow: () => canvasPerformanceNow(),
                  },
                  viewportSource: {
                      snapCanvasCoord,
                  },
                  patchSource: {
                      buildNodeLayoutPatch: (...args) => CANVAS_NODE_FACTORY_CONTROLLER?.buildNodeLayoutPatch?.(...args),
                  },
                  uiSource: {
                      hideCanvasTooltip: (...args) => hideCanvasTooltip(...args),
                      hideHoverPreview: (...args) => hideHoverPreview(...args),
                      closePreviewSelectMenu: (...args) => closePreviewSelectMenu(...args),
                      setSuppressWheelUntil: (value) => { suppressWheelUntil = value; },
                      showToast,
                  },
                  historySource: {
                      pushHistory: (...args) => CANVAS_HISTORY_CONTROLLER?.pushHistory?.(...args),
                  },
                  renderSource: {
                      renderAll: (...args) => renderAll(...args),
                      beginDragEdgeLod: (...args) => beginDragEdgeLod(...args),
                      updateNodePositionDom: (...args) => updateNodePositionDom(...args),
                      scheduleInteractiveLinkRender: (...args) => scheduleInteractiveLinkRender(...args),
                      isDragEdgeLodActive: () => isDragEdgeLodActive(),
                      scheduleDragEdgeSettleRender: (...args) => scheduleDragEdgeSettleRender(...args),
                      flushInteractiveLinkRender: (...args) => flushInteractiveLinkRender(...args),
                  },
                  minimapSource: {
                      invalidateMinimapStaticCache: (...args) => CANVAS_MINIMAP_CONTROLLER?.invalidateMinimapStaticCache?.(...args),
                      invalidateNodeSpatialIndex: (...args) => CANVAS_NODE_SPATIAL_INDEX_CONTROLLER?.invalidateNodeSpatialIndex?.(...args),
                      scheduleMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.scheduleMinimapRender?.(...args),
                      flushMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.flushMinimapRender?.(...args),
                  },
                  persistenceSource: {
                      scheduleSave: (...args) => scheduleSave(...args),
                  },
              },
              panSource: {
                  projectSource: {
                      getProject: () => project,
                  },
                  viewportSource: {
                      getViewport: () => viewport,
                      applyViewport: (...args) => applyViewport(...args),
                  },
                  domSource: {
                      getDocument: () => document,
                  },
                  runtimeSource: {
                      performanceNow: () => canvasPerformanceNow(),
                      getPerfStats: () => perfStats,
                  },
                  patchSource: {
                      buildProjectViewportPatch: (...args) => CANVAS_FACTORY_CONTEXT.buildProjectViewportPatch?.(...args),
                  },
                  uiSource: {
                      hideCanvasTooltip: (...args) => hideCanvasTooltip(...args),
                      hideHoverPreview: (...args) => hideHoverPreview(...args),
                      closePreviewSelectMenu: (...args) => closePreviewSelectMenu(...args),
                      setSuppressWheelUntil: (value) => { suppressWheelUntil = value; },
                  },
                  edgeSource: {
                      cancelPanEdgeSettleRender: (...args) => cancelPanEdgeSettleRender(...args),
                      cancelDragEdgeSettleRender: (...args) => cancelDragEdgeSettleRender(...args),
                      endDragEdgeLodVisual: (...args) => endDragEdgeLodVisual(...args),
                      preferSvgEdgesForViewportInteraction: (...args) => preferSvgEdgesForViewportInteraction(...args),
                      renderFinalEdgesAfterPan: () => {
                          if ((project.edges || []).length >= CANVAS_EDGE_FINAL_RENDER_MIN_EDGES) renderEdgesWithCanvasPreferred();
                          else renderEdgesWithSvgFallback();
                          renderSelectedChainOverlay();
                      },
                  },
                  minimapSource: {
                      updateMinimapForViewportInteraction: (...args) => CANVAS_MINIMAP_CONTROLLER?.updateMinimapForViewportInteraction?.(...args),
                      cancelMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.cancelMinimapRender?.(...args),
                      renderMinimap: (...args) => CANVAS_MINIMAP_CONTROLLER?.renderMinimap?.(...args),
                  },
                  renderSource: {
                      schedulePanNodeRender: (...args) => schedulePanNodeRender(...args),
                      clearPanNodeRenderTimer: (...args) => clearPanNodeRenderTimer(...args),
                      getVisibleWorldRect: (...args) => CANVAS_VIEWPORT_RENDER_CONTROLLER?.getVisibleWorldRect?.(...args) || {},
                      shouldDeferPanEdgeSettleRender: (...args) => shouldDeferPanEdgeSettleRender(...args),
                      renderNodes: (...args) => CANVAS_NODE_RENDER_CONTROLLER?.renderNodes?.(...args),
                      schedulePanEdgeSettleRender: (...args) => schedulePanEdgeSettleRender(...args),
                      renderPerformanceHud: (...args) => renderPerformanceHud(...args),
                  },
                  persistenceSource: {
                      scheduleSave: (...args) => scheduleSave(...args),
                  },
              },
              marqueeSource: {
                  viewportSource: {
                      getViewport: () => viewport,
                  },
                  domSource: {
                      getRoot: () => root,
                      getDocument: () => document,
                  },
                  windowSource: {
                      getWindow: () => window,
                  },
                  selectionSource: {
                      getSelectedNodeIds: () => selectedNodeIds,
                      getSelectionState: () => ({
                          selectedNodeId,
                          selectedNodeIds: new Set(selectedNodeIds),
                          selectedEdgeId,
                          selectedGroupId,
                      }),
                      setSelectionState: (state) => {
                          const next = state || {};
                          selectedNodeId = next.selectedNodeId || null;
                          selectedNodeIds = next.selectedNodeIds instanceof Set
                              ? new Set(next.selectedNodeIds)
                              : new Set(Array.isArray(next.selectedNodeIds) ? next.selectedNodeIds : []);
                          selectedEdgeId = next.selectedEdgeId || null;
                          selectedGroupId = next.selectedGroupId || null;
                      },
                      applyMarqueeSelection: (ids) => CANVAS_SELECTION_CONTROLLER?.setMarqueeSelectionState?.(ids),
                      updateSelectionDomClasses: (...args) => CANVAS_SELECTION_CONTROLLER?.updateSelectionDomClasses?.(...args),
                  },
                  runtimeSource: {
                      performanceNow: () => canvasPerformanceNow(),
                      getPerfStats: () => perfStats,
                  },
                  spatialSource: {
                      getMarqueeNodeRecords: (...args) => CANVAS_NODE_SPATIAL_INDEX_CONTROLLER?.getMarqueeNodeRecords?.(...args) || [],
                  },
                  utilitySource: {
                      clientToWorld: (...args) => clientToWorld(...args),
                  },
                  uiSource: {
                      hideCanvasTooltip: (...args) => hideCanvasTooltip(...args),
                      hideHoverPreview: (...args) => hideHoverPreview(...args),
                      closePreviewSelectMenu: (...args) => closePreviewSelectMenu(...args),
                      setSuppressWheelUntil: (value) => { suppressWheelUntil = value; },
                      renderCanvasAgentPanel: (...args) => renderCanvasAgentPanel(...args),
                  },
                  minimapSource: {
                      invalidateMinimapStaticCache: (...args) => CANVAS_MINIMAP_CONTROLLER?.invalidateMinimapStaticCache?.(...args),
                      scheduleMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.scheduleMinimapRender?.(...args),
                      flushMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.flushMinimapRender?.(...args),
                  },
                  renderSource: {
                      renderSelectedChainOverlay: (...args) => renderSelectedChainOverlay(...args),
                      renderInspector: (...args) => renderInspector(...args),
                  },
              },
              viewportPointerSource: {
                  languageSource: {
                      getLanguageState: () => ({ __lang: runtimeUiLang() }),
                      t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                  },
                  viewportSource: {
                      clientToWorld: (...args) => clientToWorld(...args),
                      setLastPointerWorld: (world) => { lastPointerWorld = world; },
                      getMode: () => mode,
                  },
                  domSource: {
                      getRoot: () => root,
                  },
                  uiSource: {
                      closeContextMenu: (...args) => CONTEXT_MENU_CONTROLLER?.closeContextMenu?.(...args),
                      isCanvasAgentPickingReference: () => !!canvasAgentState.pickReference,
                      setCanvasAgentPickingReference: (value) => { canvasAgentState.pickReference = !!value; },
                      addCanvasAgentReferenceFromNode: (...args) => addCanvasAgentReferenceFromNode(...args),
                      renderCanvasAgentPanel: (...args) => renderCanvasAgentPanel(...args),
                      setCanvasAgentMessage: (...args) => setCanvasAgentMessage(...args),
                  },
                  edgeSource: {
                      findCanvasEdgeAtClient: (...args) => findCanvasEdgeAtClient(...args),
                      selectEdge: (...args) => CANVAS_SELECTION_CONTROLLER?.selectEdge?.(...args),
                  },
                  spatialSource: {
                      findCanvasNodeAtWorldPoint: (...args) => CANVAS_NODE_SPATIAL_INDEX_CONTROLLER?.findCanvasNodeAtWorldPoint?.(...args),
                  },
                  nodeSource: {
                      getNode,
                      isNodeSelected: (nodeId) => selectedNodeIds instanceof Set
                          ? selectedNodeIds.has(nodeId)
                          : Array.isArray(selectedNodeIds) && selectedNodeIds.includes(nodeId),
                      getSelectedNodeId: () => selectedNodeId,
                      hasSelectedEdge: () => selectedEdgeId !== null && selectedEdgeId !== undefined,
                  },
                  selectionSource: {
                      selectNodeLight: (...args) => CANVAS_SELECTION_CONTROLLER?.selectNodeLight?.(...args),
                      toggleNodeSelectionLight: (...args) => CANVAS_SELECTION_CONTROLLER?.toggleNodeSelectionLight?.(...args),
                      focusSelectedNode: (nodeId) => {
                          CANVAS_SELECTION_CONTROLLER?.focusNodePreservingSelection?.(nodeId);
                          CANVAS_SELECTION_CONTROLLER?.refreshSelectionUi?.();
                      },
                  },
                  interactionSource: {
                      startPan: (...args) => CANVAS_PAN_CONTROLLER?.startPan?.(...args),
                      startNodeDrag: (...args) => CANVAS_NODE_DRAG_CONTROLLER?.startNodeDrag?.(...args),
                      startMarqueeSelection: (...args) => CANVAS_MARQUEE_CONTROLLER?.startMarqueeSelection?.(...args),
                  },
                  actionSource: {
                      openAddNodeMenu: (...args) => openAddNodeMenu(...args),
                  },
                  runtimeSource: {
                      setTimeout: (...args) => window.setTimeout(...args),
                  },
              },
              connectionSource: {
                  languageSource: {
                      getLanguageState: () => ({ __lang: runtimeUiLang() }),
                      t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
                  },
                  pendingSource: {
                      getPendingInputTarget: (...args) => getPendingInputTarget(...args),
                      getPendingConnectionSource: (...args) => getPendingConnectionSource(...args),
                      clearPendingInputTarget: (...args) => clearPendingInputTarget(...args),
                      clearPendingConnection: (...args) => clearPendingConnection(...args),
                  },
                  automaticSource: {
                      connectPendingBatchSource: (...args) => CANVAS_BATCH_ANY_CONNECTION_CONTROLLER.connectPendingBatchSource(...args),
                      connectPendingUploadSource: (...args) => CANVAS_UPLOAD_CONNECTION_CONTROLLER.connectPendingUploadSource(...args),
                      connectPendingWd14Source: (...args) => CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.connectPendingWd14Source(...args),
                      connectPendingPoseSource: (...args) => CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER.connectPendingPoseSource(...args),
                      connectPendingGaussianSource: (...args) => CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER.connectPendingGaussianSource(...args),
                      connectPendingLivePortraitSource: (...args) => CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER.connectPendingLivePortraitSource(...args),
                      connectPendingVlmSource: (...args) => CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.connectPendingVlmSource(...args),
                      connectPendingQwenSource: (...args) => CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.connectPendingQwenSource(...args),
                      connectPendingDirectorSource: (...args) => CANVAS_TIMELINE_CONNECTION_CONTROLLER.connectPendingDirectorSource(...args),
                      connectPendingCompareSource: (...args) => CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.connectPendingCompareSource(...args),
                      connectPendingTimelineSource: (...args) => CANVAS_TIMELINE_CONNECTION_CONTROLLER.connectPendingTimelineSource(...args),
                      connectPendingPresetSource: (...args) => CANVAS_UPLOAD_CONNECTION_CONTROLLER.connectPendingPresetSource(...args),
                      connectPendingResultSource: (...args) => CANVAS_RESULT_CONNECTION_CONTROLLER.connectPendingResultSource(...args),
                      connectPendingConfigSource: (...args) => CANVAS_CONFIG_CONNECTION_CONTROLLER.connectPendingConfigSource(...args),
                      connectPendingTextSource: (...args) => CANVAS_TEXT_CONNECTION_CONTROLLER.connectPendingTextSource(...args),
                  },
                  domSource: {
                      getDocument: () => document,
                      getNodesLayer: () => nodesLayer,
                      getInputPortHandleSelector: () => INPUT_PORT_HANDLE_SELECTOR,
                  },
                  viewportSource: {
                      clientToWorld: (...args) => clientToWorld(...args),
                  },
                  runtimeSource: {
                      performanceNow: () => canvasPerformanceNow(),
                  },
                  uiSource: {
                      hideCanvasTooltip: (...args) => hideCanvasTooltip(...args),
                      hideHoverPreview: (...args) => hideHoverPreview(...args),
                      closePreviewSelectMenu: (...args) => closePreviewSelectMenu(...args),
                      setSuppressWheelUntil: (value) => { suppressWheelUntil = value; },
                      showToast: (...args) => showToast(...args),
                  },
                  selectionSource: {
                      selectNode: (...args) => CANVAS_SELECTION_CONTROLLER?.selectNode?.(...args),
                      selectInputConnectionTarget: (nodeId) => {
                          CANVAS_SELECTION_CONTROLLER?.setNodeSelectionIncludingEmpty?.(nodeId);
                          CANVAS_SELECTION_CONTROLLER?.refreshSelectionUi?.();
                      },
                  },
                  nodeSource: {
                      getOutputPoint: (...args) => getOutputPoint(...args),
                      getHandleCenterWorldPoint: (...args) => getHandleCenterWorldPoint(...args),
                      getConnectionTargetFromHandle: (...args) => getConnectionTargetFromHandle(...args),
                      getNode: (...args) => getNode(...args),
                      isQwenTtsNode: (...args) => isQwenTtsNode(...args),
                      isDirectorTimelineNode: (...args) => isDirectorTimelineNode(...args),
                  },
                  spatialSource: {
                      getConnectionSnapRadiusPx: () => CONNECTION_SNAP_RADIUS_PX,
                  },
                  mediaSource: {
                      canNodeConnectToUploadSlot: (...args) => canNodeConnectToUploadSlot(...args),
                      canPresetOutputConnectToUploadSlot: (...args) => canPresetOutputConnectToUploadSlot(...args),
                      isImageProducingPresetNode: (...args) => isImageProducingPresetNode(...args),
                      isVlmMediaSource: (...args) => isVlmMediaSource(...args),
                      isSam3VideoMaskSource: (...args) => isSam3VideoMaskSource(...args),
                      isPoseStudioImageSource: (...args) => isPoseStudioImageSource(...args),
                      isGaussianStudioImageSource: (...args) => isGaussianStudioImageSource(...args),
                      isLivePortraitExpressionImageSource: (...args) => isLivePortraitExpressionImageSource(...args),
                      isQwenTtsAudioSource: (...args) => isQwenTtsAudioSource(...args),
                      isDirectorMediaSourceForSlot: (...args) => isDirectorMediaSourceForSlot(...args),
                      directorMediaSourceKind: (...args) => directorMediaSourceKind(...args),
                      isImageCompareSource: (...args) => isImageCompareSource(...args),
                  },
                  configSource: {
                      parseDetectionSlot: (...args) => parseDetectionSlot(...args),
                      isPresetConfigKind: (...args) => isPresetConfigKind(...args),
                  },
                  batchSource: {
                      batchAnyCanConnectToTextSlot: (...args) => batchAnyCanConnectToTextSlot(...args),
                      batchAnyAcceptsSource: (...args) => batchAnyAcceptsSource(...args),
                      isBatchAnySourceNode: (...args) => isBatchAnySourceNode(...args),
                      batchAnyMediaKind: (...args) => batchAnyMediaKind(...args),
                  },
                  textSource: {
                      isTextOutputNode: (...args) => isTextOutputNode(...args),
                  },
                  timelineSource: {
                      isTimelineSource: (...args) => isTimelineSource(...args),
                      getTimelineSourceAsset: (...args) => getTimelineSourceAsset(...args),
                      assetMediaKind: (asset) => typeof timelineAssetMediaKind === 'function'
                          ? timelineAssetMediaKind(asset) : assetMediaKind(asset),
                      trackCompatible: (...args) => timelineTrackCompatible(...args),
                  },
                  projectSource: {
                      getProject: () => project,
                  },
                  edgeSource: {
                      createUploadEdge: (...args) => createUploadEdge(...args),
                      createPresetToPresetBridgeEdge: (...args) => createPresetToPresetBridgeEdge(...args),
                      createConfigEdge: (...args) => createConfigEdge(...args),
                      createTextEdge: (...args) => createTextEdge(...args),
                      createWd14ImageEdge: (...args) => createWd14ImageEdge(...args),
                      createVlmImageEdge: (...args) => createVlmImageEdge(...args),
                      createMaskImageEdge: (...args) => createMaskImageEdge(...args),
                      createSam3VideoMaskEdge: (...args) => createSam3VideoMaskEdge(...args),
                      createPoseStudioReferenceEdge: (...args) => createPoseStudioReferenceEdge(...args),
                      createGaussianStudioReferenceEdge: (...args) => createGaussianStudioReferenceEdge(...args),
                      createLivePortraitExpressionImageEdge: (...args) => createLivePortraitExpressionImageEdge(...args),
                      createQwenTtsAudioEdge: (...args) => createQwenTtsAudioEdge(...args),
                      createDirectorTimelineMediaEdge: (...args) => createDirectorTimelineMediaEdge(...args),
                      createCompareImageEdge: (...args) => createCompareImageEdge(...args),
                      createBatchAnyInputEdge: (...args) => createBatchAnyInputEdge(...args),
                      createTimelineClipEdge: (...args) => createTimelineClipEdge(...args),
                      createGenerateEdge: (...args) => createGenerateEdge(...args),
                  },
                  renderSource: {
                      renderTempEdge,
                      renderAll: (...args) => CANVAS_RENDER_CONTROLLER?.renderAll?.(...args),
                  },
                  actionSource: {
                      setPendingConnection: (...args) => setPendingConnection(...args),
                      openInputPortCreateMenu: (...args) => openInputPortCreateMenu(...args),
                      openAddNodeMenu: (...args) => openAddNodeMenu(...args),
                  },
              },
              t,
            tOption,
            clamp,
            escapeHtml,
            isCanvasRunActiveState,
            isResultStale,
            inferChatImageRelativePath: (...args) => inferChatImageRelativePath(...args),
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
            buildResultPreviewPatch,
            buildProjectViewportPatch,
            assetDisplaySrc,
            readAssetSize,
            getCompareSourceAsset,
            getCompareSourceNode,
            renderIconHtml,
            mergeCanvasRunStatus: (...args) => mergeCanvasRunStatus(...args),
            schedulePanEdgeSettleRender,
            getRoot: () => root,
            getProject: () => project,
            getFactoryContext: () => CANVAS_FACTORY_CONTEXT,
            getStorageScope: () => storageScope,
            getStorageKey: () => storageKey,
            getZoomLabel: () => zoomLabel,
            getCanvasTitle: () => getCanvasTitle(),
            storageDisplayLocation: () => storageDisplayLocation(),
            storageDisplayPath: () => storageDisplayPath(),
            renderHistoryButtons: (...args) => CANVAS_HISTORY_CONTROLLER?.renderHistoryButtons?.(...args),
            renderSystemInfo: (...args) => CANVAS_RUN_STATUS_CONTROLLER?.renderSystemInfo?.(...args),
            renderRunQueueWidget: (...args) => CANVAS_RUN_STATUS_CONTROLLER?.renderRunQueueWidget?.(...args),
            getClassicModes: () => registryClassicModes,
            getClassicOutpaintDirs: () => registryClassicOutpaintDirs,
            getClassicInpaintMethods: () => registryClassicInpaintMethods,
            getClassicEnhanceUovProcessingOrder: () => registryClassicEnhanceUovProcessingOrder,
            getClassicEnhanceUovPromptTypes: () => registryClassicEnhanceUovPromptTypes,
            getClassicIpMaxImages,
            getClassicUovMethods,
            getClassicIpTypes,
            getClassicInpaintEngines,
            normalizeClassicInpaintMode,
            getInpaintModeDefaults,
            getClassicEnhanceRegionValues,
            getClassicEnhanceRegionDefault,
            detectionSlotForRegion,
            getDetectionConfigLabel,
            enhanceRegionKey,
            getNode,
            snapCanvasCoord,
            getPromptTextSourceNode,
            getVisibleClassicUploadSlots,
            getVisibleUploadSlots,
            getUploadSlotMediaKind,
            collapsedKeepClass,
            getPresetSchema,
            getPresetTheme,
            getPresetThemeInfo,
            canvasAgentPresetPromptDefaults,
            normalizeCanvasColor,
            presetSpecialViewerUrl,
            localizeCanvasLabel,
            isStyleTransferPresetNode,
            isLivePortraitVideoExpressionPresetNode,
            isLtx23MultiGuidePresetNode,
            isMiniMaxH3PresetNode,
            renderStyleTransferPresetController,
            renderLivePortraitVideoExpressionPresetController,
            renderLtx23GuidePresetController,
            renderMiniMaxH3StoryboardPresetController,
            portHintText: (...args) => CANVAS_NODE_RENDERER?.portHintText?.(...args) || '',
            danbooruAutocompleteAttrs: (...args) => DANBOORU_AUTOCOMPLETE_CONTROLLER?.danbooruAutocompleteAttrs?.(...args) || '',
            slotPortTitle: (...args) => CANVAS_NODE_RENDERER?.slotPortTitle?.(...args) || '',
            slotPortButtonTitle: (...args) => CANVAS_NODE_RENDERER?.slotPortButtonTitle?.(...args) || '',
            slotPortHintText: (...args) => CANVAS_NODE_RENDERER?.slotPortHintText?.(...args) || '',
            notConnectedText: (...args) => CANVAS_NODE_RENDERER?.notConnectedText?.(...args) || '',
            renderPresetParamControl: (...args) => CANVAS_PRESET_PARAM_RENDERER?.renderPresetParamControl?.(...args) || '',
            renderNodeStateBadges: (...args) => CANVAS_NODE_RENDERER?.renderNodeStateBadges?.(...args) || '',
            renderRunnableNodeStatusFoot: (...args) => CANVAS_NODE_RENDERER?.renderRunnableNodeStatusFoot?.(...args) || '',
            renderPresetConfigPortRow: (...args) => CANVAS_NODE_RENDERER?.renderPresetConfigPortRow?.(...args) || '',
            getPresetConfigKinds: () => PRESET_CONFIG_KINDS,
            getSlotLabels: () => SLOT_LABELS,
            collapsedPromptMinHeight: COLLAPSED_PROMPT_NODE_MIN_HEIGHT,
            collapsedPromptNodeHeight: (node) => collapsedPromptNodeHeight(node),
            defaultNodeSize,
            getProjectNodes: () => project?.nodes || [],
            getMeasuredNodeLayout: (...args) => CANVAS_NODE_RENDER_CONTROLLER?.getMeasuredNodeLayout?.(...args) || null,
            buildResultLayoutPatch,
            scheduleSave: (...args) => scheduleSave(...args),
            supportsCollapsedPromptHeight: (node) => supportsCollapsedPromptHeight(node),
            viewportFindOpenNodePosition,
            viewportGetNodeRect,
            getViewport: () => viewport,
            nodeRenderOverscanPx: NODE_RENDER_OVERSCAN_PX,
            edgeRenderOverscanPx: EDGE_RENDER_OVERSCAN_PX,
            edgePointCacheMinEdges: EDGE_POINT_CACHE_MIN_EDGES,
            getSelectedNodeId: () => selectedNodeId,
            getSelectedNodeIds: () => selectedNodeIds,
            getSelectedEdgeId: () => selectedEdgeId,
            getConnectingFromId: () => getConnectingFromId(),
            isNodeVisuallyRunning,
            viewportGetVisibleWorldRect,
            viewportGetNodeRenderWorldRect,
            viewportShouldRenderNodeInViewport,
            viewportShouldRenderEdgeInViewport,
            viewportGetEdgeSvgBounds,
            nodeSpatialIndexMinNodes: NODE_SPATIAL_INDEX_MIN_NODES,
            nodeSpatialIndexCellSize: NODE_SPATIAL_INDEX_CELL_SIZE,
            isResultRefreshing,
            viewportRectsOverlap,
            getPerfStats: () => perfStats,
            getCanvasRenderMode: () => getCanvasRenderMode(),
            canvasOverviewExitZoom: CANVAS_OVERVIEW_EXIT_ZOOM,
            isPanning: () => isPanning(),
            panPreviewNodeBudget: PAN_PREVIEW_NODE_BUDGET,
            panPreviewDeferCoveragePadPx: PAN_PREVIEW_DEFER_COVERAGE_PAD_PX,
            setNodeRenderCoverageRect: (...args) => CANVAS_NODE_RENDER_CONTROLLER?.setNodeRenderCoverageRect?.(...args),
            getDraggingNodeIds: () => getDraggingNodeIds(),
            getNodeResizeNodeId: () => getNodeResizeNodeId(),
             getActiveInlineTagCartNodeId: () => activeInlineTagCartNodeId,
             getOutpaintOverlayState: () => outpaintOverlayState,
             uid,
            cloneRunValue,
            nowIso,
            normalizePresetName,
            getClassicIpTypes,
            registryClassicEnhanceRegionDefaults,
            registryClassicIpControlTypes,
            ensurePresetSpecialControllerState,
            assetMediaKind,
            assetMediaIcon,
            safeAssetDisplaySrc: (...args) => CANVAS_PROJECT_ASSETS_CONTROLLER?.safeAssetDisplaySrc?.(...args) || '',
            safeAssetFullDisplaySrc: (...args) => CANVAS_PROJECT_ASSETS_CONTROLLER?.safeAssetFullDisplaySrc?.(...args) || '',
            safeAssetFallbackSrc: (...args) => CANVAS_PROJECT_ASSETS_CONTROLLER?.safeAssetFallbackSrc?.(...args) || '',
            readAssetInfo,
            mediaAspectStyle,
            resultMediaDisplayAsset,
            getResultMetadataRows: (...args) => resultMetadataRows(...args),
            batchAnyMediaKindFromAsset,
            batchAnyMediaKind,
            batchAnyPortKind,
            batchAnyMediaLabel,
            batchAnyMediaIcon,
            batchAnyCurrentItem,
            batchAnySelectedItemIds,
            batchAnyTargets,
            batchAnyTargetLabel,
            batchAnyTextFromItem,
            mediaBrowserNodeState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserNodeState(...args),
            mediaBrowserRuntimeFor: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserRuntimeFor(...args),
            isGalleryFrostEnabled: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.isGalleryFrostEnabled(...args),
            syncGalleryFrostClass: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.syncGalleryFrostClass(...args),
            localizedDefaultTitle,
            selectedMediaBrowserItemFrom: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.selectedMediaBrowserItemFrom(...args),
            mediaBrowserItemMeta: item => CANVAS_ASSET_NODE_RENDERER.mediaBrowserItemMeta(item),
            danbooruPostMediaType: (...args) => danbooruPostMediaType(...args),
            getNodeElement: (id) => nodesLayer?.querySelector?.(`[data-node-id="${CSS.escape(id)}"]`),
            nodeStatusState,
            nodeEffectiveRenderMode,
            renderConfigNodeHtml,
            renderCompareNodeHtml,
            renderXyzMatrixNodeHtml,
            renderTimelineNodeHtml,
            renderDirectorTimelineNodeHtml,
            renderStyleSelectorNodeHtml,
            renderVideoNodeHtml,
            renderAudioNodeHtml,
            renderNoteNodeHtml,
            renderWildcardsHelperNodeHtml,
            renderTextNodeHtml,
            renderTextMergeNodeHtml,
            renderTranslationNodeHtml,
            renderTagCartNodeHtml,
            renderWd14NodeHtml,
            renderVlmNodeHtml,
            renderMaskNodeHtml: (...args) => CANVAS_ASSET_NODE_RENDERER?.renderMaskNodeHtml?.(...args) || '',
            renderSam3VideoMaskNodeHtml,
            renderCameraMotionNodeHtml,
            renderPoseStudioNodeHtml,
            renderGaussianStudioNodeHtml,
            renderLivePortraitExpressionNodeHtml,
            renderQwenTtsNodeHtml,
            renderImageNodeHtml,
            isDirectorTimelineNode,
            isQwenTtsNode,
            isTextOutputNode,
            wouldCreateTextCycle,
            isPoseStudioImageSource,
            isLivePortraitExpressionImageSource,
            isVlmMediaSource,
            isSam3VideoMaskSource,
            isQwenTtsAudioSource,
            isDirectorMediaSourceForSlot,
            isImageCompareSource,
            isTimelineSource,
            mediaBrowserLabel,
            tagCartLabel,
            getVlmSourceAsset,
            getTimelineSourceAsset,
            isNodeLocked,
            isNodeIgnored,
            isNodeCollapsed,
            getVlmImageSlots: () => VLM_IMAGE_SLOTS,
            getDirectorTimelineMediaKindGroups: () => directorTimelineMediaKindGroups,
            textMergeInputSlots,
            qwenTtsAudioInputSlots,
            getNodesLayer: () => nodesLayer,
            getGroupsLayer: () => groupsLayer,
            getEdgesLayer: () => edgesLayer,
            getChainRunOverlay: () => chainRunOverlay,
            getDocument: () => document,
            performanceNow: () => canvasPerformanceNow(),
            getMediaBrowserNodeRuntime: () => mediaBrowserNodeRuntime,
            getMediaBrowserScrollMemory: () => getMediaBrowserScrollMemory(),
            getVlmChatScrollMemory: () => getVlmChatScrollMemory(),
            getVlmRenderDebugEnabled: () => getVlmRenderDebugEnabled(),
            setEdgeRenderCacheKey: (value) => { edgeRenderCacheKey = value; },
            setEdgeIncidentIndex,
            setActiveInlineTagCartNodeId: (value) => { activeInlineTagCartNodeId = value; },
            buildVlmParamsPatch,
            buildVlmImageInputsPatch,
            buildVlmRunStatusPatch,
            buildTimelineClipDeletePatch: timelineBuildClipDeletePatch,
            normalizeTimelineNode: timelineNormalizeNode,
            applyConfigNodeToPreset,
            addTimelineClipFromSource,
            viewportCenterWorld,
            cssEscape: (value) => CSS.escape(value),
            updateCanvasRenderMode,
            ensureVlmNodeModeSize,
            refreshMediaBrowserNode: (...args) => CANVAS_MEDIA_BROWSER_DATA_CONTROLLER.refreshMediaBrowserNode(...args),
            captureVlmChatScroll,
            captureMediaBrowserScroll,
            logVlmRenderKeyChange,
            isImageNodeFrameless,
            isNodeSchedulerBlocked,
            isNodeSchedulerWaiting,
            applyNodeCustomColorVars,
            shouldFixNodeHeight,
            ensureWorkbenchFormFieldNames,
            ensureNodeCollapseButton,
            ensureNodeResizeHandle,
            bindNodeEvents,
            restoreVlmChatScroll,
            refreshVlmChatReadabilityDom,
            restoreMediaBrowserScroll,
            restoreInlineTagCartAfterRender,
            syncOutpaintOverlayPosition,
            isPanning: (...args) => CANVAS_PAN_CONTROLLER?.isPanning?.(...args) || false,
            scheduleMinimapRender: (...args) => CANVAS_MINIMAP_CONTROLLER?.scheduleMinimapRender?.(...args),
            renderMinimap: (...args) => CANVAS_MINIMAP_CONTROLLER?.renderMinimap?.(...args),
            positionCanvasAgentPanel,
            bindPresetSpecialViewerEvents: (...args) => bindPresetSpecialViewerEvents(...args),
            refreshPresetSpecialNodeDom,
            nodeOverviewRenderSignature,
            nodeRenderSignature,
            clearTempEdge,
            cancelEdgeIncidentIndexWarmup,
            clearEdgeCanvas,
            invalidateMinimapStaticCache: (...args) => CANVAS_MINIMAP_CONTROLLER?.invalidateMinimapStaticCache?.(...args),
            getRunHistoryPanel: () => runHistoryPanel,
            cancelPanEdgeSettleRender,
            isNodeDragging: (...args) => isNodeDragging(...args),
            isGroupDragging: (...args) => isGroupDragging(...args),
            cancelDragEdgeSettleRender,
            endDragEdgeLodVisual,
            reconcileSelection,
            applyThemeClass,
            applyViewport,
            renderGroups,
            renderMode: (...args) => renderMode(...args),
            renderEdges,
            renderSelectedChainOverlay,
            renderInspector,
            renderCanvasSettingsPanel,
            renderCanvasAgentPanel,
            mutate,
            deleteSelectedGroup,
            deleteTimelineClipById: (...args) => deleteTimelineClipById(...args),
            interruptDeletedResultRuns,
            hideOutpaintOverlay,
             handleCanvasAgentWorkflowNodeDeletion: (...args) => CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER?.handleCanvasAgentWorkflowNodeDeletion?.(...args),
             handleCanvasAgentWorkflowEdgeDeletion: (...args) => CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER?.handleCanvasAgentWorkflowEdgeDeletion?.(...args),
            parseDetectionSlot,
            configKeyForKind,
            updateDirectorStatus,
            refreshBatchAnyActiveItem,
            renderRunQueuePanelIfOpen: (...args) => renderRunQueuePanelIfOpen(...args),
            renderRunHistoryPanel: (...args) => renderRunHistoryPanel(...args),
            renderPerformanceHud,
            scheduleEdgeIncidentIndexWarmup,
            formatLocalTime,
            getRunQueueWidget: () => runQueueWidget,
            getRunQueuePanel: () => runQueuePanel,
            getSystemInfoElement: () => systemInfoEl,
            getBackendAlertElement: () => backendAlertEl,
            isStandaloneCanvasWorkbench,
            fetchStatus: (path, options) => fetch(path, options),
            setInterval: (...args) => window.setInterval(...args),
            clearInterval: (...args) => window.clearInterval(...args),
            getMinimapElement: () => minimapEl,
            getGroupRect,
            ensureProjectGroups,
            getSelectedGroupId: () => selectedGroupId,
            nodeCustomColor,
            expandCanvasHexColor,
            getMinimapBounds: (items, visible) => typeof viewportGetMinimapBounds === 'function'
                ? viewportGetMinimapBounds(items, visible, { defaultNodeSize, getNodeLayoutSize })
                : null,
            hasCanvasOverflow: (items, visible) => typeof viewportHasCanvasOverflow === 'function'
                ? viewportHasCanvasOverflow(items, visible, { defaultNodeSize, getNodeLayoutSize })
                : false,
            setTimeout: (...args) => window.setTimeout(...args),
            requestAnimationFrame: (callback) => requestCanvasFrame(callback),
            clearTimeout: (...args) => window.clearTimeout(...args),
            preferSvgEdgesForViewportInteraction,
            scheduleViewportNodeRender,
            scheduleViewportSave,
            setGradioTextboxValue: typeof setGradioTextboxValue === 'function' ? setGradioTextboxValue : null,
            clickGradioButton: typeof clickGradioButton === 'function' ? clickGradioButton : null,
            getHistoryLimit: () => 32,
            getHistoryMemoryBudgetBytes: () => 48 * 1024 * 1024,
            setProject: (value) => { project = value; },
            compactProjectForStorage,
            buildProjectStorageInfo: (...args) => buildProjectStorageInfo(...args),
            sanitizeProject,
            getSelectionState: () => ({
                selectedNodeId,
                selectedNodeIds: new Set(selectedNodeIds),
                selectedEdgeId,
                selectedGroupId
            }),
            setSelectionState: (state) => {
                const next = state || {};
                selectedNodeId = next.selectedNodeId || null;
                selectedNodeIds = next.selectedNodeIds instanceof Set
                    ? new Set(next.selectedNodeIds)
                    : new Set(Array.isArray(next.selectedNodeIds) ? next.selectedNodeIds : []);
                selectedEdgeId = next.selectedEdgeId || null;
                selectedGroupId = next.selectedGroupId || null;
            },
            closeContextMenu: (...args) => CONTEXT_MENU_CONTROLLER?.closeContextMenu?.(...args),
            showToast,
            getGroup: (id) => getGroup(id),
            getNodesInsideGroup: (group) => getNodesInsideGroup(group),
            openGroupContextMenu: (group, clientX, clientY) => openGroupContextMenu(group, clientX, clientY),
            snapCanvasSizeFromOrigin: (origin, value, min, max) => snapCanvasSizeFromOrigin(origin, value, min, max),
            beginDragEdgeLod: (...args) => beginDragEdgeLod(...args),
            isDragEdgeLodActive: () => isDragEdgeLodActive(),
            scheduleDragEdgeSettleRender: (...args) => scheduleDragEdgeSettleRender(...args),
            flushInteractiveLinkRender: (...args) => flushInteractiveLinkRender(...args),
            updateGroupPositionDom: (...args) => updateGroupPositionDom(...args),
            updateNodePositionDom: (...args) => updateNodePositionDom(...args),
            scheduleInteractiveLinkRender: (...args) => scheduleInteractiveLinkRender(...args),
            refreshNoteDom: (...args) => refreshNoteDom(...args),
            hideCanvasTooltip: (...args) => hideCanvasTooltip(...args),
            hideHoverPreview: (...args) => hideHoverPreview(...args),
            closePreviewSelectMenu: (...args) => closePreviewSelectMenu(...args),
            setSuppressWheelUntil: (value) => { suppressWheelUntil = value; },
            schedulePanNodeRender: (...args) => schedulePanNodeRender(...args),
            clearPanNodeRenderTimer: (...args) => clearPanNodeRenderTimer(...args),
            shouldDeferPanEdgeSettleRender: (...args) => shouldDeferPanEdgeSettleRender(...args),
            closeCanvasSettingsPanel: (...args) => closeCanvasSettingsPanel(...args),
            runQueueOpenPanel,
            runQueueClosePanel,
            runQueueRenderPanel,
            runQueueHandleAction,
            runHistoryOpenPanel,
            runHistoryClosePanel,
            runHistoryRenderPanel,
            runHistoryHandleAction,
            isTerminalRunState,
            controlResultRun,
            retryResultRun,
            fitSelection: (...args) => fitSelection(...args),
            renderFinalEdgesAfterPan: () => {
                if ((project.edges || []).length >= CANVAS_EDGE_FINAL_RENDER_MIN_EDGES) renderEdgesWithCanvasPreferred();
                else renderEdgesWithSvgFallback();
                renderSelectedChainOverlay();
            },
            getWindow: () => window,
            clientToWorld: (...args) => clientToWorld(...args),
            setLastPointerWorld: (world) => { lastPointerWorld = world; },
            openAddNodeMenu: (...args) => openAddNodeMenu(...args),
            findCanvasEdgeAtClient: (...args) => findCanvasEdgeAtClient(...args),
            isCanvasAgentPickingReference: () => !!canvasAgentState.pickReference,
            setCanvasAgentPickingReference: (value) => { canvasAgentState.pickReference = !!value; },
            addCanvasAgentReferenceFromNode: (...args) => addCanvasAgentReferenceFromNode(...args),
            setCanvasAgentMessage: (...args) => setCanvasAgentMessage(...args),
            getMode: () => mode,
            getOutputPoint: (...args) => getOutputPoint(...args),
            getHandleCenterWorldPoint: (...args) => getHandleCenterWorldPoint(...args),
            connectSourceToTarget: (...args) => connectSourceToTarget(...args),
            setPendingConnection: (...args) => setPendingConnection(...args),
            openInputPortCreateMenu: (...args) => openInputPortCreateMenu(...args),
            renderTempEdge
    };
    const RUN_STATE_CONTEXT_SOURCE = {};
    CANVAS_ASSET_MEDIA_CONTROLLER = typeof WORKBENCH_CANVAS_ASSET_MEDIA.createCanvasAssetMediaController === 'function'
        ? WORKBENCH_CANVAS_ASSET_MEDIA.createCanvasAssetMediaController()
        : {};
    const CONNECTION_MEDIA_SOURCE_CONTEXT = {
        batchSource: {
            batchAnyCanConnectToSlot: (...args) => batchAnyCanConnectToSlot(...args)
        },
        resultSource: {
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args)
        }
    };
    CANVAS_CONNECTION_MEDIA_CONTROLLER = typeof WORKBENCH_CANVAS_CONNECTION_MEDIA.createCanvasConnectionMediaController === 'function'
        ? WORKBENCH_CANVAS_CONNECTION_MEDIA.createCanvasConnectionMediaController({
            connectionMediaSource: CONNECTION_MEDIA_SOURCE_CONTEXT
        })
        : {};
    CANVAS_RUN_STATE_CONTROLLER = typeof WORKBENCH_CANVAS_RUN_STATE.createCanvasRunStateController === 'function'
        ? WORKBENCH_CANVAS_RUN_STATE.createCanvasRunStateController({
            runStateSource: RUN_STATE_CONTEXT_SOURCE
        })
        : {};
    CANVAS_NODE_STATE_CONTROLLER = typeof WORKBENCH_CANVAS_NODE_STATE.createCanvasNodeStateController === 'function'
        ? WORKBENCH_CANVAS_NODE_STATE.createCanvasNodeStateController()
        : {};
    const UPLOAD_CONNECTION_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project,
            buildProjectNodeAppendPatch: (...args) => buildProjectNodeAppendPatch(...args)
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
            safeAssetDisplaySrc: (...args) => safeAssetDisplaySrc(...args),
            isNodeLocked: (...args) => isNodeLocked(...args)
        },
        slotSource: {
            getVisibleClassicUploadSlots: (...args) => getVisibleClassicUploadSlots(...args),
            getVisibleUploadSlots: (...args) => getVisibleUploadSlots(...args),
            getSlotLabel: (...args) => getSlotLabel(...args),
            applyPresetUploadSlotPatch: (...args) => applyPresetUploadSlotPatch(...args),
            syncResolutionConfigForPresetInputs: (...args) => syncResolutionConfigForPresetInputs(...args)
        },
        mediaSource: {
            canNodeConnectToUploadSlot: (...args) => canNodeConnectToUploadSlot(...args),
            canPresetOutputConnectToUploadSlot: (...args) => canPresetOutputConnectToUploadSlot(...args)
        },
        edgeSource: {
            filterProjectEdges: (...args) => filterProjectEdges(...args),
            appendProjectEdge: (...args) => appendProjectEdge(...args),
            buildCanvasEdge: (...args) => buildCanvasEdge(...args),
            ensureGenerateEdge: (...args) => ensureGenerateEdge(...args)
        },
        resultSource: {
            buildReservedResultNode: (...args) => buildReservedResultNode(...args)
        },
        layoutSource: {
            defaultNodeSize: (...args) => defaultNodeSize(...args),
            getNodeRect: (...args) => getNodeRect(...args),
            placeNodeAvoidingOverlap: (...args) => placeNodeAvoidingOverlap(...args)
        },
        historySource: {
            pushHistory: (...args) => pushHistory(...args)
        },
        selectionSource: {
            selectConnectionNode: nodeId => CANVAS_SELECTION_CONTROLLER.focusNodePreservingSelection(nodeId)
        },
        renderSource: {
            refreshPresetSpecialNodeDom: (...args) => refreshPresetSpecialNodeDom(...args),
            mutate: (...args) => mutate(...args)
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t
        },
        uiSource: {
            showToast: (...args) => showToast(...args)
        }
    };
    CANVAS_UPLOAD_CONNECTION_CONTROLLER = typeof WORKBENCH_CANVAS_UPLOAD_CONNECTION.createCanvasUploadConnectionController === 'function'
        ? WORKBENCH_CANVAS_UPLOAD_CONNECTION.createCanvasUploadConnectionController({
            uploadConnectionSource: UPLOAD_CONNECTION_CONTEXT_SOURCE
        })
        : {};
    const SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE = {
        projectSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.projectSource,
        edgeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.edgeSource,
        resultSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.resultSource,
        layoutSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.layoutSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.uiSource,
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isNodeLocked: (...args) => isNodeLocked(...args),
            isImageProducingPresetNode: (...args) => isImageProducingPresetNode(...args)
        },
        patchSource: {
            buildSpecialNodeConnectionPatch: (...args) => buildSpecialNodeConnectionPatch(...args),
            buildSpecialNodeStatusPatch: (...args) => buildSpecialNodeStatusPatch(...args),
            mergeCanvasRunStatus: (...args) => mergeCanvasRunStatus(...args)
        },
        selectionSource: {
            selectBridgeResult: (nodeId, select) => CANVAS_SELECTION_CONTROLLER.focusNodePreservingSelection(select ? nodeId : selectedNodeId)
        },
        renderSource: {
            mutate: (...args) => mutate(...args)
        }
    };
    CANVAS_SPECIAL_RESULT_BRIDGE_CONTROLLER = typeof WORKBENCH_CANVAS_SPECIAL_RESULT_BRIDGE.createCanvasSpecialResultBridgeController === 'function'
        ? WORKBENCH_CANVAS_SPECIAL_RESULT_BRIDGE.createCanvasSpecialResultBridgeController({
            specialResultBridgeSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE
        })
        : {};
    const SPECIAL_IMAGE_CONNECTION_CONTEXT_SOURCE = {
        nodeSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.nodeSource,
        edgeSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.edgeSource,
        patchSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.patchSource,
        historySource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.historySource,
        languageSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.languageSource,
        uiSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.uiSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        selectionSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.selectionSource,
        mediaSource: {
            isPoseStudioImageSource: (...args) => isPoseStudioImageSource(...args),
            isGaussianStudioImageSource: (...args) => isGaussianStudioImageSource(...args),
            isLivePortraitExpressionImageSource: (...args) => isLivePortraitExpressionImageSource(...args)
        },
        bridgeSource: CANVAS_SPECIAL_RESULT_BRIDGE_CONTROLLER
    };
    CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER = typeof WORKBENCH_CANVAS_SPECIAL_IMAGE_CONNECTION.createCanvasSpecialImageConnectionController === 'function'
        ? WORKBENCH_CANVAS_SPECIAL_IMAGE_CONNECTION.createCanvasSpecialImageConnectionController({
            specialImageConnectionSource: SPECIAL_IMAGE_CONNECTION_CONTEXT_SOURCE
        })
        : {};
    const TEXT_CONNECTION_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
        edgeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.edgeSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        selectionSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.selectionSource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.uiSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        textSource: {
            isTextOutputNode: (...args) => isTextOutputNode(...args),
            textMergeInputSlots: (...args) => textMergeInputSlots(...args),
            getTextMergeOutput: (...args) => getTextMergeOutput(...args),
            getTextMergeInputSource: (...args) => getTextMergeInputSource(...args),
            wouldCreateTextCycle: (...args) => wouldCreateTextCycle(...args)
        },
        viewSource: {
            getNodesLayer: () => nodesLayer,
            getInspector: () => inspector,
            getSelectedNodeId: () => selectedNodeId,
            cssEscape: value => cssEscape(value)
        },
        batchSource: {
            batchAnyCanConnectToTextSlot: (...args) => batchAnyCanConnectToTextSlot(...args)
        },
        patchSource: {
            buildPresetTextInputPatch: (...args) => buildPresetTextInputPatch(...args),
            buildStyleSelectorStatePatch: (...args) => buildStyleSelectorStatePatch(...args),
            buildTextMergeStatePatch: (...args) => buildTextMergeStatePatch(...args),
            buildTranslationStatePatch: (...args) => buildTranslationStatePatch(...args),
            buildTagCartStatePatch: (...args) => buildTagCartStatePatch(...args),
            buildTextNodeStatePatch: (...args) => buildTextNodeStatePatch(...args)
        }
    };
    CANVAS_TEXT_CONNECTION_CONTROLLER = typeof WORKBENCH_CANVAS_TEXT_CONNECTION.createCanvasTextConnectionController === 'function'
        ? WORKBENCH_CANVAS_TEXT_CONNECTION.createCanvasTextConnectionController({
            textConnectionSource: TEXT_CONNECTION_CONTEXT_SOURCE
        })
        : {};
    const MEDIA_INPUT_CONNECTION_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            ...UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
            isQwenTtsNode: (...args) => isQwenTtsNode(...args)
        },
        edgeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.edgeSource,
        disconnectSource: {
            deleteEdge: (...args) => deleteEdge(...args)
        },
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        selectionSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.selectionSource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.uiSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        mediaSource: {
            isVlmMediaSource: (...args) => isVlmMediaSource(...args),
            isSam3VideoMaskSource: (...args) => isSam3VideoMaskSource(...args),
            isQwenTtsAudioSource: (...args) => isQwenTtsAudioSource(...args),
            isImageCompareSource: (...args) => isImageCompareSource(...args)
        },
        slotSource: {
            getVlmImageSlots: () => VLM_IMAGE_SLOTS,
            qwenTtsAudioInputSlots: (...args) => qwenTtsAudioInputSlots(...args)
        },
        patchSource: {
            buildWd14StatePatch: (...args) => buildWd14StatePatch(...args),
            buildVlmImageInputsPatch: (...args) => buildVlmImageInputsPatch(...args),
            buildVlmRunStatusPatch: (...args) => buildVlmRunStatusPatch(...args),
            buildMaskStatePatch: (...args) => buildMaskStatePatch(...args),
            buildSam3SourcePatch: (...args) => buildSam3SourcePatch(...args),
            buildSam3StatePatch: (...args) => buildSam3StatePatch(...args),
            buildQwenTtsStatePatch: (...args) => buildQwenTtsStatePatch(...args),
            buildCompareStatePatch: (...args) => compareNodeBuildStatePatch(...args),
            mergeCanvasRunStatus: (...args) => mergeCanvasRunStatus(...args)
        }
    };
    CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER = typeof WORKBENCH_CANVAS_MEDIA_INPUT_CONNECTION.createCanvasMediaInputConnectionController === 'function'
        ? WORKBENCH_CANVAS_MEDIA_INPUT_CONNECTION.createCanvasMediaInputConnectionController({
            mediaInputConnectionSource: MEDIA_INPUT_CONNECTION_CONTEXT_SOURCE
        })
        : {};
    const TIMELINE_CONNECTION_CONTEXT_SOURCE = {
        nodeSource: {
            ...UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
            uid: (...args) => uid(...args)
        },
        edgeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.edgeSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        selectionSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.selectionSource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.uiSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        directorSource: {
            getMediaSlotSpecs: () => directorTimelineMediaSlotSpecs,
            isDirectorTimelineNode: (...args) => isDirectorTimelineNode(...args),
            isDirectorMediaSourceForSlot: (...args) => isDirectorMediaSourceForSlot(...args),
            buildDirectorTimelineStatePatch: (...args) => buildDirectorTimelineStatePatch(...args),
            updateDirectorStatus: (...args) => CANVAS_TIMELINE_CONTEXT.updateDirectorStatus?.(...args)
        },
        timelineSource: {
            isTimelineSource: (...args) => isTimelineSource(...args),
            getTimelineSourceAsset: (...args) => getTimelineSourceAsset(...args),
            assetMediaKind: (...args) => assetMediaKind(...args),
            timelineAssetMediaKind,
            timelineDefaultTrackId,
            timelineNextStartForTrack,
            timelineNormalizeNode,
            timelineCreateClipFromSource,
            timelineCreateFallbackClipFromSource,
            timelineBuildClipAppendPatch,
            getNodeContext: () => TIMELINE_NODE_CONTEXT
        }
    };
    CANVAS_TIMELINE_CONNECTION_CONTROLLER = typeof WORKBENCH_CANVAS_TIMELINE_CONNECTION.createCanvasTimelineConnectionController === 'function'
        ? WORKBENCH_CANVAS_TIMELINE_CONNECTION.createCanvasTimelineConnectionController({
            timelineConnectionSource: TIMELINE_CONNECTION_CONTEXT_SOURCE
        })
        : {};
    const TIMELINE_CREATION_CONTEXT_SOURCE = {
        projectSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.projectSource,
        nodeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
        directorSource: {
            directorTimelineAddNode,
            getDirectorTimelineNodeContext: () => DIRECTOR_TIMELINE_NODE_CONTEXT
        },
        layoutSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.layoutSource,
        viewportSource: {
            viewportCenterWorld: () => viewportCenterWorld()
        },
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.uiSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        timelineSource: {
            isTimelineSource: (...args) => isTimelineSource(...args),
            timelineCreateNode,
            timelineNormalizeNode,
            getNodeContext: () => TIMELINE_NODE_CONTEXT
        },
        connectionSource: {
            addTimelineClipFromSource: (...args) => CANVAS_TIMELINE_CONNECTION_CONTROLLER.addTimelineClipFromSource(...args),
            completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args)
        },
        selectionSource: {
            getSelectedNodeIdList: (...args) => getSelectedNodeIdList(...args),
            selectTimelineNode: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(nodeId),
        }
    };
    CANVAS_TIMELINE_CREATION_CONTROLLER = typeof WORKBENCH_CANVAS_TIMELINE_CREATION.createCanvasTimelineCreationController === 'function'
        ? WORKBENCH_CANVAS_TIMELINE_CREATION.createCanvasTimelineCreationController({
            timelineCreationSource: TIMELINE_CREATION_CONTEXT_SOURCE
        })
        : {};
    const MEDIA_BROWSER_STATE_CONTEXT_SOURCE = {
        layoutSource: {
            viewportCenterWorld: (...args) => viewportCenterWorld(...args),
            defaultNodeSize: (...args) => defaultNodeSize(...args)
        },
        nodeSource: {
            isNodeLocked: (...args) => isNodeLocked(...args)
        },
        patchSource: {
            buildMediaBrowserStatePatch: (...args) => buildMediaBrowserStatePatch(...args)
        },
        historySource: {
            pushHistoryBatch: (...args) => pushHistoryBatch(...args)
        },
        persistenceSource: {
            scheduleSave: (...args) => scheduleSave(...args)
        }
    };
    CANVAS_MEDIA_BROWSER_STATE_CONTROLLER = typeof WORKBENCH_CANVAS_MEDIA_BROWSER_STATE.createCanvasMediaBrowserStateController === 'function'
        ? WORKBENCH_CANVAS_MEDIA_BROWSER_STATE.createCanvasMediaBrowserStateController({
            mediaBrowserStateSource: MEDIA_BROWSER_STATE_CONTEXT_SOURCE
        })
        : {};
    const MEDIA_BROWSER_INTERACTION_CONTEXT_SOURCE = {
        stateSource: {
            mediaBrowserInitialState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserInitialState(...args),
            mediaBrowserNodeState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserNodeState(...args),
            mediaBrowserRuntimeFor: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserRuntimeFor(...args),
            saveMediaBrowserNodeState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.saveMediaBrowserNodeState(...args),
            selectedMediaBrowserNodeItem: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.selectedMediaBrowserNodeItem(...args)
        },
        layoutSource: {
            viewportCenterWorld: (...args) => viewportCenterWorld(...args),
            defaultNodeSize: (...args) => defaultNodeSize(...args)
        },
        dataSource: {
            refreshMediaBrowserNode: (...args) => CANVAS_MEDIA_BROWSER_DATA_CONTROLLER.refreshMediaBrowserNode(...args),
            loadMoreMediaBrowserNode: (...args) => CANVAS_MEDIA_BROWSER_DATA_CONTROLLER.loadMoreMediaBrowserNode(...args)
        },
        actionSource: {
            addMediaBrowserItemToCanvas: (...args) => CANVAS_MEDIA_IMPORT_CONTROLLER.addMediaBrowserItemToCanvas(...args),
            openMediaBrowserPanel: (...args) => CANVAS_MEDIA_BROWSER_PANEL_CONTROLLER.openMediaBrowserPanel(...args),
            copyMediaBrowserItemPrompt: (...args) => CANVAS_MEDIA_BROWSER_ACTION_CONTROLLER.copyMediaBrowserItemPrompt(...args),
            applyMediaBrowserItemPromptToTarget: (...args) => CANVAS_MEDIA_BROWSER_ACTION_CONTROLLER.applyMediaBrowserItemPromptToTarget(...args),
            deleteLocalMediaBrowserItem: (...args) => CANVAS_MEDIA_BROWSER_ACTION_CONTROLLER.deleteLocalMediaBrowserItem(...args)
        },
        frostSource: {
            revealGalleryFrostArea: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.revealGalleryFrostArea(...args),
            setGalleryFrostEnabled: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.setGalleryFrostEnabled(...args)
        },
        renderSource: {
            renderNodes: (...args) => renderNodes(...args)
        },
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: {
            warn: (...args) => console.warn(...args),
            showToast: (...args) => showToast(...args)
        }
    };
    CANVAS_MEDIA_BROWSER_INTERACTION_CONTROLLER = typeof WORKBENCH_CANVAS_MEDIA_BROWSER_INTERACTION.createCanvasMediaBrowserInteractionController === 'function'
        ? WORKBENCH_CANVAS_MEDIA_BROWSER_INTERACTION.createCanvasMediaBrowserInteractionController({
            mediaBrowserInteractionSource: MEDIA_BROWSER_INTERACTION_CONTEXT_SOURCE
        })
        : {};
    const MEDIA_BROWSER_DATA_CONTEXT_SOURCE = {
        configSource: {
            getPageSize: () => MEDIA_BROWSER_PAGE_SIZE
        },
        networkSource: {
            getMediaGalleryApi: () => apiMediaGallery,
            fetchDanbooruGalleryPosts: (...args) => fetchDanbooruGalleryPosts(...args)
        },
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            getNode: (...args) => getNode(...args)
        },
        stateSource: {
            getMediaBrowserNodeRuntime: () => mediaBrowserNodeRuntime,
            mediaBrowserRuntimeFor: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserRuntimeFor(...args),
            mediaBrowserNodeState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserNodeState(...args),
            saveMediaBrowserNodeState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.saveMediaBrowserNodeState(...args),
            mergeMediaBrowserPage: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mergeMediaBrowserPage(...args)
        },
        fieldSource: {
            readMediaBrowserFields: (...args) => CANVAS_MEDIA_BROWSER_INTERACTION_CONTROLLER.readMediaBrowserFields(...args),
            readMediaBrowserNodeFields: (...args) => CANVAS_MEDIA_BROWSER_INTERACTION_CONTROLLER.readMediaBrowserNodeFields(...args)
        },
        renderSource: {
            renderMediaBrowserPanel: (...args) => CANVAS_MEDIA_BROWSER_PANEL_CONTROLLER.renderMediaBrowserPanel(...args),
            renderNodes: (...args) => renderNodes(...args),
            scheduleMediaBrowserPaintRefresh: (...args) => scheduleMediaBrowserPaintRefresh(...args),
            scheduleMediaBrowserNodePaintRefresh: (...args) => scheduleMediaBrowserNodePaintRefresh(...args)
        },
        diagnosticsSource: {
            warn: (...args) => console.warn(...args)
        }
    };
    CANVAS_MEDIA_BROWSER_DATA_CONTROLLER = typeof WORKBENCH_CANVAS_MEDIA_BROWSER_DATA.createCanvasMediaBrowserDataController === 'function'
        ? WORKBENCH_CANVAS_MEDIA_BROWSER_DATA.createCanvasMediaBrowserDataController({
            mediaBrowserDataSource: MEDIA_BROWSER_DATA_CONTEXT_SOURCE
        })
        : {};
    const GENERATION_METADATA_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
            isNodeLocked: (...args) => isNodeLocked(...args),
            getPromptTextSourceNode: (...args) => getPromptTextSourceNode(...args)
        },
        selectionSource: {
            getSelectedNodeIdList: (...args) => getSelectedNodeIdList(...args),
            getSelectedNodeId: () => selectedNodeId,
            selectMetadataTarget: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionIncludingEmpty(nodeId)
        },
        layoutSource: {
            viewportCenterWorld: (...args) => viewportCenterWorld(...args)
        },
        presetSource: {
            getVisiblePresetParams: (...args) => getVisiblePresetParams(...args)
        },
        patchSource: {
            buildNodeParamsPatch: (...args) => buildNodeParamsPatch(...args),
            buildGenerationMetadataPatch: (...args) => buildGenerationMetadataPatch(...args)
        },
        historySource: {
            pushHistory: (...args) => pushHistory(...args)
        },
        timeSource: {
            nowIso: (...args) => nowIso(...args)
        },
        renderSource: {
            mutate: (...args) => mutate(...args)
        },
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: {
            showToast: (...args) => showToast(...args)
        }
    };
    CANVAS_GENERATION_METADATA_CONTROLLER = typeof WORKBENCH_CANVAS_GENERATION_METADATA.createCanvasGenerationMetadataController === 'function'
        ? WORKBENCH_CANVAS_GENERATION_METADATA.createCanvasGenerationMetadataController({
            generationMetadataSource: GENERATION_METADATA_CONTEXT_SOURCE
        })
        : {};
    const GENERATION_METADATA_INSPECTOR_CONTEXT_SOURCE = {
        metadataSource: {
            nodeGenerationMetadata: (...args) => nodeGenerationMetadata(...args),
            generationMetadataPrompt: (...args) => generationMetadataPrompt(...args),
            generationMetadataNegativePrompt: (...args) => generationMetadataNegativePrompt(...args),
            generationMetadataParameters: (...args) => generationMetadataParameters(...args),
            generationPromptTargetLabel: (...args) => generationPromptTargetLabel(...args),
            resolveGenerationPromptTarget: (...args) => resolveGenerationPromptTarget(...args),
            applyGenerationMetadataToPromptTarget: (...args) => applyGenerationMetadataToPromptTarget(...args)
        },
        browserSource: {
            writeClipboardText: (...args) => navigator.clipboard.writeText(...args)
        },
        utilitySource: {
            escapeHtml: (...args) => escapeHtml(...args)
        },
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: {
            showToast: (...args) => showToast(...args)
        }
    };
    CANVAS_GENERATION_METADATA_INSPECTOR_CONTROLLER = typeof WORKBENCH_CANVAS_GENERATION_METADATA_INSPECTOR.createCanvasGenerationMetadataInspectorController === 'function'
        ? WORKBENCH_CANVAS_GENERATION_METADATA_INSPECTOR.createCanvasGenerationMetadataInspectorController({
            generationMetadataInspectorSource: GENERATION_METADATA_INSPECTOR_CONTEXT_SOURCE
        })
        : {};
    const NOTE_GEOMETRY_CONTEXT_SOURCE = {
        layoutSource: {
            getNodeRect: (...args) => getNodeRect(...args)
        },
        patchSource: {
            buildNoteStatePatch: (...args) => buildNoteStatePatch(...args)
        }
    };
    CANVAS_NOTE_GEOMETRY_CONTROLLER = typeof WORKBENCH_CANVAS_NOTE_GEOMETRY.createCanvasNoteGeometryController === 'function'
        ? WORKBENCH_CANVAS_NOTE_GEOMETRY.createCanvasNoteGeometryController({
            noteGeometrySource: NOTE_GEOMETRY_CONTEXT_SOURCE
        })
        : {};
    const NOTE_RENDERER_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        selectionSource: {
            getSelectedNodeId: () => selectedNodeId,
            getSelectedNodeIds: () => selectedNodeIds
        },
        geometrySource: {
            getNodeRect: (...args) => getNodeRect(...args),
            rectsOverlap: (...args) => rectsOverlap(...args),
            noteTailState: (...args) => noteTailState(...args),
            noteTailBasePoint: (...args) => CANVAS_NOTE_GEOMETRY_CONTROLLER.noteTailBasePoint(...args),
            noteTailShapePath: (...args) => CANVAS_NOTE_GEOMETRY_CONTROLLER.noteTailShapePath(...args)
        },
        utilitySource: {
            normalizeCanvasColor: (...args) => normalizeCanvasColor(...args),
            clamp: (...args) => clamp(...args),
            escapeHtml: (...args) => escapeHtml(...args)
        },
        renderSource: {
            renderNodeStateBadges: (...args) => renderNodeStateBadges(...args)
        },
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource
    };
    CANVAS_NOTE_RENDERER_CONTROLLER = typeof WORKBENCH_CANVAS_NOTE_RENDERER.createCanvasNoteRenderer === 'function'
        ? WORKBENCH_CANVAS_NOTE_RENDERER.createCanvasNoteRenderer({
            noteRendererSource: NOTE_RENDERER_CONTEXT_SOURCE
        })
        : {};
    const NOTE_EDIT_CONTEXT_SOURCE = {
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isNodeLocked: (...args) => isNodeLocked(...args)
        },
        domSource: {
            getNodesLayer: () => nodesLayer,
            getDocument: () => document,
            cssEscape: (...args) => CSS.escape(...args)
        },
        geometrySource: {
            normalizeCanvasColor: (...args) => normalizeCanvasColor(...args),
            clamp: (...args) => clamp(...args),
            noteTailState: (...args) => noteTailState(...args),
            defaultNoteTailTarget: (...args) => defaultNoteTailTarget(...args)
        },
        patchSource: {
            buildNoteStatePatch: (...args) => buildNoteStatePatch(...args)
        },
        selectionSource: {
            getSelectedNodeId: () => selectedNodeId
        },
        historySource: {
            pushHistory: (...args) => pushHistory(...args),
            pushHistoryBatch: (...args) => pushHistoryBatch(...args)
        },
        persistenceSource: {
            scheduleSave: (...args) => scheduleSave(...args)
        },
        renderSource: {
            mutate: (...args) => mutate(...args),
            updateNodePositionDom: (...args) => updateNodePositionDom(...args),
            renderNodes: (...args) => renderNodes(...args),
            renderEdges: (...args) => renderEdges(...args),
            renderMinimap: (...args) => renderMinimap(...args),
            renderInspector: (...args) => renderInspector(...args)
        }
    };
    CANVAS_NOTE_EDIT_CONTROLLER = typeof WORKBENCH_CANVAS_NOTE_EDIT.createCanvasNoteEditController === 'function'
        ? WORKBENCH_CANVAS_NOTE_EDIT.createCanvasNoteEditController({
            noteEditSource: NOTE_EDIT_CONTEXT_SOURCE
        })
        : {};
    const NODE_APPEARANCE_CONTEXT_SOURCE = {
        stateSource: { getSelectedNodeId: () => selectedNodeId },
        nodeSource: { getNode, isNodeLocked, isNodeCollapsed },
        colorSource: { normalizeCanvasColor, expandCanvasHexColor, applyNodeCustomColorVars },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (...args) => t(...args)
        },
        patchSource: {
            buildNoteStatePatch: (...args) => buildNoteStatePatch(...args),
            applyNodeStylePatch: (...args) => applyNodeStylePatch(...args)
        },
        historySource: { pushHistoryBatch: (...args) => pushHistoryBatch(...args) },
        domSource: {
            getDocument: () => document,
            getNodeElement: nodeId => nodesLayer?.querySelector?.(`[data-node-id="${CSS.escape(nodeId || '')}"]`) || null
        },
        renderSource: {
            invalidateMinimapStaticCache: (...args) => CANVAS_MINIMAP_CONTROLLER?.invalidateMinimapStaticCache?.(...args),
            renderMinimap: (...args) => renderMinimap(...args),
            scheduleSave,
            renderInspector
        }
    };
    const CANVAS_NODE_APPEARANCE_CONTROLLER = typeof WORKBENCH_CANVAS_NODE_APPEARANCE.createCanvasNodeAppearanceController === 'function'
        ? WORKBENCH_CANVAS_NODE_APPEARANCE.createCanvasNodeAppearanceController({
            nodeAppearanceSource: NODE_APPEARANCE_CONTEXT_SOURCE
        })
        : {};
    const NOTE_INSPECTOR_CONTEXT_SOURCE = {
        geometrySource: NOTE_EDIT_CONTEXT_SOURCE.geometrySource,
        editSource: {
            updateNoteText: (...args) => updateNoteText(...args),
            updateNoteStyle: (...args) => updateNoteStyle(...args),
            updateNoteSize: (...args) => updateNoteSize(...args),
            updateNoteTail: (...args) => updateNoteTail(...args)
        },
        selectionSource: NOTE_EDIT_CONTEXT_SOURCE.selectionSource,
        utilitySource: {
            escapeHtml: (...args) => escapeHtml(...args)
        },
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource
    };
    CANVAS_NOTE_INSPECTOR_CONTROLLER = typeof WORKBENCH_CANVAS_NOTE_INSPECTOR.createCanvasNoteInspectorController === 'function'
        ? WORKBENCH_CANVAS_NOTE_INSPECTOR.createCanvasNoteInspectorController({
            noteInspectorSource: NOTE_INSPECTOR_CONTEXT_SOURCE
        })
        : {};
    const AUX_NODE_CREATION_CONTEXT_SOURCE = {
        factorySource: {
            buildWildcardsHelperNode: (...args) => buildWildcardsHelperNode(...args),
            buildMediaBrowserNode: (...args) => buildMediaBrowserNode(...args),
            buildNoteNode: (...args) => buildNoteNode(...args),
            buildTranslationNode: (...args) => buildTranslationNode(...args),
            buildTagCartNode: (...args) => buildTagCartNode(...args),
            buildWd14Node: (...args) => buildWd14Node(...args),
            buildVlmNode: (...args) => buildVlmNode(...args),
            buildMaskNode: (...args) => buildMaskNode(...args),
            buildTextNode: (...args) => buildTextNode(...args),
            buildTextMergeNode: (...args) => buildTextMergeNode(...args),
            buildManualOutputNode: (...args) => buildManualOutputNode(...args),
            buildClassicNode: (...args) => buildClassicNode(...args),
            buildPresetNode: (...args) => buildPresetNode(...args),
        },
        projectSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.projectSource,
        nodeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        layoutSource: {
            placeNodeAvoidingOverlap: (...args) => placeNodeAvoidingOverlap(...args),
            buildNodeLayoutPatch: (...args) => buildNodeLayoutPatch(...args),
            viewportCenterWorld: (...args) => viewportCenterWorld(...args),
            getNodeRect: (...args) => getNodeRect(...args),
            defaultNodeSize: (...args) => defaultNodeSize(...args)
        },
        connectionSource: {
            completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args)
        },
            selectionSource: {
                selectAuxNode: (nodeId, clearGroup) => {
                    if (clearGroup) CANVAS_SELECTION_CONTROLLER.setNodeSelectionIncludingEmpty(nodeId);
                    else CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(nodeId);
                },
            selectPresetNode: nodeId => CANVAS_SELECTION_CONTROLLER.focusNodePreservingSelection(nodeId),
            selectManualOutputNode: nodeId => CANVAS_SELECTION_CONTROLLER.focusNodePreservingSelection(nodeId)
        },
        renderSource: {
            mutate: (...args) => mutate(...args)
        },
        refreshSource: {
            refreshWildcardsCatalog: (...args) => refreshWildcardsCatalog(...args),
            refreshMediaBrowserNode: (...args) => CANVAS_MEDIA_BROWSER_DATA_CONTROLLER.refreshMediaBrowserNode(...args),
            scheduleAutoPresetModelChecks: (...args) => scheduleAutoPresetModelChecks(...args)
        },
        actionSource: {
            openTagCartForNode: (...args) => openTagCartForNode(...args),
            addStyleSelectorNode: (...args) => addStyleSelectorNode(...args),
            findStyleSelectorForPreset: (...args) => findStyleSelectorForPreset(...args),
            linkStyleSelectorToPreset: (...args) => linkStyleSelectorToPreset(...args)
        },
        uiSource: {
            showToast: (...args) => showToast(...args),
            warn: (...args) => console.warn(...args)
        }
    };
    CANVAS_AUX_NODE_CREATION_CONTROLLER = typeof WORKBENCH_CANVAS_AUX_NODE_CREATION.createCanvasAuxNodeCreationController === 'function'
        ? WORKBENCH_CANVAS_AUX_NODE_CREATION.createCanvasAuxNodeCreationController({
            auxNodeCreationSource: AUX_NODE_CREATION_CONTEXT_SOURCE
        })
        : {};
    const MEDIA_BROWSER_ACTION_CONTEXT_SOURCE = {
        stateSource: {
            viewportCenterWorld: (...args) => viewportCenterWorld(...args),
            mediaBrowserInitialState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserInitialState(...args),
            selectedMediaBrowserItem: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.selectedMediaBrowserItem(...args)
        },
        metadataSource: {
            mediaBrowserItemPrompt: (...args) => mediaBrowserItemPrompt(...args),
            mediaBrowserItemMetadata: (...args) => mediaBrowserItemMetadata(...args),
            mediaBrowserItemNegativePrompt: (...args) => mediaBrowserItemNegativePrompt(...args)
        },
        targetSource: {
            resolveGenerationPromptTarget: (...args) => resolveGenerationPromptTarget(...args),
            applyGenerationMetadataToPromptTarget: (...args) => applyGenerationMetadataToPromptTarget(...args)
        },
        browserSource: {
            writeClipboardText: (...args) => navigator.clipboard.writeText(...args),
            confirm: (...args) => window.confirm(...args)
        },
        networkSource: {
            getMediaGalleryDeleteApi: () => apiMediaGalleryDelete
        },
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: {
            showToast: (...args) => showToast(...args)
        }
    };
    CANVAS_MEDIA_BROWSER_ACTION_CONTROLLER = typeof WORKBENCH_CANVAS_MEDIA_BROWSER_ACTION.createCanvasMediaBrowserActionController === 'function'
        ? WORKBENCH_CANVAS_MEDIA_BROWSER_ACTION.createCanvasMediaBrowserActionController({
            mediaBrowserActionSource: MEDIA_BROWSER_ACTION_CONTEXT_SOURCE
        })
        : {};
    const MEDIA_BROWSER_PANEL_CONTEXT_SOURCE = {
        domSource: {
            getDocument: () => document,
            detectWorkbenchTheme: (...args) => detectWorkbenchTheme(...args),
            ensureWorkbenchFormFieldNames: (...args) => ensureWorkbenchFormFieldNames(...args)
        },
        stateSource: {
            viewportCenterWorld: (...args) => viewportCenterWorld(...args),
            mediaBrowserInitialState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserInitialState(...args),
            normalizeMediaBrowserState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.normalizeMediaBrowserState(...args),
            selectedMediaBrowserItem: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.selectedMediaBrowserItem(...args),
            readMediaBrowserFields: (...args) => CANVAS_MEDIA_BROWSER_INTERACTION_CONTROLLER.readMediaBrowserFields(...args)
        },
        dataSource: {
            refreshMediaBrowserPanel: (...args) => CANVAS_MEDIA_BROWSER_DATA_CONTROLLER.refreshMediaBrowserPanel(...args),
            loadMoreMediaBrowserPanel: (...args) => CANVAS_MEDIA_BROWSER_DATA_CONTROLLER.loadMoreMediaBrowserPanel(...args),
            maybeAutoLoadMoreMediaBrowserPanel: (...args) => CANVAS_MEDIA_BROWSER_DATA_CONTROLLER.maybeAutoLoadMoreMediaBrowserPanel(...args)
        },
        actionSource: {
            importSelectedMediaBrowserItem: (...args) => CANVAS_MEDIA_IMPORT_CONTROLLER.importSelectedMediaBrowserItem(...args),
            deleteLocalMediaBrowserItem: (...args) => CANVAS_MEDIA_BROWSER_ACTION_CONTROLLER.deleteLocalMediaBrowserItem(...args),
            copySelectedMediaBrowserPrompt: (...args) => CANVAS_MEDIA_BROWSER_ACTION_CONTROLLER.copySelectedMediaBrowserPrompt(...args),
            applySelectedMediaBrowserPromptToTarget: (...args) => CANVAS_MEDIA_BROWSER_ACTION_CONTROLLER.applySelectedMediaBrowserPromptToTarget(...args)
        },
        frostSource: {
            revealGalleryFrostArea: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.revealGalleryFrostArea(...args),
            setGalleryFrostEnabled: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.setGalleryFrostEnabled(...args),
            syncGalleryFrostClass: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.syncGalleryFrostClass(...args),
            isGalleryFrostEnabled: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.isGalleryFrostEnabled(...args)
        },
        renderSource: {
            renderMediaBrowserPanelHtml: (...args) => renderMediaBrowserPanelHtml(...args),
            captureMediaBrowserScroll: (...args) => captureMediaBrowserScroll(...args),
            restoreMediaBrowserScroll: (...args) => restoreMediaBrowserScroll(...args),
            renderNodes: (...args) => renderNodes(...args)
        }
    };
    CANVAS_MEDIA_BROWSER_PANEL_CONTROLLER = typeof WORKBENCH_CANVAS_MEDIA_BROWSER_PANEL.createCanvasMediaBrowserPanelController === 'function'
        ? WORKBENCH_CANVAS_MEDIA_BROWSER_PANEL.createCanvasMediaBrowserPanelController({
            mediaBrowserPanelSource: MEDIA_BROWSER_PANEL_CONTEXT_SOURCE
        })
        : {};
    const MEDIA_IMPORT_CONTEXT_SOURCE = {
        domSource: {
            getDocument: () => document
        },
        transferSource: {
            getTransferStation: () => window.SimpAITransferStation
        },
        mediaBrowserSource: {
            selectedMediaBrowserItem: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.selectedMediaBrowserItem(...args),
            mediaBrowserInitialState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserInitialState(...args),
            normalizeMediaBrowserState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.normalizeMediaBrowserState(...args),
            importDanbooruGalleryPost: (...args) => importDanbooruGalleryPost(...args)
        },
        fileSource: MEDIA_HELPERS_CONTEXT,
        factorySource: {
            buildImageNodeFromFile: (...args) => buildImageNodeFromFile(...args),
            buildMediaNodeFromFile: (...args) => buildMediaNodeFromFile(...args),
            buildImageNodeFromAsset: (...args) => buildImageNodeFromAsset(...args),
            buildMediaNodeFromAsset: (...args) => buildMediaNodeFromAsset(...args),
            buildOutputGalleryMediaNode: (...args) => buildOutputGalleryMediaNode(...args),
            buildImageNodeFromTransferItem: (...args) => buildImageNodeFromTransferItem(...args)
        },
        layoutSource: {
            fitImageNodeToAssetBounds: (...args) => fitImageNodeToAssetBounds(...args),
            placeNodeAvoidingOverlap: (...args) => placeNodeAvoidingOverlap(...args),
            viewportCenterWorld: (...args) => viewportCenterWorld(...args)
        },
        metadataSource: {
            mediaBrowserItemMetadata: (...args) => mediaBrowserItemMetadata(...args)
        },
        networkSource: {
            fetchLibraryMediaItem: async (mediaId) => {
                const base = window.location.pathname.replace(/\/canvas-workbench\/app\/?$/, '');
                const response = await window.fetch(`${base}/simpleai/gallery/api/items/${encodeURIComponent(mediaId)}/canvas`, {
                    credentials: 'same-origin'
                });
                if (!response.ok) throw new Error(`Gallery media request failed: ${response.status}`);
                return response.json();
            }
        },
        projectSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.projectSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        selectionSource: {
            selectImportedNode: nodeId => CANVAS_SELECTION_CONTROLLER.focusNodePreservingSelection(nodeId),
            selectGalleryNode: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionIncludingEmpty(nodeId)
        },
        storageSource: {
            materializeNodeAssetForStorage: (...args) => materializeNodeAssetForStorage(...args)
        },
        uiSource: {
            warn: (...args) => console.warn(...args),
            showToast: (...args) => showToast(...args)
        }
    };
    CANVAS_MEDIA_IMPORT_CONTROLLER = typeof WORKBENCH_CANVAS_MEDIA_IMPORT.createCanvasMediaImportController === 'function'
        ? WORKBENCH_CANVAS_MEDIA_IMPORT.createCanvasMediaImportController({
            mediaImportSource: MEDIA_IMPORT_CONTEXT_SOURCE
        })
        : {};
    const BATCH_ANY_QUERIES_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isNodeIgnored: (...args) => isNodeIgnored(...args)
        },
        fileSource: {
            isImageFile: (...args) => isImageFile(...args),
            isVideoFile: (...args) => isVideoFile(...args),
            isAudioFile: (...args) => isAudioFile(...args),
            isBatchTextFile: (...args) => isBatchTextFile(...args)
        },
        mediaSource: {
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
            assetMediaKind: (...args) => assetMediaKind(...args)
        },
        textSource: {
            isTextOutputNode: (...args) => isTextOutputNode(...args),
            getNodeTextOutput: (...args) => getNodeTextOutput(...args)
        },
        slotSource: {
            getUploadSlotMediaKind: (...args) => getUploadSlotMediaKind(...args),
            getSlotLabel: (...args) => getSlotLabel(...args)
        },
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource
    };
    CANVAS_BATCH_ANY_QUERIES_CONTROLLER = typeof WORKBENCH_CANVAS_BATCH_ANY_QUERIES.createCanvasBatchAnyQueriesController === 'function'
        ? WORKBENCH_CANVAS_BATCH_ANY_QUERIES.createCanvasBatchAnyQueriesController({
            batchAnyQueriesSource: BATCH_ANY_QUERIES_CONTEXT_SOURCE
        })
        : {};
    const BATCH_ANY_CREATION_CONTEXT_SOURCE = {
        fileSource: MEDIA_HELPERS_CONTEXT,
        factorySource: {
            buildBatchAnyNode: (...args) => buildBatchAnyNode(...args),
            buildTextBatchItemFromFile: (...args) => buildTextBatchItemFromFile(...args),
            buildMediaBatchItemFromFile: (...args) => buildMediaBatchItemFromFile(...args)
        },
        nodeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
        projectSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.projectSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        layoutSource: {
            placeNodeAvoidingOverlap: (...args) => placeNodeAvoidingOverlap(...args)
        },
        connectionSource: {
            completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args)
        },
        batchSource: {
            isBatchTextFile: (...args) => isBatchTextFile(...args),
            batchAnyMediaKind: (...args) => batchAnyMediaKind(...args),
            batchAnyMediaKindFromFile: (...args) => batchAnyMediaKindFromFile(...args),
            batchAnyTextFromItem: (...args) => batchAnyTextFromItem(...args),
            applyBatchAnyStatePatch: (...args) => applyBatchAnyStatePatch(...args),
            setBatchAnyCurrentItem: (...args) => setBatchAnyCurrentItem(...args)
        },
        storageSource: {
            materializeBatchAnyItemForStorage: (...args) => materializeBatchAnyItemForStorage(...args)
        },
        timeSource: {
            nowIso: (...args) => nowIso(...args)
        },
        selectionSource: {
            selectBatchNode: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(nodeId)
        },
        domSource: {
            getDocument: () => document
        },
        uiSource: {
            showToast: (...args) => showToast(...args),
            warn: (...args) => console.warn(...args)
        }
    };
    CANVAS_BATCH_ANY_CREATION_CONTROLLER = typeof WORKBENCH_CANVAS_BATCH_ANY_CREATION.createCanvasBatchAnyCreationController === 'function'
        ? WORKBENCH_CANVAS_BATCH_ANY_CREATION.createCanvasBatchAnyCreationController({
            batchAnyCreationSource: BATCH_ANY_CREATION_CONTEXT_SOURCE
        })
        : {};
    const BATCH_ANY_EDIT_CONTEXT_SOURCE = {
        nodeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
        projectSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.projectSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        batchSource: {
            applyBatchAnyStatePatch: (...args) => applyBatchAnyStatePatch(...args),
            batchAnyMediaKind: (...args) => batchAnyMediaKind(...args),
            batchAnyTextFromItem: (...args) => batchAnyTextFromItem(...args)
        },
        edgeSource: {
            filterProjectEdges: (...args) => filterProjectEdges(...args),
            deleteEdge: (...args) => deleteEdge(...args)
        },
        selectionSource: {
            getSelectedNodeId: () => selectedNodeId
        },
        persistenceSource: {
            scheduleSave: (...args) => scheduleSave(...args)
        },
        timeSource: {
            nowIso: (...args) => nowIso(...args)
        },
        utilitySource: {
            clamp: (...args) => clamp(...args)
        },
        uiSource: {
            showToast: (...args) => showToast(...args),
            openContextMenu: (...args) => openContextMenu(...args),
            notConnectedText: (...args) => notConnectedText(...args)
        }
    };
    CANVAS_BATCH_ANY_EDIT_CONTROLLER = typeof WORKBENCH_CANVAS_BATCH_ANY_EDIT.createCanvasBatchAnyEditController === 'function'
        ? WORKBENCH_CANVAS_BATCH_ANY_EDIT.createCanvasBatchAnyEditController({
            batchAnyEditSource: BATCH_ANY_EDIT_CONTEXT_SOURCE
        })
        : {};
    const BATCH_ANY_INSPECTOR_CONTEXT_SOURCE = {
        nodeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        selectionSource: {
            getSelectedNodeId: () => selectedNodeId
        },
        batchSource: {
            batchAnyMediaKind: (...args) => batchAnyMediaKind(...args),
            batchAnyTargets: (...args) => batchAnyTargets(...args),
            batchAnyCurrentItem: (...args) => batchAnyCurrentItem(...args),
            batchAnySelectedItemIds: (...args) => batchAnySelectedItemIds(...args),
            batchAnyMediaLabel: (...args) => batchAnyMediaLabel(...args),
            batchAnyMediaIcon: (...args) => batchAnyMediaIcon(...args),
            batchAnyTargetLabel: (...args) => batchAnyTargetLabel(...args),
            applyBatchAnyStatePatch: (...args) => applyBatchAnyStatePatch(...args)
        },
        actionSource: {
            openBatchAnyFilePicker: (...args) => openBatchAnyFilePicker(...args),
            runBatchAnyNode: (...args) => runBatchAnyNode(...args),
            selectBatchAnyItem: (...args) => selectBatchAnyItem(...args),
            deleteBatchAnyItems: (...args) => deleteBatchAnyItems(...args)
        },
        historySource: {
            pushHistoryBatch: (...args) => pushHistoryBatch(...args)
        },
        persistenceSource: {
            scheduleSave: (...args) => scheduleSave(...args)
        },
        utilitySource: {
            escapeHtml: (...args) => escapeHtml(...args)
        },
        uiSource: {
            notConnectedText: (...args) => notConnectedText(...args)
        }
    };
    CANVAS_BATCH_ANY_INSPECTOR_CONTROLLER = typeof WORKBENCH_CANVAS_BATCH_ANY_INSPECTOR.createCanvasBatchAnyInspectorController === 'function'
        ? WORKBENCH_CANVAS_BATCH_ANY_INSPECTOR.createCanvasBatchAnyInspectorController({
            batchAnyInspectorSource: BATCH_ANY_INSPECTOR_CONTEXT_SOURCE
        })
        : {};
    const INPUT_CREATION_CONTEXT_SOURCE = {
        nodeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
        projectSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.projectSource,
        factorySource: {
            buildEmptyImageNodeForInput: (...args) => buildEmptyImageNodeForInput(...args),
            buildEmptyMediaNodeForInput: (...args) => buildEmptyMediaNodeForInput(...args),
            buildNodeParamsPatch: (...args) => buildNodeParamsPatch(...args)
        },
        mediaSource: {
            isSam3VideoMaskSource: (...args) => isSam3VideoMaskSource(...args)
        },
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        portSource: {
            getSlotLabel: (...args) => getSlotLabel(...args),
            getVlmImageSlots: () => VLM_IMAGE_SLOTS,
            configTitleForKind: (...args) => configTitleForKind(...args),
            configIconForKind: (...args) => configIconForKind(...args),
            getUploadSlotMediaKind: (...args) => getUploadSlotMediaKind(...args),
            batchAnyMediaKind: (...args) => batchAnyMediaKind(...args),
            inputTargetEdges: (...args) => inputTargetEdges(...args),
            deleteEdge: (...args) => deleteEdge(...args)
        },
        layoutSource: {
            defaultNodeSize: (...args) => defaultNodeSize(...args),
            viewportCenterWorld: (...args) => viewportCenterWorld(...args),
            getHandleCenterWorldPoint: (...args) => getHandleCenterWorldPoint(...args),
            getNodeRect: (...args) => getNodeRect(...args),
            placeNodeAvoidingOverlap: (...args) => placeNodeAvoidingOverlap(...args)
        },
        creationSource: {
            ensureConfigNode: (...args) => ensureConfigNode(...args),
            openPresetPalette: (...args) => openPresetPalette(...args),
            addTextNode: (...args) => addTextNode(...args),
            addTextMergeNode: (...args) => addTextMergeNode(...args),
            addMaskNode: (...args) => addMaskNode(...args),
            addSam3VideoMaskNode: (...args) => addSam3VideoMaskNode(...args),
            addCameraMotionNode: (...args) => addCameraMotionNode(...args),
            addClassicNode: (...args) => addClassicNode(...args),
            addTimelineNode: (...args) => CANVAS_TIMELINE_CREATION_CONTROLLER.addTimelineNode(...args),
            addQwenTtsNode: (...args) => addQwenTtsNode(...args)
        },
        fileSource: {
            pickLocalImageFile: (...args) => pickLocalImageFile(...args),
            pickLocalVideoFile: (...args) => pickLocalVideoFile(...args),
            pickLocalAudioFile: (...args) => pickLocalAudioFile(...args),
            addMediaNodeFromFile: (...args) => addMediaNodeFromFile(...args)
        },
        connectionSource: {
            connectSourceToTarget: (...args) => connectSourceToTarget(...args),
            setPendingInputTarget: (...args) => setPendingInputTarget(...args),
            clearPendingInputTarget: (...args) => clearPendingInputTarget(...args)
        },
        edgeSource: {
            createUploadEdge: (...args) => CANVAS_UPLOAD_CONNECTION_CONTROLLER.createUploadEdge(...args),
            createSam3VideoMaskEdge: (...args) => CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createSam3VideoMaskEdge(...args),
            createVlmImageEdge: (...args) => CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createVlmImageEdge(...args),
            createMaskImageEdge: (...args) => CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createMaskImageEdge(...args),
            createCompareImageEdge: (...args) => CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createCompareImageEdge(...args),
            createWd14ImageEdge: (...args) => CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createWd14ImageEdge(...args),
            createPoseStudioReferenceEdge: (...args) => CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER.createPoseStudioReferenceEdge(...args),
            createGaussianStudioReferenceEdge: (...args) => CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER.createGaussianStudioReferenceEdge(...args),
            createLivePortraitExpressionImageEdge: (...args) => CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER.createLivePortraitExpressionImageEdge(...args)
        },
        selectionSource: {
            selectNode: (...args) => selectNode(...args),
            selectInputSource: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(nodeId)
        },
        uiSource: {
            showToast: (...args) => showToast(...args),
            openContextMenu: (...args) => openContextMenu(...args)
        }
    };
    CANVAS_INPUT_CREATION_CONTROLLER = typeof WORKBENCH_CANVAS_INPUT_CREATION.createCanvasInputCreationController === 'function'
        ? WORKBENCH_CANVAS_INPUT_CREATION.createCanvasInputCreationController({
            inputCreationSource: INPUT_CREATION_CONTEXT_SOURCE
        })
        : {};
    const RESULT_CONNECTION_CONTEXT_SOURCE = {
        projectSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.projectSource,
        nodeSource: {
            ...UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
            isQwenTtsNode: (...args) => isQwenTtsNode(...args)
        },
        edgeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.edgeSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        selectionSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.selectionSource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.uiSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        persistenceSource: {
            scheduleSave: (...args) => scheduleSave(...args)
        },
        patchSource: {
            buildResultProducerPatch: (...args) => buildResultProducerPatch(...args),
            buildResultStatusPatch: (...args) => buildResultStatusPatch(...args),
            mergeCanvasRunStatus: (...args) => mergeCanvasRunStatus(...args)
        }
    };
    CANVAS_RESULT_CONNECTION_CONTROLLER = typeof WORKBENCH_CANVAS_RESULT_CONNECTION.createCanvasResultConnectionController === 'function'
        ? WORKBENCH_CANVAS_RESULT_CONNECTION.createCanvasResultConnectionController({
            resultConnectionSource: RESULT_CONNECTION_CONTEXT_SOURCE
        })
        : {};
    const CONFIG_CONNECTION_CONTEXT_SOURCE = {
        projectSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.projectSource,
        nodeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
        edgeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.edgeSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        selectionSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.selectionSource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.uiSource,
        renderSource: SPECIAL_RESULT_BRIDGE_CONTEXT_SOURCE.renderSource,
        configSource: {
            parseDetectionSlot: (...args) => parseDetectionSlot(...args),
            isPresetConfigKind: (...args) => isPresetConfigKind(...args),
            configKeyForKind: (...args) => configKeyForKind(...args),
            detectionSlotForRegion: (...args) => detectionSlotForRegion(...args),
            getPresetConfigSource: (...args) => getPresetConfigSource(...args),
            buildInitialConfigValues: (...args) => buildInitialConfigValues(...args)
        },
        classicSource: {
            getClassicEnhanceRegionValues: (...args) => getClassicEnhanceRegionValues(...args),
            applyClassicEnhanceRegionValues: (...args) => applyClassicEnhanceRegionValues(...args)
        },
        sceneSource: {
            getSceneGenerationConfigPropsForConfigNode: (...args) => getSceneGenerationConfigPropsForConfigNode(...args),
            getSceneGenerationConfigDefaultForConfigNode: (...args) => getSceneGenerationConfigDefaultForConfigNode(...args)
        },
        patchSource: {
            buildConfigStatePatch: (...args) => buildConfigStatePatch(...args),
            buildPresetConfigPatch: (...args) => buildPresetConfigPatch(...args)
        },
        catalogSource: {
            refreshModelConfigCatalog: (...args) => refreshModelConfigCatalog(...args)
        },
        timeSource: {
            nowIso: (...args) => nowIso(...args)
        }
    };
    CANVAS_CONFIG_CONNECTION_CONTROLLER = typeof WORKBENCH_CANVAS_CONFIG_CONNECTION.createCanvasConfigConnectionController === 'function'
        ? WORKBENCH_CANVAS_CONFIG_CONNECTION.createCanvasConfigConnectionController({
            configConnectionSource: CONFIG_CONNECTION_CONTEXT_SOURCE
        })
        : {};
    const MODEL_CONFIG_CATALOG_CONTEXT_SOURCE = {
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isNodeLocked: (...args) => isNodeLocked(...args),
            getConfigTargetPreset: (...args) => getConfigTargetPreset(...args)
        },
        requestSource: {
            sendCanvasModelCatalogRequest: (...args) => sendCanvasModelCatalogRequest(...args)
        },
        catalogSource: {
            getGlobalModelCatalog: () => window.simpleaiTopbarSystemParams?.__canvas_model_catalog || {}
        },
        patchSource: CONFIG_CONNECTION_CONTEXT_SOURCE.patchSource,
        historySource: {
            pushHistoryBatch: (...args) => pushHistoryBatch(...args)
        },
        persistenceSource: {
            scheduleSave: (...args) => scheduleSave(...args)
        },
        renderSource: {
            renderAll: (...args) => renderAll(...args)
        },
        timeSource: CONFIG_CONNECTION_CONTEXT_SOURCE.timeSource,
        diagnosticSource: {
            warn: (...args) => console.warn(...args)
        }
    };
    CANVAS_MODEL_CONFIG_CATALOG_CONTROLLER = typeof WORKBENCH_CANVAS_MODEL_CONFIG_CATALOG.createCanvasModelConfigCatalogController === 'function'
        ? WORKBENCH_CANVAS_MODEL_CONFIG_CATALOG.createCanvasModelConfigCatalogController({
            modelConfigCatalogSource: MODEL_CONFIG_CATALOG_CONTEXT_SOURCE
        })
        : {};
    const CONFIG_EDIT_CONTEXT_SOURCE = {
        nodeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
        domSource: {
            getDocument: () => document
        },
        patchSource: CONFIG_CONNECTION_CONTEXT_SOURCE.patchSource,
        historySource: MODEL_CONFIG_CATALOG_CONTEXT_SOURCE.historySource,
        persistenceSource: MODEL_CONFIG_CATALOG_CONTEXT_SOURCE.persistenceSource,
        renderSource: MODEL_CONFIG_CATALOG_CONTEXT_SOURCE.renderSource,
        modelBrowserSource: {
            getModelBrowser: () => window.SimpAIModelBrowser || null,
            getModelCatalog: () => window.simpleaiTopbarSystemParams?.__canvas_model_catalog || {},
            getRoot: () => root,
            getDocumentBody: () => document.body,
            getConfigSelect: (nodeEl, selector) => nodeEl?.querySelector?.(selector) || null,
            cssEscape: value => cssEscape(value),
            normalizeInitialConfigLoras: (...args) => normalizeInitialConfigLoras(...args),
            modelConfigUsesFilter: node => modelConfigUsesFilter(node),
            serializePresetForRun: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializePresetForRun?.(...args) || {},
            createOption: value => new Option(value, value)
        },
        configSource: {
            applyConfigNodeToPreset: (...args) => applyConfigNodeToPreset(...args),
            getConfigTargetPreset: (...args) => getConfigTargetPreset(...args),
            getPresetConfigSource: (...args) => getPresetConfigSource(...args)
        },
        styleSource: {
            normalizeStyleSelections: (...args) => normalizeStyleSelections(...args),
            styleConfigSelectionFromValues: (...args) => styleConfigSelectionFromValues(...args),
            canvasAgentPresetPromptDefaults: (...args) => canvasAgentPresetPromptDefaults(...args)
        },
        resolutionSource: {
            getResolutionChoices: (...args) => getResolutionChoices(...args),
            getResolutionRenderValues: (...args) => getResolutionRenderValues(...args),
            normalizeResolutionTemplateName: (...args) => normalizeResolutionTemplateName(...args),
            resolveResolutionBaseDims: (...args) => resolveResolutionBaseDims(...args),
            getResolutionPreview: (...args) => getResolutionPreview(...args),
            resolutionManualSizeLabel: (...args) => resolutionManualSizeLabel(...args)
        },
        eventSource: {
            setModelConfigFilter: (...args) => setModelConfigFilter(...args),
            syncModelSelectTitle: (...args) => syncModelSelectTitle(...args),
            syncTwinParamInputs: (...args) => syncTwinParamInputs(...args),
            showToast: (...args) => showToast(...args)
        },
        languageSource: {
            t: (en, cn) => t(en, cn, { __lang: runtimeUiLang() }),
            getLanguage: () => runtimeUiLang()
        },
        serializationSource: {
            cloneRunValue: (...args) => cloneRunValue(...args)
        }
    };
    CANVAS_CONFIG_EDIT_CONTROLLER = typeof WORKBENCH_CANVAS_CONFIG_EDIT.createCanvasConfigEditController === 'function'
        ? WORKBENCH_CANVAS_CONFIG_EDIT.createCanvasConfigEditController({
            configEditSource: CONFIG_EDIT_CONTEXT_SOURCE
        })
        : {};
    const CONFIG_VALUES_CONTEXT_SOURCE = {
        catalogSource: {
            getPresetCatalog: (...args) => getPresetCatalog(...args),
            normalizePresetName: (...args) => normalizePresetName(...args)
        },
        configSource: {
            presetConfigKinds: PRESET_CONFIG_KINDS,
            slotOrder: SLOT_ORDER,
            slotLabels: SLOT_LABELS
        },
        styleSource: {
            canvasAgentPresetPromptDefaults: (...args) => canvasAgentPresetPromptDefaults(...args)
        },
        resolutionSource: {
            getDocument: () => document,
            ratioFallbacks: WORKBENCH_RESOLUTION_RATIO_FALLBACKS
        },
        nodeSource: {
            getProject: () => project,
            getNode: (...args) => getNode(...args),
            isNodeIgnored: (...args) => isNodeIgnored(...args)
        },
        classicSource: {
            getClassicEnhanceRegionDefaults: () => registryClassicEnhanceRegionDefaults,
            getClassicEnhanceMaskModels: () => registryClassicEnhanceMaskModels,
            getClassicEnhanceClothCategories: () => registryClassicEnhanceClothCategories,
            getClassicEnhanceSamModels: () => registryClassicEnhanceSamModels,
            getClassicIpMaxImages: () => registryClassicIpMaxImages,
            getClassicIpControlTypes: () => registryClassicIpControlTypes,
            getClassicIpFilters: () => registryClassicIpFilters,
            getClassicUovMethodsFlux: () => registryClassicUovMethodsFlux,
            getClassicUovMethods: () => registryClassicUovMethods,
            getClassicUovMethodsDefault: () => registryClassicUovMethodsDefault,
            getClassicInpaintEngines: () => registryClassicInpaintEngines,
            getClassicInpaintMethods: () => registryClassicInpaintMethods
        },
        utilitySource: { clamp },
        patchSource: {
            buildNodeParamsPatch: (...args) => buildNodeParamsPatch(...args),
            buildClassicNodeStatePatch: (...args) => buildClassicNodeStatePatch(...args)
        },
        serializationSource: CONFIG_EDIT_CONTEXT_SOURCE.serializationSource
    };
    CANVAS_CONFIG_VALUES_CONTROLLER = typeof WORKBENCH_CANVAS_CONFIG_VALUES.createCanvasConfigValuesController === 'function'
        ? WORKBENCH_CANVAS_CONFIG_VALUES.createCanvasConfigValuesController({
            configValuesSource: CONFIG_VALUES_CONTEXT_SOURCE
        })
        : {};
    CANVAS_STYLE_CATALOG_CONTROLLER = typeof WORKBENCH_CANVAS_STYLE_CATALOG.createCanvasStyleCatalogController === 'function'
        ? WORKBENCH_CANVAS_STYLE_CATALOG.createCanvasStyleCatalogController({
            styleCatalogSource: {
                getStyleCatalog: () => window.SimpAIStyleCatalog || {},
                getGradioApp: () => typeof gradioApp === 'function' ? gradioApp() : null,
                getDocument: () => document,
                getFallbackChoices: () => STYLE_CHOICES_FALLBACK
            }
        })
        : {};
    CANVAS_STYLE_CONFIG_RENDERER = typeof WORKBENCH_CANVAS_STYLE_CONFIG_RENDERER.createCanvasStyleConfigRenderer === 'function'
        ? WORKBENCH_CANVAS_STYLE_CONFIG_RENDERER.createCanvasStyleConfigRenderer({
            styleConfigRendererSource: {
                styleValueSource: {
                    styleConfigSelectionFromValues: (...args) => styleConfigSelectionFromValues(...args)
                },
                styleCatalogSource: {
                    getStyleChoices: (...args) => getStyleChoices(...args),
                    getStylePreviewCatalogFromDom: (...args) => getStylePreviewCatalogFromDom(...args)
                },
                utilitySource: {
                    escapeHtml: (...args) => escapeHtml(...args),
                    t: (...args) => t(...args),
                    displayStyleName: (...args) => displayStyleName(...args),
                    renderNodeStateBadges: (...args) => renderNodeStateBadges(...args),
                    hoverPreviewAttrs: (...args) => hoverPreviewAttrs(...args)
                }
            }
        })
        : {};
    CANVAS_DETECTION_CONFIG_RENDERER = typeof WORKBENCH_CANVAS_DETECTION_CONFIG_RENDERER.createCanvasDetectionConfigRenderer === 'function'
        ? WORKBENCH_CANVAS_DETECTION_CONFIG_RENDERER.createCanvasDetectionConfigRenderer({
            detectionConfigRendererSource: {
                getDetectionChoices: (...args) => getDetectionChoices(...args),
                danbooruAutocompleteAttrs: (...args) => danbooruAutocompleteAttrs(...args),
                optionHtml: (...args) => optionHtml(...args),
                escapeHtml: (...args) => escapeHtml(...args),
                t: (...args) => t(...args),
                renderNodeStateBadges: (...args) => renderNodeStateBadges(...args)
            }
        })
        : {};
    CANVAS_ADVANCED_CONFIG_RENDERER = typeof WORKBENCH_CANVAS_ADVANCED_CONFIG_RENDERER.createCanvasAdvancedConfigRenderer === 'function'
        ? WORKBENCH_CANVAS_ADVANCED_CONFIG_RENDERER.createCanvasAdvancedConfigRenderer({
            advancedConfigRendererSource: {
                getSceneGenerationConfigPropsForConfigNode: (...args) => getSceneGenerationConfigPropsForConfigNode(...args),
                getSceneGenerationConfigDefaultForConfigNode: (...args) => getSceneGenerationConfigDefaultForConfigNode(...args),
                configNumberValue: (...args) => configNumberValue(...args),
                boundedConfigNumberValue: (...args) => boundedConfigNumberValue(...args),
                configTextValue: (...args) => configTextValue(...args),
                mergeChoices: (...args) => mergeChoices(...args),
                getDocument: () => document,
                getGradioApp: () => typeof gradioApp === 'function' ? gradioApp() : null,
                getSamplerChoices: () => ADVANCED_SAMPLER_CHOICES,
                getSchedulerChoices: () => ADVANCED_SCHEDULER_CHOICES,
                optionHtml: (...args) => optionHtml(...args),
                escapeHtml: (...args) => escapeHtml(...args),
                t: (...args) => t(...args),
                renderNodeStateBadges: (...args) => renderNodeStateBadges(...args)
            }
        })
        : {};
    CANVAS_MODEL_CONFIG_RENDERER = typeof WORKBENCH_CANVAS_MODEL_CONFIG_RENDERER.createCanvasModelConfigRenderer === 'function'
        ? WORKBENCH_CANVAS_MODEL_CONFIG_RENDERER.createCanvasModelConfigRenderer({
            modelConfigRendererSource: {
                getModelChoices: (...args) => getModelChoices(...args),
                normalizeInitialConfigLoras: (...args) => normalizeInitialConfigLoras(...args),
                modelConfigUsesFilter: (...args) => modelConfigUsesFilter(...args),
                renderNodeStateBadges: (...args) => renderNodeStateBadges(...args),
                escapeHtml: (...args) => escapeHtml(...args),
                t: (...args) => t(...args),
                optionHtml: (...args) => optionHtml(...args)
            }
        })
        : {};
    CANVAS_RESOLUTION_CONFIG_RENDERER = typeof WORKBENCH_CANVAS_RESOLUTION_CONFIG_RENDERER.createCanvasResolutionConfigRenderer === 'function'
        ? WORKBENCH_CANVAS_RESOLUTION_CONFIG_RENDERER.createCanvasResolutionConfigRenderer({
            resolutionConfigRendererSource: {
                getResolutionRenderValues: (...args) => getResolutionRenderValues(...args),
                getResolutionChoices: (...args) => getResolutionChoices(...args),
                normalizeResolutionTemplateName: (...args) => normalizeResolutionTemplateName(...args),
                getResolutionPreview: (...args) => getResolutionPreview(...args),
                resolutionManualSizeLabel: (...args) => resolutionManualSizeLabel(...args),
                optionHtml: (...args) => optionHtml(...args),
                escapeHtml: (...args) => escapeHtml(...args),
                t: (...args) => t(...args),
                tOption: (...args) => tOption(...args),
                renderNodeStateBadges: (...args) => renderNodeStateBadges(...args)
            }
        })
        : {};
    const CONFIG_CREATION_CONTEXT_SOURCE = {
        projectSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.projectSource,
        nodeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
        classicSource: CONFIG_CONNECTION_CONTEXT_SOURCE.classicSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        selectionSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.selectionSource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.uiSource,
        configSource: {
            parseDetectionSlot: (...args) => parseDetectionSlot(...args),
            isPresetConfigKind: (...args) => isPresetConfigKind(...args),
            getPresetConfigSource: (...args) => getPresetConfigSource(...args),
            buildInitialConfigValues: (...args) => buildInitialConfigValues(...args),
            getDetectionConfigLabel: (...args) => getDetectionConfigLabel(...args),
            configTitleForKind: (...args) => configTitleForKind(...args)
        },
        factorySource: {
            buildConfigNode: (...args) => buildConfigNode(...args)
        },
        layoutSource: {
            placeNodeAvoidingOverlap: (...args) => placeNodeAvoidingOverlap(...args)
        },
        connectionSource: CANVAS_CONFIG_CONNECTION_CONTROLLER,
        renderSource: {
            renderAll: (...args) => renderAll(...args),
            mutate: (...args) => mutate(...args)
        }
    };
    CANVAS_CONFIG_CREATION_CONTROLLER = typeof WORKBENCH_CANVAS_CONFIG_CREATION.createCanvasConfigCreationController === 'function'
        ? WORKBENCH_CANVAS_CONFIG_CREATION.createCanvasConfigCreationController({
            configCreationSource: CONFIG_CREATION_CONTEXT_SOURCE
        })
        : {};
    const SPECIAL_MEDIA_SOURCE_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isNodeIgnored: (...args) => isNodeIgnored(...args)
        },
        resultSource: {
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args)
        },
        assetSource: {
            assetMediaKind: (...args) => assetMediaKind(...args)
        },
        presetSource: {
            presetOutputMediaKind: (...args) => presetOutputMediaKind(...args)
        },
        specialNodeSource: {
            isPoseStudioSource: (...args) => !!poseStudioIsSource?.(...args, POSE_STUDIO_NODE_CONTEXT),
            isGaussianStudioSource: (...args) => !!gaussianStudioIsSource?.(...args, GAUSSIAN_STUDIO_NODE_CONTEXT),
            isLivePortraitExpressionSource: (...args) => !!livePortraitIsSource?.(...args, LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT)
        }
    };
    CANVAS_SPECIAL_MEDIA_SOURCE_CONTROLLER = typeof WORKBENCH_CANVAS_SPECIAL_MEDIA_SOURCE.createCanvasSpecialMediaSourceController === 'function'
        ? WORKBENCH_CANVAS_SPECIAL_MEDIA_SOURCE.createCanvasSpecialMediaSourceController({
            specialMediaSource: SPECIAL_MEDIA_SOURCE_CONTEXT_SOURCE
        })
        : {};
    const runPresetNode = (...args) => CANVAS_PRESET_RUN_RUNTIME_CONTROLLER.runPresetNode?.(...args)
        || Promise.resolve({ ok: false, error: 'preset run runtime controller unavailable' });
    const CANVAS_RUNTIME_CONTEXT = typeof WORKBENCH_CANVAS_RUNTIME_CONTEXT.createCanvasWorkbenchRuntimeContext === 'function'
        ? WORKBENCH_CANVAS_RUNTIME_CONTEXT.createCanvasWorkbenchRuntimeContext({
            runtimeSource: RUNTIME_CONTEXT_SOURCE
        })
        : {};
    const {
        CANVAS_STATUS_CONTROLLER,
        renderStatus,
        CANVAS_PRESET_NODE_RENDERER,
        renderClassicNodeHtml,
        renderPresetNodeHtml,
        getSlotOrderHint,
        getPresetSpecialControllerKind,
        normalizePresetSpecialState,
        presetSpecialControllerState,
        presetSpecialPromptFromState,
        renderPresetSpecialController,
        filterVisiblePresetParamsForSpecial,
        getVisiblePresetParams,
        shouldShowPresetParam,
        isResolutionOwnedPresetParam,
        presetParamValue,
        isPromptTextParam,
        CANVAS_NODE_LAYOUT_CONTROLLER,
        defaultResultNodeSize,
        boundedImageNodeSizeForAsset,
        fitImageNodeToAssetBounds,
        ensureResultNodeReadableSize,
        ensureMediaBrowserNodeReadableSize,
        findOpenNodePosition,
        getNodeRect,
        getNodeLayoutSize,
        minResizableNodeSize,
        placeNodeAvoidingOverlap,
        CANVAS_VIEWPORT_RENDER_CONTROLLER,
        CANVAS_VIEWPORT_FIT_CONTROLLER,
        CANVAS_VIEWPORT_ZOOM_CONTROLLER,
        hasActivePointerInteraction,
        isCanvasPointerGestureActive,
        getVisibleWorldRect,
        getNodeRenderWorldRect,
        getEdgeRenderWorldRect,
        shouldRenderNodeInViewport,
        shouldRenderEdgeInViewport,
        getEdgeSvgBounds,
        CANVAS_NODE_SPATIAL_INDEX_CONTROLLER,
        invalidateNodeSpatialIndex,
        refreshNodeSpatialIndexRecord,
        queryNodeRecordsForRect,
        querySpatialNodeRecords,
        getMarqueeNodeRecords,
        findCanvasNodeAtWorldPoint,
        getVisibleNodeRecords,
        countVisibleNodesForRenderWindow,
        shouldDeferPanNodeRender,
        CANVAS_NODE_FACTORY_CONTROLLER,
        buildNodeParamsPatch,
        buildNodeStylePatch,
        applyNodeStylePatch,
        buildNodeLayoutPatch,
        applyNodeLayoutPatch,
        buildNodeFlagPatch,
        buildNodeFieldPatch,
        buildPresetUploadSlotPatch,
        buildClassicNodeStatePatch,
        buildPresetTextInputPatch,
        buildPresetStyleTransferPatch,
        buildPresetRuntimePatch,
        buildPresetWildcardPreviewPatch,
        buildPresetConfigPatch,
        buildPresetDefinitionPatch,
        applyPresetDefinitionPatch,
        buildPresetGenerationConfigPatch,
        buildPresetSnapshotPatch,
        buildGenerationMetadataPatch,
        buildClassicNode,
        buildPresetNode,
        buildPresetModelCatalogStatus,
        buildPresetModelCheckingStatus,
        buildPresetModelStatusPatch,
        applyPresetModelStatus
    } = CANVAS_RUNTIME_CONTEXT;
    const {
        CANVAS_ASSET_NODE_RENDERER,
        renderAssetAudioWaveformHtml,
        renderAssetMediaHtml,
        renderBatchAnyNodeHtml,
        resultPreviewFrameSrc,
        resultPreviewFrameAspect,
        latestResultPreviewFrame,
        resultPreviewAspectSource,
        renderResultPreviewStripHtml,
        renderResultMetadataPopover,
        renderResultMediaHtml,
        renderResultNodeHtml,
        mediaBrowserItemMetadata,
        mediaBrowserItemPrompt,
        mediaBrowserItemNegativePrompt,
        renderMediaBrowserPanelHtml,
        renderMediaBrowserNodeHtml,
        CANVAS_RESULT_PREVIEW_CONTROLLER,
        resultPreviewHasRenderableSource,
        shouldShowResultRunningPreview,
        applyResultPreviewAspect,
        bindResultPreviewAspectFromImage,
        bindResultNodePreviewAspect,
        resultPreviewLastSerial,
        stopResultPreviewPlayer,
        ensureResultPreviewStreamDom,
        updateResultPreviewPlayerDom,
        startResultPreviewPlayback,
        syncResultPreviewPlayerDom,
        resultPreviewFreshFrames,
        applyResultPreviewStream,
        appendResultNodePreviewFrames,
        refreshResultNodePreviewDom,
        CANVAS_NODE_RENDERER,
        renderNodeHtml,
        overviewNodeKindLabel,
        overviewNodeAsset,
        overviewInputPorts,
        overviewOutputKind,
        notConnectedText,
        portHintText,
        slotPortHintText,
        slotPortTitle,
        slotPortButtonTitle,
        imagePortTitle,
        imagePortButtonTitle,
        configPortTitle,
        configInputTitle,
        configTitleForKind,
        configLabelForKind,
        configIconForKind,
        renderPresetConfigPortRow,
        renderNodeStateBadges,
        renderRunnableNodeStatusFoot
    } = CANVAS_RUNTIME_CONTEXT;
    const TIMELINE_NODE_CONTEXT_SOURCE = {
        languageSource: {
            t,
            tOption
        },
        utilitySource: {
            escapeHtml,
            clamp
        },
        assetSource: {
            formatDuration: assetNodeFormatDuration,
            getMediaEditRange: (asset) => getMediaEditRange(asset),
            assetDisplaySrc,
            assetThumbSrc: assetNodeThumbSrc,
            serializeAssetForRun,
            assetMediaKind
        },
        nodeSource: {
            getNode,
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
            getTimelineSourceAsset,
            readAssetSize,
            renderNodeStateBadges,
            uid,
            defaultNodeSize,
            cloneRunValue
        },
        timeSource: {
            now: () => canvasNow()
        }
    };
    const CANVAS_TIMELINE_NODE_CONTEXT = typeof WORKBENCH_CANVAS_TIMELINE_NODE_CONTEXT.createCanvasWorkbenchTimelineNodeContext === 'function'
        ? WORKBENCH_CANVAS_TIMELINE_NODE_CONTEXT.createCanvasWorkbenchTimelineNodeContext({
            timelineNodeSource: TIMELINE_NODE_CONTEXT_SOURCE
        })
        : {};
    TIMELINE_NODE_CONTEXT = CANVAS_TIMELINE_NODE_CONTEXT.TIMELINE_NODE_CONTEXT || {};
    const MEDIA_NODE_CONTEXT_SOURCE = {
        imageNodeSource: {
            utilitySource: {
                escapeHtml,
                t
            },
            assetSource: {
                assetDisplaySrc: (asset) => safeAssetDisplaySrc(asset, asset?.thumb || asset?.preview_url || asset?.data_url || ''),
                readImageInfo,
                mediaAspectStyle,
                readAssetSize
            },
            nodeSource: {
                getNodeImageSrc
            },
            renderSource: {
                renderNodeStateBadges
            }
        },
        videoNodeSource: {
            utilitySource: {
                escapeHtml,
                t
            },
            assetSource: {
                formatDuration: assetNodeFormatDuration,
                mediaEditRange: assetNodeMediaEditRange,
                assetDisplaySrc,
                readAssetInfo,
                readAssetSize,
                mediaAspectStyle
            },
            renderSource: {
                renderNodeStateBadges
            }
        },
        audioNodeSource: {
            utilitySource: {
                escapeHtml,
                t
            },
            assetSource: {
                formatDuration: assetNodeFormatDuration,
                mediaEditRange: assetNodeMediaEditRange,
                assetDisplaySrc,
                readAssetInfo,
                readAssetSize
            },
            renderSource: {
                renderNodeStateBadges
            }
        }
    };
    const CANVAS_MEDIA_NODE_CONTEXT = typeof WORKBENCH_CANVAS_MEDIA_NODE_CONTEXT.createCanvasWorkbenchMediaNodeContext === 'function'
        ? WORKBENCH_CANVAS_MEDIA_NODE_CONTEXT.createCanvasWorkbenchMediaNodeContext({
            mediaNodeSource: MEDIA_NODE_CONTEXT_SOURCE
        })
        : {};
    IMAGE_NODE_CONTEXT = CANVAS_MEDIA_NODE_CONTEXT.IMAGE_NODE_CONTEXT || null;
    VIDEO_NODE_CONTEXT = CANVAS_MEDIA_NODE_CONTEXT.VIDEO_NODE_CONTEXT || null;
    AUDIO_NODE_CONTEXT = CANVAS_MEDIA_NODE_CONTEXT.AUDIO_NODE_CONTEXT || null;
    function setCompareNodeSelection(nodeId) {
        return CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(nodeId);
    }

    const COMPARE_NODE_CONTEXT_SOURCE = {
        utilitySource: {
            escapeHtml,
            t,
            clamp
        },
        assetSource: {
            assetDisplaySrc,
            readAssetSize
        },
        projectSource: {
            getProject: () => project,
            buildProjectNodeAppendPatch
        },
        nodeSource: {
            defaultNodeSize,
            uid,
            getNode,
            isImageCompareSource,
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args)
        },
        layoutSource: { placeNodeAvoidingOverlap },
        connectionSource: { completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args) },
        historySource: { pushHistory: (...args) => pushHistory(...args) },
        selectionSource: { setSelectedNode: setCompareNodeSelection },
        renderSource: {
            renderIconHtml,
            renderNodeStateBadges,
            mutate
        },
        uiSource: { showToast }
    };
    const CANVAS_COMPARE_NODE_CONTEXT = typeof WORKBENCH_CANVAS_COMPARE_NODE_CONTEXT.createCanvasWorkbenchCompareNodeContext === 'function'
        ? WORKBENCH_CANVAS_COMPARE_NODE_CONTEXT.createCanvasWorkbenchCompareNodeContext({
            compareNodeSource: COMPARE_NODE_CONTEXT_SOURCE
        })
        : {};
    COMPARE_NODE_CONTEXT = CANVAS_COMPARE_NODE_CONTEXT.COMPARE_NODE_CONTEXT || {};
    const COMPARE_CREATION_CONTEXT_SOURCE = {
        factorySource: {
            addCompareNode: (world, options) => compareNodeAddNode(world, options, COMPARE_NODE_CONTEXT)
        },
        layoutSource: {
            getNodeRect,
            defaultNodeSize
        },
        connectionSource: {
            createCompareImageEdge: (...args) => createCompareImageEdge(...args)
        },
        historySource: { pushHistory: (...args) => pushHistory(...args) },
        selectionSource: {
            selectCompareNode: setCompareNodeSelection
        },
        renderSource: { mutate },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        },
        uiSource: { showToast }
    };
    CANVAS_COMPARE_CREATION_CONTROLLER = typeof WORKBENCH_CANVAS_COMPARE_CREATION.createCanvasCompareCreationController === 'function'
        ? WORKBENCH_CANVAS_COMPARE_CREATION.createCanvasCompareCreationController({
            compareCreationSource: Object.assign({
                nodeSource: { isImageCompareSource }
            }, COMPARE_CREATION_CONTEXT_SOURCE)
        })
        : {};

    const COMPARE_STATE_CONTEXT_SOURCE = {
        nodeSource: {
            getNode,
            isNodeLocked,
            buildCompareStatePatch: (...args) => compareNodeBuildStatePatch(...args)
        },
        stateSource: { getSelectedNodeId: () => selectedNodeId },
        projectSource: { getProject: () => project },
        utilitySource: { clamp },
        domSource: {
            escapeSelector: value => CSS.escape(value),
            querySelectorAll: selector => document.querySelectorAll(selector)
        },
        runtimeSource: {
            pushHistory: (...args) => pushHistory(...args),
            pushHistoryBatch: (...args) => pushHistoryBatch(...args),
            scheduleSave,
            mutate
        }
    };
    const CANVAS_COMPARE_STATE_CONTROLLER = typeof WORKBENCH_CANVAS_COMPARE_STATE.createCanvasCompareStateController === 'function'
        ? WORKBENCH_CANVAS_COMPARE_STATE.createCanvasCompareStateController({ compareStateSource: COMPARE_STATE_CONTEXT_SOURCE })
        : {};

    const STYLE_SELECTOR_NODE_CONTEXT_SOURCE = {
        utilitySource: {
            escapeHtml,
            t
        },
        catalogSource: {
            getItems: () => window.SimpAIStyleTransferCatalog?.items
        },
        applyStyleSelectorToPreset,
        getProject: () => project,
        buildProjectNodeAppendPatch: (...args) => buildProjectNodeAppendPatch(...args),
        buildNodeLayoutPatch: (...args) => buildNodeLayoutPatch(...args),
        placeNodeAvoidingOverlap: (...args) => placeNodeAvoidingOverlap(...args),
        viewportCenterWorld: (...args) => viewportCenterWorld(...args),
        completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args),
        setSelectedStyle: (node, name) => typeof styleSelectorSetSelectedStyle === 'function'
            ? styleSelectorSetSelectedStyle(node, name, STYLE_SELECTOR_NODE_CONTEXT) : undefined,
        setSelectedNode: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionState(nodeId),
        buildStyleSelectorStatePatch,
        isStyleTransferPresetNode: (...args) => isStyleTransferPresetNode(...args),
        runPresetNode: (...args) => runPresetNode(...args),
        getVisiblePresetParams: (...args) => getVisiblePresetParams(...args),
        getPromptTextSourceNode: (...args) => getPromptTextSourceNode(...args),
        buildNodeParamsPatch: (...args) => buildNodeParamsPatch(...args),
        buildPresetTextInputPatch: (...args) => buildPresetTextInputPatch(...args),
        buildPresetStyleTransferPatch: (...args) => buildPresetStyleTransferPatch(...args),
        filterProjectEdges: (...args) => filterProjectEdges(...args),
        appendProjectEdge: (...args) => appendProjectEdge(...args),
        buildCanvasEdge: (...args) => buildCanvasEdge(...args),
        linkStyleSelectorToPreset: (...args) => linkStyleSelectorToPreset(...args),
        defaultNodeSize,
        getNode,
        isNodeLocked,
        mutate,
        nowIso,
        pushHistory: (...args) => pushHistory(...args),
        pushHistoryBatch: (...args) => pushHistoryBatch(...args),
        renderNodeStateBadges,
        scheduleSave,
        showToast,
        styleSelectorTargetLabel: (_node, targetId) => {
            const target = getNode(targetId || '');
            return target ? `${target.title || target.preset?.display_name || target.preset?.name || target.id}` : '';
        },
        uid
    };
    const QWEN_TTS_NODE_CONTEXT_SOURCE = {
        utilitySource: {
            escapeHtml,
            t
        },
        getProject: () => project,
        getNode: (...args) => getNode(...args),
        getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
        assetMediaKind,
        uid,
        defaultNodeSize,
        buildQwenTtsStatePatch,
        buildProjectNodeAppendPatch,
        getQwenTtsStylePresets: () => getQwenTtsStylePresetEntries(),
        mutate,
        placeNodeAvoidingOverlap,
        pushHistory: (...args) => pushHistory(...args),
        renderNodeStateBadges,
        setSelectedNode: id => CANVAS_SELECTION_CONTROLLER.setNodeSelectionIncludingEmpty(id),
        completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args),
        showToast
    };
    const {
        CANVAS_NODE_RENDER_CONTROLLER,
        renderNodes,
        resetRenderedProjectDomCache,
        nodeRenderKey,
        getNodeEffectiveRenderMode,
        isVisibleWorldRectCoveredByRenderedNodes: isVisibleWorldRectCoveredByRenderedNodesFromController,
        invalidateRenderedNode,
        updateNodePositionDom: updateNodePositionDomFromController,
        rememberRenderedNodeLayout,
        refreshNodeLayoutForAgent,
        getRenderedNodeElement,
        getNodeRenderCoverageRect,
        setNodeRenderCoverageRect,
        getMeasuredNodeLayout,
        getNodeLayoutCacheSize
    } = CANVAS_RUNTIME_CONTEXT;
    const {
        CANVAS_RENDER_CONTROLLER,
        renderAll,
        CANVAS_RUN_STATUS_CONTROLLER,
        isRunQueueActiveState,
        runQueueRunResultNode,
        runQueueRunPercent,
        latestRunQueueSize,
        runQueueWidgetSummary,
        renderRunQueueWidget,
        parseStandaloneStatusPayload,
        fetchStandaloneStatusPayload,
        publishStandaloneStatus,
        refreshStandaloneStatus,
        startStandaloneStatusMonitor,
        stopStandaloneStatusMonitor,
        renderSystemInfo,
        setCanvasBackendAlert,
        buildCanvasRunStatus,
        mergeCanvasRunStatus,
        buildCanvasNodeStatusPatch,
        CANVAS_MINIMAP_CONTROLLER,
        invalidateMinimapStaticCache,
        syncMinimapViewRect,
        updateMinimapForViewportInteraction,
        renderMinimap,
        onMinimapPointerDown,
        scheduleMinimapRender,
        cancelMinimapRender,
        flushMinimapRender,
        resetMinimapCache,
        isMinimapDragging,
        CANVAS_HISTORY_CONTROLLER,
        pushHistory,
        pushHistoryBatch,
        undoCanvasEdit,
        redoCanvasEdit,
        renderHistoryButtons,
        resetHistory,
        CANVAS_SELECTION_CONTROLLER,
        updateSelectionDomClasses,
        refreshSelectionUi,
        selectNodeLight,
        toggleNodeSelectionLight,
        selectGroupLight,
        selectNode,
        toggleNodeSelection,
        getSelectedNodeIdList,
        toggleSelectedNodesFlag,
        getEditableSelectedNodes,
        alignSelectedNodes,
        distributeSelectedNodes,
        selectEdge,
        reconcileSelection: reconcileSelectionFromController,
        CANVAS_GRAPH_DELETE_CONTROLLER,
        deleteSelection,
        deleteEdge,
        deleteUploadSlot,
        CANVAS_RESOLUTION_DRAG_CONTROLLER,
        startResolutionDrag,
        updateResolutionFromDrag,
        onResolutionDragMove,
        stopResolutionDrag,
        cancelResolutionDrag,
        isResolutionDragging,
        getResolutionDraggingNodeId,
        CANVAS_CLIPBOARD_CONTROLLER,
        buildSelectionClipboard,
        copyCanvasSelection,
        duplicateSelection,
        pasteCanvasClipboard,
        CANVAS_GROUP_INTERACTION_CONTROLLER,
        bindGroupLayerEvents,
        isGroupDragging,
        isGroupResizing,
        CANVAS_RUN_PANELS_CONTROLLER,
        renderRunQueuePanelIfOpen,
        openRunQueuePanel,
        closeRunQueuePanel,
        renderRunQueuePanel,
        handleRunQueueAction,
        openRunHistoryPanel,
        closeRunHistoryPanel,
        renderRunHistoryPanel,
        handleRunHistoryAction,
        CANVAS_NODE_RESIZE_CONTROLLER,
        startNodeResize,
        isNodeResizing,
        getNodeResizeNodeId,
        CANVAS_NODE_DRAG_CONTROLLER,
        startNodeDrag,
        isNodeDragging,
        getDraggingNodeIds,
        isDraggingNode,
        CANVAS_PAN_CONTROLLER,
        startPan,
        isPanning,
        CANVAS_MARQUEE_CONTROLLER,
        startMarqueeSelection,
        isMarqueeSelecting,
        CANVAS_VIEWPORT_POINTER_CONTROLLER,
        handleViewportNodePointerDown,
        onViewportPointerDown,
        onViewportDoubleClick,
        CANVAS_CONNECTION_CONTROLLER,
        startConnection,
        startInputConnection,
        isConnecting,
        getConnectingFromId,
        updateTempEdge,
        cancelConnection
    } = CANVAS_RUNTIME_CONTEXT;
    const NODE_POINTER_CONTEXT_SOURCE = {
        nodePointerSource: {
            startPan: (...args) => startPan(...args),
            isCanvasAgentPickingReference: () => !!canvasAgentState.pickReference,
            addCanvasAgentReferenceFromNode: (...args) => addCanvasAgentReferenceFromNode(...args),
            setCanvasAgentPickingReference: (value) => { canvasAgentState.pickReference = value; },
            renderCanvasAgentPanel: (...args) => renderCanvasAgentPanel(...args),
            startNodeResize: (...args) => startNodeResize(...args),
            startResolutionDrag: (...args) => startResolutionDrag(...args),
            startConnection: (...args) => startConnection(...args),
            handleInputHandlePointerDownFromEvent: (...args) => handleInputHandlePointerDownFromEvent(...args),
            startComparePositionDrag: (...args) => startComparePositionDrag(...args),
            startTimelineKeyframeDrag: (...args) => startTimelineKeyframeDrag(...args),
            startTimelineMaskAnchorDrag: (...args) => startTimelineMaskAnchorDrag(...args),
            startTimelinePlayheadDrag: (...args) => startTimelinePlayheadDrag(...args),
            startTimelineMaskDraw: (...args) => startTimelineMaskDraw(...args),
            startTimelinePreviewDrag: (...args) => startTimelinePreviewDrag(...args),
            startTimelineClipDrag: (...args) => startTimelineClipDrag(...args),
            isDirectorTimelineNode,
            startDirectorTimelinePreviewDrag: (...args) => startDirectorTimelinePreviewDrag(...args),
            isInteractiveTarget: (...args) => isInteractiveTarget(...args),
            handleNodeDragPointerDown: (...args) => CANVAS_NODE_DRAG_CONTROLLER.handleNodePointerDown(...args)
        }
    };
    const CANVAS_NODE_POINTER_CONTROLLER = typeof WORKBENCH_CANVAS_NODE_POINTER.createCanvasNodePointerController === 'function'
        ? WORKBENCH_CANVAS_NODE_POINTER.createCanvasNodePointerController(NODE_POINTER_CONTEXT_SOURCE)
        : {};
    const NODE_EVENT_CONTEXT_SOURCE = {
        nodeEventSource: {
            injectParamResetButtons: (...args) => injectParamResetButtons(...args),
            bindNodeMediaControlEvents: (...args) => CANVAS_MEDIA_PLAYBACK_CONTROLLER.bindNodeMediaControlEvents(...args),
            bindResultNodePreviewAspect: (...args) => bindResultNodePreviewAspect(...args),
            bindPresetSpecialViewerEvents: (...args) => bindPresetSpecialViewerEvents(...args),
            isImageFile: (...args) => isImageFile(...args),
            clearViewportDropTarget: () => viewport.classList.remove('is-drop-target'),
            handleImageNodeDrop: (...args) => handleImageNodeDrop(...args),
            bindVlmChatDropEvents: (...args) => bindVlmChatDropEvents(...args),
            bindVlmChatScrollControls: (...args) => bindVlmChatScrollControls(...args),
            bindMediaBrowserNodeDragEvents: (...args) => bindMediaBrowserNodeDragEvents(...args),
            handleNodePointerDown: (...args) => CANVAS_NODE_POINTER_CONTROLLER.handleNodePointerDown(...args),
            bindNodeContextMenu: (...args) => CANVAS_NODE_CONTEXT_MENU_CONTROLLER.bindNodeContextMenu(...args),
            textareaEditorFieldFromTitleClick: (...args) => textareaEditorFieldFromTitleClick(...args),
            openTextareaEditor: (...args) => openTextareaEditor(...args),
            handleMediaBrowserNodeClick: (...args) => CANVAS_MEDIA_BROWSER_INTERACTION_CONTROLLER.handleMediaBrowserNodeClick(...args),
            handleTimelineClick: (...args) => handleTimelineClick(...args),
            handleResultMetadataToggle: (...args) => CANVAS_RESULT_ASSET_CONTROLLER.handleResultMetadataToggle?.(...args) || false,
            handleCanvasRelightLightButtonEvent: (...args) => handleCanvasRelightLightButtonEvent(...args),
            handlePresetParamResetClick: (...args) => handlePresetParamResetClick(...args),
            handleResultAssetClick: (...args) => CANVAS_RESULT_ASSET_CONTROLLER.handleResultAssetClick?.(...args) || false,
            handleNodeMediaEditEvent: (...args) => handleNodeMediaEditEvent(...args),
            handleNodeConfigFieldEvent: (...args) => handleNodeConfigFieldEvent(...args),
            handleStylesConfigActionClick: (...args) => handleStylesConfigActionClick(...args),
            styleSelectorHandleCardClick: (node, evt) => styleSelectorHandleCardClick(node, evt, STYLE_SELECTOR_NODE_CONTEXT),
            handleModelBrowserButtonClick: (...args) => handleModelBrowserButtonClick(...args),
            handleTranslateClick: (...args) => handleTranslateClick(...args),
            handleTagCartClick: (...args) => handleTagCartClick(...args),
            handleCompareNodeEvent: (...args) => handleCompareNodeEvent(...args),
            handleVlmChatJumpClick: (...args) => handleVlmChatJumpClick(...args),
            handleVlmChatInputClick: (...args) => handleVlmChatInputClick(...args),
            handleVlmParamResetClick: (...args) => handleVlmParamResetClick(...args),
            handleVlmChatMessageActionClick: (...args) => handleVlmChatMessageActionClick(...args),
            handleVlmAgentActionClick: (...args) => handleVlmAgentActionClick(...args),
            handleNodeActionEvent: (...args) => handleNodeActionEvent(...args),
            handleMediaBrowserNodeKeydown: (...args) => CANVAS_MEDIA_BROWSER_INTERACTION_CONTROLLER.handleMediaBrowserNodeKeydown(...args),
            handleVlmChatInputKeyDown: (...args) => handleVlmChatInputKeyDown(...args),
            handleNodeDoubleClick: (...args) => handleNodeDoubleClick(...args),
            handleTimelineNodeParamEvent: (...args) => handleTimelineNodeParamEvent(...args),
            styleSelectorHandleSearchInput: (node, evt, nodeEl) => styleSelectorHandleSearchInput(node, evt, nodeEl, STYLE_SELECTOR_NODE_CONTEXT),
            handleNoteTextEvent: (...args) => handleNoteTextEvent(...args),
            handleNodeParamEvent: (...args) => handleNodeParamEvent(...args),
            handleNodeParamFieldChange: (...args) => handleNodeParamFieldChange(...args),
            handleMediaBrowserNodeChange: (...args) => CANVAS_MEDIA_BROWSER_INTERACTION_CONTROLLER.handleMediaBrowserNodeChange(...args),
            handleClassicNodeChangeEvent: (...args) => handleClassicNodeChangeEvent(...args),
            handlePresetThemeChange: (...args) => handlePresetThemeChange(...args)
        }
    };
    const CANVAS_NODE_EVENT_CONTROLLER = typeof WORKBENCH_CANVAS_NODE_EVENT.createCanvasNodeEventController === 'function'
        ? WORKBENCH_CANVAS_NODE_EVENT.createCanvasNodeEventController(NODE_EVENT_CONTEXT_SOURCE)
        : {};
    const WORKBENCH_EVENT_CONTEXT_SOURCE = {
        workbenchEventSource: {
            getRoot: () => root,
            getViewport: () => viewport,
            getPalette: () => palette,
            getMinimap: () => minimapEl,
            getOutpaintOverlay: () => outpaintOverlayEl,
            getWindow: () => window,
            onCanvasWorkbenchClick: (...args) => onCanvasWorkbenchClick(...args),
            bindCanvasInputEvents: (...args) => bindCanvasInputEvents(...args),
            onViewportPointerDown: (...args) => onViewportPointerDown(...args),
            onViewportWheel: (...args) => onViewportWheel(...args),
            onViewportDragOver: (...args) => onViewportDragOver(...args),
            onViewportDragLeave: (...args) => onViewportDragLeave(...args),
            onViewportDrop: (...args) => onViewportDrop(...args),
            onViewportContextMenu: (...args) => onViewportContextMenu(...args),
            onViewportDoubleClick: (...args) => onViewportDoubleClick(...args),
            onVlmChatImagePreviewPointerOver: (...args) => onVlmChatImagePreviewPointerOver(...args),
            onVlmChatImagePreviewPointerMove: (...args) => onVlmChatImagePreviewPointerMove(...args),
            onVlmChatImagePreviewPointerOut: (...args) => onVlmChatImagePreviewPointerOut(...args),
            onMinimapPointerDown: (...args) => onMinimapPointerDown(...args),
            onOutpaintOverlayPointerDown: (...args) => onOutpaintOverlayPointerDown(...args),
            handlePresetSpecialViewerMessage: (...args) => handlePresetSpecialViewerMessage(...args),
            closePresetPalette: (...args) => closePresetPalette(...args),
            renderPresetPalette: (...args) => renderPresetPalette(...args),
            handlePresetPaletteClick: (...args) => CANVAS_PRESET_PALETTE.handlePresetPaletteClick(...args),
            renderAll: (...args) => renderAll(...args),
            hasDanbooruAutocompleteField: (...args) => hasDanbooruAutocompleteField(...args),
            positionDanbooruAutocompleteDropdown: (...args) => positionDanbooruAutocompleteDropdown(...args)
        }
    };
    const CANVAS_WORKBENCH_EVENT_CONTROLLER = typeof WORKBENCH_CANVAS_EVENT.createCanvasWorkbenchEventController === 'function'
        ? WORKBENCH_CANVAS_EVENT.createCanvasWorkbenchEventController(WORKBENCH_EVENT_CONTEXT_SOURCE)
        : {};
    const SCHEDULER_STATE_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project,
            getNode,
            applyProjectSchedulerPatch: (...args) => applyProjectSchedulerPatch(...args)
        },
        schedulerSource: {
            buildSchedulerBlockedState: (...args) => schedulerBuildBlockedState(...args),
            buildSchedulerWaitingState: (...args) => schedulerBuildWaitingState(...args),
            buildSchedulerResetPatch: (...args) => schedulerBuildResetPatch(...args)
        },
        statusSource: {
            buildCanvasNodeStatusPatch: (...args) => buildCanvasNodeStatusPatch(...args),
            buildCanvasRunStatus: (...args) => buildCanvasRunStatus(...args)
        },
        selectionSource: {
            setSelection: node => CANVAS_SELECTION_CONTROLLER.setOptionalNodeSelectionPreservingGroup(node?.id)
        },
        viewportSource: {
            getNodeRect: (...args) => getNodeRect(...args),
            centerViewportOnWorld: (...args) => centerViewportOnWorld(...args)
        },
        renderSource: {
            renderStatus: (...args) => renderStatus(...args),
            renderRunQueuePanelIfOpen: (...args) => renderRunQueuePanelIfOpen(...args),
            renderNodes: (...args) => renderNodes(...args),
            renderEdges: (...args) => renderEdges(...args)
        },
        utilitySource: {
            cloneRunValue: (...args) => cloneRunValue(...args)
        },
        timeSource: {
            nowIso: (...args) => nowIso(...args)
        },
        languageSource: {
            t: (...args) => t(...args)
        },
        uiSource: {
            showToast: (...args) => showToast(...args)
        },
        persistenceSource: {
            scheduleSave: (...args) => scheduleSave(...args)
        }
    };
    CANVAS_SCHEDULER_STATE_CONTROLLER = typeof WORKBENCH_CANVAS_SCHEDULER_STATE.createCanvasSchedulerStateController === 'function'
        ? WORKBENCH_CANVAS_SCHEDULER_STATE.createCanvasSchedulerStateController(SCHEDULER_STATE_CONTEXT_SOURCE)
        : {};
    const SCHEDULER_STEP_CONTEXT_SOURCE = {
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isQwenTtsNode: (...args) => isQwenTtsNode(...args)
        },
        runSource: {
            runTranslationNode: (...args) => runTranslationNode(...args),
            runWd14Node: (...args) => runWd14Node(...args),
            runVlmNode: (...args) => runVlmNode(...args),
            runQwenTtsNode: (...args) => runQwenTtsNode(...args),
            renderTimelineToResult: (...args) => renderTimelineToResult(...args),
            runPresetNode: (...args) => runPresetNode(...args)
        }
    };
    CANVAS_SCHEDULER_STEP_CONTROLLER = typeof WORKBENCH_CANVAS_SCHEDULER_STEP.createCanvasSchedulerStepController === 'function'
        ? WORKBENCH_CANVAS_SCHEDULER_STEP.createCanvasSchedulerStepController(SCHEDULER_STEP_CONTEXT_SOURCE)
        : {};
    const SCHEDULER_RUN_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project,
            applyProjectSchedulerPatch: (...args) => applyProjectSchedulerPatch(...args)
        },
        schedulerSource: {
            buildPlan: typeof schedulerBuildPlan === 'function' ? (...args) => schedulerBuildPlan(...args) : null,
            runPlan: typeof schedulerRunPlan === 'function' ? (...args) => schedulerRunPlan(...args) : null,
            buildSchedulerBlockedState: (...args) => schedulerBuildBlockedState(...args),
            buildSchedulerRunningState: (...args) => schedulerBuildRunningState(...args),
            buildSchedulerResumePatch: (...args) => schedulerBuildResumePatch(...args),
            buildSchedulerStepStartPatch: (...args) => schedulerBuildStepStartPatch(...args),
            buildSchedulerStepEndPatch: (...args) => schedulerBuildStepEndPatch(...args),
            buildSchedulerErrorPatch: (...args) => schedulerBuildErrorPatch(...args),
            buildSchedulerFinishedPatch: (...args) => schedulerBuildFinishedPatch(...args)
        },
        stateSource: {
            refreshResultStaleFlags: (...args) => CANVAS_RESULT_STALENESS_CONTROLLER.refreshResultStaleFlags?.(...args) || false,
            setSchedulerWaitingFromPlan: (plan, sourceIds) => CANVAS_SCHEDULER_STATE_CONTROLLER.setSchedulerWaitingFromPlan?.(plan, sourceIds),
            setBlockedSchedulerFromPlan: (plan, options) => CANVAS_SCHEDULER_STATE_CONTROLLER.setBlockedSchedulerFromPlan?.(plan, options),
            firstBlockedSchedulerStep: plan => CANVAS_SCHEDULER_STATE_CONTROLLER.firstBlockedSchedulerStep?.(plan) || null,
            markBlockedSchedulerSteps: steps => CANVAS_SCHEDULER_STATE_CONTROLLER.markBlockedSchedulerSteps?.(steps) || [],
            schedulerStepMissingSummary: step => CANVAS_SCHEDULER_STATE_CONTROLLER.schedulerStepMissingSummary?.(step) || '',
            waitForRefreshingSources: (...args) => waitForRefreshingSources(...args),
            focusSchedulerProblem: step => CANVAS_SCHEDULER_STATE_CONTROLLER.focusSchedulerProblem?.(step)
        },
        selectionSource: {
            getSelectedNodeIdList: (...args) => getSelectedNodeIdList(...args),
            getSelectedNodeId: () => selectedNodeId
        },
        renderSource: {
            renderStatus: (...args) => renderStatus(...args),
            renderRunQueuePanelIfOpen: (...args) => renderRunQueuePanelIfOpen(...args),
            renderNodes: (...args) => renderNodes(...args),
            renderEdges: (...args) => renderEdges(...args)
        },
        runSource: {
            runSchedulerStep: async (nodeId, step) => CANVAS_SCHEDULER_STEP_CONTROLLER.runSchedulerStep?.(nodeId, step)
                || { ok: false, error: 'scheduler step controller unavailable' }
        },
        utilitySource: {
            cloneRunValue: (...args) => cloneRunValue(...args)
        },
        timeSource: {
            nowIso: (...args) => nowIso(...args)
        },
        languageSource: {
            t: (...args) => t(...args)
        },
        uiSource: {
            showToast: (...args) => showToast(...args)
        },
        diagnosticsSource: {
            warn: (...args) => console.warn(...args),
            info: (...args) => console.info(...args)
        },
        persistenceSource: {
            scheduleSave: (...args) => scheduleSave(...args)
        }
    };
    CANVAS_SCHEDULER_RUN_CONTROLLER = typeof WORKBENCH_CANVAS_SCHEDULER_RUN.createCanvasSchedulerRunController === 'function'
        ? WORKBENCH_CANVAS_SCHEDULER_RUN.createCanvasSchedulerRunController(SCHEDULER_RUN_CONTEXT_SOURCE)
        : {};
    const INPUT_CONTEXT_SOURCE = {
        interactionSource: {
            viewportWheelSource: {
                domSource: {
                    getRoot: () => root,
                    getDocument: () => document,
                },
                environmentSource: {
                    getWindow: () => window,
                },
                runtimeSource: {
                    performanceNow: () => canvasPerformanceNow(),
                },
                viewportSource: {
                    getSuppressWheelUntil: () => suppressWheelUntil,
                    zoomAtClient: (clientX, clientY, factor) => zoomAtClient(clientX, clientY, factor),
                },
                interactionSource: {
                    isInteractiveTarget: (target) => isInteractiveTarget(target),
                    isNodeDragging: () => isNodeDragging(),
                    isPanning: () => isPanning(),
                    isMarqueeSelecting: () => isMarqueeSelecting(),
                    isConnecting: () => isConnecting(),
                },
            },
            mediaBrowserDragSource: {
                configSource: {
                    getDragMime: () => MEDIA_BROWSER_DRAG_MIME,
                },
                mediaSource: {
                    getMediaBrowserNodeState: (node) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserNodeState(node),
                    getMediaBrowserItems: (node) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserRuntimeFor(node.id).data?.items || [],
                    serializableMediaBrowserState: (state) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.serializableMediaBrowserState(state),
                },
                viewportSource: {
                    getViewport: () => viewport,
                },
            },
            viewportDropSource: {
                domSource: {
                    getViewport: () => viewport,
                },
                transferSource: {
                    getTransferStation: () => window.SimpAITransferStation,
                    importTransferItemAt: (...args) => importTransferItemAt(...args),
                },
                mediaBrowserSource: {
                    addMediaBrowserPayloadToCanvas: (...args) => CANVAS_MEDIA_IMPORT_CONTROLLER.addMediaBrowserPayloadToCanvas(...args),
                },
                fileSource: {
                    isWorkbenchProjectFile: (file) => isWorkbenchProjectFile(file),
                    importWorkbenchProjectFromFile: (...args) => importWorkbenchProjectFromFile(...args),
                    isMediaFile: (file) => isMediaFile(file),
                    addMediaNodeFromFile: (...args) => addMediaNodeFromFile(...args),
                },
                viewportSource: {
                    clientToWorld: (clientX, clientY) => clientToWorld(clientX, clientY),
                    setLastPointerWorld: (world) => { lastPointerWorld = world; },
                },
            },
            viewportContextSource: {
                domSource: {
                    getRoot: () => root,
                },
                viewportSource: {
                    clientToWorld: (clientX, clientY) => clientToWorld(clientX, clientY),
                    setLastPointerWorld: (world) => { lastPointerWorld = world; },
                },
                edgeSource: {
                    findCanvasEdgeAtClient: (...args) => findCanvasEdgeAtClient(...args),
                    selectEdge: (id) => selectEdge(id),
                },
                menuSource: {
                    openEdgeContextMenu: (...args) => openEdgeContextMenu(...args),
                    openAddNodeMenu: (...args) => openAddNodeMenu(...args),
                },
            },
            keyboardSource: {
                domSource: {
                    getRoot: () => root,
                },
                inputSource: {
                    getTextareaEditorState,
                    isEditableElement: (target) => isEditableElement(target),
                },
                shortcutSource: {
                    consumeWorkbenchShortcut: (evt) => consumeWorkbenchShortcut(evt),
                },
                agentSource: {
                    handleCanvasAgentAction: (...args) => handleCanvasAgentAction(...args),
                    canvasAgentPrimaryAction: () => canvasAgentPrimaryAction(),
                    isOutpaintOverlayActive: () => !!outpaintOverlayState.active,
                    hideOutpaintOverlay: () => hideOutpaintOverlay(),
                    renderCanvasAgentPanel: () => renderCanvasAgentPanel(),
                    confirmOutpaintFromOverlay: (...args) => confirmOutpaintFromOverlay(...args),
                },
                projectSource: {
                    getProject: () => project,
                    ensureProjectGroups: () => ensureProjectGroups(),
                    focusGroup: (group) => focusGroup(group),
                    saveProject: (...args) => saveProject(...args),
                    undoCanvasEdit: () => undoCanvasEdit(),
                    redoCanvasEdit: () => redoCanvasEdit(),
                },
                nodeSource: {
                    getSelectedNodeId: () => selectedNodeId,
                    getNode: (id) => getNode(id),
                },
                connectionSource: {
                    isConnecting: () => isConnecting(),
                    cancelConnection: () => cancelConnection(),
                },
                paletteSource: {
                    isPresetPaletteOpen: () => !palette.hidden,
                    closePresetPalette: () => closePresetPalette(),
                    openPresetPalette: (...args) => openPresetPalette(...args),
                },
                clipboardSource: {
                    copyCanvasSelection: () => copyCanvasSelection(),
                    pasteCanvasClipboard: (...args) => pasteCanvasClipboard(...args),
                    duplicateSelection: () => duplicateSelection(),
                },
                viewportSource: {
                    resetViewportZoom: () => {
                        applyProjectViewportPatch({ zoom: 1 });
                        renderAll({ inspector: false });
                        scheduleSave();
                    },
                    zoomAtViewportCenter: (factor) => zoomAtViewportCenter(factor),
                    fitAll: () => fitAll(),
                    fitSelection: () => fitSelection(),
                    alignSelectedNodes: (kind) => alignSelectedNodes(kind),
                    setMode: (modeName) => setMode(modeName),
                    viewportCenterWorld: () => viewportCenterWorld(),
                },
                runSource: {
                    runSelectedChain: () => CANVAS_SCHEDULER_RUN_CONTROLLER.runSelectedChain?.(),
                    runPresetNodeFromUi: (node) => runPresetNodeFromUi(node),
                    toggleTimelinePreviewPlayback: (node) => toggleTimelinePreviewPlayback(node),
                    playMediaSelection: (node) => playMediaSelection(node),
                    toggleSelectedResultMediaPlayback: (node) => CANVAS_MEDIA_PLAYBACK_CONTROLLER.toggleSelectedResultMediaPlayback(node),
                },
                selectionSource: {
                    deleteSelection: () => deleteSelection(),
                    toggleSelectedNodesFlag: (flag) => toggleSelectedNodesFlag(flag),
                },
                transferSource: {
                    importSelectedTransferAt: (...args) => importSelectedTransferAt(...args),
                },
                uiSource: {
                    closeContextMenu: () => closeContextMenu(),
                },
            },
            documentPasteSource: {
                domSource: {
                    getRoot: () => root,
                },
                inputSource: {
                    isEditableElement: (target) => isEditableElement(target),
                },
                viewportSource: {
                    viewportCenterWorld: () => viewportCenterWorld(),
                },
                actionSource: {
                    addImageNodeFromFile: (...args) => addImageNodeFromFile(...args),
                },
            },
            inputHandleSource: {
                projectSource: {
                    getProject: () => project,
                },
                nodeSource: {
                    getNode: (id) => getNode(id),
                    getSlotLabel: (node, slot) => getSlotLabel(node, slot),
                    isQwenTtsNode: (node) => isQwenTtsNode(node),
                    isDirectorTimelineNode: (node) => isDirectorTimelineNode(node),
                    directorMediaSourceKind: (node) => directorMediaSourceKind(node),
                    batchAnyInputEdgeForDrag: (node) => batchAnyInputEdgeForDrag(node),
                },
                slotSource: {
                    getVlmImageSlots: () => VLM_IMAGE_SLOTS,
                },
                connectionSource: {
                    startInputConnection: (...args) => startInputConnection(...args),
                    startConnection: (...args) => startConnection(...args),
                    deleteUploadSlot: (...args) => deleteUploadSlot(...args),
                    deleteEdge: (...args) => deleteEdge(...args),
                },
                renderSource: {
                    renderAll: () => renderAll(),
                },
                languageSource: {
                    t,
                },
                uiSource: {
                    openContextMenu: (...args) => openContextMenu(...args),
                    notConnectedText: (...args) => notConnectedText(...args),
                    showToast: (...args) => showToast(...args),
                },
            },
            noteTailSource: {
                projectSource: {
                    getProject: () => project,
                },
                domSource: {
                    getDocument: () => document,
                },
                nodeSource: {
                    getNode: (id) => getNode(id),
                    isNodeLocked: (node) => isNodeLocked(node),
                    ensureNoteTailTarget: (node) => ensureNoteTailTarget(node),
                },
                geometrySource: {
                    buildNoteStatePatch: (...args) => buildNoteStatePatch(...args),
                    snapCanvasCoord: (value) => snapCanvasCoord(value),
                },
                languageSource: {
                    t,
                },
                uiSource: {
                    showToast: (...args) => showToast(...args),
                },
                selectionSource: {
                    selectNodeForTailDrag: (nodeId) => {
                        CANVAS_SELECTION_CONTROLLER.setNodeSelectionIncludingEmpty(nodeId);
                    },
                    updateSelectionDomClasses: () => updateSelectionDomClasses(),
                    getSelectedNodeId: () => selectedNodeId,
                },
                renderSource: {
                    renderEdges: () => renderEdges(),
                    renderInspector: () => renderInspector(),
                },
                historySource: {
                    pushHistory: (...args) => pushHistory(...args),
                },
                persistenceSource: {
                    scheduleSave: (...args) => scheduleSave(...args),
                },
            },
            edgeInteractionSource: {
                domSource: {
                    getEdgesLayer: () => edgesLayer,
                },
                nodeSource: {
                    getNode: (id) => getNode(id),
                },
                edgeSource: {
                    selectEdge: (id) => selectEdge(id),
                    deleteEdge: (id) => deleteEdge(id),
                },
                menuSource: {
                    openContextMenu: (...args) => openContextMenu(...args),
                },
                languageSource: {
                    t,
                },
                noteTailSource: {},
            }
            },
            controlSource: {
                textControlSource: {
                    domSource: {
                        getDocument: () => document,
                    },
                    environmentSource: {
                        getWindow: () => window,
                    },
                    languageSource: {
                        t,
                    },
                    menuSource: {
                        openContextMenu: (...args) => openContextMenu(...args),
                    },
                    notificationSource: {
                        showToast: (...args) => showToast(...args),
                    },
                },
            compareDragSource: {
                domSource: {
                    getDocument: () => document,
                },
                nodeSource: {
                    getNode: (id) => getNode(id),
                    isNodeLocked: (node) => isNodeLocked(node),
                },
                utilitySource: {
                    clamp,
                    performanceNow: () => canvasPerformanceNow(),
                },
                viewportSource: {
                    setSuppressWheelUntil: (value) => { suppressWheelUntil = value; },
                },
                selectionSource: {
                    isCompareNodeSelected: (nodeId) => selectedNodeIds.has(nodeId) && selectedEdgeId === null,
                    selectNodeLight: (nodeId) => selectNodeLight(nodeId),
                    getSelectedNodeId: () => selectedNodeId,
                },
                updateSource: {
                    updateCompareParam: (...args) => updateCompareParam(...args),
                    refreshCompareDom: (nodeId) => refreshCompareDom(nodeId),
                },
                historySource: {
                    endHistoryBatch: () => CANVAS_HISTORY_CONTROLLER.endHistoryBatch(),
                },
                persistenceSource: {
                    scheduleSave: (...args) => scheduleSave(...args),
                },
                uiSource: {
                    renderInspector: () => renderInspector(),
                },
            },
            textControlPointerSource: {
                domSource: {
                    getRoot: () => root,
                    getDocument: () => document,
                },
                environmentSource: {
                    getWindow: () => window,
                },
                textControlSource: {
                    isEditableElement: (target) => isEditableElement(target),
                },
            },
            agentInputSource: {
                stateSource: {
                    getAgentState: () => canvasAgentState,
                    setAgentInput: (value) => { canvasAgentState.input = value || ''; }
                },
                decisionSource: {
                    buildAgentDecisionFormPatch: (...args) => buildAgentDecisionFormPatch(...args),
                    handleCanvasAgentDecisionFieldInput: (...args) => handleCanvasAgentDecisionFieldInput(...args)
                },
                resolutionSource: {
                    setCanvasAgentResolutionPatch: (...args) => setCanvasAgentResolutionPatchBeforeUi(...args),
                    setCanvasAgentResolutionOpen: (...args) => setCanvasAgentResolutionOpenBeforeUi(...args)
                },
                outpaintSource: {
                    onOutpaintSliderInput: (...args) => onOutpaintSliderInput(...args),
                    onOutpaintPresetChange: (...args) => onOutpaintPresetChange(...args)
                },
                settingsSource: {
                    handleCanvasAgentSettingInput: (...args) => handleCanvasAgentSettingInput(...args),
                    handleCanvasAgentModelModeInput: (...args) => handleCanvasAgentModelModeInputBeforeUi(...args)
                },
                shortcutSource: {
                    consumeWorkbenchShortcut: (...args) => consumeWorkbenchShortcut(...args)
                },
                actionSource: {
                    handleCanvasAgentAction: (...args) => handleCanvasAgentAction(...args),
                    canvasAgentPrimaryAction: (...args) => canvasAgentPrimaryAction(...args)
                }
            }
        },
        previewSource: {
            tooltipSource: {
                domSource: {
                    document,
                    getRoot: () => root,
                },
                viewportSource: {
                    window,
                },
                gestureSource: {
                    isCanvasPointerGestureActive: () => isCanvasPointerGestureActive(),
                },
            },
            hoverPreviewSource: {
                domSource: {
                    document,
                    getRoot: () => root,
                    getNodesLayer: () => nodesLayer,
                },
                viewportSource: {
                    window,
                    isCanvasPointerGestureActive: () => isCanvasPointerGestureActive(),
                },
                nodeSource: {
                    getNode: (id) => getNode(id),
                },
                languageSource: {
                    t,
                },
                utilitySource: {
                    escapeHtml,
                },
                configSource: {
                    getSystemParams: () => window.simpleaiTopbarSystemParams || {},
                    workbenchStaticFilePath,
                },
                networkSource: {
                    fetch: typeof window.fetch === 'function' ? window.fetch.bind(window) : null,
                    Image: window.Image,
                },
                tooltipSource: {},
            },
            previewSelectSource: {
                domSource: {
                    document,
                    getRoot: () => root,
                },
                viewportSource: {
                    window,
                },
                utilitySource: {
                    escapeHtml,
                },
                hoverPreviewSource: {},
                eventSource: {
                    Event: window.Event,
                },
            },
            danbooruAutocompleteSource: {
                apiSource: {
                    danbooruAutocomplete: apiDanbooruAutocomplete,
                },
                domSource: {
                    document,
                    getRoot: () => root,
                },
                viewportSource: {
                    window,
                },
                utilitySource: {
                    escapeHtml,
                },
                languageSource: {
                    t,
                },
                runtimeSource: {
                    maybeShowRuntimeNotice: (...args) => maybeShowCanvasDanbooruRuntimeNotice(...args),
                },
                inputSource: {},
            },
            scrollSource: {
                vlmSource: {
                    updateVlmChatJumpButton: (...args) => updateVlmChatJumpButton(...args)
                },
                mediaSource: {
                    mediaBrowserShouldAutoLoadMore: (...args) => CANVAS_MEDIA_BROWSER_DATA_CONTROLLER.mediaBrowserShouldAutoLoadMore(...args),
                    mediaBrowserRuntimeFor: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserRuntimeFor(...args),
                    loadMoreMediaBrowserNode: (...args) => CANVAS_MEDIA_BROWSER_DATA_CONTROLLER.loadMoreMediaBrowserNode(...args)
                },
                nodeSource: {
                    getNode: (id) => getNode(id)
                },
                runtimeSource: {
                    warn: (...args) => console.warn(...args)
                }
            }
        },
        eventSource: {
            getRoot: () => root,
            getDocument: () => document
        }
    };
    const CANVAS_INPUT_CONTEXT = typeof WORKBENCH_CANVAS_INPUT_CONTEXT.createCanvasWorkbenchInputContext === 'function'
        ? WORKBENCH_CANVAS_INPUT_CONTEXT.createCanvasWorkbenchInputContext({
            inputSource: INPUT_CONTEXT_SOURCE
        })
        : {};
    const {
        CANVAS_VIEWPORT_WHEEL_CONTROLLER,
        onViewportWheel,
        onWorkbenchWheelBoundary,
        CANVAS_MEDIA_BROWSER_DRAG_CONTROLLER,
        mediaBrowserNodeDragPayload,
        mediaBrowserPayloadFromDataTransfer,
        bindMediaBrowserNodeDragEvents,
        clearMediaBrowserDragPayload,
        getMediaBrowserDragPayload,
        CANVAS_VIEWPORT_DROP_CONTROLLER,
        onViewportDrop,
        onViewportDragOver,
        onViewportDragLeave,
        handleDropData,
        CANVAS_VIEWPORT_CONTEXT_CONTROLLER,
        onViewportContextMenu,
        CANVAS_KEYBOARD_CONTROLLER,
        onDocumentKeyDown,
        CANVAS_DOCUMENT_PASTE_CONTROLLER,
        onDocumentPaste,
        CANVAS_INPUT_HANDLE_CONTROLLER,
        getConnectionTargetFromHandle,
        handleInputHandlePointerDown,
        handleInputHandlePointerDownFromEvent,
        CANVAS_NOTE_TAIL_CONTROLLER,
        startNoteTailDrag,
        isNoteTailDragging,
        CANVAS_EDGE_INTERACTION_CONTROLLER,
        handleEdgeLayerClick,
        handleEdgeLayerContextMenu,
        handleEdgeLayerPointerDown,
        CANVAS_AGENT_INPUT_CONTROLLER,
        onCanvasAgentInput,
        onCanvasAgentChange,
        onCanvasAgentKeyDown
    } = CANVAS_INPUT_CONTEXT;
    const {
        CANVAS_TEXT_CONTROL_CONTEXT_CONTROLLER,
        editableTextControlFromTarget,
        onTextControlContextMenu,
        CANVAS_COMPARE_DRAG_CONTROLLER,
        startComparePositionDrag,
        isComparePositionDragging,
        CANVAS_TEXT_CONTROL_POINTER_CONTROLLER,
        onTextControlPointerDown,
        bindCanvasInputEvents,
        CANVAS_TOOLTIP_CONTROLLER,
        hideCanvasTooltip,
        onTooltipPointerOver,
        onTooltipPointerMove,
        onTooltipPointerOut,
        onTooltipFocusIn,
        CANVAS_HOVER_PREVIEW_CONTROLLER,
        breakablePreviewText,
        showHoverPreviewFor,
        hideHoverPreview,
        onHoverPreviewPointerOver,
        onHoverPreviewPointerMove,
        onHoverPreviewPointerOut,
        onHoverPreviewFocusIn,
         CANVAS_PREVIEW_SELECT_CONTROLLER,
         closePreviewSelectMenu,
         isPreviewSelectMenuOpen,
         previewSelectMenuContains,
         onPreviewSelectPointerDown,
         onPreviewSelectKeyDown,
         CANVAS_DANBOORU_AUTOCOMPLETE_CONTROLLER,
        shouldEnableDanbooruAutocomplete,
        danbooruAutocompleteAttrs,
        hideDanbooruAutocomplete,
        positionDanbooruAutocompleteDropdown,
        warmDanbooruAutocompleteIndex,
        handleDanbooruAutocompleteInput,
        onDanbooruAutocompleteKeyDown,
        onDanbooruAutocompletePointerDown,
        onDanbooruAutocompleteFocusIn,
        onDanbooruAutocompleteFocusOut,
        hasDanbooruAutocompleteField,
        CANVAS_SCROLL_CONTROLLER,
        onCanvasWorkbenchScroll
    } = CANVAS_INPUT_CONTEXT;
    const TIMELINE_CONTEXT_SOURCE = {
        domSource: {
            documentSource: {
                getDocument: () => document,
                cssEscape: (value) => cssEscape(value)
            },
            interactionSource: {
                clamp
            },
            mediaSource: {
                formatAssetDuration
            },
            timelineSource: {
                timelineBuildTrackClipLayout: (clips) => typeof timelineBuildTrackClipLayout === 'function'
                    ? timelineBuildTrackClipLayout(clips)
                    : null,
                timelineNormalizeKeyframes: (clip) => typeof timelineNormalizeKeyframes === 'function'
                    ? timelineNormalizeKeyframes(clip)
                    : null,
                timelineClipAtTime: (clip, playhead) => typeof timelineClipAtTime === 'function'
                    ? timelineClipAtTime(clip, playhead)
                    : clip,
                timelineClipLayerGeometry: (...args) => timelineClipLayerGeometry(...args),
                timelineEffectiveClipIn: (clip, asset) => typeof timelineEffectiveClipIn === 'function'
                    ? timelineEffectiveClipIn(clip, asset)
                    : null,
                selectedVisualClip: (node) => timelineSelectedVisualClip(node),
                renderTimelinePenOverlay: (clip) => typeof timelineRenderPenOverlay === 'function'
                    ? timelineRenderPenOverlay(clip)
                    : ''
            },
            nodeSource: {
                getNode: (id) => getNode(id)
            },
            mediaSource: {
                getTimelineSourceAsset: (node) => getTimelineSourceAsset(node),
                getMediaEditRange: (asset) => getMediaEditRange(asset)
            },
            maskSource: {
                clipMaskDataUrl: timelineClipMaskDataUrl
            }
        },
        playheadSource: {
            domSource: {
                getDocument: () => document
            },
            nodeSource: {
                getNode: (id) => getNode(id),
                isNodeLocked: (node) => isNodeLocked(node)
            },
            interactionSource: {
                clamp,
                performanceNow: () => canvasPerformanceNow(),
                setSuppressWheelUntil: (value) => { suppressWheelUntil = value; }
            },
            historySource: {
                pushHistoryBatch: (...args) => pushHistoryBatch(...args)
            },
            playheadOperationSource: {
                buildTimelineParamsPatch: timelineBuildParamsPatch
            },
            renderSource: {
                refreshTimelinePreviewDom: (nodeEl, node) => refreshTimelinePreviewDom(nodeEl, node)
            },
            persistenceSource: {
                scheduleSave: (...args) => scheduleSave(...args)
            }
        },
        previewSource: {
            domSource: {
                getDocument: () => document
            },
            nodeSource: {
                getNode: (id) => getNode(id),
                isNodeLocked: (node) => isNodeLocked(node)
            },
            clipSource: {
                getClipAtTime: (clip, playhead) => typeof timelineClipAtTime === 'function' ? timelineClipAtTime(clip, playhead) : clip,
                selectTimelineClip: (node, clipId, options) => selectTimelineClip(node, clipId, options),
                buildTimelineClipPatch: timelineBuildClipPatch
            },
            interactionSource: {
                clamp
            },
            maskSource: {
                timelineMaskLayerGeometry: (node, clip) => timelineMaskLayerGeometry(node, clip),
                remapTimelineClipMaskForGeometryChange: (node, clip, snapshot) => remapTimelineClipMaskForGeometryChange(node, clip, snapshot)
            },
            keyframeSource: {
                syncTimelineClipTransformKeyframeAtPlayhead: (node, clip, keys) => syncTimelineClipTransformKeyframeAtPlayhead(node, clip, keys)
            },
            historySource: {
                pushHistoryBatch: (...args) => pushHistoryBatch(...args)
            },
            renderSource: {
                refreshTimelinePreviewDom: (nodeEl, node) => refreshTimelinePreviewDom(nodeEl, node),
                refreshTimelinePreviewClipLayersDom: (nodeEl, node, clip) => refreshTimelinePreviewClipLayersDom(nodeEl, node, clip)
            },
            persistenceSource: {
                scheduleSave: (...args) => scheduleSave(...args)
            },
            selectionSource: {
                getSelectedNodeId: () => selectedNodeId,
                renderInspector: (...args) => renderInspector(...args)
            }
        },
        playbackSource: {
            nodeSource: {
                getNode: (id) => getNode(id),
                getNodeElement: (id) => id && nodesLayer ? nodesLayer.querySelector(`[data-node-id="${cssEscape(id)}"]`) : null
            },
            timingSource: {
                performanceNow: () => canvasPerformanceNow(),
                requestAnimationFrame: (callback) => requestCanvasFrame(callback),
                cancelAnimationFrame: (handle) => cancelCanvasFrame(handle)
            },
            mediaSource: {
                syncTimelinePreviewVideos: (nodeEl, node) => syncTimelinePreviewVideos(nodeEl, node)
            },
            domSource: {},
            renderSource: {
                refreshTimelinePreviewDom: (nodeEl, node) => refreshTimelinePreviewDom(nodeEl, node)
            },
            playbackOperationSource: {
                buildTimelineParamsPatch: timelineBuildParamsPatch
            },
            persistenceSource: {
                scheduleSave: (...args) => scheduleSave(...args)
            }
        },
        keyframeSource: {
            domSource: {
                getDocument: () => document
            },
            nodeSource: {
                getNode: (id) => getNode(id),
                isNodeLocked: (node) => isNodeLocked(node)
            },
            interactionSource: {
                clamp,
                performanceNow: () => canvasPerformanceNow(),
                setSuppressWheelUntil: (value) => { suppressWheelUntil = value; }
            },
            keyframeOperationSource: {
                buildTimelineKeyframesPatch: timelineBuildKeyframesPatch,
                buildTimelineParamsPatch: timelineBuildParamsPatch
            },
            historySource: {
                pushHistoryBatch: (...args) => pushHistoryBatch(...args)
            },
            renderSource: {
                refreshTimelinePreviewDom: (nodeEl, node) => refreshTimelinePreviewDom(nodeEl, node)
            },
            selectionSource: {
                getSelectedNodeId: () => selectedNodeId,
                renderInspector: (...args) => renderInspector(...args)
            },
            persistenceSource: {
                scheduleSave: (...args) => scheduleSave(...args)
            }
        },
        clipSource: {
            domSource: {
                getDocument: () => document
            },
            nodeSource: {
                getNode: (id) => getNode(id),
                isNodeLocked: (node) => isNodeLocked(node),
                normalizeNode: (node) => typeof timelineNormalizeNode === 'function' ? timelineNormalizeNode(node) : undefined
            },
            interactionSource: {
                clamp,
                performanceNow: () => canvasPerformanceNow(),
                setSuppressWheelUntil: (value) => { suppressWheelUntil = value; }
            },
            clipOperationSource: {
                selectTimelineClip: (node, clipId, options) => selectTimelineClip(node, clipId, options),
                buildTimelineClipPatch: timelineBuildClipPatch,
                buildTimelineParamsPatch: timelineBuildParamsPatch,
                snapTimelineTime,
                timelineTrackCompatible,
                timelineClipAvailableDuration,
                enforceTimelineClipMediaBounds: (node, clip) => enforceTimelineClipMediaBounds(node, clip)
            },
            historySource: {
                pushHistory: (...args) => pushHistory(...args)
            },
            renderSource: {
                refreshTimelinePreviewDom: (nodeEl, node) => refreshTimelinePreviewDom(nodeEl, node),
                renderEdges: (...args) => renderEdges(...args)
            },
            selectionSource: {
                getSelectedNodeId: () => selectedNodeId,
                renderInspector: (...args) => renderInspector(...args)
            },
            persistenceSource: {
                scheduleSave: (...args) => scheduleSave(...args)
            }
        },
        maskSource: {
            domSource: {
                getDocument: () => document,
                getDevicePixelRatio: () => window.devicePixelRatio || 1,
                refreshTimelinePenOverlayDom: (stageEl, clip, options) => refreshTimelinePenOverlayDom(stageEl, clip, options)
            },
            nodeSource: {
                getNode: (id) => getNode(id),
                isNodeLocked: (node) => isNodeLocked(node)
            },
            interactionSource: {
                clamp,
                performanceNow: () => canvasPerformanceNow(),
                setSuppressWheelUntil: (value) => { suppressWheelUntil = value; }
            },
            maskOperationSource: {
                buildTimelineClipMaskPatch: timelineBuildClipMaskPatch,
                buildTimelineClipMaskPointPatch: timelineBuildClipMaskPointPatch,
            },
            maskGeometrySource: {
                getTimelineSourceAsset: (source) => getTimelineSourceAsset(source),
                timelineClipAtTime: (clip, playhead) => typeof timelineClipAtTime === 'function' ? timelineClipAtTime(clip, playhead) : clip,
                timelineClipLayerGeometry: (...args) => timelineClipLayerGeometry(...args)
            },
            clipSource: {
                selectTimelineClip: (node, clipId, options) => selectTimelineClip(node, clipId, options),
                selectedVisualClip: (node) => timelineSelectedVisualClip(node)
            },
            mediaSource: {
                syncTimelinePreviewVideos: (nodeEl, node) => syncTimelinePreviewVideos(nodeEl, node)
            },
            historySource: {
                pushHistoryBatch: (...args) => pushHistoryBatch(...args)
            },
            persistenceSource: {
                scheduleSave: (...args) => scheduleSave(...args)
            },
            selectionSource: {
                getSelectedNodeId: () => selectedNodeId,
                renderInspector: (...args) => renderInspector(...args)
            }
        },
        directorTimelineDragSource: {
            domSource: {
                getDocument: () => document
            },
            nodeSource: {
                getNode: (id) => getNode(id),
                isDirectorTimelineNode: (node) => isDirectorTimelineNode(node),
                isNodeLocked: (node) => isNodeLocked(node)
            },
            timelineSource: {
                normalizeDirectorTimelineForNode: (node) => CANVAS_TIMELINE_CONTEXT.normalizeDirectorTimelineForNode?.(node),
                normalizeTimeline: (director) => typeof directorTimelineNormalizeTimeline === 'function' ? directorTimelineNormalizeTimeline(director) : director
            },
            historySource: {
                pushHistoryBatch: (...args) => pushHistoryBatch(...args)
            },
            stateSource: {
                buildDirectorTimelineStatePatch: (node, options) => buildDirectorTimelineStatePatch(node, options),
                updateDirectorStatus: (node) => CANVAS_TIMELINE_CONTEXT.updateDirectorStatus?.(node),
                mutate: (...args) => mutate(...args),
                getSelectedNodeId: () => selectedNodeId
            },
            persistenceSource: {
                scheduleSave: (...args) => scheduleSave(...args)
            }
        },
        directorTimelineEditSource: {
            nodeSource: {
                getNode: (id) => getNode(id),
                isDirectorTimelineNode: (node) => isDirectorTimelineNode(node),
                isNodeLocked: (node) => isNodeLocked(node)
            },
            historySource: {
                pushHistory: (...args) => pushHistory(...args),
                pushHistoryBatch: (...args) => pushHistoryBatch(...args)
            },
            stateSource: {
                buildDirectorTimelineStatePatch: (node, options) => buildDirectorTimelineStatePatch(node, options),
                mergeCanvasRunStatus: (...args) => mergeCanvasRunStatus(...args),
                mutate: (...args) => mutate(...args),
                getSelectedNodeId: () => selectedNodeId
            },
            valueSource: {
                cloneRunValue: (value, fallback) => cloneRunValue(value, fallback)
            },
            timelineSource: {
                normalizeTimeline: (director) => typeof directorTimelineNormalizeTimeline === 'function' ? directorTimelineNormalizeTimeline(director) : director
            },
            idSource: {
                uid: (prefix) => uid(prefix)
            },
            referenceSource: {
                previousSegmentImageRef: () => DIRECTOR_PREVIOUS_SEGMENT_IMAGE_REF,
                previousSegmentVideoRef: () => DIRECTOR_PREVIOUS_SEGMENT_VIDEO_REF
            },
            payloadSource: {
                directorTimelinePayload: (node) => directorTimelinePayload(node)
            },
            clipboardSource: {
                writeText: (text) => navigator.clipboard?.writeText(text)
            },
            notificationSource: {
                showToast: (...args) => showToast(...args)
            },
            inspectorSource: {
                syncTwinParamInputs: (...args) => syncTwinParamInputs(...args)
            },
            languageSource: {
                getLanguageState: () => ({ __lang: runtimeUiLang() }),
                t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
            }
        },
        frameSource: {
            domSource: {
                getDocument: () => document,
                getNodesLayer: () => nodesLayer,
                cssEscape: (value) => cssEscape(value)
            },
            nodeSource: {
                getNode: (id) => getNode(id)
            },
            interactionSource: {
                clamp
            },
            timingSource: {
                setTimeout: (...args) => window.setTimeout(...args),
                clearTimeout: (...args) => window.clearTimeout(...args)
            },
            mediaSource: {
                getTimelineSourceAsset: (source) => getTimelineSourceAsset(source),
                assetMediaKind: (asset) => assetMediaKind(asset),
                assetDisplaySrc: (asset) => assetDisplaySrc(asset),
                getMediaEditRange: (asset) => getMediaEditRange(asset),
                loadImageElementForCanvas: (src) => loadImageElementForCanvas(src),
                effectiveClipIn: (clip, asset) => typeof timelineEffectiveClipIn === 'function' ? timelineEffectiveClipIn(clip, asset) : Math.max(0, Number(clip?.in || 0), Number(getMediaEditRange(asset).start || 0))
            },
            renderSource: {
                normalizeTimelineNode: (node) => typeof timelineNormalizeNode === 'function' ? timelineNormalizeNode(node) : undefined,
                serializeTimelineRenderPayload: (node) => typeof timelineSerializeTimelineRenderPayload === 'function' ? timelineSerializeTimelineRenderPayload(node, TIMELINE_NODE_CONTEXT) : null,
                timelineClipLayerGeometry: (...args) => timelineClipLayerGeometry(...args)
            },
            maskSource: {
                clipMaskDataUrl: (clip) => typeof timelineClipMaskDataUrl === 'function' ? timelineClipMaskDataUrl(clip) : (clip?.mask?.data_url || clip?.mask_data_url || '')
            }
        },
        renderSource: {
            projectSource: {
                getProject: () => project,
                getProjectId: () => project?.id || PROJECT_ID,
                buildProjectNodeAppendPatch: (...args) => buildProjectNodeAppendPatch(...args),
                ensureGenerateEdge: (...args) => ensureGenerateEdge(...args)
            },
            nodeSource: {
                getNode: (id) => getNode(id),
                isNodeLocked: (node) => isNodeLocked(node)
            },
            layoutSource: {
                defaultNodeSize: (...args) => defaultNodeSize(...args),
                placeNodeAvoidingOverlap: (...args) => placeNodeAvoidingOverlap(...args)
            },
            languageSource: {
                t
            },
            historySource: {
                pushHistory: (...args) => pushHistory(...args)
            },
            selectionSource: {
                setSelectedNodeId: (nodeId) => { selectedNodeId = nodeId; },
                setSelectedNodeIds: (nodeIds) => { selectedNodeIds = new Set(nodeIds || []); },
                setSelectedEdgeId: (edgeId) => { selectedEdgeId = edgeId; }
            },
            stateSource: {
                mutate: (...args) => mutate(...args)
            },
            renderSource: {
                serializeTimelineRenderPayload: (node) => typeof timelineSerializeTimelineRenderPayload === 'function' ? timelineSerializeTimelineRenderPayload(node, TIMELINE_NODE_CONTEXT) : null,
                buildTimelineOutputResultNode: (...args) => buildTimelineOutputResultNode(...args),
                buildTimelineResultPatch: (...args) => buildTimelineResultPatch(...args),
                stableHash: (...args) => stableHash(...args),
                renderTimelinePreviewFrameDataUrl: (...args) => renderTimelinePreviewFrameDataUrl(...args)
            },
            assetSource: {
                buildTimelineRenderAsset: (...args) => buildTimelineRenderAsset(...args),
                buildTimelinePreviewAsset: (...args) => buildTimelinePreviewAsset(...args)
            },
            backendSource: {
                sendCanvasRenderTimelineRequest: (...args) => CANVAS_BACKEND_REQUEST_CONTROLLER?.sendCanvasRenderTimelineRequest?.(...args)
            },
            uiSource: {
                showToast: (...args) => showToast(...args),
                refreshMainGalleryAfterCanvasRun: (...args) => refreshMainGalleryAfterCanvasRun(...args)
            }
        },
        compareSource: {
            projectSource: {
                getProject: () => project,
                getProjectId: () => project?.id || PROJECT_ID,
                buildProjectNodeAppendPatch: (...args) => buildProjectNodeAppendPatch(...args)
            },
            interactionSource: {
                clamp
            },
            languageSource: {
                t
            },
            layoutSource: {
                defaultNodeSize: (...args) => defaultNodeSize(...args),
                placeNodeAvoidingOverlap: (...args) => placeNodeAvoidingOverlap(...args)
            },
            selectionSource: {
                setSelectedNodeId: (nodeId) => { selectedNodeId = nodeId; },
                setSelectedNodeIds: (nodeIds) => { selectedNodeIds = new Set(nodeIds || []); },
                setSelectedEdgeId: (edgeId) => { selectedEdgeId = edgeId; }
            },
            stateSource: {
                mutate: (...args) => mutate(...args)
            },
            timeSource: {
                nowIso: (...args) => nowIso(...args)
            },
            renderSource: {
                normalizeTimelineNode: (node) => typeof timelineNormalizeNode === 'function' ? timelineNormalizeNode(node) : undefined,
                serializeTimelineRenderPayload: (node) => typeof timelineSerializeTimelineRenderPayload === 'function' ? timelineSerializeTimelineRenderPayload(node, TIMELINE_NODE_CONTEXT) : null,
                buildTimelineResultPatch: (...args) => buildTimelineResultPatch(...args),
                buildTimelineDebugPatch: (...args) => timelineBuildDebugPatch(...args)
            },
            frameSource: {
                renderTimelinePreviewFrameDataUrl: (...args) => renderTimelinePreviewFrameDataUrl(...args),
                getActiveTimelineVisualClips: (...args) => getActiveTimelineVisualClips(...args),
                compareTimelineFrameImages: (...args) => compareTimelineFrameImages(...args)
            },
            backendSource: {
                sendCanvasRenderTimelineFrameRequest: (...args) => CANVAS_BACKEND_REQUEST_CONTROLLER?.sendCanvasRenderTimelineFrameRequest?.(...args)
            },
            mediaSource: {
                assetDisplaySrc: (asset) => assetDisplaySrc(asset)
            },
            resultSource: {
                buildTimelineCompareResultNode: (...args) => buildTimelineCompareResultNode(...args),
                buildTimelineCompareAsset: (...args) => buildTimelineCompareAsset(...args)
            },
            uiSource: {
                showToast: (...args) => showToast(...args)
            }
        },
        paramSource: {
            domSource: {
                getNodeElement: (id) => id && nodesLayer ? nodesLayer.querySelector(`[data-node-id="${cssEscape(id)}"]`) : null,
                refreshTimelineFeatherControlDom: (...args) => refreshTimelineFeatherControlDom(...args),
                refreshTimelineMaskFeatherDom: (...args) => refreshTimelineMaskFeatherDom(...args),
                refreshTimelinePreviewDom: (nodeEl, node) => refreshTimelinePreviewDom(nodeEl, node),
                refreshTimelineInlineValue: (...args) => refreshTimelineInlineValue(...args)
            },
            nodeSource: {
                getNode: (id) => getNode(id),
                isNodeLocked: (node) => isNodeLocked(node),
                normalizeTimelineNode: (node) => typeof timelineNormalizeNode === 'function' ? timelineNormalizeNode(node) : undefined
            },
            selectionSource: {
                getSelectedNodeId: () => selectedNodeId
            },
            interactionSource: {
                clamp
            },
            maskSource: {
                captureTimelineMaskGeometry: (node) => captureTimelineMaskGeometry(node),
                remapTimelineMasksAfterCanvasResize: (node, snapshot) => remapTimelineMasksAfterCanvasResize(node, snapshot),
                applyTimelineMaskFeatherToSelectedClip: (node) => applyTimelineMaskFeatherToSelectedClip(node),
                timelineMaskLayerGeometry: (node, clip) => timelineMaskLayerGeometry(node, clip),
                remapTimelineClipMaskForGeometryChange: (node, clip, snapshot) => remapTimelineClipMaskForGeometryChange(node, clip, snapshot)
            },
            paramOperationSource: {
                buildTimelineParamsPatch: timelineBuildParamsPatch,
                buildTimelineParamUpdatePatch: timelineBuildParamUpdatePatch,
                buildTimelineClipParamUpdatePatch: timelineBuildClipParamUpdatePatch,
                getTimelineDefaultParams: () => timelineDefaultParams || {}
            },
            mediaSource: {
                enforceTimelineClipMediaBounds: (node, clip) => enforceTimelineClipMediaBounds(node, clip),
                getTimelineSourceAsset: (source) => getTimelineSourceAsset(source),
                getMediaEditRange: (asset) => getMediaEditRange(asset)
            },
            keyframeSource: {
                syncTimelineClipTransformKeyframeAtPlayhead: (node, clip, keys) => syncTimelineClipTransformKeyframeAtPlayhead(node, clip, keys)
            },
            historySource: {
                pushHistoryBatch: (...args) => pushHistoryBatch(...args)
            },
            persistenceSource: {
                scheduleSave: (...args) => scheduleSave(...args)
            },
            stateSource: {
                mutate: (...args) => mutate(...args)
            }
        },
        commandSource: {
            domSource: {},
            nodeSource: {
                getNode: (id) => getNode(id),
                isNodeLocked: (node) => isNodeLocked(node),
                normalizeTimelineNode: (node) => typeof timelineNormalizeNode === 'function' ? timelineNormalizeNode(node) : undefined,
                serializeTimeline: (node) => typeof timelineSerializeTimeline === 'function' ? timelineSerializeTimeline(node, TIMELINE_NODE_CONTEXT) : node,
                serializeTimelineRenderPayload: (node) => typeof timelineSerializeTimelineRenderPayload === 'function'
                    ? timelineSerializeTimelineRenderPayload(node, TIMELINE_NODE_CONTEXT)
                    : (typeof timelineSerializeTimeline === 'function' ? timelineSerializeTimeline(node, TIMELINE_NODE_CONTEXT) : node)
            },
            clipboardSource: {
                hasWriteText: () => typeof navigator.clipboard?.writeText === 'function',
                writeText: (text) => navigator.clipboard.writeText(text)
            },
            consoleSource: {
                info: (...args) => console.info(...args)
            },
            interactionSource: {
                clamp
            },
            selectionSource: {
                setSelectedNodeId: (nodeId) => { selectedNodeId = nodeId; },
                setSelectedNodeIds: (nodeIds) => { selectedNodeIds = new Set(nodeIds || []); },
                setSelectedEdgeId: (edgeId) => { selectedEdgeId = edgeId; }
            },
            paramSource: {},
            clipSource: {
                timelineSelectedVisualClip: (node) => timelineSelectedVisualClip(node)
            },
            keyframeSource: {
                timelineKeyframeTime: (node) => timelineKeyframeTime(node),
                timelineKeyframeIndexAt: (clip, time) => timelineKeyframeIndexAt(clip, time),
                timelineKeyframeValuesAtPlayhead: (node, clip) => timelineKeyframeValuesAtPlayhead(node, clip),
                syncTimelineClipTransformKeyframeAtPlayhead: (node, clip, keys) => syncTimelineClipTransformKeyframeAtPlayhead(node, clip, keys),
                uid
            },
            commandOperationSource: {
                buildTimelineParamsPatch: timelineBuildParamsPatch,
                buildTimelineTracksPatch: timelineBuildTracksPatch,
                buildTimelineKeyframesPatch: timelineBuildKeyframesPatch,
                buildTimelineClipResetPatch: timelineBuildClipResetPatch,
                buildTimelineClipDeletePatch: timelineBuildClipDeletePatch,
                buildProjectTimelineClipEdgeDeletePatch,
                captureTimelineMaskGeometry: (node) => captureTimelineMaskGeometry(node),
                remapTimelineMasksAfterCanvasResize: (node, snapshot) => remapTimelineMasksAfterCanvasResize(node, snapshot),
                timelineDuration: (node) => typeof timelineDuration === 'function' ? timelineDuration(node) : Math.max(1, ...(node?.clips || []).map(timelineClipEnd))
            },
            historySource: {
                pushHistory: (...args) => pushHistory(...args),
                pushHistoryBatch: (...args) => pushHistoryBatch(...args)
            },
            persistenceSource: {
                scheduleSave: (...args) => scheduleSave(...args)
            },
            stateSource: {
                mutate: (...args) => mutate(...args)
            },
            projectSource: {
                getProject: () => project,
                deleteEdge: (...args) => deleteEdge(...args),
            },
            layoutSource: {
                defaultNodeSize: (...args) => defaultNodeSize(...args)
            },
            viewportSource: {
                centerViewportOnWorld: (...args) => centerViewportOnWorld(...args)
            },
            languageSource: {
                t
            },
            uiSource: {
                showToast: (...args) => showToast(...args),
                openContextMenu: (...args) => openContextMenu(...args)
            }
        }
    };
    const CANVAS_TIMELINE_CONTEXT = typeof WORKBENCH_CANVAS_TIMELINE_CONTEXT.createCanvasWorkbenchTimelineContext === 'function'
        ? WORKBENCH_CANVAS_TIMELINE_CONTEXT.createCanvasWorkbenchTimelineContext({
            timelineSource: TIMELINE_CONTEXT_SOURCE
        })
        : {};
    const {
        CANVAS_TIMELINE_DOM_CONTROLLER,
        timelineLaneInfoFromTarget,
        refreshTimelineTrackRowsDom,
        refreshTimelineClipDom,
        refreshTimelineAllClipDom,
        refreshTimelinePlayheadDom,
        timelineNormalizedKeyframes,
        refreshTimelineKeyframeMarkersDom,
        CANVAS_TIMELINE_PLAYHEAD_CONTROLLER,
        startTimelinePlayheadDrag,
        isTimelinePlayheadDragging,
        CANVAS_TIMELINE_PREVIEW_CONTROLLER,
        startTimelinePreviewDrag,
        isTimelinePreviewDragging,
        CANVAS_TIMELINE_PLAYBACK_CONTROLLER: timelinePlaybackController,
        startTimelineKeyframeDrag,
        isTimelineKeyframeDragging,
        startTimelineClipDrag,
        isTimelineClipDragging,
        CANVAS_TIMELINE_MASK_CONTROLLER: timelineMaskController,
        startTimelineMaskAnchorDrag,
        applyTimelineMaskFeatherToSelectedClip: applyTimelineMaskFeatherController,
        remapTimelineClipMaskForGeometryChange: remapTimelineClipMaskForGeometryChangeController,
        remapTimelineMasksAfterCanvasResize: remapTimelineMasksAfterCanvasResizeController,
        startTimelineMaskDraw,
        isTimelineMaskPointerActive,
        startDirectorTimelinePreviewDrag,
        isDirectorTimelineDragging,
        CANVAS_TIMELINE_FRAME_CONTROLLER: timelineFrameController,
        CANVAS_TIMELINE_RENDER_CONTROLLER: timelineRenderController,
        CANVAS_TIMELINE_COMPARE_CONTROLLER: timelineCompareController,
        CANVAS_TIMELINE_PARAM_CONTROLLER: timelineParamController,
        CANVAS_TIMELINE_COMMAND_CONTROLLER: timelineCommandController
    } = CANVAS_TIMELINE_CONTEXT;
    CANVAS_TIMELINE_PARAM_CONTROLLER = timelineParamController || null;
    CANVAS_TIMELINE_COMMAND_CONTROLLER = timelineCommandController || null;
    CANVAS_TIMELINE_PLAYBACK_CONTROLLER = timelinePlaybackController || null;
    CANVAS_TIMELINE_FRAME_CONTROLLER = timelineFrameController || null;
    CANVAS_TIMELINE_RENDER_CONTROLLER = timelineRenderController || null;
    CANVAS_TIMELINE_COMPARE_CONTROLLER = timelineCompareController || null;
    const BACKEND_CONTEXT_SOURCE = {
            backendRequestSource: {
                apiSource: {
                    getApiMethod: name => BACKEND_API_FACADE[name]
                },
                projectSource: {
                    getProjectId: () => project?.id || PROJECT_ID
                },
                storageSource: {
                    getStorageScope: () => storageScope
                },
                systemSource: {
                    getSystemParams: () => window.simpleaiTopbarSystemParams || {}
                },
                languageSource: {
                    runtimeUiLang: () => runtimeUiLang()
                },
                serializationSource: {
                    serializeClassicNodeForRun: node => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializeClassicNodeForRun?.(node) || {},
                    serializePresetForRun: node => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializePresetForRun?.(node) || {},
                    cloneRunValue
                },
                vlmSource: {
                    getVlmCustomApiKey,
                    getVlmCustomRuntimeParams,
                    sendVlmRunRequest: (...args) => CANVAS_VLM_CHAT_CONTROLLER?.sendVlmRunRequest?.(...args),
                    sendVlmCancelRequest: (...args) => CANVAS_VLM_CHAT_CONTROLLER?.sendVlmCancelRequest?.(...args)
                },
                networkSource: {
                    fetch: typeof window.fetch === 'function' ? window.fetch.bind(window) : null
                }
            },
            qwenTtsPresetsSource: {
                timeSource: {
                    nowIso
                },
                stateSource: {
                    mutate
                },
                diagnosticsSource: {
                    warn: (...args) => console.warn(...args)
                }
            },
    };
    const CANVAS_BACKEND_CONTEXT = typeof WORKBENCH_CANVAS_BACKEND_CONTEXT.createCanvasWorkbenchBackendContext === 'function'
        ? WORKBENCH_CANVAS_BACKEND_CONTEXT.createCanvasWorkbenchBackendContext({
            backendSource: BACKEND_CONTEXT_SOURCE
        })
        : {};
    const {
        CANVAS_BACKEND_REQUEST_CONTROLLER,
        getWorkbenchUserContext,
        withWorkbenchUserContext,
        sendCanvasDryRunRequest,
        sendCanvasRunNodeRequest,
        sendCanvasPollRunRequest,
        sendCanvasControlRunRequest,
        sendCanvasQwenTtsRunRequest,
        sendCanvasQwenTtsPollRequest,
        sendCanvasQwenTtsControlRequest,
        sendCanvasQwenTtsPresetsRequest,
        sendCanvasModelCatalogRequest,
        sendCanvasPresetModelStatusRequest,
        sendCanvasPresetModelDownloadsRequest,
        sendCanvasVlmModelStatusRequest,
        sendCanvasVlmModelDownloadsRequest,
        sendCanvasVlmModelDownloadStatusRequest,
        sendCanvasVlmModelDownloadCancelRequest,
        sendCanvasCustomLlmModelsRequest,
        sendVlmSystemPromptTemplatesRequest,
        sendCanvasListAssetsRequest,
        sendCanvasDeleteAssetsRequest,
        sendCanvasMaterializeAssetRequest,
        sendCanvasGenerateMaskRequest,
        sendCanvasWd14TagRequest,
        sendCanvasVlmRunRequest,
        sendCanvasVlmCancelRequest,
        sendCanvasTranslateRunRequest,
        sendCanvasTranslatePollRequest,
        sendCanvasProjectSaveRequest,
        sendCanvasProjectLoadRequest,
        sendCanvasProjectListRequest,
        sendCanvasProjectDeleteRequest,
        sendCanvasProjectClearRequest,
        CANVAS_QWEN_TTS_PRESETS_CONTROLLER,
        normalizeQwenTtsPresetEntries,
        getQwenTtsStylePresetEntries,
        getQwenTtsStylePresetState,
        refreshQwenTtsStylePresets
    } = CANVAS_BACKEND_CONTEXT;
    const CANVAS_VLM_MODEL_DOWNLOAD_CONTROLLER = typeof WORKBENCH_VLM_MODEL_DOWNLOAD.createCanvasVlmModelDownloadController === 'function'
        ? WORKBENCH_VLM_MODEL_DOWNLOAD.createCanvasVlmModelDownloadController({
            vlmModelDownloadSource: {
                requestSource: {
                    sendCanvasVlmModelDownloadsRequest: (...args) => sendCanvasVlmModelDownloadsRequest(...args),
                    sendCanvasVlmModelDownloadStatusRequest: (...args) => sendCanvasVlmModelDownloadStatusRequest(...args),
                    sendCanvasVlmModelDownloadCancelRequest: (...args) => sendCanvasVlmModelDownloadCancelRequest(...args)
                },
                languageSource: {
                    getLanguageState: () => ({ __lang: runtimeUiLang() }),
                    t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
                },
                agentSource: {
                    getCanvasAgentSettings: (...args) => getCanvasAgentSettings(...args),
                    canvasAgentCustomParamsFromSettings
                },
                identitySource: { uid },
                uiSource: { showToast },
                utilitySource: {
                    escapeHtml,
                    formatBytes: WORKBENCH_UTILS.formatBytes
                },
                timingSource: {
                    now: () => Date.now(),
                    setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined,
                    clearTimeout: (...args) => typeof window.clearTimeout === 'function' ? window.clearTimeout(...args) : undefined
                },
                helpSource: {
                    sync: (...args) => window.SimpAIStudioHelp?.sync?.(...args)
                },
                renderSource: {
                    renderCanvasAgentPanel: (...args) => renderCanvasAgentPanel(...args)
                },
                catalogSource: {
                    refreshVlmModelCatalog: (...args) => WORKBENCH_REGISTRY.refreshVlmModelCatalog?.(...args)
                },
                diagnosticSource: {
                    warn: (...args) => console.warn(...args)
                }
            }
        })
        : {};
    window.SimpAICanvasWorkbenchVlmModelDownloadRuntime = CANVAS_VLM_MODEL_DOWNLOAD_CONTROLLER;
    const TRANSLATION_CONTEXT_SOURCE = {
        requestSource: {
            sendCanvasTranslateRunRequest: (...args) => sendCanvasTranslateRunRequest(...args),
            sendCanvasTranslatePollRequest: (...args) => sendCanvasTranslatePollRequest(...args)
        },
        timingSource: {
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
        },
        timeSource: {
            now: () => canvasNow()
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        },
        runtimeSource: {
            isNodeLocked,
            getNode,
            getSelectedNodeId: () => selectedNodeId,
            getTextNodeInputSource,
            getNodeTextOutput,
            pushHistoryBatch,
            buildTranslationStatePatch,
            buildTranslationStatus,
            updateNodeParam,
            updateVlmParam,
            updateTextNodeValue,
            mutate,
            showToast,
            nowIso,
            renderAll
        }
    };
    const TRANSLATION_CONTROLLER = typeof WORKBENCH_CANVAS_TRANSLATION.createCanvasTranslationController === 'function'
        ? WORKBENCH_CANVAS_TRANSLATION.createCanvasTranslationController({
            translationSource: TRANSLATION_CONTEXT_SOURCE
        })
        : {};
    const requestTranslation = (...args) => TRANSLATION_CONTROLLER?.requestTranslation?.(...args)
        || { ok: false, error: 'translation unavailable' };
    const handleTranslateClick = (...args) => TRANSLATION_CONTROLLER?.handleTranslateClick?.(...args) || false;
    const bindInspectorTranslateEvents = (...args) => TRANSLATION_CONTROLLER?.bindInspectorTranslateEvents?.(...args) || false;
    const RUN_REFRESH_WAIT_CONTEXT_SOURCE = {
        languageSource: {
            t
        },
        projectSource: {
            getNode: (...args) => getNode(...args)
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isResultRefreshing: (...args) => isResultRefreshing(...args),
            isCanvasRunActiveState: (...args) => isCanvasRunActiveState(...args),
            nodeStatusState: (...args) => nodeStatusState(...args)
        },
        patchSource: {
            buildCanvasNodeStatusPatch: (...args) => buildCanvasNodeStatusPatch(...args),
            buildCanvasRunStatus: (...args) => buildCanvasRunStatus(...args)
        },
        runtimeSource: {
            mutate: (...args) => mutate(...args)
        },
        timingSource: {
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
        },
        timeSource: {
            now: () => canvasNow()
        },
        uiSource: {
            showToast: (...args) => showToast(...args)
        }
    };
    const RUN_REFRESH_WAIT_CONTROLLER = typeof WORKBENCH_CANVAS_RUN_REFRESH_WAIT.createCanvasRunRefreshWaitController === 'function'
        ? WORKBENCH_CANVAS_RUN_REFRESH_WAIT.createCanvasRunRefreshWaitController({
            runRefreshWaitSource: RUN_REFRESH_WAIT_CONTEXT_SOURCE
        })
        : {};
    const waitForRefreshingSources = (...args) => RUN_REFRESH_WAIT_CONTROLLER?.waitForRefreshingSources?.(...args) ?? false;
    const POSE_STUDIO_SMOKE_CONTEXT_SOURCE = {
        stateSource: {
            getProject: () => project,
            setProject: (value) => { project = value; },
            getSelectedNodeId: () => selectedNodeId,
            getSelectedNodeIds: () => selectedNodeIds,
            getSelectedEdgeId: () => selectedEdgeId,
            getSelectedGroupId: () => selectedGroupId,
            setSelection: ({ nodeId, nodeIds, edgeId, groupId } = {}) => {
                selectedNodeId = nodeId || null;
                selectedNodeIds = nodeIds instanceof Set
                    ? new Set(nodeIds)
                    : new Set(Array.isArray(nodeIds) ? nodeIds : []);
                selectedEdgeId = edgeId || null;
                selectedGroupId = groupId || null;
            }
        },
        projectSource: {
            cloneRunValue: (...args) => cloneRunValue(...args),
            sanitizeProject: (...args) => sanitizeProject(...args),
            loadStoredProject: () => loadProject(storageKey, storageScope)
        },
        lifecycleSource: {
            stopTimelinePlayback: (...args) => stopTimelinePlayback(...args),
            resetRenderedProjectDomCache: (...args) => resetRenderedProjectDomCache(...args),
            resetGalleryFrostReveals: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.resetGalleryFrostReveals(...args)
        },
        nodeSource: {
            addPoseStudioNode: (...args) => addPoseStudioNode(...args),
            addPresetNode: (...args) => addPresetNode(...args),
            getVisibleUploadSlots: (...args) => getVisibleUploadSlots(...args),
            canNodeConnectToUploadSlot: (...args) => canNodeConnectToUploadSlot(...args),
            connectUploadEdgeApi: (...args) => connectUploadEdgeApi(...args),
            getNode: (...args) => getNode(...args),
            isPoseStudioImageSource: (...args) => isPoseStudioImageSource(...args)
        },
        renderSource: {
            renderAll: (...args) => renderAll(...args)
        },
        domSource: {
            getNodesLayer: () => nodesLayer
        },
        timingSource: {
            requestAnimationFrame: (callback) => requestCanvasFrame(callback)
        },
        timeSource: {
            now: () => canvasNow()
        },
        utilitySource: {
            cssEscape: (...args) => cssEscape(...args),
            nowIso: (...args) => nowIso(...args)
        }
    };
    CANVAS_POSE_STUDIO_SMOKE_CONTROLLER = typeof WORKBENCH_CANVAS_POSE_STUDIO_SMOKE.createCanvasPoseStudioSmokeController === 'function'
        ? WORKBENCH_CANVAS_POSE_STUDIO_SMOKE.createCanvasPoseStudioSmokeController({
            poseStudioSmokeSource: POSE_STUDIO_SMOKE_CONTEXT_SOURCE
        })
        : {};
    const PRESET_CONTEXT_SOURCE = {
            paramRendererSource: {
                t,
                clamp,
                escapeHtml,
                localizeCanvasLabel,
                getPromptTextSourceNode,
                presetParamValue,
                isPromptTextParam,
                shouldEnableDanbooruAutocomplete,
                danbooruAutocompleteAttrs,
                getTranslationFieldState,
                getPresetThemeInfo
            },
            presetCatalogSource: {
                languageSource: {
                    t
                },
                utilitySource: {
                    normalizePresetName
                },
                systemSource: {
                    getSystemParams: () => window.simpleaiTopbarSystemParams || {}
                },
                apiSource: {
                    presetCatalog: (payload) => apiPresetCatalog(payload)
                },
                userSource: {
                    getWorkbenchUserContext
                },
                paletteSource: {
                    isPaletteOpen: () => !!(palette && !palette.hidden),
                    renderPresetPalette
                },
                nodeSource: {
                    reconcilePresetNodesWithCatalog
                },
                stateSource: {
                    mutate
                },
                uiSource: {
                    showToast,
                    isWorkbenchOpen: () => !!(root && !root.hidden),
                    renderAll
                },
                diagnosticsSource: {
                    warn: (...args) => console.warn(...args)
                }
            },
            presetPaletteSource: {
                languageSource: { t },
                utilitySource: { escapeHtml, localizeCanvasLabel },
                catalogSource: {
                    getPresetCatalog: (...args) => getPresetCatalog(...args),
                    getPresetCatalogState: (...args) => getPresetCatalogState(...args),
                    refreshPresetCatalog: (...args) => refreshPresetCatalog(...args),
                    resolvePresetCatalogEntry: (...args) => resolvePresetCatalogEntry(...args)
                },
                domSource: { getPalette: () => palette },
                worldSource: {
                    setLastPointerWorld: world => { lastPointerWorld = world; },
                    getLastPointerWorld: () => lastPointerWorld,
                    viewportCenterWorld
                },
                nodeSource: { addPresetNode },
                uiSource: { clearPendingInputTarget: (...args) => clearPendingInputTarget(...args), showToast },
                runtimeSource: { setTimeout: (...args) => window.setTimeout(...args) }
            }
    };
    const CANVAS_PRESET_CONTEXT = typeof WORKBENCH_CANVAS_PRESET_CONTEXT.createCanvasWorkbenchPresetContext === 'function'
        ? WORKBENCH_CANVAS_PRESET_CONTEXT.createCanvasWorkbenchPresetContext({
            presetSource: PRESET_CONTEXT_SOURCE
        })
        : {};
    const CANVAS_PRESET_PALETTE = CANVAS_PRESET_CONTEXT.CANVAS_PRESET_PALETTE || {};
    CANVAS_PRESET_PARAM_RENDERER = CANVAS_PRESET_CONTEXT.CANVAS_PRESET_PARAM_RENDERER || {};
    const renderPresetParamControl = (...args) => CANVAS_PRESET_PARAM_RENDERER?.renderPresetParamControl?.(...args) || '';
    const renderTranslatableTextarea = (...args) => CANVAS_PRESET_PARAM_RENDERER?.renderTranslatableTextarea?.(...args) || '';
    const wildcardPreviewFacts = (...args) => CANVAS_PRESET_PARAM_RENDERER?.wildcardPreviewFacts?.(...args) || [];
    const canvasRelightLightValue = (...args) => CANVAS_PRESET_PARAM_RENDERER?.canvasRelightLightValue?.(...args) || '10';
    const canvasRelightLightOption = (...args) => CANVAS_PRESET_PARAM_RENDERER?.canvasRelightLightOption?.(...args) || null;
    const isCanvasRelightLightDirectionParam = (...args) => CANVAS_PRESET_PARAM_RENDERER?.isCanvasRelightLightDirectionParam?.(...args) || false;
    const renderCanvasRelightLightDirectionControl = (...args) => CANVAS_PRESET_PARAM_RENDERER?.renderCanvasRelightLightDirectionControl?.(...args) || '';
    const inferPresetNumberStep = (...args) => CANVAS_PRESET_PARAM_RENDERER?.inferPresetNumberStep?.(...args) || 1;
    const PRESET_CATALOG_SERVICE = CANVAS_PRESET_CONTEXT.PRESET_CATALOG_SERVICE || {};
    const getPresetCatalog = PRESET_CATALOG_SERVICE.getPresetCatalog;
    const refreshPresetCatalog = PRESET_CATALOG_SERVICE.refreshPresetCatalog;
    const resolvePresetCatalogEntry = PRESET_CATALOG_SERVICE.resolvePresetCatalogEntry;
    const getPresetCatalogState = PRESET_CATALOG_SERVICE.getPresetCatalogState;
    const CANVAS_TEMPLATE_CONTEXT = typeof WORKBENCH_CANVAS_TEMPLATE_CONTEXT.createCanvasWorkbenchTemplateContext === 'function'
        ? WORKBENCH_CANVAS_TEMPLATE_CONTEXT.createCanvasWorkbenchTemplateContext({
            templateLibrarySource: {
                defaultsSource: {
                    languageSource: {
                        t
                    }
                },
                apiSource: {
                    getApiMethod: name => ({
                        saveTemplate: apiSaveTemplate,
                        listTemplates: apiListTemplates,
                        loadTemplate: apiLoadTemplate,
                        deleteTemplate: apiDeleteTemplate
                    }[name])
                },
                userSource: {
                    getUserContext: () => getWorkbenchUserContext()
                },
                confirmSource: {
                    languageSource: {
                        t
                    },
                    utilitySource: {
                        escapeHtml
                    },
                    domSource: {
                        document
                    },
                    uiSource: {
                        detectWorkbenchTheme
                    }
                },
                dataSource: {
                    languageSource: {
                        t
                    },
                    utilitySource: {
                        sanitizeStoragePart
                    },
                    pathSource: {
                        resolveStaticPath: resolveWorkbenchStaticPath,
                        getManifestPath: () => TEMPLATE_LIBRARY_MANIFEST_PATH,
                        getPreviewRoot: () => TEMPLATE_PREVIEW_ROOT
                    },
                    networkSource: {
                        fetchManifest: (path, options) => fetch(path, options),
                        fetchTemplateProject: (path, options) => fetch(path, options)
                    },
                    projectSource: {
                        createFallbackProject: () => createDemoWorkbenchProject({ id: project.id || PROJECT_ID, storage: project.storage || buildProjectStorageInfo(storageKey, storageScope) })
                    },
                    uiSource: {
                        showToast
                    },
                    diagnosticsSource: {
                        warn: (...args) => console.warn(...args)
                    }
                },
                viewsSource: {
                    languageSource: {
                        t
                    },
                    utilitySource: {
                        escapeHtml
                    }
                },
                librarySource: {
                    languageSource: {
                        t
                    },
                    domSource: {
                        document
                    },
                    viewSource: {
                        escapeHtml
                    },
                    actionSource: {
                        saveCurrentCanvasAsTemplate: (...args) => saveCurrentCanvasAsTemplate(...args),
                        deleteUserWorkbenchTemplate: (...args) => deleteUserWorkbenchTemplate(...args),
                        createWorkbenchFromTemplate: (...args) => createWorkbenchFromTemplate(...args)
                    },
                    dataSource: {},
                    apiSource: {},
                    projectSource: {
                        getCurrentProject: () => project,
                        getDefaultProjectId: () => PROJECT_ID,
                        sanitizeProject,
                        createDefaultProject,
                        setProject: (value) => { project = value; }
                    },
                    storageSource: {
                        getStorageScope: () => storageScope,
                        getStorageKey: () => storageKey,
                        setActiveBrowserCacheProject: (...args) => setActiveBrowserCacheProject(...args)
                    },
                    persistenceSource: {
                        saveProject: (...args) => saveProject(...args),
                        compactProjectForStorage,
                        getDefaultSettings: () => DEFAULT_SETTINGS,
                        buildProjectStorageInfo: (...args) => buildProjectStorageInfo(...args)
                    },
                    uiSource: {
                        isTemplateLibraryModalConnected: (modal) => !!(modal && document.body.contains(modal)),
                        detectWorkbenchTheme,
                        showToast,
                        closeContextMenu: (...args) => closeContextMenu(...args),
                        closeCanvasSettingsPanel: (...args) => closeCanvasSettingsPanel(...args)
                    },
                    dialogSource: {},
                    assetSource: {
                        syncCanvasProjectAssetRoot: (...args) => syncCanvasProjectAssetRoot(...args),
                        resetRenderedProjectDomCache,
                        refreshCanvasProjectAssetRoot: (...args) => refreshCanvasProjectAssetRoot(...args)
                    },
                    stateSource: {
                        setBackendLoadedStorageKey: (value) => { backendLoadedStorageKey = value; },
                        resetSelectionState: () => CANVAS_SELECTION_CONTROLLER.resetSelectionState(),
                        resetHistory,
                        mutate,
                        fitAll,
                        resetGalleryFrostReveals: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.resetGalleryFrostReveals(...args)
                    },
                    utilitySource: {
                        sanitizeStoragePart,
                        cloneRunValue
                    },
                    timeSource: {
                        nowIso
                    },
                    diagnosticsSource: {
                        warn: (...args) => console.warn(...args)
                    }
                }
            }
        })
        : {};
    const {
        CANVAS_TEMPLATE_LIBRARY_DEFAULTS_CONTROLLER,
        getDefaultWorkbenchTemplateLibraryItems,
        CANVAS_TEMPLATE_LIBRARY_API_CONTROLLER,
        sendCanvasTemplateSaveRequest,
        sendCanvasTemplateListRequest,
        sendCanvasTemplateLoadRequest,
        sendCanvasTemplateDeleteRequest,
        CANVAS_CONFIRM_DIALOG_CONTROLLER,
        requestCanvasConfirmDialog,
        CANVAS_TEMPLATE_LIBRARY_DATA_CONTROLLER,
        TEMPLATE_MEDIA_CATEGORIES,
        localizeTemplateText,
        normalizeTemplateModelDependency,
        normalizeTemplateMediaCategory,
        normalizeTemplateLibraryItem,
        inferProjectTemplateModelDependency,
        getWorkbenchTemplateLibraryItems,
        invalidateTemplateLibraryItems,
        getUserWorkbenchTemplateLibraryItems,
        loadWorkbenchTemplateData,
        resolveTemplatePreviewPath,
        CANVAS_TEMPLATE_LIBRARY_VIEWS_CONTROLLER,
        normalizeTemplateLibraryCategory,
        templateCategoryLabel,
        templateLibraryFilterState,
        renderTemplateCardHtml,
        renderTemplateLibraryHtml,
        renderSaveTemplateDialogHtml,
        renderTemplateWorkbenchIdDialogHtml,
        CANVAS_TEMPLATE_LIBRARY_CONTROLLER,
        bindTemplateLibraryModal,
        closeTemplateLibrary,
        openTemplateLibrary,
        saveCurrentCanvasAsTemplate,
        deleteUserWorkbenchTemplate,
        createWorkbenchFromTemplate,
        refreshTemplateLibraryModal,
        refreshTemplateLibraryAfterMutation,
        requestSaveTemplateDetails,
        requestTemplateWorkbenchId,
        applyTemplateWorkbenchProject,
        beginTemplateWorkbenchCreation,
        isLatestTemplateWorkbenchCreation,
        cancelTemplateWorkbenchCreation,
        beginTemplateLibraryRefresh,
        isLatestTemplateLibraryRefresh,
        cancelTemplateLibraryRefresh,
        restoreTemplateWorkbenchCreation
    } = CANVAS_TEMPLATE_CONTEXT;
    const UI_CONTEXT_SOURCE = {
            settingsViewsSource: {
                languageSource: {
                    t
                },
                utilitySource: {
                    escapeHtml
                }
            },
            agentSettingsSource: {
                languageSource: {
                    t
                },
                configSource: {
                    getCanvasAgentDefaultSettings: () => CANVAS_AGENT_DEFAULT_SETTINGS,
                    getDefaultSettings: () => DEFAULT_SETTINGS,
                    getVersionChoices: () => VLM_VERSION_CHOICES,
                    canvasAgentAspectOptions: CANVAS_AGENT_ASPECT_OPTIONS
                },
                utilitySource: {
                    normalizePresetName,
                    clamp
                },
                modelSource: {
                    vlmModelDisplayLabel
                },
                customApiSource: {
                    getVlmCustomProvider: (...args) => getVlmCustomProvider(...args),
                    getVlmCustomApiProfile: (...args) => getVlmCustomApiProfile(...args),
                    getVlmCustomProfileKey: (...args) => getVlmCustomProfileKey(...args),
                    readVlmCustomApiProfiles: (...args) => readVlmCustomApiProfiles(...args),
                    writeVlmCustomApiProfiles: (...args) => writeVlmCustomApiProfiles(...args),
                    getCanvasAgentCustomKeyValue: () => canvasSettingsPanel?.querySelector?.('[data-canvas-agent-custom-key]')?.value || ''
                },
                projectSource: {
                    getProject: () => project,
                    getCurrentProjectId: () => project.id || PROJECT_ID,
                    buildProjectSettingsMergePatch: (...args) => buildProjectSettingsMergePatch(...args)
                },
                stateSource: {
                    getAgentState: () => canvasAgentState,
                    mutate: (...args) => mutate(...args)
                },
                nodeSource: {
                    getSelectedNodeId: () => selectedNodeId,
                    getNode: (...args) => getNode(...args)
                },
                patchSource: {
                    buildVlmModelUnknownStatus: (...args) => buildVlmModelUnknownStatus(...args),
                    buildVlmParamsPatch: (...args) => buildVlmParamsPatch(...args),
                    buildVlmModelStatusPatch: (...args) => buildVlmModelStatusPatch(...args)
                },
                historySource: {
                    pushHistoryBatch: (...args) => pushHistoryBatch(...args),
                    pushHistory: (...args) => pushHistory(...args)
                },
                persistenceSource: {
                    scheduleSave: (...args) => scheduleSave(...args),
                    nowIso: (...args) => nowIso(...args)
                },
                requestSource: {
                    sendCanvasVlmRunRequest: (...args) => sendCanvasVlmRunRequest(...args),
                    sendCanvasAgentCustomModelsRequest: (params) => typeof apiCustomLlmModels === 'function'
                        ? apiCustomLlmModels(Object.assign({}, params || {}, { user_context: getWorkbenchUserContext() }))
                        : { ok: false, error: 'Custom model API is unavailable' }
                },
                uiSource: {
                    showToast: (...args) => showToast(...args),
                    renderCanvasAgentPanel: (...args) => renderCanvasAgentPanel(...args),
                    renderCanvasSettingsPanel: (...args) => renderCanvasSettingsPanel(...args),
                    renderStatus: (...args) => renderStatus(...args),
                    getCanvasAgentPanel: () => canvasAgentPanel,
                    getCanvasSettingsPanel: () => canvasSettingsPanel
                },
                documentSource: {
                    getDocument: () => document
                },
                toolSource: {
                    decodeCanvasAgentVideoToolChoice: (...args) => CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER?.decodeCanvasAgentVideoToolChoice?.(...args) || {}
                }
            },
            outpaintSource: {
                languageSource: {
                    t
                },
                utilitySource: {
                    escapeHtml,
                    defaultNodeSize,
                    clamp
                },
                documentSource: {
                    getDocument: () => document
                },
                overlaySource: {
                    getOutpaintOverlayState: () => outpaintOverlayState,
                    getOutpaintOverlayElement: () => outpaintOverlayEl,
                    getOutpaintNodeElement: (id) => nodesLayer?.querySelector?.(`[data-node-id="${CSS.escape(id)}"]`),
                    getOutpaintStage: () => stage
                },
                projectSource: {
                    getProject: () => project
                },
                targetSource: {
                    isCanvasAgentImageTarget: (...args) => CANVAS_AGENT_TARGET_CONTROLLER?.isCanvasAgentImageTarget?.(...args) || false
                },
                viewportSource: {
                    getViewportZoom: () => project.viewport?.zoom || 1
                },
                panelSource: {
                    getCanvasAgentPanel: () => canvasAgentPanel
                }
            },
            settingsSource: {
                languageSource: {
                    getLanguageState: () => ({ __lang: runtimeUiLang() }),
                    t: (en, cn, state) => t(en, cn, state)
                },
                projectSource: {
                    getProject: () => project,
                    buildProjectSettingsMergePatch: (...args) => buildProjectSettingsMergePatch(...args)
                },
                historySource: {
                    pushHistory: (...args) => pushHistory(...args)
                },
                panelSource: {
                    getCanvasSettingsPanel: () => canvasSettingsPanel,
                    getCanvasSettingsTab: () => canvasSettingsState.tab,
                    setCanvasSettingsTab: (tab) => { canvasSettingsState.tab = tab; }
                },
                renderSource: {
                    getCanvasAgentPresetScanState: (...args) => getCanvasAgentPresetScanState(...args),
                    getCanvasAgentReadyPresetCount: () => canvasAgentReadyPresetEntries().length,
                    renderCanvasAgentSettingsTab: (...args) => renderCanvasAgentSettingsTab?.(...args) || '',
                    renderCanvasSettingsPanelView: (...args) => renderCanvasSettingsPanelView(...args),
                    ensureWorkbenchFormFieldNames: (...args) => ensureWorkbenchFormFieldNames(...args),
                    isCanvasAgentPresetScanIdle: () => getCanvasAgentPresetScanState().state === 'idle',
                    refreshCanvasAgentAvailablePresets: (...args) => refreshCanvasAgentAvailablePresets(...args),
                    mutate: (...args) => mutate(...args)
                },
                agentSettingsSource: {
                    getCanvasAgentSettings: (...args) => getCanvasAgentSettings(...args),
                    setCanvasAgentSettingsPatch: (...args) => setCanvasAgentSettingsPatch(...args),
                    saveCanvasAgentCustomSecret: (...args) => saveCanvasAgentCustomSecret(...args),
                    fetchCanvasAgentCustomModels: (...args) => fetchCanvasAgentCustomModels(...args),
                    testCanvasAgentCustomApi: (...args) => testCanvasAgentCustomApi(...args),
                    syncCanvasAgentCustomFromSelectedVlm: (...args) => syncCanvasAgentCustomFromSelectedVlm(...args),
                    syncSelectedVlmCustomFromCanvasAgent: (...args) => syncSelectedVlmCustomFromCanvasAgent(...args)
                },
                templateSource: {
                    openTemplateLibrary,
                    saveCurrentCanvasAsTemplate
                },
                generalSource: {
                    clearBrowserCache: (...args) => clearBrowserCache(...args),
                    clearProjectFileWithConfirm: (...args) => clearProjectFileWithConfirm(...args)
                },
                siblingPanelSource: {
                    openContextMenu: (...args) => openContextMenu(...args),
                    closeContextMenu: (...args) => closeContextMenu(...args),
                    closeRunQueuePanel: (...args) => closeRunQueuePanel(...args),
                    closeRunHistoryPanel: (...args) => closeRunHistoryPanel(...args)
                }
            }
    };
    const CANVAS_UI_CONTEXT = typeof WORKBENCH_CANVAS_UI_CONTEXT.createCanvasWorkbenchUiContext === 'function'
        ? WORKBENCH_CANVAS_UI_CONTEXT.createCanvasWorkbenchUiContext({
            uiSource: UI_CONTEXT_SOURCE
        })
        : {};
    const {
        CANVAS_SETTINGS_VIEWS_CONTROLLER,
        renderCanvasSettingsPanelView,
         getCanvasAgentSettings,
         setCanvasAgentSettingsPatch,
         setCanvasAgentLayoutPatch,
         canvasAgentDefaultLocalRewriteModel,
         canvasAgentLocalRewriteModels,
         canvasAgentModelSummary,
         getCanvasAgentResolutionState,
         setCanvasAgentResolutionPatch,
         setCanvasAgentResolutionOpen: setCanvasAgentResolutionOpenFromSettings,
         canvasAgentResolutionLabel: canvasAgentResolutionLabelFromSettings,
         canvasAgentResolutionCompactLabel: canvasAgentResolutionCompactLabelFromSettings,
         revealCanvasAgentPanelForToolCard,
         dockCanvasAgentPanelBottomLeft,
          getCanvasAgentRewriteModel,
          handleCanvasAgentSettingInput,
          handleCanvasAgentModelModeInput,
          getCanvasAgentCustomKeyValue,
          getCanvasAgentCustomModelChoices,
          saveCanvasAgentCustomSecret,
          fetchCanvasAgentCustomModels,
          testCanvasAgentCustomApi,
          syncCanvasAgentCustomFromSelectedVlm,
          syncSelectedVlmCustomFromCanvasAgent,
          startOutpaintEdgeDrag,
         updateOutpaintFromSlider,
         onOutpaintOverlayPointerDown,
         onOutpaintSliderInput,
         onOutpaintPresetChange,
         CANVAS_SETTINGS_CONTROLLER,
         openCanvasSettingsPanel,
         closeCanvasSettingsPanel,
         handleCanvasSettingsAction
    } = CANVAS_UI_CONTEXT;
    CANVAS_AGENT_SETTINGS_CONTROLLER = CANVAS_UI_CONTEXT.CANVAS_AGENT_SETTINGS_CONTROLLER || {};
    CANVAS_OUTPAINT_CONTROLLER = CANVAS_UI_CONTEXT.CANVAS_OUTPAINT_CONTROLLER || {};
    CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER = typeof WORKBENCH_CANVAS_AGENT_PRESET_RUNTIME.createCanvasAgentPresetRuntimeController === 'function'
        ? WORKBENCH_CANVAS_AGENT_PRESET_RUNTIME.createCanvasAgentPresetRuntimeController({
            presetRuntimeSource: {
                languageSource: {
                    t
                },
                utilitySource: {
                    escapeHtml,
                    normalizePresetName,
                    cloneRunValue
                },
                identitySource: {
                    uid
                },
                timeSource: {
                    now: () => canvasNow(),
                    nowIso
                },
                catalogSource: {
                    getPresetCatalog: (...args) => typeof getPresetCatalog === 'function' ? getPresetCatalog(...args) : []
                },
                settingsSource: {
                    getCanvasAgentSettings: (...args) => typeof getCanvasAgentSettings === 'function' ? getCanvasAgentSettings(...args) : {}
                },
                storageSource: {
                    getStorage: () => localStorage
                },
                nodeSource: {
                    apiBuildPresetRunNode
                },
                requestSource: {
                    sendCanvasPresetModelStatusRequest
                },
                uiSource: {
                    renderCanvasSettingsPanel: (...args) => renderCanvasSettingsPanel(...args)
                },
                promptSource: {
                    canvasAgentPresetDefaultPrompt: (...args) => canvasAgentPresetDefaultPrompt(...args)
                },
                configSource: {
                    presetQueueStorageKey: CANVAS_AGENT_PRESET_QUEUE_STORAGE_KEY,
                    defaultT2iPresetQueue: CANVAS_AGENT_DEFAULT_T2I_PRESET_QUEUE,
                    defaultEditPresetQueue: CANVAS_AGENT_DEFAULT_EDIT_PRESET_QUEUE,
                    defaultI2vPresetQueue: CANVAS_AGENT_DEFAULT_I2V_PRESET_QUEUE,
                    defaultT2vPresetQueue: CANVAS_AGENT_DEFAULT_T2V_PRESET_QUEUE,
                    defaultVideoEditPresetQueue: CANVAS_AGENT_DEFAULT_VIDEO_EDIT_PRESET_QUEUE,
                    defaultReferenceToVideoPresetQueue: CANVAS_AGENT_DEFAULT_REFERENCE_TO_VIDEO_PRESET_QUEUE,
                    defaultAudioToVideoPresetQueue: CANVAS_AGENT_DEFAULT_AUDIO_TO_VIDEO_PRESET_QUEUE,
                    defaultAudioImageToVideoPresetQueue: CANVAS_AGENT_DEFAULT_AUDIO_IMAGE_TO_VIDEO_PRESET_QUEUE,
                    defaultAudioPresetQueue: CANVAS_AGENT_DEFAULT_AUDIO_PRESET_QUEUE,
                    presetStatusCacheTtlMs: CANVAS_AGENT_PRESET_STATUS_CACHE_TTL_MS,
                    presetStatusScanConcurrency: CANVAS_AGENT_PRESET_STATUS_SCAN_CONCURRENCY
                }
            }
        })
        : {};
    const CONTEXT_MENU_CONTEXT = typeof WORKBENCH_CANVAS_CONTEXT_MENU_CONTEXT.createCanvasWorkbenchContextMenuContext === 'function'
        ? WORKBENCH_CANVAS_CONTEXT_MENU_CONTEXT.createCanvasWorkbenchContextMenuContext({
            contextMenuSource: {
                languageSource: {
                    t
                },
                utilitySource: {
                    escapeHtml,
                    clamp
                },
                domSource: {
                    getContextMenu: () => contextMenu,
                    getDocument: () => document
                },
                viewportSource: {
                    getWindow: () => window
                },
                timeSource: {
                    now: () => canvasNow()
                },
                runtimeSource: {
                    setTimeout: (...args) => window.setTimeout(...args)
                },
                viewSource: {
                    renderIconHtml
                }
            }
        })
        : {};
    const CONTEXT_MENU_CONTROLLER = CONTEXT_MENU_CONTEXT.CONTEXT_MENU_CONTROLLER || {};
    const openContextMenu = CONTEXT_MENU_CONTROLLER.openContextMenu;
    const closeContextMenu = CONTEXT_MENU_CONTROLLER.closeContextMenu;
    const CANVAS_LIFECYCLE_CONTEXT = typeof WORKBENCH_CANVAS_LIFECYCLE_CONTEXT.createCanvasWorkbenchLifecycleContext === 'function'
        ? WORKBENCH_CANVAS_LIFECYCLE_CONTEXT.createCanvasWorkbenchLifecycleContext({
            lifecycleSource: {
                domSource: {
                    getRoot: () => root,
                    getViewport: () => viewport,
                    getWindow: () => window,
                    getDocument: () => document
                },
                mountSource: {
                    bindWorkbenchEvents: () => bindWorkbenchEvents(),
                    bindGroupLayerEvents: () => bindGroupLayerEvents(),
                    handleEdgeLayerPointerDown,
                    handleEdgeLayerClick,
                    handleEdgeLayerContextMenu,
                    bindNodeMediaEvents: (layer) => CANVAS_MEDIA_PLAYBACK_CONTROLLER.bindNodeMediaEvents(layer),
                    getCanvasAgentPointerDown: () => CANVAS_AGENT_PANEL_CONTROLLER.onCanvasAgentPointerDown
                },
                projectSource: {
                    getProject: () => project,
                    ensureWorkbench: (...args) => ensureWorkbench(...args),
                    syncStorageScope: (...args) => syncStorageScope(...args),
                    ensureInitialDemoProject: (...args) => ensureInitialDemoProject(...args),
                    refreshCanvasProjectFromBackendOnOpen: (...args) => refreshCanvasProjectFromBackendOnOpen(...args)
                },
                renderSource: {
                    applyThemeClass: (...args) => applyThemeClass(...args),
                    resetGalleryFrostReveals: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.resetGalleryFrostReveals(...args),
                    renderAll: (...args) => renderAll(...args),
                    renderSystemInfo: (...args) => renderSystemInfo(...args),
                    renderCanvasAgentPanel: (...args) => renderCanvasAgentPanel(...args),
                    hasSelectedNode: () => !!selectedNodeId,
                    renderInspector: (...args) => renderInspector(...args),
                    setCanvasBackendAlert: (...args) => setCanvasBackendAlert(...args)
                },
                presetSource: {
                    refreshPresetCatalog: (...args) => refreshPresetCatalog(...args),
                    scheduleAutoPresetModelChecks: (...args) => scheduleAutoPresetModelChecks(...args)
                },
                runtimeSource: {
                    startPerformanceHud: (...args) => startPerformanceHud(...args),
                    startStandaloneStatusMonitor: (...args) => startStandaloneStatusMonitor(...args),
                    cancelPanEdgeSettleRender: (...args) => cancelPanEdgeSettleRender(...args),
                    cancelDragEdgeSettleRender: (...args) => cancelDragEdgeSettleRender(...args),
                    endDragEdgeLodVisual: (...args) => endDragEdgeLodVisual(...args),
                    cancelEdgeIncidentIndexWarmup: (...args) => cancelEdgeIncidentIndexWarmup(...args),
                    stopTimelinePlayback: (...args) => stopTimelinePlayback(...args),
                    stopStandaloneStatusMonitor: (...args) => stopStandaloneStatusMonitor(...args),
                    stopPerformanceHud: (...args) => stopPerformanceHud(...args)
                },
                panelSource: {
                    closePresetPalette: (...args) => closePresetPalette(...args),
                    closeContextMenu: (...args) => closeContextMenu(...args),
                    closeCanvasSettingsPanel: (...args) => closeCanvasSettingsPanel(...args),
                    closeRunQueuePanel: (...args) => closeRunQueuePanel(...args),
                    closeRunHistoryPanel: (...args) => closeRunHistoryPanel(...args)
                },
                persistenceSource: {
                    saveProject: (...args) => saveProject(...args),
                    saveProjectToBrowserCache: (...args) => saveProjectToBrowserCache(...args)
                },
                timerSource: {
                    setTimeout: (...args) => window.setTimeout(...args)
                },
                galleryImportSource: {
                    getPendingMediaId: () => new URLSearchParams(window.location.search).get('gallery_media_id') || '',
                    importMediaById: (mediaId) => CANVAS_MEDIA_IMPORT_CONTROLLER.importLibraryMediaById(mediaId),
                    clearPendingMediaId: (mediaId) => {
                        const url = new URL(window.location.href);
                        if (url.searchParams.get('gallery_media_id') !== mediaId) return;
                        url.searchParams.delete('gallery_media_id');
                        window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
                    }
                },
                languageSource: { t }
            }
        })
        : {};
    const {
        CANVAS_LIFECYCLE_CONTROLLER,
        openWorkbench,
        closeWorkbench
    } = CANVAS_LIFECYCLE_CONTEXT;
    const CONTROL_CONTEXT_SOURCE = {
            modeSource: {
                domSource: {
                    getRoot: () => root,
                    getViewport: () => viewport
                },
                stateSource: {
                    setModeState: (value) => { mode = value; },
                    getMode: () => mode
                },
                paletteSource: {
                    openPresetPalette: (...args) => openPresetPalette(...args),
                    viewportCenterWorld: (...args) => viewportCenterWorld(...args)
                }
            },
            actionSource: {
                languageSource: {
                    t
                },
                projectSource: {
                    getProject: () => project
                },
                viewportSource: {
                    renderAll: (...args) => renderAll(...args),
                    viewportCenterWorld: (...args) => viewportCenterWorld(...args),
                    zoomAtViewportCenter: (...args) => zoomAtViewportCenter(...args),
                    fitAll: (...args) => fitAll(...args),
                    centerCanvas: (...args) => centerCanvas(...args)
                },
                persistenceSource: {
                    saveProject: (...args) => saveProject(...args),
                    scheduleSave: (...args) => scheduleSave(...args)
                },
                contextSource: {
                    closeContextMenu: (...args) => closeContextMenu(...args)
                },
                lifecycleSource: {
                    isStandaloneCanvasWorkbench: (...args) => isStandaloneCanvasWorkbench(...args),
                    closeWorkbench: (...args) => closeWorkbench(...args)
                },
                importSource: {
                    importSelectedTransferAt: (...args) => importSelectedTransferAt(...args),
                    openImageFilePicker: (...args) => openImageFilePicker(...args)
                },
                nodeSource: {
                    addMediaBrowserNode: (...args) => addMediaBrowserNode(...args),
                    addStyleSelectorNode: (...args) => addStyleSelectorNode(...args),
                    addTextNode: (...args) => addTextNode(...args),
                    addTextMergeNode: (...args) => addTextMergeNode(...args),
                    addWildcardsHelperNode: (...args) => addWildcardsHelperNode(...args),
                    addNoteNode: (...args) => addNoteNode(...args),
                    addAreaGroup: (...args) => addAreaGroup(...args),
                    addTranslationNode: (...args) => addTranslationNode(...args),
                    addTagCartNode: (...args) => addTagCartNode(...args),
                    addWd14Node: (...args) => addWd14Node(...args),
                    addVlmNode: (...args) => addVlmNode(...args),
                    addQwenTtsNode: (...args) => addQwenTtsNode(...args),
                    addSam3VideoMaskNode: (...args) => addSam3VideoMaskNode(...args),
                    addCameraMotionNode: (...args) => addCameraMotionNode(...args),
                    addPoseStudioNode: (...args) => addPoseStudioNode(...args),
                    addGaussianStudioNode: (...args) => addGaussianStudioNode(...args),
                    addLivePortraitExpressionNode: (...args) => addLivePortraitExpressionNode(...args),
                    addCompareNode: (...args) => addCompareNode(...args),
                    addDirectorTimelineNode: (...args) => addDirectorTimelineNode(...args),
                    addTimelineNode: (...args) => addTimelineNode(...args),
                    addManualOutputNode: (...args) => addManualOutputNode(...args)
                },
                navigationSource: {
                    openProjectListPanel: (...args) => openProjectListPanel(...args),
                    openProjectJsonPicker: (...args) => openProjectJsonPicker(...args),
                    openPresetPalette: (...args) => openPresetPalette(...args),
                    openGroupListPanel: (...args) => openGroupListPanel(...args),
                    openTemplateLibrary: (...args) => openTemplateLibrary(...args),
                    openRunHistoryPanel: (...args) => openRunHistoryPanel(...args),
                    openRunQueuePanel: (...args) => openRunQueuePanel(...args),
                    openNodeSearchPanel: (...args) => openNodeSearchPanel(...args),
                    openAssetManagerPanel: (...args) => openAssetManagerPanel(...args),
                    openCanvasManual: (...args) => openCanvasManual(...args),
                    openCanvasSettingsPanel: (...args) => openCanvasSettingsPanel(...args)
                },
                editSource: {
                    undoCanvasEdit: (...args) => undoCanvasEdit(...args),
                    redoCanvasEdit: (...args) => redoCanvasEdit(...args),
                    deleteSelection: (...args) => deleteSelection(...args),
                    clearCanvasWithConfirm: (...args) => clearCanvasWithConfirm(...args)
                },
                runSource: {
                    runSelectedChain: () => CANVAS_SCHEDULER_RUN_CONTROLLER.runSelectedChain?.()
                },
                selectionSource: {
                    getSelectedNodeIdList: (...args) => getSelectedNodeIdList(...args),
                    getNode: (...args) => getNode(...args),
                    isImageCompareSource: (...args) => isImageCompareSource(...args),
                    createCompareNodeFromSources: (...args) => createCompareNodeFromSources(...args),
                    isTimelineSource: (...args) => isTimelineSource(...args),
                    createTimelineNodeFromSources: (...args) => createTimelineNodeFromSources(...args)
                },
                settingsSource: {
                    toggleSetting: (...args) => toggleSetting(...args)
                },
                uiSource: {
                    showToast: (...args) => showToast(...args)
                }
            },
            clickSource: {
                timingSource: {
                    now: () => canvasNow()
                },
                agentSource: {
                    getCanvasAgentSuppressClickUntil: () => canvasAgentSuppressClickUntil,
                    handleCanvasAgentAction: (...args) => handleCanvasAgentAction(...args)
                },
                historySource: {
                    handleRunHistoryAction: (...args) => handleRunHistoryAction(...args)
                },
                queueSource: {
                    handleRunQueueAction: (...args) => handleRunQueueAction(...args)
                },
                settingsSource: {
                    handleCanvasSettingsAction: (...args) => handleCanvasSettingsAction(...args)
                },
                vlmSource: {
                    updateVlmChatJumpButton: (...args) => updateVlmChatJumpButton(...args)
                },
                textSource: {
                    textareaEditorFieldFromTitleClick: (...args) => textareaEditorFieldFromTitleClick(...args),
                    openTextareaEditor: (...args) => openTextareaEditor(...args)
                },
            }
    };
    const CANVAS_CONTROL_CONTEXT = typeof WORKBENCH_CANVAS_CONTROL_CONTEXT.createCanvasWorkbenchControlContext === 'function'
        ? WORKBENCH_CANVAS_CONTROL_CONTEXT.createCanvasWorkbenchControlContext({
            controlSource: CONTROL_CONTEXT_SOURCE
        })
        : {};
    const {
        CANVAS_MODE_CONTROLLER,
        setMode,
        renderMode,
        CANVAS_ACTION_CONTROLLER,
        handleCanvasAction,
        CANVAS_CLICK_CONTROLLER,
        onCanvasWorkbenchClick
    } = CANVAS_CONTROL_CONTEXT;
    const PROJECT_CONTEXT_SOURCE = {
        mutationSource: {
            getProject: () => project,
            getDefaultProjectSettings: () => DEFAULT_SETTINGS,
            getCurrentUiLanguage: () => runtimeUiLang(),
            translate: (...args) => t(...args),
            sanitizeStoragePart,
            defaultNodeSize,
            cloneRunValue,
            getDefaultProjectId: () => PROJECT_ID,
            getStorageScopeFromStore: typeof projectStoreGetStorageScope === 'function'
                ? () => projectStoreGetStorageScope()
                : null,
            getStorageKeyFromStore: typeof projectStoreGetStorageKey === 'function'
                ? scope => projectStoreGetStorageKey(scope)
                : null,
            getCanvasTitleFromStore: typeof projectStoreGetCanvasTitle === 'function'
                ? () => projectStoreGetCanvasTitle()
                : null,
            nowIso: () => nowIso(),
            loadProjectFromStore: typeof projectStoreLoadProject === 'function'
                ? (key, scope) => projectStoreLoadProject(key, scope, projectStoreOptions())
                : null,
            sanitizeProjectFromStore: typeof projectStoreSanitizeProject === 'function'
                ? raw => projectStoreSanitizeProject(raw, projectStoreOptions())
                : null,
            createDefaultProjectFromStore: typeof projectStoreCreateDefaultProject === 'function'
                ? () => projectStoreCreateDefaultProject(projectStoreOptions())
                : null,
            buildProjectDefaultPatch: (...args) => buildProjectDefaultPatch(...args),
            buildNodeLayoutPatch: (...args) => buildNodeLayoutPatch(...args),
            buildGroupIdPatch: (...args) => buildGroupIdPatch(...args),
            buildGroupFieldPatch: (...args) => buildGroupFieldPatch(...args),
            buildProjectUpdatedAtPatch: (...args) => buildProjectUpdatedAtPatch(...args),
            buildProjectMetadataPatch: (...args) => buildProjectMetadataPatch(...args),
            buildProjectCollectionsPatch: (...args) => buildProjectCollectionsPatch(...args),
            buildProjectNodesPatch: (...args) => buildProjectNodesPatch(...args),
            buildProjectRunsPatch: (...args) => buildProjectRunsPatch(...args),
            buildProjectStorageInfoPatch: (...args) => buildProjectStorageInfoPatch(...args),
            buildProjectStoragePatch: (...args) => buildProjectStoragePatch(...args),
            buildProjectSettingsPatch: (...args) => buildProjectSettingsPatch(...args),
            buildCompareStatePatch: (...args) => compareNodeBuildStatePatch(...args),
            buildBatchAnyStatePatch: (...args) => buildBatchAnyStatePatch(...args),
            buildBatchAnyLegacyTypePatch: (...args) => buildBatchAnyLegacyTypePatch(...args),
            buildTextMergeStatePatch: (...args) => buildTextMergeStatePatch(...args),
            buildNoteStatePatch: (...args) => buildNoteStatePatch(...args),
            buildBatchJobStatePatch: (...args) => buildBatchJobStatePatch(...args),
            buildProjectNodeStoragePatch: (...args) => buildProjectNodeStoragePatch(...args),
            buildRunStoragePatch: (...args) => buildRunStoragePatch(...args),
            buildVlmChatStoragePatch: (...args) => buildVlmChatStoragePatch(...args),
            buildProjectGroupsPatch: (...args) => buildProjectGroupsPatch(...args),
            buildProjectEdgeAppendPatch: (...args) => buildProjectEdgeAppendPatch(...args),
            buildProjectEdgeFilterPatch: (...args) => buildProjectEdgeFilterPatch(...args),
            buildProjectSchedulerPatch: (...args) => buildProjectSchedulerPatch(...args),
            buildProjectViewportPatch: (...args) => buildProjectViewportPatch(...args),
        },
        persistenceSource: {
            languageSource: {
                t
            },
            projectSource: {
                getProject: () => project,
                setProject: (value) => { project = value; },
                getDefaultProjectId: () => PROJECT_ID,
                getBackendLoadedStorageKey: () => backendLoadedStorageKey,
                setBackendLoadedStorageKey: (value) => { backendLoadedStorageKey = value; },
                isProjectEmpty,
                sanitizeProject,
                createDefaultProject,
                loadProject
            },
            storageSource: {
                getStorage: () => localStorage,
                getStorageScope: () => getStorageScope(),
                getCurrentStorageScope: () => storageScope,
                getStorageKey: (scope) => getStorageKey(scope),
                getStorageBaseKey: () => storageBaseKey,
                setStorageScope: (value) => { storageScope = value; },
                setStorageBaseKey: (value) => { storageBaseKey = value; },
                setStorageKey: (value) => { storageKey = value; },
                sanitizeStoragePart
            },
            patchSource: {
                buildProjectUpdatedAtPatch: (...args) => buildProjectUpdatedAtPatch(...args),
                buildProjectStorageInfoPatch: (key, scope, options) => buildProjectStorageInfoPatch(key, scope, options),
                buildProjectStoragePatch: (...args) => buildProjectStoragePatch(...args),
                projectStoreBuildProjectStorageInfo: (key, scope, migrated) => typeof projectStoreBuildProjectStorageInfo === 'function'
                    ? projectStoreBuildProjectStorageInfo(key, scope, migrated, {
                        buildProjectStorageInfoPatch: (...args) => buildProjectStorageInfoPatch(...args)
                    })
                    : null
            },
            serializationSource: {
                projectStoreCompactProjectForStorage: typeof projectStoreCompactProjectForStorage === 'function'
                    ? (...args) => projectStoreCompactProjectForStorage(...args)
                    : null,
                cloneRunValue: (...args) => cloneRunValue(...args),
                buildVlmChatStoragePatch: (...args) => buildVlmChatStoragePatch(...args)
            },
            backendSource: {
                sendCanvasProjectSaveRequest,
                sendCanvasProjectLoadRequest
            },
            assetSource: {
                materializeInlineProjectAssets: (...args) => materializeInlineProjectAssets(...args),
                syncCanvasProjectAssetRoot: (...args) => syncCanvasProjectAssetRoot(...args),
                setCanvasProjectAssetRoot: (...args) => setCanvasProjectAssetRoot(...args)
            },
            selectionSource: {
                resetSelectionState: () => CANVAS_SELECTION_CONTROLLER.resetSelectionState()
            },
            historySource: {
                resetHistory
            },
            renderSource: {
                resetRenderedProjectDomCache,
                renderAll,
                resetGalleryFrostReveals: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.resetGalleryFrostReveals(...args),
                invalidateMinimapStaticCache,
                invalidateNodeSpatialIndex
            },
            domSource: {
                getRoot: () => root
            },
            modelSource: {
                scheduleAutoPresetModelChecks
            },
            uiSource: {
                renderStatus,
                showToast,
                warn: (...args) => console.warn(...args)
            },
            interactionSource: {
                hasActivePointerInteraction: () => hasActivePointerInteraction(),
                getSuppressWheelUntil: () => suppressWheelUntil
            },
            runtimeSource: {
                setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined,
                clearTimeout: (...args) => typeof window.clearTimeout === 'function' ? window.clearTimeout(...args) : undefined
            },
            timeSource: {
                nowIso,
                parseDate: (value) => Date.parse(value || ''),
                performanceNow: () => canvasPerformanceNow()
            }
        },
        assetsSource: {
            projectSource: {
                getProject: () => project,
                getNode: (...args) => getNode(...args),
                setProject: (value) => { project = value; },
                getProjectId: () => project?.id || PROJECT_ID
            },
            patchSource: {
                buildProjectStoragePatch: (...args) => buildProjectStoragePatch(...args),
                buildMaterializedAsset: (...args) => buildMaterializedAsset(...args),
                buildResultMaterializationPatch: (...args) => buildResultMaterializationPatch(...args),
                buildMediaNodeStatePatch: (...args) => buildMediaNodeStatePatch(...args),
                buildMediaNodeSourcePatch: (...args) => buildMediaNodeSourcePatch(...args),
                buildBatchAnyItemStatePatch: (...args) => buildBatchAnyItemStatePatch(...args)
            },
            storageSource: {
                getStorageScope: () => storageScope,
                getStorageKey: (scope) => getStorageKey(scope)
            },
            assetSource: {
                sendCanvasListAssetsRequest,
                sendCanvasMaterializeAssetRequest: (...args) => sendCanvasMaterializeAssetRequest(...args),
                assetDisplaySrc
            },
            serializationSource: {
                serializeAssetSourceForRun: (...args) => serializeAssetSourceForRun(...args),
                serializeAssetForRun: (...args) => serializeAssetForRun(...args)
            },
            batchSource: {
                batchAnyMediaKind: (...args) => batchAnyMediaKind(...args),
                applyBatchAnyStatePatch: (...args) => applyBatchAnyStatePatch(...args)
            },
            selectionSource: {
                getSelectedNodeId: () => selectedNodeId
            },
            timeSource: {
                nowIso: (...args) => nowIso(...args)
            },
            viewerSource: {
                syncPresetSpecialViewersForAssetNode: (...args) => syncPresetSpecialViewersForAssetNode(...args)
            },
            persistenceSource: {},
            domSource: {
                getRoot: () => root
            },
            renderSource: {
                renderAll,
                invalidateRenderedNode: (...args) => invalidateRenderedNode(...args)
            },
            uiSource: {
                warn: (...args) => console.warn(...args)
            }
        },
        actionsSource: {
            languageSource: {
                t
            },
            documentSource: {
                getDocument: () => document
            },
            storageSource: {
                getStorage: () => localStorage,
                getStorageScope: () => getStorageScope(),
                getStorageKey: (scope) => getStorageKey(scope),
                getStorageBaseKey: () => storageBaseKey,
                getLegacyStorageKey: () => LEGACY_STORAGE_KEY,
                browserCacheProjectIndex: (...args) => browserCacheProjectIndex(...args),
                browserCacheActiveProjectIdKey: (...args) => browserCacheActiveProjectIdKey(...args),
                browserCacheProjectIndexKey: (...args) => browserCacheProjectIndexKey(...args),
                browserCacheProjectScope: (...args) => browserCacheProjectScope(...args),
                setActiveBrowserCacheProject: (...args) => setActiveBrowserCacheProject(...args)
            },
            projectSource: {
                getCurrentProject: () => project,
                getCurrentProjectId: () => project.id || PROJECT_ID,
                getDefaultProjectId: () => PROJECT_ID,
                getDefaultSettings: () => DEFAULT_SETTINGS,
                isProjectEmpty,
                ensureProjectGroups,
                sanitizeStoragePart,
                sanitizeProject,
                createDefaultProject,
                setProject: (value) => { project = value; },
                setBackendLoadedStorageKey: (value) => { backendLoadedStorageKey = value; },
                getBackendLoadedStorageKey: () => backendLoadedStorageKey,
                loadProject
            },
            patchSource: {
                buildProjectCanvasClearPatch: (...args) => buildProjectCanvasClearPatch(...args),
                buildProjectIdentityPatch: (...args) => buildProjectIdentityPatch(...args),
                buildProjectSettingsPatch: (...args) => buildProjectSettingsPatch(...args),
                buildProjectSettingsMergePatch: (...args) => buildProjectSettingsMergePatch(...args),
                buildProjectDemoPatch: (...args) => buildProjectDemoPatch(...args),
                buildProjectStoragePatch: (...args) => buildProjectStoragePatch(...args)
            },
            persistenceSource: {},
            assetSource: {},
            selectionSource: {
                resetSelectionState: () => CANVAS_SELECTION_CONTROLLER.resetSelectionState(),
                getSelectionState: () => ({
                    selectedNodeId,
                    selectedNodeIds: new Set(selectedNodeIds),
                    selectedEdgeId,
                    selectedGroupId
                }),
                setSelectionState: (state) => {
                    const next = state || {};
                    selectedNodeId = next.selectedNodeId || null;
                    selectedNodeIds = next.selectedNodeIds instanceof Set
                        ? new Set(next.selectedNodeIds)
                        : new Set(Array.isArray(next.selectedNodeIds) ? next.selectedNodeIds : []);
                    selectedEdgeId = next.selectedEdgeId || null;
                    selectedGroupId = next.selectedGroupId || null;
                }
            },
            historySource: {
                resetHistory,
                pushHistory
            },
            renderSource: {
                resetRenderedProjectDomCache,
                renderAll,
                resetGalleryFrostReveals: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.resetGalleryFrostReveals(...args),
                renderStatus
            },
            runtimeSource: {
                mutate,
                interruptDeletedResultRuns,
                stopTimelinePlayback
            },
            dialogSource: {
                confirm: (message) => window.confirm(message),
                prompt: (...args) => window.prompt(...args)
            },
            requestSource: {
                sendCanvasProjectClearRequest,
                readFileAsText
            },
            uiSource: {
                warn: (...args) => console.warn(...args),
                showToast
            },
            timeSource: {
                now: () => canvasNow(),
                nowIso
            }
        }
    };
    const CANVAS_PROJECT_CONTEXT = typeof WORKBENCH_CANVAS_PROJECT_CONTEXT.createCanvasWorkbenchProjectContext === 'function'
        ? WORKBENCH_CANVAS_PROJECT_CONTEXT.createCanvasWorkbenchProjectContext({
            projectSource: PROJECT_CONTEXT_SOURCE
        })
        : {};
    projectPersistenceRuntime = CANVAS_PROJECT_CONTEXT;
    const {
        syncProjectLanguage: syncProjectLanguageFromProjectContext,
        getStorageScope: getStorageScopeFromProjectContext,
        getStorageKey: getStorageKeyFromProjectContext,
        getCanvasTitle: getCanvasTitleFromProjectContext,
        projectStoreOptions: projectStoreOptionsFromProjectContext,
        createDefaultProject: createDefaultProjectFromProjectContext,
        sanitizeProject: sanitizeProjectFromProjectContext,
        isProjectEmpty: isProjectEmptyFromProjectContext,
        loadProject: loadProjectFromProjectContext,
        createDemoWorkbenchProject: createDemoWorkbenchProjectFromProjectContext,
        ensureInitialDemoProject: ensureInitialDemoProjectFromProjectContext,
        ensureProjectGroups: ensureProjectGroupsFromProjectContext,
        getGroup: getGroupFromProjectContext,
        appendProjectEdge: appendProjectEdgeFromProjectContext,
        filterProjectEdges: filterProjectEdgesFromProjectContext,
        applyProjectSchedulerPatch: applyProjectSchedulerPatchFromProjectContext,
        applyProjectViewportPatch: applyProjectViewportPatchFromProjectContext,
        CANVAS_PROJECT_PERSISTENCE_CONTROLLER,
        browserBackendProjectDecision,
        browserCacheActiveProjectIdKey,
        browserCacheProjectIndexKey,
        browserCacheProjectScope,
        browserCacheProjectIndex,
        setActiveBrowserCacheProject,
        initialBrowserStorageKey,
        saveProject,
        saveProjectToBrowserCache,
        buildProjectStorageInfo,
        compactProjectForStorage: compactProjectForStorageFromPersistenceController,
        storageDisplayLocation: storageDisplayLocationFromPersistenceController,
        storageDisplayPath: storageDisplayPathFromPersistenceController,
        syncStorageScope,
        loadProjectFromBackend,
        CANVAS_PROJECT_ASSETS_CONTROLLER,
        inferChatImageRelativePath,
        safeVlmChatAssetThumb,
        safeAssetFallbackSrc,
        safeAssetDisplaySrc,
        safeAssetFullDisplaySrc,
        setCanvasProjectAssetRoot,
        syncCanvasProjectAssetRoot,
        syncCanvasProjectAssetRootFromAsset,
        syncCanvasProjectAssetRootFromAssets,
        normalizeProjectAssetReferences,
        refreshCanvasProjectAssetRoot,
        refreshCanvasProjectFromBackendOnOpen,
        materializeInlineProjectAssets,
        CANVAS_PROJECT_ACTIONS_CONTROLLER,
        clearBrowserCache,
        clearProjectFileWithConfirm,
        loadDemoWorkbenchWithConfirm,
        clearCanvasWithConfirm,
        openProjectJsonPicker,
        switchProjectWithPrompt,
        switchProjectById,
        handleProjectDeleted,
        importWorkbenchProjectFromFile
    } = CANVAS_PROJECT_CONTEXT;
    const PRESET_SPECIAL_VIEWER_CONTEXT_SOURCE = {
        domSource: {
            getDocument: () => typeof document !== 'undefined' ? document : null,
            getRoot: () => root,
            getNodesLayer: () => nodesLayer
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            getProject: () => project,
            getVisibleClassicUploadSlots: (...args) => getVisibleClassicUploadSlots(...args),
            getVisibleUploadSlots: (...args) => getVisibleUploadSlots(...args),
            isNodeLocked: (...args) => isNodeLocked(...args)
        },
        stateSource: {
            getPresetSpecialControllerKind: (...args) => getPresetSpecialControllerKind(...args),
            normalizePresetSpecialState: (...args) => normalizePresetSpecialState(...args),
            presetSpecialControllerState: (...args) => presetSpecialControllerState(...args),
            presetSpecialPromptFromState: (...args) => presetSpecialPromptFromState(...args)
        },
        patchSource: {
            buildPresetSpecialControllerStatePatch: (...args) => buildPresetSpecialControllerStatePatch(...args),
            buildNodeParamsPatch: (...args) => buildNodeParamsPatch(...args)
        },
        renderSource: {
            nodeRenderKey: (...args) => nodeRenderKey(...args),
            notConnectedText: (...args) => notConnectedText(...args)
        },
        persistenceSource: {
            nowIso: (...args) => nowIso(...args),
            scheduleSave: (...args) => scheduleSave(...args)
        },
        timingSource: {
            setTimeout: (...args) => window.setTimeout(...args)
        },
        utilitySource: {
            cssEscape: (...args) => cssEscape(...args)
        }
    };
    const PRESET_SPECIAL_VIEWER_CONTROLLER = typeof WORKBENCH_CANVAS_PRESET_SPECIAL_VIEWER.createCanvasPresetSpecialViewerController === 'function'
        ? WORKBENCH_CANVAS_PRESET_SPECIAL_VIEWER.createCanvasPresetSpecialViewerController({
            presetSpecialViewerSource: PRESET_SPECIAL_VIEWER_CONTEXT_SOURCE
        })
        : {};
    const bindPresetSpecialViewerEvents = (...args) => PRESET_SPECIAL_VIEWER_CONTROLLER.bindPresetSpecialViewerEvents?.(...args);
    const findPresetSpecialIframeByWindow = (...args) => PRESET_SPECIAL_VIEWER_CONTROLLER.findPresetSpecialIframeByWindow?.(...args) || null;
    const syncPresetSpecialViewerIframe = (...args) => PRESET_SPECIAL_VIEWER_CONTROLLER.syncPresetSpecialViewerIframe?.(...args);
    const handlePresetSpecialViewerMessage = (...args) => PRESET_SPECIAL_VIEWER_CONTROLLER.handlePresetSpecialViewerMessage?.(...args);
    const MEDIA_SEEK_CONTEXT_SOURCE = {
        domSource: {
            getDocument: () => typeof document !== 'undefined' ? document : null,
            getNodesLayer: () => nodesLayer
        },
        nodeSource: {
            getNode: (id) => getNode(id)
        },
        assetSource: {
            safeAssetDisplaySrc: (...args) => safeAssetDisplaySrc(...args),
            inferChatImageRelativePath: (...args) => inferChatImageRelativePath(...args)
        },
        mediaSource: {
            getMediaEditRange: (...args) => getMediaEditRange(...args)
        },
        timingSource: {
            setTimeout: (...args) => window.setTimeout(...args),
            clearTimeout: (...args) => window.clearTimeout(...args)
        },
        utilitySource: {
            cssEscape: (...args) => cssEscape(...args)
        }
    };
    const MEDIA_SEEK_CONTROLLER = typeof WORKBENCH_CANVAS_MEDIA_SEEK.createCanvasMediaSeekController === 'function'
        ? WORKBENCH_CANVAS_MEDIA_SEEK.createCanvasMediaSeekController({
            mediaSeekSource: MEDIA_SEEK_CONTEXT_SOURCE
        })
        : {};
    const showVideoScrubPreview = (...args) => MEDIA_SEEK_CONTROLLER.showVideoScrubPreview?.(...args);
    const hideVideoScrubPreview = (...args) => MEDIA_SEEK_CONTROLLER.hideVideoScrubPreview?.(...args);
    const seekNodeMediaPlayer = (...args) => MEDIA_SEEK_CONTROLLER.seekNodeMediaPlayer?.(...args);
    const normalizeVideoSeekTarget = (...args) => MEDIA_SEEK_CONTROLLER.normalizeVideoSeekTarget?.(...args) ?? args[1];
    const MEDIA_EDIT_CONTEXT_SOURCE = {
        fileSource: MEDIA_HELPERS_CONTEXT,
        transferSource: {
            getTransferStation: () => window.SimpAITransferStation
        },
        timeSource: {
            nowIso: (...args) => nowIso(...args)
        },
        layoutSource: {
            fitImageNodeToAssetBounds: (...args) => fitImageNodeToAssetBounds(...args)
        },
        storageSource: {
            materializeNodeAssetForStorage: (...args) => materializeNodeAssetForStorage(...args)
        },
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: {
            showToast: (...args) => showToast(...args),
            warn: (...args) => console.warn(...args)
        },
        domSource: {
            getDocument: () => typeof document !== 'undefined' ? document : null,
            getRoot: () => root,
            getNodesLayer: () => nodesLayer,
            getInspector: () => inspector
        },
        stateSource: {
            getSelectedNodeId: () => selectedNodeId,
            selectReplacedNode: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(nodeId)
        },
        nodeSource: {
            getNode: (id) => getNode(id),
            isNodeLocked: (...args) => isNodeLocked(...args)
        },
        assetSource: {
            getMediaEditRange: (...args) => getMediaEditRange(...args),
            formatDuration: (...args) => formatAssetDuration(...args),
            buildImageOutputAsset: (...args) => buildImageOutputAsset(...args),
            buildMaskAsset: (...args) => buildMaskAsset(...args),
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
            assetMediaKind: (...args) => assetMediaKind(...args),
            assetDisplaySrc: (...args) => assetDisplaySrc(...args),
            getNodeImageSrc: (...args) => getNodeImageSrc(...args)
        },
        patchSource: {
            buildMediaTrimAsset: (...args) => buildMediaTrimAsset(...args),
            buildMediaNodeStatePatch: (...args) => buildMediaNodeStatePatch(...args),
            buildBrowserImageAsset: (...args) => buildBrowserImageAsset(...args),
            buildBrowserMediaAsset: (...args) => buildBrowserMediaAsset(...args),
            buildMediaNodeSourcePatch: (...args) => buildMediaNodeSourcePatch(...args),
            buildMaskStatePatch: (...args) => buildMaskStatePatch(...args),
            buildWd14StatePatch: (...args) => buildWd14StatePatch(...args),
            buildVlmImageInputsPatch: (...args) => buildVlmImageInputsPatch(...args),
            buildResultAssetPatch: (...args) => buildResultAssetPatch(...args),
            buildResultLayoutPatch: (...args) => buildResultLayoutPatch(...args),
            buildResultManualReplacementPatch: (...args) => buildResultManualReplacementPatch(...args),
            buildResultStatusPatch: (...args) => buildResultStatusPatch(...args),
            mergeCanvasRunStatus: (...args) => mergeCanvasRunStatus(...args)
        },
        historySource: {
            pushHistory: (...args) => pushHistory(...args),
            pushHistoryBatch: (...args) => pushHistoryBatch(...args)
        },
        mediaSource: {
            createImageNodeFromAsset: (...args) => createImageNodeFromAsset(...args),
            showVideoScrubPreview: (...args) => showVideoScrubPreview(...args),
            hideVideoScrubPreview: (...args) => hideVideoScrubPreview(...args),
            seekNodeMediaPlayer: (...args) => seekNodeMediaPlayer(...args),
            pickLocalVideoFile: (...args) => pickLocalVideoFile(...args),
            pickLocalAudioFile: (...args) => pickLocalAudioFile(...args)
        },
        editorSource: {
            ensureWorkbenchLazyRuntime: (...args) => ensureWorkbenchLazyRuntime(...args),
            getCanvasSketchAdapter: () => getCanvasSketchAdapter(),
            getLayerForgeAdapter: () => window.SimpAILayerForgeAdapter || null
        },
        edgeSource: {
            getProject: () => project,
            canNodeConnectToUploadSlot: (...args) => canNodeConnectToUploadSlot(...args),
            applyPresetUploadSlotPatch: (...args) => applyPresetUploadSlotPatch(...args),
            filterProjectEdges: (...args) => filterProjectEdges(...args)
        },
        renderSource: {
            scheduleSave: (...args) => scheduleSave(...args),
            mutate: (...args) => mutate(...args),
            invalidateRenderedNode: (...args) => invalidateRenderedNode(...args)
        },
        viewerSource: {
            openMediaViewer: (...args) => openMediaViewer(...args),
            openNodeMediaFullscreen: (...args) => openNodeMediaFullscreen(...args),
            syncPresetSpecialViewersForAssetNode: (...args) => syncPresetSpecialViewersForAssetNode(...args)
        },
        utilitySource: {
            clamp: (...args) => clamp(...args),
            escapeHtml: (...args) => escapeHtml(...args),
            cssEscape: (...args) => cssEscape(...args),
            detectWorkbenchTheme: (...args) => detectWorkbenchTheme(...args)
        }
    };
    const MEDIA_EDIT_CONTROLLER = typeof WORKBENCH_CANVAS_MEDIA_EDIT.createCanvasMediaEditController === 'function'
        ? WORKBENCH_CANVAS_MEDIA_EDIT.createCanvasMediaEditController({
            mediaEditSource: MEDIA_EDIT_CONTEXT_SOURCE
        })
        : {};
    const updateMediaTrim = (...args) => MEDIA_EDIT_CONTROLLER.updateMediaTrim?.(...args);
    const handleNodeMediaEditEvent = (...args) => MEDIA_EDIT_CONTROLLER.handleNodeMediaEditEvent?.(...args) || false;
    const bindInspectorMediaEvents = (...args) => MEDIA_EDIT_CONTROLLER.bindInspectorMediaEvents?.(...args) || false;
    const resetMediaTrim = (...args) => MEDIA_EDIT_CONTROLLER.resetMediaTrim?.(...args);
    const refreshMediaTrimUi = (...args) => MEDIA_EDIT_CONTROLLER.refreshMediaTrimUi?.(...args);
    const mediaDerivedInfoHtml = (...args) => MEDIA_EDIT_CONTROLLER.mediaDerivedInfoHtml?.(...args) || '';
    const reloadMediaNode = (...args) => MEDIA_EDIT_CONTROLLER.reloadMediaNode?.(...args);
    const playMediaSelection = (...args) => MEDIA_EDIT_CONTROLLER.playMediaSelection?.(...args);
    const RESULT_ASSET_CONTEXT_SOURCE = {
        resultSource: {
            buildResultAssetPatch: (...args) => buildResultAssetPatch(...args),
            buildResultAssetSelectionPatch: (...args) => buildResultAssetSelectionPatch(...args)
        },
        serializationSource: {
            cloneRunValue: (...args) => cloneRunValue(...args)
        },
        utilitySource: {
            clamp: (...args) => clamp(...args)
        },
        uiSource: { mutate }
    };
    const CANVAS_RESULT_ASSET_CONTROLLER = typeof WORKBENCH_CANVAS_RESULT_ASSET.createCanvasResultAssetController === 'function'
        ? WORKBENCH_CANVAS_RESULT_ASSET.createCanvasResultAssetController({
            resultAssetSource: RESULT_ASSET_CONTEXT_SOURCE
        })
        : {};
    const getSelectedResultAsset = (...args) => CANVAS_RESULT_ASSET_CONTROLLER.getSelectedResultAsset?.(...args) || null;
    if (typeof WORKBENCH_CANVAS_MEDIA_PLAYBACK.createCanvasMediaPlaybackController !== 'function') {
        throw new Error('Infinite Canvas media playback controller is not loaded.');
    }
    const CANVAS_MEDIA_PLAYBACK_CONTROLLER = WORKBENCH_CANVAS_MEDIA_PLAYBACK.createCanvasMediaPlaybackController({
        mediaPlaybackSource: {
            domSource: { getNodesLayer: () => nodesLayer },
            nodeSource: {
                getNode: (...args) => getNode(...args),
                isNodeLocked: (...args) => isNodeLocked(...args)
            },
            resultAssetSource: { getSelectedResultAsset: (...args) => getSelectedResultAsset(...args) },
            patchSource: {
                buildResultSelectedAssetMetadataPatch: (...args) => buildResultSelectedAssetMetadataPatch(...args),
                buildMediaNodeStatePatch: (...args) => buildMediaNodeStatePatch(...args)
            },
            assetSource: { getMediaEditRange: (...args) => getMediaEditRange(...args) },
            utilitySource: {
                clamp: (...args) => clamp(...args),
                cssEscape: (...args) => cssEscape(...args)
            },
            storageSource: { saveProjectToBrowserCache: (...args) => saveProjectToBrowserCache(...args) },
            renderSource: {
                renderEdges: (...args) => renderEdges(...args),
                renderMinimap: (...args) => renderMinimap(...args)
            },
            mediaSource: { seekNodeMediaPlayer: (...args) => seekNodeMediaPlayer(...args) },
            interactionSource: {
                isPickingCanvasAgentReference: () => !!canvasAgentState.pickReference,
                addCanvasAgentReferenceFromNode: (...args) => addCanvasAgentReferenceFromNode(...args),
                finishCanvasAgentReferencePick: () => { canvasAgentState.pickReference = false; },
                renderCanvasAgentPanel: (...args) => renderCanvasAgentPanel(...args),
                selectNodeFromMediaControl: (nodeId) => {
                    CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(nodeId);
                    renderAll();
                    positionCanvasAgentPanel();
                }
            }
        }
    });
    const DIRECTOR_PRESET_VALIDATION_CONTEXT_SOURCE = {
        projectSource: { getProject: () => project },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isDirectorTimelineNode: (...args) => isDirectorTimelineNode(...args),
            isNodeIgnored: (...args) => isNodeIgnored(...args)
        },
        presetSource: {
            getPresetSchema: (...args) => getPresetSchema(...args),
            getPresetTheme: (...args) => getPresetTheme(...args),
            getPresetThemeInfo: (...args) => getPresetThemeInfo(...args)
        },
        payloadSource: {
            directorTimelinePromptOverrideForTimeline,
            directorTimelinePayload: (...args) => directorTimelinePayload(...args)
        },
        referenceSource: {
            previousSegmentVideoRef: () => directorPreviousSegmentVideoRef,
            previousSegmentImageRef: () => directorPreviousSegmentImageRef
        },
        serializationSource: { cloneRunValue: (...args) => cloneRunValue(...args) },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER = typeof WORKBENCH_CANVAS_DIRECTOR_PRESET_VALIDATION.createCanvasDirectorPresetValidationController === 'function'
        ? WORKBENCH_CANVAS_DIRECTOR_PRESET_VALIDATION.createCanvasDirectorPresetValidationController({
            directorPresetValidationSource: DIRECTOR_PRESET_VALIDATION_CONTEXT_SOURCE
        })
        : {};
    const DIRECTOR_SEGMENT_PAYLOAD_CONTEXT_SOURCE = {
        assetSource: {
            serializeAssetSourceForRun: (...args) => serializeAssetSourceForRun(...args),
            directorMediaSourceHasAsset: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorMediaSourceHasAsset?.(...args) || false
        },
        capabilitySource: { resolveDirectorCapabilityForPreset: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.resolveDirectorCapabilityForPreset?.(...args) || {} },
        referenceSource: {
            imageRefUploadSlots: () => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.imageRefUploadSlots?.() || [],
            previousSegmentVideoRef: () => DIRECTOR_PREVIOUS_SEGMENT_VIDEO_REF,
            previousSegmentImageRef: () => DIRECTOR_PREVIOUS_SEGMENT_IMAGE_REF
        },
        segmentSource: {
            directorSegmentMediaRefs: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentMediaRefs?.(...args) || [],
            directorSegmentFirstMediaRef: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentFirstMediaRef?.(...args) || '',
            directorSegmentPrompt: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentPrompt?.(...args) || '',
            directorSegmentSeconds: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentSeconds?.(...args) ?? 0,
            directorSegmentGenerationSeconds: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentGenerationSeconds?.(...args) ?? 0,
            directorSegmentDurationBounds: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentDurationBounds?.(...args) || [0, Infinity],
            directorDurationStrategyValue: (...args) => directorDurationStrategyValue(...args),
            directorDurationParamValue: (...args) => directorDurationParamValue(...args),
            directorAudioOutputValue: (...args) => directorAudioOutputValue(...args)
        },
        serializationSource: { cloneRunValue: (...args) => cloneRunValue(...args) }
    };
    if (typeof WORKBENCH_CANVAS_DIRECTOR_SEGMENT_PAYLOAD.createCanvasDirectorSegmentPayloadController !== 'function') {
        throw new Error('Required Infinite Canvas module failed to load: canvas_director_segment_payload_controller.js');
    }
    CANVAS_DIRECTOR_SEGMENT_PAYLOAD_CONTROLLER = WORKBENCH_CANVAS_DIRECTOR_SEGMENT_PAYLOAD.createCanvasDirectorSegmentPayloadController({
        directorSegmentPayloadSource: DIRECTOR_SEGMENT_PAYLOAD_CONTEXT_SOURCE
    });
    const DIRECTOR_SEGMENT_TIMELINE_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project,
            buildProjectNodeAppendPatch: (...args) => buildProjectNodeAppendPatch(...args),
            filterProjectEdges: (...args) => filterProjectEdges(...args)
        },
        nodeSource: { getNode: (...args) => getNode(...args) },
        resultSource: {
            buildDirectorSegmentResultNode: (...args) => buildDirectorSegmentResultNode(...args),
            buildCanvasRunStatus: (...args) => buildCanvasRunStatus(...args)
        },
        layoutSource: {
            presetResultBasePosition: (...args) => presetResultBasePosition(...args),
            defaultResultNodeSize: (...args) => defaultResultNodeSize(...args),
            placeNodeAvoidingOverlap: (...args) => placeNodeAvoidingOverlap(...args)
        },
        factorySource: {
            timelineBuildSourcePatch: (...args) => timelineBuildSourcePatch(...args),
            timelineBuildClipPatch: (...args) => timelineBuildClipPatch(...args),
            timelineBuildParamsPatch: (...args) => timelineBuildParamsPatch(...args)
        },
        edgeSource: { ensureGenerateEdge: (...args) => ensureGenerateEdge(...args) },
        timelineSource: {
            addTimelineNode: (...args) => addTimelineNode(...args),
            addTimelineClipFromSource: (...args) => addTimelineClipFromSource(...args),
            timelineNormalizeNode: (...args) => typeof timelineNormalizeNode === 'function' ? timelineNormalizeNode(...args) : undefined
        },
        segmentSource: { directorSegmentTimelineSeconds: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentTimelineSeconds?.(...args) ?? 0 },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    if (typeof WORKBENCH_CANVAS_DIRECTOR_SEGMENT_TIMELINE.createCanvasDirectorSegmentTimelineController !== 'function') {
        throw new Error('Required Infinite Canvas module failed to load: canvas_director_segment_timeline_controller.js');
    }
    CANVAS_DIRECTOR_SEGMENT_TIMELINE_CONTROLLER = WORKBENCH_CANVAS_DIRECTOR_SEGMENT_TIMELINE.createCanvasDirectorSegmentTimelineController({
        directorSegmentTimelineSource: DIRECTOR_SEGMENT_TIMELINE_CONTEXT_SOURCE
    });
    const DIRECTOR_SEGMENT_PROMPT_PREFLIGHT_CONTEXT_SOURCE = {
        targetSource: {
            canvasAgentPromptTargetFromNode: (...args) => canvasAgentPromptTargetFromNode(...args)
        },
        promptSource: {
            ensureCanvasAgentPromptPreflightAllows: (...args) => ensureCanvasAgentPromptPreflightAllows(...args)
        },
        wildcardSource: {
            buildWildcardPreviewForNode: (...args) => buildWildcardPreviewForNode(...args)
        },
        presetSource: {
            getPresetCatalogEntryForNode: (...args) => getPresetCatalogEntryForNode(...args),
            canvasAgentPresetPromptDefaults: (...args) => canvasAgentPresetPromptDefaults(...args)
        },
        segmentSource: {
            directorSegmentMediaRefs: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentMediaRefs?.(...args) || [],
            directorSegmentFirstMediaRef: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentFirstMediaRef?.(...args) || '',
            directorSegmentGenerationSeconds: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentGenerationSeconds?.(...args) ?? 0,
            directorSegmentPrompt: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentPrompt?.(...args) || ''
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    if (typeof WORKBENCH_CANVAS_DIRECTOR_SEGMENT_PROMPT_PREFLIGHT.createCanvasDirectorSegmentPromptPreflightController !== 'function') {
        throw new Error('Required Infinite Canvas module failed to load: canvas_director_segment_prompt_preflight_controller.js');
    }
    CANVAS_DIRECTOR_SEGMENT_PROMPT_PREFLIGHT_CONTROLLER = WORKBENCH_CANVAS_DIRECTOR_SEGMENT_PROMPT_PREFLIGHT.createCanvasDirectorSegmentPromptPreflightController({
        directorSegmentPromptPreflightSource: DIRECTOR_SEGMENT_PROMPT_PREFLIGHT_CONTEXT_SOURCE
    });
    const PRESET_RUN_SERIALIZATION_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isNodeIgnored: (...args) => isNodeIgnored(...args),
            isTextOutputNode: (...args) => isTextOutputNode(...args),
            getNodeTextOutput: (...args) => getNodeTextOutput(...args),
            isDirectorTimelineNode: (...args) => isDirectorTimelineNode(...args)
        },
        slotSource: {
            canvasAgentUploadSlotsForNode: (...args) => canvasAgentUploadSlotsForNode(...args),
            canNodeConnectToUploadSlot: (...args) => canNodeConnectToUploadSlot(...args)
        },
        presetSource: {
            getPresetCatalogEntryForNode: (...args) => getPresetCatalogEntryForNode(...args),
            clonePresetWithPromptDefaults: (...args) => clonePresetWithPromptDefaults(...args),
            getPresetSpecialControllerKind: (...args) => getPresetSpecialControllerKind(...args),
            presetSpecialControllerState: (...args) => presetSpecialControllerState(...args),
            presetSpecialPromptFromState: (...args) => presetSpecialPromptFromState(...args),
            isResolutionOwnedPresetParam: (...args) => isResolutionOwnedPresetParam(...args),
            canvasAgentPresetPromptDefaults: (...args) => canvasAgentPresetPromptDefaults(...args)
        },
        classicSource: {
            getClassicIpCount: (...args) => getClassicIpCount(...args),
            getClassicIpTypes: (...args) => getClassicIpTypes(...args),
            getClassicIpMaxImages: (...args) => getClassicIpMaxImages(...args),
            getClassicIpControlTypes: (...args) => registryClassicIpControlTypes || ['ImagePrompt'],
            getClassicOutpaintDirs: (...args) => registryClassicOutpaintDirs || [],
            normalizeClassicInpaintMode: (...args) => normalizeClassicInpaintMode(...args),
            detectionSlotForRegion: (...args) => detectionSlotForRegion(...args),
            getClassicEnhanceRegionValues: (...args) => getClassicEnhanceRegionValues(...args),
            enhanceRegionKey: (...args) => enhanceRegionKey(...args)
        },
        directorSource: {
            applyDirectorCapabilityToPayloadForPreset: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.applyDirectorCapabilityToPayloadForPreset?.(...args) ?? args[1],
            directorTimelinePayload: (...args) => directorTimelinePayload(...args)
        },
        serializationSource: {
            cloneRunValue: (...args) => cloneRunValue(...args)
        }
    };
    CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER = typeof WORKBENCH_CANVAS_PRESET_RUN_SERIALIZATION.createCanvasPresetRunSerializationController === 'function'
        ? WORKBENCH_CANVAS_PRESET_RUN_SERIALIZATION.createCanvasPresetRunSerializationController({
            presetRunSerializationSource: PRESET_RUN_SERIALIZATION_CONTEXT_SOURCE
        })
        : {};
    const PRESET_RUN_FINGERPRINT_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isNodeIgnored: (...args) => isNodeIgnored(...args)
        },
        presetSource: {
            getPresetUploadRunEdges: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.getPresetUploadRunEdges?.(...args) || [],
            serializeClassicNodeForRun: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializeClassicNodeForRun?.(...args) || {},
            serializePresetForRun: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializePresetForRun?.(...args) || {}
        },
        assetSource: {
            serializeAssetSourceForRun: (...args) => serializeAssetSourceForRun(...args)
        },
        fingerprintSource: {
            stableStringify: (...args) => stableStringify(...args),
            stableHash: (...args) => stableHash(...args)
        },
        serializationSource: {
            cloneRunValue: (...args) => cloneRunValue(...args)
        }
    };
    CANVAS_PRESET_RUN_FINGERPRINT_CONTROLLER = typeof WORKBENCH_CANVAS_PRESET_RUN_FINGERPRINT.createCanvasPresetRunFingerprintController === 'function'
        ? WORKBENCH_CANVAS_PRESET_RUN_FINGERPRINT.createCanvasPresetRunFingerprintController({
            presetRunFingerprintSource: PRESET_RUN_FINGERPRINT_CONTEXT_SOURCE
        })
        : {};
    const RESULT_STALENESS_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project,
            getProjectId: () => PROJECT_ID,
            getWorkbenchUserContext: (...args) => getWorkbenchUserContext(...args)
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isNodeIgnored: (...args) => isNodeIgnored(...args)
        },
        fingerprintSource: {
            computePresetRunFingerprint: (...args) => CANVAS_PRESET_RUN_FINGERPRINT_CONTROLLER.computePresetRunFingerprint?.(...args) || '',
            computeTimelineRunFingerprint: (...args) => computeTimelineRunFingerprint(...args),
            computeQwenTtsRunFingerprint: (...args) => QWEN_TTS_RUNTIME_CONTROLLER.computeQwenTtsRunFingerprint?.(...args) || ''
        },
        resultSource: {
            resultNodeHasOutput: (...args) => resultNodeHasOutput(...args)
        },
        patchSource: {
            buildResultStaleStatePatch: (...args) => buildResultStaleStatePatch(...args),
            buildResultFingerprintPatch: (...args) => buildResultFingerprintPatch(...args)
        }
    };
    CANVAS_RESULT_STALENESS_CONTROLLER = typeof WORKBENCH_CANVAS_RESULT_STALENESS.createCanvasResultStalenessController === 'function'
        ? WORKBENCH_CANVAS_RESULT_STALENESS.createCanvasResultStalenessController({
            resultStalenessSource: RESULT_STALENESS_CONTEXT_SOURCE
        })
        : {};
    const QWEN_TTS_RUNTIME_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project,
            getProjectId: () => PROJECT_ID,
            applyProjectPatch: (patch) => Object.assign(project, patch || {}),
            getWorkbenchUserContext: (...args) => getWorkbenchUserContext(...args)
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isQwenTtsNode: (...args) => isQwenTtsNode(...args),
            qwenTtsNodeMode: (...args) => qwenTtsNodeMode(...args),
            qwenTtsAudioInputSlots: (...args) => qwenTtsAudioInputSlots(...args),
            isQwenTtsAudioSource: (...args) => isQwenTtsAudioSource(...args),
            isNodeIgnored: (...args) => isNodeIgnored(...args),
            nodeStatusState: (...args) => nodeStatusState(...args),
            isResultRefreshing: (...args) => isResultRefreshing(...args),
            isCanvasRunActiveState: (...args) => isCanvasRunActiveState(...args),
            qwenTtsModeLabel: (...args) => qwenTtsModeLabel(...args)
        },
        assetSource: {
            serializeAssetSourceForFingerprint: (...args) => serializeAssetSourceForFingerprint(...args),
            serializeAssetSourceForRun: (...args) => serializeAssetSourceForRun(...args)
        },
        fingerprintSource: {
            normalizeRunEdgesForFingerprint: (...args) => normalizeRunEdgesForFingerprint(...args),
            cloneRunValue: (...args) => cloneRunValue(...args),
            stableHash: (...args) => stableHash(...args)
        },
        schedulerSource: {
            buildPlan: typeof schedulerBuildPlan === 'function' ? (...args) => schedulerBuildPlan(...args) : null,
            refreshResultStaleFlags: (...args) => CANVAS_RESULT_STALENESS_CONTROLLER.refreshResultStaleFlags?.(...args) || false,
            refreshingSourceIdsFromPlan: plan => CANVAS_SCHEDULER_RUN_CONTROLLER.refreshingSourceIdsFromPlan?.(plan) || [],
            setBlockedSchedulerFromPlan: (plan, options) => CANVAS_SCHEDULER_STATE_CONTROLLER.setBlockedSchedulerFromPlan?.(plan, options),
            waitForRefreshingSources: (...args) => waitForRefreshingSources(...args),
            clearSchedulerBlockedState: () => !!CANVAS_SCHEDULER_STATE_CONTROLLER.clearSchedulerBlockedState?.()
        },
        renderSource: {
            renderNodes: (...args) => renderNodes(...args),
            renderEdges: (...args) => renderEdges(...args),
            mutate: (...args) => mutate(...args),
            scheduleSave: (...args) => scheduleSave(...args),
            pollUpdate: (...args) => pollUpdate(...args)
        },
        resultSource: {
            resultNodeRunSortScore: (...args) => Number(CANVAS_PRESET_RUN_RUNTIME_CONTROLLER.resultNodeRunSortScore?.(...args) || 0),
            buildQueuedResultNode: (...args) => buildQueuedResultNode(...args),
            buildResultRunMetadataPatch: (...args) => buildResultRunMetadataPatch(...args),
            buildResultStatusPatch: (...args) => buildResultStatusPatch(...args),
            buildResultAssetPatch: (...args) => buildResultAssetPatch(...args),
            buildResultOutputPatch: (...args) => buildResultOutputPatch(...args),
            buildResultPreviewPatch: (...args) => buildResultPreviewPatch(...args),
            buildResultRefreshPreparingPatch: (...args) => buildResultRefreshPreparingPatch(...args),
            buildResultRefreshFailurePatch: (...args) => buildResultRefreshFailurePatch(...args),
            isTerminalRunState: (...args) => isTerminalRunState(...args),
            syncCanvasProjectAssetRootFromAsset: (...args) => syncCanvasProjectAssetRootFromAsset(...args),
            syncCanvasProjectAssetRootFromAssets: (...args) => syncCanvasProjectAssetRootFromAssets(...args)
        },
        patchSource: {
            buildQwenTtsStatePatch: (...args) => buildQwenTtsStatePatch(...args),
            buildQwenTtsRunResponsePatch: (...args) => buildQwenTtsRunResponsePatch(...args),
            buildResultRefreshPreparingPatch: (...args) => buildResultRefreshPreparingPatch(...args),
            buildProjectNodeAppendPatch: (...args) => buildProjectNodeAppendPatch(...args),
            buildProjectRunAppendPatch: (...args) => buildProjectRunAppendPatch(...args),
            buildQwenTtsRunRecord: (...args) => buildQwenTtsRunRecord(...args),
            buildCanvasRunStatus: (...args) => buildCanvasRunStatus(...args),
            mergeCanvasRunStatus: (...args) => mergeCanvasRunStatus(...args),
            buildResultLayoutPatch: (...args) => buildResultLayoutPatch(...args)
        },
        selectionSource: {
            getSelectedNodeId: () => selectedNodeId,
            setSelection: node => CANVAS_SELECTION_CONTROLLER.setOptionalNodeSelectionPreservingGroup(node?.id)
        },
        layoutSource: {
            getNodeRect: (...args) => getNodeRect(...args),
            centerViewportOnWorld: (...args) => centerViewportOnWorld(...args),
            applyNodeLayoutPatch: (...args) => applyNodeLayoutPatch(...args)
        },
        workflowSource: {
            ensureGenerateEdge: (...args) => ensureGenerateEdge(...args),
            dockCanvasAgentPanelBottomLeft: (...args) => dockCanvasAgentPanelBottomLeft(...args),
            createCanvasAgentWorkflowGroup: (...args) => createCanvasAgentWorkflowGroup(...args)
        },
        requestSource: {
            sendCanvasQwenTtsRunRequest: (...args) => sendCanvasQwenTtsRunRequest(...args),
            sendCanvasQwenTtsPollRequest: (...args) => sendCanvasQwenTtsPollRequest(...args),
            sendCanvasQwenTtsControlRequest: (...args) => sendCanvasQwenTtsControlRequest(...args)
        },
        pollingSource: {
            pollRunWithController: (...args) => pollRunWithController(...args)
        },
        historySource: {
            pushHistory: (...args) => pushHistory(...args)
        },
        timingSource: {
            nowIso: (...args) => nowIso(...args),
            uid: (...args) => uid(...args)
        },
        languageSource: {
            t: (...args) => t(...args)
        },
        uiSource: {
            showToast: (...args) => showToast(...args)
        },
        utilitySource: {
            clamp: (...args) => clamp(...args)
        }
    };
    const QWEN_TTS_RUNTIME_CONTROLLER = typeof WORKBENCH_CANVAS_QWEN_TTS_RUNTIME.createCanvasQwenTtsRuntimeController === 'function'
        ? WORKBENCH_CANVAS_QWEN_TTS_RUNTIME.createCanvasQwenTtsRuntimeController({
            qwenTtsRuntimeSource: QWEN_TTS_RUNTIME_CONTEXT_SOURCE
        })
        : {};
    const runQwenTtsNode = (...args) => QWEN_TTS_RUNTIME_CONTROLLER.runQwenTtsNode?.(...args)
        || Promise.resolve({ ok: false, error: 'Qwen TTS runtime controller unavailable' });
    const stopQwenTtsNode = (...args) => QWEN_TTS_RUNTIME_CONTROLLER.stopQwenTtsNode?.(...args)
        || Promise.resolve({ ok: false, error: 'Qwen TTS runtime controller unavailable' });
    const BATCH_ANY_CONNECTION_CONTEXT_SOURCE = {
        nodeSource: {
            ...UPLOAD_CONNECTION_CONTEXT_SOURCE.nodeSource,
            uid: (...args) => uid(...args)
        },
        edgeSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.edgeSource,
        historySource: UPLOAD_CONNECTION_CONTEXT_SOURCE.historySource,
        languageSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.languageSource,
        uiSource: UPLOAD_CONNECTION_CONTEXT_SOURCE.uiSource,
        batchSource: {
            isBatchAnySourceNode: (...args) => isBatchAnySourceNode(...args),
            batchAnySourceMediaKind: (...args) => batchAnySourceMediaKind(...args),
            batchAnyAcceptsMediaKind: (...args) => batchAnyAcceptsMediaKind(...args),
            batchAnySourceText: (...args) => batchAnySourceText(...args),
            batchAnySourceAsset: (...args) => batchAnySourceAsset(...args),
            batchAnyTextFromItem: (...args) => batchAnyTextFromItem(...args)
        },
        patchSource: {
            buildTextBatchItemFromSource: (...args) => buildTextBatchItemFromSource(...args),
            buildMediaBatchItemFromSource: (...args) => buildMediaBatchItemFromSource(...args),
            buildBatchAnyItemStatePatch: (...args) => buildBatchAnyItemStatePatch(...args),
            applyBatchAnyStatePatch: (...args) => applyBatchAnyStatePatch(...args)
        },
        selectionSource: {
            getSelectedNodeId: () => selectedNodeId,
            selectBatchNode: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(nodeId)
        },
        persistenceSource: {
            scheduleSave: (...args) => scheduleSave(...args)
        },
        renderSource: {
            mutate: (...args) => mutate(...args)
        },
        timeSource: {
            nowIso: (...args) => nowIso(...args)
        }
    };
    CANVAS_BATCH_ANY_CONNECTION_CONTROLLER = typeof WORKBENCH_CANVAS_BATCH_ANY_CONNECTION.createCanvasBatchAnyConnectionController === 'function'
        ? WORKBENCH_CANVAS_BATCH_ANY_CONNECTION.createCanvasBatchAnyConnectionController({
            batchAnyConnectionSource: BATCH_ANY_CONNECTION_CONTEXT_SOURCE
        })
        : {};
    const BATCH_ANY_RUNTIME_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project,
            applyProjectPatch: (patch) => Object.assign(project, patch || {})
        },
        nodeSource: {
            getNode: (...args) => getNode(...args)
        },
        batchSource: {
            batchAnyTargets: (...args) => batchAnyTargets(...args),
            applyBatchAnyStatePatch: (...args) => applyBatchAnyStatePatch(...args),
            setBatchAnyCurrentItem: (...args) => setBatchAnyCurrentItem(...args)
        },
        runSource: {
            runPresetNode: (...args) => runPresetNode(...args)
        },
        patchSource: {
            buildBatchAnyJob: (...args) => buildBatchAnyJob(...args),
            buildProjectBatchJobAppendPatch: (...args) => buildProjectBatchJobAppendPatch(...args),
            buildBatchJobRunIdsPatch: (...args) => buildBatchJobRunIdsPatch(...args),
            buildBatchJobFailurePatch: (...args) => buildBatchJobFailurePatch(...args),
            buildBatchJobCompletionPatch: (...args) => buildBatchJobCompletionPatch(...args),
            buildResultAssetPatch: (...args) => buildResultAssetPatch(...args),
            buildResultBatchMetadataPatch: (...args) => buildResultBatchMetadataPatch(...args)
        },
        identitySource: {
            uid: (...args) => uid(...args)
        },
        serializationSource: {
            cloneRunValue: (...args) => cloneRunValue(...args)
        },
        timeSource: {
            nowIso: (...args) => nowIso(...args)
        },
        languageSource: {
            t: (...args) => t(...args)
        },
        renderSource: {
            mutate: (...args) => mutate(...args)
        },
        selectionSource: {
            setSelection: node => CANVAS_SELECTION_CONTROLLER.setOptionalNodeSelectionPreservingGroup(node?.id)
        },
        uiSource: {
            showToast: (...args) => showToast(...args)
        }
    };
    CANVAS_BATCH_ANY_RUNTIME_CONTROLLER = typeof WORKBENCH_CANVAS_BATCH_ANY_RUNTIME.createCanvasBatchAnyRuntimeController === 'function'
        ? WORKBENCH_CANVAS_BATCH_ANY_RUNTIME.createCanvasBatchAnyRuntimeController({
            batchAnyRuntimeSource: BATCH_ANY_RUNTIME_CONTEXT_SOURCE
        })
        : {};
    const runBatchAnyNode = (...args) => CANVAS_BATCH_ANY_RUNTIME_CONTROLLER.runBatchAnyNode?.(...args)
        || Promise.resolve({ ok: false, error: 'Batch Any runtime controller unavailable' });
    const AGENT_TARGET_CONTEXT_SOURCE = {
            targetSource: {
                languageSource: {
                    t,
                },
                nodeSource: {
                    getNode,
                },
                selectionSource: {
                    getSelectedNodeIdList,
                    getSelectedNodeId: () => selectedNodeId,
                    hasSelectedNode: (id) => selectedNodeIds?.has?.(id),
                },
                filterSource: {
                    isNodeIgnored,
                },
                assetSource: {
                    getSelectedResultAsset,
                    safeAssetDisplaySrc,
                    assetMediaKind,
                },
                imageSource: {
                    isPoseStudioImageSource,
                    isGaussianStudioImageSource,
                    isLivePortraitExpressionImageSource,
                },
                mediaViewerSource: {
                    mediaViewerNodeHasViewableImage,
                    getMediaViewerContext: () => MEDIA_VIEWER_CONTEXT,
                },
            }
    };
    CANVAS_AGENT_TARGET_CONTROLLER = typeof WORKBENCH_CANVAS_AGENT_TARGET.createCanvasAgentTargetController === 'function'
        ? WORKBENCH_CANVAS_AGENT_TARGET.createCanvasAgentTargetController(AGENT_TARGET_CONTEXT_SOURCE)
        : {};
    const getCanvasAgentTargetNode = CANVAS_AGENT_TARGET_CONTROLLER.getCanvasAgentTargetNode;
    const canvasAgentTargetLabel = CANVAS_AGENT_TARGET_CONTROLLER.canvasAgentTargetLabel;
    const canvasAgentShortNodeLabel = CANVAS_AGENT_TARGET_CONTROLLER.canvasAgentShortNodeLabel;
    const isCanvasAgentImageTarget = CANVAS_AGENT_TARGET_CONTROLLER.isCanvasAgentImageTarget;
    const isCanvasAgentVideoTarget = CANVAS_AGENT_TARGET_CONTROLLER.isCanvasAgentVideoTarget;
    const isCanvasAgentAudioTarget = CANVAS_AGENT_TARGET_CONTROLLER.isCanvasAgentAudioTarget;
    const getCanvasAgentTargetMediaKind = CANVAS_AGENT_TARGET_CONTROLLER.getCanvasAgentTargetMediaKind;
    const isCanvasAgentGeneratorTarget = CANVAS_AGENT_TARGET_CONTROLLER.isCanvasAgentGeneratorTarget;
    const isCanvasAgentTextTarget = CANVAS_AGENT_TARGET_CONTROLLER.isCanvasAgentTextTarget;
    const isCanvasAgentMediaReferenceTarget = CANVAS_AGENT_TARGET_CONTROLLER.isCanvasAgentMediaReferenceTarget;
    const isCanvasAgentSupportedTarget = CANVAS_AGENT_TARGET_CONTROLLER.isCanvasAgentSupportedTarget;
    const getCanvasAgentReferenceAsset = CANVAS_AGENT_TARGET_CONTROLLER.getCanvasAgentReferenceAsset;
    const getCanvasAgentReferenceKind = CANVAS_AGENT_TARGET_CONTROLLER.getCanvasAgentReferenceKind;
    const AGENT_CONTEXT_SOURCE = {
            generationSource: {
                languageSource: {
                    t
                },
                utilitySource: {
                    clamp,
                    cloneRunValue
                },
                resolutionSource: {
                    canvasAgentAspectOptions: CANVAS_AGENT_ASPECT_OPTIONS,
                    getCanvasAgentResolutionState,
                    canvasAgentResolutionLabel: canvasAgentResolutionLabelFromSettings,
                    canvasAgentResolutionCompactLabel: canvasAgentResolutionCompactLabelFromSettings,
                    normalizeResolutionProfile,
                    resolveResolutionBaseDims
                },
                presetSource: {
                    getVisiblePresetParams,
                    canvasAgentPresetPromptDefaults
                },
                patchSource: {
                    buildNodeParamsPatch,
                    buildPresetSnapshotPatch,
                    buildClassicNodeStatePatch,
                    buildPresetGenerationConfigPatch,
                    buildConfigStatePatch,
                    buildCanvasNodeStatusPatch,
                    buildPresetConfigPatch
                },
                nodeSource: {
                    createCanvasAgentPresetProbeNode,
                    getNode,
                    applyConfigNodeToPreset,
                    isNodeLocked
                },
                mediaSource: {
                    getVisibleClassicUploadSlots,
                    getVisibleUploadSlots,
                    canNodeConnectToUploadSlot,
                    isCanvasAgentMaskSlot
                },
                configSource: {
                    generationConfigValueForPresetSchema,
                    getPresetConfigSource,
                    buildInitialConfigValues
                },
                uiSource: {
                    showToast
                },
                historySource: {
                    pushHistoryBatch
                },
                stateSource: {
                    mutate
                },
                timeSource: {
                    nowIso
                }
            },
            referencesSource: {
                languageSource: {
                    t
                },
                identitySource: {
                    uid
                },
                capacitySource: {
                    getMaxImageReferences: () => CANVAS_AGENT_MAX_IMAGE_REFERENCES,
                    getMaxExtraImageReferences: () => CANVAS_AGENT_MAX_EXTRA_IMAGE_REFERENCES,
                    getMaxVideoReferences: () => CANVAS_AGENT_MAX_VIDEO_REFERENCES,
                    getMaxAudioReferences: () => CANVAS_AGENT_MAX_AUDIO_REFERENCES,
                    getMaxTextReferences: () => CANVAS_AGENT_MAX_TEXT_REFERENCES
                },
                stateSource: {
                    getAgentState: () => canvasAgentState,
                    setCanvasAgentMessage
                },
                nodeSource: {
                    getNode: (nodeId) => getNode(nodeId),
                    canvasAgentShortNodeLabel,
                    getNodeTextOutput
                },
                assetSource: {
                    getCanvasAgentReferenceAsset,
                    getCanvasAgentReferenceKind,
                    assetDisplaySrc,
                    serializeAssetSourceForRun
                },
                targetSource: {
                    isCanvasAgentMediaReferenceTarget,
                    getCanvasAgentTargetMediaKind,
                    getCanvasAgentTargetNode
                },
                selectionSource: {
                    getSelectedNodeIdList
                },
                uiSource: {
                    showToast,
                    renderCanvasAgentPanel
                }
            },
            decisionSource: {
                languageSource: {
                    t
                },
                utilitySource: {
                    normalizePresetName
                },
                catalogSource: {
                    getPresetCatalog,
                    getReadyPresetEntries: canvasAgentReadyPresetEntries,
                    canvasAgentPresetQueueConfig,
                    getCanvasAgentPresetQueue,
                    findCanvasAgentPresetEntryByAlias,
                    findCanvasAgentPresetInstructionOverride,
                    findPresetCatalogEntryByName,
                    getCanvasAgentPresetStatus
                },
                mediaSource: {
                    createCanvasAgentPresetProbeNode,
                    canvasAgentUploadSlotsForNode,
                    getUploadSlotMediaKind,
                    isCanvasAgentMaskSlot
                },
                settingsSource: {
                    getCanvasAgentSettings
                },
                promptSource: {
                    canvasAgentPresetPromptDefaults,
                    promptPreflight: (payload) => typeof apiPromptPreflight === 'function'
                        ? apiPromptPreflight(payload)
                        : null,
                    canvasAgentPromptValidationFact,
                    wildcardPreviewFacts,
                    canvasAgentPromptTargetFact
                },
                decisionSource: {
                    askCanvasAgentDecision
                },
                rewriteSource: {}
            },
            promptRewriteSource: {
                languageSource: {
                    t,
                    runtimeUiLang
                },
                identitySource: {
                    uid
                },
                utilitySource: {
                    normalizePresetName
                },
                runtimeSource: {
                    getPromptRewriteTimeoutMs: () => CANVAS_AGENT_PROMPT_REWRITE_TIMEOUT_MS
                },
                projectSource: {
                    getDefaultProjectId: () => PROJECT_ID,
                    getProject: () => project
                },
                settingsSource: {
                    getCanvasAgentSettings
                },
                targetSource: {
                    isCanvasAgentImageTarget,
                    canvasAgentPromptTargetFromPurpose,
                    canvasAgentPromptTargetNeedsDanbooru,
                    canvasAgentPromptLooksDanbooru,
                    canvasAgentPromptNeedsTargetRewrite,
                    canvasAgentPromptTargetContextLine,
                    canvasAgentPromptTargetInstruction
                },
                promptSource: {
                    canvasAgentPromptDefaultsForPurpose
                },
                referenceSource: {},
                vlmSource: {
                    getCanvasAgentRewriteModel,
                    canvasAgentVlmAgentContextPayload: (...args) => CANVAS_AGENT_VLM_INSTRUCTION_CONTROLLER?.canvasAgentVlmAgentContextPayload?.(...args) || {},
                    sendCanvasVlmRunRequest,
                    getCanvasAgentCustomRuntimeParams
                },
                danbooruSource: {
                    canvasAgentDanbooruFallbackPrompt,
                    apiDanbooruTagLookup
                },
                uiSource: {
                    showToast
                }
            },
            promptResolverSource: {
                languageSource: {
                    t
                },
                identitySource: {
                    uid
                },
                settingsSource: {
                    getCanvasAgentSettings
                },
                targetSource: {
                    canvasAgentPromptTargetFromPurpose,
                    canvasAgentPromptTargetFact
                },
                promptSource: {
                    canvasAgentPromptDefaultsForPurpose,
                    canvasAgentPromptValidationFact
                },
                decisionSource: {
                    askCanvasAgentDecision
                },
                modelSource: {
                    getCanvasAgentRewriteModel
                },
                stateSource: {
                    setCanvasAgentRunInfo,
                    setCanvasAgentMessage,
                    resetCanvasAgentRunInfo
                },
                rewriteSource: {}
            },
            textWorkflowsSource: {
                languageSource: {
                    t
                },
                identitySource: {
                    uid
                },
                targetSource: {
                    getCanvasAgentTargetNode,
                    isCanvasAgentTextTarget
                },
                nodeSource: {
                    updateTextNodeValue
                },
                modelSource: {
                    getCanvasAgentRewriteModel
                },
                stateSource: {
                    setCanvasAgentRunInfo,
                    resetCanvasAgentRunInfo,
                    setCanvasAgentMessage,
                    setCanvasAgentInput: (value) => {
                        canvasAgentState.input = String(value || '');
                    },
                    mutate
                },
                runtimeSource: {
                    waitNextFrame
                },
                rewriteSource: {},
                decisionSource: {
                    askCanvasAgentDecision
                },
                uiSource: {
                    showToast
                },
            },
            textNodesSource: {
                projectSource: {
                    getProject: () => project
                },
                nodeSource: {
                    getNode: (nodeId) => getNode(nodeId)
                },
                patchSource: {
                    buildTextMergeStatePatch
                },
                batchSource: {
                    batchAnyMediaKind,
                    batchAnyCurrentItem,
                    batchAnyTextFromItem
                },
                timelineSource: {
                    isDirectorTimelineNode,
                    directorTimelinePayload
                },
                styleSource: {
                    getStyleSelectorPrompt: (node) => styleSelectorGetPrompt?.(node, STYLE_SELECTOR_NODE_CONTEXT)
                }
            },
            uiSource: {
                t,
                getCanvasAgentSettings,
                setCanvasAgentSettingsPatch,
                getAgentState: () => canvasAgentState,
                renderCanvasAgentPanel,
                dockCanvasAgentPanelBottomLeft,
                setCanvasAgentSelection: (...args) => CANVAS_SELECTION_CONTROLLER.setCanvasAgentSelection(...args),
                mutate,
            }
    };
    const CANVAS_AGENT_CONTEXT = typeof WORKBENCH_CANVAS_AGENT_CONTEXT.createCanvasWorkbenchAgentContext === 'function'
        ? WORKBENCH_CANVAS_AGENT_CONTEXT.createCanvasWorkbenchAgentContext({
            agentSource: AGENT_CONTEXT_SOURCE
        })
        : {};
    const {
         CANVAS_AGENT_GENERATION_CONTROLLER,
         canvasAgentRunNodeSelection,
         canvasAgentUserExplicitNegativePrompt,
         normalizeCanvasAgentAspect,
         extractCanvasAgentAspectFromText,
         stripCanvasAgentInlineGenerationParams,
         normalizeCanvasAgentGenerationOptions,
        canvasAgentResolutionLabel,
        canvasAgentResolutionCompactLabel,
        canvasAgentModelStatusLabel,
        applyCanvasAgentPromptToGenerator,
        applyCanvasAgentPresetDefaultsToGenerator,
        clonePresetWithPromptDefaults,
        presetGenerationStepValue,
        presetGenerationImageNumberValue,
        applyCanvasAgentGenerationOptionsToGenerator,
        prepareCanvasAgentGenerator,
        applyCanvasAgentResolutionToGenerator,
        previewCanvasAgentEditInputSlot,
        CANVAS_AGENT_REFERENCES_CONTROLLER,
        canvasAgentReferenceIcon,
        canvasAgentReferenceKey,
        getCanvasAgentVlmReferenceSources,
        canvasAgentReferenceSummaryText,
        canvasAgentReferenceFacts,
        normalizeCanvasAgentReferences,
        canvasAgentReferenceCounts,
        createCanvasAgentReferenceFromNode,
        addCanvasAgentReferenceFromNode,
        addSelectedCanvasAgentReferences,
        removeCanvasAgentReference,
        promoteCanvasAgentReference,
        canvasAgentReferenceNode,
        getCanvasAgentPrimaryImageReference,
        getCanvasAgentPrimaryReferenceByKind,
        getCanvasAgentPrimaryMediaNode,
        getCanvasAgentExtraImageReferences,
        canvasAgentMediaReferenceLimit,
        getCanvasAgentMediaReferenceNodes,
        canvasAgentMediaNodeCounts,
        canvasAgentVideoTaskForMedia,
        canvasAgentVideoTaskLabel,
        canvasAgentMediaNodeFacts,
        CANVAS_AGENT_DECISION_CONTROLLER,
        canvasAgentPresetDecisionOptions,
        canvasAgentPresetImageCapacity,
        canvasAgentPresetMediaCapacity,
        canvasAgentPresetSupportsTask,
        canvasAgentRequestedMediaCounts,
        canvasAgentPresetSupportsMediaRequest,
        canvasAgentPresetMediaCapacityMessage,
        chooseCanvasAgentPresetEntry,
        canvasAgentPromptPreflight,
        canvasAgentPromptPreflightFacts,
        ensureCanvasAgentPromptPreflightAllows,
        canvasAgentPromptDecisionField,
        canvasAgentPromptFromDecision,
        CANVAS_AGENT_PROMPT_RESOLVER_CONTROLLER,
        resolveCanvasAgentPrompt: resolveCanvasAgentPromptFromContext,
        canvasAgentComparablePromptText,
         canvasAgentPromptRewriteTooWeak,
         canvasAgentLocalPromptRewriteFallback,
         canvasAgentDanbooruFallbackRewrite,
         ensureCanvasAgentPromptMatchesTarget,
         canvasAgentDanbooruLookupText,
         maybeShowCanvasDanbooruRuntimeNotice
     } = CANVAS_AGENT_CONTEXT;
    CANVAS_AGENT_ACTION_CONTROLLER = typeof WORKBENCH_CANVAS_AGENT_ACTION.createCanvasAgentActionController === 'function'
        ? WORKBENCH_CANVAS_AGENT_ACTION.createCanvasAgentActionController({
            actionSource: {
                languageSource: {
                    t,
                },
                stateSource: {
                    getCanvasAgentState: () => canvasAgentState,
                },
                referenceSource: {
                    canvasAgentReferenceCounts,
                },
                promptSource: {
                    canvasAgentPromptMediaIntent,
                },
                targetSource: {
                    getCanvasAgentTargetNode,
                    getCanvasAgentTargetMediaKind,
                    isCanvasAgentGeneratorTarget,
                    isCanvasAgentImageTarget,
                    isCanvasAgentTextTarget,
                    isCanvasAgentMediaReferenceTarget,
                },
            }
        })
        : {};
    CANVAS_AGENT_PROMPT_REWRITE_CONTROLLER = CANVAS_AGENT_CONTEXT.CANVAS_AGENT_PROMPT_REWRITE_CONTROLLER;
    CANVAS_AGENT_TEXT_WORKFLOW_CONTROLLER = CANVAS_AGENT_CONTEXT.CANVAS_AGENT_TEXT_WORKFLOW_CONTROLLER;
    CANVAS_AGENT_TEXT_NODE_CONTROLLER = CANVAS_AGENT_CONTEXT.CANVAS_AGENT_TEXT_NODE_CONTROLLER;
    const rewriteCanvasAgentPromptWithLlm = (...args) => invokeCanvasAgentPromptRewrite(...args);
    const resolveCanvasAgentPrompt = (...args) => resolveCanvasAgentPromptFromContext?.(...args)
        || { ok: false, error: 'Prompt resolver is unavailable' };
    let CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER = {};
    const VLM_NODE_VIEW_CONTEXT_SOURCE = {
        textNodeRendererSource: {
            languageSource: {
                t,
                tOption,
                getLanguageState: () => ({ __lang: runtimeUiLang() }),
                tagCartLabel,
                localizedDefaultTitle,
                notConnectedText: (...args) => CANVAS_NODE_RENDERER?.notConnectedText?.(...args) || t('Not connected', '未连接')
            },
            utilitySource: {
                escapeHtml,
                renderIconHtml,
                cssEscape: (...args) => cssEscape(...args),
            },
            domSource: {
                getNodesLayer: () => nodesLayer,
            },
            nodeSource: {
                getNode,
                getNodeTextOutput,
                getTextNodeInputSource,
                textMergeInputSlots,
                getTextMergeInputSource,
                getTextMergeOutput,
            },
            translationSource: {
                getTranslationFieldState,
            },
            renderSource: {
                renderNodeStateBadges: (...args) => CANVAS_NODE_RENDERER?.renderNodeStateBadges?.(...args) || '',
                renderTranslatableTextarea,
            },
            autocompleteSource: {
                danbooruAutocompleteAttrs,
            },
            wildcardsSource: {
                getTargets: () => WILDCARDS_HELPER_TARGETS,
                getMethods: () => WILDCARDS_HELPER_METHODS,
                getSeedModes: () => WILDCARDS_HELPER_SEED_MODES,
                wildcardHelperBuildTag: (...args) => wildcardHelperBuildTag(...args),
            }
        },
        vlmNodeSource: {
            languageSource: {
                getLanguageState: () => ({ __lang: runtimeUiLang() }),
                t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
            },
            utilitySource: {
                uid,
                escapeHtml,
                cssEscape,
            },
            timeSource: {
                nowIso,
            },
            stateSource: {
                cloneRunValue,
            },
            configSource: {
                getVlmVersionChoices: () => VLM_VERSION_CHOICES,
                getDefaultVlmParamsFromAgentSettings: buildDefaultVlmParamsFromAgentSettings,
                getVlmChatDefaultFontSize: () => VLM_CHAT_DEFAULT_FONT_SIZE,
                getVlmChatDefaultMaxHistory: () => VLM_CHAT_DEFAULT_MAX_HISTORY,
                getVlmChatContextCharsMin: () => VLM_CHAT_CONTEXT_CHARS_MIN,
                getVlmChatDefaultContextChars: () => VLM_CHAT_DEFAULT_CONTEXT_CHARS,
                getVlmChatNodeSize: () => VLM_CHAT_NODE_SIZE,
                getVlmSingleNodeSize: () => VLM_SINGLE_NODE_SIZE,
                normalizeVlmAgentMode,
            },
            nodeSource: {
                getNode,
                isNodeLocked,
            },
            domSource: {
                getNodesLayer: () => nodesLayer,
                getSelectedNodeId: () => selectedNodeId,
                getInspector: () => inspector,
            },
            assetSource: {
                getSelectedResultAsset,
            },
            chatContextSource: {
                vlmChatContextBudgetMax: (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatContextBudgetMax?.(...args) || VLM_CHAT_DEFAULT_CONTEXT_CHARS,
                clampVlmChatContextBudget: (...args) => CANVAS_VLM_CHAT_CONTROLLER?.clampVlmChatContextBudget?.(...args) || VLM_CHAT_DEFAULT_CONTEXT_CHARS,
            },
            historySource: {
                pushHistoryBatch,
            },
            uiStateSource: {
                mutate,
                showToast,
            },
            persistenceSource: {
                scheduleSave,
            },
            transportSource: {
                sendVlmSystemPromptTemplates: sendVlmSystemPromptTemplatesRequest,
            },
            renderSource: {
                invalidateVlmSystemPromptTemplateViews: () => {
                    (project.nodes || []).forEach((node) => {
                        if (node?.type === 'vlm') invalidateRenderedNode(node.id);
                    });
                },
                renderAll,
            },
            uiSource: {
                handleVlmAgentAutoConfirmToggle: (...args) => CANVAS_VLM_CHAT_CONTROLLER?.maybeRunVlmAgentActionFromAutoConfirmToggle?.(...args) || false,
            },
            customApiSource: {
                getVlmCustomProvider,
            },
        },
        vlmNodeViewSource: {
            languageSource: {
                getLanguageState: () => ({ __lang: runtimeUiLang() }),
                t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
            },
            utilitySource: {
                escapeHtml,
            },
            configSource: {
                getVlmVersionChoices: () => VLM_VERSION_CHOICES,
                getVlmChatToolCommands: () => VLM_CHAT_TOOL_COMMANDS,
                getVlmChatDefaultFontSize: () => VLM_CHAT_DEFAULT_FONT_SIZE,
                getVlmChatDefaultMaxHistory: () => VLM_CHAT_DEFAULT_MAX_HISTORY,
                getVlmChatContextCharsMin: () => VLM_CHAT_CONTEXT_CHARS_MIN,
                getVlmChatDefaultContextChars: () => VLM_CHAT_DEFAULT_CONTEXT_CHARS,
                getVlmImageSlots: () => VLM_IMAGE_SLOTS,
                getVlmCustomApiProviders: () => VLM_CUSTOM_API_PROVIDERS,
                getVlmAgentModeChoices: () => VLM_AGENT_MODE_CHOICES,
                normalizeVlmAgentMode,
            },
            nodeSource: {
                getNode,
                notConnectedText: (...args) => CANVAS_NODE_RENDERER?.notConnectedText?.(...args) || t('Not connected', '未连接'),
            },
            assetSource: {
                getVlmSourceAsset,
                safeAssetDisplaySrc,
            },
            stateSource: {
                nodeStatusState,
                isVlmNodeBusy,
            },
            chatContextSource: {
                vlmChatContextBudgetMax: (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmChatContextBudgetMax?.(...args) || VLM_CHAT_DEFAULT_CONTEXT_CHARS,
                clampVlmChatContextBudget: (...args) => CANVAS_VLM_CHAT_CONTROLLER?.clampVlmChatContextBudget?.(...args) || VLM_CHAT_DEFAULT_CONTEXT_CHARS,
            },
            renderSource: {
                vlmModelOptionsHtml,
                renderNodeStateBadges: (...args) => CANVAS_NODE_RENDERER?.renderNodeStateBadges?.(...args) || '',
                renderVlmChatLog,
                renderVlmSystemPromptTemplatePicker,
                renderTranslatableTextarea,
                getTranslationFieldState,
            },
            customApiSource: {
                getVlmCustomProvider,
                getVlmCustomApiProfile,
            }
        }
    };
    const AGENT_PROMPT_BOOTSTRAP_CONTEXT_SOURCE = {
            promptSource: {
                languageSource: {
                    t,
                    runtimeUiLang,
                },
                presetSource: {
                    getSlotOrder: () => SLOT_ORDER,
                    normalizePresetName,
                    getPresetUploadRunEdges: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.getPresetUploadRunEdges?.(...args) || [],
                    getUploadSlotMediaKind,
                    getPresetCatalogEntryForNode,
                    findCanvasAgentPresetEntryByAlias,
                    findPresetCatalogEntryByName,
                    getCanvasAgentPresetQueue,
                },
                nodeSource: {
                    getNode,
                },
                assetSource: {
                    getSelectedResultAsset,
                },
                referenceSource: {
                    normalizeCanvasAgentReferences,
                    getCanvasAgentPrimaryMediaNode,
                    canvasAgentReferenceNode,
                },
                danbooruSource: {},
            }
    };
    const CANVAS_AGENT_PROMPT_BOOTSTRAP_CONTEXT = typeof WORKBENCH_CANVAS_AGENT_PROMPT_BOOTSTRAP_CONTEXT.createCanvasWorkbenchAgentPromptBootstrapContext === 'function'
        ? WORKBENCH_CANVAS_AGENT_PROMPT_BOOTSTRAP_CONTEXT.createCanvasWorkbenchAgentPromptBootstrapContext({
            agentPromptBootstrapSource: AGENT_PROMPT_BOOTSTRAP_CONTEXT_SOURCE
        })
        : {};
    CANVAS_AGENT_PROMPT_CONTEXT = CANVAS_AGENT_PROMPT_BOOTSTRAP_CONTEXT.CANVAS_AGENT_PROMPT_CONTEXT || {};
    const canvasAgentPromptCompilerContext = (...args) => CANVAS_AGENT_PROMPT_CONTEXT.canvasAgentPromptCompilerContext(...args);
    const canvasAgentAttachPromptCompilerContext = (...args) => CANVAS_AGENT_PROMPT_CONTEXT.canvasAgentAttachPromptCompilerContext(...args);
    const canvasAgentMergeDanbooruPromptWithContext = (...args) => CANVAS_AGENT_PROMPT_CONTEXT.canvasAgentMergeDanbooruPromptWithContext(...args);
    const VLM_AGENT_CONTEXT_SOURCE = {
        projectSource: {
            getDefaultProjectId: () => PROJECT_ID,
            getProject: () => project,
            ensureProjectGroups,
        },
        selectionSource: {
            getSelectedNodeIds: () => selectedNodeIds,
            getSelectedNodeId: () => selectedNodeId,
        },
        nodeSource: {
            getNode,
        },
        statusSource: {
            nodeStatusState,
            isCanvasRunActiveState,
            isTerminalRunState,
            cloneRunValue,
        },
        promptSource: {
            findCanvasAgentPresetInstructionOverride,
            normalizePresetName,
            canvasAgentPromptTargetFromPurpose,
            canvasAgentPromptTargetInstruction,
            canvasAgentPromptTargetContextLine,
        },
        languageSource: {
            runtimeUiLang,
            t,
        },
        actionSource: {
            getVlmAgentActionTargetId: (...args) => CANVAS_VLM_CHAT_CONTROLLER?.vlmAgentActionTargetId?.(...args) || ''
        }
    };
    const VLM_CHAT_CONTEXT_SOURCE = {
        vlmAgentContextSource: VLM_AGENT_CONTEXT_SOURCE,
        controllerSource: {
            generationSource: {
                stripCanvasAgentInlineGenerationParams,
                canvasAgentUserExplicitNegativePrompt,
                extractCanvasAgentAspectFromText,
            },
            promptSource: {
                vlmAgentUserPromptHasAssistantPersonaImageIntent,
                findCanvasAgentPresetInstructionOverride,
                normalizePresetName,
                stripCanvasAgentPresetFromPrompt: (...args) => stripCanvasAgentPresetFromPrompt(...args),
                findCanvasAgentPresetEntryByAlias,
                canvasAgentPromptNeedsTargetRewrite,
                canvasAgentPromptLooksDanbooru,
                canvasAgentCanonicalDanbooruTagsFromPrompt,
                canvasAgentRepairMultiCharacterDanbooruTags,
                canvasAgentDanbooruFallbackRewrite,
                canvasAgentMergeDanbooruPromptWithContext,
                canvasAgentCanonicalizeDanbooruPrompt,
                canvasAgentPromptDefaultsForPurpose,
                canvasAgentPromptTargetFromPurpose,
                canvasAgentPromptTargetEntryForPurpose,
                canvasAgentPresetPromptDefaults,
                canvasAgentPromptTargetContextLine,
                canvasAgentPromptPreflightFacts,
                canvasAgentPromptPreflight,
                ensureCanvasAgentPromptMatchesTarget,
            },
            agentActionSource: {
                prepareVlmAgentImageActionStart: (...args) => CANVAS_AGENT_CONTEXT?.prepareVlmAgentImageActionStart?.(...args),
                vlmCanvasAgentWorkflowKey: (...args) => CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER?.vlmCanvasAgentWorkflowKey?.(...args) || '',
                runCanvasAgentImageEdit: (...args) => runCanvasAgentImageEdit(...args),
                runCanvasAgentQuickTool: (...args) => runCanvasAgentQuickTool(...args),
                runCanvasAgentTextToImage: (...args) => runCanvasAgentTextToImage(...args),
                addVlmAgentActionRunLock: (lockKey) => vlmAgentActionRunLocks.add(lockKey),
                deleteVlmAgentActionRunLock: (lockKey) => vlmAgentActionRunLocks.delete(lockKey),
                hasVlmAgentActionRunLock: (lockKey) => vlmAgentActionRunLocks.has(lockKey),
                describeVlmAgentToolStatus: (...args) => CANVAS_VLM_AGENT_CONTEXT?.describeVlmAgentToolStatus?.(...args) || { ok: false },
                findVlmAgentBrokenEdges: (...args) => CANVAS_VLM_AGENT_CONTEXT?.findVlmAgentBrokenEdges?.(...args) || { ok: false },
            },
            transportSource: {
                sendVlmRun: (payload, options) => apiVlmRun(payload, options),
                sendVlmCancel: (payload) => typeof apiVlmCancel === 'function'
                    ? apiVlmCancel(payload)
                    : { ok: false, error: 'VLM cancel API is unavailable' },
                sendVlmUnload: (payload) => typeof apiVlmUnload === 'function'
                    ? apiVlmUnload(payload)
                    : { ok: false, error: 'VLM unload API is unavailable' },
                sendVlmModelDownloads: (node, options) => sendCanvasVlmModelDownloadsRequest(node, options),
                sendVlmCustomModels: (node) => sendCanvasCustomLlmModelsRequest(node),
            },
            customApiSource: {
                readVlmCustomApiProfiles,
                writeVlmCustomApiProfiles,
                getVlmCustomProfileKey,
                getVlmCustomProvider,
            },
            schedulerSource: {
                scheduleTimeout: (callback, delay) => window.setTimeout(callback, delay),
                clearScheduledTimeout: (handle) => window.clearTimeout(handle),
                schedule: (callback, delay) => window.setTimeout(callback, delay),
            },
            wildcardSource: {
                wildcardsPreview: (payload) => typeof apiWildcardsPreview === 'function'
                    ? apiWildcardsPreview(payload)
                    : null,
            },
            uiSource: {
                getVlmChatUiAreas,
                openContextMenu: (...args) => openContextMenu(...args),
                focusVlmChatPromptInput: (...args) => focusVlmChatPromptInput(...args),
                hideVlmChatImagePreview: (...args) => hideVlmChatImagePreview(...args),
            },
            renderSource: {
                renderAll,
                renderNodes,
                renderEdges,
                renderInspector,
                renderMinimap,
                selectNodeLight,
            },
            nodeSource: {
                getProject: () => project,
                getDefaultProjectId: () => PROJECT_ID,
                getNode,
                getNodeRect,
                setVlmAgentTargetSelection: (nodeId, options) => CANVAS_SELECTION_CONTROLLER.setVlmAgentTargetSelection(nodeId, options),
                centerViewportOnWorld,
                isNodeIgnored,
                isNodeLocked,
                nodeStatusState,
                isVlmMediaSource,
            },
            resultSource: {
                generatedResultNodesForPreset: (...args) => CANVAS_PRESET_RUN_RUNTIME_CONTROLLER.generatedResultNodesForPreset?.(...args) || [],
                resultNodeHasOutput,
            },
            historySource: {
                pushHistory,
                pushHistoryBatch,
            },
            languageSource: {
                getLanguageState: () => ({ __lang: runtimeUiLang() }),
                t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
            },
            utilitySource: {
                nowIso,
                uid,
                now: () => canvasNow(),
                parseDate: (value) => Date.parse(value || ''),
                escapeHtml,
            },
            configSource: {
                getVlmContextWindows: () => VLM_CONTEXT_WINDOWS,
                getVlmDefaultVersion: () => VLM_VERSION_CHOICES[0],
                getVlmChatDefaultFontSize: () => VLM_CHAT_DEFAULT_FONT_SIZE,
                getVlmChatDefaultMaxHistory: () => VLM_CHAT_DEFAULT_MAX_HISTORY,
                getVlmChatContextCharsMin: () => VLM_CHAT_CONTEXT_CHARS_MIN,
                getVlmChatDefaultContextChars: () => VLM_CHAT_DEFAULT_CONTEXT_CHARS,
                getVlmChatContextCharsHardMax: () => VLM_CHAT_CONTEXT_CHARS_HARD_MAX,
                getVlmImageSlots: () => VLM_IMAGE_SLOTS,
                getVlmModelStatusCacheTtlMs: () => VLM_MODEL_STATUS_CACHE_TTL_MS,
                normalizeVlmAgentMode,
            },
            modelStatusSource: {
                buildVlmModelCheckingStatus,
                buildVlmModelStatusPatch,
                applyVlmModelStatus,
                sendVlmModelStatus: (node) => sendCanvasVlmModelStatusRequest(node),
                openVlmMissingModelModal,
            },
            agentSettingsSource: {
                getCanvasAgentCustomParams: () => canvasAgentCustomParamsFromSettings(getCanvasAgentSettings(), false),
                setCanvasAgentCustomSettings: (patch, options) => setCanvasAgentSettingsPatch(patch, options),
            },
            assetSource: {
                getSelectedResultAsset,
                getVlmSourceAsset,
                openVlmAssetViewer: (asset, title) => openAssetViewer(asset, title),
                refreshVlmChatAssetRoot: (options) => refreshCanvasProjectAssetRoot(options),
                hasVlmChatAssetRoot: () => !!String(window.SimpAICanvasWorkbenchAssetRoot || '').trim(),
                safeVlmChatFallbackSrc: (asset, fallback) => safeAssetFallbackSrc(asset, fallback),
                serializeAssetSourceForRun,
                serializeAssetForRun,
                safeAssetDisplaySrc,
                inferChatImageRelativePath,
                safeVlmChatAssetThumb,
            },
            inputMediaSource: {
                isImageFile,
                readFileAsDataUrl,
                getImageDimensions,
                createThumbnailDataUrl,
            },
            stateSource: {
                buildVlmChatStatePatch,
                buildVlmChatToolStatePatch,
                buildVlmParamsPatch,
                buildVlmTextPatch,
                buildVlmLastResponsePatch,
                buildVlmCustomModelChoicesPatch,
                buildVlmRunStatusPatch,
                cloneRunValue,
            },
            uiStateSource: {
                markVlmChatStickToBottom,
                mutate,
                scrollVlmChatToBottom,
                showToast,
                copyVlmChatText: (value) => {
                    if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') return false;
                    return navigator.clipboard.writeText(String(value || '')).then(() => true, () => false);
                },
                confirmDialog: (message) => window.confirm(message),
            },
            backendContextSource: {
                getWorkbenchUserContext,
            },
        }
    };
    const NODE_INSPECTOR_RENDERERS = {
        classic: renderClassicInspector,
        preset: renderPresetInspector,
        result: renderResultInspector,
        compare: renderCompareInspector,
        batch_any: renderBatchAnyInspector,
        xyz_matrix: renderXyzMatrixInspector,
        timeline: renderTimelineInspector,
        director_timeline: node => directorTimelineRenderInspector(node, DIRECTOR_TIMELINE_NODE_CONTEXT),
        style_selector: node => styleSelectorRenderInspector(node, STYLE_SELECTOR_NODE_CONTEXT),
        video: renderVideoInspector,
        audio: renderAudioInspector,
        note: renderNoteInspector,
        text: renderTextInspector,
        text_merge: renderTextMergeInspector,
        translation: renderTranslationInspector,
        tag_cart: renderTagCartInspector,
        wd14: renderWd14Inspector,
        vlm: renderVlmInspector,
        mask: node => CANVAS_ASSET_NODE_RENDERER?.renderMaskInspector?.(node) || '',
        sam3_video_mask: renderSam3VideoMaskInspector,
        camera_motion: renderCameraMotionInspector,
        pose_studio: node => poseStudioRenderInspector(node, POSE_STUDIO_NODE_CONTEXT),
        gaussian_studio: node => gaussianStudioRenderInspector(node, GAUSSIAN_STUDIO_NODE_CONTEXT),
        liveportrait_expression: node => livePortraitRenderInspector(node, LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT),
        qwen_tts: node => qwenTtsRenderInspector(node, QWEN_TTS_NODE_CONTEXT),
        image: renderImageInspector
    };
    const getNodeInspectorRenderer = (kind) => NODE_INSPECTOR_RENDERERS[kind];
    const NODE_INTERACTION_CONTEXT_SOURCE = {
            nodeParamSource: {
                domSource: {
                    getDocument: () => document,
                    getNodesLayer: () => nodesLayer,
                    cssEscape: (value) => cssEscape(value),
                },
                projectSource: {
                    getProject: () => project,
                },
                serializationSource: {
                    cloneRunValue,
                },
            languageSource: {
                getLanguageState: () => ({ __lang: runtimeUiLang() }),
                t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
            },
            nodeSource: {
                getNode,
                getInspector: () => inspector,
                getSelectedNodeId: () => selectedNodeId,
                isNodeLocked,
                isTextOutputNode,
                getTextNodeInputSource,
                isQwenTtsNode,
                isDirectorTimelineNode,
                nodeStatusState,
                isCanvasRunActiveState,
            },
            configSource: {
                getClassicOutpaintDirs: () => registryClassicOutpaintDirs,
                getClassicIpMaxImages,
                getVisibleClassicUploadSlots,
                getClassicEnhanceRegionValues,
                applyClassicEnhanceRegionValues,
                normalizeClassicInpaintMode,
                getInpaintModeDefaults,
            },
            patchSource: {
                buildNodeParamsPatch,
                buildNodeFieldPatch,
                buildClassicNodeStatePatch,
                buildMaskStatePatch,
                buildMaskStatus,
                buildTranslationStatePatch,
                buildTagCartStatePatch,
                buildWd14StatePatch,
                buildTextNodeStatePatch,
                buildTextMergeStatePatch,
                buildQwenTtsStatePatch,
                mergeCanvasRunStatus,
                buildPresetRuntimePatch,
                buildPresetDefinitionPatch,
            },
            presetThemeSource: {
                getPresetSchema,
                getPresetTheme,
                getPresetThemeInfo,
                getVisiblePresetParams,
                ensurePresetSpecialControllerState,
            },
            historySource: {
                pushHistory,
                pushHistoryBatch,
            },
            persistenceSource: {
                scheduleSave,
            },
            utilitySource: {
                nowIso,
                clamp: (...args) => clamp(...args),
            },
            renderSource: {
                requestCanvasFrame,
                renderAll,
                renderNodes,
                renderEdges,
                renderInspector,
            },
            uiStateSource: {
                showToast,
                mutate,
            },
            actionSource: {
                updateTextNodeValue,
                updateTextMergeSeparator,
                updateTranslationInput,
                updateTranslationParam,
                updateTagCartParam,
                updateWd14Param,
                updateWildcardsHelperParam,
                applyVlmSystemPromptTemplate,
                handleVlmParamFieldChange,
                updateSam3VideoMaskParam: (nodeId, key, value, inputType) =>
                    sam3UpdateParam(nodeId, key, value, inputType, SAM3_VIDEO_MASK_NODE_CONTEXT),
                updateCameraMotionParam: (nodeId, key, value, inputType) =>
                    cameraMotionUpdateParam(nodeId, key, value, inputType, CAMERA_MOTION_NODE_CONTEXT),
                updateQwenTtsParam,
                deleteEdge: (...args) => deleteEdge(...args),
                canvasRelightLightValue,
                vlmDefaultParamValue,
                updateVlmParam,
                refreshVlmChatReadabilityDom,
                qwenTtsStylePresetInstruction: (value) => typeof qwenTtsStylePresetInstruction === 'function'
                    ? qwenTtsStylePresetInstruction(value, QWEN_TTS_NODE_CONTEXT)
                    : '',
                syncTextMergeOutputDom,
                refreshTextMergeDependents,
                refreshPresetSpecialNodeDom,
                handleInpaintModeChange,
                handleUovMethodChange,
                handleEnhanceUovParamChange,
                handleClassicModeChange,
                syncTwinParamInputs,
            }
        },
        inspectorSource: {
            languageSource: {
                getLanguageState: () => ({ __lang: runtimeUiLang() }),
                t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() }),
            },
            utilitySource: {
                escapeHtml,
                renderIconHtml,
                normalizeCanvasColor,
            },
            projectSource: {
                getProject: () => project,
            },
            selectionSource: {
                getSelectedNodeId: () => selectedNodeId,
                getSelectedNodeIds: () => selectedNodeIds,
                getSelectedEdgeId: () => selectedEdgeId,
                getSelectedGroupId: () => selectedGroupId,
                getSelectedNodeIdList,
            },
            nodeSource: {
                getNode,
                isNodeLocked,
                isNodeIgnored,
                isNodeCollapsed,
                isImageCompareSource,
                isTimelineSource,
                isDirectorTimelineNode,
                isQwenTtsNode,
                nodeCustomColor,
                expandCanvasHexColor,
                getSlotLabel,
            },
            groupSource: {
                getGroup,
                getNodesInsideGroup,
                getGroupRect,
            },
            rendererSource: {
                getNodeInspectorRenderer,
            },
            storageSource: {
                storageDisplayLocation,
                storageDisplayPath,
                getStorageScope: () => storageScope,
                getStorageKey: () => storageKey,
            },
            uiSource: {
                getInspector: () => inspector,
                ensureWorkbenchFormFieldNames,
                bindInspectorEvents,
            },
        }
    };
    const VLM_CHAT_IMAGE_PREVIEW_CONTEXT_SOURCE = {
        domSource: {
            document,
            getRoot: () => root,
        },
        viewportSource: {
            window,
        },
        configSource: {
            getTargetPixels: () => VLM_CHAT_IMAGE_PREVIEW_TARGET_PIXELS,
        },
        utilitySource: {
            escapeHtml,
        },
        tooltipSource: {
            hideCanvasTooltip: (...args) => hideCanvasTooltip(...args),
        },
    };
    const VLM_CHAT_INPUT_CONTEXT_SOURCE = {
        domSource: {
            getDocument: () => document,
            getNodeElement: (id) => id && nodesLayer
                ? nodesLayer.querySelector(`[data-node-id="${cssEscape(id)}"]`)
                : null,
        },
        viewportSource: {
            getViewport: () => viewport,
        },
        mediaSource: {
            isImageFile: (file) => isImageFile(file),
            disconnectVlmImageInput: (...args) => disconnectVlmImageInput(...args),
        },
        nodeSource: {
            isNodeLocked: (node) => isNodeLocked(node),
        },
        runSource: {
            updateVlmParam,
            runVlmNode,
        },
        stateSource: {
            isVlmNodeBusy,
        },
        uiSource: {
            showToast,
        },
        languageSource: {
            t,
        },
    };
    const VLM_CONTEXT_SOURCE = {
            nodeViewSource: VLM_NODE_VIEW_CONTEXT_SOURCE,
            vlmChatSource: VLM_CHAT_CONTEXT_SOURCE,
            vlmChatImagePreviewSource: VLM_CHAT_IMAGE_PREVIEW_CONTEXT_SOURCE,
            vlmChatInputSource: VLM_CHAT_INPUT_CONTEXT_SOURCE,
            nodeInteractionSource: NODE_INTERACTION_CONTEXT_SOURCE
    };
    const CANVAS_VLM_CONTEXT = typeof WORKBENCH_CANVAS_VLM_CONTEXT.createCanvasWorkbenchVlmContext === 'function'
        ? WORKBENCH_CANVAS_VLM_CONTEXT.createCanvasWorkbenchVlmContext({
            vlmSource: VLM_CONTEXT_SOURCE
        })
        : {};
    const CANVAS_NODE_VIEW_CONTEXT = CANVAS_VLM_CONTEXT.CANVAS_NODE_VIEW_CONTEXT || {};
    const CANVAS_VLM_CHAT_CONTEXT = CANVAS_VLM_CONTEXT.CANVAS_VLM_CHAT_CONTEXT || {};
    const CANVAS_NODE_INTERACTION_CONTEXT = CANVAS_VLM_CONTEXT.CANVAS_NODE_INTERACTION_CONTEXT || {};
    CANVAS_VLM_AGENT_CONTEXT = CANVAS_VLM_CONTEXT.CANVAS_VLM_AGENT_CONTEXT || CANVAS_VLM_CHAT_CONTEXT.CANVAS_VLM_AGENT_CONTEXT || {};
    CANVAS_TEXT_NODE_RENDERER = CANVAS_VLM_CONTEXT.CANVAS_TEXT_NODE_RENDERER || CANVAS_NODE_VIEW_CONTEXT.CANVAS_TEXT_NODE_RENDERER || null;
    CANVAS_VLM_NODE_CONTROLLER = CANVAS_VLM_CONTEXT.CANVAS_VLM_NODE_CONTROLLER || CANVAS_NODE_VIEW_CONTEXT.CANVAS_VLM_NODE_CONTROLLER || null;
    CANVAS_VLM_NODE_VIEW_CONTROLLER = CANVAS_VLM_CONTEXT.CANVAS_VLM_NODE_VIEW_CONTROLLER || CANVAS_NODE_VIEW_CONTEXT.CANVAS_VLM_NODE_VIEW_CONTROLLER || null;
    CANVAS_VLM_CHAT_CONTROLLER = CANVAS_VLM_CONTEXT.CANVAS_VLM_CHAT_CONTROLLER || CANVAS_VLM_CHAT_CONTEXT.CANVAS_VLM_CHAT_CONTROLLER || null;
    CANVAS_NODE_PARAM_CONTROLLER = CANVAS_VLM_CONTEXT.CANVAS_NODE_PARAM_CONTROLLER || CANVAS_NODE_INTERACTION_CONTEXT.CANVAS_NODE_PARAM_CONTROLLER || null;
    CANVAS_INSPECTOR_CONTROLLER = CANVAS_VLM_CONTEXT.CANVAS_INSPECTOR_CONTROLLER || CANVAS_NODE_INTERACTION_CONTEXT.CANVAS_INSPECTOR_CONTROLLER || null;
    const {
        CANVAS_VLM_CHAT_IMAGE_PREVIEW_CONTROLLER,
        vlmChatImagePreviewSizeFromDimensions,
        ensureVlmChatImagePreview,
        vlmChatImagePreviewSize,
        breakableVlmChatPreviewName,
        positionVlmChatImagePreview,
        showVlmChatImagePreview,
        hideVlmChatImagePreview,
        onVlmChatImagePreviewPointerOver,
        onVlmChatImagePreviewPointerMove,
        onVlmChatImagePreviewPointerOut,
        CANVAS_VLM_CHAT_INPUT_CONTROLLER,
        attachVlmImages,
        insertVlmChatCommand,
        runVlmRegenCommand,
        handleVlmChatDrop,
        handleVlmChatInputClick,
        handleVlmAgentActionClick,
        handleVlmChatMessageActionClick,
        handleVlmChatInputKeyDown,
        bindVlmChatDropEvents,
        focusVlmChatPromptInput
    } = CANVAS_VLM_CONTEXT;
    const AGENT_WORKFLOW_LAYOUT_SOURCE = {
        projectSource: {
            getProject: () => project,
            ensureProjectGroups,
            getGroup,
            setSelectedGroupId: value => CANVAS_SELECTION_CONTROLLER.setSelectedGroupFocus(value)
        },
        geometrySource: {
            getNodeRect,
            defaultNodeSize,
            defaultResultNodeSize,
            getCollapsedPromptNodeDefaultHeight: () => COLLAPSED_PROMPT_NODE_DEFAULT_HEIGHT,
            rectsOverlap
        },
        viewportSource: {
            getVisibleWorldRect,
            viewportCenterWorld: () => viewportCenterWorld(),
            centerViewportOnWorld
        },
        layoutSource: {
            buildNodeLayoutPatch,
            buildResultLayoutPatch
        },
        groupSource: {
            updateGroupPositionDom,
            buildGroupFieldPatch,
            buildAgentWorkflowGroup,
            buildProjectGroupAppendPatch
        },
        metadataSource: {
            buildAgentCreatedNodePatch,
            buildAgentWorkflowPresetPatch,
            normalizePresetName
        },
        domSource: {
            getDocument: () => document
        },
    };
    CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER = typeof WORKBENCH_CANVAS_AGENT_WORKFLOW_LAYOUT.createCanvasAgentWorkflowLayoutController === 'function'
        ? WORKBENCH_CANVAS_AGENT_WORKFLOW_LAYOUT.createCanvasAgentWorkflowLayoutController({
            workflowLayoutSource: AGENT_WORKFLOW_LAYOUT_SOURCE
        })
        : {};
    const canvasAgentWorkflowPresetPosition = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.canvasAgentWorkflowPresetPosition;
    const canvasAgentWorkflowPairRect = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.canvasAgentWorkflowPairRect;
    const canvasAgentWorkflowOccupiedRects = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.canvasAgentWorkflowOccupiedRects;
    const findOpenCanvasAgentWorkflowPresetPosition = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.findOpenCanvasAgentWorkflowPresetPosition;
    const canvasAgentReferenceWorkflowRect = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.canvasAgentReferenceWorkflowRect;
    const findOpenCanvasAgentReferencePresetPosition = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.findOpenCanvasAgentReferencePresetPosition;
    const canvasAgentReferenceWorkflowPresetPosition = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.canvasAgentReferenceWorkflowPresetPosition;
    const positionCanvasAgentReferenceWorkflow = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.positionCanvasAgentReferenceWorkflow;
    const positionCanvasAgentVideoMaskWorkflow = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.positionCanvasAgentVideoMaskWorkflow;
    const markCanvasAgentCreatedNode = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.markCanvasAgentCreatedNode;
    const vlmCanvasAgentWorkflowKey = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.vlmCanvasAgentWorkflowKey;
    const findCanvasAgentWorkflowPresetByKey = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.findCanvasAgentWorkflowPresetByKey;
    const tagCanvasAgentWorkflowPreset = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.tagCanvasAgentWorkflowPreset;
    const canvasAgentWorkflowBounds = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.canvasAgentWorkflowBounds;
    const fitCanvasAgentWorkflowGroup = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.fitCanvasAgentWorkflowGroup;
    const centerCanvasAgentWorkflow = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.centerCanvasAgentWorkflow;
    const createCanvasAgentWorkflowGroup = CANVAS_AGENT_WORKFLOW_LAYOUT_CONTROLLER.createCanvasAgentWorkflowGroup;
    let CANVAS_AGENT_MASK_WORKFLOW_CONTROLLER = {};
    const AGENT_MASK_WORKFLOW_SOURCE = {
        languageSource: {
            t
        },
        identitySource: {
            uid
        },
        projectSource: {
            getProject: () => project,
            getNode
        },
        assetSource: {
            getNodeLayerForgeAsset,
            assetMediaKind,
            assetDisplaySrc,
            getNodeImageSrc,
            createImageNodeFromSketchOutput
        },
        mediaSource: {
            canvasAgentMaskUploadSlot: (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentMaskUploadSlot?.(...args) || '',
            canvasAgentUploadSlotsForNode,
            isCanvasAgentMaskSlot,
            canNodeConnectToUploadSlot,
            createUploadEdge,
            syncResolutionConfigForPresetInputs
        },
        resultSource: {
            generatedResultNodesForPreset: (...args) => CANVAS_PRESET_RUN_RUNTIME_CONTROLLER.generatedResultNodesForPreset?.(...args) || [],
            isResultRefreshing,
            isCanvasRunActiveState,
            nodeStatusState,
            ensureGenerateEdge,
            buildReservedResultNode,
            buildProjectNodeAppendPatch,
            buildCanvasAgentReservedResultSource,
            presetGenerationStepValue,
            presetResultBasePosition
        },
        layoutSource: {
            defaultNodeSize,
            applyNodeLayoutPatch,
            createCanvasAgentWorkflowGroup,
            fitCanvasAgentWorkflowGroup,
            centerCanvasAgentWorkflow
        },
        agentSource: {
            getAgentState: () => canvasAgentState,
            dockCanvasAgentPanelBottomLeft,
            mutate,
            setCanvasAgentMessage,
            showToast,
            clearCanvasAgentRunInfo,
            setCanvasAgentRunInfo,
            setCanvasAgentSelection: (...args) => CANVAS_SELECTION_CONTROLLER.setCanvasAgentSelection(...args)
        },
        runtimeSource: {
            ensureWorkbenchLazyRuntime,
            runPresetNode
        },
        schedulerSource: {
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
        },
        sketchSource: {
            getSketchAdapter: () => getCanvasSketchAdapter()
        },
    };
    CANVAS_AGENT_MASK_WORKFLOW_CONTROLLER = typeof WORKBENCH_CANVAS_AGENT_MASK_WORKFLOW.createCanvasAgentMaskWorkflowController === 'function'
        ? WORKBENCH_CANVAS_AGENT_MASK_WORKFLOW.createCanvasAgentMaskWorkflowController({
            maskWorkflowSource: AGENT_MASK_WORKFLOW_SOURCE
        })
        : {};
    const createCanvasAgentReservedResultNode = CANVAS_AGENT_MASK_WORKFLOW_CONTROLLER.createCanvasAgentReservedResultNode;
    const canvasAgentManualMaskWorkflowNodes = CANVAS_AGENT_MASK_WORKFLOW_CONTROLLER.canvasAgentManualMaskWorkflowNodes;
    const findCanvasAgentReservedResultNodeForPreset = CANVAS_AGENT_MASK_WORKFLOW_CONTROLLER.findCanvasAgentReservedResultNodeForPreset;
    const runCanvasAgentManualMaskPreset = CANVAS_AGENT_MASK_WORKFLOW_CONTROLLER.runCanvasAgentManualMaskPreset;
    const prepareCanvasAgentManualMaskWorkflow = CANVAS_AGENT_MASK_WORKFLOW_CONTROLLER.prepareCanvasAgentManualMaskWorkflow;
    const PRESET_RUN_LOCK_CONTEXT_SOURCE = {
        timeSource: {
            now: () => canvasNow()
        },
        staleAfterMs: 15000
    };
    const PRESET_RUN_LOCK_CONTROLLER = typeof WORKBENCH_PRESET_RUN_LOCK.createCanvasPresetRunLockController === 'function'
        ? WORKBENCH_PRESET_RUN_LOCK.createCanvasPresetRunLockController({
            presetRunLockSource: PRESET_RUN_LOCK_CONTEXT_SOURCE
        })
        : {};
    const getPendingPresetRunSet = () => PRESET_RUN_LOCK_CONTROLLER.getPendingPresetRuns?.() || new Set();
    const isPendingPresetRun = runKey => !!PRESET_RUN_LOCK_CONTROLLER.isPending?.(runKey);
    const markPendingPresetRun = runKey => PRESET_RUN_LOCK_CONTROLLER.markPending?.(runKey);
    const clearPendingPresetRun = runKey => PRESET_RUN_LOCK_CONTROLLER.clearPending?.(runKey);
    const recoverStalePendingPresetRun = (runKey, options) => !!PRESET_RUN_LOCK_CONTROLLER.recoverStale?.(runKey, options);
    const CANVAS_RUN_POLLING_CONTEXT_SOURCE = {
        timingSource: {
            setTimeout: (...args) => window.setTimeout(...args)
        },
        runtimeSource: {
            isTerminalRunState
        }
    };
    const CANVAS_RUN_POLLING_CONTROLLER = typeof WORKBENCH_CANVAS_RUN_POLLING.createCanvasRunPollingController === 'function'
        ? WORKBENCH_CANVAS_RUN_POLLING.createCanvasRunPollingController({
            runPollingSource: CANVAS_RUN_POLLING_CONTEXT_SOURCE
        })
        : {};
    const pollRunWithController = (runId, options) => typeof CANVAS_RUN_POLLING_CONTROLLER.pollRun === 'function'
        ? CANVAS_RUN_POLLING_CONTROLLER.pollRun(runId, options)
        : Promise.resolve({ ok: false, error: 'run polling controller unavailable' });
    const CANVAS_GALLERY_REFRESH_CONTEXT_SOURCE = {
        windowSource: {
            getWindow: () => window
        },
        timingSource: {
            setTimeout: (...args) => window.setTimeout(...args)
        },
        domSource: {
            getDocument: () => document
        },
        uiSource: {
            clickGradioButton: typeof clickGradioButton === 'function' ? clickGradioButton : null,
            getGradioApp: typeof gradioApp === 'function' ? gradioApp : null
        },
        diagnosticsSource: {
            warn: (...args) => console.warn(...args),
            info: (...args) => console.info(...args)
        }
    };
    const CANVAS_GALLERY_REFRESH_CONTROLLER = typeof WORKBENCH_CANVAS_GALLERY_REFRESH.createCanvasGalleryRefreshController === 'function'
        ? WORKBENCH_CANVAS_GALLERY_REFRESH.createCanvasGalleryRefreshController({
            galleryRefreshSource: CANVAS_GALLERY_REFRESH_CONTEXT_SOURCE
        })
        : {};
    const refreshMainGalleryAfterCanvasRun = (...args) => CANVAS_GALLERY_REFRESH_CONTROLLER.refreshMainGalleryAfterCanvasRun?.(...args);
    const PRESET_RUN_RUNTIME_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            getNode: (...args) => getNode(...args)
        },
        runSource: {
            buildCanvasRunResponsePatch: (...args) => buildCanvasRunResponsePatch(...args),
            buildCanvasDryRunPatch: (...args) => buildCanvasDryRunPatch(...args),
            buildDirectorSegmentRunRecord: (...args) => buildDirectorSegmentRunRecord(...args)
        },
        resultSource: {
            buildResultRunMetadataPatch: (...args) => buildResultRunMetadataPatch(...args),
            buildResultStatusPatch: (...args) => buildResultStatusPatch(...args),
            buildResultAssetPatch: (...args) => buildResultAssetPatch(...args),
            buildResultOutputPatch: (...args) => buildResultOutputPatch(...args),
            buildResultPreviewPatch: (...args) => buildResultPreviewPatch(...args),
            buildResultDryRunSourcePatch: (...args) => buildResultDryRunSourcePatch(...args),
            buildResultRefreshFailurePatch: (...args) => buildResultRefreshFailurePatch(...args),
            buildResultRefreshReconciledPatch: (...args) => buildResultRefreshReconciledPatch(...args),
            buildResultRefreshPreparingPatch: (...args) => buildResultRefreshPreparingPatch(...args),
            buildResultRefreshClearedPatch: (...args) => buildResultRefreshClearedPatch(...args),
            buildQueuedResultNode: (...args) => buildQueuedResultNode(...args),
            buildResultLayoutPatch: (...args) => buildResultLayoutPatch(...args),
            canvasAgentResultForPresetRun: (...args) => canvasAgentResultForPresetRun(...args),
            isTerminalRunState: (...args) => isTerminalRunState(...args),
            syncCanvasProjectAssetRootFromAsset: (...args) => syncCanvasProjectAssetRootFromAsset(...args),
            syncCanvasProjectAssetRootFromAssets: (...args) => syncCanvasProjectAssetRootFromAssets(...args)
        },
        stateSource: {
            nodeStatusState: (...args) => nodeStatusState(...args),
            isResultRefreshing: (...args) => isResultRefreshing(...args),
            isCanvasRunActiveState: (...args) => isCanvasRunActiveState(...args),
            resultNodeHasOutput: (...args) => resultNodeHasOutput(...args)
        },
        assetSource: {
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
            serializeAssetSourceForRun: (...args) => serializeAssetSourceForRun(...args)
        },
        directorSource: {
            directorSegmentUsesPreviousImage: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentUsesPreviousImage?.(...args) || false,
            directorSegmentUsesPreviousVideo: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentUsesPreviousVideo?.(...args) || false,
            directorResultAssetSource: (...args) => CANVAS_DIRECTOR_SEGMENT_PAYLOAD_CONTROLLER.directorResultAssetSource?.(...args) || null,
            directorSegmentPrompt: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorSegmentPrompt?.(...args) || '',
            directorRunContextForPreset: (...args) => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorRunContextForPreset?.(...args) || null,
            runDirectorSegmentedPresetNode: (...args) => runDirectorSegmentedPresetNode(...args)
        },
        lockSource: {
            isPendingPresetRun: (...args) => isPendingPresetRun(...args),
            recoverStalePendingPresetRun: (...args) => recoverStalePendingPresetRun(...args),
            markPendingPresetRun: (...args) => markPendingPresetRun(...args),
            clearPendingPresetRun: (...args) => clearPendingPresetRun(...args)
        },
        preflightSource: {
            canvasAgentPromptTargetFromNode: (...args) => canvasAgentPromptTargetFromNode(...args),
            canvasRunPromptParamText: (...args) => canvasRunPromptParamText(...args),
            buildWildcardPreviewForNode: (...args) => buildWildcardPreviewForNode(...args),
            ensureCanvasAgentPromptPreflightAllows: (...args) => ensureCanvasAgentPromptPreflightAllows(...args),
            getPresetCatalogEntryForNode: (...args) => getPresetCatalogEntryForNode(...args),
            canvasAgentPresetPromptDefaults: (...args) => canvasAgentPresetPromptDefaults(...args),
            getPromptTextSourceNode: (...args) => getPromptTextSourceNode(...args),
            updateNodeParam: (...args) => updateNodeParam(...args)
        },
        modelSource: {
            checkPresetModelStatus: (...args) => checkPresetModelStatus(...args),
            openMainMissingModelListForPreset: (...args) => openMainMissingModelListForPreset(...args)
        },
        fingerprintSource: {
            computePresetRunFingerprint: (...args) => CANVAS_PRESET_RUN_FINGERPRINT_CONTROLLER.computePresetRunFingerprint?.(...args) || ''
        },
        payloadSource: {
            getPresetUploadRunEdges: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.getPresetUploadRunEdges?.(...args) || [],
            applyDirectorTimelineMediaToPresetPayload: (...args) => CANVAS_DIRECTOR_SEGMENT_PAYLOAD_CONTROLLER.applyDirectorTimelineMediaToPresetPayload?.(...args) ?? args[0],
            applyDirectorSegmentToPresetPayload: (...args) => CANVAS_DIRECTOR_SEGMENT_PAYLOAD_CONTROLLER.applyDirectorSegmentToPresetPayload?.(...args) ?? args[0],
            serializeClassicNodeForRun: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializeClassicNodeForRun?.(...args) || {},
            serializePresetForRun: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializePresetForRun?.(...args) || {}
        },
        patchSource: {
            buildResultSourcePatch: (...args) => buildResultSourcePatch(...args),
            buildResultProducerPatch: (...args) => buildResultProducerPatch(...args),
            buildProjectRunAppendPatch: (...args) => buildProjectRunAppendPatch(...args),
            buildProjectNodeAppendPatch: (...args) => buildProjectNodeAppendPatch(...args),
            buildPresetRunRecord: (...args) => buildPresetRunRecord(...args)
        },
        previewSource: {
            resultPreviewFreshFrames: (...args) => resultPreviewFreshFrames(...args),
            applyResultPreviewStream: (...args) => applyResultPreviewStream(...args),
            appendResultNodePreviewFrames: (...args) => appendResultNodePreviewFrames(...args),
            resultPreviewLastSerial: (...args) => resultPreviewLastSerial(...args),
            stopResultPreviewPlayer: (...args) => stopResultPreviewPlayer(...args)
        },
        statusSource: {
            isTerminalRunState: (...args) => isTerminalRunState(...args),
            buildCanvasRunStatus: (...args) => buildCanvasRunStatus(...args),
            mergeCanvasRunStatus: (...args) => mergeCanvasRunStatus(...args),
            buildCanvasNodeStatusPatch: (...args) => buildCanvasNodeStatusPatch(...args)
        },
        schedulerSource: {
            buildPlan: typeof schedulerBuildPlan === 'function' ? (...args) => schedulerBuildPlan(...args) : null,
            refreshResultStaleFlags: (...args) => CANVAS_RESULT_STALENESS_CONTROLLER.refreshResultStaleFlags?.(...args) || false,
            refreshingSourceIdsFromPlan: plan => CANVAS_SCHEDULER_RUN_CONTROLLER.refreshingSourceIdsFromPlan?.(plan) || [],
            setBlockedSchedulerFromPlan: (plan, options) => CANVAS_SCHEDULER_STATE_CONTROLLER.setBlockedSchedulerFromPlan?.(plan, options),
            waitForRefreshingSources: (...args) => waitForRefreshingSources(...args),
            clearSchedulerBlockedState: () => !!CANVAS_SCHEDULER_STATE_CONTROLLER.clearSchedulerBlockedState?.()
        },
        renderSource: {
            mutate: (...args) => mutate(...args),
            pollUpdate: (...args) => pollUpdate(...args),
            renderNodes: (...args) => renderNodes(...args),
            renderEdges: (...args) => renderEdges(...args),
            renderAll: (...args) => renderAll(...args)
        },
        persistenceSource: {
            scheduleSave: (...args) => scheduleSave(...args)
        },
        layoutSource: {
            ensureResultNodeReadableSize: (...args) => ensureResultNodeReadableSize(...args),
            getNodeRect: (...args) => getNodeRect(...args),
            centerViewportOnWorld: (...args) => centerViewportOnWorld(...args),
            presetResultBasePosition: (...args) => presetResultBasePosition(...args),
            defaultResultNodeSize: (...args) => defaultResultNodeSize(...args),
            applyNodeLayoutPatch: (...args) => applyNodeLayoutPatch(...args)
        },
        requestSource: {
            sendCanvasPollRunRequest: (...args) => sendCanvasPollRunRequest(...args),
            sendCanvasRunNodeRequest: (...args) => sendCanvasRunNodeRequest(...args)
        },
        pollingSource: {
            pollRunWithController: (...args) => pollRunWithController(...args)
        },
        gallerySource: {
            refreshMainGalleryAfterCanvasRun: (...args) => refreshMainGalleryAfterCanvasRun(...args)
        },
        languageSource: {
            t: (...args) => t(...args)
        },
        uiSource: {
            showToast: (...args) => showToast(...args),
            confirm: (...args) => window.confirm(...args),
            getCanvasAgentPanel: () => canvasAgentPanel
        },
        selectionSource: {
            setSelection: node => CANVAS_SELECTION_CONTROLLER.setOptionalNodeSelectionPreservingGroup(node?.id)
        },
        directorRunCoordinatorSource: {
            updateStatus: (node, state, message) => {
                Object.assign(node, buildDirectorTimelineStatePatch(node, {
                    status: buildCanvasRunStatus(state, message)
                }));
            },
            preflight: (...args) => preflightDirectorSegmentPrompts(...args),
            createResult: (...args) => createDirectorSegmentResultNode(...args),
            submitSegment: (...args) => CANVAS_PRESET_RUN_RUNTIME_CONTROLLER.submitDirectorSegmentRun?.(...args)
                || Promise.resolve({ ok: false, error: 'preset run runtime controller unavailable' }),
            selectInitialResult: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(nodeId),
            clearSchedulerBlockedState: () => !!CANVAS_SCHEDULER_STATE_CONTROLLER.clearSchedulerBlockedState?.(),
            selectFinalResult: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingEdgeAndGroup(nodeId),
            chainOutput: capability => CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorCapabilityChainOutput?.(capability) || 'timeline',
            prepareTimeline: (...args) => prepareDirectorSegmentTimeline(...args),
            renderTimeline: (...args) => renderTimelineToResult(...args)
        },
        historySource: {
            pushHistory: (...args) => pushHistory(...args)
        },
        workflowSource: {
            ensureGenerateEdge: (...args) => ensureGenerateEdge(...args),
            dockCanvasAgentPanelBottomLeft: (...args) => dockCanvasAgentPanelBottomLeft(...args),
            createCanvasAgentWorkflowGroup: (...args) => createCanvasAgentWorkflowGroup(...args)
        },
        serializationSource: {
            cloneRunValue: (...args) => cloneRunValue(...args)
        },
        utilitySource: {
            clamp: (...args) => clamp(...args)
        },
        timeSource: {
            nowIso: (...args) => nowIso(...args)
        },
        identitySource: {
            uid: (...args) => uid(...args)
        }
    };
    const CANVAS_PRESET_RUN_RUNTIME_CONTROLLER = typeof WORKBENCH_CANVAS_PRESET_RUN_RUNTIME.createCanvasPresetRunRuntimeController === 'function'
        ? WORKBENCH_CANVAS_PRESET_RUN_RUNTIME.createCanvasPresetRunRuntimeController({
            presetRunRuntimeSource: PRESET_RUN_RUNTIME_CONTEXT_SOURCE
        })
        : {};
    const RESULT_STATUS_DOM_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        domSource: {
            getRoot: () => root,
            getNodesLayer: () => nodesLayer
        },
        stateSource: {
            isNodeVisuallyRunning: (...args) => isNodeVisuallyRunning(...args)
        },
        renderSource: {
            refreshResultNodePreviewDom: (...args) => refreshResultNodePreviewDom(...args),
            refreshActiveResultInspector: (...args) => refreshActiveResultInspector(...args),
            renderStatus: (...args) => renderStatus(...args),
            renderRunQueuePanelIfOpen: (...args) => renderRunQueuePanelIfOpen(...args)
        },
        utilitySource: {
            clamp: (...args) => clamp(...args),
            escapeNodeId: (id) => CSS.escape(id)
        }
    };
    CANVAS_RESULT_STATUS_DOM_CONTROLLER = typeof WORKBENCH_CANVAS_RESULT_STATUS_DOM.createCanvasResultStatusDomController === 'function'
        ? WORKBENCH_CANVAS_RESULT_STATUS_DOM.createCanvasResultStatusDomController({
            resultStatusDomSource: RESULT_STATUS_DOM_CONTEXT_SOURCE
        })
        : {};
    const refreshResultStatusDom = (...args) => !!CANVAS_RESULT_STATUS_DOM_CONTROLLER.refreshResultStatusDom?.(...args);
    const RESULT_RUN_ACTION_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            getNode: (...args) => getNode(...args),
            isQwenTtsNode: (...args) => isQwenTtsNode(...args)
        },
        stateSource: {
            nodeStatusState: (...args) => nodeStatusState(...args),
            isTerminalRunState: (...args) => isTerminalRunState(...args),
            isCanvasRunActiveState: (...args) => isCanvasRunActiveState(...args)
        },
        requestSource: {
            sendCanvasControlRunRequest: (...args) => sendCanvasControlRunRequest(...args),
            sendCanvasQwenTtsControlRequest: (...args) => sendCanvasQwenTtsControlRequest(...args)
        },
        presetRuntimeSource: {
            applyCanvasRunStatus: (...args) => CANVAS_PRESET_RUN_RUNTIME_CONTROLLER.applyCanvasRunStatus?.(...args),
            pollCanvasRun: (...args) => CANVAS_PRESET_RUN_RUNTIME_CONTROLLER.pollCanvasRun?.(...args)
                || Promise.resolve({ ok: false, error: 'preset run runtime controller unavailable' }),
            runPresetNode: (...args) => runPresetNode(...args)
        },
        qwenRuntimeSource: {
            applyQwenTtsRunStatus: (...args) => QWEN_TTS_RUNTIME_CONTROLLER.applyQwenTtsRunStatus?.(...args),
            pollQwenTtsRun: (...args) => QWEN_TTS_RUNTIME_CONTROLLER.pollQwenTtsRun?.(...args)
                || Promise.resolve({ ok: false, error: 'Qwen TTS runtime controller unavailable' }),
            runQwenTtsNode: (...args) => runQwenTtsNode(...args)
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        },
        uiSource: {
            showToast: (...args) => showToast(...args)
        },
        diagnosticsSource: {
            warn: (...args) => console.warn(...args)
        }
    };
    CANVAS_RESULT_RUN_ACTION_CONTROLLER = typeof WORKBENCH_CANVAS_RESULT_RUN_ACTION.createCanvasResultRunActionController === 'function'
        ? WORKBENCH_CANVAS_RESULT_RUN_ACTION.createCanvasResultRunActionController({
            resultRunActionSource: RESULT_RUN_ACTION_CONTEXT_SOURCE
        })
        : {};
    const RESULT_MEDIA_CONVERSION_CONTEXT_SOURCE = {
        resultAssetSource: {
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
            getResultAssetAt: (...args) => CANVAS_RESULT_ASSET_CONTROLLER.getResultAssetAt?.(...args) || null,
            selectResultAsset: (...args) => CANVAS_RESULT_ASSET_CONTROLLER.selectResultAsset?.(...args) || null
        },
        mediaSource: {
            assetMediaKind: (...args) => assetMediaKind(...args),
            createMediaNodeFromAsset: (...args) => createMediaNodeFromAsset(...args)
        },
        historySource: {
            pushHistory: (...args) => pushHistory(...args)
        },
        selectionSource: {
            setSelectedNode: node => CANVAS_SELECTION_CONTROLLER.setOptionalNodeSelectionPreservingGroup(node?.id),
            clearResultSelection: () => CANVAS_SELECTION_CONTROLLER.focusNodePreservingSelection(null)
        },
        renderSource: {
            mutate: (...args) => mutate(...args)
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        },
        uiSource: {
            showToast: (...args) => showToast(...args)
        }
    };
    CANVAS_RESULT_MEDIA_CONVERSION_CONTROLLER = typeof WORKBENCH_CANVAS_RESULT_MEDIA_CONVERSION.createCanvasResultMediaConversionController === 'function'
        ? WORKBENCH_CANVAS_RESULT_MEDIA_CONVERSION.createCanvasResultMediaConversionController({
            resultMediaConversionSource: RESULT_MEDIA_CONVERSION_CONTEXT_SOURCE
        })
        : {};
    const RESULT_METADATA_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        nodeSource: {
            getNode: (...args) => getNode(...args)
        },
        presetSource: {
            presetParamValue: (...args) => presetParamValue(...args)
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    CANVAS_RESULT_METADATA_CONTROLLER = typeof WORKBENCH_CANVAS_RESULT_METADATA.createCanvasResultMetadataController === 'function'
        ? WORKBENCH_CANVAS_RESULT_METADATA.createCanvasResultMetadataController({
            resultMetadataSource: RESULT_METADATA_CONTEXT_SOURCE
        })
        : {};
    const RESULT_INSPECTOR_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        selectionSource: {
            getSelectedNodeId: () => selectedNodeId
        },
        nodeSource: {
            getNode: (...args) => getNode(...args)
        },
        resultAssetSource: {
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args)
        },
        stateSource: {
            isCanvasRunActiveState: (...args) => isCanvasRunActiveState(...args),
            isResultStale: (...args) => isResultStale(...args),
            nodeStatusState: (...args) => nodeStatusState(...args)
        },
        assetSource: {
            assetMediaKind: (...args) => assetMediaKind(...args),
            assetMediaIcon: (...args) => assetMediaIcon(...args),
            readAssetSize: (...args) => readAssetSize(...args)
        },
        renderSource: {
            renderGenerationMetadataInspectorSection: (...args) => renderGenerationMetadataInspectorSection(...args),
            renderInspector: (...args) => renderInspector(...args)
        },
        resultRunActionSource: {
            controlResultRun: (...args) => controlResultRun(...args),
            retryResultRun: (...args) => retryResultRun(...args)
        },
        mediaConversionSource: {
            convertResultToMediaNode: (...args) => convertResultToMediaNode(...args),
            expandResultAssetsToMediaNodes: (...args) => expandResultAssetsToMediaNodes(...args)
        },
        actionSource: {
            openAssetViewer: (...args) => openAssetViewer(...args),
            renderTimelineToResult: (...args) => renderTimelineToResult(...args),
            replaceNodeImage: (...args) => replaceNodeImage(...args),
            openLayerForgeForNode: (...args) => openLayerForgeForNode(...args),
            deleteResultNode: (node) => {
                CANVAS_SELECTION_CONTROLLER.setNodeSelectionIncludingEmpty(node.id);
                return deleteSelection({ forceNode: true });
            }
        },
        utilitySource: {
            escapeHtml: (...args) => escapeHtml(...args)
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    CANVAS_RESULT_INSPECTOR_CONTROLLER = typeof WORKBENCH_CANVAS_RESULT_INSPECTOR.createCanvasResultInspectorController === 'function'
        ? WORKBENCH_CANVAS_RESULT_INSPECTOR.createCanvasResultInspectorController({
            resultInspectorSource: RESULT_INSPECTOR_CONTEXT_SOURCE
        })
        : {};
    const RESULT_CONTEXT_MENU_SOURCE = {
        projectSource: {
            getProject: () => project
        },
        resultAssetSource: {
            getResultAssetAt: (...args) => CANVAS_RESULT_ASSET_CONTROLLER.getResultAssetAt?.(...args) || null,
            selectResultAsset: (...args) => CANVAS_RESULT_ASSET_CONTROLLER.selectResultAsset?.(...args) || null
        },
        assetSource: {
            assetMediaKind: (...args) => assetMediaKind(...args),
            assetMediaIcon: (...args) => assetMediaIcon(...args)
        },
        actionSource: {
            createMediaNodeFromResultAsset: (...args) => createMediaNodeFromResultAsset(...args),
            expandResultAssetsToMediaNodes: (...args) => expandResultAssetsToMediaNodes(...args),
            openAssetViewer: (...args) => openAssetViewer(...args),
            copyAssetPath: (...args) => copyAssetPath(...args)
        },
        graphSource: {
            deleteEdge: (...args) => deleteEdge(...args)
        },
        historySource: {
            pushHistory: (...args) => pushHistory(...args)
        },
        renderSource: {
            mutate: (...args) => mutate(...args)
        },
        uiSource: {
            openContextMenu: (...args) => openContextMenu(...args),
            notConnectedText: (...args) => notConnectedText(...args)
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    CANVAS_RESULT_CONTEXT_MENU_CONTROLLER = typeof WORKBENCH_CANVAS_RESULT_CONTEXT_MENU.createCanvasResultContextMenuController === 'function'
        ? WORKBENCH_CANVAS_RESULT_CONTEXT_MENU.createCanvasResultContextMenuController({
            resultContextMenuSource: RESULT_CONTEXT_MENU_SOURCE
        })
        : {};
    const MEDIA_CONTEXT_MENU_SOURCE = {
        nodeSource: {
            getNodeImageSrc: (...args) => getNodeImageSrc(...args),
            isCanvasAgentImageTarget: (...args) => isCanvasAgentImageTarget(...args),
            getNodeLayerForgeAsset: (...args) => getNodeLayerForgeAsset(...args),
            isTimelineSource: (...args) => isTimelineSource(...args),
            isCanvasAgentAudioTarget: (...args) => isCanvasAgentAudioTarget(...args)
        },
        agentSource: {
            canvasAgentQuickTools: (...args) => canvasAgentQuickTools(...args),
            runCanvasAgentQuickTool: (...args) => runCanvasAgentQuickTool(...args),
            canvasAgentVideoQuickTools: (...args) => canvasAgentVideoQuickTools(...args),
            canvasAgentVideoQuickToolSpec: (...args) => canvasAgentVideoQuickToolSpec(...args),
            runCanvasAgentVideoQuickTool: (...args) => runCanvasAgentVideoQuickTool(...args),
            canvasAgentAudioQuickTools: (...args) => canvasAgentAudioQuickTools(...args),
            canvasAgentAudioQuickToolSpec: (...args) => canvasAgentAudioQuickToolSpec(...args),
            runCanvasAgentAudioQuickTool: (...args) => runCanvasAgentAudioQuickTool(...args),
            setCanvasAgentAudioBridgeSource: (...args) => setCanvasAgentAudioBridgeSource(...args),
            runCanvasAgentAudioBridgeFromNode: (...args) => runCanvasAgentAudioBridgeFromNode(...args)
        },
        mediaSource: {
            assetDisplaySrc: (...args) => assetDisplaySrc(...args),
            openAssetViewer: (...args) => openAssetViewer(...args),
            openMediaViewer: (...args) => openMediaViewer(...args),
            openSketchForNode: (...args) => openSketchForNode(...args),
            openPoseStudioEditor: (...args) => openPoseStudioEditor(...args),
            openGaussianStudioEditor: (...args) => openGaussianStudioEditor(...args),
            openLivePortraitExpressionEditor: (...args) => openLivePortraitExpressionEditor(...args)
        },
        actionSource: {
            replaceNodeImage: (...args) => replaceNodeImage(...args),
            openMaskEditor: (...args) => openMaskEditor(...args),
            reloadMediaNode: (...args) => reloadMediaNode(...args),
            createTimelineNodeFromSources: (...args) => createTimelineNodeFromSources(...args)
        },
        uiSource: {
            openContextMenu: (...args) => openContextMenu(...args)
        },
        languageSource: { t: (...args) => t(...args) }
    };
    CANVAS_MEDIA_CONTEXT_MENU_CONTROLLER = typeof WORKBENCH_CANVAS_MEDIA_CONTEXT_MENU.createCanvasMediaContextMenuController === 'function'
        ? WORKBENCH_CANVAS_MEDIA_CONTEXT_MENU.createCanvasMediaContextMenuController({
            mediaContextMenuSource: MEDIA_CONTEXT_MENU_SOURCE
        })
        : {};
    const NODE_CONTEXT_MENU_SOURCE = {
        nodeSource: {
            isLivePortraitVideoExpressionPresetNode: (...args) => isLivePortraitVideoExpressionPresetNode(...args),
            isLtx23MultiGuidePresetNode: (...args) => isLtx23MultiGuidePresetNode(...args),
            batchAnySelectedItemIds: (...args) => batchAnySelectedItemIds(...args),
            batchAnyCurrentItem: (...args) => batchAnyCurrentItem(...args),
            batchAnyTargets: (...args) => batchAnyTargets(...args),
            isCanvasAgentImageTarget: (...args) => isCanvasAgentImageTarget(...args),
            isCanvasRunActiveState: (...args) => isCanvasRunActiveState(...args),
            isImageCompareSource: (...args) => isImageCompareSource(...args),
            isTimelineSource: (...args) => isTimelineSource(...args),
            isVlmNodeBusy: (...args) => isVlmNodeBusy(...args),
            isQwenTtsNode: (...args) => isQwenTtsNode(...args),
            nodeStatusState: (...args) => nodeStatusState(...args),
            isNodeLocked: (...args) => isNodeLocked(...args),
            isNodeIgnored: (...args) => isNodeIgnored(...args),
            isNodeCollapsed: (...args) => isNodeCollapsed(...args)
        },
        projectSource: { getNode: (...args) => getNode(...args) },
        selectionSource: {
            selectNode: (...args) => selectNode(...args),
            getSelectedNodeIdList: (...args) => getSelectedNodeIdList(...args),
            duplicateSelection: (...args) => duplicateSelection(...args),
            deleteSelection: (...args) => deleteSelection(...args),
            toggleSelectedNodesFlag: (...args) => toggleSelectedNodesFlag(...args),
            alignSelectedNodes: (...args) => alignSelectedNodes(...args),
            distributeSelectedNodes: (...args) => distributeSelectedNodes(...args)
        },
        resultSource: {
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
            assetMediaKind: (...args) => assetMediaKind(...args),
            assetMediaIcon: (...args) => assetMediaIcon(...args),
            controlResultRun: (...args) => controlResultRun(...args),
            retryResultRun: (...args) => retryResultRun(...args),
            convertResultToMediaNode: (...args) => convertResultToMediaNode(...args),
            expandResultAssetsToMediaNodes: (...args) => expandResultAssetsToMediaNodes(...args)
        },
        actionSource: {
            runPresetNodeFromUi: (...args) => runPresetNodeFromUi(...args),
            openLivePortraitVideoExpressionPresetEditor: (...args) => openLivePortraitVideoExpressionPresetEditor(...args),
            openLtx23GuidePresetEditor: (...args) => openLtx23GuidePresetEditor(...args),
            openXyzPlotPanel: (...args) => openXyzPlotPanel(...args),
            handlePresetModelAction: (...args) => handlePresetModelAction(...args),
            runNodeChain: (node, mode) => CANVAS_SCHEDULER_RUN_CONTROLLER.runNodeChain?.(node, mode),
            ensureConfigNode: (...args) => ensureConfigNode(...args),
            runTranslationNode: (...args) => runTranslationNode(...args),
            openTagCartForNode: (...args) => openTagCartForNode(...args),
            openBatchAnyFilePicker: (...args) => openBatchAnyFilePicker(...args),
            deleteBatchAnyItems: (...args) => deleteBatchAnyItems(...args),
            runBatchAnyNode: (...args) => runBatchAnyNode(...args),
            refreshWildcardsCatalog: (...args) => refreshWildcardsCatalog(...args),
            openWildcardsManager: (...args) => openWildcardsManager(...args),
            toggleNoteTail: (...args) => toggleNoteTail(...args),
            resetNoteTail: (...args) => resetNoteTail(...args),
            runCameraMotionNode: (...args) => runCameraMotionNode(...args),
            clearCameraMotionNode: (...args) => clearCameraMotionNode(...args),
            focusXyzMatrixSource: (...args) => focusXyzMatrixSource(...args),
            reloadMediaNode: (...args) => reloadMediaNode(...args),
            replaceNodeImage: (...args) => replaceNodeImage(...args),
            createCompareNodeFromSources: (...args) => createCompareNodeFromSources(...args),
            createTimelineNodeFromSources: (...args) => createTimelineNodeFromSources(...args),
            addSelectedMediaToTimeline: (...args) => addSelectedMediaToTimeline(...args),
            runWd14Node: (...args) => runWd14Node(...args),
            stopVlmChatNode: (...args) => stopVlmChatNode(...args),
            runVlmNode: (...args) => runVlmNode(...args),
            stopQwenTtsNode: (...args) => stopQwenTtsNode(...args),
            runQwenTtsNode: (...args) => runQwenTtsNode(...args)
        },
        mediaSource: {
            openPoseStudioEditor: (...args) => openPoseStudioEditor(...args),
            openMediaViewer: (...args) => openMediaViewer(...args),
            openGaussianStudioEditor: (...args) => openGaussianStudioEditor(...args),
            openLivePortraitExpressionEditor: (...args) => openLivePortraitExpressionEditor(...args),
            openAssetViewer: (...args) => openAssetViewer(...args),
            openImageViewer: (...args) => openImageViewer(...args),
            openSketchForNode: (...args) => openSketchForNode(...args)
        },
        menuSource: {
            appendAudioWorkflowBridgeMenuItems: (...args) => CANVAS_MEDIA_CONTEXT_MENU_CONTROLLER.appendAudioWorkflowBridgeMenuItems(...args)
        },
        eventSource: {
            selectResultAsset: (...args) => CANVAS_RESULT_ASSET_CONTROLLER.selectResultAsset?.(...args) || null,
            openResultAssetContextMenu: (...args) => openResultAssetContextMenu(...args),
            openImageMediaContextMenu: (...args) => openImageMediaContextMenu(...args),
            openVideoMediaContextMenu: (...args) => openVideoMediaContextMenu(...args),
            openAudioMediaContextMenu: (...args) => openAudioMediaContextMenu(...args),
            getInputPortHandleSelector: () => INPUT_PORT_HANDLE_SELECTOR,
            getConnectionTargetFromHandle: (...args) => getConnectionTargetFromHandle(...args),
            openInputPortContextMenu: (...args) => openInputPortContextMenu(...args),
            openInputHandleContextMenu: (...args) => openInputHandleContextMenu(...args),
            openConfigHandleContextMenu: (...args) => openConfigHandleContextMenu(...args),
            openTextHandleContextMenu: (...args) => openTextHandleContextMenu(...args),
            openTextNodeInputContextMenu: (...args) => openTextNodeInputContextMenu(...args),
            openResultInputContextMenu: (...args) => openResultInputContextMenu(...args),
            openCompareImageInputContextMenu: (...args) => openCompareImageInputContextMenu(...args),
            openWd14ImageInputContextMenu: (...args) => openWd14ImageInputContextMenu(...args),
            openVlmImageInputContextMenu: (...args) => openVlmImageInputContextMenu(...args),
            openMaskSourceInputContextMenu: (...args) => openMaskSourceInputContextMenu(...args),
            openPoseStudioReferenceContextMenu: (...args) => openPoseStudioReferenceContextMenu(...args),
            openGaussianStudioReferenceContextMenu: (...args) => openGaussianStudioReferenceContextMenu(...args),
            openBatchAnyInputContextMenu: (...args) => openBatchAnyInputContextMenu(...args),
            openTimelineKeyframeContextMenu: (...args) => openTimelineKeyframeContextMenu(...args),
            openTimelineClipContextMenu: (...args) => openTimelineClipContextMenu(...args),
            openVlmChatMessageContextMenu: (...args) => openVlmChatMessageContextMenu(...args)
        },
        uiSource: { openContextMenu: (...args) => openContextMenu(...args) },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    CANVAS_NODE_CONTEXT_MENU_CONTROLLER = typeof WORKBENCH_CANVAS_NODE_CONTEXT_MENU.createCanvasNodeContextMenuController === 'function'
        ? WORKBENCH_CANVAS_NODE_CONTEXT_MENU.createCanvasNodeContextMenuController({
            nodeContextMenuSource: NODE_CONTEXT_MENU_SOURCE
        })
        : {};
    let CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER = {};
    const AGENT_SAM3_WORKFLOW_SOURCE = {
        languageSource: {
            t
        },
        identitySource: {
            uid
        },
        timeSource: {
            now: () => canvasNow(),
            nowIso
        },
        runtimeSource: {
            setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
        },
        projectSource: {
            getProject: () => project,
            getNode,
            getGroup
        },
        stateSource: {
            getAgentState: () => canvasAgentState,
            isCanvasRunActiveState,
            nodeStatusState,
            getPendingPresetRuns: () => getPendingPresetRunSet(),
            mergeCanvasRunStatus
        },
        mediaSource: {
            isCanvasAgentVideoTarget,
            canvasAgentVideoMaskUploadSlot: (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentVideoMaskUploadSlot?.(...args) || '',
            canvasAgentVideoSourceUploadSlot: (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentVideoSourceUploadSlot?.(...args) || '',
            createSam3VideoMaskEdge,
            createUploadEdge
        },
        resultSource: {
            createCanvasAgentReservedResultNode,
            findActiveResultNodeForPreset: (...args) => CANVAS_PRESET_RUN_RUNTIME_CONTROLLER.findActiveResultNodeForPreset?.(...args) || null,
            findCanvasAgentReservedResultNodeForPreset
        },
        layoutSource: {
            getNodeRect,
            defaultNodeSize,
            applyNodeLayoutPatch,
            buildNodeLayoutPatch,
            addSam3VideoMaskNode,
            positionCanvasAgentVideoMaskWorkflow,
            fitCanvasAgentWorkflowGroup,
            createCanvasAgentWorkflowGroup,
            centerCanvasAgentWorkflow,
            centerViewportOnWorld
        },
        renderSource: {
            renderNodes,
            renderEdges,
            renderGroups
        },
        agentSource: {
            dockCanvasAgentPanelBottomLeft,
            mutate,
            setCanvasAgentRunInfo,
            clearCanvasAgentRunInfo,
            runPresetNode,
            showToast,
            setCanvasAgentMessage,
            setCanvasAgentSelection: (...args) => CANVAS_SELECTION_CONTROLLER.setCanvasAgentSelection(...args)
        },
        patchSource: {
            buildResultSourcePatch,
            buildSam3SourcePatch,
            buildSam3StatePatch,
            buildGroupFieldPatch
        },
        editorSource: {
            canvasAgentManualMaskWorkflowNodes,
            openSam3PointEditor
        },
        persistenceSource: {
            scheduleSave
        },
    };
    CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER = typeof WORKBENCH_CANVAS_AGENT_SAM3_WORKFLOW.createCanvasAgentSam3WorkflowController === 'function'
        ? WORKBENCH_CANVAS_AGENT_SAM3_WORKFLOW.createCanvasAgentSam3WorkflowController({
            sam3WorkflowSource: AGENT_SAM3_WORKFLOW_SOURCE
        })
        : {};
    const canvasAgentSam3WorkflowNodes = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.canvasAgentSam3WorkflowNodes;
    const canvasAgentSam3WorkflowTitle = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.canvasAgentSam3WorkflowTitle;
    const setCanvasAgentSam3WorkflowState = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.setCanvasAgentSam3WorkflowState;
    const canvasAgentSam3WorkflowMaskSignature = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.canvasAgentSam3WorkflowMaskSignature;
    const findCanvasAgentSam3WorkflowForPreset = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.findCanvasAgentSam3WorkflowForPreset;
    const canvasAgentResultForPresetRun = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.canvasAgentResultForPresetRun;
    const handleCanvasAgentSam3VideoMaskEditorClosed = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.handleCanvasAgentSam3VideoMaskEditorClosed;
    const handleCanvasAgentSam3VideoMaskState = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.handleCanvasAgentSam3VideoMaskState;
    const prepareCanvasAgentVideoMaskWorkflow = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.prepareCanvasAgentVideoMaskWorkflow;
    const handleCanvasAgentSam3VideoMaskReady = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.handleCanvasAgentSam3VideoMaskReady;
    const handleCanvasAgentWorkflowNodeDeletion = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.handleCanvasAgentWorkflowNodeDeletion;
    const handleCanvasAgentWorkflowEdgeDeletion = CANVAS_AGENT_SAM3_WORKFLOW_CONTROLLER.handleCanvasAgentWorkflowEdgeDeletion;

    const AGENT_MEDIA_CONTEXT_SOURCE = {
            mediaConnectionsSource: {
                languageSource: {
                    t,
                    runtimeUiLang
                },
                slotSource: {
                    getUploadSlotMediaKind,
                    getVisibleClassicUploadSlots,
                    getVisibleUploadSlots,
                    getSlotLabel
                },
                connectionSource: {
                    canNodeConnectToUploadSlot,
                    createUploadEdge
                },
                probeSource: {
                    createCanvasAgentPresetProbeNode,
                    getCanvasAgentTargetMediaKind,
                    buildClassicNodeStatePatch
                },
                nodeSource: {
                    createEmptyImageNodeForInput,
                    buildMediaNodeStatePatch,
                    buildAgentReferencePlaceholderPatch
                }
            },
            imageWorkflowSource: {
                languageSource: {
                    t
                },
                identitySource: {
                    uid
                },
                catalogSource: {
                    normalizePresetName,
                    getMaxExtraImageReferences: () => CANVAS_AGENT_MAX_EXTRA_IMAGE_REFERENCES,
                    refreshPresetCatalog,
                    chooseCanvasAgentPresetEntry,
                    getPresetCatalog,
                    canvasAgentPresetSupportsTask,
                    findPresetCatalogEntryByName,
                    findCanvasAgentPresetEntryByAlias
                },
                targetSource: {
                    getCanvasAgentTargetNode,
                    isCanvasAgentGeneratorTarget,
                    getNode,
                    findCanvasAgentWorkflowPresetByKey,
                    getPromptTextSourceNode,
                    getCanvasAgentPrimaryImageReference,
                    isCanvasAgentImageTarget,
                    canvasAgentReferenceNode,
                    getCanvasAgentExtraImageReferences,
                    canvasAgentShortNodeLabel
                },
                promptSource: {
                    resolveCanvasAgentPrompt,
                    canvasAgentPromptTargetFromNode,
                    canvasAgentPromptTargetFromEntry,
                    ensureCanvasAgentPromptMatchesTarget,
                    canvasAgentPresetPromptDefaults,
                    ensureCanvasAgentPromptPreflightAllows,
                    canvasAgentReferenceFacts,
                    canvasAgentResolutionLabel,
                    canvasAgentPromptSourceLabel,
                    canvasAgentPromptTargetFact,
                    canvasAgentPromptValidationFact,
                    canvasAgentPromptPreflightFacts,
                    canvasAgentPresetPromptDefaultsFacts,
                    canvasAgentModelStatusLabel,
                    canvasAgentPromptFromDecision,
                    getCanvasAgentRewriteModel
                },
                decisionSource: {
                    askCanvasAgentDecision,
                    canvasAgentPresetDecisionOptions,
                    canvasAgentPromptDecisionField
                },
                nodeSource: {
                    vlmCanvasAgentWorkflowKey,
                    addPresetNode,
                    canvasAgentWorkflowPresetPosition,
                    markCanvasAgentCreatedNode,
                    applyCanvasAgentPresetDefaultsToGenerator,
                    tagCanvasAgentWorkflowPreset,
                    normalizeCanvasAgentGenerationOptions
                },
                generatorSource: {
                    prepareCanvasAgentGenerator,
                    applyCanvasAgentPromptToGenerator,
                    applyCanvasAgentGenerationOptionsToGenerator,
                    applyCanvasAgentResolutionToGenerator
                },
                mediaSource: {
                    previewCanvasAgentEditInputSlot,
                    canvasAgentUploadSlotsForNode,
                    isCanvasAgentMaskSlot,
                    canNodeConnectToUploadSlot,
                    createUploadEdge
                },
                stateSource: {
                    resetCanvasAgentRunInfo,
                    setCanvasAgentMessage,
                    showToast,
                    mutate,
                    setCanvasAgentRunInfo,
                    clearCanvasAgentRunInfo,
                    setCanvasAgentSelection: (nodeId) => CANVAS_SELECTION_CONTROLLER.selectCanvasAgentNode(nodeId)
                },
                runtimeSource: {
                    runPresetNode
                }
            },
            videoWorkflowSource: {
                languageSource: {
                    t
                },
                identitySource: {
                    uid
                },
                catalogSource: {
                    normalizePresetName,
                    getMaxExtraImageReferences: () => CANVAS_AGENT_MAX_EXTRA_IMAGE_REFERENCES,
                    getMaxImageReferences: () => CANVAS_AGENT_MAX_IMAGE_REFERENCES,
                    chooseCanvasAgentPresetEntry,
                    canvasAgentPresetSupportsTask,
                    canvasAgentPresetSupportsMediaRequest,
                    findCanvasAgentPresetEntryByAlias
                },
                targetSource: {
                    getCanvasAgentTargetNode,
                    isCanvasAgentGeneratorTarget,
                    getCanvasAgentPrimaryMediaNode,
                    isCanvasAgentAudioTarget,
                    isCanvasAgentVideoTarget,
                    isCanvasAgentImageTarget,
                    canvasAgentShortNodeLabel
                },
                mediaSource: {
                    getCanvasAgentMediaReferenceNodes,
                    canvasAgentMediaNodeCounts,
                    canvasAgentVideoTaskForMedia,
                    canvasAgentVideoTaskLabel,
                    canvasAgentReferenceKey,
                    getCanvasAgentExtraImageReferences,
                    canvasAgentReferenceNode,
                    previewCanvasAgentMediaInputSlot: (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.previewCanvasAgentMediaInputSlot?.(...args) || null,
                    connectCanvasAgentMediaToGenerator: (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.connectCanvasAgentMediaToGenerator?.(...args) || { ok: false },
                    canvasAgentMediaConnectionError: (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentMediaConnectionError?.(...args) || '',
                    findCanvasAgentUploadSlotForTarget: (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.findCanvasAgentUploadSlotForTarget?.(...args) || '',
                    createUploadEdge
                },
                promptSource: {
                    resolveCanvasAgentPrompt,
                    canvasAgentPromptTargetFromNode,
                    canvasAgentPromptTargetFromEntry,
                    ensureCanvasAgentPromptPreflightAllows,
                    canvasAgentReferenceFacts,
                    canvasAgentMediaNodeFacts,
                    canvasAgentResolutionLabel,
                    canvasAgentPromptSourceLabel,
                    canvasAgentPromptTargetFact,
                    canvasAgentPromptValidationFact,
                    canvasAgentPromptPreflightFacts,
                    canvasAgentPresetPromptDefaultsFacts,
                    canvasAgentModelStatusLabel,
                    canvasAgentPromptFromDecision,
                    getCanvasAgentRewriteModel
                },
                decisionSource: {
                    askCanvasAgentDecision,
                    canvasAgentPresetDecisionOptions,
                    canvasAgentPromptDecisionField
                },
                nodeSource: {
                    addPresetNode,
                    canvasAgentWorkflowPresetPosition,
                    markCanvasAgentCreatedNode
                },
                generatorSource: {
                    applyCanvasAgentPromptToGenerator,
                    applyCanvasAgentResolutionToGenerator,
                    prepareCanvasAgentGenerator
                },
                stateSource: {
                    resetCanvasAgentRunInfo,
                    setCanvasAgentMessage,
                    showToast,
                    canvasAgentRunNodeSelection,
                    setCanvasAgentRunInfo,
                    clearCanvasAgentRunInfo
                },
                runtimeSource: {
                    runPresetNode
                }
            },
            videoToolsSource: {
                languageSource: {
                    t
                },
                identitySource: {
                    uid
                },
                utilitySource: {
                    normalizePresetName,
                    escapeHtml
                },
                catalogSource: {
                    getDefaultVideoOutpaintPreset: () => CANVAS_AGENT_DEFAULT_VIDEO_OUTPAINT_PRESET,
                    getDefaultVideoErasePreset: () => CANVAS_AGENT_DEFAULT_VIDEO_ERASE_PRESET,
                    getDefaultVideoReplacePreset: () => CANVAS_AGENT_DEFAULT_VIDEO_REPLACE_PRESET,
                    getDefaultVideoFaceSwapPreset: () => CANVAS_AGENT_DEFAULT_VIDEO_FACE_SWAP_PRESET,
                    getDefaultVideoFaceSwapTheme: () => CANVAS_AGENT_DEFAULT_VIDEO_FACE_SWAP_THEME,
                    getDefaultVideoMotionTransferPreset: () => CANVAS_AGENT_DEFAULT_VIDEO_MOTION_TRANSFER_PRESET,
                    getDefaultVideoMotionTransferTheme: () => CANVAS_AGENT_DEFAULT_VIDEO_MOTION_TRANSFER_THEME,
                    getDefaultVideoUpscalePreset: () => CANVAS_AGENT_DEFAULT_VIDEO_UPSCALE_PRESET,
                    findCanvasAgentPresetEntryByAlias
                },
                settingsSource: {
                    getCanvasAgentSettings
                },
                stateSource: {
                    getAgentState: () => canvasAgentState,
                    mutate,
                    setCanvasAgentRunInfo,
                    clearCanvasAgentRunInfo
                },
                referenceSource: {
                    getCanvasAgentPrimaryReferenceByKind,
                    canvasAgentReferenceNode,
                    normalizeCanvasAgentReferences,
                    addCanvasAgentReferenceFromNode
                },
                targetSource: {
                    getNode,
                    getCanvasAgentTargetNode,
                    isCanvasAgentImageTarget,
                    isCanvasAgentVideoTarget,
                    canvasAgentShortNodeLabel
                },
                uiSource: {
                    showToast,
                    setCanvasAgentMessage,
                    renderCanvasAgentPanel,
                    revealCanvasAgentPanelForToolCard,
                    setCanvasAgentSelection: (...args) => CANVAS_SELECTION_CONTROLLER.setCanvasAgentSelection(...args)
                },
                decisionSource: {
                    askCanvasAgentDecision,
                    canvasAgentPresetDecisionOptions,
                    canvasAgentPromptDecisionField,
                    canvasAgentPromptFromDecision
                },
                promptSource: {
                    canvasAgentPresetDefaultPromptForTheme
                },
                nodeSource: {
                    addPresetNode,
                    canvasAgentWorkflowPresetPosition,
                    markCanvasAgentCreatedNode,
                    addLivePortraitExpressionNode,
                    applyNodeLayoutPatch,
                    createLivePortraitExpressionImageEdge,
                    openLivePortraitExpressionEditor
                },
                generatorSource: {
                    applyCanvasAgentPromptToGenerator,
                    applyCanvasAgentResolutionToGenerator
                },
                mediaSource: {
                    canvasAgentUploadSlotsForNode,
                    canvasAgentVideoSourceUploadSlot: (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentVideoSourceUploadSlot?.(...args) || '',
                    canNodeConnectToUploadSlot,
                    createUploadEdge,
                    createCanvasAgentReferencePlaceholderForGenerator: (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.createCanvasAgentReferencePlaceholderForGenerator?.(...args) || null,
                    canvasAgentReferenceUploadSlotForGenerator: (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentReferenceUploadSlotForGenerator?.(...args) || '',
                    getUploadSlotMediaKind,
                    isCanvasAgentMaskSlot
                },
                workflowSource: {
                    createCanvasAgentWorkflowGroup,
                    centerCanvasAgentWorkflow,
                    prepareCanvasAgentVideoMaskWorkflow
                },
                layoutSource: {
                    getNodeRect,
                    defaultNodeSize,
                    viewportCenterWorld,
                    findOpenNodePosition
                },
                runtimeSource: {
                    runPresetNode,
                    setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
                }
            },
            imageToolsSource: {
                languageSource: {
                    t
                },
                identitySource: {
                    uid
                },
                utilitySource: {
                    normalizePresetName
                },
                configSource: {
                    getMaxExtraImageReferences: () => CANVAS_AGENT_MAX_EXTRA_IMAGE_REFERENCES,
                    getDefaultT2iPresetQueue: () => CANVAS_AGENT_DEFAULT_T2I_PRESET_QUEUE,
                    getCollapsedPromptNodeDefaultHeight: () => COLLAPSED_PROMPT_NODE_DEFAULT_HEIGHT,
                    getClassicOutpaintDirs: () => registryClassicOutpaintDirs || ['Left', 'Right', 'Top', 'Bottom']
                },
                catalogSource: {
                    findCanvasAgentPresetEntryByAlias,
                    canvasAgentPreferredUpscalePresetEntry
                },
                patchSource: {
                    buildNodeParamsPatch,
                    buildClassicNodeStatePatch
                },
                stateSource: {
                    getAgentState: () => canvasAgentState,
                    mutate,
                    setCanvasAgentRunInfo,
                    clearCanvasAgentRunInfo
                },
                settingsSource: {
                    getCanvasAgentSettings,
                    getOutpaintOverlayState: () => outpaintOverlayState,
                    setCanvasAgentSettingsPatch
                },
                targetSource: {
                    getNode,
                    getCanvasAgentTargetNode,
                    isCanvasAgentImageTarget,
                    canvasAgentShortNodeLabel
                },
                referenceSource: {
                    getCanvasAgentPrimaryImageReference,
                    getCanvasAgentExtraImageReferences,
                    canvasAgentReferenceNode,
                    addCanvasAgentReferenceFromNode
                },
                uiSource: {
                    showToast,
                    setCanvasAgentMessage,
                    renderCanvasAgentPanel,
                    revealCanvasAgentPanelForToolCard,
                    showOutpaintOverlay,
                    hideOutpaintOverlay,
                    setCanvasAgentSelection: (nodeId, nodeIds, groupId, options) =>
                        CANVAS_SELECTION_CONTROLLER.setCanvasAgentSelection(
                            nodeId, nodeIds, groupId, Object.assign({}, options, { clearEmptyGroup: true })
                        )
                },
                decisionSource: {
                    askCanvasAgentDecision,
                    canvasAgentPresetDecisionOptions,
                    canvasAgentUpscalePresetEntries,
                    canvasAgentPromptDecisionField,
                    canvasAgentPromptFromDecision
                },
                promptSource: {
                    canvasAgentPromptTargetFromEntry,
                    canvasAgentPresetPromptDefaults,
                    ensureCanvasAgentPromptMatchesTarget,
                    ensureCanvasAgentPromptPreflightAllows,
                    canvasAgentResolutionLabel,
                    canvasAgentPresetDefaultPrompt
                },
                workflowSource: {
                    runCanvasAgentLivePortraitExpressionQuickTool: (...args) => runCanvasAgentLivePortraitExpressionQuickTool(...args),
                    positionCanvasAgentReferenceWorkflow,
                    createCanvasAgentWorkflowGroup,
                    centerCanvasAgentWorkflow,
                    prepareCanvasAgentManualMaskWorkflow,
                    ensureStyleSelectorForPreset
                },
                nodeSource: {
                    addPresetNode,
                    canvasAgentWorkflowPresetPosition,
                    markCanvasAgentCreatedNode
                },
                generatorSource: {
                    applyCanvasAgentPromptToGenerator,
                    applyCanvasAgentResolutionToGenerator
                },
                mediaSource: {
                    canvasAgentUploadSlotsForNode,
                    isCanvasAgentMaskSlot,
                    canNodeConnectToUploadSlot,
                    createUploadEdge,
                    connectCanvasAgentImagesToGenerator: (...args) => connectCanvasAgentImagesToGenerator(...args),
                    createCanvasAgentReferencePlaceholderForGenerator: (...args) => createCanvasAgentReferencePlaceholderForGenerator(...args)
                },
                layoutSource: {
                    buildNodeLayoutPatch,
                    getNodeRect,
                    getVisibleWorldRect,
                    defaultNodeSize,
                    viewportCenterWorld,
                    canvasAgentWorkflowOccupiedRects,
                    rectsOverlap
                },
                runtimeSource: {
                    runPresetNode
                }
            },
            audioWorkflowSource: {
                languageSource: {
                    t
                },
                identitySource: {
                    uid
                },
                presetSource: {
                    normalizePresetName,
                    chooseCanvasAgentPresetEntry,
                    findCanvasAgentPresetEntryByAlias,
                    addPresetNode,
                    addQwenTtsNode,
                    qwenTtsModeLabel,
                    markCanvasAgentCreatedNode,
                    canvasAgentWorkflowPresetPosition
                },
                promptSource: {
                    resolveCanvasAgentPrompt,
                    canvasAgentPromptSourceLabel,
                    canvasAgentReferenceFacts,
                    canvasAgentModelStatusLabel,
                    canvasAgentPresetDecisionOptions,
                    canvasAgentPromptDecisionField,
                    canvasAgentPromptFromDecision,
                    getCanvasAgentRewriteModel
                },
                targetSource: {
                    getCanvasAgentPrimaryMediaNode,
                    isCanvasAgentAudioTarget,
                    canvasAgentShortNodeLabel
                },
                decisionSource: {
                    askCanvasAgentDecision
                },
                generatorSource: {
                    prepareCanvasAgentGenerator,
                    applyCanvasAgentPromptToGenerator,
                    applyCanvasAgentResolutionToGenerator
                },
                mediaSource: {
                    createUploadEdge
                },
                stateSource: {
                    resetCanvasAgentRunInfo,
                    setCanvasAgentMessage,
                    showToast,
                    setCanvasAgentRunInfo,
                    clearCanvasAgentRunInfo,
                    canvasAgentRunNodeSelection
                },
                runtimeSource: {
                    runQwenTtsNode,
                    runPresetNode
                }
            },
            audioToolsSource: {
                languageSource: {
                    t
                },
                capacitySource: {
                    getMaxAudioReferences: () => CANVAS_AGENT_MAX_AUDIO_REFERENCES
                },
                stateSource: {
                    getAgentState: () => canvasAgentState
                },
                uiSource: {
                    showToast,
                    setCanvasAgentMessage,
                    renderCanvasAgentPanel,
                    setCanvasAgentSelection: (nodeId) => CANVAS_SELECTION_CONTROLLER.selectCanvasAgentNode(nodeId)
                },
                referenceSource: {
                    normalizeCanvasAgentReferences,
                    canvasAgentReferenceKey,
                    canvasAgentReferenceCounts,
                    addCanvasAgentReferenceFromNode
                },
                targetSource: {
                    isCanvasAgentAudioTarget
                },
                workflowSource: {}
            },
            toolDispatchSource: {
                targetSource: {
                    getCanvasAgentTargetNode,
                    isCanvasAgentImageTarget,
                    isCanvasAgentVideoTarget,
                    isCanvasAgentAudioTarget
                },
                referenceSource: {
                    getCanvasAgentPrimaryImageReference,
                    getCanvasAgentPrimaryReferenceByKind,
                    canvasAgentReferenceNode
                },
                toolSource: {}
            }
    };
    const CANVAS_AGENT_MEDIA_CONTEXT = typeof WORKBENCH_CANVAS_AGENT_MEDIA_CONTEXT.createCanvasWorkbenchAgentMediaContext === 'function'
        ? WORKBENCH_CANVAS_AGENT_MEDIA_CONTEXT.createCanvasWorkbenchAgentMediaContext({
            agentMediaSource: AGENT_MEDIA_CONTEXT_SOURCE
        })
        : {};
    CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER = CANVAS_AGENT_MEDIA_CONTEXT.CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER || {};
    const connectCanvasAgentImagesToGenerator = (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.connectCanvasAgentImagesToGenerator?.(...args)
        || { ok: false, mainSlot: '', refCount: 0 };
    const connectCanvasAgentMediaToGenerator = (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.connectCanvasAgentMediaToGenerator?.(...args)
        || { ok: false };
    const canvasAgentMediaConnectionError = (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentMediaConnectionError?.(...args) || '';
    const canvasAgentReferenceUploadSlotForGenerator = (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentReferenceUploadSlotForGenerator?.(...args) || '';
    const createCanvasAgentReferencePlaceholderForGenerator = (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.createCanvasAgentReferencePlaceholderForGenerator?.(...args) || null;
    const findCanvasAgentUploadSlotForTarget = (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.findCanvasAgentUploadSlotForTarget?.(...args) || '';
    const canvasAgentMaskUploadSlot = (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentMaskUploadSlot?.(...args) || '';
    const canvasAgentVideoMaskUploadSlot = (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentVideoMaskUploadSlot?.(...args) || '';
    const canvasAgentVideoSourceUploadSlot = (...args) => CANVAS_AGENT_MEDIA_CONNECTIONS_CONTROLLER?.canvasAgentVideoSourceUploadSlot?.(...args) || '';
    const CANVAS_AGENT_IMAGE_WORKFLOW_CONTROLLER = CANVAS_AGENT_MEDIA_CONTEXT.CANVAS_AGENT_IMAGE_WORKFLOW_CONTROLLER || {};
    const runCanvasAgentTextToImage = CANVAS_AGENT_IMAGE_WORKFLOW_CONTROLLER.runCanvasAgentTextToImage;
    const runCanvasAgentImageEdit = CANVAS_AGENT_IMAGE_WORKFLOW_CONTROLLER.runCanvasAgentImageEdit;
    const CANVAS_AGENT_VIDEO_WORKFLOW_CONTROLLER = CANVAS_AGENT_MEDIA_CONTEXT.CANVAS_AGENT_VIDEO_WORKFLOW_CONTROLLER || {};
    const runCanvasAgentTextToVideo = CANVAS_AGENT_VIDEO_WORKFLOW_CONTROLLER.runCanvasAgentTextToVideo;
    const runCanvasAgentAudioToVideo = CANVAS_AGENT_VIDEO_WORKFLOW_CONTROLLER.runCanvasAgentAudioToVideo;
    const runCanvasAgentImageToVideo = CANVAS_AGENT_VIDEO_WORKFLOW_CONTROLLER.runCanvasAgentImageToVideo;
    const runCanvasAgentVideoReferenceToVideo = CANVAS_AGENT_VIDEO_WORKFLOW_CONTROLLER.runCanvasAgentVideoReferenceToVideo;
    const runCanvasAgentVideoEdit = CANVAS_AGENT_VIDEO_WORKFLOW_CONTROLLER.runCanvasAgentVideoEdit;
    const CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER = CANVAS_AGENT_MEDIA_CONTEXT.CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER || {};
    const encodeCanvasAgentVideoToolChoice = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.encodeCanvasAgentVideoToolChoice;
    const decodeCanvasAgentVideoToolChoice = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.decodeCanvasAgentVideoToolChoice;
    const canvasAgentVideoQuickToolCandidateSpecs = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.canvasAgentVideoQuickToolCandidateSpecs;
    const canvasAgentVideoQuickToolSpec = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.canvasAgentVideoQuickToolSpec;
    const canvasAgentVideoQuickToolPresetName = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.canvasAgentVideoQuickToolPresetName;
    const isCanvasAgentAnimateVideoPreset = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.isCanvasAgentAnimateVideoPreset;
    const canvasAgentVideoQuickToolRequiresSam3Mask = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.canvasAgentVideoQuickToolRequiresSam3Mask;
    const canvasAgentVideoQuickToolChoiceFromSettings = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.canvasAgentVideoQuickToolChoiceFromSettings;
    const canvasAgentVideoQuickToolChoiceLabel = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.canvasAgentVideoQuickToolChoiceLabel;
    const canvasAgentVideoQuickToolChoiceOptions = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.canvasAgentVideoQuickToolChoiceOptions;
    const canvasAgentVideoQuickToolChoiceOptionHtml = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.canvasAgentVideoQuickToolChoiceOptionHtml;
    const resolveCanvasAgentVideoQuickToolChoice = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.resolveCanvasAgentVideoQuickToolChoice;
    const canvasAgentVideoQuickTools = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.canvasAgentVideoQuickTools;
    const startCanvasAgentVideoReferencePickForTool = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.startCanvasAgentVideoReferencePickForTool;
    const getCanvasAgentVideoQuickToolImageReferences = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.getCanvasAgentVideoQuickToolImageReferences;
    const canvasAgentConnectVideoQuickToolImageReference = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.canvasAgentConnectVideoQuickToolImageReference;
    const runCanvasAgentLivePortraitExpressionQuickTool = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.runCanvasAgentLivePortraitExpressionQuickTool;
    const runCanvasAgentVideoQuickTool = CANVAS_AGENT_VIDEO_TOOLS_CONTROLLER.runCanvasAgentVideoQuickTool;
    const CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER = CANVAS_AGENT_MEDIA_CONTEXT.CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER || {};
    const canvasAgentQuickTools = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.canvasAgentQuickTools;
    const canvasAgentQuickToolSpec = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.canvasAgentQuickToolSpec;
    const canvasAgentQuickToolPresetName = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.canvasAgentQuickToolPresetName;
    const configureCanvasAgentQuickToolNode = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.configureCanvasAgentQuickToolNode;
    const canvasAgentStyleTransferWorkflowRect = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.canvasAgentStyleTransferWorkflowRect;
    const findOpenCanvasAgentStyleTransferPresetPosition = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.findOpenCanvasAgentStyleTransferPresetPosition;
    const canvasAgentStyleTransferPresetPosition = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.canvasAgentStyleTransferPresetPosition;
    const positionCanvasAgentStyleTransferWorkflow = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.positionCanvasAgentStyleTransferWorkflow;
    const runCanvasAgentQuickTool = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.runCanvasAgentQuickTool;
    const confirmOutpaintFromOverlay = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.confirmOutpaintFromOverlay;
    const createCanvasAgentStyleTransferWorkflow = CANVAS_AGENT_IMAGE_TOOLS_CONTROLLER.createCanvasAgentStyleTransferWorkflow;
    const CANVAS_AGENT_AUDIO_WORKFLOW_CONTROLLER = CANVAS_AGENT_MEDIA_CONTEXT.CANVAS_AGENT_AUDIO_WORKFLOW_CONTROLLER || {};
    const runCanvasAgentTextToAudio = CANVAS_AGENT_AUDIO_WORKFLOW_CONTROLLER.runCanvasAgentTextToAudio;
    const runCanvasAgentAudioPresetGenerate = CANVAS_AGENT_AUDIO_WORKFLOW_CONTROLLER.runCanvasAgentAudioPresetGenerate;
    const runCanvasAgentQwenTtsVoiceDesign = CANVAS_AGENT_AUDIO_WORKFLOW_CONTROLLER.runCanvasAgentQwenTtsVoiceDesign;
    const runCanvasAgentAudioEdit = CANVAS_AGENT_AUDIO_WORKFLOW_CONTROLLER.runCanvasAgentAudioEdit;
    const CANVAS_AGENT_AUDIO_TOOLS_CONTROLLER = CANVAS_AGENT_MEDIA_CONTEXT.CANVAS_AGENT_AUDIO_TOOLS_CONTROLLER || {};
    const canvasAgentAudioQuickToolSpec = CANVAS_AGENT_AUDIO_TOOLS_CONTROLLER.canvasAgentAudioQuickToolSpec;
    const canvasAgentAudioQuickTools = CANVAS_AGENT_AUDIO_TOOLS_CONTROLLER.canvasAgentAudioQuickTools;
    const runCanvasAgentAudioQuickTool = CANVAS_AGENT_AUDIO_TOOLS_CONTROLLER.runCanvasAgentAudioQuickTool;
    const setCanvasAgentAudioBridgeSource = CANVAS_AGENT_AUDIO_TOOLS_CONTROLLER.setCanvasAgentAudioBridgeSource;
    const runCanvasAgentAudioBridgeFromNode = CANVAS_AGENT_AUDIO_TOOLS_CONTROLLER.runCanvasAgentAudioBridgeFromNode;
    const CANVAS_AGENT_TOOL_DISPATCH_CONTROLLER = CANVAS_AGENT_MEDIA_CONTEXT.CANVAS_AGENT_TOOL_DISPATCH_CONTROLLER || {};
    const canvasAgentCurrentMediaKind = CANVAS_AGENT_TOOL_DISPATCH_CONTROLLER.canvasAgentCurrentMediaKind;
    const canvasAgentContextualQuickTools = CANVAS_AGENT_TOOL_DISPATCH_CONTROLLER.canvasAgentContextualQuickTools;
    const canvasAgentToolFamily = CANVAS_AGENT_TOOL_DISPATCH_CONTROLLER.canvasAgentToolFamily;
    const runCanvasAgentTool = CANVAS_AGENT_TOOL_DISPATCH_CONTROLLER.runCanvasAgentTool;

    let cancelCanvasAgentVlmInstruction = async () => ({ ok: false, cancelled: false, error: 'VLM planner is unavailable' });
    const AGENT_PANEL_CONTEXT_SOURCE = {
            panelViewsSource: {
                languageSource: {
                    t
                },
                utilitySource: {
                    escapeHtml
                },
                helpSource: {
                    button: (...args) => window.SimpAIStudioHelp?.button?.(...args) || '',
                    modelNotice: (...args) => window.SimpAIStudioHelp?.modelNotice?.(...args) || ''
                },
                stateSource: {
                    getAgentState: () => canvasAgentState
                },
                referenceSource: {
                    normalizeCanvasAgentReferences,
                    canvasAgentReferenceNode,
                    getCanvasAgentReferenceKind,
                    canvasAgentReferenceIcon,
                    getCanvasAgentReferenceAsset,
                    assetDisplaySrc
                },
                autocompleteSource: {
                    shouldEnableDanbooruAutocomplete,
                    danbooruAutocompleteAttrs
                },
                toolSource: {
                    canvasAgentContextualQuickTools
                },
                capacitySource: {
                    getMaxExtraImageReferences: () => CANVAS_AGENT_MAX_EXTRA_IMAGE_REFERENCES,
                    getMaxVideoReferences: () => CANVAS_AGENT_MAX_VIDEO_REFERENCES,
                    getMaxAudioReferences: () => CANVAS_AGENT_MAX_AUDIO_REFERENCES
                },
                resolutionSource: {
                    getCanvasAgentResolutionState,
                    canvasAgentResolutionCompactLabel: canvasAgentResolutionCompactLabelFromSettings,
                    getAspectOptions: () => CANVAS_AGENT_ASPECT_OPTIONS
                },
                modelSource: {
                    canvasAgentModelSummary,
                    canvasAgentDefaultLocalRewriteModel,
                    canvasAgentLocalRewriteModels,
                    vlmModelOptionsHtml,
                    vlmModelDisplayLabel
                },
                customApiSource: {
                    getVlmCustomProvider,
                    canvasAgentCustomParamsFromSettings,
                    getVlmCustomApiProfile,
                    getCanvasAgentCustomModelChoices,
                    getCustomApiProviders: () => VLM_CUSTOM_API_PROVIDERS
                },
                presetSource: {
                    canvasAgentPresetOptionHtml,
                    canvasAgentVideoQuickToolChoiceFromSettings,
                    canvasAgentVideoQuickToolChoiceOptionHtml,
                    canvasAgentVideoUpscalePresetEntries
                }
            },
            panelControllerSource: {
                languageSource: {
                    t
                },
                identitySource: {
                    uid
                },
                timeSource: {
                    now: () => canvasNow(),
                    nowIso
                },
                runtimeSource: {
                    setTimeout: (...args) => typeof window.setTimeout === 'function' ? window.setTimeout(...args) : undefined
                },
                utilitySource: {
                    escapeHtml,
                    clamp,
                    cssEscape: (value) => cssEscape(value)
                },
                helpSource: {
                    button: (...args) => window.SimpAIStudioHelp?.button?.(...args) || '',
                    modelNotice: (...args) => window.SimpAIStudioHelp?.modelNotice?.(...args) || ''
                },
                capacitySource: {
                    getMaxImageReferences: () => CANVAS_AGENT_MAX_IMAGE_REFERENCES,
                    getMaxVideoReferences: () => CANVAS_AGENT_MAX_VIDEO_REFERENCES,
                    getMaxAudioReferences: () => CANVAS_AGENT_MAX_AUDIO_REFERENCES
                },
                stateSource: {
                    getAgentState: () => canvasAgentState
                },
                domSource: {
                    getCanvasAgentPanel: () => canvasAgentPanel,
                    getViewport: () => viewport,
                    getWorkbenchRoot: () => root,
                    getDocument: () => document,
                    setCanvasAgentSuppressClickUntil: (value) => {
                        canvasAgentSuppressClickUntil = Number(value || 0);
                    }
                },
                settingsSource: {
                    getCanvasAgentSettings,
                    getOutpaintOverlayState: () => outpaintOverlayState,
                    setCanvasAgentLayoutPatch,
                    setCanvasAgentResolutionOpen: setCanvasAgentResolutionOpenFromSettings,
                    setCanvasAgentResolutionPatch
                },
                targetSource: {
                    getCanvasAgentTargetNode,
                    canvasAgentPrimaryActionMeta,
                    canvasAgentTargetLabel
                },
                projectSource: {
                    getProject: () => project
                },
                layoutSource: {
                    getNodeRect
                },
                referenceSource: {
                    canvasAgentReferenceCounts,
                    normalizeCanvasAgentReferences,
                    addSelectedCanvasAgentReferences,
                    removeCanvasAgentReference,
                    promoteCanvasAgentReference
                },
                outpaintSource: {
                    renderOutpaintControlPanel,
                    ensureOutpaintOverlayMatchesAgentTarget,
                    syncOutpaintOverlayPosition,
                    confirmOutpaintFromOverlay,
                    hideOutpaintOverlay
                },
                formSource: {
                    ensureWorkbenchFormFieldNames
                },
                renderSource: {
                    renderCanvasAgentPanel
                },
                decisionSource: {
                    buildAgentDecisionFormPatch: (...args) => buildAgentDecisionFormPatch(...args),
                    decodeCanvasAgentVideoToolChoice,
                    findCanvasAgentPresetEntryByAlias,
                    canvasAgentPresetDefaultPromptForTheme
                },
                uiSource: {
                    revealCanvasAgentPanelForToolCard,
                    openCanvasSettingsPanel,
                    showToast
                },
                instructionSource: {
                    cancelCanvasAgentVlmInstruction: (...args) => cancelCanvasAgentVlmInstruction(...args)
                },
                customApiSource: {
                    fetchCanvasAgentCustomModels
                },
                toolSource: {
                    runCanvasAgentTool
                },
            }
    };
    const CANVAS_AGENT_PANEL_CONTEXT = typeof WORKBENCH_CANVAS_AGENT_PANEL_CONTEXT.createCanvasWorkbenchAgentPanelContext === 'function'
        ? WORKBENCH_CANVAS_AGENT_PANEL_CONTEXT.createCanvasWorkbenchAgentPanelContext({
            agentPanelSource: AGENT_PANEL_CONTEXT_SOURCE
        })
        : {};
    const CANVAS_AGENT_PANEL_VIEWS_CONTROLLER = CANVAS_AGENT_PANEL_CONTEXT.CANVAS_AGENT_PANEL_VIEWS_CONTROLLER || {};
    const renderCanvasAgentDecision = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentDecision;
    const renderCanvasAgentRunInfo = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentRunInfo;
    const renderCanvasAgentReferenceChip = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentReferenceChip;
    const renderCanvasAgentInlineReferences = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentInlineReferences;
    const renderCanvasAgentReferences = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentReferences;
    const renderCanvasAgentToolShelf = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentToolShelf;
    const renderCanvasAgentCompactToolbar = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentCompactToolbar;
    const renderCanvasAgentResolutionControls = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentResolutionControls;
    const renderCanvasAgentResolutionButton = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentResolutionButton;
    const renderCanvasAgentModelChip = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentModelChip;
    const renderCanvasAgentModelPicker = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentModelPicker;
    const renderCanvasAgentCustomApiSettingsView = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentCustomApiSettings;
    const renderCanvasAgentSettingsTab = CANVAS_AGENT_PANEL_VIEWS_CONTROLLER.renderCanvasAgentSettingsTab;
    CANVAS_AGENT_PANEL_CONTROLLER = CANVAS_AGENT_PANEL_CONTEXT.CANVAS_AGENT_PANEL_CONTROLLER || {};

    const AGENT_INSTRUCTION_CONTEXT_SOURCE = {
            plannerSource: {
                languageSource: {
                    t,
                },
                normalizationSource: {
                    normalizePresetName,
                    normalizeCanvasAgentGenerationOptions,
                },
                targetSource: {
                    getCanvasAgentTargetNode,
                    getCanvasAgentTargetMediaKind,
                    isCanvasAgentImageTarget,
                },
                referenceSource: {
                    canvasAgentReferenceCounts,
                    getCanvasAgentMediaReferenceNodes,
                    canvasAgentMediaNodeCounts,
                    canvasAgentVideoTaskForMedia,
                    canvasAgentReferenceSummaryText,
                },
                promptSource: {
                    canvasAgentPromptMediaIntent,
                    canvasAgentPromptTargetContextLine,
                    canvasAgentPromptTargetFromEntry,
                    canvasAgentPromptTargetFromPurpose,
                },
                presetSource: {
                    findCanvasAgentPresetInstructionOverride,
                    getPresetCatalog,
                    getCanvasAgentPresetQueue,
                    findPresetCatalogEntryByName,
                    canvasAgentInstructionAliasPresetNames,
                    canvasAgentPromptMentionsPreset,
                    canvasAgentReadyPresetEntries,
                    canvasAgentPresetMatchTokens,
                    canvasAgentPresetAliasTokensForEntry,
                },
                settingsSource: {
                    getCanvasAgentSettings,
                    canvasAgentResolutionLabel,
                },
                projectSource: {
                    getProject: () => project,
                },
            },
            vlmInstructionSource: {
                languageSource: {
                    t,
                },
                identitySource: {
                    uid,
                },
                runtimeSource: {
                    getPlannerTimeoutMs: () => CANVAS_AGENT_VLM_PLAN_TIMEOUT_MS,
                    setTimeout: (...args) => window.setTimeout(...args),
                    clearTimeout: (...args) => window.clearTimeout(...args),
                },
                projectSource: {
                    getDefaultProjectId: () => PROJECT_ID,
                    getProject: () => project,
                },
                referenceSource: {
                    getCanvasAgentTargetNode,
                    getCanvasAgentVlmReferenceSources,
                    buildVlmAgentContext: CANVAS_VLM_AGENT_CONTEXT.buildVlmAgentContext,
                    normalizeCanvasAgentReferences,
                },
                settingsSource: {
                    getCanvasAgentRewriteModel,
                    getCanvasAgentSettings,
                    getCanvasAgentCustomRuntimeParams,
                },
                plannerSource: {},
                transportSource: {
                    sendCanvasVlmRunRequest,
                    sendCanvasVlmCancelRequest,
                },
            }
    };
    const CANVAS_AGENT_INSTRUCTION_CONTEXT = typeof WORKBENCH_CANVAS_AGENT_INSTRUCTION_CONTEXT.createCanvasWorkbenchAgentInstructionContext === 'function'
        ? WORKBENCH_CANVAS_AGENT_INSTRUCTION_CONTEXT.createCanvasWorkbenchAgentInstructionContext({
            agentInstructionSource: AGENT_INSTRUCTION_CONTEXT_SOURCE
        })
        : {};
    const CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER = CANVAS_AGENT_INSTRUCTION_CONTEXT.CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER || {};
    const canvasAgentEscapeRegExp = CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER.canvasAgentEscapeRegExp;
    const extractCanvasAgentJsonObject = CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER.extractCanvasAgentJsonObject;
    const JSONDecoderShim = CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER.JSONDecoderShim;
    const normalizeCanvasAgentInstructionPlan = CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER.normalizeCanvasAgentInstructionPlan;
    const stripCanvasAgentPresetFromPrompt = CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER.stripCanvasAgentPresetFromPrompt;
    const buildCanvasAgentLocalInstructionPlan = CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER.buildCanvasAgentLocalInstructionPlan;
    const canvasAgentInstructionPresetCandidates = CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER.canvasAgentInstructionPresetCandidates;
    const canvasAgentPromptTargetRulesText = CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER.canvasAgentPromptTargetRulesText;
    const canvasAgentInstructionPlanPrompt = CANVAS_AGENT_INSTRUCTION_PLANNER_CONTROLLER.canvasAgentInstructionPlanPrompt;
    CANVAS_AGENT_VLM_INSTRUCTION_CONTROLLER = CANVAS_AGENT_INSTRUCTION_CONTEXT.CANVAS_AGENT_VLM_INSTRUCTION_CONTROLLER || {};
    const cancelCanvasAgentVlmInstructionRequest = CANVAS_AGENT_VLM_INSTRUCTION_CONTROLLER.cancelCanvasAgentVlmInstruction;
    cancelCanvasAgentVlmInstruction = async (...args) => {
        const result = await cancelCanvasAgentVlmInstructionRequest(...args);
        if (result?.cancelled) {
            resetCanvasAgentRunInfo();
            setCanvasAgentMessage(t('VLM planner cancelled.', 'VLM 计划已取消。'));
        }
        return result;
    };
    CANVAS_AGENT_ACTION_EXECUTION_CONTROLLER = typeof WORKBENCH_CANVAS_AGENT_ACTION_EXECUTION.createCanvasAgentActionExecutionController === 'function'
        ? WORKBENCH_CANVAS_AGENT_ACTION_EXECUTION.createCanvasAgentActionExecutionController({
            actionExecutionSource: {
                languageSource: {
                    t,
                },
                stateSource: {
                    getCanvasAgentState: () => canvasAgentState,
                    getCanvasAgentSettings,
                },
                panelSource: {
                    handleCanvasAgentPanelAction,
                },
                decisionSource: {
                    canvasAgentPrimaryActionMeta,
                },
                targetSource: {
                    getCanvasAgentTargetNode,
                    getCanvasAgentTargetMediaKind,
                    isCanvasAgentImageTarget,
                },
                mediaSource: {
                    canvasAgentVideoTaskForMedia,
                    canvasAgentMediaNodeCounts,
                    getCanvasAgentMediaReferenceNodes,
                    getCanvasAgentPrimaryImageReference,
                },
                plannerSource: {
                    getCanvasAgentRewriteModel,
                    requestCanvasAgentVlmInstructionPlan,
                    buildCanvasAgentLocalInstructionPlan,
                },
                runtimeSource: {
                    uid,
                    waitNextFrame,
                },
                workflowSource: {
                    runCanvasAgentTextToImage,
                    runCanvasAgentImageEdit,
                    runCanvasAgentTextToVideo,
                    runCanvasAgentImageToVideo,
                    runCanvasAgentVideoReferenceToVideo,
                    runCanvasAgentVideoEdit,
                    runCanvasAgentAudioToVideo,
                    runCanvasAgentTextToAudio,
                    runCanvasAgentAudioEdit,
                    runCanvasAgentTextRefine,
                },
                uiSource: {
                    clearCanvasAgentRunInfo,
                    setCanvasAgentRunInfo,
                    resetCanvasAgentRunInfo,
                    setCanvasAgentMessage,
                    showToast,
                },
            }
        })
        : {};
    const NODE_MENU_CONTEXT_SOURCE = {
        nodeMenusSource: {
            languageSource: {
                t,
            },
            utilitySource: {
                localizeCanvasLabel,
            },
            catalogSource: {
                getPresetCatalog,
                resolvePresetCatalogEntry,
                refreshPresetCatalog,
            },
            nodeSource: {
                addPresetNode,
                addMediaBrowserNode,
                addBatchAnyNode,
                addManualOutputNode,
                addStyleSelectorNode,
                addTextNode,
                addTextMergeNode,
                addWildcardsHelperNode,
                addTranslationNode,
                addTagCartNode,
                addWd14Node,
                addVlmNode,
                addMaskNode,
                addSam3VideoMaskNode,
                addCameraMotionNode,
                addPoseStudioNode,
                addGaussianStudioNode,
                addLivePortraitExpressionNode,
                addCompareNode,
                addDirectorTimelineNode,
                addTimelineNode,
                addQwenTtsNode,
                addNoteNode,
                addAreaGroup,
            },
            importSource: {
                importSelectedTransferAt,
                openImageFilePicker,
            },
            paletteSource: {
                openPresetPalette,
            },
            viewSource: {
                centerCanvas,
                fitAll,
                clearCanvasWithConfirm,
            },
            uiSource: {
                showToast,
            },
            menuSource: {
                get contextMenu() { return contextMenu; },
                openContextMenu,
                createInputEvent: () => new Event('input'),
            },
            worldSource: {
                lastPointerWorld: () => lastPointerWorld,
                viewportCenterWorld,
            },
        }
    };
    const CANVAS_NODE_MENU_CONTEXT = typeof WORKBENCH_CANVAS_NODE_MENU_CONTEXT.createCanvasWorkbenchNodeMenuContext === 'function'
        ? WORKBENCH_CANVAS_NODE_MENU_CONTEXT.createCanvasWorkbenchNodeMenuContext({
            nodeMenuSource: NODE_MENU_CONTEXT_SOURCE
        })
        : {};
    const NODE_MENU_TOOLS = CANVAS_NODE_MENU_CONTEXT.NODE_MENU_TOOLS || {};
    const buildAddNodeContextMenuItems = NODE_MENU_TOOLS.buildAddNodeContextMenuItems;

    function workbenchStaticFilePath(path) {
        return WORKBENCH_UTILS.workbenchStaticFilePath(path, document);
    }

    function resolveWorkbenchStaticPath(path) {
        return WORKBENCH_UTILS.resolveWorkbenchStaticPath(path, document);
    }

    function localizeCanvasLabel(value, cnMap) {
        return WORKBENCH_UTILS.localizeCanvasLabel?.(value, cnMap, { __lang: runtimeUiLang() })
            ?? String(value ?? '').trim();
    }

    function displayStyleName(value) {
        return localizeCanvasLabel(value);
    }

    function localizedDefaultTitle(value, defaultEn, defaultCn) {
        return WORKBENCH_UTILS.localizedDefaultTitle(value, defaultEn, defaultCn, { __lang: runtimeUiLang() });
    }

    function tagCartLabel() {
        return t('Tag Cart', '标签选择器');
    }

    function mediaBrowserLabel() {
        return t('Media Browser', '媒体浏览器');
    }

    function advancedMaskingLabel() {
        return t('Advanced Masking', '高级遮罩');
    }

    function localizeMaskStatus(value) {
        return WORKBENCH_UTILS.localizeMaskStatus?.(value, { __lang: runtimeUiLang() })
            ?? String(value || '').trim();
    }

    CANVAS_GALLERY_FROST_CONTROLLER = WORKBENCH_CANVAS_GALLERY_FROST.createCanvasGalleryFrostController({
        windowSource: window,
        documentSource: () => document,
        mediaBrowserSource: {
            getMediaBrowserNodeRuntime: () => mediaBrowserNodeRuntime
        },
        renderSource: {
            hasNodesLayer: () => !!nodesLayer,
            renderNodes: () => renderNodes()
        }
    });
    CANVAS_GALLERY_FROST_CONTROLLER.initialize();

    let root = null;
    let viewport = null;
    let stage = null;
    let edgesLayer = null;
    let edgesCanvas = null;
    let groupsLayer = null;
    let nodesLayer = null;
    let inspector = null;
    let palette = null;
    let contextMenu = null;
    let runHistoryPanel = null;
    let runQueuePanel = null;
    let runQueueWidget = null;
    let canvasSettingsPanel = null;
    let canvasAgentPanel = null;
    let minimapEl = null;
    let toastEl = null;
    let systemInfoEl = null;
    let backendAlertEl = null;
    let perfHudEl = null;
    const mediaBrowserNodeRuntime = CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.getMediaBrowserNodeRuntime();
    let edgeRenderCacheKey = '';
    const perfStats = {
        fps: 0,
        renderTotalMs: 0,
        renderNodesMs: 0,
        renderEdgesMs: 0,
        renderMinimapMs: 0,
        minimapCacheHit: 0,
        nodeSpatialIndexHit: 0,
        nodeSpatialCandidates: 0,
        marqueeSpatialIndexHit: 0,
        marqueeSpatialCandidates: 0,
        marqueeSelectedNodes: 0,
        edgeCanvasBatches: 0,
        edgePointCacheHits: 0,
        edgePointCacheMisses: 0,
        edgeIncidentIndexHit: 0,
        edgeIncidentCandidates: 0,
        panEdgeLodDeferred: 0,
        panEdgeLodPending: 0,
        panEdgeSettleMs: 0,
        panEdgeSettleDelayMs: 0,
        dragEdgeLodActive: 0,
        dragEdgeLodSuppressed: 0,
        dragEdgeLodSkipped: 0,
        dragEdgeLodLastReason: '',
        dragEdgeLodDeferred: 0,
        dragEdgeLodPending: 0,
        dragEdgeSettleMs: 0,
        dragEdgeSettleDelayMs: 0,
        renderedNodes: 0,
        totalNodes: 0,
        renderedEdges: 0,
        totalEdges: 0
    };
    let activeInlineTagCartNodeId = '';
    let zoomLabel = null;
    let chainRunOverlay = null;
    let outpaintOverlayEl = null;
    const outpaintOverlayState = {
        active: false,
        nodeId: '',
        up: 0,
        down: 0,
        left: 0,
        right: 0
    };
    const canvasAgentState = {
        input: '',
        lastMessage: '',
        pendingDecision: null,
        currentRun: null,
        busy: false,
        expanded: false,
        attachPaused: false,
        pickReference: false,
        references: [],
        modelPickerOpen: false,
        resolutionOpen: false,
        resolution: {
            aspect: 'auto',
            multiplier: 1
        }
    };
    let canvasSettingsState = {
        tab: 'agent'
    };
    const INPUT_PORT_HANDLE_SELECTOR = [
        '[data-handle-in]', '[data-config-in]', '[data-handle-in-result]', '[data-text-in]', '[data-text-node-in]',
        '[data-translation-text-in]', '[data-tagcart-text-in]', '[data-wd14-image-in]', '[data-vlm-image-in]',
        '[data-mask-source-in]', '[data-sam3-video-in]', '[data-pose-studio-reference-in]', '[data-gaussian-studio-reference-in]',
        '[data-liveportrait-expression-source-in]', '[data-liveportrait-expression-reference-in]', '[data-qwen-tts-audio-in]',
        '[data-director-media-in]', '[data-director-media-group-in]', '[data-compare-image-in]', '[data-batch-any-in]',
        '[data-timeline-track-in]', '[data-timeline-media-in]'
    ].join(',');

    let storageScope = getStorageScope();
    let storageBaseKey = getStorageKey(storageScope);
    let storageKey = initialBrowserStorageKey(storageScope);
    let project = loadProject(storageKey, storageScope);
    let selectedNodeId = null;
    let selectedNodeIds = new Set();
    let selectedEdgeId = null;
    let selectedGroupId = null;
    let mode = 'select';
    let canvasAgentSuppressClickUntil = 0;
    const vlmAgentActionRunLocks = new Set();
    let suppressWheelUntil = 0;
    let backendLoadedStorageKey = '';
    let lastPointerWorld = { x: 160, y: 120 };

    function projectStoreOptions() {
        return projectStoreOptionsFromProjectContext();
    }

    function getCanvasTitle() {
        return getCanvasTitleFromProjectContext();
    }

    function isStandaloneCanvasWorkbench() {
        return !!window.SimpAIInfiniteCanvasStandalone;
    }

    function getStorageScope() {
        return getStorageScopeFromProjectContext();
    }

    function getStorageKey(scope) {
        return getStorageKeyFromProjectContext(scope);
    }

    function createDefaultProject() {
        return createDefaultProjectFromProjectContext();
    }

    function syncProjectLanguage(candidate) {
        return syncProjectLanguageFromProjectContext(candidate);
    }

    function sanitizeProject(raw) {
        return sanitizeProjectFromProjectContext(raw);
    }

    function isProjectEmpty(candidate) {
        return isProjectEmptyFromProjectContext(candidate);
    }

    function createDemoWorkbenchProject(options) {
        return createDemoWorkbenchProjectFromProjectContext(options);
    }

    function ensureInitialDemoProject() {
        return ensureInitialDemoProjectFromProjectContext();
    }

    function loadProject(key, scope) {
        return loadProjectFromProjectContext(key, scope);
    }

    function compactProjectForStorage(source, options) {
        return compactProjectForStorageFromPersistenceController(source, options);
    }

    function storageDisplayLocation() {
        return storageDisplayLocationFromPersistenceController();
    }

    function storageDisplayPath() {
        return storageDisplayPathFromPersistenceController();
    }

    function qwenTtsModeLabel(mode) {
        return qwenTtsModeLabelForMode(mode);
    }

    function isQwenTtsNode(node) {
        return qwenTtsIsNode(node);
    }

    function qwenTtsNodeMode(node) {
        return qwenTtsModeFromNode(node);
    }

    function qwenTtsAudioInputSlots(nodeOrMode) {
        return qwenTtsAudioInputSlotsForNode(nodeOrMode) || [];
    }

    function isQwenTtsAudioSource(node) {
        return !!qwenTtsIsAudioSource(node, QWEN_TTS_NODE_CONTEXT || {
            getSelectedResultAsset,
            assetMediaKind
        });
    }

    function isDirectorTimelineNode(node) {
        return directorTimelineIsNode(node);
    }

    function directorMediaSourceKind(node) {
        return directorTimelineMediaSourceKind(node, { getSelectedResultAsset, assetMediaKind });
    }

    function isDirectorMediaSourceForSlot(node, slot) {
        return !!directorTimelineMediaSourceForSlot(node, slot, { getSelectedResultAsset, assetMediaKind });
    }

    const DIRECTOR_TIMELINE_NODE_CONTEXT_SOURCE = {
        utilitySource: {
            escapeHtml,
            t
        },
        assetSource: {
            assetThumbSrc: assetNodeThumbSrc,
            assetDisplaySrc
        },
        getProject: () => project,
        uid,
        defaultNodeSize,
        getSelectedResultAsset,
        getNode,
        isNodeIgnored,
        mutate,
        placeNodeAvoidingOverlap,
        pushHistory,
        renderNodeStateBadges,
        serializeAssetSourceForRun,
        buildDirectorTimelineStatePatch,
        buildProjectNodeAppendPatch,
        completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args),
        setSelectedNode: id => CANVAS_SELECTION_CONTROLLER.setNodeSelectionIncludingEmpty(id),
        showToast
    };

    function directorTimelinePayload(node) {
        if (!isDirectorTimelineNode(node) || typeof directorTimelineSerializeForRun !== 'function') return null;
        return directorTimelineSerializeForRun(node, DIRECTOR_TIMELINE_NODE_CONTEXT);
    }

    function mutate(options) {
        CANVAS_PROJECT_PERSISTENCE_CONTROLLER.mutate(options);
    }

    function pollUpdate() {
        CANVAS_RESULT_STATUS_DOM_CONTROLLER.pollUpdate();
    }

    function ensureWorkbench() {
        if (root) return;
        if (typeof WORKBENCH_CANVAS_SHELL_RENDERER.createCanvasWorkbenchShellRenderer !== 'function') {
            throw new Error('Infinite Canvas shell renderer is not loaded.');
        }
        const shellRenderer = WORKBENCH_CANVAS_SHELL_RENDERER.createCanvasWorkbenchShellRenderer({
            t,
            escapeHtml,
            renderIconHtml,
            domSource: { getDocument: () => document },
            formSource: { ensureWorkbenchFormFieldNames },
            lifecycleSource: {
                getRoot: () => root,
                isStandaloneCanvasWorkbench
            }
        });
        shellRenderer.ensureRuntimeStyles();
        const elements = shellRenderer.mountWorkbenchShell();
        if (!elements) return;
        ({
            root, viewport, stage, groupsLayer, edgesCanvas, edgesLayer, nodesLayer,
            chainRunOverlay, outpaintOverlayEl, canvasAgentPanel, inspector, palette, contextMenu,
            canvasSettingsPanel, runQueuePanel, runQueueWidget, runHistoryPanel, minimapEl, toastEl,
            systemInfoEl, backendAlertEl, perfHudEl, zoomLabel
        } = elements);
        shellRenderer.syncStandaloneCanvasControls();

        CANVAS_LIFECYCLE_CONTROLLER.bindMountedWorkbenchEvents(elements);
        renderAll();
        warmDanbooruAutocompleteIndex();
        refreshQwenTtsStylePresets({ silent: true }).then(() => {
            renderNodes();
            if (selectedNodeId) renderInspector();
        }).catch(() => {});
    }

    function ensureWorkbenchFormFieldNames(scope, prefix) {
        const normalizeFields = WORKBENCH_CANVAS_SHELL_RENDERER.ensureWorkbenchFormFieldNames;
        if (typeof normalizeFields !== 'function') return;
        return normalizeFields(scope, prefix, {
            getDocument: () => document,
            cssEscape: value => CSS.escape(value)
        });
    }

    function renderIconHtml(icon) {
        const renderIcon = WORKBENCH_CANVAS_SHELL_RENDERER.renderWorkbenchIconHtml;
        return typeof renderIcon === 'function' ? renderIcon(icon, escapeHtml) : '';
    }

    window.SimpAICanvasWorkbenchHoverPreview = {
        hide: hideHoverPreview,
        attrs: hoverPreviewAttrs
    };

    function bindWorkbenchEvents() {
        CANVAS_WORKBENCH_EVENT_CONTROLLER.bindWorkbenchEvents();
    }

    function reconcileSelection() {
        return reconcileSelectionFromController?.();
    }

    function canvasAgentPrimaryAction(...args) {
        return CANVAS_AGENT_ACTION_CONTROLLER?.canvasAgentPrimaryAction?.(...args) || '';
    }

    function canvasAgentPrimaryActionMeta(...args) {
        return CANVAS_AGENT_ACTION_CONTROLLER?.canvasAgentPrimaryActionMeta?.(...args) || {};
    }

    function canvasAgentPresetSearchText(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentPresetSearchText?.(...args) || '';
    }

    function isCanvasAgentUpscalePresetEntry(...args) {
        return !!CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.isCanvasAgentUpscalePresetEntry?.(...args);
    }

    function isCanvasAgentNonUpscalePresetEntry(...args) {
        return !!CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.isCanvasAgentNonUpscalePresetEntry?.(...args);
    }

    function canvasAgentUpscalePresetEntries(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentUpscalePresetEntries?.(...args) || [];
    }

    function canvasAgentPreferredUpscalePresetEntry(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentPreferredUpscalePresetEntry?.(...args) || null;
    }

    function canvasAgentVideoUpscalePresetEntries(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentVideoUpscalePresetEntries?.(...args) || [];
    }

    function canvasAgentPresetDefaultPromptForTheme(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentPresetDefaultPromptForTheme?.(...args) || '';
    }

    function canvasAgentPresetQueueConfig(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentPresetQueueConfig?.(...args) || {
            key: 't2i',
            setting: 't2iPreset',
            fallback: CANVAS_AGENT_DEFAULT_T2I_PRESET_QUEUE
        };
    }

    function getCanvasAgentPresetQueue(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.getCanvasAgentPresetQueue?.(...args) || [];
    }

    function canvasAgentPresetMatchTokens(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentPresetMatchTokens?.(...args) || [];
    }

    function canvasAgentInstructionAliasPresetNames(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentInstructionAliasPresetNames?.(...args) || [];
    }

    function canvasAgentPromptMentionsPreset(...args) {
        return !!CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentPromptMentionsPreset?.(...args);
    }

    function findCanvasAgentPresetEntryByAlias(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.findCanvasAgentPresetEntryByAlias?.(...args) || null;
    }

    function findCanvasAgentPresetInstructionOverride(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.findCanvasAgentPresetInstructionOverride?.(...args) || null;
    }

    function findPresetCatalogEntryByName(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.findPresetCatalogEntryByName?.(...args) || null;
    }

    function createCanvasAgentPresetProbeNode(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.createCanvasAgentPresetProbeNode?.(...args) || null;
    }

    function canvasAgentPresetStatusCacheKey(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentPresetStatusCacheKey?.(...args) || '';
    }

    async function getCanvasAgentPresetStatus(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.getCanvasAgentPresetStatus?.(...args) || null;
    }

    function canvasAgentPresetAliasTokensForEntry(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentPresetAliasTokensForEntry?.(...args) || [];
    }

    async function runCanvasAgentVlmInstruction(...args) {
        return CANVAS_AGENT_ACTION_EXECUTION_CONTROLLER?.runCanvasAgentVlmInstruction?.(...args);
    }


    function presetResultBasePosition(presetNode) {
        return CANVAS_NODE_LAYOUT_CONTROLLER?.presetResultBasePosition?.(presetNode);
    }

    async function handleCanvasAgentAction(...args) {
        return CANVAS_AGENT_ACTION_EXECUTION_CONTROLLER?.handleCanvasAgentAction?.(...args);
    }


    function detectWorkbenchTheme() {
        return WORKBENCH_CANVAS_SHELL_RENDERER.detectWorkbenchThemeFromDocument(window, document);
    }

    function applyThemeClass() {
        if (!root) return;
        WORKBENCH_CANVAS_SHELL_RENDERER.applyWorkbenchThemeClass(root, detectWorkbenchTheme());
    }

    function nodeEffectiveRenderMode(node, options) {
        return CANVAS_NODE_RENDER_CONTROLLER?.getNodeEffectiveRenderMode?.(node, options) || 'full';
    }

    function isVisibleWorldRectCoveredByRenderedNodes() {
        return isVisibleWorldRectCoveredByRenderedNodesFromController?.() || false;
    }

    function ensureProjectGroups() {
        return ensureProjectGroupsFromProjectContext();
    }

    function appendProjectEdge(edge) {
        return appendProjectEdgeFromProjectContext(edge);
    }

    function filterProjectEdges(predicate) {
        return filterProjectEdgesFromProjectContext(predicate);
    }

    function applyProjectSchedulerPatch(scheduler, options) {
        return applyProjectSchedulerPatchFromProjectContext(scheduler, options);
    }

    function getGroup(id) {
        return getGroupFromProjectContext(id);
    }

    function getGroupRect(group) {
        return CANVAS_GROUP_RENDERER?.getGroupRect?.(group) || null;
    }

    function normalizeCanvasColor(value, fallback) {
        return CANVAS_NODE_APPEARANCE_CONTROLLER.normalizeCanvasColor?.(value, fallback) ?? fallback;
    }

    function expandCanvasHexColor(value, fallback) {
        return CANVAS_NODE_APPEARANCE_CONTROLLER.expandCanvasHexColor?.(value, fallback) || fallback || '#14b8a6';
    }

    function nodeCustomColor(node) {
        return CANVAS_NODE_APPEARANCE_CONTROLLER.nodeCustomColor?.(node) || '';
    }

    function nodeAccentContrastColor(color) {
        return CANVAS_NODE_APPEARANCE_CONTROLLER.nodeAccentContrastColor?.(color) || '#f8fafc';
    }

    function applyNodeCustomColorVars(node, nodeEl) {
        return CANVAS_NODE_APPEARANCE_CONTROLLER.applyNodeCustomColorVars?.(node, nodeEl);
    }

    function groupShortcutLabel(group) {
        return CANVAS_GROUP_RENDERER?.groupShortcutLabel?.(group) || '';
    }

    function renderGroups() {
        return CANVAS_GROUP_RENDERER?.renderGroups?.();
    }

    function updateGroupPositionDom(groupId) {
        return CANVAS_GROUP_RENDERER?.updateGroupPositionDom?.(groupId);
    }

    function getNodeGroupMembershipRect(node) {
        return CANVAS_GROUP_RENDERER?.getNodeGroupMembershipRect?.(node) || null;
    }

    function getNodesInsideGroup(group) {
        return CANVAS_GROUP_RENDERER?.getNodesInsideGroup?.(group) || [];
    }

    function selectedNodesBounds(padding) {
        return CANVAS_GROUP_RENDERER?.selectedNodesBounds?.(padding) || null;
    }

    function addAreaGroup(world, options) {
        return CANVAS_GROUP_INTERACTION_CONTROLLER.addAreaGroup?.(world, options) || null;
    }

    function updateGroupField(groupId, key, value, inputType) {
        return CANVAS_GROUP_INTERACTION_CONTROLLER.updateGroupField?.(groupId, key, value, inputType);
    }

    function bindInspectorGroupFieldEvents(inspector) {
        return CANVAS_GROUP_INTERACTION_CONTROLLER.bindInspectorGroupFieldEvents?.(inspector) || false;
    }

    function focusGroup(group) {
        return CANVAS_GROUP_INTERACTION_CONTROLLER.focusGroup?.(group);
    }

    function deleteSelectedGroup() {
        return CANVAS_GROUP_INTERACTION_CONTROLLER.deleteSelectedGroup?.();
    }

    function centerViewportOnWorld(worldX, worldY) {
        return CANVAS_VIEWPORT_FIT_CONTROLLER.centerViewportOnWorld?.(worldX, worldY);
    }

    function ensureNodeResizeHandle(nodeEl, node) {
        return CANVAS_NODE_APPEARANCE_CONTROLLER.ensureNodeResizeHandle?.(nodeEl, node);
    }

    function ensureNodeCollapseButton(nodeEl, node) {
        return CANVAS_NODE_APPEARANCE_CONTROLLER.ensureNodeCollapseButton?.(nodeEl, node);
    }

    function restoreInlineTagCartAfterRender() {
        return CANVAS_TAG_CART_CONTROLLER.restoreInlineTagCartAfterRender?.();
    }

    function nodeOverviewRenderSignature(node) {
        return nodeRenderSignatureService.nodeOverviewRenderSignature(node);
    }

    const nodeRenderSignatureService = WORKBENCH_CANVAS_NODE_RENDER_SIGNATURE.createCanvasNodeRenderSignature({
        assetSource: {
            getSelectedResultAsset: (...args) => getSelectedResultAsset(...args),
            inferChatImageRelativePath: (...args) => inferChatImageRelativePath(...args),
            getAssetRoot: () => window.SimpAICanvasWorkbenchAssetRoot || ''
        },
        nodeSource: {
            nodeStatusState: (...args) => nodeStatusState(...args),
            compareSourceSignature: (...args) => compareSourceSignature(...args)
        },
        projectSource: { getNode: (...args) => getNode(...args) },
        timelineSource: { getTimelineSourceAsset: (...args) => getTimelineSourceAsset(...args) },
        mediaBrowserSource: {
            serializableMediaBrowserState: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.serializableMediaBrowserState(...args),
            mediaBrowserRuntimeSignature: (...args) => CANVAS_MEDIA_BROWSER_STATE_CONTROLLER.mediaBrowserRuntimeSignature(...args)
        },
        overviewSource: {
            overviewNodeAsset: (...args) => overviewNodeAsset(...args),
            overviewNodeKindLabel: (...args) => overviewNodeKindLabel(...args),
            overviewInputPorts: (...args) => overviewInputPorts(...args),
            overviewOutputKind: (...args) => overviewOutputKind(...args),
            isNodeSelected: node => node.id === selectedNodeId || selectedNodeIds.has(node.id),
            isResultStale: (...args) => isResultStale(...args)
        }
    });

    function mediaAssetRenderRootKey(asset) {
        return nodeRenderSignatureService.mediaAssetRenderRootKey(asset);
    }

    function mediaAssetRenderKey(asset) {
        return nodeRenderSignatureService.mediaAssetRenderKey(asset);
    }

    function nodeRenderSignature(node) {
        return nodeRenderSignatureService.nodeRenderSignature(node);
    }

    function isNodeSchedulerBlocked(node) {
        return !!CANVAS_SCHEDULER_STATE_CONTROLLER.isNodeSchedulerBlocked?.(node);
    }

    function isNodeSchedulerWaiting(node) {
        return !!CANVAS_SCHEDULER_STATE_CONTROLLER.isNodeSchedulerWaiting?.(node);
    }

    function isResultStale(node) {
        return !!CANVAS_RESULT_STALENESS_CONTROLLER.isResultStale?.(node);
    }

    function isResultRefreshing(node) {
        return !!CANVAS_RESULT_STALENESS_CONTROLLER.isResultRefreshing?.(node);
    }

    function updateNodePositionDom(ids) {
        return updateNodePositionDomFromController?.(ids);
    }

    function shouldFixNodeHeight(node) {
        return !!CANVAS_NODE_LAYOUT_CONTROLLER?.shouldFixNodeHeight?.(node);
    }

    function supportsCollapsedPromptHeight(node) {
        return !!CANVAS_NODE_LAYOUT_CONTROLLER?.supportsCollapsedPromptHeight?.(node);
    }

    function collapsedPromptNodeHeight(node) {
        return CANVAS_NODE_LAYOUT_CONTROLLER?.collapsedPromptNodeHeight?.(node) || 0;
    }

    function defaultNodeSize(type) {
        return registryDefaultNodeSize(type);
    }

    function rectsOverlap(a, b, padding) {
        return viewportRectsOverlap(a, b, padding);
    }

    function getClassicIpMaxImages(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getClassicIpMaxImages(node);
    }

    function getClassicIpCount(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getClassicIpCount(node);
    }

    function getClassicIpTypes(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getClassicIpTypes(node);
    }

    function getClassicUovMethods(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getClassicUovMethods(node);
    }

    function getClassicInpaintEngines(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getClassicInpaintEngines(node);
    }

    function resolveClassicInpaintTaskMethod(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.resolveClassicInpaintTaskMethod(node);
    }

    function normalizeClassicInpaintMode(mode) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.normalizeClassicInpaintMode(mode);
    }

    function getInpaintModeDefaults(mode, node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getInpaintModeDefaults(mode, node);
    }

    function enhanceRegionKey(index) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.enhanceRegionKey(index);
    }

    function detectionSlotForRegion(index) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.detectionSlotForRegion(index);
    }

    function parseDetectionSlot(slot) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.parseDetectionSlot(slot);
    }

    function getClassicEnhanceRegionDefault(index) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getClassicEnhanceRegionDefault(index);
    }

    function getClassicEnhanceRegionValues(node, index, sourceValues) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getClassicEnhanceRegionValues(node, index, sourceValues);
    }

    function applyClassicEnhanceRegionValues(node, index, values, sourceNodeId) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.applyClassicEnhanceRegionValues(node, index, values, sourceNodeId);
    }

    function getDetectionChoices() {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getDetectionChoices();
    }

    function getDetectionConfigLabel(index) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getDetectionConfigLabel(index);
    }

    function renderClassicInspector(node) {
        return renderClassicInspectorFromRenderer(node);
    }
    function getVisibleClassicUploadSlots(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getVisibleClassicUploadSlots(node);
    }

    function applyPresetUploadSlotPatch(node, slot, sourceId) {
        return CANVAS_NODE_FACTORY_CONTROLLER.applyPresetUploadSlotPatch(node, slot, sourceId);
    }

    function addClassicNode(entry, world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addClassicNode(entry, world, options);
    }

    function handleClassicModeChange(nodeId, newMode) {
        return CANVAS_NODE_PARAM_CONTROLLER?.handleClassicModeChange?.(nodeId, newMode);
    }

    function handleUovMethodChange(nodeId, newMethod) {
        return CANVAS_NODE_PARAM_CONTROLLER?.handleUovMethodChange?.(nodeId, newMethod);
    }

    function handleEnhanceUovParamChange(nodeId, key, value, inputType) {
        return CANVAS_NODE_PARAM_CONTROLLER?.handleEnhanceUovParamChange?.(nodeId, key, value, inputType);
    }

    function applyInpaintModeDefaults(node, newMode) {
        return CANVAS_NODE_PARAM_CONTROLLER?.applyInpaintModeDefaults?.(node, newMode);
    }

    function handleInpaintModeChange(nodeId, newMode) {
        return CANVAS_NODE_PARAM_CONTROLLER?.handleInpaintModeChange?.(nodeId, newMode);
    }

    function getPresetSchema(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getPresetSchema(node);
    }

    function getPresetTheme(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getPresetTheme(node);
    }

    function getPresetThemeInfo(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getPresetThemeInfo(node);
    }

    function directorDurationParamValue(value, fallback = 'scene_video_duration') {
        return CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorDurationParamValue?.(value, fallback) ?? fallback;
    }

    function directorDurationStrategyValue(value, fallback = 'shot') {
        return CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorDurationStrategyValue?.(value, fallback) ?? 'shot';
    }

    function directorAudioOutputValue(value, fallback = 'silent') {
        return CANVAS_DIRECTOR_PRESET_VALIDATION_CONTROLLER.directorAudioOutputValue?.(value, fallback) ?? 'silent';
    }

    function getVisibleUploadSlots(node) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getVisibleUploadSlots(node);
    }

    function getSlotLabel(node, slotKey) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getSlotLabel(node, slotKey);
    }

    function getUploadSlotMediaKind(slotKey) {
        return CANVAS_CONNECTION_MEDIA_CONTROLLER.getUploadSlotMediaKind?.(slotKey) || 'image';
    }

    function canNodeConnectToUploadSlot(node, slotKey) {
        return !!CANVAS_CONNECTION_MEDIA_CONTROLLER.canNodeConnectToUploadSlot?.(node, slotKey);
    }

    function canPresetOutputConnectToUploadSlot(presetNode, slotKey) {
        return !!CANVAS_CONNECTION_MEDIA_CONTROLLER.canPresetOutputConnectToUploadSlot?.(presetNode, slotKey);
    }

    function presetOutputMediaKind(presetNode) {
        return CANVAS_CONNECTION_MEDIA_CONTROLLER.presetOutputMediaKind?.(presetNode) || '';
    }

    function isImageProducingPresetNode(node) {
        return !!CANVAS_CONNECTION_MEDIA_CONTROLLER.isImageProducingPresetNode?.(node);
    }

    function resultExpectedMediaKind(node) {
        return CANVAS_SPECIAL_MEDIA_SOURCE_CONTROLLER.resultExpectedMediaKind?.(node) || '';
    }

    function isResultImageReferenceSource(node) {
        return !!CANVAS_SPECIAL_MEDIA_SOURCE_CONTROLLER.isResultImageReferenceSource?.(node);
    }

    function isPresetConfigKind(kind) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.isPresetConfigKind(kind);
    }

    function configKeyForKind(kind) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.configKeyForKind(kind);
    }

    function ensurePresetSpecialControllerState(node, kind) {
        return PRESET_SPECIAL_VIEWER_CONTROLLER.ensurePresetSpecialControllerState?.(node, kind) || '';
    }

    function collapsedKeepClass(node, edgeType, slot) {
        return CANVAS_NODE_LAYOUT_CONTROLLER?.collapsedKeepClass?.(node, edgeType, slot) || '';
    }

    const WILDCARDS_RUNTIME_CONTEXT_SOURCE = {
        nodeSource: {
            isNodeLocked: (...args) => isNodeLocked(...args)
        },
        apiSource: {
            getWildcardsCatalog: () => apiWildcardsCatalog,
            getWildcardsPreview: () => apiWildcardsPreview
        },
        projectSource: {
            getProject: () => project
        },
        runtimeSource: {
            getWorkbenchUserContext: (...args) => getWorkbenchUserContext(...args),
            showToast: (...args) => showToast(...args),
            nowIso: (...args) => nowIso(...args),
            mutate: (...args) => mutate(...args),
            scheduleSave: (...args) => scheduleSave(...args)
        },
        serializationSource: {
            serializeClassicNodeForRun: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializeClassicNodeForRun?.(...args) || {},
            serializePresetForRun: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializePresetForRun?.(...args) || {},
            presetGenerationImageNumberValue: (...args) => presetGenerationImageNumberValue(...args)
        },
        patchSource: {
            buildWildcardsHelperStatePatch: (...args) => buildWildcardsHelperStatePatch(...args),
            buildPresetWildcardPreviewPatch: (...args) => buildPresetWildcardPreviewPatch(...args)
        }
    };
    const CANVAS_WILDCARDS_RUNTIME_CONTROLLER = WORKBENCH_CANVAS_WILDCARDS_RUNTIME.createCanvasWildcardsRuntimeController({
        wildcardsRuntimeSource: WILDCARDS_RUNTIME_CONTEXT_SOURCE
    });

    async function refreshWildcardsCatalog(node, options) {
        return CANVAS_WILDCARDS_RUNTIME_CONTROLLER.refreshWildcardsCatalog(node, options);
    }

    async function buildWildcardPreviewForNode(node, options) {
        return CANVAS_WILDCARDS_RUNTIME_CONTROLLER.buildWildcardPreviewForNode(node, options);
    }

    function canvasRunPromptParamText(value) {
        return CANVAS_WILDCARDS_RUNTIME_CONTROLLER.canvasRunPromptParamText(value);
    }

    function getTranslationCacheBucket(node, target, key) {
        return TRANSLATION_CONTROLLER?.getTranslationCacheBucket?.(node, target, key) || null;
    }

    function getTranslationCacheEntry(node, target, key, text) {
        return TRANSLATION_CONTROLLER?.getTranslationCacheEntry?.(node, target, key, text) || null;
    }

    function getTranslationFieldState(node, target, key, value) {
        return TRANSLATION_CONTROLLER?.getTranslationFieldState?.(node, target, key, value) || 'idle';
    }

    function canvasOverlayHost() {
        return root || document.getElementById('simpai-infinite-canvas-workbench') || document.body;
    }

    function assetMediaKind(asset) {
        return CANVAS_ASSET_MEDIA_CONTROLLER.assetMediaKind(asset);
    }

    function assetMediaIcon(asset) {
        return CANVAS_ASSET_MEDIA_CONTROLLER.assetMediaIcon(asset);
    }

    function isNodeLocked(node) {
        return CANVAS_NODE_STATE_CONTROLLER.isNodeLocked(node);
    }

    function isNodeIgnored(node) {
        return CANVAS_RUN_STATE_CONTROLLER.isNodeIgnored(node);
    }

    function isNodeCollapsed(node) {
        return CANVAS_NODE_STATE_CONTROLLER.isNodeCollapsed(node);
    }

    function isImageNodeFrameless(node) {
        return CANVAS_NODE_STATE_CONTROLLER.isImageNodeFrameless(node);
    }

    function presetModelStatusState(node) {
        return CANVAS_PRESET_MODEL_STATUS_CONTROLLER.getStatusState(node);
    }

    function renderImageNodeHtml(node) {
        return imageNodeRenderNodeHtml(node, IMAGE_NODE_CONTEXT);
    }

    function renderVideoNodeHtml(node) {
        return videoNodeRenderNodeHtml(node, VIDEO_NODE_CONTEXT);
    }

    function renderAudioNodeHtml(node) {
        return audioNodeRenderNodeHtml(node, AUDIO_NODE_CONTEXT);
    }

    function batchAnyMediaKindFromAsset(asset) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyMediaKindFromAsset(asset);
    }

    function batchAnyMediaKindFromFile(file) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyMediaKindFromFile(file);
    }

    function applyBatchAnyStatePatch(node, options) {
        const patch = buildBatchAnyStatePatch(node, options || {});
        if (patch && typeof patch === 'object') Object.assign(node, patch);
    }

    function batchAnyMediaKind(node) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyMediaKind(node);
    }

    function batchAnyPortKind(node) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyPortKind(node);
    }

    function batchAnyMediaLabel(kind) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyMediaLabel(kind);
    }

    function batchAnyMediaIcon(kind) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyMediaIcon(kind);
    }

    function batchAnyCanConnectToSlot(node, slotKey) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyCanConnectToSlot(node, slotKey);
    }

    function batchAnyCanConnectToTextSlot(node, slotKey) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyCanConnectToTextSlot(node, slotKey);
    }

    function batchAnyAcceptsMediaKind(node, kind) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyAcceptsMediaKind(node, kind);
    }

    function batchAnySourceAsset(node) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnySourceAsset(node);
    }

    function batchAnySourceText(node) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnySourceText(node);
    }

    function batchAnySourceMediaKind(node) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnySourceMediaKind(node);
    }

    function isBatchAnySourceNode(node) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.isBatchAnySourceNode(node);
    }

    function batchAnyAcceptsSource(node, source) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyAcceptsSource(node, source);
    }

    function batchAnyCurrentItem(node) {
        return CANVAS_BATCH_ANY_EDIT_CONTROLLER.batchAnyCurrentItem(node);
    }

    function batchAnySelectedItemIds(node) {
        return CANVAS_BATCH_ANY_EDIT_CONTROLLER.batchAnySelectedItemIds(node);
    }

    function setBatchAnySelectedItemIds(node, ids) {
        return CANVAS_BATCH_ANY_EDIT_CONTROLLER.setBatchAnySelectedItemIds(node, ids);
    }

    function refreshBatchAnyActiveItem(node) {
        return CANVAS_BATCH_ANY_EDIT_CONTROLLER.refreshBatchAnyActiveItem(node);
    }

    function setBatchAnyCurrentItem(node, index, options) {
        return CANVAS_BATCH_ANY_EDIT_CONTROLLER.setBatchAnyCurrentItem(node, index, options);
    }

    function selectBatchAnyItem(node, index, options) {
        return CANVAS_BATCH_ANY_EDIT_CONTROLLER.selectBatchAnyItem(node, index, options);
    }

    function batchAnyInputEdges(node) {
        return CANVAS_BATCH_ANY_EDIT_CONTROLLER.batchAnyInputEdges(node);
    }

    function batchAnyInputEdgeForDrag(node) {
        return CANVAS_BATCH_ANY_EDIT_CONTROLLER.batchAnyInputEdgeForDrag(node);
    }

    function deleteBatchAnyItems(node, itemIds, options) {
        return CANVAS_BATCH_ANY_EDIT_CONTROLLER.deleteBatchAnyItems(node, itemIds, options);
    }

    function batchAnyTargets(node) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyTargets(node);
    }

    function batchAnyTargetLabel(target) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyTargetLabel(target);
    }

    function batchAnyTextFromItem(item) {
        return CANVAS_BATCH_ANY_QUERIES_CONTROLLER.batchAnyTextFromItem(item);
    }

    function renderBatchAnyInspector(node) {
        return CANVAS_BATCH_ANY_INSPECTOR_CONTROLLER.renderBatchAnyInspector(node);
    }

    function getTimelineSourceAsset(source) {
        return timelineGetTimelineSourceAsset(source, { getSelectedResultAsset }) || null;
    }

    function isTimelineSource(node) {
        return timelineIsTimelineSource(node, TIMELINE_NODE_CONTEXT);
    }

    function renderTimelineNodeHtml(node) {
        return timelineRenderNodeHtml(node, TIMELINE_NODE_CONTEXT);
    }

    function renderNoteNodeHtml(node) {
        return CANVAS_NOTE_RENDERER_CONTROLLER.renderNoteNodeHtml(node);
    }

    function isVlmMediaSource(node) {
        return !!CANVAS_VLM_NODE_CONTROLLER?.isVlmMediaSource?.(node);
    }

    function getVlmSourceAsset(node) {
        const getAsset = CANVAS_VLM_NODE_CONTROLLER?.getVlmSourceAsset;
        return typeof getAsset === 'function' ? getAsset(node) : null;
    }

    function getVlmCustomProvider(key) {
        return CANVAS_VLM_CUSTOM_API_PROFILES.getVlmCustomProvider(key);
    }

    function getVlmCustomProfileKey(params) {
        return CANVAS_VLM_CUSTOM_API_PROFILES.getVlmCustomProfileKey(params);
    }

    function readVlmCustomApiProfiles() {
        return CANVAS_VLM_CUSTOM_API_PROFILES.readVlmCustomApiProfiles();
    }

    function writeVlmCustomApiProfiles(profiles) {
        return CANVAS_VLM_CUSTOM_API_PROFILES.writeVlmCustomApiProfiles(profiles);
    }

    function getVlmCustomApiProfile(params) {
        return CANVAS_VLM_CUSTOM_API_PROFILES.getVlmCustomApiProfile(params);
    }

    function getVlmChatUiAreas(...args) {
        return CANVAS_VLM_NODE_CONTROLLER?.getVlmChatUiAreas?.(...args) || [];
    }

    function buildDefaultVlmParamsFromAgentSettings() {
        return CANVAS_AGENT_SETTINGS_CONTROLLER?.buildDefaultVlmParamsFromAgentSettings?.() || {};
    }


    function isSam3VideoMaskSource(node) {
        return sam3IsSource(node, SAM3_VIDEO_MASK_NODE_CONTEXT);
    }

    function isPoseStudioImageSource(node) {
        return !!CANVAS_SPECIAL_MEDIA_SOURCE_CONTROLLER.isPoseStudioImageSource?.(node);
    }

    function isGaussianStudioImageSource(node) {
        return !!CANVAS_SPECIAL_MEDIA_SOURCE_CONTROLLER.isGaussianStudioImageSource?.(node);
    }

    function isLivePortraitExpressionImageSource(node) {
        return !!CANVAS_SPECIAL_MEDIA_SOURCE_CONTROLLER.isLivePortraitExpressionImageSource?.(node);
    }

    const SAM3_VIDEO_MASK_NODE_CONTEXT_SOURCE = {
        getProject: () => project,
        getProjectId: () => project.id || PROJECT_ID,
        uid,
        utilitySource: {
            escapeHtml,
            clamp,
            t,
            structuredClone: (value) => typeof structuredClone === 'function' ? structuredClone(value) : undefined
        },
        assetSource: {
            assetDisplaySrc,
            mediaAspectStyle,
            readAssetInfo,
            mediaEditRange: assetNodeMediaEditRange,
            serializeAssetForRun,
            serializeMaskForRun,
            serializeAssetSourceForRun
        },
        apiSource: {
            generateSam3VideoMask: apiGenerateSam3VideoMask,
            cancelSam3VideoMask: apiCancelSam3VideoMask,
            normalizeSam3MaskVideo: apiNormalizeSam3MaskVideo
        },
        documentSource: {
            getDocument: () => typeof document !== 'undefined' ? document : null
        },
        browserSource: {
            createFileReader: () => typeof FileReader === 'function' ? new FileReader() : null,
            createImage: () => typeof Image === 'function' ? new Image() : null,
            createAbortController: () => typeof AbortController === 'function' ? new AbortController() : null
        },
        utilitySource: {
            structuredClone: (value) => typeof structuredClone === 'function' ? structuredClone(value) : undefined
        },
        buildCanvasRunStatus,
        buildMediaEditAsset,
        buildSam3SourcePatch,
        buildSam3StatePatch,
        buildProjectNodeAppendPatch,
        buildVideoResponseAsset,
        canvasOverlayHost,
        defaultNodeSize,
        detectWorkbenchTheme,
        ensureWorkbenchFormFieldNames,
        getNode,
        getSelectedResultAsset,
        isNodeIgnored,
        isNodeLocked,
        mutate,
        notConnectedText,
        onEditorClosed: handleCanvasAgentSam3VideoMaskEditorClosed,
        onMaskReady: handleCanvasAgentSam3VideoMaskReady,
        onMaskState: handleCanvasAgentSam3VideoMaskState,
        placeNodeAvoidingOverlap,
        portHintText,
        pushHistory,
        pushHistoryBatch,
        renderNodeStateBadges,
        scheduleSave,
        setSelectedNode: id => CANVAS_SELECTION_CONTROLLER.setNodeSelectionState(id),
        completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args),
        showToast
    };

    function renderSam3VideoMaskNodeHtml(node) {
        return sam3RenderNodeHtml(node, SAM3_VIDEO_MASK_NODE_CONTEXT);
    }

    const CAMERA_MOTION_NODE_CONTEXT_SOURCE = {
        getProject: () => project,
        getProjectId: () => project.id || PROJECT_ID,
        uid,
        utilitySource: {
            escapeHtml,
            clamp,
            t
        },
        assetSource: {
            assetDisplaySrc,
            mediaAspectStyle,
            readAssetInfo
        },
        apiSource: {
            generateCameraMotionReference: apiGenerateCameraMotionReference
        },
        runtimeSource: {
            setTimeout: (...args) => window.setTimeout(...args),
            clearTimeout: (...args) => window.clearTimeout(...args)
        },
        buildCanvasRunStatus,
        buildCameraMotionParamsPatch,
        buildCameraMotionSourcePatch,
        buildCameraMotionStatePatch,
        buildProjectNodeAppendPatch,
        completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args),
        buildVideoResponseAsset,
        defaultNodeSize,
        getNode,
        isNodeIgnored,
        isNodeLocked,
        mutate,
        placeNodeAvoidingOverlap,
        pushHistory,
        pushHistoryBatch,
        renderNodeStateBadges,
        scheduleSave,
        setSelectedNode: id => CANVAS_SELECTION_CONTROLLER.setNodeSelectionState(id),
        showToast
    };

    function renderCameraMotionNodeHtml(node) {
        return cameraMotionRenderNodeHtml(node, CAMERA_MOTION_NODE_CONTEXT);
    }

    const POSE_STUDIO_NODE_CONTEXT_SOURCE = {
        getProject: () => project,
        getProjectId: () => project.id || PROJECT_ID,
        uid,
        utilitySource: {
            escapeHtml,
            clamp,
            t
        },
        assetSource: {
            assetDisplaySrc,
            mediaAspectStyle,
            readAssetInfo,
            serializeAssetSourceForRun
        },
        editorSource: {
            getEditor: () => window.SimpAIPoseStudioEditor || {}
        },
        buildAssetReference,
        buildPoseStudioStatePatch,
        buildPoseStudioConfirmPatch,
        defaultNodeSize,
        detectWorkbenchTheme,
        ensureWorkbenchFormFieldNames,
        getNode,
        getSelectedResultAsset,
        isPoseStudioImageSource,
        isNodeIgnored,
        isNodeLocked,
        mutate,
        notConnectedText,
        placeNodeAvoidingOverlap,
        portHintText,
        pushHistory,
        renderNodeStateBadges,
        scheduleSave,
        buildProjectNodeAppendPatch,
        completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args),
        setSelectedNode: id => CANVAS_SELECTION_CONTROLLER.setNodeSelectionState(id),
        showToast
    };

    function renderPoseStudioNodeHtml(node) {
        return poseStudioRenderNodeHtml(node, POSE_STUDIO_NODE_CONTEXT);
    }

    const GAUSSIAN_STUDIO_NODE_CONTEXT_SOURCE = {
        getProject: () => project,
        getProjectId: () => project.id || PROJECT_ID,
        uid,
        utilitySource: {
            escapeHtml,
            clamp,
            t
        },
        assetSource: {
            assetDisplaySrc,
            mediaAspectStyle,
            readAssetInfo,
            serializeAssetSourceForRun
        },
        editorSource: {
            getEditor: () => window.SimpAIGaussianStudioEditor || {}
        },
        buildAssetReference,
        buildGaussianStudioStatePatch,
        buildGaussianCachePatch,
        buildGaussianConfirmPatch,
        defaultNodeSize,
        detectWorkbenchTheme,
        ensureWorkbenchFormFieldNames,
        getNode,
        getSelectedResultAsset,
        isNodeIgnored,
        isNodeLocked,
        mutate,
        notConnectedText,
        placeNodeAvoidingOverlap,
        portHintText,
        pushHistory,
        renderNodeStateBadges,
        scheduleSave,
        buildProjectNodeAppendPatch,
        completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args),
        setSelectedNode: id => CANVAS_SELECTION_CONTROLLER.setNodeSelectionState(id),
        showToast
    };

    function renderGaussianStudioNodeHtml(node) {
        return gaussianStudioRenderNodeHtml(node, GAUSSIAN_STUDIO_NODE_CONTEXT);
    }

    const LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT_SOURCE = {
        getProject: () => project,
        getProjectId: () => project.id || PROJECT_ID,
        uid,
        utilitySource: {
            escapeHtml,
            clamp,
            t
        },
        assetSource: {
            assetDisplaySrc,
            mediaAspectStyle,
            readAssetInfo,
            serializeAssetSourceForRun
        },
        editorSource: {
            getEditor: () => window.SimpAILivePortraitExpressionEditor || {}
        },
        buildAssetReference,
        buildLivePortraitNodeStatePatch,
        buildLivePortraitConfirmPatch,
        buildLivePortraitStatePatch,
        defaultNodeSize,
        detectWorkbenchTheme,
        ensureWorkbenchFormFieldNames,
        getNode,
        getSelectedResultAsset,
        isLivePortraitExpressionImageSource,
        isNodeIgnored,
        isNodeLocked,
        mutate,
        notConnectedText,
        placeNodeAvoidingOverlap,
        portHintText,
        pushHistory,
        renderNodeStateBadges,
        scheduleSave,
        buildProjectNodeAppendPatch,
        completePendingConnectionToNode: (...args) => completePendingConnectionToNode(...args),
        setSelectedNode: id => CANVAS_SELECTION_CONTROLLER.setNodeSelectionState(id),
        showToast
    };

    const SPECIAL_NODE_CONTEXT_SOURCE = {
            sam3VideoMaskNodeSource: SAM3_VIDEO_MASK_NODE_CONTEXT_SOURCE,
            cameraMotionNodeSource: CAMERA_MOTION_NODE_CONTEXT_SOURCE,
            poseStudioNodeSource: POSE_STUDIO_NODE_CONTEXT_SOURCE,
            gaussianStudioNodeSource: GAUSSIAN_STUDIO_NODE_CONTEXT_SOURCE,
            livePortraitExpressionNodeSource: LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT_SOURCE,
            qwenTtsNodeSource: QWEN_TTS_NODE_CONTEXT_SOURCE,
            styleSelectorNodeSource: STYLE_SELECTOR_NODE_CONTEXT_SOURCE,
            directorTimelineNodeSource: DIRECTOR_TIMELINE_NODE_CONTEXT_SOURCE
    };
    const CANVAS_SPECIAL_NODE_CONTEXT = typeof WORKBENCH_CANVAS_SPECIAL_NODE_CONTEXT.createCanvasWorkbenchSpecialNodeContext === 'function'
        ? WORKBENCH_CANVAS_SPECIAL_NODE_CONTEXT.createCanvasWorkbenchSpecialNodeContext({
            specialNodeSource: SPECIAL_NODE_CONTEXT_SOURCE
        })
        : {};
    SAM3_VIDEO_MASK_NODE_CONTEXT = CANVAS_SPECIAL_NODE_CONTEXT.SAM3_VIDEO_MASK_NODE_CONTEXT || {};
    CAMERA_MOTION_NODE_CONTEXT = CANVAS_SPECIAL_NODE_CONTEXT.CAMERA_MOTION_NODE_CONTEXT || {};
    POSE_STUDIO_NODE_CONTEXT = CANVAS_SPECIAL_NODE_CONTEXT.POSE_STUDIO_NODE_CONTEXT || {};
    GAUSSIAN_STUDIO_NODE_CONTEXT = CANVAS_SPECIAL_NODE_CONTEXT.GAUSSIAN_STUDIO_NODE_CONTEXT || {};
    LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT = CANVAS_SPECIAL_NODE_CONTEXT.LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT || {};
    QWEN_TTS_NODE_CONTEXT = CANVAS_SPECIAL_NODE_CONTEXT.QWEN_TTS_NODE_CONTEXT || {};
    STYLE_SELECTOR_NODE_CONTEXT = CANVAS_SPECIAL_NODE_CONTEXT.STYLE_SELECTOR_NODE_CONTEXT || {};
    DIRECTOR_TIMELINE_NODE_CONTEXT = CANVAS_SPECIAL_NODE_CONTEXT.DIRECTOR_TIMELINE_NODE_CONTEXT || {};

    const CANVAS_SPECIAL_NODE_EDITOR_CONTROLLER = typeof WORKBENCH_CANVAS_SPECIAL_NODE_EDITOR.createCanvasSpecialNodeEditorController === 'function'
        ? WORKBENCH_CANVAS_SPECIAL_NODE_EDITOR.createCanvasSpecialNodeEditorController({
            specialNodeEditorSource: {
                runtimeSource: { ensureWorkbenchLazyRuntime },
                languageSource: { t: (en, cn) => t(en, cn) },
                editorSource: {
                    isPoseStudioLoaded: () => typeof window.SimpAIPoseStudioEditor?.open === 'function',
                    openPoseStudioEditor: node => poseStudioOpenEditor(node, POSE_STUDIO_NODE_CONTEXT),
                    isGaussianStudioLoaded: () => typeof window.SimpAIGaussianStudioEditor?.open === 'function',
                    openGaussianStudioEditor: node => gaussianStudioOpenEditor(node, GAUSSIAN_STUDIO_NODE_CONTEXT),
                    isLivePortraitExpressionLoaded: () => typeof window.SimpAILivePortraitExpressionEditor?.open === 'function',
                    openLivePortraitExpressionEditor: node => livePortraitOpenEditor(node, LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT)
                }
            }
        })
        : {};

    function renderLivePortraitExpressionNodeHtml(node) {
        return livePortraitRenderNodeHtml(node, LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT);
    }

    function renderStyleSelectorNodeHtml(node) {
        return styleSelectorRenderNodeHtml(node, STYLE_SELECTOR_NODE_CONTEXT);
    }

    function renderQwenTtsNodeHtml(node) {
        return qwenTtsRenderNodeHtml(node, QWEN_TTS_NODE_CONTEXT);
    }

    function renderDirectorTimelineNodeHtml(node) {
        return directorTimelineRenderNodeHtml(node, DIRECTOR_TIMELINE_NODE_CONTEXT);
    }

    function presetSpecialViewerUrl(kind) {
        return PRESET_SPECIAL_VIEWER_CONTROLLER.presetSpecialViewerUrl?.(kind) || '';
    }

    function presetSpecialInputAssetUrl(node) {
        return PRESET_SPECIAL_VIEWER_CONTROLLER.presetSpecialInputAssetUrl?.(node) || '';
    }

    const CANVAS_PRESET_NODE_CLASSIFIER = typeof WORKBENCH_CANVAS_PRESET_NODE_CLASSIFIER.createCanvasPresetNodeClassifier === 'function'
        ? WORKBENCH_CANVAS_PRESET_NODE_CLASSIFIER.createCanvasPresetNodeClassifier({ getPresetSchema, getPresetTheme, getPresetThemeInfo })
        : {};

    function isStyleTransferPresetNode(node) {
        return CANVAS_PRESET_NODE_CLASSIFIER.isStyleTransferPresetNode?.(node) || false;
    }

    function isLivePortraitVideoExpressionPresetNode(node) {
        return CANVAS_PRESET_NODE_CLASSIFIER.isLivePortraitVideoExpressionPresetNode?.(node) || false;
    }

    function isLtx23MultiGuidePresetNode(node) {
        return CANVAS_PRESET_NODE_CLASSIFIER.isLtx23MultiGuidePresetNode?.(node) || false;
    }

    function isMiniMaxH3PresetNode(node) {
        return CANVAS_PRESET_NODE_CLASSIFIER.isMiniMaxH3PresetNode?.(node) || false;
    }

    const CANVAS_MINIMAX_H3_STORYBOARD_PRESET_DATA_SERVICE = typeof WORKBENCH_CANVAS_H3_STORYBOARD_PRESET_DATA.createCanvasMiniMaxH3StoryboardPresetData === 'function'
        ? WORKBENCH_CANVAS_H3_STORYBOARD_PRESET_DATA.createCanvasMiniMaxH3StoryboardPresetData({
            nodeSource: {
                getSlotOrder: () => SLOT_ORDER,
                getPresetUploadRunEdges: (...args) => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.getPresetUploadRunEdges?.(...args) || [],
                getUploadSlotMediaKind,
                getNode,
                getSelectedResultAsset,
                canvasAgentPromptCompilerContext,
                safeAssetFullDisplaySrc: (...args) => safeAssetFullDisplaySrc(...args),
                canvasAgentPromptTargetFromNode,
                getPresetThemeInfo
            },
            editorSource: { getStoryboardEditor: () => window.SimpAIH3StoryboardEditor || null },
            stateSource: {
                getLanguageState: () => window.simpleaiTopbarSystemParams || { __lang: document.documentElement.lang || 'en' }
            },
            runtimeSource: { runtimeUiLang }
        })
        : {};

    function h3StoryboardVlmReferencesForPreset(node) {
        return CANVAS_MINIMAX_H3_STORYBOARD_PRESET_DATA_SERVICE.h3StoryboardVlmReferencesForPreset(node);
    }

    function h3StoryboardVlmReferenceSummary(references, language, motionReferenceSlot) {
        return CANVAS_MINIMAX_H3_STORYBOARD_PRESET_DATA_SERVICE.h3StoryboardVlmReferenceSummary(references, language, motionReferenceSlot);
    }

    function h3StoryboardMotionPictureIndex(prompt, motionReferenceToken, pictureCount) {
        return CANVAS_MINIMAX_H3_STORYBOARD_PRESET_DATA_SERVICE.h3StoryboardMotionPictureIndex(prompt, motionReferenceToken, pictureCount);
    }

    function h3StoryboardInventoryForPreset(node) {
        return CANVAS_MINIMAX_H3_STORYBOARD_PRESET_DATA_SERVICE.h3StoryboardInventoryForPreset(node);
    }

    function h3StoryboardModeForPreset(node) {
        return CANVAS_MINIMAX_H3_STORYBOARD_PRESET_DATA_SERVICE.h3StoryboardModeForPreset(node);
    }

    async function attachCharacterMediaToPreset(nodeId, card) {
        return CANVAS_MINIMAX_H3_STORYBOARD_PRESET_EDITOR_CONTROLLER.attachCharacterMediaToPreset(nodeId, card);
    }
    function h3StoryboardOptionsForPreset(node) {
        return CANVAS_MINIMAX_H3_STORYBOARD_PRESET_DATA_SERVICE.h3StoryboardOptionsForPreset(node);
    }

    function h3StoryboardStateForPreset(node) {
        return CANVAS_MINIMAX_H3_STORYBOARD_PRESET_DATA_SERVICE.h3StoryboardStateForPreset(node);
    }
    function ltx23GuideModeForPreset(node) {
        return CANVAS_LTX23_GUIDE_EDITOR_CONTROLLER.ltx23GuideModeForPreset?.(node) || 'keyframes';
    }

    function presetUploadSourceForSlot(node, slot) {
        return CANVAS_LIVEPORTRAIT_VIDEO_EXPRESSION_EDITOR_CONTROLLER.presetUploadSourceForSlot?.(node, slot) || null;
    }

    function livePortraitVideoExpressionSourceInfo(node) {
        return CANVAS_LIVEPORTRAIT_VIDEO_EXPRESSION_EDITOR_CONTROLLER.livePortraitVideoExpressionSourceInfo?.(node)
            || { sourceNode: null, asset: null, src: '' };
    }

    function findStyleSelectorForPreset(presetNode) {
        return styleSelectorFindForPreset?.(presetNode, STYLE_SELECTOR_NODE_CONTEXT) || null;
    }

    function styleSelectorLinkedPreset(selectorNode) {
        return styleSelectorLinkedPresetForNode?.(selectorNode, STYLE_SELECTOR_NODE_CONTEXT) || null;
    }

    const CANVAS_PRESET_SPECIAL_PANEL_RENDERER = typeof WORKBENCH_CANVAS_PRESET_SPECIAL_PANEL_RENDERER.createCanvasPresetSpecialPanelRenderer === 'function'
        ? WORKBENCH_CANVAS_PRESET_SPECIAL_PANEL_RENDERER.createCanvasPresetSpecialPanelRenderer({
            t,
            escapeHtml,
            isStyleTransferPresetNode,
            findStyleSelectorForPreset,
            isLivePortraitVideoExpressionPresetNode,
            livePortraitVideoExpressionSourceInfo,
            isLtx23MultiGuidePresetNode,
            ltx23GuideConfigForPreset,
            isMiniMaxH3PresetNode,
            h3StoryboardOptionsForPreset,
            h3StoryboardStateForPreset,
            getH3StoryboardEditor: () => window.SimpAIH3StoryboardEditor
        })
        : {};

    function renderStyleTransferPresetController(node) {
        return CANVAS_PRESET_SPECIAL_PANEL_RENDERER.renderStyleTransferPresetController?.(node) || '';
    }

    function renderLivePortraitVideoExpressionPresetController(node) {
        return CANVAS_PRESET_SPECIAL_PANEL_RENDERER.renderLivePortraitVideoExpressionPresetController?.(node) || '';
    }

    function ltx23GuideConfigForPreset(node) {
        return CANVAS_LTX23_GUIDE_EDITOR_CONTROLLER.ltx23GuideConfigForPreset?.(node) || {};
    }

    function renderLtx23GuidePresetController(node) {
        return CANVAS_PRESET_SPECIAL_PANEL_RENDERER.renderLtx23GuidePresetController?.(node) || '';
    }

    function renderMiniMaxH3StoryboardPresetController(node) {
        return CANVAS_PRESET_SPECIAL_PANEL_RENDERER.renderMiniMaxH3StoryboardPresetController?.(node) || '';
    }

    function refreshPresetSpecialNodeDom(node, options) {
        return PRESET_SPECIAL_VIEWER_CONTROLLER.refreshPresetSpecialNodeDom(node, options);
    }

    function syncPresetSpecialViewersForAssetNode(sourceNodeId) {
        return PRESET_SPECIAL_VIEWER_CONTROLLER.syncPresetSpecialViewersForAssetNode(sourceNodeId);
    }

    function renderConfigNodeHtml(node) {
        if (node.config_kind === 'detection') return renderDetectionConfigNodeHtml(node);
        if (node.config_kind === 'styles') return renderStylesConfigNodeHtml(node);
        if (node.config_kind === 'resolution') return renderResolutionConfigNodeHtml(node);
        if (node.config_kind === 'advanced') return renderAdvancedConfigNodeHtml(node);
        return renderModelsConfigNodeHtml(node);
    }

    function optionHtml(choices, value) {
        return (choices || []).map(choice => `<option value="${escapeHtml(choice)}" ${String(choice) === String(value || '') ? 'selected' : ''}>${escapeHtml(choice)}</option>`).join('');
    }

    function getModelChoices(node) {
        return CANVAS_MODEL_CONFIG_CATALOG_CONTROLLER.getModelChoices(node);
    }

    function modelConfigUsesFilter(node) {
        return CANVAS_MODEL_CONFIG_CATALOG_CONTROLLER.modelConfigUsesFilter(node);
    }

    function mergeChoices(items) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.mergeChoices(items);
    }

    function configNumberValue(source, keys, fallback) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.configNumberValue(source, keys, fallback);
    }

    function boundedConfigNumberValue(source, keys, fallback, bounds) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.boundedConfigNumberValue(source, keys, fallback, bounds);
    }

    function configTextValue(source, keys, fallback) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.configTextValue(source, keys, fallback);
    }

    function normalizeStyleSelections(value) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.normalizeStyleSelections(value);
    }

    function firstStyleConfigValue(source) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.firstStyleConfigValue(source);
    }

    function getConfigTargetPresetNode(configNode) {
        return CANVAS_CONFIG_CONNECTION_CONTROLLER.getConfigTargetPresetNode(configNode);
    }

    function getSceneGenerationConfigPropsForPresetNode(preset, key) {
        return CANVAS_NODE_PARAM_CONTROLLER?.getSceneGenerationConfigPropsForPresetNode?.(preset, key) ?? null;
    }

    function getSceneGenerationConfigDefaultForPresetNode(preset, key) {
        return CANVAS_NODE_PARAM_CONTROLLER?.getSceneGenerationConfigDefaultForPresetNode?.(preset, key);
    }

    function getSceneGenerationConfigPropsForConfigNode(configNode, key) {
        return getSceneGenerationConfigPropsForPresetNode(getConfigTargetPresetNode(configNode), key);
    }

    function getSceneGenerationConfigDefaultForConfigNode(configNode, key) {
        return getSceneGenerationConfigDefaultForPresetNode(getConfigTargetPresetNode(configNode), key);
    }

    function generationConfigValueForPresetSchema(preset, key, value) {
        const resolveValue = CANVAS_NODE_PARAM_CONTROLLER?.generationConfigValueForPresetSchema;
        return typeof resolveValue === 'function' ? resolveValue(preset, key, value) : value;
    }

    function styleConfigSelectionFromValues(values, fallback) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.styleConfigSelectionFromValues(values, fallback);
    }

    function getStyleCatalogEntries() {
        return CANVAS_STYLE_CATALOG_CONTROLLER.getStyleCatalogEntries();
    }

    function getStyleChoicesFromCatalog() {
        return CANVAS_STYLE_CATALOG_CONTROLLER.getStyleChoicesFromCatalog();
    }

    function getStyleChoicesFromDom() {
        return CANVAS_STYLE_CATALOG_CONTROLLER.getStyleChoicesFromDom();
    }

    function getStylePreviewCatalogFromDom() {
        return CANVAS_STYLE_CATALOG_CONTROLLER.getStylePreviewCatalogFromDom();
    }

    function hoverPreviewAttrs(payload) {
        return CANVAS_HOVER_PREVIEW_CONTROLLER.hoverPreviewAttrs(payload);
    }

    function getStyleChoices(node, selected, defaults) {
        return CANVAS_STYLE_CATALOG_CONTROLLER.getStyleChoices(node, selected, defaults);
    }

    function normalizeInitialConfigLoras(defaults, overrides) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.normalizeInitialConfigLoras(defaults, overrides);
    }

    function syncModelSelectTitle(select) {
        if (!select || String(select.tagName || '').toLowerCase() !== 'select') return;
        const value = String(select.value || select.selectedOptions?.[0]?.textContent || '').trim();
        if (value) select.setAttribute('title', value);
        else select.removeAttribute('title');
    }

    function renderModelsConfigNodeHtml(node) {
        return CANVAS_MODEL_CONFIG_RENDERER.renderModelsConfigNodeHtml(node);
    }

    function renderStylesConfigNodeHtml(node) {
        return CANVAS_STYLE_CONFIG_RENDERER.renderStylesConfigNodeHtml(node);
    }

    function renderAdvancedConfigNodeHtml(node) {
        return CANVAS_ADVANCED_CONFIG_RENDERER.renderAdvancedConfigNodeHtml(node);
    }

    function renderDetectionConfigNodeHtml(node) {
        return CANVAS_DETECTION_CONFIG_RENDERER.renderDetectionConfigNodeHtml(node);
    }

    function getResolutionChoices() {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getResolutionChoices();
    }

    function resolutionManualSizeLabel(values, preview) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.resolutionManualSizeLabel(values, preview);
    }

    function normalizeResolutionTemplateName(value, choices) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.normalizeResolutionTemplateName(value, choices);
    }

    function getResolutionRenderValues(configNode) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getResolutionRenderValues(configNode);
    }

    function renderResolutionConfigNodeHtml(node) {
        return CANVAS_RESOLUTION_CONFIG_RENDERER.renderResolutionConfigNodeHtml(node);
    }

    function quantizeResolutionValue(value, step) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.quantizeResolutionValue(value, step);
    }

    function normalizeResolutionProfile(defaults) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.normalizeResolutionProfile(defaults);
    }

    function getResolutionSourceSize(presetNode, profile) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getResolutionSourceSize(presetNode, profile);
    }

    function resolveResolutionBaseDims(values, ratios) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.resolveResolutionBaseDims(values, ratios);
    }

    function getResolutionPreview(values, ratios) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getResolutionPreview(values, ratios);
    }

    function resultMediaDisplayAsset(node, selectedAsset) {
        if (CANVAS_RESULT_PREVIEW_CONTROLLER?.resultMediaDisplayAsset) {
            return arguments.length >= 2
                ? CANVAS_RESULT_PREVIEW_CONTROLLER.resultMediaDisplayAsset(node, selectedAsset)
                : CANVAS_RESULT_PREVIEW_CONTROLLER.resultMediaDisplayAsset(node);
        }
        return arguments.length >= 2 ? (selectedAsset || null) : getSelectedResultAsset(node);
    }

    function resultRunRecord(node) {
        return CANVAS_RESULT_METADATA_CONTROLLER.resultRunRecord?.(node) || null;
    }

    function resultMetadataSources(node) {
        return CANVAS_RESULT_METADATA_CONTROLLER.resultMetadataSources?.(node) || {};
    }

    function stringifyMetadataValue(value) {
        return CANVAS_RESULT_METADATA_CONTROLLER.stringifyMetadataValue?.(value) || '';
    }

    function resultMetadataRows(node, asset) {
        return CANVAS_RESULT_METADATA_CONTROLLER.resultMetadataRows?.(node, asset) || [];
    }

    function isImageCompareSource(node) {
        return !!CANVAS_SPECIAL_MEDIA_SOURCE_CONTROLLER.isImageCompareSource?.(node);
    }

    function getCompareSourceNode(node, slot) {
        return COMPARE_NODE_CONTEXT.getCompareSourceNode?.(node, slot) || null;
    }

    function getCompareSourceAsset(source) {
        return COMPARE_NODE_CONTEXT.getCompareSourceAsset?.(source);
    }

    function compareSourceSignature(node, slot) {
        return compareNodeSourceSignature(node, slot, COMPARE_NODE_CONTEXT);
    }

    function renderCompareStageHtml(node, options) {
        return compareNodeRenderStageHtml(node, COMPARE_NODE_CONTEXT, options);
    }

    function renderCompareControls(node) {
        return compareNodeRenderControls(node, COMPARE_NODE_CONTEXT);
    }

    function renderCompareNodeHtml(node) {
        return compareNodeRenderNodeHtml(node, COMPARE_NODE_CONTEXT);
    }

    const CANVAS_XYZ_MATRIX_EDITOR_CONTROLLER = typeof WORKBENCH_CANVAS_XYZ_MATRIX_EDITOR.createCanvasXyzMatrixEditorController === 'function'
        ? WORKBENCH_CANVAS_XYZ_MATRIX_EDITOR.createCanvasXyzMatrixEditorController({
            xyzMatrixEditorSource: {
                nodeSource: {
                    getNode, buildXyzMatrixNode, buildXyzMatrixStatePatch,
                    selectResultAsset: (...args) => CANVAS_RESULT_ASSET_CONTROLLER.selectResultAsset?.(...args) || null
                },
                presetSource: { getPresetThemeInfo },
                serializationSource: {
                    serializeClassicNodeForRun: node => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializeClassicNodeForRun?.(node) || {},
                    serializePresetForRun: node => CANVAS_PRESET_RUN_SERIALIZATION_CONTROLLER.serializePresetForRun?.(node) || {}
                },
                scriptSource: { script: XYZ_PLOT_SCRIPT_NAME },
                axisSource: { fallbackOptions: XYZ_AXIS_FALLBACKS },
                projectSource: {
                    getProject: () => project,
                    buildProjectNodeAppendPatch,
                    buildProjectBatchJobAppendPatch,
                    buildXyzBatchJob
                },
                layoutSource: { getNodeRect, defaultNodeSize, placeNodeAvoidingOverlap, centerViewportOnWorld },
                historySource: { pushHistory, mutate, scheduleSave },
                selectionSource: {
                    selectSingleNode: id => {
                        CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(id);
                    }
                },
                renderSource: { renderAll, renderNodes, renderInspector },
                modalSource: {
                    document,
                    getRoot: () => root,
                    detectWorkbenchTheme,
                    renderXyzPlotModalHtml: (...args) => CANVAS_XYZ_MATRIX_MODAL_RENDERER.renderXyzPlotModalHtml(...args),
                    showToast
                },
                apiSource: {
                    xyzAxisOptions: typeof apiXyzAxisOptions === 'function' ? apiXyzAxisOptions : null,
                    xyzPreview: typeof apiXyzPreview === 'function' ? apiXyzPreview : null,
                    getWorkbenchUserContext
                },
                languageSource: { t }
            }
        })
        : {};

    const CANVAS_XYZ_MATRIX_MODAL_RENDERER = typeof WORKBENCH_CANVAS_XYZ_MATRIX_MODAL_RENDERER.createCanvasXyzMatrixModalRenderer === 'function'
        ? WORKBENCH_CANVAS_XYZ_MATRIX_MODAL_RENDERER.createCanvasXyzMatrixModalRenderer({
            xyzMatrixModalRendererSource: {
                languageSource: { t },
                utilitySource: { escapeHtml },
                nodeSource: { getNode },
                stateSource: { defaultXyzPlotState: CANVAS_XYZ_MATRIX_EDITOR_CONTROLLER.defaultXyzPlotState },
                axisSource: {
                    visibleXyzAxisOptions: CANVAS_XYZ_MATRIX_EDITOR_CONTROLLER.visibleXyzAxisOptions,
                    getXyzAxisOption: CANVAS_XYZ_MATRIX_EDITOR_CONTROLLER.getXyzAxisOption
                },
                scriptSource: { script: XYZ_PLOT_SCRIPT_NAME }
            }
        })
        : {};
    const XYZ_MATRIX_NODE_CONTEXT = { t, escapeHtml, getNode, renderNodeStateBadges, notConnectedText };

    async function openXyzPlotPanel(node) {
        return CANVAS_XYZ_MATRIX_EDITOR_CONTROLLER.openXyzPlotPanel(node);
    }

    function renderXyzMatrixNodeHtml(node) {
        return WORKBENCH_CANVAS_XYZ_MATRIX_NODE.renderNodeHtml?.(node, XYZ_MATRIX_NODE_CONTEXT) || '';
    }

    function renderXyzMatrixInspector(node) {
        return WORKBENCH_CANVAS_XYZ_MATRIX_NODE.renderInspector?.(node, XYZ_MATRIX_NODE_CONTEXT) || '';
    }

    function focusXyzMatrixSource(node) {
        return CANVAS_XYZ_MATRIX_EDITOR_CONTROLLER.focusXyzMatrixSource(node);
    }

    function selectXyzMatrixCell(node, variantId) {
        return CANVAS_XYZ_MATRIX_EDITOR_CONTROLLER.selectXyzMatrixCell(node, variantId);
    }

    function refreshTimelinePreviewDom(nodeEl, node) {
        return CANVAS_TIMELINE_CONTEXT.refreshTimelinePreviewDom?.(nodeEl, node);
    }

    function refreshTimelinePreviewClipLayersDom(nodeEl, node, clip) {
        return CANVAS_TIMELINE_CONTEXT.refreshTimelinePreviewClipLayersDom?.(nodeEl, node, clip);
    }

    function refreshTimelineFeatherControlDom(scopeEl, value) {
        return CANVAS_TIMELINE_CONTEXT.refreshTimelineFeatherControlDom?.(scopeEl, value);
    }

    function setTimelineMaskImageStyle(el, maskSrc) {
        return CANVAS_TIMELINE_CONTEXT.setTimelineMaskImageStyle?.(el, maskSrc);
    }

    function refreshTimelineMaskImageOnly(stageEl, clip) {
        return CANVAS_TIMELINE_CONTEXT.refreshTimelineMaskImageOnly?.(stageEl, clip) || false;
    }

    function refreshTimelineMaskFeatherDom(nodeEl, node) {
        return CANVAS_TIMELINE_CONTEXT.refreshTimelineMaskFeatherDom?.(nodeEl, node);
    }

    function applyTimelinePreviewLayerStyle(layer, clip, node) {
        return CANVAS_TIMELINE_CONTEXT.applyTimelinePreviewLayerStyle?.(layer, clip, node);
    }

    function syncTimelinePreviewVideos(nodeEl, node) {
        return CANVAS_TIMELINE_CONTEXT.syncTimelinePreviewVideos?.(nodeEl, node);
    }

    function refreshTimelineInlineValue(input, key, clip) {
        return CANVAS_TIMELINE_CONTEXT.refreshTimelineInlineValue?.(input, key, clip);
    }


    function timelineMaskLayerGeometry(node, clip, paramsOverride) {
        return CANVAS_TIMELINE_CONTEXT.timelineMaskLayerGeometry?.(node, clip, paramsOverride) || null;
    }

    function captureTimelineMaskGeometry(node) {
        return CANVAS_TIMELINE_CONTEXT.captureTimelineMaskGeometry?.(node) || null;
    }


    function remapTimelineMasksAfterCanvasResize(node, oldSnapshot) {
        return remapTimelineMasksAfterCanvasResizeController?.(node, oldSnapshot);
    }

    function remapTimelineClipMaskForGeometryChange(node, clip, oldGeometry) {
        return remapTimelineClipMaskForGeometryChangeController?.(node, clip, oldGeometry) || false;
    }

    function drawTimelineMaskStrokes(ctx, width, height, strokes, options) {
        return timelineMaskController?.drawTimelineMaskStrokes(ctx, width, height, strokes, options);
    }

    function ensureTimelineMaskCanvas(stageEl, node, clip) {
        return timelineMaskController?.ensureTimelineMaskCanvas(stageEl, node, clip) || null;
    }


    function refreshTimelinePenOverlayDom(stageEl, clip, options) {
        return CANVAS_TIMELINE_CONTEXT.refreshTimelinePenOverlayDom?.(stageEl, clip, options);
    }


    function bindNodeEvents(nodeEl, node) {
        CANVAS_NODE_EVENT_CONTROLLER.bindNodeEvents(nodeEl, node);
    }

    function noteTailState(node) {
        return CANVAS_NOTE_GEOMETRY_CONTROLLER.noteTailState(node);
    }

    function defaultNoteTailTarget(node) {
        return CANVAS_NOTE_GEOMETRY_CONTROLLER.defaultNoteTailTarget(node);
    }

    function ensureNoteTailTarget(node) {
        return CANVAS_NOTE_GEOMETRY_CONTROLLER.ensureNoteTailTarget(node);
    }

    function renderNoteTailSvg(paths, keyParts, renderWindow) {
        return CANVAS_NOTE_RENDERER_CONTROLLER.renderNoteTailSvg(paths, keyParts, renderWindow);
    }

    function clearEdgeCanvas() {
        return CANVAS_EDGE_RENDERER.clearEdgeCanvas?.();
    }

    function findCanvasEdgeAtClient(clientX, clientY) {
        return CANVAS_EDGE_RENDERER.findCanvasEdgeAtClient?.(clientX, clientY) || null;
    }

    function updateInteractiveEdgeDom(nodeIds) {
        return CANVAS_EDGE_RENDERER.updateInteractiveEdgeDom?.(nodeIds) || false;
    }

    function renderEdges() {
        return CANVAS_EDGE_RENDERER.renderEdges?.();
    }

    function renderSelectedChainOverlay() {
        return CANVAS_CHAIN_RUN_OVERLAY_RENDERER?.renderSelectedChainOverlay?.();
    }

    function clearTempEdge() {
        return CANVAS_EDGE_RENDERER.clearTempEdge();
    }

    function getOutputPoint(node) {
        return CANVAS_EDGE_RENDERER.getOutputPoint(node);
    }

    function getInputPoint(node, slot, edgeType) {
        return CANVAS_EDGE_RENDERER.getInputPoint(node, slot, edgeType);
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value || ''));
        return String(value || '').replace(/["\\]/g, '\\$&');
    }


    function curvePath(from, to) {
        return typeof viewportCurvePath === 'function'
            ? viewportCurvePath(from, to)
            : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
    }

    function renderImageInspector(node) {
        return `${imageNodeRenderInspector(node, IMAGE_NODE_CONTEXT)}${renderGenerationMetadataInspectorSection(node)}`;
    }

    function renderGenerationMetadataInspectorSection(node) {
        return CANVAS_GENERATION_METADATA_INSPECTOR_CONTROLLER.renderGenerationMetadataInspectorSection(node);
    }

    async function copyNodeGenerationMetadataPrompt(node) {
        return CANVAS_GENERATION_METADATA_INSPECTOR_CONTROLLER.copyNodeGenerationMetadataPrompt(node);
    }

    function applyNodeGenerationMetadataToPromptTarget(node) {
        return CANVAS_GENERATION_METADATA_INSPECTOR_CONTROLLER.applyNodeGenerationMetadataToPromptTarget(node);
    }

    function renderNoteInspector(node) {
        return CANVAS_NOTE_INSPECTOR_CONTROLLER.renderNoteInspector(node);
    }

    function renderSam3VideoMaskInspector(node) {
        return sam3RenderInspector(node, SAM3_VIDEO_MASK_NODE_CONTEXT);
    }

    function renderCameraMotionInspector(node) {
        return cameraMotionRenderInspector(node, CAMERA_MOTION_NODE_CONTEXT);
    }

    function renderTimelineInspector(node) {
        return timelineRenderInspector(node, TIMELINE_NODE_CONTEXT);
    }

    function renderVideoInspector(node) {
        return `${videoNodeRenderInspector(node, VIDEO_NODE_CONTEXT)}${renderGenerationMetadataInspectorSection(node)}`;
    }

    function renderAudioInspector(node) {
        return audioNodeRenderInspector(node, AUDIO_NODE_CONTEXT);
    }

    function renderCompareInspector(node) {
        return compareNodeRenderInspector(node, COMPARE_NODE_CONTEXT);
    }

    function renderTextInspector(node) {
        return renderTextInspectorFromRenderer(node);
    }

    function renderTextMergeInspector(node) {
        return renderTextMergeInspectorFromRenderer(node);
    }

    function renderTranslationInspector(node) {
        return renderTranslationInspectorFromRenderer(node);
    }

    function renderTagCartInspector(node) {
        return renderTagCartInspectorFromRenderer(node);
    }

    function renderWd14Inspector(node) {
        return renderWd14InspectorFromRenderer(node);
    }

    function renderPresetInspector(node) {
        return renderPresetInspectorFromRenderer(node);
    }

    function renderResultInspector(node) {
        return CANVAS_RESULT_INSPECTOR_CONTROLLER.renderResultInspector?.(node) || '';
    }

    function getNodeRunErrorText(node) {
        return CANVAS_RESULT_INSPECTOR_CONTROLLER.getNodeRunErrorText?.(node) || '';
    }

    function handleResultInspectorAction(node, action, actionElement, evt) {
        return !!CANVAS_RESULT_INSPECTOR_CONTROLLER.handleResultInspectorAction?.(node, action, actionElement, evt);
    }

    function refreshActiveResultInspector() {
        return !!CANVAS_RESULT_INSPECTOR_CONTROLLER.refreshActiveResultInspector?.();
    }

    function bindInspectorEvents() {
        injectParamResetButtons(inspector);
        bindInspectorParamButtonEvents(inspector);
        bindInspectorTimelineResetEvents(inspector);
        bindInspectorMediaEvents(inspector);
        bindInspectorCompareEvents(inspector);
        bindInspectorTimelineParamEvents(inspector, selectedNodeId);
        bindInspectorNodeFieldEvents();
        bindInspectorNodeColorEvents(inspector);
        CANVAS_NOTE_INSPECTOR_CONTROLLER.bindNoteInspectorEvents(inspector);
        bindInspectorGroupFieldEvents(inspector);
        bindInspectorThemeEvents(inspector);
        CANVAS_TIMELINE_CONTEXT.bindDirectorTimelineInspectorEvents?.(inspector);
        bindInspectorParamEvents();
        bindTextInspectorEvents(inspector);
        CANVAS_BATCH_ANY_INSPECTOR_CONTROLLER.bindBatchAnyInspectorEvents(inspector);
        bindInspectorVlmEvents(inspector);
        bindClassicInspectorEvents(inspector);
        bindInspectorTranslateEvents(inspector);
        bindInspectorTagCartEvents(inspector);
        bindInspectorTextareaTitleEvents(inspector);
        bindInspectorActionEvents(inspector);
        bindInspectorNodeActionEvents(inspector);
    }

    function syncTwinParamInputs(...args) {
        return CANVAS_NODE_PARAM_CONTROLLER?.syncTwinParamInputs?.(...args);
    }

    function bindImageNodeDropEvents(nodeEl, node) {
        return CANVAS_NODE_EVENT_CONTROLLER?.bindImageNodeDropEvents?.(nodeEl, node);
    }


    function inputTargetAcceptsMultiple(target) {
        return CANVAS_CONNECTION_CONTROLLER.inputTargetAcceptsMultiple(target);
    }

    function inputTargetEdges(target) {
        return CANVAS_CONNECTION_CONTROLLER.inputTargetEdges(target);
    }

    function connectSourceToTarget(fromId, target, options) {
        return CANVAS_CONNECTION_CONTROLLER.connectSourceToTarget(fromId, target, options);
    }

    function findNearestConnectionTarget(clientX, clientY) {
        return CANVAS_CONNECTION_CONTROLLER.findNearestConnectionTarget(clientX, clientY);
    }

    function isConnectionTargetCompatible(fromId, target) {
        return CANVAS_CONNECTION_CONTROLLER.isConnectionTargetCompatible(fromId, target);
    }

    function getHandleCenterWorldPoint(handle) {
        return viewportGetHandleCenterWorldPoint(handle, viewport, project.viewport);
    }

    const PENDING_CONNECTION_CONTEXT_SOURCE = {
        nodeSource: {
            getNode
        },
        timeSource: {
            now: () => canvasNow()
        },
        serializationSource: {
            cloneValue: cloneRunValue
        }
    };
    const PENDING_CONNECTION_CONTROLLER = typeof WORKBENCH_PENDING_CONNECTION.createCanvasWorkbenchPendingConnectionController === 'function'
        ? WORKBENCH_PENDING_CONNECTION.createCanvasWorkbenchPendingConnectionController({
            pendingConnectionSource: PENDING_CONNECTION_CONTEXT_SOURCE
        })
        : {};
    const setPendingConnection = (...args) => PENDING_CONNECTION_CONTROLLER.setPendingConnection?.(...args);
    const getPendingConnectionSource = (...args) => PENDING_CONNECTION_CONTROLLER.getPendingConnectionSource?.(...args) || null;
    const setPendingInputTarget = (...args) => PENDING_CONNECTION_CONTROLLER.setPendingInputTarget?.(...args);
    const getPendingInputTarget = (...args) => PENDING_CONNECTION_CONTROLLER.getPendingInputTarget?.(...args) || null;
    const clearPendingConnection = (...args) => PENDING_CONNECTION_CONTROLLER.clearPendingConnection?.(...args);
    const clearPendingInputTarget = (...args) => PENDING_CONNECTION_CONTROLLER.clearPendingInputTarget?.(...args);

    function completePendingConnectionToNode(node) {
        return CANVAS_CONNECTION_CONTROLLER.completePendingConnectionToNode(node);
    }

    async function handleImageNodeDrop(node, dataTransfer) {
        return MEDIA_EDIT_CONTROLLER.handleImageNodeDrop(node, dataTransfer);
    }

    function openAddNodeMenu(x, y, world, includeViewActions, closeDelayMs) {
        return NODE_MENU_TOOLS.openAddNodeMenu(x, y, world, includeViewActions, closeDelayMs);
    }

    function openGroupContextMenu(group, x, y) {
        return CANVAS_GROUP_INTERACTION_CONTROLLER.openGroupContextMenu(group, x, y);
    }

    function appendAudioWorkflowBridgeMenuItems(items, node) {
        return CANVAS_MEDIA_CONTEXT_MENU_CONTROLLER.appendAudioWorkflowBridgeMenuItems(items, node);
    }

    function openImageMediaContextMenu(node, x, y) {
        return CANVAS_MEDIA_CONTEXT_MENU_CONTROLLER.openImageMediaContextMenu(node, x, y);
    }

    function openVideoMediaContextMenu(node, x, y) {
        return CANVAS_MEDIA_CONTEXT_MENU_CONTROLLER.openVideoMediaContextMenu(node, x, y);
    }

    function openAudioMediaContextMenu(node, x, y) {
        return CANVAS_MEDIA_CONTEXT_MENU_CONTROLLER.openAudioMediaContextMenu(node, x, y);
    }

    function openNodeContextMenu(node, x, y) {
        return CANVAS_NODE_CONTEXT_MENU_CONTROLLER.openNodeContextMenu(node, x, y);
    }
    function openResultAssetContextMenu(node, index, x, y) {
        return CANVAS_RESULT_CONTEXT_MENU_CONTROLLER.openResultAssetContextMenu?.(node, index, x, y);
    }

    function inputTargetDisplayLabel(target) {
        return CANVAS_INPUT_CREATION_CONTROLLER.inputTargetDisplayLabel(target);
    }

    function mediaCreationOption(kind, imported) {
        return CANVAS_INPUT_CREATION_CONTROLLER.mediaCreationOption(kind, imported);
    }

    function inputTargetCreationOptions(target) {
        return CANVAS_INPUT_CREATION_CONTROLLER.inputTargetCreationOptions(target);
    }

    function inputUpstreamWorld(target, nodeType) {
        return CANVAS_INPUT_CREATION_CONTROLLER.inputUpstreamWorld(target, nodeType);
    }

    function finishCreatedInputSource(sourceNode, target) {
        return CANVAS_INPUT_CREATION_CONTROLLER.finishCreatedInputSource(sourceNode, target);
    }

    async function importMediaInputSource(target, mediaKind, world) {
        return CANVAS_INPUT_CREATION_CONTROLLER.importMediaInputSource(target, mediaKind, world);
    }

    function createInputSourceByOption(target, optionKey, world) {
        return CANVAS_INPUT_CREATION_CONTROLLER.createInputSourceByOption(target, optionKey, world);
    }

    function openInputPortCreateMenu(target, x, y, world) {
        return CANVAS_INPUT_CREATION_CONTROLLER.openInputPortCreateMenu(target, x, y, world);
    }

    function createDefaultInputSource(target) {
        return CANVAS_INPUT_CREATION_CONTROLLER.createDefaultInputSource(target);
    }

    function openInputPortContextMenu(target, x, y) {
        return CANVAS_INPUT_CREATION_CONTROLLER.openInputPortContextMenu(target, x, y);
    }

    function openInputHandleContextMenu(node, slot, x, y) {
        return CANVAS_INPUT_HANDLE_CONTROLLER.openInputHandleContextMenu(node, slot, x, y);
    }

    function openConfigHandleContextMenu(node, kind, x, y) {
        return CANVAS_INPUT_HANDLE_CONTROLLER.openConfigHandleContextMenu(node, kind, x, y);
    }

    function openTextHandleContextMenu(node, slot, x, y) {
        return CANVAS_INPUT_HANDLE_CONTROLLER.openTextHandleContextMenu(node, slot, x, y);
    }

    function openTextNodeInputContextMenu(node, x, y, slot) {
        return CANVAS_INPUT_HANDLE_CONTROLLER.openTextNodeInputContextMenu(node, x, y, slot);
    }
    function openResultInputContextMenu(node, x, y) {
        return CANVAS_RESULT_CONTEXT_MENU_CONTROLLER.openResultInputContextMenu?.(node, x, y);
    }

    function openWd14ImageInputContextMenu(node, x, y) {
        return CANVAS_INPUT_HANDLE_CONTROLLER.openWd14ImageInputContextMenu(node, x, y);
    }

    function openVlmImageInputContextMenu(node, slot, x, y) {
        return CANVAS_INPUT_HANDLE_CONTROLLER.openVlmImageInputContextMenu(node, slot, x, y);
    }
    function openVlmChatMessageContextMenu(node, messageIndex, x, y) {
        return CANVAS_VLM_CHAT_CONTROLLER?.openVlmChatMessageContextMenu?.(node, messageIndex, x, y);
    }

    function openMaskSourceInputContextMenu(node, x, y) {
        return CANVAS_INPUT_HANDLE_CONTROLLER.openMaskSourceInputContextMenu(node, x, y);
    }

    function openPoseStudioReferenceContextMenu(node, x, y) {
        return CANVAS_INPUT_HANDLE_CONTROLLER.openPoseStudioReferenceContextMenu(node, x, y);
    }

    function openCompareImageInputContextMenu(node, slot, x, y) {
        return CANVAS_INPUT_HANDLE_CONTROLLER.openCompareImageInputContextMenu(node, slot, x, y);
    }
    function openBatchAnyInputContextMenu(node, x, y) {
        return CANVAS_BATCH_ANY_EDIT_CONTROLLER.openBatchAnyInputContextMenu(node, x, y);
    }

    function openEdgeContextMenu(edgeId, x, y) {
        return EDGE_INTERACTION_CONTROLLER.openEdgeContextMenu(edgeId, x, y);
    }

    function canvasAgentReadyPresetEntries() {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentReadyPresetEntries?.() || [];
    }

    function getCanvasAgentPresetScanState() {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.getCanvasAgentPresetScanState?.() || {
            state: 'idle',
            entries: [],
            checked: 0,
            total: 0,
            checkedAt: '',
            message: ''
        };
    }

    function canvasAgentPresetOptionHtml(...args) {
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.canvasAgentPresetOptionHtml?.(...args) || '';
    }

    function renderCanvasAgentCustomApiSettings(settings) {
        return renderCanvasAgentCustomApiSettingsView?.(settings) || '';
    }

    function renderCanvasSettingsPanel() {
        return CANVAS_SETTINGS_CONTROLLER.renderCanvasSettingsPanel();
    }

    async function refreshCanvasAgentAvailablePresets(options) {
        if (typeof CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER?.refreshCanvasAgentAvailablePresets !== 'function') return;
        return CANVAS_AGENT_PRESET_RUNTIME_CONTROLLER.refreshCanvasAgentAvailablePresets(options);
    }

    function openSettingsMenu(anchor) {
        return CANVAS_SETTINGS_CONTROLLER?.openSettingsMenu?.(anchor);
    }

    function toggleSetting(key) {
        return CANVAS_SETTINGS_CONTROLLER?.toggleSetting?.(key);
    }

    function consumeWorkbenchShortcut(evt) {
        if (!evt) return;
        evt.preventDefault();
        evt.stopPropagation();
        if (typeof evt.stopImmediatePropagation === 'function') evt.stopImmediatePropagation();
    }

    function isEditableElement(target) {
        if (!target || !target.closest) return false;
        return !!target.closest('input,textarea,select,[contenteditable="true"]');
    }

    function openGroupListPanel() {
        return groupListOpenPanel(GROUP_LIST_CONTEXT);
    }

    function clientToWorld(clientX, clientY) {
        return viewportClientToWorld(viewport, project.viewport, clientX, clientY);
    }

    function viewportCenterWorld() {
        return viewportCenterWorldFromState(viewport, project.viewport);
    }

    function applyProjectViewportPatch(viewportPatch, options) {
        return applyProjectViewportPatchFromProjectContext(viewportPatch, options);
    }

    function zoomAtViewportCenter(factor) {
        return CANVAS_VIEWPORT_ZOOM_CONTROLLER.zoomAtViewportCenter?.(factor);
    }

    function zoomAtClient(clientX, clientY, factor) {
        return CANVAS_VIEWPORT_ZOOM_CONTROLLER.zoomAtClient?.(clientX, clientY, factor);
    }

    function fitAll() {
        return CANVAS_VIEWPORT_FIT_CONTROLLER.fitAll?.();
    }

    function fitSelection() {
        return CANVAS_VIEWPORT_FIT_CONTROLLER.fitSelection?.();
    }

    function centerCanvas() {
        return CANVAS_VIEWPORT_FIT_CONTROLLER.centerCanvas?.();
    }

    function getNodesBounds() {
        return CANVAS_VIEWPORT_FIT_CONTROLLER.getNodesBounds?.() || { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    }

    async function importSelectedTransferAt(world) {
        return CANVAS_MEDIA_IMPORT_CONTROLLER.importSelectedTransferAt(world);
    }

    async function importTransferItemAt(id, world) {
        return CANVAS_MEDIA_IMPORT_CONTROLLER.importTransferItemAt(id, world);
    }

    function openImageFilePicker(world) {
        return CANVAS_MEDIA_IMPORT_CONTROLLER.openImageFilePicker(world);
    }

    function nodeGenerationMetadata(node) {
        return CANVAS_GENERATION_METADATA_CONTROLLER.nodeGenerationMetadata(node);
    }

    function generationMetadataPrompt(metadata) {
        return CANVAS_GENERATION_METADATA_CONTROLLER.generationMetadataPrompt(metadata);
    }

    function generationMetadataNegativePrompt(metadata) {
        return CANVAS_GENERATION_METADATA_CONTROLLER.generationMetadataNegativePrompt(metadata);
    }

    function generationMetadataParameters(metadata) {
        return CANVAS_GENERATION_METADATA_CONTROLLER.generationMetadataParameters(metadata);
    }

    function generationPromptTargetLabel(node) {
        return CANVAS_GENERATION_METADATA_CONTROLLER.generationPromptTargetLabel(node);
    }

    function resolveGenerationPromptTarget(sourceNode, world) {
        return CANVAS_GENERATION_METADATA_CONTROLLER.resolveGenerationPromptTarget(sourceNode, world);
    }

    function applyGenerationMetadataToPromptTarget(target, metadata, options) {
        return CANVAS_GENERATION_METADATA_CONTROLLER.applyGenerationMetadataToPromptTarget(target, metadata, options);
    }

    const DANBOORU_GALLERY_CONTEXT_SOURCE = {
        configSource: {
            endpoint: DANBOORU_GALLERY_ENDPOINT
        },
        languageSource: {
            t
        },
        networkSource: {
            fetch: typeof window.fetch === 'function' ? window.fetch.bind(window) : null
        },
        browserSource: {
            File: typeof File === 'function' ? File : null,
            URLSearchParams: typeof URLSearchParams === 'function' ? URLSearchParams : null
        },
        timeSource: {
            now: () => canvasNow(),
            nowIso
        },
        nodeSource: {
            addMediaNodeFromFile
        },
        viewportSource: {
            viewportCenterWorld
        },
        metadataSource: {
            mediaBrowserItemMetadata
        },
        patchSource: {
            buildMediaNodeStatePatch,
            buildMediaNodeSourcePatch,
            buildAssetMetadataPatch
        },
        runtimeSource: {
            mutate
        },
        uiSource: {
            showToast
        }
    };
    const DANBOORU_GALLERY_CONTROLLER = typeof WORKBENCH_DANBOORU_GALLERY.createCanvasDanbooruGalleryController === 'function'
        ? WORKBENCH_DANBOORU_GALLERY.createCanvasDanbooruGalleryController({
            danbooruGallerySource: DANBOORU_GALLERY_CONTEXT_SOURCE
        })
        : {};
    const fetchDanbooruGalleryPosts = (...args) => typeof DANBOORU_GALLERY_CONTROLLER.fetchDanbooruGalleryPosts === 'function'
        ? DANBOORU_GALLERY_CONTROLLER.fetchDanbooruGalleryPosts(...args)
        : Promise.reject(new Error('Danbooru gallery controller is unavailable'));
    const danbooruGalleryImageProxyUrl = (...args) => DANBOORU_GALLERY_CONTROLLER.danbooruGalleryImageProxyUrl?.(...args) || '';
    const normalizeDanbooruBrowserPost = (...args) => DANBOORU_GALLERY_CONTROLLER.normalizeDanbooruBrowserPost?.(...args) || null;
    const danbooruPostExtension = (...args) => DANBOORU_GALLERY_CONTROLLER.danbooruPostExtension?.(...args) || 'jpg';
    const danbooruPostMediaType = (...args) => DANBOORU_GALLERY_CONTROLLER.danbooruPostMediaType?.(...args) || 'image';
    const danbooruPostPrompt = (...args) => DANBOORU_GALLERY_CONTROLLER.danbooruPostPrompt?.(...args) || '';
    const importDanbooruGalleryPost = (...args) => typeof DANBOORU_GALLERY_CONTROLLER.importDanbooruGalleryPost === 'function'
        ? DANBOORU_GALLERY_CONTROLLER.importDanbooruGalleryPost(...args)
        : Promise.resolve(null);

    async function applyTransferItemToImageNode(node, item, options) {
        return MEDIA_EDIT_CONTROLLER.applyTransferItemToImageNode(node, item, options);
    }

    async function applyImageFileToNode(node, file, options) {
        return MEDIA_EDIT_CONTROLLER.applyImageFileToNode(node, file, options);
    }

    function disconnectVlmImageInput(node, slot) {
        return CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.disconnectVlmImageInput(node, slot);
    }

    async function addImageNodeFromFile(file, world) {
        return CANVAS_MEDIA_IMPORT_CONTROLLER.addImageNodeFromFile(file, world);
    }

    function getInputImageNodePosition(targetNode, handle, size) {
        return CANVAS_INPUT_CREATION_CONTROLLER.getInputImageNodePosition(targetNode, handle, size);
    }

    function createEmptyImageNodeForInput(targetNode, slotLabel, handle) {
        return CANVAS_INPUT_CREATION_CONTROLLER.createEmptyImageNodeForInput(targetNode, slotLabel, handle);
    }

    function createEmptyMediaNodeForInput(targetNode, mediaKind, slotLabel, handle) {
        return CANVAS_INPUT_CREATION_CONTROLLER.createEmptyMediaNodeForInput(targetNode, mediaKind, slotLabel, handle);
    }

    function createNodeForUploadInput(targetNode, slot, handle) {
        return CANVAS_INPUT_CREATION_CONTROLLER.createNodeForUploadInput(targetNode, slot, handle);
    }

    async function createVideoNodeForUploadInput(targetNode, slot, handle) {
        return CANVAS_INPUT_CREATION_CONTROLLER.createVideoNodeForUploadInput(targetNode, slot, handle);
    }

    async function uploadSourceVideoForSam3Node(targetNode, handle) {
        return CANVAS_INPUT_CREATION_CONTROLLER.uploadSourceVideoForSam3Node(targetNode, handle);
    }

    function createImageNodeForUploadInput(targetNode, slot, handle) {
        return CANVAS_INPUT_CREATION_CONTROLLER.createImageNodeForUploadInput(targetNode, slot, handle);
    }

    function createAdvancedMaskNodeForClassicInput(targetNode, handle) {
        return CANVAS_INPUT_CREATION_CONTROLLER.createAdvancedMaskNodeForClassicInput(targetNode, handle);
    }

    function createSam3VideoMaskNodeForPresetInput(targetNode, handle) {
        return CANVAS_INPUT_CREATION_CONTROLLER.createSam3VideoMaskNodeForPresetInput(targetNode, handle);
    }

    function createImageNodeForImageInput(targetNode, kind, slot, handle) {
        return CANVAS_INPUT_CREATION_CONTROLLER.createImageNodeForImageInput(targetNode, kind, slot, handle);
    }

    async function addMediaNodeFromFile(file, world) {
        return CANVAS_MEDIA_IMPORT_CONTROLLER.addMediaNodeFromFile(file, world);
    }

    function addBatchAnyNode(world, options) {
        return CANVAS_BATCH_ANY_CREATION_CONTROLLER.addBatchAnyNode(world, options);
    }

    async function createBatchAnyItemFromFile(file, kind) {
        return CANVAS_BATCH_ANY_CREATION_CONTROLLER.createBatchAnyItemFromFile(file, kind);
    }

    async function materializeBatchAnyItemForStorage(nodeId, itemId) {
        return CANVAS_PROJECT_ASSETS_CONTROLLER.materializeBatchAnyItemForStorage(nodeId, itemId);
    }

    function createBatchAnyInputEdge(fromId, toId, options) {
        return CANVAS_BATCH_ANY_CONNECTION_CONTROLLER.createBatchAnyInputEdge(fromId, toId, options);
    }

    async function addBatchAnyFilesToNode(node, files) {
        return CANVAS_BATCH_ANY_CREATION_CONTROLLER.addBatchAnyFilesToNode(node, files);
    }

    function openBatchAnyFilePicker(node) {
        return CANVAS_BATCH_ANY_CREATION_CONTROLLER.openBatchAnyFilePicker(node);
    }

    async function applyMediaFileToNode(node, file, options) {
        return MEDIA_EDIT_CONTROLLER.applyMediaFileToNode(node, file, options);
    }

    async function materializeNodeAssetForStorage(nodeId) {
        return CANVAS_PROJECT_ASSETS_CONTROLLER.materializeNodeAssetForStorage(nodeId);
    }

    const MEDIA_VIEWER_CONTEXT_SOURCE = {
        languageSource: {
            t
        },
        utilitySource: {
            escapeHtml,
            clamp
        },
        domSource: {
            document
        },
        browserSource: {
            getWindow: () => window,
            getInnerWidth: () => window.innerWidth,
            getInnerHeight: () => window.innerHeight
        },
        timingSource: {
            requestAnimationFrame: (callback) => requestCanvasFrame(callback)
        },
        assetSource: {
            assetDisplaySrc,
            assetMediaKind,
            readAssetInfo,
            readImageInfo,
            safeAssetDisplaySrc
        },
        nodeSource: {
            getNode,
            getSelectedResultAsset
        },
        compareSource: {
            refreshCompareDom,
            renderCompareControls,
            renderCompareStageHtml,
            startComparePositionDrag,
            updateCompareParam
        },
        viewSource: {
            detectWorkbenchTheme,
            ensureWorkbenchFormFieldNames
        },
        uiSource: {
            showToast
        }
    };

    const CANVAS_MEDIA_VIEWER_CONTEXT = typeof WORKBENCH_CANVAS_MEDIA_VIEWER_CONTEXT.createCanvasWorkbenchMediaViewerContext === 'function'
        ? WORKBENCH_CANVAS_MEDIA_VIEWER_CONTEXT.createCanvasWorkbenchMediaViewerContext({
            mediaViewerSource: MEDIA_VIEWER_CONTEXT_SOURCE
        })
        : {};
    MEDIA_VIEWER_CONTEXT = CANVAS_MEDIA_VIEWER_CONTEXT.MEDIA_VIEWER_CONTEXT || {};

    function openImageViewer(node) {
        return mediaViewerOpenImage(node, MEDIA_VIEWER_CONTEXT);
    }

    function openAssetViewer(asset, title) {
        return mediaViewerOpenAsset(asset, title, MEDIA_VIEWER_CONTEXT);
    }

    function openNodeMediaFullscreen(node) {
        return mediaViewerOpenNodeFullscreen(node, MEDIA_VIEWER_CONTEXT);
    }

    function openMediaViewer(node) {
        return mediaViewerOpenMedia(node, MEDIA_VIEWER_CONTEXT);
    }

    function openCompareFullscreen(node) {
        return mediaViewerOpenCompare(node, MEDIA_VIEWER_CONTEXT);
    }

    const NODE_BROWSER_CONTEXT_SOURCE = {
        languageSource: {
            t
        },
        utilitySource: {
            escapeHtml
        },
        domSource: {
            document
        },
        browserSource: {
            setTimeout: typeof setTimeout === 'function' ? setTimeout : null
        },
        projectSource: {
            getProject: () => project,
            getNode
        },
        viewportSource: {
            defaultNodeSize,
            focusNode: (node) => {
                if (!node) return;
                CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(node.id);
                centerViewportOnWorld((node.x || 0) + (node.w || defaultNodeSize(node.type).w) / 2, (node.y || 0) + (node.h || defaultNodeSize(node.type).h) / 2);
                renderAll();
            }
        },
        assetSource: {
            readAssetSize
        },
        viewSource: {
            closeContextMenu,
            detectWorkbenchTheme,
            ensureWorkbenchFormFieldNames,
            renderIconHtml
        },
    };

    const CANVAS_NODE_BROWSER_CONTEXT = typeof WORKBENCH_CANVAS_NODE_BROWSER_CONTEXT.createCanvasWorkbenchNodeBrowserContext === 'function'
        ? WORKBENCH_CANVAS_NODE_BROWSER_CONTEXT.createCanvasWorkbenchNodeBrowserContext({
            nodeBrowserSource: NODE_BROWSER_CONTEXT_SOURCE
        })
        : {};
    NODE_BROWSER_CONTEXT = CANVAS_NODE_BROWSER_CONTEXT.NODE_BROWSER_CONTEXT || {};

    const GROUP_LIST_CONTEXT_SOURCE = {
        languageSource: {
            t
        },
        utilitySource: {
            escapeHtml
        },
        domSource: {
            document
        },
        groupSource: {
            getGroups: ensureProjectGroups,
            getGroup,
            getNodesInsideGroup,
            groupShortcutLabel,
            normalizeCanvasColor,
            focusGroup
        },
        actionSource: {
            addAreaGroup
        },
        viewportSource: {
            viewportCenterWorld
        },
        viewSource: {
            detectWorkbenchTheme,
            ensureWorkbenchFormFieldNames
        }
    };

    const CANVAS_GROUP_LIST_CONTEXT = typeof WORKBENCH_CANVAS_GROUP_LIST_CONTEXT.createCanvasWorkbenchGroupListContext === 'function'
        ? WORKBENCH_CANVAS_GROUP_LIST_CONTEXT.createCanvasWorkbenchGroupListContext({
            groupListSource: GROUP_LIST_CONTEXT_SOURCE
        })
        : {};
    GROUP_LIST_CONTEXT = CANVAS_GROUP_LIST_CONTEXT.GROUP_LIST_CONTEXT || {};

    function openNodeSearchPanel() {
        return nodeBrowserOpenSearchPanel(NODE_BROWSER_CONTEXT);
    }

    function openCanvasManual() {
        return nodeBrowserOpenCanvasManual(NODE_BROWSER_CONTEXT);
    }

    const PROJECT_MANAGER_CONTEXT_SOURCE = {
        languageSource: {
            t
        },
        utilitySource: {
            escapeHtml,
            formatBytes
        },
        domSource: {
            document
        },
        browserSource: {
            prompt: (...args) => window.prompt(...args)
        },
        projectSource: {
            getProject: () => project,
            getProjectId: () => PROJECT_ID,
            getCurrentProjectId: () => project.id || PROJECT_ID,
            handleProjectDeleted,
            openProjectJsonPicker,
            saveCurrentProject: () => saveProject(false, { persist: true, backupExisting: true }),
            switchProjectById
        },
        requestSource: {
            deleteProject: sendCanvasProjectDeleteRequest,
            listProjects: sendCanvasProjectListRequest
        },
        viewSource: {
            closeContextMenu,
            detectWorkbenchTheme
        },
        uiSource: {
            showToast
        },
        timeSource: {
            nowIso,
            formatLocalTime
        }
    };

    const CANVAS_PROJECT_MANAGER_CONTEXT = typeof WORKBENCH_CANVAS_PROJECT_MANAGER_CONTEXT.createCanvasWorkbenchProjectManagerContext === 'function'
        ? WORKBENCH_CANVAS_PROJECT_MANAGER_CONTEXT.createCanvasWorkbenchProjectManagerContext({
            projectManagerSource: PROJECT_MANAGER_CONTEXT_SOURCE
        })
        : {};
    PROJECT_MANAGER_CONTEXT = CANVAS_PROJECT_MANAGER_CONTEXT.PROJECT_MANAGER_CONTEXT || {};

    async function openProjectListPanel() {
        return projectManagerOpenPanel(PROJECT_MANAGER_CONTEXT);
    }

    const ASSET_MANAGER_CONTEXT_SOURCE = {
        languageSource: {
            t
        },
        utilitySource: {
            escapeHtml,
            formatBytes,
            cloneValue: cloneRunValue
        },
        domSource: {
            document
        },
        browserSource: {
            getClipboard: () => navigator.clipboard,
            confirm: (...args) => window.confirm(...args)
        },
        projectSource: {
            getProject: () => project,
            getProjectId: () => PROJECT_ID
        },
        assetSource: {
            assetDisplaySrc,
            deleteAssets: sendCanvasDeleteAssetsRequest,
            listAssets: sendCanvasListAssetsRequest,
            readAssetSize
        },
        viewportSource: {
            centerViewportOnWorld,
            defaultNodeSize,
            locateNode: (node) => {
                if (!node) return;
                CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingGroup(node.id);
                centerViewportOnWorld((node.x || 0) + (node.w || defaultNodeSize(node.type).w) / 2, (node.y || 0) + (node.h || defaultNodeSize(node.type).h) / 2);
                renderAll();
            }
        },
        viewSource: {
            closeContextMenu,
            detectWorkbenchTheme,
            openAssetViewer
        },
        uiSource: {
            showToast
        },
        stateSource: {
            setAssetRoot: (...args) => setCanvasProjectAssetRoot(...args)
        }
    };

    const CANVAS_ASSET_MANAGER_CONTEXT = typeof WORKBENCH_CANVAS_ASSET_MANAGER_CONTEXT.createCanvasWorkbenchAssetManagerContext === 'function'
        ? WORKBENCH_CANVAS_ASSET_MANAGER_CONTEXT.createCanvasWorkbenchAssetManagerContext({
            assetManagerSource: ASSET_MANAGER_CONTEXT_SOURCE
        })
        : {};
    ASSET_MANAGER_CONTEXT = CANVAS_ASSET_MANAGER_CONTEXT.ASSET_MANAGER_CONTEXT || {};

    async function openAssetManagerPanel() {
        return assetManagerOpenPanel(ASSET_MANAGER_CONTEXT);
    }

    function copyAssetPath(asset) {
        return assetManagerCopyAssetPath(asset, ASSET_MANAGER_CONTEXT);
    }

    const MASK_EDITOR_CONTEXT_SOURCE = {
        languageSource: {
            t
        },
        utilitySource: {
            escapeHtml,
            clamp,
            uid,
            nowIso
        },
        domSource: {
            document
        },
        mediaSource: {
            Image: typeof Image !== 'undefined' ? Image : null,
            setTimeout: typeof setTimeout === 'function' ? (...args) => window.setTimeout(...args) : null
        },
        nodeSource: {
            applyImageFileToNode,
            getNodeImageSrc,
            buildMediaNodeStatePatch,
            isNodeLocked
        },
        viewSource: {
            detectWorkbenchTheme,
            ensureWorkbenchFormFieldNames
        },
        runtimeSource: {
            createThumbnailDataUrl,
            mutate,
            pushHistory
        },
        uiSource: {
            showToast
        }
    };

    const CANVAS_MASK_EDITOR_CONTEXT = typeof WORKBENCH_CANVAS_MASK_EDITOR_CONTEXT.createCanvasWorkbenchMaskEditorContext === 'function'
        ? WORKBENCH_CANVAS_MASK_EDITOR_CONTEXT.createCanvasWorkbenchMaskEditorContext({
            maskEditorSource: MASK_EDITOR_CONTEXT_SOURCE
        })
        : {};
    MASK_EDITOR_CONTEXT = CANVAS_MASK_EDITOR_CONTEXT.MASK_EDITOR_CONTEXT || {};
    const MINIMAX_H3_STORYBOARD_PRESET_EDITOR_SOURCE = {
        nodeSource: {
            isMiniMaxH3PresetNode,
            isNodeLocked,
            getNode,
            h3StoryboardOptionsForPreset,
            h3StoryboardInventoryForPreset,
            h3StoryboardStateForPreset,
            getVisibleUploadSlots,
            getUploadSlotMediaKind,
            canNodeConnectToUploadSlot,
            getSlotOrder: () => SLOT_ORDER,
            h3StoryboardVlmReferencesForPreset,
            h3StoryboardVlmReferenceSummary,
            h3StoryboardMotionPictureIndex,
            canvasAgentPromptTargetFromNode,
            canvasAgentPresetPromptDefaults
        },
        editorSource: {
            isLoaded: () => typeof window.SimpAIH3StoryboardEditor?.open === 'function',
            open: (options) => window.SimpAIH3StoryboardEditor.open(options),
            preferredStoryboardVideoSlot: (...args) => window.SimpAIH3StoryboardEditor?.preferredStoryboardVideoSlot?.(...args) || '',
            openVisualPrompt: options => window.SimpAIVisualPromptEditor?.open(options),
            getVisualPromptApi: () => window.SimpAIVisualPromptEditor || null,
            getVisualPromptEditor: () => window.SimpAIVisualPromptEditor || null,
            getStoryboardEditor: () => window.SimpAIH3StoryboardEditor || null
        },
        stateSource: {
            getSystemParams: () => window.simpleaiTopbarSystemParams || {},
            buildNodeParamsPatch,
            buildH3StoryboardStatePatch,
            buildSpecialNodeStatusPatch,
            mergeCanvasRunStatus
        },
        projectSource: {
            getProject: () => project,
            buildProjectNodeAppendPatch
        },
        mediaSource: { buildMediaNodeFromAsset },
        historySource: { pushHistory },
        domSource: { canvasOverlayHost },
        runtimeSource: {
            ensureWorkbenchLazyRuntime,
            loadLazyGroup: group => window.SimpAILazyAssetLoader?.loadGroup(group),
            alert: message => window.alert(message),
            showToast,
            rewriteCanvasAgentPromptWithLlm,
            runtimeUiLang,
            pushHistory,
            nowIso,
            placeNodeAvoidingOverlap,
            createUploadEdge,
            mutate
        },
        selectionSource: {
            selectNode: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionIncludingEmpty(nodeId)
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    const CANVAS_MINIMAX_H3_STORYBOARD_PRESET_EDITOR_CONTROLLER = typeof WORKBENCH_CANVAS_H3_STORYBOARD_PRESET_EDITOR.createCanvasMiniMaxH3StoryboardPresetEditorController === 'function'
        ? WORKBENCH_CANVAS_H3_STORYBOARD_PRESET_EDITOR.createCanvasMiniMaxH3StoryboardPresetEditorController({
            miniMaxH3StoryboardPresetEditorSource: MINIMAX_H3_STORYBOARD_PRESET_EDITOR_SOURCE
        })
        : {};

    const LTX23_GUIDE_EDITOR_SOURCE = {
        nodeSource: { isLtx23MultiGuidePresetNode, isNodeLocked, getPresetThemeInfo, getPresetTheme, getNode },
        editorSource: {
            isLoaded: () => typeof window.SimpAILTXGuideEditor?.open === 'function',
            open: options => window.SimpAILTXGuideEditor.open(options),
            getGuideEditor: () => window.SimpAILTXGuideEditor
        },
        domSource: { canvasOverlayHost },
        stateSource: { buildNodeParamsPatch, buildLtx23GuidesStatePatch, buildSpecialNodeStatusPatch, mergeCanvasRunStatus },
        runtimeSource: { ensureWorkbenchLazyRuntime, pushHistory, nowIso, mutate, showToast },
        selectionSource: {
            selectNode: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionIncludingEmpty(nodeId)
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            getEditorLanguageState: () => window.simpleaiTopbarSystemParams || { __lang: document.documentElement.lang || 'en' },
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    const CANVAS_LTX23_GUIDE_EDITOR_CONTROLLER = typeof WORKBENCH_CANVAS_LTX23_GUIDE_EDITOR.createCanvasLtx23GuideEditorController === 'function'
        ? WORKBENCH_CANVAS_LTX23_GUIDE_EDITOR.createCanvasLtx23GuideEditorController({ ltx23GuideEditorSource: LTX23_GUIDE_EDITOR_SOURCE })
        : {};

    const LIVEPORTRAIT_VIDEO_EXPRESSION_EDITOR_SOURCE = {
        nodeSource: {
            isLivePortraitVideoExpressionPresetNode,
            isNodeLocked,
            getNode,
            getSelectedResultAsset,
            safeAssetFullDisplaySrc,
            extractVideoFirstFrameDataUrl
        },
        projectSource: {
            getProject: () => project,
            getProjectId: () => PROJECT_ID
        },
        editorSource: {
            isLoaded: () => typeof window.SimpAILivePortraitExpressionEditor?.open === 'function',
            open: (options) => window.SimpAILivePortraitExpressionEditor.open(options)
        },
        stateSource: {
            buildLivePortraitVideoExpressionStatePatch,
            buildNodeParamsPatch,
            buildSpecialNodeStatusPatch,
            mergeCanvasRunStatus
        },
        serializationSource: { serializeAssetSourceForRun },
        domSource: { canvasOverlayHost, detectWorkbenchTheme, ensureWorkbenchFormFieldNames },
        runtimeSource: {
            ensureWorkbenchLazyRuntime,
            pushHistory,
            nowIso,
            mutate,
            showToast
        },
        selectionSource: {
            selectNode: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionIncludingEmpty(nodeId)
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    const CANVAS_LIVEPORTRAIT_VIDEO_EXPRESSION_EDITOR_CONTROLLER = typeof WORKBENCH_CANVAS_LIVEPORTRAIT_VIDEO_EDITOR.createCanvasLivePortraitVideoExpressionEditorController === 'function'
        ? WORKBENCH_CANVAS_LIVEPORTRAIT_VIDEO_EDITOR.createCanvasLivePortraitVideoExpressionEditorController({
            livePortraitVideoExpressionEditorSource: LIVEPORTRAIT_VIDEO_EXPRESSION_EDITOR_SOURCE
        })
        : {};

    const MASK_RUNTIME_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project,
            getProjectId: () => PROJECT_ID
        },
        nodeSource: {
            isNodeIgnored,
            getNode,
            getSelectedResultAsset
        },
        stateSource: {
            buildMaskStatePatch,
            buildMaskStatus
        },
        assetSource: {
            buildGeneratedMaskAsset
        },
        serializationSource: {
            serializeAssetSourceForRun,
            cloneRunValue
        },
        requestSource: {
            sendCanvasGenerateMaskRequest
        },
        selectionSource: {
            selectMaskNode: nodeId => CANVAS_SELECTION_CONTROLLER.setNodeSelectionPreservingEdgeAndGroup(nodeId)
        },
        runtimeSource: {
            pushHistory,
            mutate,
            showToast
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        },
        localizeSource: {
            localizeMaskStatus
        }
    };
    const CANVAS_MASK_RUNTIME_CONTROLLER = typeof WORKBENCH_CANVAS_MASK_RUNTIME.createCanvasMaskRuntimeController === 'function'
        ? WORKBENCH_CANVAS_MASK_RUNTIME.createCanvasMaskRuntimeController({
            maskRuntimeSource: MASK_RUNTIME_CONTEXT_SOURCE
        })
        : {};

    const WD14_RUNTIME_CONTEXT_SOURCE = {
        projectSource: {
            getProject: () => project,
            getProjectId: () => PROJECT_ID
        },
        nodeSource: {
            isNodeIgnored,
            getNode,
            getSelectedResultAsset
        },
        stateSource: {
            buildWd14StatePatch,
            buildWd14Status
        },
        serializationSource: {
            serializeAssetSourceForRun,
            cloneRunValue
        },
        requestSource: {
            sendCanvasWd14TagRequest
        },
        runtimeSource: {
            pushHistory,
            mutate,
            showToast,
            nowIso
        },
        languageSource: {
            getLanguageState: () => ({ __lang: runtimeUiLang() }),
            t: (en, cn, state) => t(en, cn, state || { __lang: runtimeUiLang() })
        }
    };
    const CANVAS_WD14_RUNTIME_CONTROLLER = typeof WORKBENCH_CANVAS_WD14_RUNTIME.createCanvasWd14RuntimeController === 'function'
        ? WORKBENCH_CANVAS_WD14_RUNTIME.createCanvasWd14RuntimeController({
            wd14RuntimeSource: WD14_RUNTIME_CONTEXT_SOURCE
        })
        : {};


    async function replaceNodeImage(node) {
        return maskEditorReplaceNodeImage(node, MASK_EDITOR_CONTEXT);
    }

    function openMaskEditor(node) {
        return maskEditorOpen(node, MASK_EDITOR_CONTEXT);
    }

    function openPresetPalette(world) {
        return CANVAS_PRESET_PALETTE.openPresetPalette(world);
    }

    function closePresetPalette() {
        return CANVAS_PRESET_PALETTE.closePresetPalette();
    }

    function renderPresetPalette() {
        return CANVAS_PRESET_PALETTE.renderPresetPalette();
    }

    function addPresetNode(entry, world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addPresetNode(entry, world, options);
    }

    function reconcilePresetNodesWithCatalog(entries) {
        return CANVAS_NODE_FACTORY_CONTROLLER.reconcilePresetNodesWithCatalog(project, entries, { filterProjectEdges });
    }

    function ensureConfigNode(presetNode, kind) {
        return CANVAS_CONFIG_CREATION_CONTROLLER.ensureConfigNode(presetNode, kind);
    }

    function buildInitialConfigValues(kind, sourceConfig, presetNode, detectionIndex) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.buildInitialConfigValues(kind, sourceConfig, presetNode, detectionIndex);
    }

    function getConfigTargetPreset(configNode) {
        return CANVAS_CONFIG_CONNECTION_CONTROLLER.getConfigTargetPreset(configNode);
    }

    function setStylesConfigSelection(nodeId, styles, options) {
        return CANVAS_CONFIG_EDIT_CONTROLLER.setStylesConfigSelection(nodeId, styles, options);
    }

    function updateStylesConfigSelection(nodeId, styleName, checked) {
        return CANVAS_CONFIG_EDIT_CONTROLLER.updateStylesConfigSelection(nodeId, styleName, checked);
    }

    function resetStylesConfigSelection(nodeId) {
        return CANVAS_CONFIG_EDIT_CONTROLLER.resetStylesConfigSelection(nodeId);
    }

    function handleStylesConfigAction(node, action) {
        return CANVAS_CONFIG_EDIT_CONTROLLER.handleStylesConfigAction(node, action);
    }

    function handleStylesConfigActionClick(node, evt) {
        return CANVAS_CONFIG_EDIT_CONTROLLER.handleStylesConfigActionClick(node, evt);
    }

    function handleModelBrowserButtonClick(node, nodeEl, evt) {
        return CANVAS_CONFIG_EDIT_CONTROLLER.handleModelBrowserButtonClick(node, nodeEl, evt);
    }

    function setModelConfigFilter(nodeId, enabled) {
        return CANVAS_MODEL_CONFIG_CATALOG_CONTROLLER.setModelConfigFilter(nodeId, enabled);
    }

    function updateConfigParam(nodeId, key, value, inputType, options) {
        return CANVAS_CONFIG_EDIT_CONTROLLER.updateConfigParam(nodeId, key, value, inputType, options);
    }

    function getPresetCatalogEntryForNode(presetNode) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getPresetCatalogEntryForNode(presetNode);
    }

    function getPresetConfigSource(presetNode, kind) {
        return CANVAS_CONFIG_VALUES_CONTROLLER.getPresetConfigSource(presetNode, kind);
    }

    function updateConfigLora(nodeId, index, key, value) {
        return CANVAS_CONFIG_EDIT_CONTROLLER.updateConfigLora(nodeId, index, key, value);
    }

    function handleNodeConfigFieldEvent(nodeEl, node, evt, eventType) {
        return CANVAS_CONFIG_EDIT_CONTROLLER.handleNodeConfigFieldEvent(nodeEl, node, evt, eventType);
    }

    function applyConfigNodeToPreset(configNode) {
        return CANVAS_CONFIG_CONNECTION_CONTROLLER.applyConfigNodeToPreset(configNode);
    }

    async function refreshModelConfigCatalog(configNode, presetNode) {
        return CANVAS_MODEL_CONFIG_CATALOG_CONTROLLER.refreshModelConfigCatalog(configNode, presetNode);
    }

    function addStyleSelectorNode(world, options) {
        return styleSelectorAddNode?.(world, options, STYLE_SELECTOR_NODE_CONTEXT) ?? null;
    }

    function linkStyleSelectorToPreset(selectorNode, presetNode, options) {
        return styleSelectorLinkToPreset?.(selectorNode, presetNode, options, STYLE_SELECTOR_NODE_CONTEXT) ?? false;
    }

    function ensureStyleSelectorForPreset(presetNode, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.ensureStyleSelectorForPreset(presetNode, options);
    }

    function applyStyleSelectorToPreset(selectorNode, style, options) {
        return styleSelectorApplyToPreset?.(selectorNode, style, options, STYLE_SELECTOR_NODE_CONTEXT) ?? false;
    }

    async function runStyleTransferPresetNode(node, options) {
        return styleSelectorRunStyleTransferPresetNode?.(node, options, STYLE_SELECTOR_NODE_CONTEXT)
            ?? { ok: false, error: 'style selector runtime unavailable' };
    }

    async function runStyleSelectorTargetPreset(selectorNode, options) {
        return styleSelectorRunTargetPreset?.(selectorNode, options, STYLE_SELECTOR_NODE_CONTEXT)
            ?? { ok: false, error: 'style selector runtime unavailable' };
    }

    function runPresetNodeFromUi(node, options) {
        return styleSelectorRunPresetNodeFromUi?.(node, options, STYLE_SELECTOR_NODE_CONTEXT)
            ?? { ok: false, error: 'preset run unavailable' };
    }

    function addTextNode(world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addTextNode(world, options);
    }

    function addTextMergeNode(world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addTextMergeNode(world, options);
    }

    function addTextMergeInput(node) {
        return CANVAS_TEXT_CONNECTION_CONTROLLER.addTextMergeInput(node);
    }

    function removeTextMergeInput(node, slot) {
        return CANVAS_TEXT_CONNECTION_CONTROLLER.removeTextMergeInput(node, slot);
    }

    function syncTextMergeOutputDom(node) {
        return CANVAS_TEXT_CONNECTION_CONTROLLER.syncTextMergeOutputDom(node);
    }

    function refreshTextMergeDependents(sourceNodeId, visited) {
        return CANVAS_TEXT_CONNECTION_CONTROLLER.refreshTextMergeDependents(sourceNodeId, visited);
    }

    function updateTextMergeSeparator(nodeId, value) {
        return CANVAS_NODE_PARAM_CONTROLLER?.updateTextMergeSeparator?.(nodeId, value);
    }

    function addWildcardsHelperNode(world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addWildcardsHelperNode(world, options);
    }

    function addMediaBrowserNode(world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addMediaBrowserNode(world, options);
    }

    function addNoteNode(world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addNoteNode(world, options);
    }

    function addTranslationNode(world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addTranslationNode(world, options);
    }

    function updateTextNodeValue(nodeId, value) {
        return CANVAS_NODE_PARAM_CONTROLLER?.updateTextNodeValue?.(nodeId, value);
    }

    function refreshNoteDom(nodeId) {
        return CANVAS_NOTE_EDIT_CONTROLLER.refreshNoteDom(nodeId);
    }

    function updateNoteText(nodeId, value, options) {
        return CANVAS_NOTE_EDIT_CONTROLLER.updateNoteText(nodeId, value, options);
    }

    function handleNoteTextEvent(node, evt, eventType) {
        return CANVAS_NOTE_EDIT_CONTROLLER.handleNoteTextEvent(node, evt, eventType);
    }

    function updateNoteStyle(nodeId, key, value, inputType) {
        return CANVAS_NOTE_EDIT_CONTROLLER.updateNoteStyle(nodeId, key, value, inputType);
    }

    function updateNodeCustomColor(nodeId, value, options) {
        return CANVAS_NODE_APPEARANCE_CONTROLLER.updateNodeCustomColor?.(nodeId, value, options);
    }

    function bindInspectorNodeColorEvents(inspector) {
        return CANVAS_NODE_APPEARANCE_CONTROLLER.bindInspectorNodeColorEvents?.(inspector) || false;
    }

    function updateNoteSize(nodeId, key, value) {
        return CANVAS_NOTE_EDIT_CONTROLLER.updateNoteSize(nodeId, key, value);
    }

    function updateNoteTail(nodeId, key, value, inputType, options) {
        return CANVAS_NOTE_EDIT_CONTROLLER.updateNoteTail(nodeId, key, value, inputType, options);
    }

    function toggleNoteTail(node) {
        return CANVAS_NOTE_EDIT_CONTROLLER.toggleNoteTail(node);
    }

    function resetNoteTail(node) {
        return CANVAS_NOTE_EDIT_CONTROLLER.resetNoteTail(node);
    }

    function updateTranslationInput(nodeId, value) {
        return CANVAS_NODE_PARAM_CONTROLLER?.updateTranslationInput?.(nodeId, value);
    }

    function updateTranslationParam(nodeId, key, value) {
        return CANVAS_NODE_PARAM_CONTROLLER?.updateTranslationParam?.(nodeId, key, value);
    }

    function addTagCartNode(world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addTagCartNode(world, options);
    }

    function updateTagCartParam(nodeId, key, value) {
        return CANVAS_NODE_PARAM_CONTROLLER?.updateTagCartParam?.(nodeId, key, value);
    }

    function addWd14Node(world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addWd14Node(world, options);
    }

    function updateWd14Param(nodeId, key, value, inputType) {
        return CANVAS_NODE_PARAM_CONTROLLER?.updateWd14Param?.(nodeId, key, value, inputType);
    }

    function addVlmNode(world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addVlmNode(world, options);
    }

    function updateMaskParam(nodeId, key, value, inputType) {
        return CANVAS_NODE_PARAM_CONTROLLER?.updateMaskParam?.(nodeId, key, value, inputType);
    }

    function updateQwenTtsParam(nodeId, key, value, inputType) {
        return CANVAS_NODE_PARAM_CONTROLLER?.updateQwenTtsParam?.(nodeId, key, value, inputType);
    }

    function updateDirectorStatus(node) {
        return CANVAS_TIMELINE_CONTEXT.updateDirectorStatus?.(node);
    }

    function addMaskNode(world, options) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addMaskNode(world, options);
    }

    function addSam3VideoMaskNode(world, options) {
        return sam3AddNode(world, options || {}, SAM3_VIDEO_MASK_NODE_CONTEXT);
    }

    function addCameraMotionNode(world, options) {
        return cameraMotionAddNode(world, options, CAMERA_MOTION_NODE_CONTEXT);
    }

    function addPoseStudioNode(world, options) {
        return poseStudioAddNode(world, options, POSE_STUDIO_NODE_CONTEXT);
    }

    function addGaussianStudioNode(world, options) {
        return gaussianStudioAddNode(world, options, GAUSSIAN_STUDIO_NODE_CONTEXT);
    }

    function addLivePortraitExpressionNode(world, options) {
        return livePortraitAddNode(world, options, LIVEPORTRAIT_EXPRESSION_NODE_CONTEXT);
    }

    function addQwenTtsNode(mode, world, options) {
        if (typeof qwenTtsAddNode !== 'function') {
            showToast(t('Qwen TTS canvas node is not loaded.', 'Qwen TTS 画布节点尚未加载。'));
            return null;
        }
        return qwenTtsAddNode(mode || 'voice_design', world || viewportCenterWorld(), options, QWEN_TTS_NODE_CONTEXT);
    }

    function addDirectorTimelineNode(world, options) {
        return CANVAS_TIMELINE_CREATION_CONTROLLER.addDirectorTimelineNode(world, options);
    }

    function getTranslateCacheKey(target, key) {
        return TRANSLATION_CONTROLLER?.getTranslateCacheKey?.(target, key) || `${target || 'text'}:${key || ''}`;
    }

    function rememberTranslation(node, target, key, entry) {
        return TRANSLATION_CONTROLLER?.rememberTranslation?.(node, target, key, entry);
    }

    function setTranslatedFieldValue(node, target, key, value, field) {
        return TRANSLATION_CONTROLLER?.setTranslatedFieldValue?.(node, target, key, value, field) || false;
    }

    function readTagCartFieldValue(...args) {
        return CANVAS_TAG_CART_CONTROLLER.readTagCartFieldValue(...args);
    }

    async function openTagCartForField(...args) {
        return CANVAS_TAG_CART_CONTROLLER.openTagCartForField(...args);
    }

    async function openTagCartForNode(...args) {
        return CANVAS_TAG_CART_CONTROLLER.openTagCartForNode(...args);
    }

    function handleTagCartClick(...args) {
        return CANVAS_TAG_CART_CONTROLLER.handleTagCartClick(...args);
    }

    function bindInspectorTagCartEvents(...args) {
        return CANVAS_TAG_CART_CONTROLLER.bindInspectorTagCartEvents?.(...args) || false;
    }

    function syncTextOutputDom(nodeId, value) {
        return CANVAS_TEXT_NODE_RENDERER?.syncTextOutputDom?.(nodeId, value);
    }

    async function runTranslationNode(node) {
        return TRANSLATION_CONTROLLER?.runTranslationNode?.(node) || { ok: false, error: 'translation unavailable' };
    }

    async function handleTranslateButton(node, button) {
        return TRANSLATION_CONTROLLER?.handleTranslateButton?.(node, button);
    }

    function addCompareNode(world, options) {
        return CANVAS_COMPARE_CREATION_CONTROLLER.addCompareNode(world, options);
    }

    function createCompareNodeFromSources(sources) {
        return CANVAS_COMPARE_CREATION_CONTROLLER.createCompareNodeFromSources(sources);
    }

    function addTimelineNode(world, options) {
        return CANVAS_TIMELINE_CREATION_CONTROLLER.addTimelineNode(world, options);
    }

    function timelineTrackForSource(node, source) {
        return CANVAS_TIMELINE_CONNECTION_CONTROLLER.timelineTrackForSource(node, source);
    }

    function addTimelineClipFromSource(timelineNode, source, options) {
        return CANVAS_TIMELINE_CONNECTION_CONTROLLER.addTimelineClipFromSource(timelineNode, source, options);
    }

    function addSelectedMediaToTimeline(timelineNode) {
        return CANVAS_TIMELINE_CREATION_CONTROLLER.addSelectedMediaToTimeline(timelineNode);
    }

    function createTimelineNodeFromSources(sources) {
        return CANVAS_TIMELINE_CREATION_CONTROLLER.createTimelineNodeFromSources(sources);
    }

    function addManualOutputNode(world) {
        return CANVAS_AUX_NODE_CREATION_CONTROLLER.addManualOutputNode(world);
    }

    function createUploadEdge(fromId, toId, slot, options) {
        return CANVAS_UPLOAD_CONNECTION_CONTROLLER.createUploadEdge(fromId, toId, slot, options);
    }

    function createPresetToPresetBridgeEdge(fromId, toId, slot) {
        return CANVAS_UPLOAD_CONNECTION_CONTROLLER.createPresetToPresetBridgeEdge(fromId, toId, slot);
    }

    function createConfigEdge(fromId, toId, kind, options) {
        return CANVAS_CONFIG_CONNECTION_CONTROLLER.createConfigEdge(fromId, toId, kind, options);
    }

    function syncResolutionConfigForPresetInputs(presetNode) {
        return CANVAS_CONFIG_CONNECTION_CONTROLLER.syncResolutionConfigForPresetInputs(presetNode);
    }

    function createTextEdge(fromId, toId, slot, options) {
        return CANVAS_TEXT_CONNECTION_CONTROLLER.createTextEdge(fromId, toId, slot, options);
    }

    function createWd14ImageEdge(fromId, toId, options) {
        return CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createWd14ImageEdge(fromId, toId, options);
    }

    function createVlmImageEdge(fromId, toId, slot, options) {
        return CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createVlmImageEdge(fromId, toId, slot, options);
    }

    function createMaskImageEdge(fromId, toId, options) {
        return CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createMaskImageEdge(fromId, toId, options);
    }

    function createSam3VideoMaskEdge(fromId, toId, options) {
        return CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createSam3VideoMaskEdge(fromId, toId, options);
    }

    function createPoseStudioReferenceEdge(fromId, toId, options) {
        return CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER.createPoseStudioReferenceEdge(fromId, toId, options);
    }

    function createGaussianStudioReferenceEdge(fromId, toId, options) {
        return CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER.createGaussianStudioReferenceEdge(fromId, toId, options);
    }

    function createLivePortraitExpressionImageEdge(fromId, toId, slot, options) {
        return CANVAS_SPECIAL_IMAGE_CONNECTION_CONTROLLER.createLivePortraitExpressionImageEdge(fromId, toId, slot, options);
    }

    function createQwenTtsAudioEdge(fromId, toId, slot, options) {
        return CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createQwenTtsAudioEdge(fromId, toId, slot, options);
    }

    function createDirectorTimelineMediaEdge(fromId, toId, slot, options) {
        return CANVAS_TIMELINE_CONNECTION_CONTROLLER.createDirectorTimelineMediaEdge(fromId, toId, slot, options);
    }

    function createCompareImageEdge(fromId, toId, slot, options) {
        return CANVAS_MEDIA_INPUT_CONNECTION_CONTROLLER.createCompareImageEdge(fromId, toId, slot, options);
    }

    function createTimelineClipEdge(fromId, toId, options) {
        return CANVAS_TIMELINE_CONNECTION_CONTROLLER.createTimelineClipEdge(fromId, toId, options);
    }

    function refreshConfigNodeForPreset(configNode, presetNode, kind) {
        return CANVAS_CONFIG_CONNECTION_CONTROLLER.refreshConfigNodeForPreset(configNode, presetNode, kind);
    }

    function createGenerateEdge(fromId, toId, options) {
        return CANVAS_RESULT_CONNECTION_CONTROLLER.createGenerateEdge(fromId, toId, options);
    }

    function openMainMissingModelListForPreset(node) {
        return openWorkbenchMissingModelModal(node);
    }

    function openWorkbenchMissingModelModal(node) {
        return CANVAS_MISSING_MODEL_DIALOG_CONTROLLER.openWorkbenchMissingModelModal(node);
    }

    function renderWorkbenchMissingModelRow(item, index, canDownload) {
        return CANVAS_MISSING_MODEL_DIALOG_CONTROLLER.renderWorkbenchMissingModelRow(item, index, canDownload);
    }

    function modelStatusRoleLabel(role) {
        return CANVAS_MISSING_MODEL_DIALOG_CONTROLLER.modelStatusRoleLabel(role);
    }

    async function checkPresetModelStatus(node) {
        return CANVAS_PRESET_MODEL_STATUS_CONTROLLER.checkPresetModelStatus(node);
    }

    function shouldAutoCheckPresetModels(node) {
        return CANVAS_PRESET_MODEL_STATUS_CONTROLLER.shouldAutoCheckPresetModels(node);
    }

    async function queuePresetModelDownloads(node, options) {
        return CANVAS_PRESET_MODEL_STATUS_CONTROLLER.queuePresetModelDownloads(node, options);
    }

    async function handlePresetModelAction(node) {
        return CANVAS_PRESET_MODEL_STATUS_CONTROLLER.handlePresetModelAction(node);
    }

    function openVlmMissingModelModal(node) {
        return CANVAS_MISSING_MODEL_DIALOG_CONTROLLER.openVlmMissingModelModal(node);
    }

    async function downloadCanvasAgentModel(version) {
        return CANVAS_VLM_MODEL_DOWNLOAD_CONTROLLER.downloadCanvasAgentModel(version);
    }

    async function runMaskNode(node) {
        return CANVAS_MASK_RUNTIME_CONTROLLER.runMaskNode(node);
    }

    function openSam3PointEditor(node) {
        return sam3OpenPointEditor(node, SAM3_VIDEO_MASK_NODE_CONTEXT);
    }

    async function runSam3VideoMaskNode(node, options) {
        return sam3RunNode(node, options || {}, SAM3_VIDEO_MASK_NODE_CONTEXT);
    }

    async function stopSam3VideoMaskNode(node) {
        return sam3StopNode(node, SAM3_VIDEO_MASK_NODE_CONTEXT);
    }

    async function uploadSam3MaskForNode(node) {
        return sam3UploadMaskForNode(node, SAM3_VIDEO_MASK_NODE_CONTEXT);
    }

    function unloadSam3MaskForNode(node) {
        return sam3UnloadMaskForNode(node, SAM3_VIDEO_MASK_NODE_CONTEXT);
    }

    async function runCameraMotionNode(node) {
        return cameraMotionRunNode(node, CAMERA_MOTION_NODE_CONTEXT);
    }

    function clearCameraMotionNode(node) {
        return cameraMotionClearNode(node, CAMERA_MOTION_NODE_CONTEXT);
    }

    async function ensureWorkbenchLazyRuntime(groupName, isReady, loadingMessage, failureMessage) {
        return CANVAS_LAZY_ASSET_RUNTIME_CONTROLLER.ensureWorkbenchLazyRuntime?.(
            groupName,
            isReady,
            loadingMessage,
            failureMessage
        ) ?? false;
    }

    async function openPoseStudioEditor(node) {
        return CANVAS_SPECIAL_NODE_EDITOR_CONTROLLER.openPoseStudioEditor?.(node) ?? null;
    }

    async function openGaussianStudioEditor(node) {
        return CANVAS_SPECIAL_NODE_EDITOR_CONTROLLER.openGaussianStudioEditor?.(node) ?? null;
    }

    async function openLivePortraitExpressionEditor(node) {
        return CANVAS_SPECIAL_NODE_EDITOR_CONTROLLER.openLivePortraitExpressionEditor?.(node) ?? null;
    }

    async function openLivePortraitVideoExpressionPresetEditor(node) {
        return CANVAS_LIVEPORTRAIT_VIDEO_EXPRESSION_EDITOR_CONTROLLER.openLivePortraitVideoExpressionPresetEditor(node);
    }

    async function openLtx23GuidePresetEditor(node) {
        return CANVAS_LTX23_GUIDE_EDITOR_CONTROLLER.openLtx23GuidePresetEditor(node);
    }

    async function openMiniMaxH3StoryboardPresetEditor(node) {
        return CANVAS_MINIMAX_H3_STORYBOARD_PRESET_EDITOR_CONTROLLER.openMiniMaxH3StoryboardPresetEditor(node);
    }

    async function runWd14Node(node) {
        return CANVAS_WD14_RUNTIME_CONTROLLER.runWd14Node(node);
    }

    const DIRECTOR_PREVIOUS_SEGMENT_VIDEO_REF = directorPreviousSegmentVideoRef || 'previous_segment';
    const DIRECTOR_PREVIOUS_SEGMENT_IMAGE_REF = directorPreviousSegmentImageRef || 'previous_segment_last_frame';

    function createDirectorSegmentResultNode(presetNode, plan, segment, index, runId, runToken) {
        return CANVAS_DIRECTOR_SEGMENT_TIMELINE_CONTROLLER.createDirectorSegmentResultNode?.(presetNode, plan, segment, index, runId, runToken) || null;
    }

    function prepareDirectorSegmentTimeline(presetNode, plan, segmentResults) {
        return CANVAS_DIRECTOR_SEGMENT_TIMELINE_CONTROLLER.prepareDirectorSegmentTimeline?.(presetNode, plan, segmentResults) || null;
    }
    async function preflightDirectorSegmentPrompts(node, plan, options) {
        return CANVAS_DIRECTOR_SEGMENT_PROMPT_PREFLIGHT_CONTROLLER.preflightDirectorSegmentPrompts(node, plan, options);
    }

    async function runDirectorSegmentedPresetNode(node, plan, opts) {
        return CANVAS_PRESET_RUN_RUNTIME_CONTROLLER.runDirectorSegmentedPresetNode(node, plan, opts);
    }

    function ensureGenerateEdge(fromId, toId) {
        return CANVAS_RESULT_CONNECTION_CONTROLLER.ensureGenerateEdge(fromId, toId);
    }

    function resultNodeHasOutput(node) {
        return !!CANVAS_RESULT_ASSET_CONTROLLER.resultNodeHasOutput?.(node);
    }

    function cloneRunValue(value, fallback) {
        return WORKBENCH_RUN_VALUE_SERIALIZER.cloneRunValue(value, fallback);
    }

    function normalizeRunEdgesForFingerprint(edges) {
        return CANVAS_PRESET_RUN_FINGERPRINT_CONTROLLER.normalizeRunEdgesForFingerprint?.(edges) || [];
    }

    function serializeAssetSourceForFingerprint(node) {
        return CANVAS_PRESET_RUN_FINGERPRINT_CONTROLLER.serializeAssetSourceForFingerprint?.(node) || null;
    }

    function serializeAssetSourceForRun(node) {
        return assetNodeSerializeAssetSourceForRun(node, {
            getSelectedResultAsset,
            cloneValue: cloneRunValue
        });
    }

    function createImageNodeFromAsset(asset, world, title, options) {
        return CANVAS_MEDIA_IMPORT_CONTROLLER.createImageNodeFromAsset(asset, world, title, options);
    }

    function createMediaNodeFromAsset(asset, world, title, options) {
        return CANVAS_MEDIA_IMPORT_CONTROLLER.createMediaNodeFromAsset(asset, world, title, options);
    }

    function getNodeLayerForgeAsset(node) {
        return MEDIA_EDIT_CONTROLLER.getNodeLayerForgeAsset?.(node) || null;
    }

    async function createImageNodeFromLayerForgeOutput(sourceNode, imageDataUrl, maskDataUrl, metadata) {
        return MEDIA_EDIT_CONTROLLER.createImageNodeFromLayerForgeOutput(sourceNode, imageDataUrl, maskDataUrl, metadata);
    }

    async function createImageNodeFromSketchOutput(sourceNode, payload) {
        return MEDIA_EDIT_CONTROLLER.createImageNodeFromSketchOutput(sourceNode, payload);
    }

    async function openSketchForNode(node) {
        return MEDIA_EDIT_CONTROLLER.openSketchForNode(node);
    }

    async function openLayerForgeForNode(node) {
        return MEDIA_EDIT_CONTROLLER.openLayerForgeForNode(node);
    }

    function convertResultToMediaNode(node) {
        return CANVAS_RESULT_MEDIA_CONVERSION_CONTROLLER.convertResultToMediaNode?.(node) || null;
    }

    function createMediaNodeFromResultAsset(node, index) {
        return CANVAS_RESULT_MEDIA_CONVERSION_CONTROLLER.createMediaNodeFromResultAsset?.(node, index) || null;
    }

    function expandResultAssetsToMediaNodes(node) {
        return CANVAS_RESULT_MEDIA_CONVERSION_CONTROLLER.expandResultAssetsToMediaNodes?.(node) || 0;
    }

    async function controlResultRun(node, action) {
        return CANVAS_RESULT_RUN_ACTION_CONTROLLER.controlResultRun?.(node, action);
    }

    function interruptResultRunForDeletion(node) {
        return !!CANVAS_RESULT_RUN_ACTION_CONTROLLER.interruptResultRunForDeletion?.(node);
    }

    function interruptDeletedResultRuns(nodes) {
        return Number(CANVAS_RESULT_RUN_ACTION_CONTROLLER.interruptDeletedResultRuns?.(nodes) || 0);
    }

    function retryResultRun(node) {
        return CANVAS_RESULT_RUN_ACTION_CONTROLLER.retryResultRun?.(node);
    }

    const NODE_ACTION_SOURCE = {
        actionSource: {
            handleResultInspectorAction,
            handleTimelineAction,
            deleteEdge,
            deleteSelectedGroup,
            focusGroup,
            getGroup,
            duplicateSelection,
            getSelectedNodeIdList,
            toggleSelectedNodesFlag,
            createCompareNodeFromSources,
            isImageCompareSource,
            createTimelineNodeFromSources,
            isTimelineSource,
            alignSelectedNodes,
            distributeSelectedNodes,
            swapCompareInputs,
            copyNodeGenerationMetadataPrompt,
            applyNodeGenerationMetadataToPromptTarget,
            detectionSlotForRegion,
            toggleNoteTail,
            resetNoteTail,
            addTextMergeInput,
            removeTextMergeInput,
            deleteSelection,
            runPresetNodeFromUi,
            handleBatchAnyInspectorAction: (...args) => CANVAS_BATCH_ANY_INSPECTOR_CONTROLLER.handleBatchAnyInspectorAction(...args),
            openXyzPlotPanel,
            ensureStyleSelectorForPreset,
            openLivePortraitVideoExpressionPresetEditor,
            openLtx23GuidePresetEditor,
            openVisualPromptEditor: (...args) => CANVAS_MINIMAX_H3_STORYBOARD_PRESET_EDITOR_CONTROLLER.openVisualPromptEditor(...args),
            openMiniMaxH3StoryboardPresetEditor,
            runStyleSelectorTargetPreset,
            handlePresetModelAction,
            handleVlmModelAction,
            runWd14Node,
            runTranslationNode,
            openTagCartForNode,
            refreshWildcardsCatalog,
            openWildcardsV2Panel,
            openWildcardsManager,
            openWildcardsInsertMenu,
            runVlmNode,
            stopVlmChatNode,
            isQwenTtsNode,
            runQwenTtsNode,
            stopQwenTtsNode,
            handleDirectorTimelineAction: (...args) => CANVAS_TIMELINE_CONTEXT.handleDirectorTimelineAction?.(...args),
            clearVlmChat,
            attachVlmImages,
            saveVlmCustomSecret,
            loadVlmCustomSecret,
            deleteVlmCustomSecret,
            fetchVlmCustomModels,
            toggleVlmCustomApi,
            testVlmCustomApi,
            syncVlmCustomFromAgent,
            syncVlmCustomToAgent,
            unloadVlmModel,
            runMaskNode,
            runSam3VideoMaskNode,
            stopSam3VideoMaskNode,
            openSam3PointEditor,
            uploadSam3MaskForNode,
            unloadSam3MaskForNode,
            runCameraMotionNode,
            clearCameraMotionNode,
            openPoseStudioEditor,
            openGaussianStudioEditor,
            openLivePortraitExpressionEditor,
            openSketchForNode,
            openImageViewer,
            openMediaViewer,
            reloadMediaNode,
            openCompareFullscreen,
            addSelectedMediaToTimeline,
            renderTimelineToResult,
            toggleTimelinePreviewPlayback,
            playTimelineFromStart,
            playMediaSelection,
            resetMediaTrim,
            replaceNodeImage,
            isImageNodeFrameless,
            pushHistory,
            buildMediaNodeStatePatch,
            mutate,
            openMaskEditor,
            openLayerForgeForNode,
            ensureConfigNode,
            focusXyzMatrixSource,
            selectXyzMatrixCell
        },
        selectionSource: {
            getSelectedNodeIds: () => selectedNodeIds,
            getSelectedNodeId: () => selectedNodeId,
            getSelectedEdgeId: () => selectedEdgeId,
            getSelectedGroupId: () => selectedGroupId,
            setSelectedNodeId: value => { selectedNodeId = value; },
            setSelectedNodeIds: values => { selectedNodeIds = new Set(values || []); },
            setSelectedEdgeId: value => { selectedEdgeId = value; },
            setSelectedGroupId: value => { selectedGroupId = value; }
        },
        nodeSource: {
            getNode: (...args) => getNode(...args)
        },
        doubleClickSource: {
            getInputPortHandleSelector: () => INPUT_PORT_HANDLE_SELECTOR,
            getConnectionTargetFromHandle: (...args) => getConnectionTargetFromHandle(...args),
            inputTargetEdges: (...args) => inputTargetEdges(...args),
            inputTargetAcceptsMultiple: (...args) => inputTargetAcceptsMultiple(...args),
            getNode: (...args) => getNode(...args),
            focusNode: (...args) => focusNode(...args),
            notifyMissingInputSource: () => showToast(t('Connected source is missing.', '已连接的来源节点不存在。')),
            createDefaultInputSource: (...args) => createDefaultInputSource(...args),
            createAdvancedMaskNodeForClassicInput: (...args) => createAdvancedMaskNodeForClassicInput(...args),
            createNodeForUploadInput: (...args) => createNodeForUploadInput(...args),
            isStyleTransferPresetNode: (...args) => isStyleTransferPresetNode(...args),
            isInteractiveTarget: (...args) => isInteractiveTarget(...args),
            ensureStyleSelectorForPreset: (...args) => ensureStyleSelectorForPreset(...args),
            uploadSourceVideoForSam3Node: (...args) => uploadSourceVideoForSam3Node(...args),
            createImageNodeForImageInput: (...args) => createImageNodeForImageInput(...args),
            openPoseStudioEditor: (...args) => openPoseStudioEditor(...args),
            openGaussianStudioEditor: (...args) => openGaussianStudioEditor(...args),
            openLivePortraitExpressionEditor: (...args) => openLivePortraitExpressionEditor(...args),
            ensureConfigNode: (...args) => ensureConfigNode(...args),
            selectResultAsset: (...args) => CANVAS_RESULT_ASSET_CONTROLLER.selectResultAsset?.(...args) || null,
            createMediaNodeFromResultAsset: (...args) => createMediaNodeFromResultAsset(...args)
        }
    };
    const CANVAS_NODE_ACTION_CONTROLLER = typeof WORKBENCH_CANVAS_NODE_ACTION.createCanvasNodeActionController === 'function'
        ? WORKBENCH_CANVAS_NODE_ACTION.createCanvasNodeActionController(NODE_ACTION_SOURCE)
        : {};

    function handleNodeAction(node, action, actionElement, evt) {
        return CANVAS_NODE_ACTION_CONTROLLER.handleNodeAction?.(node, action, actionElement, evt);
    }

    function handleNodeActionEvent(node, evt) {
        return CANVAS_NODE_ACTION_CONTROLLER.handleNodeActionEvent?.(node, evt);
    }

    function bindInspectorActionEvents(...args) {
        return CANVAS_NODE_ACTION_CONTROLLER.bindInspectorActionEvents?.(...args) || false;
    }

    function bindInspectorNodeActionEvents(...args) {
        return CANVAS_NODE_ACTION_CONTROLLER.bindInspectorNodeActionEvents?.(...args) || false;
    }

    function handleNodeDoubleClick(node, evt) {
        return CANVAS_NODE_ACTION_CONTROLLER.handleNodeDoubleClick?.(node, evt);
    }

    function updateWildcardsHelperParam(...args) {
        return CANVAS_WILDCARDS_V2_CONTROLLER.updateWildcardsHelperParam(...args);
    }

    function updateCompareParam(...args) {
        return CANVAS_COMPARE_STATE_CONTROLLER.updateCompareParam(...args);
    }

    function handleCompareNodeEvent(...args) {
        return CANVAS_COMPARE_STATE_CONTROLLER.handleCompareNodeEvent(...args);
    }

    function bindInspectorCompareEvents(...args) {
        return CANVAS_COMPARE_STATE_CONTROLLER.bindInspectorCompareEvents?.(...args) || false;
    }

    function refreshCompareDom(...args) {
        return CANVAS_COMPARE_STATE_CONTROLLER.refreshCompareDom(...args);
    }

    function swapCompareInputs(...args) {
        return CANVAS_COMPARE_STATE_CONTROLLER.swapCompareInputs(...args);
    }

    function copyTimelineJson(node) {
        return CANVAS_TIMELINE_CONTEXT.copyTimelineJson(node);
    }

    function copyTimelineRenderPayload(node) {
        return CANVAS_TIMELINE_CONTEXT.copyTimelineRenderPayload(node);
    }

    function applyTimelineMaskFeatherToSelectedClip(node) {
        return applyTimelineMaskFeatherController?.(node);
    }

    function getNode(id) {
        return project.nodes.find(node => node.id === id) || null;
    }

    function formatBytes(bytes) {
        return utilsFormatBytes(bytes);
    }

    function connectUploadEdgeApi(fromId, toId, slot, options) {
        return CANVAS_CONNECTION_CONTROLLER.connectUploadEdgeApi(fromId, toId, slot, options);
    }

    const PERFORMANCE_DIAGNOSTICS_CONTEXT_SOURCE = {
        stateSource: {
            getEdgeCanvasActive: () => !!CANVAS_EDGE_RENDERER.getEdgeCanvasActive?.(),
            getEdgeCanvasHitRecords: () => CANVAS_EDGE_RENDERER.getEdgeCanvasHitRecords?.() || [],
            getEdgeCanvasDpr: () => Number(CANVAS_EDGE_RENDERER.getEdgeCanvasDpr?.()) || 1,
            getEdgeRenderCacheKey: () => edgeRenderCacheKey,
            setEdgeRenderCacheKey: (value) => { edgeRenderCacheKey = value; }
        },
        projectSource: {
            getProject: () => project,
            setProject: (value) => { project = value; },
            sanitizeProject: (...args) => sanitizeProject(...args)
        },
        domSource: {
            getRoot: () => root,
            getNodesLayer: () => nodesLayer,
            getEdgesLayer: () => edgesLayer,
            getEdgesCanvas: () => edgesCanvas,
            getMinimapElement: () => minimapEl
        },
        viewportSource: {
            getVisibleWorldRect: (...args) => getVisibleWorldRect(...args)
        },
        timingSource: {
            getPerfStats: () => perfStats
        },
        schedulerSource: {
            getCanvasRenderMode: (...args) => getCanvasRenderMode(...args),
            isInteractiveLinkRenderPending: (...args) => isInteractiveLinkRenderPending(...args),
            resetPerformanceState: (...args) => resetPerformanceState(...args),
            resetCanvasRenderModeForProject: (...args) => resetCanvasRenderModeForProject(...args),
            cancelWheelPreviewLod: (...args) => cancelWheelPreviewLod(...args),
            cancelPanEdgeSettleRender: (...args) => cancelPanEdgeSettleRender(...args),
            cancelDragEdgeSettleRender: (...args) => cancelDragEdgeSettleRender(...args),
            endDragEdgeLodVisual: (...args) => endDragEdgeLodVisual(...args)
        },
        renderSource: {
            getNodeLayoutCacheSize: (...args) => getNodeLayoutCacheSize(...args),
            resetRenderedProjectDomCache: (...args) => resetRenderedProjectDomCache(...args),
            clearEdgeCanvas: (...args) => clearEdgeCanvas(...args),
            renderAll: (...args) => renderAll(...args)
        },
        edgeSource: {
            isSvgFallbackActive: (...args) => isSvgFallbackActive(...args),
            getSvgFallbackLock: (...args) => getSvgFallbackLock(...args),
            cancelEdgeIncidentIndexWarmup: (...args) => cancelEdgeIncidentIndexWarmup(...args),
            setEdgeIncidentIndex: (...args) => setEdgeIncidentIndex(...args)
        },
        minimapSource: {
            resetMinimapCache: (...args) => resetMinimapCache(...args),
            invalidateMinimapStaticCache: (...args) => invalidateMinimapStaticCache(...args)
        },
        selectionSource: {
            resetSelectionState: () => CANVAS_SELECTION_CONTROLLER.resetSelectionState()
        },
        timelineSource: {
            stopTimelinePlayback: (...args) => stopTimelinePlayback(...args)
        },
        persistenceSource: {
            saveProject: (...args) => saveProject(...args)
        },
        gallerySource: {
            resetGalleryFrostReveals: (...args) => CANVAS_GALLERY_FROST_CONTROLLER.resetGalleryFrostReveals(...args)
        },
        diagnosticsSource: {
            warn: (...args) => console.warn(...args)
        }
    };
    CANVAS_PERFORMANCE_DIAGNOSTICS_CONTROLLER = typeof WORKBENCH_CANVAS_PERFORMANCE_DIAGNOSTICS.createCanvasPerformanceDiagnosticsController === 'function'
        ? WORKBENCH_CANVAS_PERFORMANCE_DIAGNOSTICS.createCanvasPerformanceDiagnosticsController({
            performanceDiagnosticsSource: PERFORMANCE_DIAGNOSTICS_CONTEXT_SOURCE
        })
        : {};
    const getCanvasPerfSnapshot = (...args) => CANVAS_PERFORMANCE_DIAGNOSTICS_CONTROLLER?.getCanvasPerfSnapshot?.(...args) || {};
    const resetCanvasPerfStats = (...args) => CANVAS_PERFORMANCE_DIAGNOSTICS_CONTROLLER?.resetCanvasPerfStats?.(...args) || {};
    const loadCanvasPerfProject = (...args) => CANVAS_PERFORMANCE_DIAGNOSTICS_CONTROLLER?.loadCanvasPerfProject?.(...args) || {};

    const WORKSPACE_RECOVERY_CONTEXT_SOURCE = {
        stateSource: {
            getRoot: () => root,
            getProject: () => project
        },
        projectSource: {
            getProjectId: () => PROJECT_ID
        },
        persistenceSource: {
            saveProject: (...args) => saveProject(...args)
        },
        lifecycleSource: {
            openWorkbench: (...args) => openWorkbench(...args)
        }
    };
    CANVAS_WORKSPACE_RECOVERY_CONTROLLER = typeof WORKBENCH_CANVAS_WORKSPACE_RECOVERY.createCanvasWorkspaceRecoveryController === 'function'
        ? WORKBENCH_CANVAS_WORKSPACE_RECOVERY.createCanvasWorkspaceRecoveryController({
            workspaceRecoverySource: WORKSPACE_RECOVERY_CONTEXT_SOURCE
        })
        : {};
    const canvasWorkspaceSnapshot = (...args) => CANVAS_WORKSPACE_RECOVERY_CONTROLLER?.workspaceSnapshot?.(...args) || {};
    const prepareCanvasWorkspaceRecovery = (...args) => CANVAS_WORKSPACE_RECOVERY_CONTROLLER?.prepareWorkspaceRecovery?.(...args)
        || Promise.resolve({});
    const restoreCanvasWorkspaceRecovery = (...args) => !!CANVAS_WORKSPACE_RECOVERY_CONTROLLER?.restoreWorkspaceRecovery?.(...args);

    window.SimpAIInfiniteCanvasWorkbench = {
        version: '0.1.0',
        open: openWorkbench,
        close: closeWorkbench,
        save: () => saveProject(false),
        getProject: () => JSON.parse(JSON.stringify(project)),
        loadProject: (nextProject) => {
            stopTimelinePlayback();
            project = sanitizeProject(nextProject);
            resetCanvasRenderModeForProject(project);
            resetRenderedProjectDomCache();
            CANVAS_SELECTION_CONTROLLER.focusNodePreservingSelection(null);
             resetMinimapCache();
             invalidateMinimapStaticCache();
            cancelWheelPreviewLod();
            cancelPanEdgeSettleRender();
            cancelDragEdgeSettleRender();
            endDragEdgeLodVisual();
            saveProject(true).catch((err) => console.warn('[SimpAI Canvas] api load save failed:', err));
            renderAll();
            CANVAS_GALLERY_FROST_CONTROLLER.resetGalleryFrostReveals();
        },
        addPresetNode: (entry, world) => addPresetNode(entry || {}, world || viewportCenterWorld()),
        addTextMergeNode: (world, options) => addTextMergeNode(world || viewportCenterWorld(), options || {}),
        connectTextEdge: (fromId, toId, slot, options) => createTextEdge(fromId, toId, slot, options || {}),
        getTextOutput: (nodeOrId) => getNodeTextOutput(typeof nodeOrId === 'string' ? getNode(nodeOrId) : nodeOrId),
        getInputPortCreationOptions: (toId, kind, slot) => inputTargetCreationOptions({ toId, kind, slot }).map(item => ({ key: item.key, label: item.label, icon: item.icon })),
        createDefaultInputSource: (toId, kind, slot) => createDefaultInputSource({ toId, kind, slot }),
        addPoseStudioNode: (world, options) => addPoseStudioNode(world || viewportCenterWorld(), options || {}),
        addGaussianStudioNode: (world, options) => addGaussianStudioNode(world || viewportCenterWorld(), options || {}),
        addLivePortraitExpressionNode: (world, options) => addLivePortraitExpressionNode(world || viewportCenterWorld(), options || {}),
        addDirectorTimelineNode: (world, options) => addDirectorTimelineNode(world || viewportCenterWorld(), options || {}),
        connectUploadEdge: (fromId, toId, slot, options) => connectUploadEdgeApi(fromId, toId, slot, options || {}),
        addQwenTtsNode: (mode, world, options) => addQwenTtsNode(mode || 'voice_design', world || viewportCenterWorld(), options || {}),
        runQwenTtsNode: (nodeOrId, options) => {
            const node = typeof nodeOrId === 'string' ? getNode(nodeOrId) : nodeOrId;
            return runQwenTtsNode(node, options || {});
        },
        stopQwenTtsNode: (nodeOrId) => {
            const node = typeof nodeOrId === 'string' ? getNode(nodeOrId) : nodeOrId;
            return stopQwenTtsNode(node);
        },
        importSelectedTransfer: () => importSelectedTransferAt(viewportCenterWorld()),
        debugVlmRender: (enabled = true) => setVlmRenderDebug(enabled),
        debugVlmChatScroll: (nodeId = '') => vlmChatScrollDebug(nodeId),
        dumpVlmRenderKeys: () => vlmRenderDebugSummary(),
        lastVlmRenderDiffs: () => getVlmRenderDebugLastDiffs(),
        workspaceSnapshot: canvasWorkspaceSnapshot,
        prepareWorkspaceRecovery: prepareCanvasWorkspaceRecovery,
        restoreWorkspaceRecovery: restoreCanvasWorkspaceRecovery,
        downloadCanvasAgentModel,
        __runPoseStudioCanvasSmoke: (options) => runPoseStudioCanvasSmoke(options || {}),
        __perfLoadProject: (nextProject, options) => loadCanvasPerfProject(nextProject, options || {}),
        __perfGetStats: () => getCanvasPerfSnapshot(),
        __perfResetStats: () => resetCanvasPerfStats()
    };

    CANVAS_LIFECYCLE_CONTROLLER.bindWorkbenchRuntimeEvents();
})();
