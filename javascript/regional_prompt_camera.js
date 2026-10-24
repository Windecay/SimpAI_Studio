(function (root) {
    'use strict';
    const copy = value => JSON.parse(JSON.stringify(value));
    const rad = degrees => degrees * Math.PI / 180;
    const limits = { orbit: [-180, 180, 1, 'Camera orbit'], pitch: [-80, 80, 1, 'Camera pitch'],
        roll: [-45, 45, 1, 'Camera roll'], distance: [0.25, 4, 0.05, 'Camera distance'],
        fov: [20, 100, 1, 'Field of view'], panX: [-2, 2, 0.05, 'Camera horizontal position'],
        panY: [-2, 2, 0.05, 'Camera vertical position'] };
    const defaults = { orbit: 0, pitch: 0, roll: 0, distance: 1, fov: 50, panX: 0, panY: 0 };
    const presets = [
        { id: 'front', label: 'Eye-level front view', values: {} },
        { id: 'high', label: 'High-angle view', values: { pitch: 30 } },
        { id: 'low', label: 'Low-angle view', values: { pitch: -20 } },
        { id: 'left', label: 'Left three-quarter view', values: { orbit: -45 } },
        { id: 'right', label: 'Right three-quarter view', values: { orbit: 45 } },
        { id: 'left-side', label: 'Left profile view', values: { orbit: -90 } },
        { id: 'right-side', label: 'Right profile view', values: { orbit: 90 } },
        { id: 'rear', label: 'Rear view', values: { orbit: 180 } },
        { id: 'overhead', label: 'Overhead view', values: { pitch: 80 } },
    ];
    const number = (value, fallback, low, high) => typeof value === 'number' && Number.isFinite(value)
        ? Math.max(low, Math.min(high, value)) : fallback;
    function pose(value) {
        return Object.fromEntries(Object.entries(limits).map(([key, range]) =>
            [key, number(value?.[key], defaults[key], range[0], range[1])]));
    }
    function normalize(value) {
        return { enabled: value?.enabled === true, project: value?.project === true,
            pose: pose(value?.pose), base: pose(value?.base) };
    }
    function body(value, item = {}) {
        return { anchor: ['world', 'screen'].includes(value?.anchor) ? value.anchor : item.label === 'text' ? 'screen' : 'world',
            depth: number(value?.depth, 1, 0.25, 6), thickness: number(value?.thickness, 0.25, 0, 2),
            yaw: number(value?.yaw, 0, -180, 180) };
    }
    function changed(value) {
        const state = normalize(value);
        return state.enabled && state.project && Object.keys(defaults).some(key => Math.abs(state.pose[key] - state.base[key]) > 1e-8);
    }
    function phrase(value, t = text => text) {
        const state = normalize(value);
        if (!state.enabled) return '';
        const c = state.pose, orbit = Math.abs(c.orbit), parts = [];
        parts.push(t(c.pitch >= 65 ? 'Overhead view, looking down at the scene.' : c.pitch >= 10
            ? 'High-angle view, looking down at the subjects.' : c.pitch <= -10
                ? 'Low-angle view, looking up at the subjects.' : 'Eye-level view.'));
        parts.push(t(orbit >= 150 ? 'The subjects are seen from behind.' : orbit >= 70
            ? c.orbit < 0 ? 'The subjects are seen in profile from their left.' : 'The subjects are seen in profile from their right.'
            : orbit >= 15 ? c.orbit < 0 ? 'The subjects are seen from the front-left at a three-quarter angle.'
                : 'The subjects are seen from the front-right at a three-quarter angle.' : 'The subjects are seen from the front.'));
        if (Math.abs(c.roll) >= 3) parts.push(t(c.roll > 0 ? 'The camera is tilted clockwise.' : 'The camera is tilted counterclockwise.'));
        parts.push(t(c.fov >= 70 ? 'A wide-angle lens emphasizes perspective and spatial depth.'
            : c.fov <= 35 ? 'A telephoto lens gives compressed spatial depth.' : 'A standard lens gives natural perspective.'));
        if (c.distance < 0.8) parts.push(t('The camera is close to the subjects.'));
        else if (c.distance > 1.4) parts.push(t('The camera is farther from the subjects, showing more surroundings.'));
        return parts.join(' ');
    }
    let math = null, pending = null;
    const scriptUrl = root.document?.currentScript?.src;
    function configure(value) { math = value; }
    async function load() {
        if (math) return math;
        if (!pending) {
            const url = root.SimpAIRegionalCameraThreeUrl || (scriptUrl
                ? new URL('vendor/regional-camera-three-r160.js', scriptUrl).href : null);
            if (!url) throw new Error('Camera projection is unavailable. Reload Studio.');
            pending = import(url).then(value => { math = value; return value; }).catch(error => { pending = null; throw error; });
        }
        return pending;
    }
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    function project(draft, ui, value) {
        const state = normalize(value), active = changed(state);
        const identity = draft.items.map((item, index) => ({ index, bbox: [...item.bbox], raw: [...item.bbox],
            visible: !ui[index]?.outside, lines: [], depth: body(ui[index]?.body, item).depth }));
        if (!active) return { regions: identity, order: identity.map(item => item.index) };
        if (!math) throw new Error('Camera projection is still loading');
        const { PerspectiveCamera, Vector3 } = math;
        const W = draft.width, H = draft.height;
        const focus = 0.5 / Math.tan(rad(state.base.fov) / 2);
        const camera = settings => {
            const result = new PerspectiveCamera(settings.fov, W / H, 0.005, 200);
            const distance = focus * settings.distance, pitch = rad(settings.pitch), orbit = rad(settings.orbit);
            result.position.set(distance * Math.sin(orbit) * Math.cos(pitch), distance * Math.sin(pitch),
                distance * Math.cos(orbit) * Math.cos(pitch));
            result.lookAt(0, 0, 0);
            result.rotateZ(-rad(settings.roll));
            result.translateX(settings.panX * focus); result.translateY(settings.panY * focus);
            result.updateMatrixWorld(true);
            return result;
        };
        const base = camera(state.base), current = camera(state.pose);
        const screen = (point, cam) => {
            const p = point.clone().project(cam);
            return [(p.x + 1) * W / 2, (1 - p.y) * H / 2];
        };
        const bounds = points => [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
            Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
        const regions = draft.items.map((item, index) => {
            const b = body(ui[index]?.body, item);
            if (b.anchor === 'screen' || ui[index]?.outside) return identity[index];
            const [left, top, right, bottom] = item.bbox;
            const depth = focus * state.base.distance * b.depth;
            const k = 2 * depth * Math.tan(rad(state.base.fov) / 2) / H;
            const width = (right - left) * k, height = (bottom - top) * k, thickness = width * b.thickness;
            const extentZ = (Math.abs(Math.sin(rad(b.yaw))) * width + Math.abs(Math.cos(rad(b.yaw))) * thickness) / 2;
            const center = new Vector3(((left + right) / 2 - W / 2) * k,
                (H / 2 - (top + bottom) / 2) * k, -depth - extentZ);
            const vertices = [-1, 1].flatMap(z => [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) =>
                new Vector3(x * width / 2, y * height / 2, -z * thickness / 2)
                    .applyAxisAngle(new Vector3(0, 1, 0), rad(b.yaw)).add(center).applyMatrix4(base.matrixWorld)));
            // Calibrate the reference pose to the user's original rectangle, independent of volume settings.
            const footprint = bounds(vertices.map(v => screen(v, base)));
            const calibrate = ([x, y]) => [left + (x - footprint[0]) * (right - left) / Math.max(1e-12, footprint[2] - footprint[0]),
                top + (y - footprint[1]) * (bottom - top) / Math.max(1e-12, footprint[3] - footprint[1])];
            const local = vertices.map(v => v.clone().applyMatrix4(current.matrixWorldInverse));
            const lines = [], points = [];
            for (const [a, c] of edges) {
                let p = local[a].clone(), q = local[c].clone();
                const near = -current.near;
                if (p.z > near && q.z > near) continue;
                if (p.z > near) p.lerp(q, (near - p.z) / (q.z - p.z));
                else if (q.z > near) q.lerp(p, (near - q.z) / (p.z - q.z));
                const line = [p, q].map(v => calibrate(screen(v.applyMatrix4(current.matrixWorld), current)));
                if (line.flat().every(Number.isFinite)) { lines.push(line); points.push(...line); }
            }
            if (!points.length) return { ...identity[index], visible: false };
            const raw = bounds(points), bbox = [Math.max(0, raw[0]), Math.max(0, raw[1]), Math.min(W, raw[2]), Math.min(H, raw[3])];
            const visible = bbox[2] - bbox[0] > 1e-8 && bbox[3] - bbox[1] > 1e-8;
            return { index, raw, bbox: visible ? bbox : [...item.bbox], visible, lines,
                depth: -center.clone().applyMatrix4(base.matrixWorld).applyMatrix4(current.matrixWorldInverse).z };
        });
        // Stable source indices keep image bindings independent from output depth order.
        const world = regions.filter(r => body(ui[r.index]?.body, draft.items[r.index]).anchor === 'world');
        const fixed = regions.filter(r => body(ui[r.index]?.body, draft.items[r.index]).anchor === 'screen');
        const order = world.sort((a, b) => b.depth - a.depth || a.index - b.index).concat(fixed).map(r => r.index);
        return { regions, order };
    }
    function output(draft, ui, value, t, projection) {
        const state = normalize(value);
        const result = copy(draft);
        if (!state.enabled) { result.items = result.items.filter((_, index) => !ui[index]?.outside); return result; }
        const frame = projection || project(draft, ui, state);
        result.items = frame.order.filter(index => frame.regions[index].visible).map(index => ({
            ...copy(draft.items[index]), bbox: [...frame.regions[index].bbox],
        }));
        const text = phrase(state, t), original = result.summary.caption.trim();
        result.summary.caption = original ? original.endsWith(text) ? original : original + '\n' + text : text;
        return result;
    }
    root.SimpAIRegionalCamera = { limits, defaults, presets, normalize, body, changed, phrase, project, output, configure, load,
        ready: () => !!math };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.SimpAIRegionalCamera;
})(typeof window !== 'undefined' ? window : globalThis);
