// Library previews and the editor share the same capture-camera calculation.
export function libraryPoseCameraParams(viewer, pose, width, height, view = {}) {
    const namedCamera = pose?.cameraViews?.[view.key] || {};
    const camera = { ...pose?.cameraParams, ...namedCamera };
    const ratio = (Number(width) || 768) / (Number(height) || 1024);
    const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
    const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
    const result = {
        zoom: positive(camera.zoom, 1) * Math.min(1, ratio / 0.75),
        offset_x: number(camera.offset_x), offset_y: number(camera.offset_y),
        yaw_deg: number(namedCamera.yaw_deg ?? view.yaw ?? camera.yaw_deg),
        pitch_deg: number(namedCamera.pitch_deg ?? view.pitch ?? camera.pitch_deg),
        distance_scale: positive(camera.distance_scale, 1)
    };
    if (view.yaw === undefined || Number(namedCamera.zoom) > 0 || pose?._library?.series === 'upper_body') return result;
    const mesh = viewer?.skinnedMesh;
    if (!mesh?.geometry?.index || !viewer.captureCamera || !viewer.THREE) return result;
    mesh.updateMatrixWorld(true);
    viewer.skeleton.update();
    viewer.updateCaptureCamera(width, height, 1, result.offset_x, result.offset_y,
        result.yaw_deg, result.pitch_deg, result.distance_scale);
    viewer.captureCamera.updateMatrixWorld(true);
    const point = new viewer.THREE.Vector3();
    let extent = 0;
    for (const index of new Set(mesh.geometry.index.array)) {
        mesh.getVertexPosition(index, point).applyMatrix4(mesh.matrixWorld).project(viewer.captureCamera);
        if (Number.isFinite(point.x) && Number.isFinite(point.y)) extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y));
    }
    if (extent > 0) result.zoom = Math.min(4, 0.86 / extent);
    return result;
}
