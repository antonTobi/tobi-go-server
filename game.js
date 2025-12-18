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
let gameCreatedBy = null;  // Host user ID
let gameStarted = false;   // Whether the game has started
let inScoring = false;     // Whether we're in scoring mode
let deadChains = {};       // { canonicalIndex: true/false }
let canonicalIndexMap = null; // { nodeIndex: canonicalIndex } - computed when entering scoring
let territory = null;      // { nodeIndex: ownerColor } - computed when deadChains changes
let acceptedScores = {};   // { playerNumber: true } - players who accepted the current score
let gameOver = false;      // Whether the game has ended
let acceptCooldown = false; // Prevents accepting immediately after a chain toggle
let seats = {};         // { playerNumber: odIndex }
let mySeat = null;       // The player number I'm sitting in (1-5), or null
let requiredSeats = [];  // Player numbers that need seats (derived from turnCycle)
let p5Instance = null;   // Reference to p5 sketch for redrawing

// History navigation state
let liveMoves = [];      // All moves from database, stored separately
let viewIndex = 0;       // Current move index being viewed (0 = initial board, liveMoves.length = latest)
let isViewingHistory = false; // True if user is viewing past moves (not auto-advancing)

// Debug
window._debugBoard = () => board;
window._debugSeats = () => ({ seats, mySeat, requiredSeats });
window._debugHistory = () => ({ liveMoves, viewIndex, isViewingHistory, totalMoves: liveMoves.length });

// Initialize game
initGame();

// Setup sidebar toggle
function setupSidebarToggle() {
    const sidebar = document.getElementById('players-sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle');
    const gameContainer = document.querySelector('.game-container');
    
    if (toggleBtn && sidebar && gameContainer) {
        // Toggle button handler - works for both click and touch
        const toggleSidebar = (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebar.classList.toggle('collapsed');
            gameContainer.classList.toggle('sidebar-collapsed');
        };
        
        toggleBtn.addEventListener('click', toggleSidebar);
        toggleBtn.addEventListener('touchend', toggleSidebar, { passive: false });
        
        // Prevent toggle button touchstart from propagating but don't block the event
        toggleBtn.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });
        
        // Prevent clicks/touches on sidebar content from reaching the canvas
        // But don't block events on elements inside the sidebar
        sidebar.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        sidebar.addEventListener('click', (e) => {
            e.stopPropagation();
        });
        sidebar.addEventListener('touchstart', (e) => {
            e.stopPropagation();
        }, { passive: true });
        sidebar.addEventListener('touchend', (e) => {
            e.stopPropagation();
        }, { passive: true });
    }
    
    // Setup home button for mobile
    const homeBtn = document.querySelector('.home-btn');
    if (homeBtn) {
        homeBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            window.location.href = homeBtn.href;
        }, { passive: false });
    }
}

// Call setup when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSidebarToggle);
} else {
    setupSidebarToggle();
}

function initGame() {
    gameRef = db.ref(`games/${gameId}`);
    seatsRef = db.ref(`games/${gameId}/seats`);
    movesRef = db.ref(`games/${gameId}/moves`);

    // Load game data first
    gameRef.once('value')
        .then((snapshot) => {
            const gameData = snapshot.val();
            if (!gameData || !gameData.settings) {
                alert('Game not found');
                window.location.href = '/';
                return;
            }
            
            gameSettings = gameData.settings;
            gameCreatedBy = gameData.createdBy;
            gameStarted = gameData.started || false;
            inScoring = gameData.inScoring || false;
            gameOver = gameData.gameOver || false;
            deadChains = gameData.deadChains || {};
            acceptedScores = gameData.acceptedScores || {};

            // Determine required seats from turnCycle
            requiredSeats = getRequiredSeats(gameSettings.turnCycle);
            
            // Initialize p5 sketch
            p5Instance = new p5(createSketch());
            
            // Render initial UI
            renderPlayerCards();
            renderGameControls();
            renderHistoryControls();

            // Listen for seat changes
            seatsRef.on('value', handleSeatsChanged);
            
            // Listen for started state changes
            gameRef.child('started').on('value', handleStartedChanged);
            
            // Listen for scoring state changes
            gameRef.child('inScoring').on('value', handleScoringChanged);
            
            // Listen for dead chains changes
            gameRef.child('deadChains').on('value', handleDeadChainsChanged);
            
            // Listen for accepted scores
            gameRef.child('acceptedScores').on('value', handleAcceptedScoresChanged);
            
            // Listen for game over
            gameRef.child('gameOver').on('value', handleGameOverChanged);
            
            // Listen for moves
            movesRef.on('child_added', handleMoveAdded);
            movesRef.on('child_removed', handleMoveRemoved);
        })
        .catch((error) => {
            console.error('Error loading game:', error);
            alert('Failed to load game');
        });
}

