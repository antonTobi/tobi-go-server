// Game page script
// Get game ID from URL path (e.g., /game/abc123) or query parameter (e.g., /game.html?id=abc123)
const pathParts = window.location.pathname.split('/');
const pathGameId = pathParts[pathParts.length - 1];
const urlParams = new URLSearchParams(window.location.search);
const queryGameId = urlParams.get('id');

let gameId = queryGameId || pathGameId;

if (!gameId || gameId === 'game.html') {
    alert('No game ID provided');
    window.location.href = '/';
}

// Game state
let gameRef = null;
let movesRef = null;
let seatsRef = null;
let board = null;
let hoverNode = null;
let gameSettings = null;
let gameCreatedBy = null;       // Host user ID
let phase = 'lobby';            // 'lobby'|'playing'|'paused'|'scoring'|'finished'
let clocks = {};                // { playerNum: clockValue } — <1e12=paused ms, >=1e12=expiry timestamp
let request = null;             // Current request object or null
let deadChains = {};            // { canonicalIndex: true }
let canonicalIndexMap = null;   // { nodeIndex: canonicalIndex } — computed when entering scoring
let territory = null;           // { nodeIndex: ownerColor } — computed when deadChains changes
let gameLoaded = false;
let acceptCooldown = false;     // Prevents accepting immediately after a chain toggle
let seats = {};                 // { playerNumber: uid }
let mySeat = null;              // The player number I'm sitting in (1-5), or null
let requiredSeats = [];         // Player numbers that need seats (derived from mainSequence)
let p5Instance = null;          // Reference to p5 sketch for redrawing
let turnOrderDisplay = null;    // TurnOrderDisplay for main area
let sidebarTurnOrderDisplay = null; // TurnOrderDisplay for sidebar
let debugMode = false;          // Debug mode: host can play all seats
let clockInterval = null;       // setInterval handle for clock display updates
let serverTimeOffset = 0;       // Firebase server time offset (ms): serverTime = Date.now() + serverTimeOffset
function serverNow() { return Date.now() + serverTimeOffset; }

const isPlaying  = () => phase === 'playing';
const isScoring  = () => phase === 'scoring';
const isFinished = () => phase === 'finished';
const isLobby    = () => phase === 'lobby';

// History navigation state
let liveMoves = [];      // All moves from database, stored separately
let viewIndex = 0;       // Current move index being viewed (0 = initial board, liveMoves.length = latest)
let isViewingHistory = false; // True if user is viewing past moves (not auto-advancing)

// Debug
window._debugBoard = () => board;
window._debugSeats = () => ({ seats, mySeat, requiredSeats });
window._debugHistory = () => ({ liveMoves, viewIndex, isViewingHistory, totalMoves: liveMoves.length });

// Initialize game when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}

let _toastTimer = null;
function showToast(msg) {
    const el = document.getElementById('illegal-move-toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

// Setup UI event handlers
function setupUIHandlers() {
    // Prevent clicks/touches on sidebar and bottom bar from reaching the canvas
    const sidebar = document.getElementById('players-sidebar');
    const bottomBar = document.getElementById('bottom-bar');
    const topBar = document.getElementById('top-bar');
    
    [sidebar, bottomBar, topBar].forEach(el => {
        if (el) {
            el.addEventListener('mousedown', (e) => e.stopPropagation());
            el.addEventListener('click', (e) => e.stopPropagation());
            el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
            el.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });
        }
    });
    
    // Setup home button for mobile
    const homeBtn = document.querySelector('.home-btn');
    if (homeBtn) {
        homeBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            window.location.href = homeBtn.href;
        }, { passive: false });
    }
    
    // Listen for layout changes
    const layoutMediaQuery = window.matchMedia('(min-aspect-ratio: 1/1)');
    layoutMediaQuery.addEventListener('change', handleLayoutChange);
    handleLayoutChange(layoutMediaQuery);
}

// Handle layout changes between portrait and landscape
function handleLayoutChange(e) {
    // Re-render UI for the current layout
    renderPlayerCards();
    renderGameControls();
    renderHistoryControls();
    
    // Trigger window resize to recalculate board size
    if (p5Instance) {
        setTimeout(() => {
            p5Instance.windowResized();
        }, 100);
    }
}

// Check if currently in landscape mode
function isLandscapeMode() {
    return window.matchMedia('(min-aspect-ratio: 1/1)').matches;
}

// Call setup when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupUIHandlers);
} else {
    setupUIHandlers();
}

function initGame() {
    gameRef = db.ref(`games/${gameId}`);
    seatsRef = db.ref(`games/${gameId}/seats`);
    movesRef = db.ref(`games/${gameId}/${G_MOVES}`);

    // Keep server time offset in sync so all clients share the same clock reference
    db.ref('.info/serverTimeOffset').on('value', snap => {
        serverTimeOffset = snap.val() || 0;
    });

    gameRef.once('value')
        .then((snapshot) => {
            const gameData = snapshot.val();
            if (!gameData) {
                alert('Game not found');
                window.location.href = '/';
                return;
            }

            gameSettings  = decompressGameSetting(gameData);
            gameCreatedBy = gameData.createdBy;
            phase         = gameData[G_PHASE]       || 'lobby';
            clocks        = gameData[G_CLOCKS]      || {};
            request       = gameData[G_REQUEST]     || null;
            deadChains    = gameData[G_DEAD_CHAINS] || {};
            gameLoaded = true;

            requiredSeats = getRequiredSeats(gameSettings);

            const loadedSeats = gameData.seats || {};
            if (isPlaying() && Object.keys(loadedSeats).length === 0 && currentUser && gameCreatedBy === currentUser.uid) {
                debugMode = true;
                console.log('Debug mode: no seats occupied, host can play all moves');
            }

            p5Instance = new p5(createSketch());

            renderPlayerCards();
            renderHistoryControls();
            renderTurnOrder();
            startClockInterval();

            seatsRef.on('value', handleSeatsChanged);
            gameRef.child(G_PHASE).on('value', handlePhaseChanged);
            gameRef.child(G_DEAD_CHAINS).on('value', handleDeadChainsChanged);
            gameRef.child(G_CLOCKS).on('value', handleClocksChanged);
            gameRef.child(G_REQUEST).on('value', handleRequestChanged);
            movesRef.on('child_added', handleMoveAdded);
            movesRef.on('child_removed', handleMoveRemoved);
        })
        .catch((error) => {
            console.error('Error loading game:', error);
            alert('Failed to load game');
        });
}

