const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function setupExpandedView(viewport) {
    const workspace = viewport.closest('.workspace');
    const toggle = workspace.querySelector('#expand-view');
    const dialog = document.querySelector('#expanded-view');
    if (typeof dialog.showModal !== 'function') return;

    // Move the live view so its camera, playback and controls keep their state.
    const originalPosition = document.createComment('3D workspace');
    workspace.before(originalPosition);
    let scrollY = 0;
    toggle.hidden = false;

    toggle.addEventListener('click', () => {
        if (dialog.open) {
            dialog.close();
            return;
        }
        scrollY = window.scrollY;
        dialog.showModal();
        dialog.append(workspace);
        dialog.scrollTop = 0;
        toggle.textContent = '閉じる';
        toggle.setAttribute('aria-expanded', 'true');
        toggle.focus({ preventScroll: true });
    });

    dialog.addEventListener('close', () => {
        originalPosition.after(workspace);
        window.scrollTo(0, scrollY);
        toggle.textContent = '拡大表示';
        toggle.setAttribute('aria-expanded', 'false');
        toggle.focus({ preventScroll: true });
    });
}

function mountScene(viewport, { direction, width, height }) {
    const message = document.querySelector('#scene-message');
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
    viewport.prepend(canvas);
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
        const aspect = viewport.clientWidth / Math.max(1, viewport.clientHeight);
        const halfHeight = Math.max(height, width / Math.max(0.1, aspect)) / 2;
        camera.left = -halfHeight * aspect;
        camera.right = halfHeight * aspect;
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        camera.updateProjectionMatrix();
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
    new ResizeObserver(() => {
        renderer.setSize(viewport.clientWidth, viewport.clientHeight, false);
        fit();
    }).observe(viewport);
    setupExpandedView(viewport);
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
