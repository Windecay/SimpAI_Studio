(function () {
    'use strict';

    const rendererUrl = new URL('vendor/studio-mesh-three-r160.js?v=1', document.currentScript.src);
    let rendererModule;
    const translate = (label) => window.SimpAII18n?.localize(label, label, window.simpleaiGalleryConfig) || label;

    function disposeModel(root) {
        const resources = new Set();
        root?.traverse((node) => {
            if (node.geometry) resources.add(node.geometry);
            if (node.skeleton) resources.add(node.skeleton);
            for (const material of [].concat(node.material || [])) {
                resources.add(material);
                for (const value of Object.values(material)) {
                    if (value?.isTexture) {
                        if (typeof value.image?.close === 'function') resources.add(value.image);
                        resources.add(value);
                    }
                }
            }
        });
        for (const resource of resources) {
            if (resource.dispose) resource.dispose();
            else resource.close();
        }
    }

    async function parseModel(three, bytes, format) {
        if (format === 'glb' || format === 'gltf') {
            const manager = new three.LoadingManager();
            manager.setURLModifier((resource) => {
                if (/^data:(?:application\/(?:octet-stream|gltf-buffer)|image\/(?:png|jpeg|webp|avif));base64,/i.test(resource)
                    || resource.startsWith(`blob:${location.origin}/`)) return resource;
                // A result must not request other Studio files or contact remote hosts.
                throw new Error('External model resources are not supported');
            });
            const loader = new three.GLTFLoader(manager).setMeshoptDecoder(three.MeshoptDecoder);
            return (await loader.parseAsync(bytes, '')).scene;
        }
        if (format === 'obj') {
            return new three.OBJLoader().parse(new TextDecoder().decode(bytes));
        }
        const loader = format === 'ply' ? new three.PLYLoader() : new three.STLLoader();
        const geometry = loader.parse(bytes);
        if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
        const material = new three.MeshStandardMaterial({
            color: geometry.hasAttribute('color') ? 0xffffff : 0xbccad9,
            vertexColors: geometry.hasAttribute('color'),
            side: three.DoubleSide
        });
        return new three.Mesh(geometry, material);
    }

    function createScene(three, host, model) {
        let hasMesh = false;
        model.traverse((node) => {
            if (node.isMesh && (node.geometry?.index?.count || node.geometry?.getAttribute('position')?.count) >= 3) {
                hasMesh = true;
            }
        });
        const bounds = new three.Box3().setFromObject(model);
        const diameter = bounds.getSize(new three.Vector3()).length();
        if (!hasMesh || !Number.isFinite(diameter) || diameter <= 0) throw new Error('The file has no mesh');
        const group = new three.Group();
        group.scale.setScalar(1 / diameter);
        group.position.copy(bounds.getCenter(new three.Vector3())).multiplyScalar(-1 / diameter);
        group.add(model);

        const scene = new three.Scene();
        scene.add(group);
        scene.add(new three.HemisphereLight(0xffffff, 0x728399, 1.5));
        const key = new three.DirectionalLight(0xfff3e3, 1.8);
        key.position.set(3, 5, 4);
        scene.add(key);

        const renderer = new three.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
        renderer.setClearColor(0, 0);
        renderer.domElement.setAttribute('aria-label', translate('3D preview'));
        host.prepend(renderer.domElement);

        const environment = new three.RoomEnvironment();
        const pmrem = new three.PMREMGenerator(renderer);
        const lighting = pmrem.fromScene(environment, 0.04);
        scene.environment = lighting.texture;
        environment.dispose();
        pmrem.dispose();

        const camera = new three.PerspectiveCamera(36, 1, 0.001, 150);
        const controls = new three.OrbitControls(camera, renderer.domElement);
        const direction = new three.Vector3(0.64, 0.33, 1).normalize();
        controls.minDistance = 0.08;
        controls.maxDistance = 40;
        let framed = false;
        const draw = () => renderer.render(scene, camera);
        const reset = () => {
            const halfAngle = camera.fov * Math.PI / 360;
            const horizontal = Math.atan(Math.tan(halfAngle) * camera.aspect);
            const distance = 0.58 / Math.sin(Math.min(horizontal, halfAngle));
            camera.position.copy(direction).multiplyScalar(distance);
            controls.target.set(0, 0, 0);
            controls.update();
            draw();
        };
        const resize = () => {
            if (!host.clientWidth || !host.clientHeight) return;
            renderer.setSize(host.clientWidth, host.clientHeight, false);
            camera.aspect = host.clientWidth / host.clientHeight;
            camera.updateProjectionMatrix();
            if (!framed) {
                framed = true;
                reset();
            } else {
                draw();
            }
        };
        const observer = new ResizeObserver(resize);
        controls.addEventListener('change', draw);
        observer.observe(host);
        resize();
        return {
            reset,
            dispose() {
                observer.disconnect();
                controls.dispose();
                lighting.dispose();
                renderer.dispose();
                renderer.forceContextLoss();
                renderer.domElement.remove();
            }
        };
    }

    class MeshViewer extends HTMLElement {
        connectedCallback() {
            this.load();
        }

        disconnectedCallback() {
            this.release();
        }

        release() {
            this.controller?.abort();
            this.controller = null;
            this.viewport?.dispose();
            this.viewport = null;
            disposeModel(this.model);
            this.model = null;
        }

        async load() {
            this.release();
            delete this.dataset.ready;
            const controller = new AbortController();
            this.controller = controller;
            this.innerHTML = `
                <p data-mesh-progress role="status"></p>
                <button type="button" class="mesh-reset" hidden><i class="fa fa-rotate-left" aria-hidden="true"></i></button>
            `;
            const status = this.querySelector('[data-mesh-progress]');
            const reset = this.querySelector('button');
            reset.setAttribute('aria-label', translate('Reset view'));
            reset.title = translate('Reset view');
            reset.addEventListener('click', () => this.viewport?.reset());
            status.textContent = translate('Loading 3D model...');
            const timeout = setTimeout(() => controller.abort(new DOMException('Model load timed out', 'TimeoutError')), 60000);
            try {
                const url = new URL(this.dataset.src, location.href);
                const format = this.dataset.format;
                if (url.origin !== location.origin || !['glb', 'gltf', 'obj', 'ply', 'stl'].includes(format)) {
                    throw new Error('Unsupported mesh source');
                }
                rendererModule ||= import(rendererUrl.href).catch((error) => {
                    rendererModule = null;
                    throw error;
                });
                const [three, bytes] = await Promise.all([
                    rendererModule,
                    fetch(url, { credentials: 'same-origin', redirect: 'error', signal: controller.signal }).then((response) => {
                        if (!response.ok) throw new Error(`Model HTTP ${response.status}`);
                        return response.arrayBuffer();
                    })
                ]);
                const model = await parseModel(three, bytes, format);
                if (this.controller !== controller || controller.signal.aborted) {
                    disposeModel(model);
                    if (controller.signal.reason?.name === 'TimeoutError') throw controller.signal.reason;
                    return;
                }
                this.model = model;
                this.viewport = createScene(three, this, model);
                status.hidden = true;
                reset.hidden = false;
                this.dataset.ready = 'true';
            } catch (error) {
                if (this.controller !== controller) return;
                this.release();
                status.textContent = translate('Unable to preview this 3D model.');
                this.dataset.ready = 'error';
                console.debug('[3D viewer]', error);
            } finally {
                clearTimeout(timeout);
            }
        }
    }

    customElements.define('simpai-mesh-viewer', MeshViewer);
})();