function getRequiredSeats(gameSettings) {
    const players = new Set();

    const addFromSequence = (seq) => {
        if (!seq) return;
        seq.forEach(turn => {
            const player = turn.player !== undefined ? turn.player : turn;
            if (player >= 1 && player <= 5) players.add(player);
        });
    };

    addFromSequence(gameSettings.mainSequence);

    if (gameSettings.setupTurns) {
        for (const st of gameSettings.setupTurns) addFromSequence(st.sequence);
    }

    if (gameSettings.powers) {
        for (const playerNum of Object.keys(gameSettings.powers)) {
            const p = parseInt(playerNum);
            if (p >= 1 && p <= 5) players.add(p);
        }
    }

    if (players.size === 0) return [1, 2];
    return Array.from(players).sort((a, b) => a - b);
}

function handleSeatsChanged(snapshot) {
    seats = snapshot.val() || {};
    
    // Check if I'm seated
    mySeat = null;
    if (currentUser) {
        for (const [playerNum, odId] of Object.entries(seats)) {
            if (odId === currentUser.uid) {
                mySeat = parseInt(playerNum);
                break;
            }
        }
    }
    
    renderPlayerCards();
    renderGameControls();
    if (p5Instance) p5Instance.redraw();
}

function handleMoveAdded(snapshot) {
    const move = snapshot.val();
    const moveIndex = parseInt(snapshot.key);

    if (move) {
        liveMoves[moveIndex] = move;

        if (!isViewingHistory) {
            viewIndex = liveMoves.length;
            rebuildBoardToView();
        }

        renderTurnOrder();
        renderPlayerCards();
        renderGameControls();
        renderHistoryControls();
        if (p5Instance) p5Instance.redraw();
    }
}

function handleMoveRemoved(snapshot) {
    const moveIndex = parseInt(snapshot.key);
    
    // Remove this move and all moves after it from liveMoves
    // (Firebase may send multiple child_removed events, so we handle each individually)
    if (moveIndex < liveMoves.length) {
        liveMoves.length = moveIndex;
        
        // Always jump to latest position when moves are removed (undo by any client)
        viewIndex = liveMoves.length;
        isViewingHistory = false;
        
        rebuildBoardToView();
        renderPlayerCards();
        renderGameControls();
        renderHistoryControls();
        if (p5Instance) p5Instance.redraw();
    }
}

function handlePhaseChanged(snapshot) {
    const wasScoring = isScoring();
    phase = snapshot.val() || 'lobby';
    if (!wasScoring && isScoring() && board) {
        canonicalIndexMap = board.computeCanonicalIndexMap();
        territory = board.calculateTerritory(deadChains, canonicalIndexMap);
    } else if (!isScoring() && !isFinished()) {
        canonicalIndexMap = null;
        territory = null;
    }
    renderPlayerCards();
    renderGameControls();
    renderTurnOrder();
    if (isPlaying() && isHost()) processRandomMoves();
    if (p5Instance) p5Instance.redraw();
}

function handleDeadChainsChanged(snapshot) {
    const newDeadChains = snapshot.val() || {};
    if (isScoring() && !isFinished()) {
        const changed = JSON.stringify(deadChains) !== JSON.stringify(newDeadChains);
        if (changed) {
            acceptCooldown = true;
            renderGameControls();
            setTimeout(() => {
                acceptCooldown = false;
                renderGameControls();
            }, 2000);
        }
    }
    deadChains = newDeadChains;
    if (isScoring() && board && canonicalIndexMap) {
        territory = board.calculateTerritory(deadChains, canonicalIndexMap);
    } else {
        territory = null;
    }
    renderPlayerCards();
    if (p5Instance) p5Instance.redraw();
}

function handleClocksChanged(snapshot) {
    clocks = snapshot.val() || {};
    renderPlayerCards();
}

function handleRequestChanged(snapshot) {
    request = snapshot.val() || null;
    renderPlayerCards();
    renderGameControls();
}

let isRebuilding = false;
let rebuildPending = false;

function rebuildBoardToView() {
    if (!board || !gameSettings) return;

    if (isRebuilding) {
        rebuildPending = true;
        return;
    }
    isRebuilding = true;
    try {
        board = Board.fromSettings(gameSettings);
        if (p5Instance) board.calculateTransform(p5Instance.width, p5Instance.height);

        for (let i = 0; i < viewIndex && i < liveMoves.length; i++) {
            if (liveMoves[i]) board.applyMoveRecord(liveMoves[i]);
        }

        renderTurnOrder();

        const viewingLatest = viewIndex >= liveMoves.length;
        if ((isScoring() || isFinished()) && viewingLatest) {
            canonicalIndexMap = board.computeCanonicalIndexMap();
            territory = board.calculateTerritory(deadChains, canonicalIndexMap);
        } else {
            canonicalIndexMap = null;
            territory = null;
        }
    } finally {
        isRebuilding = false;
        if (rebuildPending) {
            rebuildPending = false;
            rebuildBoardToView();
        }
    }
}


// History navigation functions
function goToFirstMove() {
    if (viewIndex === 0) return;
    viewIndex = 0;
    isViewingHistory = true;
    rebuildBoardToView();
    renderHistoryControls();
    renderPlayerCards();
    if (p5Instance) p5Instance.redraw();
}

function goToPrevMove() {
    if (viewIndex <= 0) {
        stopAllHolds();
        return;
    }
    viewIndex--;
    isViewingHistory = true;
    rebuildBoardToView();
    renderHistoryControls();
    renderPlayerCards();
    if (p5Instance) p5Instance.redraw();
}

function goToNextMove() {
    if (viewIndex >= liveMoves.length) {
        stopAllHolds();
        return;
    }
    viewIndex++;
    if (viewIndex >= liveMoves.length) isViewingHistory = false;
    rebuildBoardToView();
    renderHistoryControls();
    renderPlayerCards();
    if (p5Instance) p5Instance.redraw();
}

function goToLastMove() {
    if (viewIndex >= liveMoves.length) return;
    viewIndex = liveMoves.length;
    isViewingHistory = false;
    rebuildBoardToView();
    renderHistoryControls();
    renderPlayerCards();
    if (p5Instance) p5Instance.redraw();
}


// Setup hold-to-repeat behavior for a button
// Single click fires once, hold fires once then delays, then repeats quickly
let mouseHoldState = null;

function setupHoldToRepeat(button, action) {
    const INITIAL_DELAY = 400; // ms before repeat starts
    const REPEAT_INTERVAL = 50; // ms between repeats
    
    function startHold(e) {
        e.preventDefault();
        
        // Clear any existing mouse hold state
        stopMouseHold();
        
        // Fire once immediately
        action();
        
        // Set up delayed repeat
        mouseHoldState = {
            timeoutId: setTimeout(() => {
                // Start rapid repeat
                if (mouseHoldState) {
                    mouseHoldState.intervalId = setInterval(action, REPEAT_INTERVAL);
                }
            }, INITIAL_DELAY)
        };
    }
    
    function stopMouseHold() {
        if (mouseHoldState) {
            if (mouseHoldState.timeoutId) clearTimeout(mouseHoldState.timeoutId);
            if (mouseHoldState.intervalId) clearInterval(mouseHoldState.intervalId);
            mouseHoldState = null;
        }
    }
    
    // Mouse events
    button.addEventListener('mousedown', startHold);
    button.addEventListener('mouseup', stopMouseHold);
    button.addEventListener('mouseleave', stopMouseHold);
    
    // Touch events
    button.addEventListener('touchstart', startHold, { passive: false });
    button.addEventListener('touchend', stopMouseHold);
    button.addEventListener('touchcancel', stopMouseHold);
}

