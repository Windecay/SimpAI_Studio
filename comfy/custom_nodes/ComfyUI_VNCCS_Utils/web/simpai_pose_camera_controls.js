const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const degrees = value => value * 180 / Math.PI;
const radians = value => value * Math.PI / 180;
export const wrapCameraYaw = value => ((value + 180) % 360 + 360) % 360 - 180;

export function cameraRotationPatch(params, dx, dy, fine = false) {
    const speed = fine ? 0.075 : 0.3;
    return {
        cam_yaw_deg: wrapCameraYaw((Number(params.cam_yaw_deg) || 0) + dx * speed),
        cam_pitch_deg: clamp((Number(params.cam_pitch_deg) || 0) + dy * speed, -89, 89)
    };
}

export function cameraWheelPatch(params, event, distance = false) {
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 240 : 1;
    const delta = clamp(Number(event.deltaY) * units, -600, 600);
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) return null;
    const speed = event.shiftKey ? 0.00025 : 0.00055;
    const key = distance || event.altKey ? 'cam_distance' : 'cam_zoom';
    const value = (Number(params[key]) || 1) * Math.exp(delta * speed * (key === 'cam_distance' ? 1 : -1));
    return { [key]: clamp(value, 0.1, key === 'cam_distance' ? 5 : 7) };
}

export function cameraKeyboardAction(params, event) {
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    const angle = event.shiftKey ? 1 : 5;
    const yaw = Number(params.cam_yaw_deg) || 0, pitch = Number(params.cam_pitch_deg) || 0;
    const factor = event.shiftKey ? 1.02 : 1.1;
    switch (event.key) {
        case 'ArrowLeft': return { patch: { cam_yaw_deg: wrapCameraYaw(yaw - angle) } };
        case 'ArrowRight': return { patch: { cam_yaw_deg: wrapCameraYaw(yaw + angle) } };
        case 'ArrowUp': return { patch: { cam_pitch_deg: clamp(pitch - angle, -89, 89) } };
        case 'ArrowDown': return { patch: { cam_pitch_deg: clamp(pitch + angle, -89, 89) } };
        case 'PageUp': return { patch: { cam_distance: clamp((Number(params.cam_distance) || 1) / factor, 0.1, 5) } };
        case 'PageDown': return { patch: { cam_distance: clamp((Number(params.cam_distance) || 1) * factor, 0.1, 5) } };
        case 'r': case 'R': return { reset: true };
        default: return null;
    }
}

// Side view follows the current azimuth, so it remains usable at a 90-degree yaw.
export function spatialPlanePoint(point, mode, yaw) {
    return mode === 'side'
        ? [-(point[0] * Math.sin(radians(yaw)) + point[2] * Math.cos(radians(yaw))), -point[1]]
        : [point[0], point[2]];
}

export function spatialCameraDragPatch(viewer, params, mode, point) {
    if (!viewer?.THREE || !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) return null;
    const THREE = viewer.THREE;
    const probe = new THREE.PerspectiveCamera();
    const frame = viewer._samProjectionCameraFrame;
    let pivot, baseDistance;
    if (frame?.cameraPosition) {
        const p = frame.cameraPosition;
        probe.position.set(p.x - (Number(params.cam_offset_x) || 0), p.y - (Number(params.cam_offset_y) || 0), p.z);
        probe.lookAt(probe.position.clone().add(new THREE.Vector3(0, 0, -1)));
        pivot = viewer._getSAMProjectionViewTarget(probe);
        baseDistance = probe.position.distanceTo(pivot);
    } else {
        pivot = (viewer.meshCenter || new THREE.Vector3(0, 10, 0)).clone();
        pivot.x -= Number(params.cam_offset_x) || 0;
        pivot.y -= Number(params.cam_offset_y) || 0;
        baseDistance = 45;
    }
    let yaw = Number(params.cam_yaw_deg) || 0, pitch = Number(params.cam_pitch_deg) || 0, radius;
    const distanceFor = (angle, elevation, length) => {
        if (!frame) return length / baseDistance;
        const offset = new THREE.Vector3(0, 0, baseDistance).applyEuler(new THREE.Euler(radians(elevation), radians(angle), 0, 'YXZ'));
        probe.position.copy(pivot).add(offset);
        probe.lookAt(pivot);
        const depth = probe.position.distanceTo(viewer._getSAMProjectionViewTarget(probe));
        return (length - baseDistance + depth) / Math.max(depth, 1e-6);
    };
    if (mode === 'side') {
        const origin = spatialPlanePoint(pivot.toArray(), mode, yaw);
        const horizontal = origin[0] - point[0];
        const vertical = -point[1] - pivot.y;
        const sign = horizontal < 0 ? -1 : 1;
        pitch = clamp(-degrees(Math.atan2(vertical * sign, Math.abs(horizontal))), -89, 89);
        radius = Math.hypot(horizontal, vertical) * sign;
    } else {
        const dx = point[0] - pivot.x, dz = point[1] - pivot.z;
        if (Math.hypot(dx, dz) < 1e-6) return null;
        yaw = wrapCameraYaw(degrees(Math.atan2(dx, dz)));
        radius = Math.hypot(dx, dz) / Math.max(0.017, Math.cos(radians(pitch)));
        if (frame) {
            // Near the SAM projection target the camera can pass its original orbit
            // origin. Keep the valid orientation nearest the preceding drag sample.
            const choices = [{ yaw, radius }, { yaw: wrapCameraYaw(yaw + 180), radius: -radius }];
            const previousYaw = Number(params.cam_yaw_deg) || 0;
            for (const choice of choices) {
                const distance = distanceFor(choice.yaw, pitch, choice.radius);
                choice.score = Math.abs(distance - clamp(distance, 0.1, 5)) * 1000
                    + Math.abs(wrapCameraYaw(choice.yaw - previousYaw));
            }
            choices.sort((a, b) => a.score - b.score);
            ({ yaw, radius } = choices[0]);
        }
    }
    const distance = distanceFor(yaw, pitch, radius);
    return { cam_yaw_deg: yaw, cam_pitch_deg: pitch, cam_distance: clamp(distance, 0.1, 5) };
}
