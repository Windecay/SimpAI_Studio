// Construction marks live in the rest mesh, so skinning carries them with the pose.
export function preparePoseLineart(THREE, geometry, bones) {
    const byName = Object.fromEntries(bones.map(bone => [bone.name, bone]));
    const point = name => byName[name] ? new THREE.Vector3(...byName[name].userData.headPos) : null;
    const positions = geometry.getAttribute('position');
    const indices = geometry.getAttribute('skinIndex');
    const weights = geometry.getAttribute('skinWeight');
    const boneRegions = bones.map(bone => [bone.name === 'head', /^(pelvis|spine_\d+|neck_\d+)$/.test(bone.name)]);
    const regions = new Float32Array(positions.count * 2);
    const headBounds = new THREE.Box3();
    const vertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        for (let j = 0; j < 4; j++) {
            const region = boneRegions[indices.array[i * 4 + j]];
            const weight = weights.array[i * 4 + j];
            if (region?.[0]) regions[i * 2] += weight;
            if (region?.[1]) regions[i * 2 + 1] += weight;
        }
        if (regions[i * 2] > 0.8) headBounds.expandByPoint(vertex.fromBufferAttribute(positions, i));
    }
    geometry.setAttribute('poseLineRegion', new THREE.BufferAttribute(regions, 2));
    geometry.setAttribute('poseRestPosition', positions.clone());
    const headCenter = new THREE.Vector3();
    const headRadii = new THREE.Vector3(1, 1, 1);
    if (!headBounds.isEmpty()) {
        headBounds.getCenter(headCenter);
        headBounds.getSize(headRadii).multiplyScalar(0.5).max(new THREE.Vector3(0.001, 0.001, 0.001));
    }
    const lineNormals = geometry.getAttribute('normal').clone();
    const normal = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i).sub(headCenter).divide(headRadii);
        const blend = THREE.MathUtils.smoothstep(regions[i * 2], 0.5, 0.95)
            * (1 - THREE.MathUtils.smoothstep(Math.abs(vertex.x), 0.65, 0.9));
        if (blend === 0 || vertex.lengthSq() === 0) continue;
        vertex.divide(headRadii).normalize();
        normal.fromBufferAttribute(lineNormals, i).lerp(vertex, blend).normalize();
        lineNormals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    geometry.setAttribute('poseLineNormal', lineNormals);

    const pelvis = point('pelvis');
    const neck = point('neck_01');
    const spine = point('spine_03');
    const hip = point('thigh_l');
    const torso = new THREE.Vector4(0, 0, 1, 1);
    if (pelvis && neck && spine && hip) {
        torso.set(pelvis.x, pelvis.y, THREE.MathUtils.lerp(spine.y, neck.y, 0.4), Math.max(Math.abs(hip.x - pelvis.x) * 1.5, 0.01));
    } else {
        for (let i = 0; i < positions.count; i++) regions[i * 2 + 1] = 0;
    }

    const joints = [];
    const legStarts = [], legEnds = [];
    for (const side of ['l', 'r']) {
        for (const [name, child, ratio] of [
            ['upperarm', 'lowerarm', 0.22], ['lowerarm', 'hand', 0.15],
            ['hand', 'lowerarm', 0.09], ['thigh', 'calf', 0.23],
            ['calf', 'foot', 0.13], ['foot', 'calf', 0.075],
        ]) {
            const a = point(`${name}_${side}`), b = point(`${child}_${side}`);
            joints.push(a && b ? new THREE.Vector4(a.x, a.y, a.z, a.distanceTo(b) * ratio) : new THREE.Vector4());
        }
        for (const [name, child] of [['thigh', 'calf'], ['calf', 'foot']]) {
            const a = point(`${name}_${side}`), b = point(`${child}_${side}`);
            legStarts.push(a && b ? new THREE.Vector4(a.x, a.y, a.z, a.distanceTo(b) * 0.22) : new THREE.Vector4());
            legEnds.push(b || new THREE.Vector3());
        }
    }
    return {
        poseHeadCenter: { value: headCenter }, poseHeadRadii: { value: headRadii },
        poseTorso: { value: torso }, poseJoints: { value: joints },
        poseLegStarts: { value: legStarts }, poseLegEnds: { value: legEnds },
    };
}