// Keyboard hold-to-repeat state (separate from mouse)
let keyboardHoldState = {
    leftArrow: null,
    rightArrow: null
};

function startKeyboardHold(direction, action) {
    const INITIAL_DELAY = 400;
    const REPEAT_INTERVAL = 50;
    
    // Already holding this key
    if (keyboardHoldState[direction]) return;
    
    // Fire once immediately
    action();
    
    // Set up delayed repeat
    keyboardHoldState[direction] = {
        timeoutId: setTimeout(() => {
            if (keyboardHoldState[direction]) {
                keyboardHoldState[direction].intervalId = setInterval(action, REPEAT_INTERVAL);
            }
        }, INITIAL_DELAY)
    };
}

function stopKeyboardHold(direction) {
    const state = keyboardHoldState[direction];
    if (state) {
        if (state.timeoutId) clearTimeout(state.timeoutId);
        if (state.intervalId) clearInterval(state.intervalId);
        keyboardHoldState[direction] = null;
    }
}

// Stop all hold-to-repeat states (called when hitting boundaries)
function stopAllHolds() {
    // Stop mouse hold
    if (mouseHoldState) {
        if (mouseHoldState.timeoutId) clearTimeout(mouseHoldState.timeoutId);
        if (mouseHoldState.intervalId) clearInterval(mouseHoldState.intervalId);
        mouseHoldState = null;
    }
    // Stop keyboard holds
    stopKeyboardHold('leftArrow');
    stopKeyboardHold('rightArrow');
}

function undoToCurrentPosition() {
    if ((mySeat === null && !debugMode) || !isViewingHistory || isFinished() || !isPlaying()) return;

    const updates = {};
    for (let i = viewIndex; i < liveMoves.length; i++) {
        updates[`${G_MOVES}/${i}`] = null;
    }
    updates[G_REQUEST] = null;
    if (isScoring()) {
        updates[G_PHASE] = 'playing';
        updates[G_DEAD_CHAINS] = null;
    }

    // Reset each player's clock to the time recorded in their most recent kept move.
    if (gameSettings?.timeSettings) {
        const lastTimeLeft = {};
        // Walk the move list with a scratch board to know who played each move.
        const scratch = Board.fromSettings(gameSettings);
        for (let i = 0; i < viewIndex; i++) {
            const m = liveMoves[i];
            if (!m) continue;
            const playerNum = scratch.currentTurn?.player;
            scratch.applyMoveRecord(m);
            if (m[M_TIME_LEFT] !== undefined && playerNum > 0) {
                lastTimeLeft[playerNum] = m[M_TIME_LEFT];
            }
        }
        for (const [p, t] of Object.entries(lastTimeLeft)) {
            updates[`${G_CLOCKS}/${p}`] = t;
        }
        // Also clear the clocks for players whose time was never set within viewIndex
        // (i.e. the game clock was started by a move that's being undone).
        for (const playerNum of Object.keys(gameSettings.timeSettings)) {
            if (!(playerNum in lastTimeLeft)) {
                const initial = gameSettings.timeSettings[playerNum]?.maintime;
                updates[`${G_CLOCKS}/${playerNum}`] = initial ?? null;
            }
        }
    }

    gameRef.update(updates, (error) => {
        if (error) console.error('Undo failed:', error);
        else setTimeout(processRandomMoves, 300);
    });
}

function isHost() {
    return currentUser && gameCreatedBy === currentUser.uid;
}

function allSeatsFilled() {
    return requiredSeats.length > 0 && requiredSeats.every(p => !!seats[p]);
}

function startGame() {
    if (!isHost() || !allSeatsFilled()) return;
    gameRef.child(G_PHASE).set('playing');
}

function enterScoring() {
    if (!canMakeMove()) return;
    const updates = {
        [G_PHASE]:       'scoring',
        [G_DEAD_CHAINS]: null,
        [G_REQUEST]:     null,
    };
    // Pause all running clocks (convert expiry timestamps to remaining ms)
    for (const [p, val] of Object.entries(clocks)) {
        if (val >= 1e12) {
            updates[`${G_CLOCKS}/${p}`] = Math.max(0, val - serverNow());
        }
    }
    gameRef.update(updates);
}

function exitScoring() {
    const updates = { [G_PHASE]: 'playing' };
    // Restart the active player's clock as a running expiry timestamp
    if (board && gameSettings?.timeSettings) {
        const playerNum = board.currentTurn?.player;
        if (playerNum > 0 && gameSettings.timeSettings[playerNum]) {
            const val = clocks[playerNum];
            if (val !== undefined && val !== null && val < 1e12 && val > 0) {
                updates[`${G_CLOCKS}/${playerNum}`] = serverNow() + val;
            }
        }
    }
    gameRef.update(updates);
}

function toggleDeadChain(stone) {
    if (!isScoring() || !board || !canonicalIndexMap || isFinished()) return;
    const canonicalIndex = canonicalIndexMap[stone.i];
    if (canonicalIndex === undefined) return;
    const currentState = deadChains[canonicalIndex] || false;
    gameRef.update({
        [`${G_DEAD_CHAINS}/${canonicalIndex}`]: !currentState,
        [G_REQUEST]: null,
    });
}

function acceptScore() {
    if (!isScoring() || mySeat === null || acceptCooldown || isFinished()) return;
    const updates = {};
    if (!request) {
        updates[G_REQUEST] = { [RQ_TYPE]: 'accept', [RQ_AGREES]: { [mySeat]: true } };
    } else {
        updates[`${G_REQUEST}/${RQ_AGREES}/${mySeat}`] = true;
    }
    gameRef.update(updates, (error) => {
        if (!error) checkAllAccepted();
    });
}

function checkAllAccepted() {
    gameRef.child(G_REQUEST).once('value', (snapshot) => {
        const req = snapshot.val();
        if (!req || req[RQ_TYPE] !== 'accept') return;
        const agreed = req[RQ_AGREES] || {};
        const allAccepted = requiredSeats.every(p => agreed[p] === true);
        if (allAccepted) {
            gameRef.update({ [G_PHASE]: 'finished', [G_REQUEST]: null });
        }
    });
}

