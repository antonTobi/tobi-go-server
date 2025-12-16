// Define colors for stones (1-5: black, white, red, yellow, cobalt)
// Note: We use "Cobalt" instead of "Blue" to have a unique first ltter for each color.
const stoneColors = [
    null,
    [50, 50, 50],        // 1: Black
    [255, 255, 255],     // 2: White
    [220, 50, 50],       // 3: Red
    [250, 250, 20],      // 4: Yellow
    [50, 100, 220],      // 5: Cobalt
];

const strokeColors = [
    null,
    [25, 25, 25],        // 1: Black stroke
    [200, 200, 200],     // 2: White stroke
    [150, 30, 30],       // 3: Red stroke
    [150, 140, 10],      // 4: Yellow stroke
    [30, 60, 150],       // 5: Cobalt stroke
];

const markerColors = [
    null,
    [255, 255, 255],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
];

const boardColor = [255, 193, 140]
const gridColor = [64, 48, 35]

class Node {
    constructor(x, y) {
        this.x = x
        this.y = y
        this.color = 0
        this.hoshi = false
        this.neighbors = []
    }
}

class Board {
    // Main factory method that creates a board from a settings object
    // TODO: merge constructor and fromSettings into a single constructor, get rid of duplicate advanceMoveOrder
    static fromSettings(settings) {
        const { boardType, boardWidth, boardHeight, pregameSequence, turnCycle, presetStones, coupons } = settings;

        let board;
        switch (boardType) {
            case 'grid':
                board = this.grid(boardWidth, boardHeight);
                break;
            case 'star':
                board = this.star(boardWidth);
                break;
            case 'dodecagon':
                board = this.dodecagon(boardWidth);
                break;
            case 'rotatedGrid':
                board = this.rotatedGrid(boardWidth, boardHeight);
                break;
            case 'hexagon':
                board = this.hexagon(boardWidth);
                break;
            default:
                board = this.grid(9, 9);
        }

        // Apply pregame sequence if provided
        if (pregameSequence) {
            board.queue = orderFromString(pregameSequence);
        } else {
            board.queue = []
        }

        // Apply turn cycle if provided
        if (turnCycle) {
            board.order = orderFromString(turnCycle);
        }

        // Re-advance move order to pick up pregame sequence or custom turn cycle
        if (pregameSequence || turnCycle) {
            board.advanceMoveOrder();
        }

        // Apply preset stones if provided
        if (presetStones && presetStones.length > 0) {
            presetStones.forEach(stone => {
                const node = board.nodes[stone.i];
                if (node) {
                    node.color = stone.c;
                }
            });
        }

        // Apply list of coupon values if provided
        if (coupons && coupons.length > 0) {
            board.coupons = coupons
        }

        return board;
    }

