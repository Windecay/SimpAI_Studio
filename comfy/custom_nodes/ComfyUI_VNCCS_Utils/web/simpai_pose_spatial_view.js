// A separate 2D diagram of the same camera used for PNG capture.
import { cameraKeyboardAction, cameraRotationPatch, cameraWheelPatch, spatialCameraDragPatch, spatialPlanePoint } from './simpai_pose_camera_controls.js?v=20261011-1';
export { cameraKeyboardAction, cameraRotationPatch, cameraWheelPatch };

export function readSpatialScene(viewer, personScene = null) {
    if (!viewer?.captureCamera || !viewer.skinnedMesh || !viewer.THREE) return null;
    const { Vector3 } = viewer.THREE;
    const camera = viewer.captureCamera;
    camera.updateMatrixWorld(true);
    viewer.skinnedMesh.updateMatrixWorld(true);
    const cameraPosition = camera.getWorldPosition(new Vector3());
    const direction = camera.getWorldDirection(new Vector3());
    const selected = personScene?.people.length ? personScene.active : 0;
    const names = ['pelvis', 'neck_01', 'head', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r',
        'hand_l', 'hand_r', 'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r'];
    const joints = Object.fromEntries(names.filter(name => viewer.bones[name])
        .map(name => [name, viewer.bones[name].getWorldPosition(new Vector3()).toArray()]));
    const activeCenter = joints.pelvis || viewer.skinnedMesh.getWorldPosition(new Vector3()).toArray();
    const people = personScene?.people.length ? personScene.people.map((person, index) => {
        if (index === selected) return { index, selected: true, center: activeCenter, joints };
        const stored = person.snapshot?.userData?.poseJoints || {};
        return { index, selected: false, center: stored.pelvis || person.position || [0, 0, 0], joints: stored };
    }) : [{ index: 0, selected: true, center: activeCenter, joints }];
    for (const person of people) {
        person.skeleton = [];
        for (const chain of [['pelvis', 'neck_01', 'head'], ['neck_01', 'upperarm_l', 'lowerarm_l', 'hand_l'],
            ['neck_01', 'upperarm_r', 'lowerarm_r', 'hand_r'], ['pelvis', 'thigh_l', 'calf_l', 'foot_l'],
            ['pelvis', 'thigh_r', 'calf_r', 'foot_r']]) {
            for (let i = 1; i < chain.length; i++) {
                const a = person.joints[chain[i - 1]], b = person.joints[chain[i]];
                if (a && b) person.skeleton.push([a, b]);
            }
        }
    }
    const depth = Math.max(1, ...people.map(person => new Vector3().fromArray(person.center).sub(cameraPosition).dot(direction)));
    const distance = depth * 1.18;
    const halfHeight = Math.tan(camera.fov * Math.PI / 360) * distance / camera.zoom;
    const halfWidth = halfHeight * camera.aspect;
    const quaternion = camera.getWorldQuaternion(new viewer.THREE.Quaternion());
    const frustum = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) =>
        new Vector3(x * halfWidth, y * halfHeight, -distance).applyQuaternion(quaternion).add(cameraPosition).toArray());
    return { camera: cameraPosition.toArray(), aim: cameraPosition.clone().addScaledVector(direction, distance).toArray(),
        frustum, people };
}