function processRandomMoves() {
    if (!board || !isPlaying()) return;
    if (isViewingHistory) return;
    if (hasSoleWinner()) return;
    if (board.currentTurn.player !== 0) return;

    const currentTurn = board.currentTurn;
    const candidates = board.nodes.filter(node => board.tryMove(node.i, currentTurn.color) !== null);

    let moveRecord;
    if (candidates.length === 0) {
        moveRecord = { [M_PASS]: 1 };
    } else {
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        moveRecord = { [M_INDEX]: picked.i, [M_COLOR]: currentTurn.color };
        // No timeLeft for random player (player === 0)
    }

    const updates = {};
    updates[`${G_MOVES}/${liveMoves.length}`] = moveRecord;
    gameRef.update(updates, (error) => {
        if (error) {
            console.error('Random move update failed:', error);
        } else {
            setTimeout(processRandomMoves, 1000);
        }
    });
}

function takeSeat(playerNum) {
    if (!currentUser) {
        console.error('User not authenticated');
        return;
    }

    // Seats can only be changed in the lobby
    if (!isLobby()) return;
    
    // If clicking my own seat, leave it
    if (mySeat === playerNum) {
        seatsRef.child(playerNum).remove();
        return;
    }
    
    // Check if seat is already taken by someone else
    if (seats[playerNum] && seats[playerNum] !== currentUser.uid) {
        console.log('Seat already taken');
        return;
    }
    
    // If I'm already in a different seat, leave it first
    const updates = {};
    if (mySeat !== null && mySeat !== playerNum) {
        updates[mySeat] = null;
    }
    updates[playerNum] = currentUser.uid;
    
    seatsRef.update(updates);
}

function isMyTurn() {
    if (!board || !isPlaying()) return false;
    if (mySeat !== null && board.eliminatedPlayers.has(mySeat)) return false;
    if (debugMode && isHost()) return true;
    if (mySeat === null) return false;
    return board.currentTurn.player === mySeat;
}

function hasSoleWinner() {
    if (!board || !isPlaying()) return false;
    const alive = requiredSeats.filter(p => !board.eliminatedPlayers.has(p));
    return alive.length === 1;
}

function canMakeMove() {
    return currentUser && isMyTurn() && !isViewingHistory && !hasSoleWinner();
}

function addMove(i, c, primaryColor = c) {
    if (!canMakeMove()) return;

    // Legality is always checked against the primary (intended) color.
    const { board: nextBoard, reason } = board.tryMoveReason(i, primaryColor);
    if (!nextBoard) {
        // If c === primaryColor this is a genuine illegal move by the player.
        // If c !== primaryColor the traitor color was rolled — the move is forced through anyway.
        if (c === primaryColor) {
            const messages = {
                occupied: 'That intersection is occupied.',
                empty:    'That intersection is already empty.',
                suicide:  'That move would be suicidal.',
                ko:       'That move is forbidden by the ko rule.',
                'forbidden-chain-size': 'That move would create a forbidden chain size.',
            };
            showToast(messages[reason] || 'Illegal move.');
            return;
        }
        // Forced traitor move: still need to check the spot isn't occupied by another stone.
        if (reason === 'occupied') {
            showToast('That intersection is occupied.');
            return;
        }
        // Suicide/ko with traitor color: force the move. applyMoveRecord handles capture.
    }

    const playerNum = board.currentTurn.player;
    const moveRecord = { [M_INDEX]: i, [M_COLOR]: c };

    // Add timeLeft if this player has time settings and is a human player
    if (playerNum > 0 && gameSettings.timeSettings?.[playerNum]) {
        const timeLeft = computeTimeLeft(playerNum);
        if (timeLeft !== null) moveRecord[M_TIME_LEFT] = timeLeft;
    }

    const updates = {};
    updates[`${G_MOVES}/${liveMoves.length}`] = moveRecord;

    // Update clocks using nextBoard (always from the primary-color check).
    // If nextBoard is null (forced traitor move), advance turn order manually for clock purposes.
    if (gameSettings.timeSettings) {
        const timeLeft = computeTimeLeft(playerNum);
        if (timeLeft !== null) updates[`${G_CLOCKS}/${playerNum}`] = timeLeft;
        const clockNextBoard = nextBoard || board.tryPass(); // tryPass just advances turn order
        const nextTurn = clockNextBoard.currentTurn;
        if (nextTurn && nextTurn.player > 0 && gameSettings.timeSettings[nextTurn.player]) {
            const nextPlayerClock = clocks[nextTurn.player];
            if (nextPlayerClock !== undefined && nextPlayerClock !== null) {
                const remaining = nextPlayerClock >= 1e12
                    ? Math.max(0, nextPlayerClock - serverNow())
                    : nextPlayerClock;
                updates[`${G_CLOCKS}/${nextTurn.player}`] = serverNow() + remaining;
            }
        }
    }

    gameRef.update(updates, (error) => {
        if (error) {
            console.error('Update failed:', error);
        } else {
            setTimeout(processRandomMoves, 1000);
        }
    });
}

function addPass() {
    if (!canMakeMove()) return;

    const playerNum = board.currentTurn.player;
    const moveRecord = { [M_PASS]: 1 };
    const updates = {};
    updates[`${G_MOVES}/${liveMoves.length}`] = moveRecord;

    if (gameSettings.timeSettings && playerNum > 0) {
        const timeLeft = computeTimeLeft(playerNum);
        if (timeLeft !== null) updates[`${G_CLOCKS}/${playerNum}`] = timeLeft;
        const nextBoard = board.tryPass();
        const nextTurn = nextBoard?.currentTurn;
        if (nextTurn && nextTurn.player > 0 && gameSettings.timeSettings[nextTurn.player]) {
            const nextPlayerClock = clocks[nextTurn.player];
            if (nextPlayerClock !== undefined && nextPlayerClock !== null) {
                const remaining = nextPlayerClock >= 1e12
                    ? Math.max(0, nextPlayerClock - serverNow())
                    : nextPlayerClock;
                updates[`${G_CLOCKS}/${nextTurn.player}`] = serverNow() + remaining;
            }
        }
    }

    gameRef.update(updates, (error) => {
        if (error) console.error('Pass update failed:', error);
        else setTimeout(processRandomMoves, 1000);
    });
}

function revealStone(i) {
    if (!canMakeMove()) return;
    const updates = {};
    updates[`${G_MOVES}/${liveMoves.length}`] = { [M_REVEALED]: i };
    gameRef.update(updates, (error) => {
        if (error) console.error('Reveal update failed:', error);
    });
}

function addElimination(playerNum, reason) {
    const updates = {};
    updates[`${G_MOVES}/${liveMoves.length}`] = { [M_ELIMINATED]: playerNum, [M_ELIM_REASON]: reason };
    gameRef.update(updates, (error) => {
        if (error) console.error('Elimination update failed:', error);
        else setTimeout(processRandomMoves, 300);
    });
}

