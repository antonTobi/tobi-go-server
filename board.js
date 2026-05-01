// Key constants for all Firebase-serialized objects.
// Each object type uses its own short keys to save bandwidth.
// Turn (an instruction in a sequence)
const T_PLAYER = "p", T_COLOR = "c", T_HIDDEN = "h";
// Move record (a move that was made)
const M_INDEX = "i", M_TIME_LEFT = "l", M_POWER = "w", M_REVEALED = "r", M_PASS = "s", M_ELIMINATED = "e", M_ELIM_REASON = "er";
// gameSetting
const GS_BOARD_TYPE = "bt", GS_BOARD_SIZE = "bs", GS_PLAYERS = "n", GS_SETUP_STONES = "ss";
const GS_SETUP_TURNS = "st", GS_MAIN_SEQ = "ms", GS_POWERS = "pw", GS_KOMI = "k", GS_TIME_SETTINGS = "ts", GS_LEGALITY_CHECKS = "lc";
// setupTurns / powers entry
const ST_SEQUENCE = "q", ST_REPEAT = "r", PW_USES = "u";
// timeSetting
const TS_MAINTIME = "m", TS_INCREMENT = "i", TS_CAP = "c";
// game state
const G_CLOCKS = "cl", G_MOVES = "mv", G_REQUEST = "rq", G_PHASE = "ph", G_DEAD_CHAINS = "dc", G_REVIEW = "rv";
// request
const RQ_TYPE = "t", RQ_MOVE_NUMBER = "n", RQ_AGREES = "a";

// Define colors for stones (1-5: black, white, red, yellow, blue)
const stoneColors = [
    [255, 193, 140],     // 0: Board color
    [50, 50, 50],        // 1: Black
    [255, 255, 255],     // 2: White
    [220, 50, 50],       // 3: Red
    [250, 250, 20],      // 4: Yellow
    [50, 100, 220],      // 5: Blue
];

stoneColors[-1] = stoneColors[0];

const strokeColors = [
    [64, 48, 35],        // 0: Board line color
    [25, 25, 25],        // 1: Black stroke
    [200, 200, 200],     // 2: White stroke
    [150, 30, 30],       // 3: Red stroke
    [150, 140, 10],      // 4: Yellow stroke
    [30, 60, 150],       // 5: Blue stroke
];

strokeColors[-1] = strokeColors[0];

const markerColors = [
    [0, 0, 0],
    [255, 255, 255],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
];

const boardColor = stoneColors[0]
const gridColor = strokeColors[0]

const align = (val) => Math.round(val + 0.5) - 0.5;

class Node {
    constructor(x, y) {
        this.x = x
        this.y = y
        this.color = 0
        this.hoshi = false
        this.neighbors = []
        this.onlyVisibleTo = null  // if set, only this player number can see this stone
    }
}

class Board {
    // Main factory method that creates a board from an uncompressed gameSetting object.
    // Fields: boardType, boardSize, players, setupStones, setupTurns, mainSequence, powers, komi, timeSettings
    static fromSettings(settings) {
        const {
            boardType = 'grid',
            boardSize = 9,
            setupStones,
            setupTurns,
            mainSequence,
            powers,
            komi,
            timeSettings,
            players,
            legalityChecks,
        } = settings;

        let board;
        switch (boardType) {
            case 'grid': board = this.grid(boardSize); break;
            case 'star': board = this.star(boardSize); break;
            case 'dodecagon': board = this.dodecagon(boardSize); break;
            case 'rotatedGrid': board = this.rotatedGrid(boardSize); break;
            case 'hexagon': board = this.hexagon(boardSize); break;
            default: board = this.grid(9);
        }

        // Main sequence (required)
        if (mainSequence && mainSequence.length) {
            board.order = mainSequence.map(t => new Turn(t));
        } else {
            board.order = [new Turn({ player: 1, color: 1 }), new Turn({ player: 2, color: 2 })];
        }

        // Setup turns: expand [{sequence, repeat}] into a flat internal setupSequence
        if (setupTurns && setupTurns.length) {
            board.setupSequence = [];
            for (const { sequence, repeat } of setupTurns) {
                const r = repeat || 1;
                for (let i = 0; i < r; i++) {
                    for (const t of sequence) {
                        board.setupSequence.push(new Turn(t));
                    }
                }
            }
        }

        // Powers: {playerNum: [{sequence, numberOfUses}]}
        if (powers) {
            for (const [playerNum, powerList] of Object.entries(powers)) {
                const p = parseInt(playerNum);
                board.powers[p] = powerList.map(pw => ({
                    sequence: pw.sequence.map(t => new Turn(t)),
                    usesLeft: pw.numberOfUses,
                }));
            }
        }

        board.komi = komi || {};
        board.timeSettings = timeSettings || null;
        board.numPlayers = players || 2;
        board.legalityChecks = legalityChecks || [];

        // Apply setup stones (direct color assignment, no move logic)
        if (setupStones && setupStones.length) {
            for (const { i, c } of setupStones) {
                if (board.nodes[i]) board.nodes[i].color = c;
            }
        }

        // Initialize the turn order state
        if (board.setupSequence.length > 0) {
            board.currentSequence = { type: 'setup' };
            board.sequenceIndex = 0;
            board.currentTurn = new Turn(board.setupSequence[0]);
        } else {
            board.currentSequence = null;
            board.sequenceIndex = null;
            board.mainIndex = 0;
            board.currentTurn = new Turn(board.order[0]);
        }

        return board;
    }