export class PoseSpatialView {
    constructor(root, viewer, getPeople, translate, controls = {}) {
        this.root = root;
        this.viewer = viewer;
        this.getPeople = getPeople;
        this.t = translate;
        this.controls = controls;
        this.mode = 'top';
        this.layout = null;
        this.drag = null;
        this.canvas = root.querySelector('[data-pose-spatial-canvas]');
        this.onClick = event => {
            if (event.target.closest('[data-pose-spatial-fit]')) {
                this.endDrag(); this.layout = null; this.render(); return;
            }
            const button = event.target.closest('[data-pose-spatial-view]');
            if (!button) return;
            event.stopPropagation();
            this.endDrag();
            this.layout = null;
            this.mode = button.dataset.poseSpatialView;
            root.querySelectorAll('[data-pose-spatial-view]').forEach(item => {
                item.setAttribute('aria-pressed', String(item === button));
            });
            this.render();
        };
        this.onToggle = () => { if (!root.open) this.endDrag(); this.render(); };
        root.addEventListener('click', this.onClick);
        root.addEventListener('toggle', this.onToggle);
        this.handlers = {
            pointerdown: event => {
                if (event.button !== 0 || event.isPrimary === false || !this.layout || !controls.apply || controls.enabled?.() === false) return;
                event.preventDefault(); event.stopPropagation();
                this.canvas.focus({ preventScroll: true });
                this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY,
                    screen: [...this.cameraPoint], layout: this.layout, params: { ...controls.getParams() }, mode: this.mode };
                this.canvas.setPointerCapture(event.pointerId);
                this.canvas.classList.add('is-dragging');
            },
            pointermove: event => {
                if (event.pointerId !== this.drag?.id) return;
                if (controls.enabled?.() === false) { this.endDrag(); return; }
                event.preventDefault(); event.stopPropagation();
                const drag = this.drag, speed = event.shiftKey ? 0.25 : 1;
                drag.screen[0] += (event.clientX - drag.x) * speed;
                drag.screen[1] += (event.clientY - drag.y) * speed;
                drag.x = event.clientX; drag.y = event.clientY;
                const params = { ...drag.params };
                if (drag.mode === 'top') params.cam_yaw_deg = controls.getParams().cam_yaw_deg;
                const patch = spatialCameraDragPatch(viewer, params, drag.mode, drag.layout.unproject(drag.screen));
                if (patch) controls.apply(patch);
            },
            pointerup: event => { if (event.pointerId === this.drag?.id) { event.stopPropagation(); this.endDrag(); this.render(); } },
            pointercancel: () => this.endDrag(),
            lostpointercapture: () => this.endDrag(),
            wheel: event => {
                if (!controls.apply || controls.enabled?.() === false) return;
                const patch = cameraWheelPatch(controls.getParams(), event, true);
                if (!patch) return;
                event.preventDefault(); event.stopPropagation(); controls.apply(patch);
            },
            keydown: event => {
                if (cameraKeyboardAction(controls.getParams?.() || {}, event)) this.endDrag();
                controls.keydown?.(event);
            }
        };
        for (const [type, handler] of Object.entries(this.handlers)) this.canvas.addEventListener(type, handler, { passive: false });
        this.observer = new ResizeObserver(() => this.render());
        this.observer.observe(this.canvas);
        this.render();
    }

    render() {
        if (!this.root.open) return;
        const data = readSpatialScene(this.viewer, this.getPeople());
        const width = this.canvas.clientWidth;
        if (!data || width < 1) return;
        const height = Math.round(width * 0.75);
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.round(width * ratio);
        this.canvas.height = Math.round(height * ratio);
        const ctx = this.canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        const yaw = Number(this.controls.getParams?.().cam_yaw_deg) || 0;
        const plane = point => spatialPlanePoint(point, this.mode, yaw);
        const frame = this.viewer._samProjectionCameraFrame || this.viewer.skinnedMesh;
        if (frame !== this.frame || this.layout?.width !== width || (this.mode === 'side' && this.layout?.yaw !== yaw)) {
            this.endDrag(); this.layout = null; this.frame = frame;
        }
        const all = [data.camera, data.aim, ...data.frustum,
            ...data.people.flatMap(person => [person.center, ...person.skeleton.flat()])].map(plane);
        const minX = Math.min(...all.map(p => p[0]));
        const maxX = Math.max(...all.map(p => p[0]));
        const minY = Math.min(...all.map(p => p[1]));
        const maxY = Math.max(...all.map(p => p[1]));
        const scale = Math.min((width - 48) / Math.max(maxX - minX, 1), (height - 42) / Math.max(maxY - minY, 1));
        const cameraPoint = this.layout?.project(data.camera);
        if (!this.drag && cameraPoint && (cameraPoint[0] < 8 || cameraPoint[0] > width - 8 || cameraPoint[1] < 8 || cameraPoint[1] > height - 8)) this.layout = null;
        if (!this.layout) {
            const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
            this.layout = { width, yaw,
                project: point => {
                    const [x, y] = plane(point);
                    return [width / 2 + (x - centerX) * scale, height / 2 + (y - centerY) * scale];
                },
                unproject: point => [(point[0] - width / 2) / scale + centerX, (point[1] - height / 2) / scale + centerY]
            };
        }
        const project = this.layout.project;
        this.cameraPoint = project(data.camera);
        const line = (a, b) => { ctx.beginPath(); ctx.moveTo(...project(a)); ctx.lineTo(...project(b)); ctx.stroke(); };
        ctx.fillStyle = '#262626';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#ffffff0a';
        ctx.lineWidth = 1;
        for (let x = 12; x < width; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
        for (let y = 12; y < height; y += 24) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
        const cam = project(data.camera);
        ctx.fillStyle = '#9b9b9b0e';
        ctx.strokeStyle = '#60b9ff50';
        for (let i = 0; i < 4; i++) {
            const a = data.frustum[i], b = data.frustum[(i + 1) % 4];
            ctx.beginPath(); ctx.moveTo(...cam); ctx.lineTo(...project(a)); ctx.lineTo(...project(b)); ctx.closePath(); ctx.fill();
            line(data.camera, a); line(a, b);
        }
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#8cccff'; line(data.camera, data.aim); ctx.setLineDash([]);
        ctx.lineWidth = 2;
        data.people.forEach(person => {
            ctx.strokeStyle = person.selected ? '#ffac64' : '#abbace';
            person.skeleton.forEach(([a, b]) => line(a, b));
        });
        ctx.font = '11px system-ui, sans-serif';
        ctx.textBaseline = 'middle';
        const labels = [];
        for (const person of data.people) {
            const [x, y] = project(person.center);
            const color = person.selected ? '#fb923c' : '#c0ccdb';
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(x, y, person.selected ? 5 : 4, 0, Math.PI * 2); ctx.fill();
            const label = String(person.index + 1);
            const labelWidth = ctx.measureText(label).width + 8;
            let labelPoint;
            for (const [dx, dy] of [[9, -12], [-labelWidth - 9, -12], [9, 12], [-labelWidth - 9, 12], [9, -28], [9, 28]]) {
                labelPoint = [Math.max(4, Math.min(x + dx, width - labelWidth - 4)), Math.max(10, Math.min(y + dy, height - 10))];
                if (!labels.some(([lx, ly, lw]) => Math.abs(ly - labelPoint[1]) < 16 && labelPoint[0] < lx + lw + 4 && labelPoint[0] + labelWidth + 4 > lx)) break;
            }
            labels.push([...labelPoint, labelWidth]);
            ctx.fillStyle = '#262626e8'; ctx.fillRect(labelPoint[0], labelPoint[1] - 7, labelWidth, 14);
            ctx.fillStyle = color; ctx.fillText(label, labelPoint[0] + 4, labelPoint[1]);
        }
        const aim = project(data.aim);
        const angle = Math.atan2(aim[1] - cam[1], aim[0] - cam[0]);
        ctx.save(); ctx.translate(...cam); ctx.rotate(angle);
        ctx.fillStyle = '#60b9ff'; ctx.fillRect(-6, -4, 9, 8);
        ctx.beginPath(); ctx.moveTo(3, -4); ctx.lineTo(8, -7); ctx.lineTo(8, 7); ctx.lineTo(3, 4); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#8cccff';
        ctx.fillText(this.t('Camera', '相机'), Math.max(4, Math.min(cam[0] + 12, width - 46)), Math.max(12, Math.min(cam[1] + 12, height - 10)));
    }

    dispose() {
        this.endDrag();
        this.observer.disconnect();
        this.root.removeEventListener('click', this.onClick);
        this.root.removeEventListener('toggle', this.onToggle);
        for (const [type, handler] of Object.entries(this.handlers)) this.canvas.removeEventListener(type, handler);
    }

    endDrag() {
        const drag = this.drag;
        this.drag = null;
        this.canvas.classList.remove('is-dragging');
        if (drag && this.canvas.hasPointerCapture(drag.id)) this.canvas.releasePointerCapture(drag.id);
    }
}