function resign() {
    if (!mySeat || !isPlaying() || board.eliminatedPlayers.has(mySeat)) return;
    if (!confirm('Resign from the game?')) return;
    addElimination(mySeat, 'resign');
}

function triggerAndSubmitPower(playerNum, powerIndex) {
    if (!canMakeMove() || board.currentSequence !== null) return;
    const clone = board.triggerPower(playerNum, powerIndex);
    if (!clone) {
        console.error('Cannot trigger power');
        return;
    }
    const updates = {};
    updates[`${G_MOVES}/${liveMoves.length}`] = { [M_POWER]: powerIndex };
    gameRef.update(updates, (error) => {
        if (error) console.error('Power trigger update failed:', error);
        else setTimeout(processRandomMoves, 1000);
    });
}

function calculateScores() {
    if (!territory) return {};
    
    const scores = {};
    let maxScore = 0;
    for (const [nodeIndex, owner] of Object.entries(territory)) {
        if (owner > 0) {
            scores[owner] = (scores[owner] || 0) + 1;
            if (scores[owner] > maxScore) {
                maxScore = scores[owner];
            }
        }
    }
    scores.maxScore = maxScore;
    return scores;
}

// Cache for player display names
const playerDisplayNames = {};

// Track if player cards have been initialized
let playerCardsInitialized = false;

// Create a player card element
function createPlayerCard(playerNum, containerId) {
    const card = document.createElement('div');
    card.className = 'player-card';
    card.id = `${containerId}-card-${playerNum}`;
    card.onclick = () => takeSeat(playerNum);

    const stoneSz = containerId === 'top' ? 24 : 32;
    const playerTurn = (gameSettings?.mainSequence?.find(t => t.player === playerNum))
        || { player: playerNum, color: playerNum };
    const dpr = window.devicePixelRatio || 1;
    const stoneCanvas = document.createElement('canvas');
    stoneCanvas.width  = Math.round(stoneSz * dpr);
    stoneCanvas.height = Math.round(stoneSz * dpr);
    stoneCanvas.style.width  = stoneSz + 'px';
    stoneCanvas.style.height = stoneSz + 'px';
    stoneCanvas.style.flexShrink = '0';
    stoneCanvas.style.display = 'block';
    const stoneCtx = stoneCanvas.getContext('2d');
    stoneCtx.scale(dpr, dpr);
    // Draw a simple stone circle (no traitor/triangle decorations on the player card)
    const r = stoneSz / 2;
    const [fr, fg, fb] = stoneColors[playerTurn.color];
    const [sr, sg, sb] = strokeColors[playerTurn.color];
    stoneCtx.beginPath();
    stoneCtx.arc(r, r, r - 1, 0, Math.PI * 2);
    stoneCtx.fillStyle = `rgb(${fr},${fg},${fb})`;
    stoneCtx.fill();
    stoneCtx.strokeStyle = `rgb(${sr},${sg},${sb})`;
    stoneCtx.lineWidth = 1.5;
    stoneCtx.stroke();
    card.appendChild(stoneCanvas);

    const info = document.createElement('div');
    info.className = 'player-info';

    const label = document.createElement('div');
    label.className = 'player-label';
    label.textContent = `Player ${playerNum}`;
    info.appendChild(label);

    const nameDisplay = document.createElement('div');
    nameDisplay.className = 'player-uid';
    nameDisplay.id = `${containerId}-name-${playerNum}`;
    info.appendChild(nameDisplay);

    const scoreDisplay = document.createElement('div');
    scoreDisplay.className = 'player-score';
    scoreDisplay.id = `${containerId}-score-${playerNum}`;
    info.appendChild(scoreDisplay);

    const clockDisplay = document.createElement('div');
    clockDisplay.className = 'player-clock';
    clockDisplay.id = `${containerId}-clock-${playerNum}`;
    clockDisplay.style.display = 'none';
    info.appendChild(clockDisplay);

    const powersDisplay = document.createElement('div');
    powersDisplay.className = 'player-powers';
    powersDisplay.id = `${containerId}-powers-${playerNum}`;
    info.appendChild(powersDisplay);

    card.appendChild(info);
    return card;
}

// Initialize player card elements in both containers
function initPlayerCards() {
    if (playerCardsInitialized) return;
    
    // Don't initialize until we know which seats are required
    if (requiredSeats.length === 0) return;
    
    const sidebarContainer = document.getElementById('player-cards');
    const topContainer = document.getElementById('top-player-cards');
    
    if (sidebarContainer) {
        sidebarContainer.innerHTML = '';
        requiredSeats.forEach(playerNum => {
            sidebarContainer.appendChild(createPlayerCard(playerNum, 'sidebar'));
        });
    }
    
    if (topContainer) {
        topContainer.innerHTML = '';
        requiredSeats.forEach(playerNum => {
            topContainer.appendChild(createPlayerCard(playerNum, 'top'));
        });
    }
    
    playerCardsInitialized = true;
}