    static grid(n) {
        let nodes = [];
        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) {
                nodes.push(new Node(x, y))
            }
        }

        let hoshi = []
        if (n === 19) {
            hoshi = [60, 66, 72, 174, 180, 186, 288, 294, 300]
        } else if (n === 13) {
            hoshi = [42, 48, 84, 120, 126]
        } else if (n === 9) {
            hoshi = [20, 24, 40, 56, 60]
        }

        for (let i of hoshi) {
            if (nodes[i]) nodes[i].hoshi = true
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

    static rotatedGrid(n) {
        let coordinates = [];
        let e1 = [Math.sqrt(2), 0];
        let e2 = [0, Math.sqrt(2)];

        for (let x = 0; x < n; x++) {
            for (let y = 0; y < n; y++) {
                coordinates.push(e1.times(x).plus(e2.times(y)));
            }
        }

        let e3 = e1.plus(e2).over(2);
        for (let x = 0; x < n - 1; x++) {
            for (let y = 0; y < n - 1; y++) {
                coordinates.push(e1.times(x).plus(e2.times(y)).plus(e3));
            }
        }

        let nodes = coordinates.map(c => new Node(...c))
        return new this({ nodes });
    }

    constructor({ nodes }) {
        this.nodes = nodes;

        nodes.forEach((node, index) => {
            node.i = index
        })

        this.order = []              // Main turn cycle (array of Turn)
        this.setupSequence = []      // Expanded setup sequence (array of Turn)
        this.mainIndex = 0           // Current position in main cycle
        this.currentSequence = null  // null=in main; {type:'setup'} or {type:'power',playerNum,powerIndex}
        this.sequenceIndex = null    // Position in currentSequence (null when in main)
        this.currentTurn = null      // The Turn to be made next
        this.powers = {}             // Per-player: { [playerNum]: [{sequence:[Turn], usesLeft:N}] }
        this.komi = {}               // Per-player: { [playerNum]: value }
        this.timeSettings = null     // Per-player: { [playerNum]: {maintime, increment, cap} } or null
        this.numPlayers = 2
        this.visitedStates = new Set() // Serialized board states for superko checking
        this.moveHistory = []          // [{i}] entries for last-move marker display
        this.eliminatedPlayers = new Set() // Player numbers that have been eliminated
        this.capturedByColor = {}      // { [colorNum]: count } cumulative stones lost by color


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
    }

    clone() {
        const nodes = this.nodes.map(n => {
            const newNode = new Node(n.x, n.y);
            newNode.color = n.color;
            newNode.hoshi = n.hoshi;
            newNode.i = n.i;
            newNode.onlyVisibleTo = n.onlyVisibleTo;
            return newNode;
        });

        for (let i = 0; i < this.nodes.length; i++) {
            nodes[i].neighbors = this.nodes[i].neighbors.map(neighbor => nodes[neighbor.i]);
        }

        const newBoard = new Board({ nodes });
        newBoard.order = this.order.map(t => new Turn(t));
        newBoard.setupSequence = this.setupSequence.map(t => new Turn(t));
        newBoard.mainIndex = this.mainIndex;
        newBoard.currentSequence = this.currentSequence ? { ...this.currentSequence } : null;
        newBoard.sequenceIndex = this.sequenceIndex;
        newBoard.currentTurn = this.currentTurn ? new Turn(this.currentTurn) : null;

        // Deep copy powers (preserving usesLeft)
        newBoard.powers = {};
        for (const [p, powerList] of Object.entries(this.powers)) {
            newBoard.powers[p] = powerList.map(pw => ({
                sequence: pw.sequence.map(t => new Turn(t)),
                usesLeft: pw.usesLeft,
            }));
        }

        newBoard.komi = { ...this.komi };
        newBoard.timeSettings = this.timeSettings; // immutable reference is fine
        newBoard.capturedByColor = { ...this.capturedByColor };
        newBoard.numPlayers = this.numPlayers;
        newBoard.legalityChecks = this.legalityChecks; // immutable shared ref
        newBoard.visitedStates = new Set(this.visitedStates);
        newBoard.moveHistory = this.moveHistory.map(m => ({ ...m }));
        newBoard.eliminatedPlayers = new Set(this.eliminatedPlayers);

        newBoard.boundingBox = { ...this.boundingBox };
        newBoard.width = this.width;
        newBoard.height = this.height;
        newBoard.scale = this.scale;
        newBoard.offsetX = this.offsetX;
        newBoard.offsetY = this.offsetY;
        newBoard.sw = this.sw;
        newBoard.sp = this.sp;

        return newBoard;
    }

    advanceMoveOrder() {
        // Skip eliminated players when advancing
        const skipEliminated = (advance) => {
            advance();
            // Keep advancing while current player is eliminated (up to order.length times)
            let guard = this.order.length + 1;
            while (guard-- > 0 && this.currentSequence === null &&
                   this.currentTurn && this.eliminatedPlayers.has(this.currentTurn.player)) {
                const next = (this.mainIndex + 1) % this.order.length;
                this.mainIndex = next;
                this.currentTurn = new Turn(this.order[this.mainIndex]);
            }
        };

        if (this.currentSequence === null) {
            // Main sequence
            skipEliminated(() => {
                this.mainIndex = (this.mainIndex + 1) % this.order.length;
                this.currentTurn = new Turn(this.order[this.mainIndex]);
            });
        } else if (this.currentSequence.type === 'setup') {
            this.sequenceIndex++;
            if (this.sequenceIndex >= this.setupSequence.length) {
                // Setup complete — switch to main cycle
                this.currentSequence = null;
                this.sequenceIndex = null;
                this.currentTurn = new Turn(this.order[this.mainIndex]);
                // Skip if this player is already eliminated
                skipEliminated(() => {});
            } else {
                this.currentTurn = new Turn(this.setupSequence[this.sequenceIndex]);
            }
        } else if (this.currentSequence.type === 'power') {
            this.sequenceIndex++;
            const { playerNum, powerIndex } = this.currentSequence;
            const seq = this.powers[playerNum]?.[powerIndex]?.sequence || [];
            if (this.sequenceIndex >= seq.length) {
                // Power sequence complete — return to main and advance to next player
                this.currentSequence = null;
                this.sequenceIndex = null;
                skipEliminated(() => {
                    this.mainIndex = (this.mainIndex + 1) % this.order.length;
                    this.currentTurn = new Turn(this.order[this.mainIndex]);
                });
            } else {
                this.currentTurn = new Turn(seq[this.sequenceIndex]);
            }
        }
    }

    getActiveSequence() {
        if (this.currentSequence === null) return this.order;
        if (this.currentSequence.type === 'setup') return this.setupSequence;
        if (this.currentSequence.type === 'power') {
            const { playerNum, powerIndex } = this.currentSequence;
            return this.powers[playerNum]?.[powerIndex]?.sequence || this.order;
        }
        return this.order;
    }

    getActiveIndex() {
        if (this.currentSequence === null) return this.mainIndex;
        return this.sequenceIndex;
    }

    getActivePhase() {
        if (this.currentSequence === null) return 'main';
        return this.currentSequence.type;
    }

    calculateTransform(canvasWidth, canvasHeight) {
        // Add 1 unit margin on each side for stone radius
        const marginWidth = this.width + 1;
        const marginHeight = this.height + 1;

        this.scale = Math.min(
            canvasWidth / marginWidth,
            canvasHeight / marginHeight
        );
        this.offsetX = -this.boundingBox.minX * this.scale +
            (canvasWidth - this.scale * this.width) / 2;
        this.offsetY = -this.boundingBox.minY * this.scale +
            (canvasHeight - this.scale * this.height) / 2;
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

        return closestNode;
    }

    // Apply a compressed move record in-place (used for history replay — trusts the record).
    // move is one of: {i,c[,l]} | {s:1} | {w:N} | {r:N}
    applyMoveRecord(move) {
        if (move[M_PASS]) {
            this.advanceMoveOrder();
            return;
        }

        if (move[M_POWER] !== undefined) {
            const playerNum = this.currentTurn.player;
            const powerIndex = move[M_POWER];
            if (this.powers[playerNum]?.[powerIndex]) {
                this.powers[playerNum][powerIndex].usesLeft--;
            }
            this.currentSequence = { type: 'power', playerNum, powerIndex };
            this.sequenceIndex = 0;
            this.currentTurn = new Turn(this.powers[playerNum][powerIndex].sequence[0]);
            return;
        }

        if (move[M_REVEALED] !== undefined) {
            const node = this.nodes[move[M_REVEALED]];
            if (node) node.onlyVisibleTo = null;
            // Do not advance turn — revealing a hidden stone does not consume the player's turn.
            return;
        }

        if (move[M_ELIMINATED] !== undefined) {
            this.eliminatedPlayers.add(move[M_ELIMINATED]);
            // If it's currently that player's turn, advance past them.
            if (this.currentTurn && this.currentTurn.player === move[M_ELIMINATED]) {
                this.advanceMoveOrder();
            }
            return;
        }

        // Normal place: {i}
        const node = this.nodes[move[M_INDEX]];
        if (node) {
            const color = this.currentTurn.color;

            // Remove-stone move (color 0): track the removed stone as captured
            if (color === 0 && node.color > 0) {
                this.capturedByColor[node.color] = (this.capturedByColor[node.color] || 0) + 1;
            }

            node.color = color;
            if (this.currentTurn.hidden) {
                // If the turn is played by a real player use that player number,
                // otherwise (random player 0) attribute to the color placed.
                const mover = this.currentTurn.player > 0
                    ? this.currentTurn.player
                    : color;
                node.onlyVisibleTo = mover;
            } else {
                node.onlyVisibleTo = null;
            }

            // Capture opponent stones
            for (const neighbor of node.neighbors) {
                if (neighbor.color > 0 && neighbor.color !== color) {
                    const chain = this.findChainIfDead(neighbor);
                    for (const stone of chain) {
                        this.capturedByColor[stone.color] = (this.capturedByColor[stone.color] || 0) + 1;
                        stone.color = 0;
                    }
                }
            }

            // Suicide: if the placed stone's own chain has no liberties, capture it too
            const ownChain = this.findChainIfDead(node);
            for (const stone of ownChain) {
                this.capturedByColor[stone.color] = (this.capturedByColor[stone.color] || 0) + 1;
                stone.color = 0;
            }

            this.visitedStates.add(this.nodes.map(n => n.color).join(''));
            this.moveHistory.push({ i: move[M_INDEX] });
        }

        this.advanceMoveOrder();
    }

    // Try to place a stone at index i with color c. Returns a new board clone if legal, null if not.
    tryMove(i, c) {
        const result = this.tryMoveReason(i, c);
        return result.reason ? null : result.board;
    }

    // Like tryMove but returns { board, reason } — reason is null if legal, else a short string.
    tryMoveReason(i, c) {
        const node = this.nodes[i];

        // Color 0 = remove a stone: must be on an occupied node
        if (c === 0) {
            if (!node || node.color <= 0) return { board: null, reason: 'empty' };
            const clone = this.clone();
            clone.nodes[i].color = 0;
            // Superko check
            const stateKey = clone.nodes.map(n => n.color).join('');
            const hasKoMaster = (this.legalityChecks || []).some(lc => lc.type === 'koMaster' && lc.player === this.currentTurn.player);
            if (!hasKoMaster && clone.visitedStates.has(stateKey)) return { board: null, reason: 'ko' };
            // Variant legality checks
            for (const check of (this.legalityChecks || [])) {
                const reason = runLegalityCheck(check, clone, i, c, this);
                if (reason) return { board: null, reason };
            }
            clone.visitedStates.add(stateKey);
            clone.moveHistory.push({ i });
            clone.advanceMoveOrder();
            return { board: clone, reason: null };
        }

        if (!node || node.color !== 0) return { board: null, reason: 'occupied' };

        const clone = this.clone();
        const cloneNode = clone.nodes[i];
        cloneNode.color = c;

        // Capture opponent stones
        for (const neighbor of cloneNode.neighbors) {
            if (neighbor.color > 0 && neighbor.color !== c) {
                const chain = clone.findChainIfDead(neighbor);
                for (const stone of chain) stone.color = 0;
            }
        }

        // Suicide check
        const ownDead = clone.findChainIfDead(cloneNode);
        if (ownDead.length > 0) return { board: null, reason: 'suicide' };

        // Superko check
        const stateKey = clone.nodes.map(n => n.color).join('');
        const hasKoMaster = (this.legalityChecks || []).some(lc => lc.type === 'koMaster' && lc.player === this.currentTurn.player);
        if (!hasKoMaster && clone.visitedStates.has(stateKey)) return { board: null, reason: 'ko' };

        // Variant legality checks
        for (const check of (this.legalityChecks || [])) {
            const reason = runLegalityCheck(check, clone, i, c, this);
            if (reason) return { board: null, reason };
        }

        // Valid — finalize
        if (this.currentTurn.hidden) {
            const mover = this.currentTurn.player > 0 ? this.currentTurn.player : c;
            cloneNode.onlyVisibleTo = mover;
        }
        clone.visitedStates.add(stateKey);
        clone.moveHistory.push({ i });
        clone.advanceMoveOrder();
        return { board: clone, reason: null };
    }

    // Returns true if any stone on the board is hidden from the given player.
    hasHiddenStones(playerNum) {
        for (const node of this.nodes) {
            if (node.onlyVisibleTo !== null && node.onlyVisibleTo !== playerNum) return true;
        }
        return false;
    }

    // Returns a new board clone after passing. Always legal.
    tryPass() {
        const clone = this.clone();
        clone.advanceMoveOrder();
        return clone;
    }

    // Trigger power at powerIndex for playerNum. Returns a new board clone, or null if not allowed.
    triggerPower(playerNum, powerIndex) {
        if (this.currentSequence !== null) return null;
        if (!this.currentTurn || this.currentTurn.player !== playerNum) return null;
        const playerPowers = this.powers[playerNum];
        if (!playerPowers?.[powerIndex]) return null;
        if (playerPowers[powerIndex].usesLeft <= 0) return null;

        const clone = this.clone();
        clone.powers[playerNum][powerIndex].usesLeft--;
        clone.currentSequence = { type: 'power', playerNum, powerIndex };
        clone.sequenceIndex = 0;
        clone.currentTurn = new Turn(clone.powers[playerNum][powerIndex].sequence[0]);
        return clone;
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

    // Returns all stones in the same-color connected group as `stone`.
    findChain(stone) {
        if (!stone || stone.color <= 0) return [];
        const color = stone.color;
        const visited = new Set();
        const stack = [stone];
        visited.add(stone);
        while (stack.length) {
            const current = stack.pop();
            for (const neighbor of current.neighbors) {
                if (!visited.has(neighbor) && neighbor.color === color) {
                    visited.add(neighbor);
                    stack.push(neighbor);
                }
            }
        }
        return Array.from(visited);
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

    draw(p, deadChains = null, canonicalIndexMap = null, territory = null, viewerPlayer = null, reviewMode = false) {
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


        // Draw starpoints (skip deleted nodes)
        p.noStroke();
        p.fill(...gridColor);
        for (let node of this.nodes) {
            if (node.hoshi && node.color !== -1) {
                p.circle(align(node.x * this.scale), align(node.y * this.scale), this.sp);
            }
        }

        // Draw stones
        p.strokeWeight(this.sw);
        for (let node of this.nodes) {
            if (node.color > 0) {
                const showScoring = territory !== null;
                const hiddenFromViewer = !showScoring && !reviewMode && node.onlyVisibleTo !== null && node.onlyVisibleTo !== viewerPlayer;
                // Skip stones invisible to this viewer (not in scoring/review mode)
                if (hiddenFromViewer) continue;
                const visibleAsGhost = (!showScoring && node.onlyVisibleTo !== null) &&
                    (reviewMode || node.onlyVisibleTo === viewerPlayer);
                const isDead = this.isInDeadChain(node, deadChains, canonicalIndexMap);
                if (isDead || visibleAsGhost) {
                    p.fill(...stoneColors[node.color], 150);
                    p.noStroke();
                } else {
                    p.fill(...stoneColors[node.color]);
                    p.stroke(...strokeColors[node.color]);
                }
                p.circle(align(node.x * this.scale), align(node.y * this.scale), this.scale - this.sw);
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
                // Don't draw the marker if the stone is hidden from the viewer (unless in review mode)
                const hiddenFromViewer = !reviewMode
                    && lastNode?.onlyVisibleTo !== null
                    && lastNode?.onlyVisibleTo !== undefined
                    && lastNode?.onlyVisibleTo !== viewerPlayer;
                if (lastNode && lastColor > 0 && !hiddenFromViewer) {
                    const markerSize = this.scale * 0.5;
                    p.noFill()
                    p.stroke(...markerColors[lastColor]);
                    p.circle(
                        align(lastNode.x * this.scale),
                        align(lastNode.y * this.scale),
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
                        p.circle(align(node.x * this.scale), align(node.y * this.scale), markerSize);
                    }
                }
            }
        }

        p.pop();
    }

    drawPreviewDiff(p, previewBoard) {
        if (!previewBoard) return;

        p.push();
        p.translate(this.offsetX, this.offsetY);

        // Draw all differences between current board and preview board
        for (let i = 0; i < this.nodes.length; i++) {
            const originalNode = this.nodes[i];
            const previewNode = previewBoard.nodes[i];

            if (originalNode.color !== previewNode.color) {
                const cx = align(previewNode.x * this.scale);
                const cy = align(previewNode.y * this.scale);

                if (previewNode.color === 0 && originalNode.color > 0) {
                    // Capture: stone was removed - draw outline only (no fill)
                    p.noFill();
                    p.stroke(...strokeColors[originalNode.color], 180);
                    p.strokeWeight(this.sw * 1.5);
                    p.circle(cx, cy, this.scale - this.sw);
                } else if (previewNode.color > 0) {
                    // New stone placed - draw as ghost (semi-transparent)
                    p.fill(...stoneColors[previewNode.color], 120);
                    p.stroke(...strokeColors[previewNode.color], 150);
                    p.strokeWeight(this.sw);
                    p.circle(cx, cy, this.scale - this.sw);
                }
            }
        }

        p.pop();
    }

    drawGhostStoneAt(p, node, color, turn = null) {
        if (!node) return;
        p.push();
        p.translate(this.offsetX, this.offsetY);
        const cx = align(node.x * this.scale);
        const cy = align(node.y * this.scale);
        const d = this.scale - this.sw;

        if (color === 0 || color === -1) {
            // Draw X over the intersection (or stone)
            const xr = d * 0.25;
            const underColor = node.color > 0 ? node.color : 0;
            const mc = markerColors[underColor] || markerColors[0];
            p.stroke(...mc, 200);
            p.strokeWeight(3);
            p.line(cx - xr, cy - xr, cx + xr, cy + xr);
            p.line(cx - xr, cy + xr, cx + xr, cy - xr);
            p.pop();
            return;
        }

        p.fill(...stoneColors[color], 120);
        p.stroke(...strokeColors[color], 150);
        p.strokeWeight(this.sw);
        p.circle(cx, cy, d);
        p.pop();
    }

    drawIllegalMoveIndicator(p, node) {
        if (!node) return;

        p.push();
        p.translate(this.offsetX, this.offsetY);

        // Draw a red X to indicate illegal move
        p.stroke(255, 0, 0, 200);
        p.strokeWeight(4);
        const cx = align(node.x * this.scale);
        const cy = align(node.y * this.scale);
        const r = (this.scale - this.sw) * 0.25;
        p.line(cx - r, cy - r, cx + r, cy + r);
        p.line(cx - r, cy + r, cx + r, cy - r);

        p.pop();
    }

    drawGhostStone(node, color, p, previewBoard = null, isIllegal = false) {
        if (!node) return;

        p.push();
        p.translate(this.offsetX, this.offsetY);

        const cx = align(node.x * this.scale);
        const cy = align(node.y * this.scale);
        const d  = this.scale - this.sw;
        const xr = d * 0.25; // X arm radius

        if (isIllegal) {
            // Illegal move - draw a red X
            p.stroke(255, 0, 0, 200);
            p.strokeWeight(4);
            p.line(cx - xr, cy - xr, cx + xr, cy + xr);
            p.line(cx - xr, cy + xr, cx + xr, cy - xr);
        } else if (color === 0 || color === -1) {
            // color 0: remove stone; color -1: delete node
            // Draw only an X — no circle — on top of the intersection or stone
            const xr = d * 0.25;
            const underColor = node.color > 0 ? node.color : 0;
            const mc = markerColors[underColor] || markerColors[0];
            p.stroke(...mc, 200);
            p.strokeWeight(3);
            p.line(cx - xr, cy - xr, cx + xr, cy + xr);
            p.line(cx - xr, cy + xr, cx + xr, cy - xr);
        } else {
            if (previewBoard) {
                // Draw all differences between current board and preview board
                for (let n of previewBoard.nodes) {
                    const originalNode = this.nodes[n.i];
                    if (originalNode.color !== n.color) {
                        // Skip the node where we are placing the stone (handled below)
                        if (n.i === node.i) continue;

                        if (n.color === 0) {
                            // Removal (Capture)
                            p.fill(...boardColor, 180);
                            p.noStroke();
                            p.circle(align(n.x * this.scale), align(n.y * this.scale), this.scale - this.sw);

                            // Draw a small red marker to show it was captured
                            p.stroke(255, 0, 0, 120);
                            p.strokeWeight(2);
                            const r = (this.scale - this.sw) * 0.15;
                            const cx = align(n.x * this.scale);
                            const cy = align(n.y * this.scale);
                            p.line(cx - r, cy - r, cx + r, cy + r);
                            p.line(cx - r, cy + r, cx + r, cy - r);
                        } else {
                            // Addition or Change
                            p.fill(...stoneColors[n.color], 150);
                            p.stroke(...strokeColors[n.color], 150);
                            p.strokeWeight(this.sw);
                            p.circle(align(n.x * this.scale), align(n.y * this.scale), this.scale - this.sw);
                        }
                    }
                }
            }

            // Draw the ghost stone itself (the stone being placed)
            // If previewBoard exists, use the color from the preview (in case logic changed it)
            const previewNode = previewBoard ? previewBoard.nodes[node.i] : null;
            const displayColor = (previewNode && previewNode.color > 0) ? previewNode.color : color;

            p.fill(...stoneColors[displayColor], 150);
            p.stroke(...strokeColors[displayColor], 150);
            p.strokeWeight(this.sw);
            p.circle(align(node.x * this.scale), align(node.y * this.scale), this.scale - this.sw);
        }

        p.pop();
    }
}

class Turn {
    constructor(playerOrObj = 1, color = 1) {
        if (typeof playerOrObj === 'object') {
            const { player = 1, color: c = 1, hidden } = playerOrObj;
            this.player = player;
            this.color = c;
            if (hidden) this.hidden = true;
        } else {
            this.player = playerOrObj;
            this.color = color;
        }
    }
}

// --- Firebase compression helpers ---

function compressTurn(t) {
    const ct = { [T_PLAYER]: t.player, [T_COLOR]: t.color };
    if (t.hidden) ct[T_HIDDEN] = true;
    return ct;
}

function decompressTurn(ct) {
    const t = { player: ct[T_PLAYER], color: ct[T_COLOR] };
    if (ct[T_HIDDEN]) t.hidden = true;
    return t;
}

// Evaluates a single legality check against a post-move clone.
// Returns a reason string if the move is illegal, or null if it passes.
function runLegalityCheck(check, cloneBoard, nodeIndex, moveColor, originalBoard) {
    if (check.type === 'forbiddenChainSize') {
        if (check.player !== null && check.player !== originalBoard.currentTurn.player) return null;
        const size = check.size;
        if (moveColor === 0) {
            // Removing: check each resulting group that was formerly connected through the removed stone.
            const originalNode = originalBoard.nodes[nodeIndex];
            const seen = new Set();
            for (const neighbor of originalNode.neighbors) {
                if (neighbor.color <= 0) continue;
                if (seen.has(neighbor.i)) continue;
                const chain = cloneBoard.findChain(cloneBoard.nodes[neighbor.i]);
                for (const n of chain) seen.add(n.i);
                if (chain.length === size) return 'forbidden-chain-size';
            }
        } else {
            // Placing: check the chain the new stone belongs to (after captures).
            const chain = cloneBoard.findChain(cloneBoard.nodes[nodeIndex]);
            if (chain.length === size) return 'forbidden-chain-size';
        }
    }
    return null;
}

// Compress a JS gameSetting object to its Firebase representation.
function compressGameSetting(gs) {
    const c = {};
    if (gs.boardType) c[GS_BOARD_TYPE] = gs.boardType;
    if (gs.boardSize !== undefined) c[GS_BOARD_SIZE] = gs.boardSize;
    if (gs.players !== undefined) c[GS_PLAYERS] = gs.players;
    if (gs.setupStones?.length) c[GS_SETUP_STONES] = gs.setupStones; // already {i,c} form
    if (gs.setupTurns?.length) {
        c[GS_SETUP_TURNS] = gs.setupTurns.map(st => ({
            [ST_SEQUENCE]: st.sequence.map(compressTurn),
            [ST_REPEAT]: st.repeat,
        }));
    }
    if (gs.mainSequence?.length) c[GS_MAIN_SEQ] = gs.mainSequence.map(compressTurn);
    if (gs.powers && Object.keys(gs.powers).length) {
        c[GS_POWERS] = {};
        for (const [playerNum, pwList] of Object.entries(gs.powers)) {
            c[GS_POWERS][playerNum] = pwList.map(pw => ({
                [ST_SEQUENCE]: pw.sequence.map(compressTurn),
                [PW_USES]: pw.numberOfUses,
            }));
        }
    }
    if (gs.komi && Object.keys(gs.komi).length) c[GS_KOMI] = gs.komi;
    if (gs.timeSettings && Object.keys(gs.timeSettings).length) {
        c[GS_TIME_SETTINGS] = {};
        for (const [playerNum, ts] of Object.entries(gs.timeSettings)) {
            c[GS_TIME_SETTINGS][playerNum] = {
                [TS_MAINTIME]: ts.maintime,
                [TS_INCREMENT]: ts.increment,
            };
        }
    }
    if (gs.legalityChecks?.length) {
        c[GS_LEGALITY_CHECKS] = gs.legalityChecks.map(lc => {
            const obj = { tp: lc.type };
            if (lc.size !== undefined) obj.sz = lc.size;
            if (lc.player !== null && lc.player !== undefined) obj.pl = lc.player;
            return obj;
        });
    }
    return c;
}

// Decompress a Firebase game document into an uncompressed gameSetting object.
function decompressGameSetting(data) {
    const gs = {};
    if (data[GS_BOARD_TYPE] !== undefined) gs.boardType = data[GS_BOARD_TYPE];
    if (data[GS_BOARD_SIZE] !== undefined) gs.boardSize = data[GS_BOARD_SIZE];
    if (data[GS_PLAYERS] !== undefined) gs.players = data[GS_PLAYERS];
    if (data[GS_SETUP_STONES]) gs.setupStones = data[GS_SETUP_STONES];
    if (data[GS_SETUP_TURNS]) {
        gs.setupTurns = data[GS_SETUP_TURNS].map(st => ({
            sequence: (st[ST_SEQUENCE] || []).map(decompressTurn),
            repeat: st[ST_REPEAT] || 1,
        }));
    }
    if (data[GS_MAIN_SEQ]) gs.mainSequence = data[GS_MAIN_SEQ].map(decompressTurn);
    if (data[GS_POWERS]) {
        gs.powers = {};
        for (const [playerNum, pwList] of Object.entries(data[GS_POWERS])) {
            gs.powers[parseInt(playerNum)] = pwList.map(pw => ({
                sequence: (pw[ST_SEQUENCE] || []).map(decompressTurn),
                numberOfUses: pw[PW_USES],
            }));
        }
    }
    if (data[GS_KOMI]) gs.komi = data[GS_KOMI];
    if (data[GS_TIME_SETTINGS]) {
        gs.timeSettings = {};
        for (const [playerNum, ts] of Object.entries(data[GS_TIME_SETTINGS])) {
            gs.timeSettings[parseInt(playerNum)] = {
                maintime: ts[TS_MAINTIME],
                increment: ts[TS_INCREMENT],
            };
        }
    }
    if (data[GS_LEGALITY_CHECKS]) {
        gs.legalityChecks = data[GS_LEGALITY_CHECKS].map(lc => ({
            type: lc.tp,
            size: lc.sz,
            player: lc.pl ?? null,
        }));
    }
    return gs;
}

// Compress a JS move record to its Firebase representation.
function compressMoveRecord(move) {
    if (move.pass) return { [M_PASS]: 1 };
    if (move.power !== undefined) return { [M_POWER]: move.power };
    if (move.revealed !== undefined) return { [M_REVEALED]: move.revealed };
    const cm = { [M_INDEX]: move.index };
    if (move.timeLeft !== undefined) cm[M_TIME_LEFT] = move.timeLeft;
    return cm;
}

// Decompress a Firebase move record to a JS move object.
function decompressMoveRecord(cm) {
    if (cm[M_PASS]) return { pass: 1 };
    if (cm[M_POWER] !== undefined) return { power: cm[M_POWER] };
    if (cm[M_REVEALED] !== undefined) return { revealed: cm[M_REVEALED] };
    const move = { index: cm[M_INDEX] };
    if (cm[M_TIME_LEFT] !== undefined) move.timeLeft = cm[M_TIME_LEFT];
    return move;
}

// Shared stone drawing for move indicators (used by MoveListWidget + TurnOrderDisplay)
function drawMoveStone(p, x, y, move, stoneSize) {
    const r = Math.floor((stoneSize - 4)/2)

    // Stone
    if (move.hidden) {
        p.fill(...stoneColors[move.color], 127);
    } else {
        p.fill(...stoneColors[move.color]);
    }
    p.stroke(...strokeColors[move.color]);
    p.strokeWeight(2);
    p.circle(x, y, 2 * r);

    // X-mark for removing stones
    if (move.color === 0) {
        const s = r / 3;
        p.line(x - s, y - s, x + s, y + s);
        p.line(x - s, y + s, x + s, y - s);
    }


    // Player triangle
    p.fill(...stoneColors[move.player]);
    p.stroke(...strokeColors[move.player]);
    //p.noStroke();
    p.triangle(x - r, y - r, x, y - r, x - r, y);
    // p.stroke(...strokeColors[move.color]);
    // p.line(x - r, y - r, x, y - r);
    // p.line(x - r, y - r, x - r, y);
}

// Adapter so drawMoveStone (and related p5 drawing functions) can target a Canvas 2D context.
// Supports the subset of p5 API used by drawMoveStone.
function createCanvas2DAdapter(ctx) {
    let _fill = null;
    let _stroke = null;
    let _sw = 1;

    function parseColor(args) {
        // Accept (r,g,b), (r,g,b,a), or ([r,g,b]) / ([r,g,b,a])
        if (args.length === 1 && Array.isArray(args[0])) args = args[0];
        const [r, g, b, a] = args;
        return a !== undefined ? `rgba(${r},${g},${b},${a / 255})` : `rgb(${r},${g},${b})`;
    }

    return {
        fill(...args) { _fill = parseColor(args); },
        noFill() { _fill = null; },
        stroke(...args) { _stroke = parseColor(args); },
        noStroke() { _stroke = null; },
        strokeWeight(w) { _sw = w; },
        push() { ctx.save(); },
        pop() { ctx.restore(); },
        translate(x, y) { ctx.translate(x, y); },
        circle(x, y, d) {
            ctx.beginPath();
            ctx.arc(x, y, d / 2, 0, Math.PI * 2);
            if (_fill) { ctx.fillStyle = _fill; ctx.fill(); }
            if (_stroke) { ctx.strokeStyle = _stroke; ctx.lineWidth = _sw; ctx.stroke(); }
        },
        line(x1, y1, x2, y2) {
            if (!_stroke) return;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = _stroke;
            ctx.lineWidth = _sw;
            ctx.stroke();
        },
        triangle(x1, y1, x2, y2, x3, y3) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.closePath();
            if (_fill) { ctx.fillStyle = _fill; ctx.fill(); }
            if (_stroke) { ctx.strokeStyle = _stroke; ctx.lineWidth = _sw; ctx.stroke(); }
        },
        arc(x, y, w, h, start, stop) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, w / 2, start, stop);
            ctx.closePath();
            if (_fill) { ctx.fillStyle = _fill; ctx.fill(); }
            if (_stroke) { ctx.strokeStyle = _stroke; ctx.lineWidth = _sw; ctx.stroke(); }
        },
    };
}