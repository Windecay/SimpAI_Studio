// The selected person uses the editable rig. Other people stay in the same
// Three.js scene as posed meshes, sharing its camera, depth buffer and lighting.
export class PoseScene {
    constructor(viewer) {
        this.viewer = viewer;
        this.people = [];
        this.active = 0;
        this.projection = null;
        this.loading = false;
    }

    remember(meshParams) {
        if (this.loading || !this.people.length) return;
        const person = this.people[this.active];
        const v = this.viewer;
        person.pose = v.getPose();
        person.position = v.skinnedMesh.position.toArray();
        person.mesh_params = { ...meshParams };
        person.proportions = this._proportions();
        person.history = v.history;
        person.future = v.future;
    }

    _proportions() {
        const v = this.viewer;
        return { head: v.headScale, arm: v.armScale, hand: v.handScale, lengths: { ...v.boneLengthParams } };
    }

    serialize(meshParams) {
        if (!this.people.length) return null;
        this.remember(meshParams);
        return {
            format: 'simpai_pose_scene', version: 1, active_person: this.active,
            projection: this.projection,
            people: this.people.map(p => ({
                pose: p.pose, position: p.position, mesh_params: p.mesh_params, proportions: p.proportions
            }))
        };
    }

    _removeSnapshot(person) {
        const mesh = person.snapshot;
        if (!mesh) return;
        mesh.removeFromParent();
        mesh.geometry.dispose();
        mesh.material.dispose();
        person.snapshot = null;
    }

    _snapshot(person) {
        this._removeSnapshot(person);
        const v = this.viewer;
        const mesh = v.skinnedMesh;
        mesh.updateMatrixWorld(true);
        mesh.skeleton.update();
        const geometry = mesh.geometry.clone();
        const positions = geometry.getAttribute('position');
        const point = new v.THREE.Vector3();
        for (let i = 0; i < positions.count; i++) {
            mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
            positions.setXYZ(i, point.x, point.y, point.z);
        }
        geometry.deleteAttribute('skinIndex');
        geometry.deleteAttribute('skinWeight');
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const material = mesh.material.clone();
        material.onBeforeCompile = mesh.material.onBeforeCompile;
        person.snapshot = new v.THREE.Mesh(geometry, material);
        v.scene.add(person.snapshot);
    }

    clear() {
        this.people.forEach(p => this._removeSnapshot(p));
        this.people = [];
        this.active = 0;
        this.projection = null;
    }

    _loadPerson(person) {
        const v = this.viewer;
        v.transform?.detach();
        v.selectedBone = null;
        v.selectedIKEffector = null;
        v.selectedPoleTarget = null;
        v.hideHandHighlightRing();
        v.clearSAMMeshOverlay();
        v._clearImportedFigureGroup('_hmr2FigureGroup');
        const p = person.proportions;
        v.headScale = p?.head ?? person.mesh_params.head_size ?? 1;
        v.armScale = p?.arm ?? person.mesh_params.arm_size ?? 1;
        v.handScale = p?.hand ?? person.mesh_params.hand_size ?? 1;
        v.boneLengthParams = p?.lengths ? { ...p.lengths } : Object.fromEntries(
            Object.keys(v.boneLengthParams).map(key => [key, person.mesh_params[`${key}_length`] ?? 0.5])
        );
        v.loadData(person.meshData, true);
        v.history = person.history || [];
        v.future = person.future || [];
        if (person.pose) v.setPose(person.pose, true);
        v.skinnedMesh.position.fromArray(person.position || [0, 0, 0]);
        v.skinnedMesh.updateMatrixWorld(true);
        v.skeleton.update();
        v.updateIKEffectorPositions('all');
        v.updatePoleTargetPositions();
        v.updateMarkers();
        v.setSAMProjectionCameraFrame(this.projection);
    }

    select(index, meshParams) {
        if (!Number.isInteger(index) || index < 0 || index >= this.people.length || index === this.active) return false;
        this.remember(meshParams);
        this._snapshot(this.people[this.active]);
        this.active = index;
        const person = this.people[index];
        this._removeSnapshot(person);
        this._loadPerson(person);
        this.viewer.requestRender();
        return true;
    }