// Update a single player card (works for both containers)
function updatePlayerCard(playerNum, prefix, scores) {
    const odIndex = seats[playerNum];
    const isOccupied = !!odIndex;
    const isMe = currentUser && odIndex === currentUser.uid;
    const isCurrentTurn = board && board.currentTurn && board.currentTurn.player === playerNum;
    const isEliminated = board?.eliminatedPlayers.has(playerNum);

    // Sole survivor = winner (only one required seat not eliminated)
    const alivePlayers = requiredSeats.filter(p => !board?.eliminatedPlayers.has(p));
    const isSoleWinner = isPlaying() && alivePlayers.length === 1 && alivePlayers[0] === playerNum;

    const card = document.getElementById(`${prefix}-card-${playerNum}`);
    if (!card) return;

    card.className = 'player-card';
    if (isEliminated) card.classList.add('eliminated');
    if (isSoleWinner) card.classList.add('winner');
    if (isCurrentTurn && !isLobby() && !isScoring() && !isEliminated) card.classList.add('current-turn');
    if (isMe && isLobby()) card.classList.add('my-seat'); // green only in lobby
    if (!isLobby()) card.classList.add('locked'); // seats are frozen after game starts
    if (isOccupied && !isMe) {
        card.classList.add('occupied');
    } else {
        card.classList.add('empty');
    }

    const nameDisplay = document.getElementById(`${prefix}-name-${playerNum}`);
    if (nameDisplay) {
        if (isEliminated) {
            nameDisplay.className = 'player-eliminated-label';
            nameDisplay.textContent = 'Eliminated';
        } else if (isSoleWinner) {
            nameDisplay.className = 'player-uid';
            nameDisplay.textContent = isMe ? 'You' : (playerDisplayNames[odIndex] || (isOccupied ? odIndex.substring(0, 12) + '...' : ''));
        } else if (isOccupied) {
            nameDisplay.className = 'player-uid';
            if (isMe) {
                nameDisplay.textContent = 'You';
            } else {
                const displayName = playerDisplayNames[odIndex];
                nameDisplay.textContent = displayName || odIndex.substring(0, 12) + '...';
            }
        } else {
            nameDisplay.className = 'player-empty';
            nameDisplay.textContent = 'Click to join';
        }
    }

    const scoreDisplay = document.getElementById(`${prefix}-score-${playerNum}`);
    if (scoreDisplay) {
        if (isSoleWinner) {
            scoreDisplay.innerHTML = '🏆 Winner';
            scoreDisplay.className = 'player-score winner';
            scoreDisplay.style.visibility = 'visible';
        } else {
            const viewingFinalPosition = viewIndex >= liveMoves.length;
            const shouldShowScores = (isScoring() || isFinished()) && viewingFinalPosition;
            if (shouldShowScores) {
                const score = scores[playerNum] || 0;
                const scoreText = `Score: ${score}`;
                if (isFinished()) {
                    const isWinner = scores.maxScore > 0 && score === scores.maxScore;
                    scoreDisplay.innerHTML = isWinner ? `🏆 ${scoreText}` : scoreText;
                    scoreDisplay.className = 'player-score' + (isWinner ? ' winner' : '');
                } else {
                    const hasAccepted = request?.[RQ_AGREES]?.[playerNum] === true;
                    scoreDisplay.textContent = hasAccepted ? `${scoreText} ✓` : scoreText;
                    scoreDisplay.className = 'player-score' + (hasAccepted ? ' accepted' : '');
                }
                scoreDisplay.style.visibility = 'visible';
            } else {
                scoreDisplay.textContent = 'Score: 00';
                scoreDisplay.className = 'player-score';
                scoreDisplay.style.visibility = 'hidden';
            }
        }
    }

    const clockDisplay = document.getElementById(`${prefix}-clock-${playerNum}`);
    if (clockDisplay) {
        const ms = getDisplayTime(playerNum);
        if (ms !== null && gameSettings?.timeSettings?.[playerNum]) {
            clockDisplay.textContent = formatTime(ms);
            clockDisplay.style.display = '';
            const isRunning = clocks[playerNum] >= 1e12;
            clockDisplay.classList.toggle('clock-paused', !isRunning);
        } else {
            clockDisplay.style.display = 'none';
        }
    }

    const powersDisplay = document.getElementById(`${prefix}-powers-${playerNum}`);
    if (powersDisplay && board) {
        const playerPowers = board.powers[playerNum] || [];
        if (playerPowers.length > 0) {
            powersDisplay.style.display = '';
            powersDisplay.innerHTML = '';
            for (const pw of playerPowers) {
                const item = document.createElement('span');
                item.className = 'power-item';
                drawActionPreviewCanvas(item, pw.sequence, 16);
                const usesLabel = document.createElement('span');
                usesLabel.className = 'action-uses-label';
                usesLabel.textContent = `×${pw.usesLeft}`;
                item.appendChild(usesLabel);
                powersDisplay.appendChild(item);
            }
        } else {
            powersDisplay.style.display = 'none';
        }
    }
}

function drawActionPreviewCanvas(container, sequence, stoneSize) {
    const padding = 4;
    const slotW = stoneSize + padding;
    const w = sequence.length * slotW + padding;
    const h = stoneSize + padding * 2;
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    canvas.style.display = 'block';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const p = createCanvas2DAdapter(ctx);
    const cy = h / 2;
    for (let i = 0; i < sequence.length; i++) {
        const cx = i * slotW + slotW / 2 + padding / 2;
        drawMoveStone(p, cx, cy, sequence[i], stoneSize);
    }
}

function renderTurnOrder() {
    if (!board) return;

    const showOrder = isPlaying() || isScoring();

    const mainContainer = document.getElementById('turn-order-container');
    const sidebarContainer = document.getElementById('sidebar-turn-order-container');

    if (!showOrder) {
        if (mainContainer) mainContainer.style.display = 'none';
        if (sidebarContainer) sidebarContainer.style.display = 'none';
        return;
    }

    if (mainContainer) mainContainer.style.display = 'flex';
    if (sidebarContainer) sidebarContainer.style.display = 'flex';

    const seq = board.getActiveSequence();
    const idx = board.getActiveIndex();
    const activePhase = board.getActivePhase();

    if (!turnOrderDisplay && mainContainer) {
        turnOrderDisplay = new TurnOrderDisplay('turn-order-container');
    }
    if (!sidebarTurnOrderDisplay && sidebarContainer) {
        sidebarTurnOrderDisplay = new TurnOrderDisplay('sidebar-turn-order-container');
    }

    if (turnOrderDisplay) turnOrderDisplay.update(seq, idx, activePhase);
    if (sidebarTurnOrderDisplay) sidebarTurnOrderDisplay.update(seq, idx, activePhase);
}

async function renderPlayerCards() {
    // Initialize cards if not already done
    if (!playerCardsInitialized) {
        initPlayerCards();
    }

    // Calculate scores if in scoring mode or finished
    const scores = (isScoring() || isFinished()) ? calculateScores() : {};

    // Fetch display names for all seated players (non-blocking for UI)
    const namePromises = [];
    requiredSeats.forEach(playerNum => {
        const odIndex = seats[playerNum];
        if (odIndex && !playerDisplayNames[odIndex]) {
            namePromises.push(
                getDisplayName(odIndex).then(name => {
                    if (name) {
                        playerDisplayNames[odIndex] = name;
                        // Update both containers after fetching
                        updatePlayerCard(playerNum, 'sidebar', scores);
                        updatePlayerCard(playerNum, 'top', scores);
                    }
                })
            );
        }
    });

    // Update all cards in both containers
    requiredSeats.forEach(playerNum => {
        updatePlayerCard(playerNum, 'sidebar', scores);
        updatePlayerCard(playerNum, 'top', scores);
    });

    // Wait for name fetches to complete
    await Promise.all(namePromises);
}

