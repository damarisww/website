import * as THREE from './vendor/three/three.module.js';
import { OBJLoader } from './vendor/three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from './vendor/three/examples/jsm/loaders/MTLLoader.js';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';

/**
 * Mount a textured OBJ into a container.
 * @param {HTMLElement} container
 * @param {{
 *   basePath: string,
 *   objName?: string,
 *   mtlName?: string,
 *   autoRotate?: boolean,
 *   interactive?: boolean,
 *   assetVersion?: string,
 *   onReady?: () => void,
 *   onError?: (err: unknown) => void
 * }} options
 */
export function mountObjViewer(container, options) {
    const basePath = options.basePath.endsWith('/') ? options.basePath : options.basePath + '/';
    const objName = options.objName || '3DModel.obj';
    const mtlName = options.mtlName || '3DModel.mtl';
    const assetVersion = options.assetVersion || '';
    const autoRotate = options.autoRotate !== false;
    const interactive = !!options.interactive;

    const manager = new THREE.LoadingManager();
    if (assetVersion) {
        manager.setURLModifier((url) => {
            if (/3DModel\.(obj|mtl|jpe?g|png|webp)(\?|$)/i.test(url)) {
                const sep = url.includes('?') ? '&' : '?';
                return `${url}${sep}v=${encodeURIComponent(assetVersion)}`;
            }
            return url;
        });
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(0.9, 0.55, 1.15);

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, interactive ? 2 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = interactive ? 'auto' : 'none';

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.05);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2.2, 3.4, 1.6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-2.0, 0.6, -1.4);
    scene.add(fill);

    let controls = null;
    if (interactive) {
        controls = new OrbitControls(camera, canvas);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.enablePan = false;
        controls.minDistance = 0.35;
        controls.maxDistance = 4.5;
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = 1.1;
        controls.addEventListener('start', () => {
            controls.autoRotate = false;
        });
    }

    let model = null;
    let frameId = 0;
    let disposed = false;
    let spinY = 0;

    function resize() {
        const w = Math.max(1, container.clientWidth || container.offsetWidth || 1);
        const h = Math.max(1, container.clientHeight || container.offsetHeight || 1);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
    }

    function fitCameraToObject(object) {
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        object.position.sub(center);

        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const fitDist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360));
        const distance = fitDist * (interactive ? 1.55 : 1.75);

        camera.near = Math.max(0.001, distance / 100);
        camera.far = Math.max(10, distance * 40);
        camera.position.set(distance * 0.72, distance * 0.38, distance * 0.95);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();

        if (controls) {
            controls.target.set(0, 0, 0);
            controls.minDistance = distance * 0.45;
            controls.maxDistance = distance * 3.2;
            controls.update();
        }
    }

    function tick() {
        if (disposed) return;
        frameId = requestAnimationFrame(tick);
        if (controls) {
            controls.update();
        } else if (autoRotate && model) {
            spinY += 0.008;
            model.rotation.y = spinY;
        }
        renderer.render(scene, camera);
    }

    const mtlLoader = new MTLLoader(manager);
    mtlLoader.setPath(basePath);
    mtlLoader.load(
        mtlName,
        (materials) => {
            materials.preload();
            const objLoader = new OBJLoader(manager);
            objLoader.setMaterials(materials);
            objLoader.setPath(basePath);
            objLoader.load(
                objName,
                (object) => {
                    if (disposed) return;
                    model = object;
                    object.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = false;
                            child.receiveShadow = false;
                            if (child.material) {
                                const mats = Array.isArray(child.material)
                                    ? child.material
                                    : [child.material];
                                mats.forEach((mat) => {
                                    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                                    mat.side = THREE.FrontSide;
                                });
                            }
                        }
                    });
                    scene.add(object);
                    resize();
                    fitCameraToObject(object);
                    if (typeof options.onReady === 'function') options.onReady();
                },
                undefined,
                (err) => {
                    if (typeof options.onError === 'function') options.onError(err);
                }
            );
        },
        undefined,
        (err) => {
            if (typeof options.onError === 'function') options.onError(err);
        }
    );

    resize();
    tick();

    const ro = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => resize())
        : null;
    if (ro) ro.observe(container);
    else window.addEventListener('resize', resize);

    return {
        dispose() {
            disposed = true;
            cancelAnimationFrame(frameId);
            if (ro) ro.disconnect();
            else window.removeEventListener('resize', resize);
            if (controls) controls.dispose();
            renderer.dispose();
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
            scene.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                    mats.forEach((mat) => {
                        if (mat.map) mat.map.dispose();
                        mat.dispose();
                    });
                }
            });
        }
    };
}

export function mountAllArchiveModels(selector, isMobile) {
    const nodes = document.querySelectorAll(selector || '.project-model[data-model-base]');
    nodes.forEach((node) => {
        let base = node.getAttribute('data-model-base') || '';
        if (isMobile && base.startsWith('bilder/')) {
            base = base.replace(/^bilder\//, 'bilder-mobile/');
        }
        mountObjViewer(node, {
            basePath: base,
            autoRotate: true,
            interactive: false
        });
    });
}