    static grid(w, h = w) {
        let nodes = [];
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                nodes.push(new Node(x, y))
            }
        }

        let hoshi = []
        if (w === 19 && h === 19) {
            hoshi = [60, 66, 72, 174, 180, 186, 174, 288, 294, 300]
        } else if (w === 9 && h === 9) {
            hoshi = [40]
        }

        for (let i of hoshi) {
            nodes[i].hoshi = true
        }

        return new this({ nodes });
    }

    static hexagon(n) {
        let coordinates = []
        n -= 1;
        for (let i = 0; i < 2 * n + 1; i++) {
            for (let j = 0; j < 2 * n + 1; j++) {
                if (n <= i + j && i + j <= 3 * n) {
                    coordinates.push(
                        [1, 0].times(i).plus(
                            [1 / 2, Math.sqrt(3) / 2].times(j)
                        )
                    )
                }

            }
        }
        let nodes = coordinates.map(c => new Node(...c))
        return new this({ nodes })
    }

    static star(n) {
        let coordinates = [[0, 0]];
        for (let i = 0; i < 5; i++) {
            let a = [0, 1].rotate((i * TAU) / 5);
            let b = a.rotate(TAU / 5);
            for (let j = 1; j < n; j++) {
                for (let k = 0; k < n; k++) {
                    coordinates.push(a.times(j).plus(b.times(k)));
                }
            }
        }
        let nodes = coordinates.map(c => new Node(...c))
        return new this({ nodes });
    }

    static dodecagon(k) {
        k = 2 * (k - 1);

        function spike(k) {
            let c = [];
            let o = [0, 0];
            let h = 1;
            for (let i = 0; i < k; i++) {
                for (let j = 0; j < h; j++) {
                    c.push(o.plus([0, 1].times(j)));
                }
                if (i % 2) {
                    o.add([Math.sqrt(3) / 2, -1 / 2]);
                    h++;
                } else {
                    o.add([1, 0]);
                }
            }
            return c;
        }

        let coordinates = [];
        for (let i = 0; i < 6; i++) {
            let t = (TAU / 6) * i;
            for (let p of spike(k)) {
                coordinates.push(p.plus([Math.sqrt(3) / 2, 1 / 2]).rotate(t));
            }
        }
        for (let i = 0; i < 6; i++) {
            let t = (TAU / 6) * (i + 0.5);
            for (let p of spike(k - 1)) {
                coordinates.push(p.plus([1 + Math.sqrt(3) / 2, 1 / 2]).rotate(t));
            }
        }
        let nodes = coordinates.map(c => new Node(...c))
        return new this({ nodes });
    }

    static rotatedGrid(w, h = w) {
        let coordinates = [];
        let e1 = [Math.sqrt(2), 0];
        let e2 = [0, Math.sqrt(2)];

        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                coordinates.push(e1.times(x).plus(e2.times(y)));
            }
        }

        let e3 = e1.plus(e2).over(2);
        for (let x = 0; x < w - 1; x++) {
            for (let y = 0; y < h - 1; y++) {
                coordinates.push(e1.times(x).plus(e2.times(y)).plus(e3));
            }
        }

        let nodes = coordinates.map(c => new Node(...c))
        return new this({ nodes });
    }

    constructor({ nodes, initial = "", order = "B,W" }) {
        this.nodes = nodes;

        nodes.forEach((node, index) => {
            node.i = index
        })

        this.queue = orderFromString(initial)
        this.order = orderFromString(order)


        // Calculate bounding box and initialize nodes
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (let { x, y } of nodes) {
            minX = Math.min(minX, x - 1);
            minY = Math.min(minY, y - 1);
            maxX = Math.max(maxX, x + 1);
            maxY = Math.max(maxY, y + 1);
        }

        this.boundingBox = { minX, minY, maxX, maxY };
        this.width = maxX - minX;
        this.height = maxY - minY;

        // Calculate neighbors
        for (let i = 0; i < this.nodes.length; i++) {
            let a = this.nodes[i];
            for (let j = i + 1; j < this.nodes.length; j++) {
                let b = this.nodes[j];
                let distSq = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
                if (Math.abs(distSq - 1) < 0.01) {
                    a.neighbors.push(b);
                    b.neighbors.push(a);
                }
            }
        }

        // Transform properties (set by calculateTransform)
        this.scale = 100;
        this.offsetX = 0;
        this.offsetY = 0;
        this.sw = 2; // strokeWeight for stones
        this.sp = 5; // diameter for starpoints

        this.advanceMoveOrder()
        this.moveHistory = []
    }

    advanceMoveOrder() {
        if (!this.queue.length) {
            this.queue = [...this.order]
        }
        this.currentMove = this.queue.shift()
    }

    calculateTransform(canvasWidth, canvasHeight) {
        this.scale = Math.floor(Math.min(
            canvasWidth / this.width,
            canvasHeight / this.height
        ));
        this.offsetX = -this.boundingBox.minX * this.scale +
            Math.round((canvasWidth - this.scale * this.width) / 2);
        this.offsetY = -this.boundingBox.minY * this.scale +
            Math.round((canvasHeight - this.scale * this.height) / 2);
        this.sw = 0.05 * this.scale;
        this.sp = Math.max(0.2 * this.scale, 3);
    }

    boardToCanvas(x, y) {
        return [
            this.scale * x + this.offsetX,
            this.scale * y + this.offsetY
        ];
    }

    canvasToBoard(canvasX, canvasY) {
        return [
            (canvasX - this.offsetX) / this.scale,
            (canvasY - this.offsetY) / this.scale
        ];
    }

    findHover(mouseX, mouseY, checkFromColor = true) {
        let [mx, my] = this.canvasToBoard(mouseX, mouseY);
        let closestNode = null;
        let minDistSq = 0.5;

        for (let node of this.nodes) {
            let distSq = (node.x - mx) ** 2 + (node.y - my) ** 2;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                closestNode = node;
            }
        }

        if (closestNode && (checkFromColor === false || closestNode.color === this.currentMove.from)) {
            return closestNode;
        }
        return null;
    }

    placeStone(i, c = this.currentMove.to) {
        let color = this.currentMove.to
        let node = this.nodes[i];
        if (!node || node.color) return false;

        node.color = c;
        this.advanceMoveOrder()
        this.moveHistory.push({ i, c })

        // Capture opponent stones
        let capturedChains = [];
        for (let neighbor of node.neighbors) {
            if (neighbor.color && neighbor.color !== color) {
                let chain = this.findChainIfDead(neighbor);
                if (chain.length > 0) {
                    capturedChains.push(chain);
                }
            }
        }

        for (let chain of capturedChains) {
            for (let stone of chain) {
                stone.color = 0;
            }
        }

        // Check for suicide (remove own stone if no liberties)
        let ownChain = this.findChainIfDead(node);
        if (ownChain.length > 0) {
            for (let stone of ownChain) {
                stone.color = 0;
            }
        }

        return true;
    }

    pass(c = this.currentMove.to) {
        // A pass simply advances the move order without placing a stone
        this.advanceMoveOrder();
        this.moveHistory.push({ i: -1, c });
    }

    // Find all stones of the same color that are in the same "region"
    // A region is defined by chains connected through empty intersections
    // (but not across enemy stones)
    findChainsInRegion(stone) {
        if (stone.color <= 0) return [];

        const color = stone.color;
        const visited = new Set();
        const regionStones = [];
        const stack = [stone];

        while (stack.length) {
            const current = stack.pop();
            if (visited.has(current)) continue;
            visited.add(current);

            if (current.color === color) {
                // This is a stone of our color - add to result
                regionStones.push(current);
                // Explore all neighbors
                for (const neighbor of current.neighbors) {
                    if (!visited.has(neighbor)) {
                        stack.push(neighbor);
                    }
                }
            } else if (current.color === 0) {
                // Empty intersection - continue exploring through it
                for (const neighbor of current.neighbors) {
                    if (!visited.has(neighbor)) {
                        stack.push(neighbor);
                    }
                }
            }
            // If current.color is enemy color, don't explore further
        }

        return regionStones;
    }

    // Get the canonical representative (lowest index) from a list of stones
    getCanonicalRepresentative(stones) {
        if (stones.length === 0) return null;
        return Math.min(...stones.map(s => s.i));
    }

    findChainIfDead(stone) {
        if (stone.color <= 0) return [];
        let visited = new Set();
        let stack = [stone];
        visited.add(stone);
        let color = stone.color;

        while (stack.length) {
            let current = stack.pop();
            for (let neighbor of current.neighbors) {
                if (!visited.has(neighbor)) {
                    if (neighbor.color === 0) {
                        return []; // Found liberty, chain is alive
                    } else if (neighbor.color === color) {
                        stack.push(neighbor);
                        visited.add(neighbor);
                    }
                }
            }
        }

        return Array.from(visited); // No liberties found, return dead chain
    }

    // Compute a map from each stone's index to its canonical representative
    // This should be called once when entering scoring mode
    computeCanonicalIndexMap() {
        const map = {};
        const visited = new Set();

        for (const node of this.nodes) {
            if (node.color <= 0 || visited.has(node.i)) continue;

            const regionStones = this.findChainsInRegion(node);
            const canonicalIndex = this.getCanonicalRepresentative(regionStones);

            for (const stone of regionStones) {
                map[stone.i] = canonicalIndex;
                visited.add(stone.i);
            }
        }

        return map;
    }

    // Check if a stone is in a dead chain (for scoring display)
    // Uses precomputed canonicalIndexMap for efficiency
    isInDeadChain(node, deadChains, canonicalIndexMap) {
        if (!deadChains || !canonicalIndexMap || node.color <= 0) return false;

        const canonicalIndex = canonicalIndexMap[node.i];
        return canonicalIndex !== undefined && deadChains[canonicalIndex] === true;
    }

    // Calculate territory for scoring
    // Returns a map: { nodeIndex: ownerColor } where ownerColor is 1-5 or 0 (neutral/contested)
    // - Alive stones belong to their own color
    // - Dead stones and empty intersections belong to the player that surrounds the region
    // - If multiple colors surround a region, it's neutral (0)
    calculateTerritory(deadChains, canonicalIndexMap) {
        const territory = {};
        const visited = new Set();

        for (const node of this.nodes) {
            if (node.color === -1) continue; // Skip removed nodes
            if (visited.has(node.i)) continue;

            const isDead = this.isInDeadChain(node, deadChains, canonicalIndexMap);

            if (node.color > 0 && !isDead) {
                // Alive stone - belongs to its own color
                territory[node.i] = node.color;
                visited.add(node.i);
            } else {
                // Empty or dead stone - find the region and check surrounding colors
                const region = [];
                const surroundingColors = new Set();
                const stack = [node];
                const regionVisited = new Set();

                while (stack.length > 0) {
                    const current = stack.pop();
                    if (regionVisited.has(current.i)) continue;
                    if (current.color === -1) continue;

                    const currentIsDead = this.isInDeadChain(current, deadChains, canonicalIndexMap);

                    if (current.color === 0 || currentIsDead) {
                        // Empty or dead - part of this region
                        regionVisited.add(current.i);
                        region.push(current);

                        for (const neighbor of current.neighbors) {
                            if (!regionVisited.has(neighbor.i)) {
                                stack.push(neighbor);
                            }
                        }
                    } else {
                        // Alive stone of some color - this color surrounds the region
                        surroundingColors.add(current.color);
                    }
                }

                // Determine owner: if exactly one color surrounds, that color owns it
                // Otherwise it's neutral (0)
                const owner = surroundingColors.size === 1
                    ? Array.from(surroundingColors)[0]
                    : 0;

                for (const regionNode of region) {
                    territory[regionNode.i] = owner;
                    visited.add(regionNode.i);
                }
            }
        }

        return territory;
    }

    // Check if a stone's chain has 0 or 1 liberties (is dead or in atari)
    isInAtari(stone) {
        if (stone.color <= 0) return false;

        let visited = new Set();
        let stack = [stone];
        visited.add(stone);
        let color = stone.color;
        let libertyCount = 0;
        let libertiesFound = new Set();

        while (stack.length) {
            let current = stack.pop();
            for (let neighbor of current.neighbors) {
                if (!visited.has(neighbor)) {
                    if (neighbor.color === 0) {
                        // Found a liberty
                        if (!libertiesFound.has(neighbor)) {
                            libertiesFound.add(neighbor);
                            libertyCount++;
                            if (libertyCount > 1) {
                                return false; // More than 1 liberty, not in atari
                            }
                        }
                    } else if (neighbor.color === color) {
                        stack.push(neighbor);
                        visited.add(neighbor);
                    }
                }
            }
        }

        return true; // 0 or 1 liberties
    }

    // check whether a placement would be suicidal
    isSuicide(node, color) {
        let currentColor = node.color

        // Temporarily place the stone
        node.color = color;

        // Check if this move captures any enemy stones
        let capturesEnemy = false;
        for (let neighbor of node.neighbors) {
            if (neighbor.color > 0 && neighbor.color !== color) {
                let chain = this.findChainIfDead(neighbor);
                if (chain.length > 0) {
                    capturesEnemy = true;
                    break;
                }
            }
        }

        // If we capture enemy stones, it's not suicide
        if (capturesEnemy) {
            node.color = 0; // Restore
            return false;
        }

        // Check if our own stone/chain would be dead
        let ownChain = this.findChainIfDead(node);
        const isSuicidal = ownChain.length > 0;

        // Restore the board state
        node.color = currentColor;

        return isSuicidal;
    }

    // check whether a placement would be self-atari (or suicide)
    // Returns true if the resulting chain would have 0 or 1 liberties
    isSelfAtari(node, color) {
        let currentColor = node.color;

        // Temporarily place the stone
        node.color = color;

        // Check if this move captures any enemy stones - if so, it's not self-atari
        for (let neighbor of node.neighbors) {
            if (neighbor.color > 0 && neighbor.color !== color) {
                let chain = this.findChainIfDead(neighbor);
                if (chain.length > 0) {
                    node.color = currentColor;
                    return false;
                }
            }
        }

        // Check if our own stone/chain is in atari (0 or 1 liberties)
        const inAtari = this.isInAtari(node);

        // Restore the original node
        node.color = currentColor;

        return inAtari;
    }

    draw(p, deadChains = null, canonicalIndexMap = null, territory = null) {
        const align = (val) => Math.round(val + 0.5) - 0.5;
        p.push();
        p.translate(this.offsetX, this.offsetY);

        // Draw edges
        p.stroke(...gridColor);
        p.strokeWeight(1);
        for (let a of this.nodes) {
            if (a.color === -1) continue
            for (let b of a.neighbors) {
                if (b.color === -1) continue
                if (a.i < b.i) {
                    p.line(
                        align(this.scale * a.x),
                        align(this.scale * a.y),
                        align(this.scale * b.x),
                        align(this.scale * b.y)
                    );
                }
            }
        }


        // Draw starpoints
        p.noStroke();
        p.fill(...gridColor);
        for (let node of this.nodes) {
            if (node.hoshi) {
                p.circle(align(node.x * this.scale), align(node.y * this.scale), this.sp);
            }
        }

        // Draw stones
        p.strokeWeight(this.sw);
        for (let node of this.nodes) {
            if (node.color > 0) {
                const isDead = this.isInDeadChain(node, deadChains, canonicalIndexMap);
                if (isDead) {
                    // Draw dead stones as ghost stones (semi-transparent)
                    p.fill(...stoneColors[node.color], 127);
                    // p.noStroke()
                    // p.stroke(...strokeColors[node.color], 127);
                } else {
                    p.fill(...stoneColors[node.color]);
                    // p.stroke(...strokeColors[node.color]);
                }
                p.stroke(...strokeColors[node.color]);
                p.circle(node.x * this.scale, node.y * this.scale, this.scale - this.sw);
            }
        }

        // Draw last-move marker
        // Don't draw in scoring mode
        if (!territory && this.moveHistory && this.moveHistory.length) {
            let lastPlaced = null;
            for (let k = this.moveHistory.length - 1; k >= 0; k--) {
                if (this.moveHistory[k]?.i >= 0) {
                    lastPlaced = this.moveHistory[k];
                    break;
                }
            }

            if (lastPlaced) {
                const lastNode = this.nodes[lastPlaced.i];
                const lastColor = lastNode?.color;
                if (lastNode && lastColor > 0) {
                    const markerSize = this.scale * 0.5;
                    p.noFill()
                    p.stroke(...markerColors[lastColor]);
                    p.circle(
                        lastNode.x * this.scale,
                        lastNode.y * this.scale,
                        markerSize
                    );
                }
            }
        }

        // Draw territory markers (small circles on empty/dead intersections)
        if (territory) {
            const markerSize = this.scale * 0.3;
            p.noStroke();
            for (let node of this.nodes) {
                if (node.color === -1) continue;
                const owner = territory[node.i];
                if (owner > 0) {
                    const isDead = this.isInDeadChain(node, deadChains, canonicalIndexMap);
                    // Draw marker on empty intersections or dead stones
                    if (node.color === 0 || isDead) {
                        p.fill(...stoneColors[owner]);
                        p.circle(node.x * this.scale, node.y * this.scale, markerSize);
                    }
                }
            }
        }

        p.pop();
    }

    drawGhostStone(node, color, p) {
        if (!node) return;

        p.push();
        p.translate(this.offsetX, this.offsetY);
        p.strokeWeight(this.sw);


        if (color >= 1 && color <= 5) {
            p.fill(...stoneColors[color], 127);
            p.stroke(...strokeColors[color]);
            p.circle(node.x * this.scale, node.y * this.scale, this.scale - this.sw);
        }

        if (color === -1) {
            p.fill(boardColor)
            p.noStroke()
            p.circle(node.x * this.scale, node.y * this.scale, this.scale);
        }

        p.pop();
    }
}