// Populate a game controls container with the appropriate buttons/status
function populateGameControls(container) {
    if (!container) return;
    container.innerHTML = '';

    if (isFinished()) {
        const status = document.createElement('div');
        status.className = 'game-status game-over-status';
        status.textContent = 'Game Over';
        container.appendChild(status);
    } else if (isHost() && isLobby()) {
        const filled = allSeatsFilled();
        const startBtn = document.createElement('button');
        startBtn.className = 'btn-primary start-game-btn';
        startBtn.textContent = filled ? 'Start Game' : 'Waiting for players...';
        startBtn.disabled = !filled;
        startBtn.onclick = startGame;
        container.appendChild(startBtn);
    } else if (!gameLoaded) {
        const status = document.createElement('div');
        status.className = 'game-status';
        status.textContent = 'Loading game...';
        container.appendChild(status);
    } else if (isLobby()) {
        const status = document.createElement('div');
        status.className = 'game-status';
        status.textContent = 'Waiting for host to start...';
        container.appendChild(status);
    } else if (isScoring()) {
        const btnContainer = document.createElement('div');
        btnContainer.className = 'scoring-buttons';

        if (mySeat !== null) {
            const hasAccepted = request?.[RQ_AGREES]?.[mySeat] === true;
            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'btn-primary accept-score-btn';
            acceptBtn.textContent = hasAccepted ? 'Accepted ✓' : 'Accept Score';
            acceptBtn.disabled = hasAccepted || acceptCooldown;
            if (!hasAccepted && !acceptCooldown) {
                acceptBtn.onclick = acceptScore;
            }
            btnContainer.appendChild(acceptBtn);
        }

        const exitBtn = document.createElement('button');
        exitBtn.className = 'btn-secondary exit-scoring-btn';
        exitBtn.textContent = 'Back to Game';
        exitBtn.onclick = exitScoring;
        btnContainer.appendChild(exitBtn);

        container.appendChild(btnContainer);
    } else {
        const atEnd = viewIndex >= liveMoves.length;
        const canUndo = (mySeat !== null || debugMode) && isViewingHistory && !atEnd && isPlaying();

        if (canUndo) {
            const undoBtn = document.createElement('button');
            undoBtn.className = 'undo-btn';
            undoBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg> Undo to here`;
            undoBtn.onclick = undoToCurrentPosition;
            container.appendChild(undoBtn);
        } else if (canMakeMove()) {
            // Power buttons (only when in main sequence)
            const effectiveSeat = mySeat !== null ? mySeat : (debugMode ? board.currentTurn.player : null);
            if (board.getActivePhase() === 'main' && effectiveSeat !== null) {
                const playerPowers = board.powers[effectiveSeat] || [];
                for (let pwIdx = 0; pwIdx < playerPowers.length; pwIdx++) {
                    const pw = playerPowers[pwIdx];
                    if (pw.usesLeft > 0) {
                        const actionBtn = document.createElement('button');
                        actionBtn.className = 'btn-secondary use-action-btn';
                        actionBtn.onclick = () => triggerAndSubmitPower(effectiveSeat, pwIdx);
                        drawActionPreviewCanvas(actionBtn, pw.sequence, 20);
                        const usesLabel = document.createElement('span');
                        usesLabel.textContent = `×${pw.usesLeft}`;
                        actionBtn.appendChild(usesLabel);
                        container.appendChild(actionBtn);
                    }
                }
            }

            const passBtn = document.createElement('button');
            passBtn.className = 'btn-secondary pass-btn';
            passBtn.textContent = 'Pass';
            passBtn.onclick = addPass;
            container.appendChild(passBtn);

            if (mySeat !== null && !board?.eliminatedPlayers.has(mySeat)) {
                const resignBtn = document.createElement('button');
                resignBtn.className = 'btn-secondary resign-btn';
                resignBtn.textContent = 'Resign';
                resignBtn.onclick = resign;
                container.appendChild(resignBtn);
            }

            const scoringBtn = document.createElement('button');
            scoringBtn.className = 'btn-secondary enter-scoring-btn';
            scoringBtn.textContent = 'Go to Scoring';
            scoringBtn.onclick = enterScoring;
            container.appendChild(scoringBtn);
        }
    }
}

function renderGameControls() {
    // Render to sidebar container
    populateGameControls(document.getElementById('game-controls'));
    // Render to bottom bar container
    populateGameControls(document.getElementById('bottom-game-controls'));
}

function renderHistoryControls() {
    const totalMoves = liveMoves.length;
    const atStart = viewIndex === 0;
    const atEnd = viewIndex >= totalMoves;
    
    const historyHtml = `
        <div class="history-nav">
            <button class="history-btn btn-first" ${atStart ? 'disabled' : ''} aria-label="First move">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6zM6 6h2v12H6z"/></svg>
            </button>
            <button class="history-btn btn-prev" ${atStart ? 'disabled' : ''} aria-label="Previous move">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <span class="history-counter">${viewIndex} / ${totalMoves}</span>
            <button class="history-btn btn-next" ${atEnd ? 'disabled' : ''} aria-label="Next move">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
            <button class="history-btn btn-last" ${atEnd ? 'disabled' : ''} aria-label="Last move">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z"/></svg>
            </button>
        </div>
    `;
    
    // Render to both containers
    const bottomContainer = document.getElementById('history-controls');
    const sidebarContainer = document.getElementById('sidebar-history-controls');
    
    if (bottomContainer) bottomContainer.innerHTML = historyHtml;
    if (sidebarContainer) sidebarContainer.innerHTML = historyHtml;
    
    // Add event listeners to all buttons (using class selectors)
    document.querySelectorAll('.btn-first').forEach(btn => btn.onclick = goToFirstMove);
    document.querySelectorAll('.btn-last').forEach(btn => btn.onclick = goToLastMove);
    
    // Add hold-to-repeat for prev/next buttons
    document.querySelectorAll('.btn-prev').forEach(btn => {
        setupHoldToRepeat(btn, goToPrevMove);
    });
    document.querySelectorAll('.btn-next').forEach(btn => {
        setupHoldToRepeat(btn, goToNextMove);
    });
    
    // Also update game controls since undo button state may have changed
    renderGameControls();
}

function createSketch() {
    return (p) => {

        p.setup = function() {
            // Use default pixel density for crisp rendering on high-DPI screens
            const container = document.getElementById('board-container');
            
            // Get available size, accounting for the container's actual dimensions
            // Use clientWidth/clientHeight which don't include scrollbars
            let availWidth = container.clientWidth;
            let availHeight = container.clientHeight;
            
            // If dimensions are 0, the layout isn't ready yet - use a fallback
            if (availWidth === 0 || availHeight === 0) {
                availWidth = window.innerWidth;
                availHeight = window.innerHeight - 200; // Rough estimate for bars
            }
            
            const size = Math.min(availWidth, availHeight);
            let canvas = p.createCanvas(size, size);
            canvas.parent(container);
            p.noLoop();
            
            // Initialize board
            initializeBoard();
            
            // Re-check size after a short delay to handle late layout
            setTimeout(() => {
                p.windowResized();
            }, 100);
        };
        
        function initializeBoard() {
            board = Board.fromSettings(gameSettings);
            board.calculateTransform(p.width, p.height);

            if (isScoring() || isFinished()) {
                canonicalIndexMap = board.computeCanonicalIndexMap();
                territory = board.calculateTerritory(deadChains, canonicalIndexMap);
            }

            p.redraw();
        }

        p.draw = function() {
            p.background(255, 193, 140);

            if (board) {
                const showScoring = isScoring() || isFinished();
                const viewer = mySeat !== null ? mySeat : null;
                board.draw(p, showScoring ? deadChains : null, showScoring ? canonicalIndexMap : null, showScoring ? territory : null, viewer);

                if (hoverNode && canMakeMove() && !showScoring) {
                    board.drawGhostStoneAt(p, hoverNode, board.currentTurn.color, board.currentTurn);
                }
            }
        };

        p.mouseMoved = function() {
            if (!board) return;
            let newHover = null;
            if (isScoring() && !isFinished() && !isViewingHistory) {
                newHover = board.findHover(p.mouseX, p.mouseY);
                if (newHover && newHover.color <= 0) newHover = null;
            } else if (!isFinished() && canMakeMove()) {
                newHover = board.findHover(p.mouseX, p.mouseY);
                if (newHover) {
                    const viewer = mySeat !== null ? mySeat : null;
                    const turnColor = board.currentTurn.color;
                    if (turnColor === 0) {
                        // Color 0 = remove: only legal on occupied (visible) nodes
                        const visiblyOccupied = newHover.color > 0
                            && (newHover.onlyVisibleTo === null || newHover.onlyVisibleTo === viewer);
                        if (!visiblyOccupied) newHover = null;
                    } else {
                        // Normal move: only legal on empty nodes (hidden stones treated as empty)
                        const hasHidden = viewer !== null && board.hasHiddenStones(viewer);
                        const visiblyOccupied = newHover.color !== 0
                            && (newHover.onlyVisibleTo === null || newHover.onlyVisibleTo === viewer);
                        if (hasHidden ? visiblyOccupied : newHover.color !== 0) newHover = null;
                    }
                }
            }
            if (hoverNode !== newHover) {
                hoverNode = newHover;
                p.redraw();
            }
        };

        function handlePress(x, y) {
            if (!board || isFinished()) return;
            if (isViewingHistory) return;

            if (isScoring()) {
                const clickedNode = board.findHover(x, y);
                if (clickedNode && clickedNode.color > 0) {
                    toggleDeadChain(clickedNode);
                }
            } else if (canMakeMove()) {
                const clickedNode = board.findHover(x, y);
                if (clickedNode) {
                    const viewer = mySeat !== null ? mySeat : null;
                    const isHiddenFromViewer = clickedNode.color !== 0
                        && clickedNode.onlyVisibleTo !== null
                        && clickedNode.onlyVisibleTo !== viewer;
                    if (isHiddenFromViewer) {
                        revealStone(clickedNode.i);
                    } else {
                        const turn = board.currentTurn;
                        let color = turn.color;
                        if (turn.traitorColor !== undefined) {
                            const pct = turn.traitorPercentage ?? 10;
                            if (Math.random() * 100 < pct) color = turn.traitorColor;
                        }
                        addMove(clickedNode.i, color, turn.color);
                    }
                    hoverNode = null;
                    p.redraw();
                }
            }
        }

        p.mousePressed = function() {
            handlePress(p.mouseX, p.mouseY);
        };

        p.touchStarted = function(event) {
            // Use the first touch point, translated to canvas coordinates
            if (p.touches.length > 0) {
                handlePress(p.touches[0].x, p.touches[0].y);
            } else {
                // Fallback to mouseX/mouseY
                handlePress(p.mouseX, p.mouseY);
            }
            return false; // Prevent default behavior
        };

        p.windowResized = function() {
            const container = document.getElementById('board-container');
            const availWidth = container.clientWidth || container.offsetWidth;
            const availHeight = container.clientHeight || container.offsetHeight;
            const size = Math.min(availWidth, availHeight);
            
            if (size > 0) {
                p.resizeCanvas(size, size);
                if (board) {
                    board.calculateTransform(p.width, p.height);
                    p.redraw();
                }
            }
        };

        p.keyPressed = function() {
            if (p.key === 'd') {
                console.log('phase:', board.getActivePhase());
                console.log('activeSequence:', board.getActiveSequence());
                console.log('activeIndex:', board.getActiveIndex());
                console.log('order:', board.order);
                console.log('currentTurn:', board.currentTurn);
                console.log('seats:', seats);
                console.log('mySeat:', mySeat);
            }
            
            // Arrow key navigation for move history with hold-to-repeat
            if (p.keyCode === p.LEFT_ARROW) {
                startKeyboardHold('leftArrow', goToPrevMove);
                return false; // Prevent default
            } else if (p.keyCode === p.RIGHT_ARROW) {
                startKeyboardHold('rightArrow', goToNextMove);
                return false; // Prevent default
            }
        };
        
        p.keyReleased = function() {
            if (p.keyCode === p.LEFT_ARROW) {
                stopKeyboardHold('leftArrow');
                return false;
            } else if (p.keyCode === p.RIGHT_ARROW) {
                stopKeyboardHold('rightArrow');
                return false;
            }
        };
    };
}

// Clock helper functions

function getDisplayTime(playerNum) {
    if (!(playerNum in clocks)) return null;
    const val = clocks[playerNum];
    if (val >= 1e12) return Math.max(0, val - serverNow());
    return val;
}

function formatTime(ms) {
    if (ms <= 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function startClockInterval() {
    if (clockInterval) clearInterval(clockInterval);
    clockInterval = setInterval(() => {
        if (!isPlaying()) return;
        renderPlayerCards();
        // Timeout check: report loss by time for any player whose clock has expired.
        // Own clock is reported immediately; other players' clocks require a 5-second
        // buffer to account for network lag from an offline timed-out client.
        if (!isViewingHistory && board) {
            for (const p of requiredSeats) {
                if (board.eliminatedPlayers.has(p)) continue;
                if (!gameSettings?.timeSettings?.[p]) continue;
                const val = clocks[p];
                if (val === undefined || val === null || val < 1e12) continue; // paused
                const remaining = val - serverNow();
                const isOwn = p === mySeat;
                const threshold = isOwn ? 0 : -5000;
                // Only seated clients report other players' timeouts
                if (remaining <= threshold && (isOwn || mySeat !== null)) {
                    addElimination(p, 'timeout');
                    break;
                }
            }
        }
    }, 200);
}

function computeTimeLeft(playerNum) {
    if (!gameSettings.timeSettings?.[playerNum]) return null;
    const ts = gameSettings.timeSettings[playerNum];
    const clockVal = clocks[playerNum];
    if (clockVal === undefined || clockVal === null) return null;
    let remaining = clockVal >= 1e12 ? Math.max(0, clockVal - serverNow()) : clockVal;
    remaining += ts.increment || 0;
    if (ts.cap > 0) remaining = Math.min(remaining, ts.cap);
    return remaining;
}