export function bakePoseLineartNormals(THREE, mesh, geometry) {
    const normals = geometry.getAttribute('poseLineNormal');
    if (!normals) return;
    const indices = geometry.getAttribute('skinIndex');
    const weights = geometry.getAttribute('skinWeight');
    const bind = new THREE.Matrix3().setFromMatrix4(mesh.bindMatrix);
    const inverseBind = new THREE.Matrix3().setFromMatrix4(mesh.bindMatrixInverse);
    const world = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const normal = new THREE.Vector3();
    const posed = new THREE.Vector3();
    const matrices = mesh.skeleton.boneMatrices;
    for (let i = 0; i < normals.count; i++) {
        normal.fromBufferAttribute(normals, i).applyMatrix3(bind);
        posed.set(0, 0, 0);
        for (let j = 0; j < 4; j++) {
            const offset = indices.array[i * 4 + j] * 16;
            const weight = weights.array[i * 4 + j];
            posed.x += weight * (matrices[offset] * normal.x + matrices[offset + 4] * normal.y + matrices[offset + 8] * normal.z);
            posed.y += weight * (matrices[offset + 1] * normal.x + matrices[offset + 5] * normal.y + matrices[offset + 9] * normal.z);
            posed.z += weight * (matrices[offset + 2] * normal.x + matrices[offset + 6] * normal.y + matrices[offset + 10] * normal.z);
        }
        posed.applyMatrix3(inverseBind).applyMatrix3(world).normalize();
        normals.setXYZ(i, posed.x, posed.y, posed.z);
    }
}

export const LINEART_VERTEX = `
uniform int poseRenderStyle;
attribute vec2 poseLineRegion;
attribute vec3 poseRestPosition;
attribute vec3 poseLineNormal;
varying vec3 vPoseRestPosition;
varying vec2 vPoseLineRegion;
`;

export const LINEART_FRAGMENT = `
uniform vec3 poseHeadCenter;
uniform vec3 poseHeadRadii;
uniform vec4 poseTorso;
uniform vec4 poseJoints[12];
uniform vec4 poseLegStarts[4];
uniform vec3 poseLegEnds[4];
varying vec3 vPoseRestPosition;
varying vec2 vPoseLineRegion;

float poseStroke(float distance, float width) {
    float pixel = max(fwidth(distance), 0.00001);
    return 1.0 - smoothstep(width * pixel, (width + 1.0) * pixel, abs(distance));
}

vec3 poseConstructionInk(vec3 surfaceNormal, vec3 viewDirection) {
    vec3 p = vPoseRestPosition;
    float head = smoothstep(0.5, 0.95, vPoseLineRegion.x);
    float torso = smoothstep(0.35, 0.85, vPoseLineRegion.y) * (1.0 - head);
    float detail = 0.0;
    float seams = 0.0;

    vec3 face = (p - poseHeadCenter) / poseHeadRadii;
    detail = max(poseStroke(face.x, 0.5), poseStroke(face.y - 0.04, 0.5)) * head;
    float x = (p.x - poseTorso.x) / poseTorso.w;
    float waist = mix(poseTorso.y, poseTorso.z, 0.45);
    float pelvisCurve = poseTorso.y - poseTorso.w * (0.48 - 0.3 * x * x);
    float ribs = poseTorso.z + poseTorso.w * (0.04 + 0.13 * x * x);
    detail = max(detail, torso * max(poseStroke(x, 0.45), poseStroke(p.y - waist, 0.45)));
    seams = max(poseStroke(p.y - pelvisCurve, 0.6), poseStroke(p.y - ribs, 0.5)) * torso;

    for (int i = 0; i < 12; i++) {
        vec4 joint = poseJoints[i];
        if (joint.w > 0.0) {
            vec3 relative = (p - joint.xyz) / joint.w;
            float ring = length(relative.xy * vec2(1.0, 0.9)) - 1.0;
            float surface = 1.0 - smoothstep(1.6, 2.4, abs(relative.z));
            if (i == 3 || i == 9) surface *= smoothstep(-0.15, 0.2, relative.y);
            seams = max(seams, poseStroke(ring, 0.7) * surface);
        }
    }
    for (int i = 0; i < 4; i++) {
        vec4 start = poseLegStarts[i];
        if (start.w > 0.0) {
            vec3 axis = poseLegEnds[i] - start.xyz;
            float along = dot(p - start.xyz, axis) / dot(axis, axis);
            vec3 radial = p - start.xyz - along * axis;
            vec3 side = normalize(vec3(-axis.y, axis.x, 0.0));
            float mask = smoothstep(0.18, 0.26, along) * (1.0 - smoothstep(0.76, 0.85, along));
            mask *= 1.0 - smoothstep(start.w, start.w * 1.25, length(radial));
            detail = max(detail, mask * max(poseStroke(dot(radial, side), 0.35), poseStroke(along - 0.6, 0.35)));
        }
    }

    float facing = abs(dot(surfaceNormal, viewDirection));
    float edgeStep = max(fwidth(facing), 0.001);
    float weight = 1.7 + 0.3 * (1.0 - surfaceNormal.y);
    float outline = 1.0 - smoothstep(0.075 + edgeStep * weight, 0.075 + edgeStep * (weight + 1.0), facing);
    float paper = min(1.0 - 0.5 * detail, 1.0 - 0.76 * seams);
    return vec3(min(paper, 1.0 - 0.95 * outline));
}
`;