function getRequiredSeats(turnCycle) {
    if (!turnCycle) return [1, 2]; // Default to 2-player
    
    const moves = orderFromString(turnCycle);
    const players = new Set();
    
    moves.forEach(move => {
        if (move.player >= 1 && move.player <= 5) {
            players.add(move.player);
        }
    });
    
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
    
    if (move && move.i != null && move.c != null) {
        // Store move in liveMoves array at the correct index
        liveMoves[moveIndex] = move;
        
        // If we're viewing the latest move (not in history mode), auto-advance
        if (!isViewingHistory) {
            viewIndex = liveMoves.length;
            rebuildBoardToView();
        }
        
        renderPlayerCards(); // Update current turn indicator
        renderGameControls(); // Update scoring button visibility
        renderHistoryControls(); // Update navigation buttons
        if (p5Instance) p5Instance.redraw();
    }
}

function handleMoveRemoved(snapshot) {
    const moveIndex = parseInt(snapshot.key);
    
    // Remove this move and all moves after it from liveMoves
    // (Firebase may send multiple child_removed events, so we handle each individually)
    if (moveIndex < liveMoves.length) {
        liveMoves.length = moveIndex;
        
        // Adjust viewIndex if it's now beyond the available moves
        if (viewIndex > liveMoves.length) {
            viewIndex = liveMoves.length;
            isViewingHistory = false;
        }
        
        rebuildBoardToView();
        renderPlayerCards();
        renderGameControls();
        renderHistoryControls();
        if (p5Instance) p5Instance.redraw();
    }
}

function handleStartedChanged(snapshot) {
    const wasStarted = gameStarted;
    gameStarted = snapshot.val() || false;
    
    renderGameControls();
    
    // If game just started and I'm the host, process any pregame random moves
    if (!wasStarted && gameStarted && isHost()) {
        processRandomMoves();
    }
}

function handleScoringChanged(snapshot) {
    const wasScoring = inScoring;
    inScoring = snapshot.val() || false;
    
    // Compute canonical index map when entering scoring
    if (!wasScoring && inScoring && board) {
        canonicalIndexMap = board.computeCanonicalIndexMap();
        territory = board.calculateTerritory(deadChains, canonicalIndexMap);
    } else if (!inScoring) {
        canonicalIndexMap = null;
        territory = null;
    }
    
    renderPlayerCards(); // Update to show/hide scores
    renderGameControls();
    if (p5Instance) p5Instance.redraw();
}

function handleDeadChainsChanged(snapshot) {
    const newDeadChains = snapshot.val() || {};
    
    // If deadChains changed and we're in scoring mode, activate cooldown
    if (inScoring && !gameOver) {
        const changed = JSON.stringify(deadChains) !== JSON.stringify(newDeadChains);
        if (changed) {
            acceptCooldown = true;
            renderGameControls(); // Re-render to show disabled button
            setTimeout(() => {
                acceptCooldown = false;
                renderGameControls();
            }, 2000);
        }
    }
    
    deadChains = newDeadChains;
    
    // Recalculate territory
    if (inScoring && board && canonicalIndexMap) {
        territory = board.calculateTerritory(deadChains, canonicalIndexMap);
    } else {
        territory = null;
    }
    
    renderPlayerCards(); // Update scores
    if (p5Instance) p5Instance.redraw();
}

function handleAcceptedScoresChanged(snapshot) {
    acceptedScores = snapshot.val() || {};
    renderPlayerCards(); // Update checkmarks
    renderGameControls(); // Update button state
}

function handleGameOverChanged(snapshot) {
    gameOver = snapshot.val() || false;
    renderPlayerCards();
    renderGameControls();
    if (p5Instance) p5Instance.redraw();
}

