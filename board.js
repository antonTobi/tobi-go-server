// Define colors for stones (1-5: black, white, red, blue, yellow)
const stoneColors = [
    null,
    [50, 50, 50],        // 1: Black
    [255, 255, 255],     // 2: White
    [220, 50, 50],       // 3: Red
    [50, 100, 220],      // 4: Blue
    [220, 200, 50]       // 5: Yellow
];

const strokeColors = [
    null,
    [25, 25, 25],        // 1: Black stroke
    [200, 200, 200],     // 2: White stroke
    [150, 30, 30],       // 3: Red stroke
    [30, 60, 150],       // 4: Blue stroke
    [150, 140, 30]       // 5: Yellow stroke
];

class Node {
    constructor(x, y) {
        this.x = x
        this.y = y
        this.color = 0
        this.hoshi = false
        this.neighbors = []
    }
}

// Board class for Go game
class Board {
    // Factory methods for different board types
    static grid(w, h = w) {
        let nodes = [];
        for (let x = 0; x < w; x++) {
            for (let y = 0; y < h; y++) {
                nodes.push(new Node(x, y))
            }
        }

        // Add starpoints for 19x19 board
        if (w === 19 && h === 19) {
            for (let i of [60, 66, 72, 174, 180, 186, 174, 288, 294, 300]) {
                nodes[i].hoshi = true
            }
        }

        return new Board(nodes);
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
        return new Board(nodes);
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
        return new Board(nodes);
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
        return new Board(nodes);
    }

    constructor(nodes) {
        this.turn = 0;
        this.nodes = nodes;

        nodes.forEach((node, index) => {
            node.i = index
        })

        // Calculate bounding box and initialize nodes
        let minX = Infinity, minY = Infinity;
        let maxX = -Infinity, maxY = -Infinity;

        for (let {x, y} of nodes) {
            minX = Math.min(minX, x - 1);
            minY = Math.min(minY, y - 1);
            maxX = Math.max(maxX, x + 1);
            maxY = Math.max(maxY, y + 1);
        }

        this.boundingBox = { minX, minY, maxX, maxY };
        this.width = maxX - minX;
        this.height = maxY - minY;

        // Initialize edges and neighbors
        this.edges = [];
        for (let i = 0; i < this.nodes.length; i++) {
            let a = this.nodes[i];
            for (let j = i + 1; j < this.nodes.length; j++) {
                let b = this.nodes[j];
                let distSq = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
                if (Math.abs(distSq - 1) < 0.01) {
                    this.edges.push([a, b]);
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
    }

    get nextColor() {
        return (this.turn % 2) + 1; // Alternates between 1 (black) and 2 (white)
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

    findHover(mouseX, mouseY) {
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

        if (closestNode && !closestNode.color) {
            return closestNode;
        }
        return null;
    }

    placeStone(nodeIndex, color) {
        let node = this.nodes[nodeIndex];
        if (!node || node.color) return false;

        node.color = color;
        this.turn++;

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

    findChainIfDead(stone) {
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

    draw(p = window) {
        const align = (val) => Math.round(val + 0.5) - 0.5;

        p.push();
        p.translate(this.offsetX, this.offsetY);

        // Draw edges
        p.stroke(60, 40, 0);
        p.strokeWeight(1);
        for (let [a, b] of this.edges) {
            p.line(
                align(this.scale * a.x),
                align(this.scale * a.y),
                align(this.scale * b.x),
                align(this.scale * b.y)
            );
        }

        // Draw starpoints
        p.noStroke();
        p.fill(60, 40, 0);
        for (let node of this.nodes) {
            if (node.hoshi) {
                p.circle(align(node.x * this.scale), align(node.y * this.scale), this.sp);
            }
        }

        // Draw stones
        p.strokeWeight(this.sw);
        for (let node of this.nodes) {
            if (node.color >= 1 && node.color <= 5) {
                p.fill(...stoneColors[node.color]);
                p.stroke(...strokeColors[node.color]);
                p.circle(node.x * this.scale, node.y * this.scale, this.scale - this.sw);
            }
        }

        p.pop();
    }

    drawGhostStone(node, color, p = window) {
        if (!node) return;

        p.push();
        p.translate(this.offsetX, this.offsetY);
        p.strokeWeight(this.sw);


        if (color >= 1 && color <= 5) {
            p.fill(...stoneColors[color], 127);
            p.stroke(...strokeColors[color]);
            p.circle(node.x * this.scale, node.y * this.scale, this.scale - this.sw);
        }

        p.pop();
    }
}
