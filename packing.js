const cubeRotations = [
    [1, 0, 0, 0, 1, 0, 0, 0, 1], [1, 0, 0, 0, 0, -1, 0, 1, 0],
    [1, 0, 0, 0, -1, 0, 0, 0, -1], [1, 0, 0, 0, 0, 1, 0, -1, 0],
    [0, -1, 0, 1, 0, 0, 0, 0, 1], [0, 0, 1, 1, 0, 0, 0, 1, 0],
    [0, 1, 0, 1, 0, 0, 0, 0, -1], [0, 0, -1, 1, 0, 0, 0, -1, 0],
    [-1, 0, 0, 0, -1, 0, 0, 0, 1], [-1, 0, 0, 0, 0, 1, 0, 1, 0],
    [-1, 0, 0, 0, 1, 0, 0, 0, -1], [-1, 0, 0, 0, 0, -1, 0, -1, 0],
    [0, 1, 0, -1, 0, 0, 0, 0, 1], [0, 0, -1, -1, 0, 0, 0, 1, 0],
    [0, -1, 0, -1, 0, 0, 0, 0, -1], [0, 0, 1, -1, 0, 0, 0, -1, 0],
    [0, 0, 1, 0, 1, 0, -1, 0, 0], [0, 1, 0, 0, 0, -1, -1, 0, 0],
    [0, 0, -1, 0, -1, 0, -1, 0, 0], [0, -1, 0, 0, 0, 1, -1, 0, 0],
    [0, 0, -1, 0, 1, 0, 1, 0, 0], [0, 1, 0, 0, 0, 1, 1, 0, 0],
    [0, 0, 1, 0, -1, 0, 1, 0, 0], [0, -1, 0, 0, 0, -1, 1, 0, 0],
];

const packings = new Map();

function packPyramids(n) {
    if (packings.has(n)) return packings.get(n);

    const width = n;
    const height = n + 1;
    const depth = 2 * n + 1;
    const volume = width * height * depth;
    const cellIndex = (x, y, z) => x + width * (y + height * z);
    const pyramid = [];
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n - y; x++) {
            for (let z = 0; z < n - y; z++) {
                pyramid.push([x, y, z]);
            }
        }
    }

    const candidates = Array.from({ length: volume }, () => []);
    const unique = new Set();
    for (const rotation of cubeRotations) {
        const rotated = pyramid.map(([x, y, z]) => [
            rotation[0] * x + rotation[1] * y + rotation[2] * z,
            rotation[3] * x + rotation[4] * y + rotation[5] * z,
            rotation[6] * x + rotation[7] * y + rotation[8] * z,
        ]);
        const minimum = [0, 1, 2].map(axis => Math.min(...rotated.map(block => block[axis])));
        const normalized = rotated.map(block => block.map((value, axis) => value - minimum[axis]));
        normalized.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
        const key = normalized.map(block => block.join(',')).join('|');
        if (unique.has(key)) continue;
        unique.add(key);

        const [maxX, maxY, maxZ] = [0, 1, 2].map(axis => Math.max(...normalized.map(block => block[axis])));
        for (let x = 0; x < width - maxX; x++) {
            for (let y = 0; y < height - maxY; y++) {
                for (let z = 0; z < depth - maxZ; z++) {
                    const blocks = normalized.map(([a, b, c]) => [a + x, b + y, c + z]);
                    const cells = blocks.map(block => cellIndex(...block));
                    const placement = { blocks, rotation, cells };
                    cells.forEach(cell => candidates[cell].push(placement));
                }
            }
        }
    }

    // Exact cover. Search the empty cell with the fewest available placements first.
    const occupied = new Uint8Array(volume);
    const solution = [];
    const fits = placement => placement.cells.every(cell => occupied[cell] === 0);

    function solve() {
        if (solution.length === 6) return occupied.every(Boolean);
        let best;
        for (let cell = 0; cell < volume; cell++) {
            if (occupied[cell]) continue;
            const options = candidates[cell].filter(fits);
            if (!options.length) return false;
            if (!best || options.length < best.length) best = options;
        }

        for (const placement of best ?? []) {
            placement.cells.forEach(cell => { occupied[cell] = solution.length + 1; });
            solution.push(placement);
            if (solve()) return true;
            solution.pop();
            placement.cells.forEach(cell => { occupied[cell] = 0; });
        }
        return false;
    }

    if (!solve()) throw new Error('No complete packing was found.');

    const pieces = solution.map(({ blocks, rotation }, index) => {
        // Check the entire horizontal exit path against the other five pieces.
        const side = [-1, 1].find(direction => blocks.every(([x, y, z]) => {
            for (let column = x + direction; column >= 0 && column < width; column += direction) {
                if (occupied[cellIndex(column, y, z)] !== index + 1) return false;
            }
            return true;
        }));
        if (side === undefined) throw new Error('A piece has no horizontal exit.');
        return { blocks, rotation, side };
    });

    const result = { width, height, depth, volume, pieces, cubesPerPiece: pyramid.length };
    packings.set(n, result);
    return result;
}
