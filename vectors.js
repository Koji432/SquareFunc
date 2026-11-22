(() => {
    const viewport = document.querySelector('#viewport');
    const view = mountScene(viewport, { direction: [6, 5.3, -8.5], width: 14, height: 12 });
    const inputs = ['ax', 'ay', 'az', 'bx', 'by', 'bz'].map(id => document.getElementById(id));
    const steps = [...document.querySelectorAll('[data-step]')];
    const resetView = document.querySelector('#reset-view');
    const resetValues = document.querySelector('#reset-values');
    const play = document.querySelector('#play');
    const playLabel = document.querySelector('#play-label');

    if (!view) {
        [...inputs, ...steps, resetView, resetValues, play].forEach(control => { control.disabled = true; });
        return;
    }

    const css = getComputedStyle(document.documentElement);
    const [aColor, bColor, sumColor] = ['--a', '--b', '--sum'].map(name => css.getPropertyValue(name).trim());
    const initial = inputs.map(input => Number(input.defaultValue));
    const values = [...initial];
    const state = document.querySelector('#view-state');
    const answer = document.querySelector('#vector-answer');
    const componentSums = document.querySelector('#component-sums');

    const origin = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const sum = new THREE.Vector3();
    const bStart = new THREE.Vector3();
    const bEnd = new THREE.Vector3();
    const sumEnd = new THREE.Vector3();
    const sumFloor = new THREE.Vector3();
    const labelPoint = new THREE.Vector3();
    const ray = new THREE.Vector3();
    let span = 0;
    let position = 0;
    let playback = null;

    function world(target, [x, y, z]) {
        return target.set(x, z, -y);
    }

    function makeLine(material) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
        if (material.isLineDashedMaterial) {
            geometry.setAttribute('lineDistance', new THREE.BufferAttribute(new Float32Array(2), 1));
        }
        const line = new THREE.Line(geometry, material);
        line.frustumCulled = false;
        view.scene.add(line);
        return line;
    }

    function setLine(line, start, end) {
        const positions = line.geometry.getAttribute('position');
        positions.setXYZ(0, start.x, start.y, start.z);
        positions.setXYZ(1, end.x, end.y, end.z);
        positions.needsUpdate = true;
        const distance = line.geometry.getAttribute('lineDistance');
        if (distance) {
            distance.setX(1, start.distanceTo(end));
            distance.needsUpdate = true;
        }
    }

    function makeArrow(color) {
        const direction = new THREE.Vector3(1, 0, 0);
        const arrow = new THREE.ArrowHelper(direction, origin, 1, color);
        arrow.cone.material.transparent = true;
        const shaft = new THREE.Mesh(
            new THREE.CylinderGeometry(0.033, 0.033, 1, 10),
            new THREE.MeshBasicMaterial({ color, transparent: true }),
        );
        arrow.line.visible = false;
        arrow.add(shaft);
        view.scene.add(arrow);
        return { arrow, shaft };
    }

    function setArrow({ arrow, shaft }, start, end, scale, opacity = 1) {
        ray.subVectors(end, start);
        const length = ray.length();
        arrow.visible = length > 0.001 && opacity > 0.001;
        if (!arrow.visible) return;
        const head = Math.min(length * 0.36, scale * 0.24);
        const shaftLength = length - head * 0.82;
        arrow.position.copy(start);
        arrow.setDirection(ray.divideScalar(length));
        arrow.setLength(length, head, head * 0.66);
        shaft.position.y = shaftLength / 2;
        shaft.scale.set(scale, shaftLength, scale);
        shaft.material.opacity = opacity;
        arrow.cone.material.opacity = opacity;
    }

    const aArrow = makeArrow(aColor);
    const bArrow = makeArrow(bColor);
    const sumArrow = makeArrow(sumColor);
    const zero = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: sumColor }));
    view.scene.add(zero);

    const bGuide = makeLine(new THREE.LineDashedMaterial({ color: bColor, transparent: true, opacity: 0.48 }));
    const aGuide = makeLine(new THREE.LineDashedMaterial({ color: aColor, transparent: true, opacity: 0.5 }));
    const heightGuide = makeLine(new THREE.LineDashedMaterial({ color: sumColor, transparent: true, opacity: 0.54 }));
    const axisInfo = [
        { name: 'x', color: '#9d565a', direction: new THREE.Vector3(1, 0, 0) },
        { name: 'y', color: '#596aa8', direction: new THREE.Vector3(0, 0, -1) },
        { name: 'z', color: '#447862', direction: new THREE.Vector3(0, 1, 0) },
    ];
    axisInfo.forEach(axis => {
        axis.positive = makeArrow(axis.color);
        axis.negative = makeLine(new THREE.LineBasicMaterial({ color: axis.color, transparent: true, opacity: 0.29 }));
        view.addLabel(axis.name, axis.color, () => labelPoint.copy(axis.direction).multiplyScalar(span + 0.55));
    });
    view.addLabel('O', '#536581', () => origin, () => true, [-9, 11]);
    view.addLabel('A', aColor, () => labelPoint.copy(a).multiplyScalar(0.64), () => a.lengthSq() > 0, [-8, -8]);
    view.addLabel('B', bColor, () => labelPoint.copy(bStart).lerp(bEnd, 0.66), () => b.lengthSq() > 0, [9, 8]);
    view.addLabel('A + B', sumColor, () => sumEnd, () => position > 1.85, [4, -12]);

    let grid;
    function updateAxes() {
        const limit = Math.max(...a.toArray().map(Math.abs), ...b.toArray().map(Math.abs), ...sum.toArray().map(Math.abs));
        const nextSpan = Math.max(3, limit + 1);
        if (nextSpan === span) return;
        span = nextSpan;
        if (grid) {
            view.scene.remove(grid);
            grid.geometry.dispose();
            grid.material.dispose();
        }
        grid = new THREE.GridHelper(span * 2, span * 2, 0xa2b4d0, 0xc6d3e6);
        grid.position.y = -0.012;
        grid.material.transparent = true;
        grid.material.opacity = 0.75;
        view.scene.add(grid);

        for (const axis of axisInfo) {
            setArrow(axis.positive, origin, ray.copy(axis.direction).multiplyScalar(span), 0.53, 0.65);
            setLine(axis.negative, labelPoint.copy(axis.direction).multiplyScalar(-span), origin);
        }

        for (const line of [bGuide, aGuide, heightGuide]) {
            line.material.dashSize = span * 0.04;
            line.material.gapSize = span * 0.025;
        }
        view.fit(span * 2.94, span * 2.54);
    }

    function render() {
        const translated = easeMotion(Math.min(position, 1));
        const result = easeMotion(Math.max(0, Math.min((position - 1.16) / 0.84, 1)));
        const size = 0.65 + span * 0.09;
        bStart.copy(a).multiplyScalar(translated);
        bEnd.copy(bStart).add(b);
        sumEnd.copy(sum).multiplyScalar(result);

        setArrow(aArrow, origin, a, size);
        setArrow(bArrow, bStart, bEnd, size);
        setArrow(sumArrow, origin, sumEnd, size, result);
        zero.visible = result > 0.85 && sum.lengthSq() === 0;

        setLine(bGuide, origin, b);
        bGuide.visible = translated > 0.12 && a.lengthSq() > 0 && b.lengthSq() > 0;
        setLine(aGuide, b, sum);
        aGuide.visible = result > 0.12 && bGuide.visible;
        sumFloor.set(sum.x, 0, sum.z);
        setLine(heightGuide, sumFloor, sum);
        heightGuide.visible = result > 0.85 && sum.y !== 0;
        view.invalidate();

        const step = Math.round(position);
        steps.forEach((button, index) => button.setAttribute('aria-pressed', String(step === index)));
        const status = ['原点から表示', 'BをAの先端へ平行移動', '原点からA + Bへ'][step];
        if (state.textContent !== status) state.textContent = status;
        play.classList.toggle('is-playing', Boolean(playback));
        playLabel.textContent = playback ? '一時停止' : position === 2 ? 'もう一度再生' : '再生';
    }

    function setPosition(value) {
        position = value;
        render();
    }

    function stop() {
        playback?.();
        playback = null;
    }

    function changeStep(target) {
        stop();
        if (reducedMotion.matches || target === position) {
            setPosition(target);
            return;
        }
        playback = animateValue(position, target, 1080 * Math.abs(target - position), setPosition, () => {
            playback = null;
            render();
        });
        render();
    }

    function updateVectors() {
        const first = values.slice(0, 3);
        const second = values.slice(3);
        const totals = first.map((value, index) => value + second[index]);
        world(a, first);
        world(b, second);
        sum.copy(a).add(b);
        const signed = value => value < 0 ? `−${-value}` : String(value);
        answer.value = `(${totals.map(signed).join(', ')})`;
        componentSums.textContent = `(${first.map((value, index) => {
            const other = second[index];
            return `${signed(value)} ${other < 0 ? '−' : '+'} ${Math.abs(other)}`;
        }).join(', ')})`;
        updateAxes();
        render();
    }

    inputs.forEach((input, index) => {
        input.addEventListener('input', () => {
            const value = input.valueAsNumber;
            if (input.validity.valid && Number.isInteger(value)) {
                values[index] = value;
                updateVectors();
            }
        });
        input.addEventListener('change', () => {
            const value = input.valueAsNumber;
            values[index] = Number.isFinite(value) ? Math.max(-5, Math.min(5, Math.round(value))) : values[index];
            input.value = String(values[index]);
            updateVectors();
        });
    });
    steps.forEach(button => button.addEventListener('click', () => changeStep(Number(button.dataset.step))));
    resetValues.addEventListener('click', () => {
        inputs.forEach((input, index) => {
            values[index] = initial[index];
            input.value = String(values[index]);
        });
        updateVectors();
    });
    play.addEventListener('click', () => {
        if (playback) {
            stop();
            render();
            return;
        }
        if (position === 2) setPosition(0);
        changeStep(2);
    });
    resetView.addEventListener('click', view.reset);
    updateVectors();
})();
