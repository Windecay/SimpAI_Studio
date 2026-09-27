(function () {
    'use strict';

    function createCanvasMissingModelDialogController(context) {
        const scope = context?.missingModelDialogSource || context || {};
        const domSource = scope.domSource || {};
        const utilitySource = scope.utilitySource || {};
        const languageSource = scope.languageSource || {};
        const modelSource = scope.modelSource || {};
        const call = (source, name, fallback, ...args) => typeof source[name] === 'function'
            ? source[name](...args) : fallback;
        const escapeHtml = value => call(utilitySource, 'escapeHtml', String(value ?? ''), value);
        const t = (en, cn) => {
            const state = call(languageSource, 'getLanguageState', {}) || {};
            return call(languageSource, 't', state.__lang === 'cn' || state.__lang === 'zh' ? cn : en, en, cn, state);
        };

        function modelStatusRoleLabel(role) {
            const key = String(role || '').trim();
            if (key === 'Base Model') return t('Base Model', '基础模型');
            if (key === 'Refiner') return t('Refiner', '细化模型');
            if (key === 'Upscale Model') return t('Upscale Model', '放大模型');
            if (key === 'LoRA') return 'LoRA';
            if (key === 'CLIP' || key === 'VAE') return key;
            return key;
        }

        function renderWorkbenchMissingModelRow(item, index, canDownload) {
            const status = item.download_status || {};
            const statusText = status.state || status.status || '';
            const path = [item.cata, item.path_file].filter(Boolean).join(' / ');
            const roleLabel = modelStatusRoleLabel(item.role || '');
            return [
                '<div class="sai-workbench-missing-model-row"><div><b>',
                escapeHtml(item.path_file || 'model'), '</b><code>', escapeHtml(path), '</code><small>',
                escapeHtml([roleLabel, item.human_size, statusText].filter(Boolean).join(' · ')),
                '</small></div><button type="button" data-download-one="', index, '" ',
                canDownload ? '' : 'disabled', ' title="', escapeHtml(t('Download this model', '下载这个模型')),
                '"><i class="fa-solid fa-download"></i><span>', escapeHtml(t('Download', '下载')),
                '</span></button></div>'
            ].join('');
        }

        function openMissingModelDialog(config) {
            const { node, status, title, header, emptyLabel, message, fieldPrefix, useRootHost, queueOne, queueAll } = config;
            const rows = Array.isArray(status.missing_models) ? status.missing_models : [];
            const canDownload = status.can_download !== false;
            const doc = call(domSource, 'getDocument', null);
            const existing = doc.querySelector('.sai-workbench-missing-model-modal');
            if (existing) existing.remove();
            const modal = doc.createElement('div');
            modal.className = 'sai-canvas-modal sai-workbench-missing-model-modal';
            modal.classList.toggle('theme-dark', call(domSource, 'detectWorkbenchTheme', 'light') === 'dark');
            const rowHtml = rows.length
                ? rows.map((item, index) => renderWorkbenchMissingModelRow(item, index, canDownload)).join('')
                : '<p>' + escapeHtml(emptyLabel) + '</p>';
            modal.innerHTML = [
                '<div class="sai-canvas-modal-panel sai-workbench-missing-model-panel">',
                '<div class="sai-canvas-modal-head"><span>', escapeHtml(header), ' - ', escapeHtml(title),
                '</span><button type="button" data-modal-close title="', escapeHtml(t('Close', '关闭')),
                '"><i class="fa-solid fa-xmark"></i></button></div>',
                '<div class="sai-workbench-missing-model-body"><div class="sai-inspector-note">',
                escapeHtml(message), '</div><div class="sai-workbench-missing-model-list">', rowHtml,
                '</div></div><div class="sai-canvas-modal-foot"><button type="button" data-modal-close>',
                escapeHtml(t('Close', '关闭')), '</button><button type="button" data-download-all ',
                canDownload && rows.length ? '' : 'disabled', '><i class="fa-solid fa-cloud-arrow-down"></i><span>',
                escapeHtml(t('Download All', '全部下载')), '</span></button></div></div>'
            ].join('');
            call(domSource, 'ensureWorkbenchFormFieldNames', undefined, modal, fieldPrefix);
            const host = useRootHost ? (call(domSource, 'getRoot', null) || doc.body) : doc.body;
            host.appendChild(modal);
            modal.addEventListener('click', async (evt) => {
                if (evt.target === modal || evt.target.closest('[data-modal-close]')) {
                    modal.remove();
                    return;
                }
                const one = evt.target.closest('[data-download-one]');
                if (one) {
                    const item = rows[Number(one.getAttribute('data-download-one')) || 0];
                    if (item) await queueOne(node, item);
                    return;
                }
                if (evt.target.closest('[data-download-all]')) await queueAll(node);
            });
            return modal;
        }

        function openWorkbenchMissingModelModal(node) {
            const status = node?.model_status || {};
            const rows = Array.isArray(status.missing_models) ? status.missing_models : [];
            const title = status.checked_preset || node?.preset?.name || node?.title || 'Preset';
            openMissingModelDialog({
                node,
                status,
                title,
                header: t('Missing Models', '缺失模型'),
                emptyLabel: t('No missing model rows were returned.', '没有返回缺失模型条目。'),
                message: status.message || t('{count} required model file(s) are missing.', '缺少 {count} 个所需模型文件。').replace('{count}', rows.length),
                fieldPrefix: 'workbench_missing_models',
                useRootHost: true,
                queueOne: (target, item) => call(modelSource, 'queuePresetModelDownloads', undefined, target, { missingModel: item }),
                queueAll: target => call(modelSource, 'queuePresetModelDownloads', undefined, target)
            });
            return true;
        }

        function openVlmMissingModelModal(node) {
            const status = node?.vlm_model_status || {};
            const rows = Array.isArray(status.missing_models) ? status.missing_models : [];
            const title = status.version || node?.params?.version || 'VLM';
            openMissingModelDialog({
                node,
                status,
                title,
                header: t('VLM Missing Models', 'VLM 缺失模型'),
                emptyLabel: t('No missing model rows were returned.', '没有返回缺失模型条目。'),
                message: status.message || t('{count} VLM model file(s) are missing.', '缺少 {count} 个 VLM 模型文件。').replace('{count}', rows.length),
                fieldPrefix: 'workbench_vlm_missing_models',
                useRootHost: false,
                queueOne: (target, item) => call(modelSource, 'queueVlmModelDownloads', undefined, target, { missingModel: item }),
                queueAll: target => call(modelSource, 'queueVlmModelDownloads', undefined, target)
            });
        }

        return { openWorkbenchMissingModelModal, openVlmMissingModelModal, renderWorkbenchMissingModelRow, modelStatusRoleLabel };
    }

    window.SimpAICanvasWorkbenchMissingModelDialog = Object.assign(
        {}, window.SimpAICanvasWorkbenchMissingModelDialog || {}, { createCanvasMissingModelDialogController }
    );
})();
