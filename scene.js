const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function setupViewerControls(viewport) {
    const panel = viewport.querySelector('#viewer-controls');
    const toggle = viewport.querySelector('#toggle-controls');
    toggle.hidden = false;
    toggle.addEventListener('click', () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });
}

function mountScene(viewport, { direction, width, height }) {
    const message = viewport.querySelector('#scene-message');
    const viewArea = viewport.querySelector('.scene-area');
    setupViewerControls(viewport);
    if (!window.THREE || !THREE.OrbitControls) {
        message.textContent = '3Dライブラリを読み込めませんでした。接続を確認して再読み込みしてください。';
        return null;
    }

    let renderer;
    try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
        message.textContent = 'このブラウザーでは3D表示を利用できません。';
        return null;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 1000);
    const canvas = renderer.domElement;
    const controls = new THREE.OrbitControls(camera, canvas);
    const labels = new Set();
    const projected = new THREE.Vector3();
    let frame = 0;

    controls.enablePan = false;
    controls.minZoom = 0.5;
    controls.maxZoom = 3;
    controls.rotateSpeed = 0.68;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '3Dビュー。矢印キーで回転、＋と−で拡大・縮小。');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    message.before(canvas);
    message.hidden = true;

    function draw() {
        frame = 0;
        renderer.render(scene, camera);
        const { clientWidth, clientHeight } = viewport;
        for (const { element, position, visible, offset } of labels) {
            projected.copy(position()).project(camera);
            const x = (projected.x + 1) * clientWidth / 2;
            const y = (1 - projected.y) * clientHeight / 2;
            element.hidden = !visible() || Math.abs(projected.x) > 0.97 || Math.abs(projected.y) > 0.94;
            element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) translate(${offset[0]}px, ${offset[1]}px)`;
        }
    }

    function invalidate() {
        if (!frame) frame = requestAnimationFrame(draw);
    }

    function fit(nextWidth = width, nextHeight = height) {
        width = nextWidth;
        height = nextHeight;
        const { clientWidth, clientHeight } = viewport;
        if (!clientWidth || !clientHeight) return;

        const bounds = viewport.getBoundingClientRect();
        const area = viewArea.getBoundingClientRect();
        const scale = Math.max(width / Math.max(1, area.width), height / Math.max(1, area.height));
        const halfWidth = clientWidth * scale / 2;
        const halfHeight = clientHeight * scale / 2;
        camera.left = -halfWidth;
        camera.right = halfWidth;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        // Keep the model centered in the space between the controls.
        camera.setViewOffset(
            clientWidth,
            clientHeight,
            clientWidth / 2 - (area.left - bounds.left + area.width / 2),
            clientHeight / 2 - (area.top - bounds.top + area.height / 2),
            clientWidth,
            clientHeight,
        );
        invalidate();
    }

    function reset() {
        camera.position.set(...direction).setLength(70);
        camera.zoom = 1;
        controls.target.set(0, 0, 0);
        controls.update();
        camera.updateProjectionMatrix();
        invalidate();
    }

    function addLabel(text, color, position, visible = () => true, offset = [0, 0]) {
        const element = document.createElement('span');
        element.className = 'scene-label';
        element.textContent = text;
        element.style.setProperty('--label-color', color);
        element.setAttribute('aria-hidden', 'true');
        viewport.append(element);
        const label = { element, position, visible, offset };
        labels.add(label);
        invalidate();
        return () => {
            labels.delete(label);
            element.remove();
        };
    }

    canvas.addEventListener('keydown', event => {
        const offset = new THREE.Vector3().copy(camera.position).sub(controls.target);
        const spherical = new THREE.Spherical().setFromVector3(offset);
        switch (event.key) {
            case 'ArrowLeft': spherical.theta -= 0.12; break;
            case 'ArrowRight': spherical.theta += 0.12; break;
            case 'ArrowUp': spherical.phi -= 0.12; break;
            case 'ArrowDown': spherical.phi += 0.12; break;
            case '+':
            case '=': camera.zoom = Math.min(controls.maxZoom, camera.zoom * 1.13); break;
            case '-':
            case '−': camera.zoom = Math.max(controls.minZoom, camera.zoom / 1.13); break;
            default: return;
        }
        event.preventDefault();
        camera.position.copy(offset.setFromSpherical(spherical.makeSafe())).add(controls.target);
        camera.updateProjectionMatrix();
        controls.update();
        invalidate();
    });

    controls.addEventListener('change', invalidate);
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.some(entry => entry.target === viewport)) {
            renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
        }
        fit();
    });
    resizeObserver.observe(viewport);
    resizeObserver.observe(viewArea);
    reset();
    fit();

    return { scene, fit, reset, invalidate, addLabel };
}

function easeMotion(t) {
    return t * t * (3 - 2 * t);
}

function animateValue(from, to, duration, apply, complete = () => {}) {
    if (duration === 0 || from === to) {
        apply(to);
        complete();
        return () => {};
    }

    let frame;
    let start;
    function tick(now) {
        start ??= now;
        const progress = Math.min((now - start) / duration, 1);
        apply(from + (to - from) * progress);
        if (progress < 1) {
            frame = requestAnimationFrame(tick);
        } else {
            complete();
        }
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
}