    pick(event) {
        if (this.people.length < 2 || event.button !== 0) return -1;
        const v = this.viewer;
        if (v.transform?.axis || v.transform?.dragging) return this.active;
        const rect = v.canvas.getBoundingClientRect();
        const mouse = new v.THREE.Vector2(
            (event.clientX - rect.left) / rect.width * 2 - 1,
            -(event.clientY - rect.top) / rect.height * 2 + 1
        );
        const ray = new v.THREE.Raycaster();
        ray.setFromCamera(mouse, v.camera);
        if (ray.intersectObjects(v._getRaycastableJointMarkers(), false).length) return this.active;
        const meshes = this.people.map((p, i) => i === this.active ? v.skinnedMesh : p.snapshot);
        const hit = ray.intersectObjects(meshes.filter(Boolean), false)[0];
        return hit ? meshes.indexOf(hit.object) : -1;
    }

    // Mesh and overlay requests finish before replacing the user's current scene.
    async load(data, meshParams, preview, overlay) {
        if (!Array.isArray(data.people) || !data.people.length) throw new Error('The pose scene has no people.');
        const prepared = [];
        for (const entry of data.people) {
            const params = { ...meshParams, ...entry.mesh_params };
            const meshData = await preview(params);
            if (!meshData?.vertices || !meshData?.bones) throw new Error(meshData?.error || 'Character preview failed.');
            const raw = entry.pose ? null : entry;
            const result = raw ? await overlay(raw, params) : null;
            if (raw && !result?.mesh) throw new Error(result?.error || 'Person reconstruction failed.');
            prepared.push({ ...entry, mesh_params: params, meshData, raw, overlay: result?.mesh });
        }
        const v = this.viewer;
        const previous = this.people;
        const previousActive = this.active;
        const previousProjection = this.projection;
        const previousCameraFrame = v._samProjectionCameraFrame;
        const previousMesh = this.meshData;
        const previousPose = v.getPose();
        const previousPosition = v.skinnedMesh.position.toArray();
        this.remember(meshParams);
        this.loading = true;
        try {
            this.people = prepared;
            this.projection = data.projection || null;
            for (let i = 0; i < prepared.length; i++) {
                const person = prepared[i];
                this._loadPerson(person);
                if (person.raw) {
                    if (!v.applySAM3DImport(person.raw) || !v.setSAMMeshOverlayData(person.overlay, person.raw)) {
                        throw new Error('Could not apply a reconstructed person.');
                    }
                    v.fitCurrentPoseToSAMMeshOverlay();
                    const size = person.raw.image_size;
                    const frame = v.computeSAM3DFrameCameraParams(person.raw, size.width, size.height, person.overlay)?.sam_projection;
                    if (!frame) throw new Error('Could not align a person to the reference camera.');
                    if (!this.projection) this.projection = frame;
                    const origin = this.projection.cameraPosition;
                    person.position = ['x', 'y', 'z'].map(axis => origin[axis] - frame.cameraPosition[axis]);
                    v.skinnedMesh.position.fromArray(person.position);
                    v.skinnedMesh.updateMatrixWorld(true);
                    v.updateIKEffectorPositions('all');
                    v.updatePoleTargetPositions();
                    person.pose = v.getPose();
                    person.proportions = this._proportions();
                }
                this._snapshot(person);
                delete person.raw;
                delete person.overlay;
            }
            if (this.projection && !this.projection.sceneCenter) {
                const bounds = new v.THREE.Box3();
                prepared.forEach(p => bounds.union(p.snapshot.geometry.boundingBox));
                this.projection = { ...this.projection, sceneCenter: bounds.getCenter(new v.THREE.Vector3()).toArray() };
            }
            this.active = Math.max(0, Math.min(prepared.length - 1, Number(data.active_person) || 0));
            const person = prepared[this.active];
            this._removeSnapshot(person);
            this._loadPerson(person);
            previous.forEach(p => this._removeSnapshot(p));
            this.meshData = person.meshData;
        } catch (error) {
            prepared.forEach(p => this._removeSnapshot(p));
            this.people = previous;
            this.active = previousActive;
            this.projection = previousProjection;
            if (previous.length) this._loadPerson(previous[previousActive]);
            else if (previousMesh) this._loadPerson({ meshData: previousMesh, mesh_params: meshParams, pose: previousPose, position: previousPosition });
            v.setSAMProjectionCameraFrame(previousCameraFrame);
            throw error;
        } finally {
            this.loading = false;
            v.requestRender();
        }
    }
}
