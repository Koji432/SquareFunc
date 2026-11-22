(() => {
    const viewport = document.querySelector('#viewport');
    const direction = [0.93, 0.72, 1.42];
    const view = mountScene(viewport, { direction, width: 18, height: 11 });
    const slider = document.querySelector('#assembly');
    const play = document.querySelector('#play');
    const playLabel = document.querySelector('#play-label');
    const progressValue = document.querySelector('#progress-value');
    const state = document.querySelector('#view-state');
    const note = document.querySelector('#inspect-note');
    const sizeButtons = [...document.querySelectorAll('[data-size]')];
    const pieceButtons = [...document.querySelectorAll('[data-piece]')];
    const returnButton = document.querySelector('#return-piece');
    const nextButton = document.querySelector('#next-piece');
    const resetView = document.querySelector('#reset-view');

    if (!view) {
        [...sizeButtons, slider, play, resetView].forEach(control => { control.disabled = true; });
        return;
    }

    const colors = ['#79a6ff', '#52e0c7', '#fa8caa', '#b098ff', '#ffcc75', '#64cce9'];
    const world = new THREE.Group();
    view.scene.add(world);
    view.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x667497, 0.92));
    const keyLight = new THREE.DirectionalLight(0xf2f7ff, 0.85);
    keyLight.position.set(4, 8, 5);
    view.scene.add(keyLight);

    const cubeGeometry = new THREE.BoxGeometry(0.975, 0.975, 0.975);
    const cubeEdges = new THREE.EdgesGeometry(cubeGeometry);
    const edges = new THREE.LineBasicMaterial({ color: 0x101a33, transparent: true, opacity: 0.56 });
    const ghostEdges = new THREE.LineBasicMaterial({ color: 0xe0e8ff, transparent: true, opacity: 0.46 });
    const materials = colors.map(color => new THREE.MeshLambertMaterial({ color }));
    const frameMaterial = new THREE.LineBasicMaterial({ color: 0xafc1ec, transparent: true, opacity: 0.42 });
    const forward = new THREE.Vector3(...direction).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    const up = new THREE.Vector3().crossVectors(forward, right).normalize();
    const identity = new THREE.Quaternion();

    let model;
    let box;
    let pieces = [];
    let progress = 0;
    let playback = null;
    let playbackTarget = 1;
    let activePiece = -1;
    let requestedPiece = -1;
    let slide = null;

    function syncControls() {
        const assembled = progress === 1;
        pieceButtons.forEach((button, index) => {
            button.disabled = !assembled;
            button.setAttribute('aria-pressed', String(assembled && requestedPiece === index));
        });
        returnButton.disabled = !assembled || requestedPiece < 0;
        nextButton.disabled = !assembled;
        const percent = `${Math.round(progress * 100)}%`;
        slider.style.setProperty('--progress', percent);
        progressValue.value = percent;

        const status = assembled
            ? activePiece < 0 ? `合体 · ${model.volume} / ${model.volume} マス` : `ピース ${activePiece + 1} を確認中`
            : progress === 0 ? '分解' : '組み立て中';
        if (state.textContent !== status) state.textContent = status;

        const instructions = !assembled
            ? '合体すると、ピースを横に引き出せます。'
            : requestedPiece < 0
                ? '番号を選ぶと、ピースが横に抜けます。'
                : `ピース ${requestedPiece + 1} · 立方体 ${model.cubesPerPiece} 個`;
        if (note.textContent !== instructions) note.textContent = instructions;
        play.classList.toggle('is-playing', Boolean(playback));
        playLabel.textContent = playback ? '一時停止' : playbackTarget === 0 ? '分解する' : '組み立てる';
    }

    function updateModel() {
        const t = easeMotion(progress);
        for (const [index, piece] of pieces.entries()) {
            piece.group.position.lerpVectors(piece.start, piece.end, t);
            piece.group.quaternion.slerpQuaternions(piece.startRotation, identity, t);
            piece.group.position.x += piece.distance * piece.offset;
            piece.ghost.visible = index === activePiece && piece.offset > 0.02;
        }
        box.visible = progress > 0.77;
        frameMaterial.opacity = 0.42 * (progress - 0.77) / 0.23;
        view.invalidate();
    }

    function clearInspection() {
        slide?.();
        slide = null;
        activePiece = -1;
        requestedPiece = -1;
        pieces.forEach(piece => { piece.offset = 0; });
    }

    function setProgress(value) {
        progress = value;
        if (value < 1 && activePiece >= 0) clearInspection();
        if (value === 0) playbackTarget = 1;
        if (value === 1) playbackTarget = 0;
        slider.value = String(Math.round(value * 1000));
        updateModel();
        syncControls();
    }

    function inspect(index) {
        if (progress !== 1) return;
        requestedPiece = index;
        slide?.();
        slide = null;

        function move(pieceIndex, offset, complete) {
            const piece = pieces[pieceIndex];
            const from = piece.offset;
            if (reducedMotion.matches || offset === from) {
                piece.offset = offset;
                updateModel();
                complete();
                return;
            }
            slide = animateValue(0, 1, 390 * Math.abs(offset - from), t => {
                piece.offset = from + (offset - from) * easeMotion(t);
                updateModel();
            }, complete);
        }

        function openRequested() {
            activePiece = requestedPiece;
            if (activePiece >= 0) move(activePiece, 1, () => { slide = null; });
            updateModel();
            syncControls();
        }

        if (activePiece >= 0 && activePiece !== requestedPiece) {
            move(activePiece, 0, openRequested);
        } else {
            openRequested();
        }
        syncControls();
    }

    function build(n) {
        playback?.();
        playback = null;
        clearInspection();
        pieces.forEach(piece => {
            piece.removeLabel();
            piece.outline.dispose();
            piece.cubes.dispose();
        });
        box?.geometry.dispose();
        world.clear();
        model = packPyramids(n);
        const center = new THREE.Vector3((model.width - 1) / 2, (model.height - 1) / 2, (model.depth - 1) / 2);
        const point = new THREE.Vector3();
        const labelPoint = new THREE.Vector3();
        const spacing = n * 1.72 + 0.35;
        const rowSpacing = n * 1.60 + 0.33;
        const boxHalfWidth = (model.width * Math.abs(right.x) + model.depth * Math.abs(right.z)) / 2;
        const cubeHalfWidth = (Math.abs(right.x) + Math.abs(right.z)) * 0.975 / 2;
        const templateEdges = cubeEdges.getAttribute('position');
        let viewHalfWidth = (5.9 * n + 0.6) / 2;

        pieces = model.pieces.map(({ blocks, rotation, side }, index) => {
            const group = new THREE.Group();
            const end = new THREE.Vector3();
            const centers = blocks.map(block => new THREE.Vector3(...block).sub(center));
            centers.forEach(position => end.add(position));
            end.divideScalar(blocks.length);

            const projections = centers.map(position => position.dot(right));
            const min = Math.min(...projections) - cubeHalfWidth;
            const max = Math.max(...projections) + cubeHalfWidth;
            const gap = 0.22 * n + 0.25;
            // In the initial view the drawn piece clears the silhouette of the prism.
            const shift = side < 0 ? -boxHalfWidth - gap - max : boxHalfWidth + gap - min;
            const distance = shift / right.x;
            viewHalfWidth = Math.max(viewHalfWidth, Math.abs(min + shift) + gap, Math.abs(max + shift) + gap);

            const cubes = new THREE.InstancedMesh(cubeGeometry, materials[index], blocks.length);
            cubes.frustumCulled = false;
            const transform = new THREE.Matrix4();
            const positions = new Float32Array(blocks.length * templateEdges.count * 3);
            centers.forEach((position, blockIndex) => {
                point.copy(position).sub(end);
                cubes.setMatrixAt(blockIndex, transform.makeTranslation(point.x, point.y, point.z));
                for (let vertex = 0; vertex < templateEdges.count; vertex++) {
                    const offset = (blockIndex * templateEdges.count + vertex) * 3;
                    positions[offset] = templateEdges.getX(vertex) + point.x;
                    positions[offset + 1] = templateEdges.getY(vertex) + point.y;
                    positions[offset + 2] = templateEdges.getZ(vertex) + point.z;
                }
            });
            const outline = new THREE.BufferGeometry();
            outline.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const ghost = new THREE.LineSegments(outline, ghostEdges);
            group.add(cubes, new THREE.LineSegments(outline, edges));

            const [a, b, c, d, e, f, g, h, i] = rotation;
            const matrix = new THREE.Matrix4().set(a, b, c, 0, d, e, f, 0, g, h, i, 0, 0, 0, 0, 1);
            const startRotation = new THREE.Quaternion().setFromRotationMatrix(matrix).invert();
            const start = right.clone().multiplyScalar((index % 3 - 1) * spacing);
            start.addScaledVector(up, (0.5 - Math.floor(index / 3)) * rowSpacing);
            ghost.position.copy(end);
            world.add(group, ghost);

            const removeLabel = view.addLabel(String(index + 1), colors[index], () => {
                return labelPoint.copy(group.position).addScaledVector(up, -n * 0.60 - 0.27);
            }, () => progress < 0.04 || activePiece === index && progress === 1 && pieces[index].offset > 0.75);
            return { group, ghost, cubes, outline, start, end, startRotation, distance, offset: 0, removeLabel };
        });

        const boxShape = new THREE.BoxGeometry(model.width, model.height, model.depth);
        box = new THREE.LineSegments(new THREE.EdgesGeometry(boxShape), frameMaterial);
        boxShape.dispose();
        world.add(box);
        sizeButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.size) === n)));
        document.querySelector('#dimensions').textContent = `${model.width} × ${model.height} × ${model.depth}`;
        document.querySelector('#cube-count').firstChild.textContent = `${model.cubesPerPiece} `;
        view.fit(viewHalfWidth * 2, 3.85 * n + 0.75);
        view.reset();
        setProgress(0);
    }

    sizeButtons.forEach(button => button.addEventListener('click', () => {
        if (button.getAttribute('aria-pressed') !== 'true') build(Number(button.dataset.size));
    }));
    pieceButtons.forEach((button, index) => button.addEventListener('click', () => {
        inspect(requestedPiece === index ? -1 : index);
    }));
    returnButton.addEventListener('click', () => inspect(-1));
    nextButton.addEventListener('click', () => inspect((requestedPiece + 1) % pieces.length));
    resetView.addEventListener('click', view.reset);
    slider.addEventListener('input', () => {
        playback?.();
        playback = null;
        setProgress(Number(slider.value) / 1000);
    });
    play.addEventListener('click', () => {
        if (playback) {
            playback();
            playback = null;
            syncControls();
            return;
        }

        const target = playbackTarget;
        if (target === 0 && activePiece >= 0) {
            clearInspection();
            updateModel();
        }
        if (reducedMotion.matches) {
            setProgress(target);
            return;
        }

        playback = animateValue(progress, target, 1800 * Math.abs(progress - target), setProgress, () => {
            playback = null;
            syncControls();
        });
        syncControls();
    });

    build(3);
})();