const colorCharToInt = {
    "V": -1,
    "E": 0,
    "B": 1,
    "W": 2,
    "R": 3,
    "Y": 4,
    "C": 5,
}

const playerCharToInt = {
    "X": 0,
    "B": 1,
    "W": 2,
    "R": 3,
    "Y": 4,
    "C": 5,
}

class Move {
    // TODO: support hidden moves (add an "h" at the end of string)
    // TODO: Support lottery go (distribution for toColor)
    static fromString(s) {
        let p, f, t
        p = s[0]
        f = "E"
        t = "B"
        switch (s.length) {
            case 1:
                p = s
                t = s
                break;
            case 2:
                [p, t] = s.split("")
                break;
            case 3:
                [p, f, t] = s.split("")
                break;
            default:
                throw new Error(`Move "${s}" must be 1, 2 or 3 characters (got ${s.length})`);
        }
        let player = playerCharToInt[p]
        let from = colorCharToInt[f]
        let to = colorCharToInt[t]
        if (player === undefined) {
            throw new Error(`Invalid player "${p}" in move "${s}".`);
        }
        if (from === undefined) {
            throw new Error(`Invalid color "${f}" in move "${s}".`);
        }
        if (to === undefined) {
            throw new Error(`Invalid color "${t}" in move "${s}".`);
        }
        return new this({ player, from, to })
    }

    constructor({ player = 1, from = 0, to = 1, hidden = false }) {
        this.player = player
        this.from = from
        this.to = to
        this.hidden = hidden
    }
}

function orderFromString(s) {
    return s.replaceAll(" ", "").split(",").filter(m => m.length).map(m => Move.fromString(m))
}