// Rebuild the board state from scratch up to the current viewIndex
function rebuildBoardToView() {
    if (!board || !gameSettings) return;
    
    // Reset board to initial state
    board = Board.fromSettings({
        boardType: gameSettings.boardType || 'grid',
        boardWidth: gameSettings.boardWidth || 9,
        boardHeight: gameSettings.boardHeight || 9,
        pregameSequence: gameSettings.pregameSequence || '',
        turnCycle: gameSettings.turnCycle,
        presetStones: gameSettings.presetStones
    });
    
    // Recalculate transform with current canvas size
    if (p5Instance) {
        board.calculateTransform(p5Instance.width, p5Instance.height);
    }
    
    // Replay moves up to viewIndex
    for (let i = 0; i < viewIndex && i < liveMoves.length; i++) {
        const move = liveMoves[i];
        if (move) {
            if (move.i === -1) {
                board.pass(move.c);
            } else {
                board.placeStone(move.i, move.c);
            }
        }
    }
    
    // If in scoring mode or game over AND viewing latest, recompute canonical index map and territory
    const viewingLatest = viewIndex >= liveMoves.length;
    if ((inScoring || gameOver) && viewingLatest) {
        canonicalIndexMap = board.computeCanonicalIndexMap();
        territory = board.calculateTerritory(deadChains, canonicalIndexMap);
    } else {
        canonicalIndexMap = null;
        territory = null;
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
    if (viewIndex <= 0) return;
    viewIndex--;
    isViewingHistory = true;
    rebuildBoardToView();
    renderHistoryControls();
    renderPlayerCards();
    if (p5Instance) p5Instance.redraw();
}

function goToNextMove() {
    if (viewIndex >= liveMoves.length) return;
    viewIndex++;
    // If we've reached the latest move, exit history mode
    if (viewIndex >= liveMoves.length) {
        isViewingHistory = false;
    }
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

function undoToCurrentPosition() {
    // Only allow undo if: player is seated, viewing history, game not over, game started
    if (mySeat === null || !isViewingHistory || gameOver || !gameStarted) {
        console.error('Cannot undo: conditions not met');
        return;
    }
    
    const targetMoveCount = viewIndex;
    
    // Remove all moves from viewIndex onwards
    const updates = {};
    for (let i = targetMoveCount; i < liveMoves.length; i++) {
        updates[i] = null;
    }
    
    // Also exit scoring mode if we're in it
    if (inScoring) {
        gameRef.update({
            inScoring: false,
            deadChains: null,
            acceptedScores: null
        });
    }
    
    movesRef.update(updates, (error) => {
        if (error) {
            console.error('Undo failed:', error);
            return;
        }
        
        console.log(`Undo successful: removed moves from ${targetMoveCount} to ${liveMoves.length - 1}`);
        
        // Update local state
        liveMoves.length = targetMoveCount;
        isViewingHistory = false;
        viewIndex = targetMoveCount;
        
        // Rebuild board to the new position
        rebuildBoardToView();
        renderHistoryControls();
        renderPlayerCards();
        renderGameControls();
        if (p5Instance) p5Instance.redraw();
        
        // Process any random moves that should follow
        setTimeout(processRandomMoves, 500);
    });
}

function isHost() {
    return currentUser && gameCreatedBy === currentUser.uid;
}

function startGame() {
    if (!isHost()) {
        console.error('Only the host can start the game');
        return;
    }
    
    gameRef.child('started').set(true);
}

function enterScoring() {
    if (!canMakeMove()) {
        console.error('Not your turn');
        return;
    }
    
    // Clear dead chains and accepted scores from previous scoring session
    gameRef.update({
        inScoring: true,
        deadChains: null,
        acceptedScores: null
    });
}

function exitScoring() {
    gameRef.child('inScoring').set(false);
}

function toggleDeadChain(stone) {
    if (!inScoring || !board || !canonicalIndexMap || gameOver) return;
    
    const canonicalIndex = canonicalIndexMap[stone.i];
    if (canonicalIndex === undefined) return;
    
    // Toggle the dead state and reset all accepted scores
    const currentState = deadChains[canonicalIndex] || false;
    gameRef.update({
        [`deadChains/${canonicalIndex}`]: !currentState,
        acceptedScores: null
    });
}

function acceptScore() {
    if (!inScoring || mySeat === null || acceptCooldown || gameOver) return;
    
    // Set my acceptance
    gameRef.child('acceptedScores').child(mySeat).set(true, (error) => {
        if (error) {
            console.error('Failed to accept score:', error);
            return;
        }
        
        // Check if all players have accepted
        checkAllAccepted();
    });
}

function checkAllAccepted() {
    // Re-read acceptedScores to get latest
    gameRef.child('acceptedScores').once('value', (snapshot) => {
        const accepted = snapshot.val() || {};
        
        // Check if all required seats have accepted
        const allAccepted = requiredSeats.every(playerNum => accepted[playerNum] === true);
        
        if (allAccepted) {
            // End the game
            gameRef.child('gameOver').set(true);
        }
    });
}

function processRandomMoves() {
    // Process all consecutive random moves (player === 0) until a human player's turn
    // Uses setTimeout to add a 1 second delay between each random move
    
    if (!board || board.currentMove.player !== 0) {
        return; // No random move to process
    }
    
    const currentMove = board.currentMove;
    
    // Find legal intersections
    // TODO: Disallow eye-filling self-atari, but not other self-atari
    // new def of eye-filling: all neighbors same chain
    const candidates = board.nodes.filter(n => n.color === currentMove.from
        && !board.isSuicide(n, currentMove.to));
    
    // Determine the move to submit: either a random candidate or a pass (-1)
    let moveIndex;
    let moveData;
    
    if (candidates.length === 0) {
        // No legal moves available - submit a pass
        console.log('No legal moves for random player, passing');
        moveIndex = liveMoves.length;
        moveData = { i: -1, c: currentMove.to };
    } else {
        // Pick a random candidate
        const pickedMove = candidates[Math.floor(Math.random() * candidates.length)];
        moveIndex = liveMoves.length;
        moveData = { i: pickedMove.i, c: currentMove.to };
    }
    
    // Submit the move via transaction
    const moveRef = movesRef.child(moveIndex);
    moveRef.transaction((currentValue) => {
        if (currentValue !== null) {
            return; // Abort - move already exists
        }
        return moveData;
    }, (error, committed) => {
        if (error) {
            console.error('Random move transaction failed:', error);
        } else if (committed) {
            if (moveData.i === -1) {
                console.log('Random player passed');
            } else {
                console.log('Random move placed at node', moveData.i);
            }
            // Schedule next random move after 1 second delay if needed
            // The move will be applied via handleMoveAdded before this fires
            setTimeout(processRandomMoves, 1000);
        }
    });
}

function takeSeat(playerNum) {
    if (!currentUser) {
        console.error('User not authenticated');
        return;
    }
    
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
    if (!board || mySeat === null || !gameStarted) return false;
    return board.currentMove.player === mySeat;
}

function canMakeMove() {
    // Can only make moves when viewing the latest position (not in history mode)
    return currentUser && isMyTurn() && !isViewingHistory;
}

function addMove(i, c) {
    if (!canMakeMove()) {
        console.error('Not your turn or not authenticated');
        return;
    }
    
    const moveRef = movesRef.child(liveMoves.length);

    moveRef.transaction((currentValue) => {
        if (currentValue !== null) {
            return; // Abort - move already exists
        }
        return { i, c };
    }, (error, committed) => {
        if (error) {
            console.error('Transaction failed:', error);
        } else if (!committed) {
            console.log('Move already made from different client');
        } else {
            console.log('Move added:', i, c);
            // Process any following random moves after 1 second delay
            setTimeout(processRandomMoves, 1000);
        }
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

// Initialize player card elements once
function initPlayerCards() {
    const container = document.getElementById('player-cards');
    if (!container || playerCardsInitialized) return;
    
    container.innerHTML = '';
    
    requiredSeats.forEach(playerNum => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.id = `player-card-${playerNum}`;
        card.onclick = () => takeSeat(playerNum);
        
        // Stone icon
        const stone = document.createElement('div');
        stone.className = `player-stone color-${playerNum}`;
        card.appendChild(stone);
        
        // Player info
        const info = document.createElement('div');
        info.className = 'player-info';
        
        const label = document.createElement('div');
        label.className = 'player-label';
        label.textContent = `Player ${playerNum}`;
        info.appendChild(label);
        
        // Player name/status display (will be updated dynamically)
        const nameDisplay = document.createElement('div');
        nameDisplay.className = 'player-uid';
        nameDisplay.id = `player-name-${playerNum}`;
        info.appendChild(nameDisplay);
        
        // Score display (will be shown/hidden dynamically)
        const scoreDisplay = document.createElement('div');
        scoreDisplay.className = 'player-score';
        scoreDisplay.id = `player-score-${playerNum}`;
        info.appendChild(scoreDisplay);
        
        card.appendChild(info);
        container.appendChild(card);
    });
    
    playerCardsInitialized = true;
}

async function renderPlayerCards() {
    const container = document.getElementById('player-cards');
    if (!container) return;
    
    // Initialize cards if not already done
    if (!playerCardsInitialized) {
        initPlayerCards();
    }
    
    // Calculate scores if in scoring mode or game over
    const scores = (inScoring || gameOver) ? calculateScores() : {};
    
    // Fetch display names for all seated players (non-blocking for UI)
    const namePromises = [];
    requiredSeats.forEach(playerNum => {
        const odIndex = seats[playerNum];
        if (odIndex && !playerDisplayNames[odIndex]) {
            namePromises.push(
                getDisplayName(odIndex).then(name => {
                    if (name) {
                        playerDisplayNames[odIndex] = name;
                        // Update just this player's name display after fetching
                        updatePlayerName(playerNum, odIndex);
                    }
                })
            );
        }
    });
    
    // Update all cards immediately with current data
    requiredSeats.forEach(playerNum => {
        const odIndex = seats[playerNum];
        const isOccupied = !!odIndex;
        const isMe = currentUser && odIndex === currentUser.uid;
        const isCurrentTurn = board && board.currentMove.player === playerNum;
        
        const card = document.getElementById(`player-card-${playerNum}`);
        if (!card) return;
        
        // Update card classes
        card.className = 'player-card';
        if (isCurrentTurn && !inScoring) card.classList.add('current-turn');
        if (isMe) card.classList.add('my-seat');
        if (isOccupied && !isMe) {
            card.classList.add('occupied');
        } else {
            card.classList.add('empty');
        }
        
        // Update name display
        const nameDisplay = document.getElementById(`player-name-${playerNum}`);
        if (nameDisplay) {
            if (isOccupied) {
                nameDisplay.className = 'player-uid';
                if (isMe) {
                    nameDisplay.textContent = 'You';
                } else {
                    // Use display name if available, otherwise truncated UID
                    const displayName = playerDisplayNames[odIndex];
                    nameDisplay.textContent = displayName || odIndex.substring(0, 12) + '...';
                }
            } else {
                nameDisplay.className = 'player-empty';
                nameDisplay.textContent = 'Click to join';
            }
        }
        
        // Update score display
        const scoreDisplay = document.getElementById(`player-score-${playerNum}`);
        if (scoreDisplay) {
            // Only show scores when viewing the final position (not in history)
            const viewingFinalPosition = viewIndex >= liveMoves.length;
            const shouldShowScores = (inScoring || gameOver) && viewingFinalPosition;
            
            if (shouldShowScores) {
                const score = scores[playerNum] || 0;
                const scoreText = `Score: ${score}`;
                
                if (gameOver) {
                    // Game is over - show trophy for winner(s), no checkmarks
                    const isWinner = scores.maxScore > 0 && score === scores.maxScore;
                    scoreDisplay.innerHTML = isWinner ? `🏆 ${scoreText}` : scoreText;
                    scoreDisplay.className = 'player-score' + (isWinner ? ' winner' : '');
                } else {
                    // Still in scoring mode - show checkmarks for accepted
                    const hasAccepted = acceptedScores[playerNum] === true;
                    scoreDisplay.textContent = hasAccepted ? `${scoreText} ✓` : scoreText;
                    scoreDisplay.className = 'player-score' + (hasAccepted ? ' accepted' : '');
                }
                scoreDisplay.style.display = '';
            } else {
                scoreDisplay.textContent = '';
                scoreDisplay.style.display = 'none';
            }
        }
    });
    
    // Wait for name fetches to complete (updates happen via callback above)
    await Promise.all(namePromises);
}

// Helper to update just a player's name (called after async name fetch)
function updatePlayerName(playerNum, odIndex) {
    const isMe = currentUser && odIndex === currentUser.uid;
    const nameDisplay = document.getElementById(`player-name-${playerNum}`);
    if (nameDisplay && odIndex) {
        nameDisplay.className = 'player-uid';
        if (isMe) {
            nameDisplay.textContent = 'You';
        } else {
            const displayName = playerDisplayNames[odIndex];
            nameDisplay.textContent = displayName || odIndex.substring(0, 12) + '...';
        }
    }
}

function renderGameControls() {
    const container = document.getElementById('game-controls');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Show start button only to host and only if game hasn't started
    if (gameOver) {
        // Game over - show final status
        const status = document.createElement('div');
        status.className = 'game-status game-over-status';
        status.textContent = 'Game Over';
        container.appendChild(status);
    } else if (isHost() && !gameStarted) {
        const startBtn = document.createElement('button');
        startBtn.className = 'btn-primary start-game-btn';
        startBtn.textContent = 'Start Game';
        startBtn.onclick = startGame;
        container.appendChild(startBtn);
    } else if (!gameStarted) {
        const status = document.createElement('div');
        status.className = 'game-status';
        status.textContent = 'Waiting for host to start...';
        container.appendChild(status);
    } else if (inScoring) {
        // Scoring mode UI
        const status = document.createElement('div');
        status.className = 'game-status';
        status.textContent = 'Scoring: Click groups to mark dead';
        container.appendChild(status);
        
        // Accept score button (only if seated)
        if (mySeat !== null) {
            const hasAccepted = acceptedScores[mySeat] === true;
            
            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'btn-primary accept-score-btn';
            acceptBtn.textContent = hasAccepted ? 'Score Accepted ✓' : 'Accept Score';
            acceptBtn.disabled = hasAccepted || acceptCooldown;
            if (!hasAccepted && !acceptCooldown) {
                acceptBtn.onclick = acceptScore;
            }
            container.appendChild(acceptBtn);
        }
        
        const exitBtn = document.createElement('button');
        exitBtn.className = 'btn-secondary exit-scoring-btn';
        exitBtn.textContent = 'Back to Game';
        exitBtn.onclick = exitScoring;
        container.appendChild(exitBtn);
    } else {
        // Game in progress - show scoring button for current player
        const status = document.createElement('div');
        status.className = 'game-status';
        status.textContent = 'Game in progress';
        container.appendChild(status);
        
        if (canMakeMove()) {
            const scoringBtn = document.createElement('button');
            scoringBtn.className = 'btn-secondary enter-scoring-btn';
            scoringBtn.textContent = 'Go to Scoring';
            scoringBtn.onclick = enterScoring;
            container.appendChild(scoringBtn);
        }
    }
}

function renderHistoryControls() {
    const container = document.getElementById('history-controls');
    if (!container) return;
    
    const totalMoves = liveMoves.length;
    const atStart = viewIndex === 0;
    const atEnd = viewIndex >= totalMoves;
    
    // Show undo button if: player is seated, viewing history (not at end), game not over, and game has started
    const canUndo = mySeat !== null && isViewingHistory && !atEnd && !gameOver && gameStarted;
    
    let undoButtonHtml = '';
    if (canUndo) {
        undoButtonHtml = `
            <button class="undo-btn" id="btn-undo" aria-label="Undo to here">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/></svg>
                Undo to here
            </button>
        `;
    }
    
    container.innerHTML = `
        <div class="history-nav">
            <button class="history-btn" id="btn-first" ${atStart ? 'disabled' : ''} aria-label="First move">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.41 16.59L13.82 12l4.59-4.59L17 6l-6 6 6 6zM6 6h2v12H6z"/></svg>
            </button>
            <button class="history-btn" id="btn-prev" ${atStart ? 'disabled' : ''} aria-label="Previous move">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
            </button>
            <span class="history-counter">${viewIndex} / ${totalMoves}</span>
            <button class="history-btn" id="btn-next" ${atEnd ? 'disabled' : ''} aria-label="Next move">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </button>
            <button class="history-btn" id="btn-last" ${atEnd ? 'disabled' : ''} aria-label="Last move">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.59 7.41L10.18 12l-4.59 4.59L7 18l6-6-6-6zM16 6h2v12h-2z"/></svg>
            </button>
        </div>
        ${undoButtonHtml}
    `;
    
    // Add event listeners
    document.getElementById('btn-first').onclick = goToFirstMove;
    document.getElementById('btn-prev').onclick = goToPrevMove;
    document.getElementById('btn-next').onclick = goToNextMove;
    document.getElementById('btn-last').onclick = goToLastMove;
    
    const undoBtn = document.getElementById('btn-undo');
    if (undoBtn) {
        undoBtn.onclick = undoToCurrentPosition;
    }
}

function createSketch() {
    return (p) => {
        p.setup = function() {
            p.pixelDensity(1);
            const container = document.getElementById('board-container');
            const size = Math.min(container.offsetWidth, container.offsetHeight);
            let canvas = p.createCanvas(size, size);
            canvas.parent(container);
            p.noLoop();
            
            // Initialize board
            initializeBoard();
        };
        
        function initializeBoard() {
            const { boardType, boardWidth, boardHeight, presetStones, pregameSequence, turnCycle } = gameSettings;

            board = Board.fromSettings({
                boardType: boardType || 'grid',
                boardWidth: boardWidth || 9,
                boardHeight: boardHeight || 9,
                pregameSequence: pregameSequence || '',
                turnCycle: turnCycle,
                presetStones: presetStones
            });

            board.calculateTransform(p.width, p.height);
            
            // If we're already in scoring or game over (page reload), compute the canonical index map
            if (inScoring || gameOver) {
                canonicalIndexMap = board.computeCanonicalIndexMap();
                territory = board.calculateTerritory(deadChains, canonicalIndexMap);
            }
            
            p.redraw();
        }

        p.draw = function() {
            p.background(255, 193, 140);

            if (board) {
                const showScoring = inScoring || gameOver;
                board.draw(p, showScoring ? deadChains : null, showScoring ? canonicalIndexMap : null, showScoring ? territory : null);
                // Only show ghost stone if it's my turn and not in scoring/game over
                if (hoverNode && canMakeMove() && !inScoring && !gameOver) {
                    board.drawGhostStone(hoverNode, board.currentMove.to, p);
                }
            }
        };

        p.mouseMoved = function() {
            if (board) {
                // In scoring mode (not game over) and viewing latest, hover over any stone
                // Otherwise only if it's my turn (canMakeMove includes !isViewingHistory check)
                let newHover;
                if (inScoring && !gameOver && !isViewingHistory) {
                    newHover = board.findHover(p.mouseX, p.mouseY, false);
                    // Only hover over actual stones, not empty intersections
                    if (newHover && newHover.color <= 0) newHover = null;
                } else if (!gameOver) {
                    newHover = canMakeMove() ? board.findHover(p.mouseX, p.mouseY) : null;
                } else {
                    newHover = null;
                }
                if (hoverNode !== newHover) {
                    hoverNode = newHover;
                    p.redraw();
                }
            }
        };

        function handlePress(x, y) {
            if (!board || gameOver) return;
            
            // Don't allow any actions when viewing history
            if (isViewingHistory) return;
            
            if (inScoring) {
                // In scoring mode, toggle dead state of clicked chain
                const clickedNode = board.findHover(x, y, false);
                if (clickedNode && clickedNode.color > 0) {
                    toggleDeadChain(clickedNode);
                }
            } else if (canMakeMove()) {
                // Find the node at touch/click position
                const clickedNode = board.findHover(x, y);
                if (clickedNode) {
                    addMove(clickedNode.i, board.currentMove.to);
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
            const size = Math.min(container.offsetWidth, container.offsetHeight);
            p.resizeCanvas(size, size);
            if (board) {
                board.calculateTransform(p.width, p.height);
                p.redraw();
            }
        };

        p.keyPressed = function() {
            if (p.key === 'd') {
                console.log('queue:', board.queue);
                console.log('order:', board.order);
                console.log('currentMove:', board.currentMove);
                console.log('seats:', seats);
                console.log('mySeat:', mySeat);
            }
            
            // Arrow key navigation for move history
            if (p.keyCode === p.LEFT_ARROW) {
                goToPrevMove();
                return false; // Prevent default
            } else if (p.keyCode === p.RIGHT_ARROW) {
                goToNextMove();
                return false; // Prevent default
            }
        };
    };
}
