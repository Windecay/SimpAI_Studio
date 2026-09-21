(function () {
    'use strict';

    function createCanvasAssetMediaController() {
        function assetMediaKind(asset) {
            const mime = String(asset?.mime || '').toLowerCase();
            if (mime.startsWith('video/')) return 'video';
            if (mime.startsWith('audio/')) return 'audio';
            return 'image';
        }

        function assetMediaIcon(asset) {
            const kind = assetMediaKind(asset);
            if (kind === 'video') return 'fa-film';
            if (kind === 'audio') return 'fa-wave-square';
            return 'fa-image';
        }

        return {
            assetMediaKind,
            assetMediaIcon
        };
    }

    window.SimpAICanvasWorkbenchAssetMedia = Object.assign(
        {},
        window.SimpAICanvasWorkbenchAssetMedia || {},
        { createCanvasAssetMediaController }
    );
})();
