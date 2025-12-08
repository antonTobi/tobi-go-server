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

// Debug
window._debugBoard = () => board;
window._debugSeats = () => ({ seats, mySeat, requiredSeats });

// Initialize game
initGame();

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
    if (board && move.i != null && move.c) {
        board.placeStone(move.i, move.c);
        
        // If in scoring mode or game over, recompute canonical index map and territory (handles page reload case)
        if (inScoring || gameOver) {
            canonicalIndexMap = board.computeCanonicalIndexMap();
            territory = board.calculateTerritory(deadChains, canonicalIndexMap);
        }
        
        renderPlayerCards(); // Update current turn indicator
        renderGameControls(); // Update scoring button visibility
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
    deadChains = snapshot.val() || {};
    
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
    
    // Start cooldown to prevent immediate accept
    acceptCooldown = true;
    renderGameControls();
    setTimeout(() => {
        acceptCooldown = false;
        renderGameControls();
    }, 2000);
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
    
    // Start cooldown to prevent immediate accept
    acceptCooldown = true;
    renderGameControls();
    setTimeout(() => {
        acceptCooldown = false;
        renderGameControls();
    }, 2000);
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
    while (board && board.currentMove.player === 0) {
        const currentMove = board.currentMove;
        
        // Find empty intersections
        const emptyNodes = board.nodes.filter(n => n.color === currentMove.from);
        if (emptyNodes.length === 0) {
            console.log('No empty nodes for random placement');
            return;
        }
        
        // Pick a random empty node
        const randomNode = emptyNodes[Math.floor(Math.random() * emptyNodes.length)];
        
        // Submit the move via transaction
        const moveIndex = board.moveHistory.length;
        const moveRef = movesRef.child(moveIndex);
        moveRef.transaction((currentValue) => {
            if (currentValue !== null) {
                return; // Abort - move already exists
            }
            return { i: randomNode.i, c: currentMove.to };
        }, (error, committed) => {
            if (error) {
                console.error('Random move transaction failed:', error);
            } else if (committed) {
                console.log('Random move placed at node', randomNode.i);
            }
        });
        
        // Locally place the stone so we can continue processing
        board.placeStone(randomNode.i, currentMove.to);
    }
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
    return currentUser && isMyTurn();
}

function addMove(i, c) {
    if (!canMakeMove()) {
        console.error('Not your turn or not authenticated');
        return;
    }
    
    const moveRef = movesRef.child(board.moveHistory.length);

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
            // Process any following random moves
            processRandomMoves();
        }
    });
}

function calculateScores() {
    if (!territory) return {};
    
    const scores = {};
    for (const [nodeIndex, owner] of Object.entries(territory)) {
        if (owner > 0) {
            scores[owner] = (scores[owner] || 0) + 1;
        }
    }
    return scores;
}

function renderPlayerCards() {
    const container = document.getElementById('player-cards');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Calculate scores if in scoring mode or game over
    const scores = (inScoring || gameOver) ? calculateScores() : {};
    
    requiredSeats.forEach(playerNum => {
        const odIndex = seats[playerNum];
        const isOccupied = !!odIndex;
        const isMe = currentUser && odIndex === currentUser.uid;
        const isCurrentTurn = board && board.currentMove.player === playerNum;
        
        const card = document.createElement('div');
        card.className = 'player-card';
        if (isCurrentTurn && !inScoring) card.classList.add('current-turn');
        if (isMe) card.classList.add('my-seat');
        if (isOccupied && !isMe) {
            card.classList.add('occupied');
        } else {
            card.classList.add('empty');
            card.onclick = () => takeSeat(playerNum);
        }
        
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
        
        if (isOccupied) {
            const uidDisplay = document.createElement('div');
            uidDisplay.className = 'player-uid';
            uidDisplay.textContent = isMe ? 'You' : odIndex.substring(0, 12) + '...';
            info.appendChild(uidDisplay);
        } else {
            const emptyLabel = document.createElement('div');
            emptyLabel.className = 'player-empty';
            emptyLabel.textContent = 'Click to join';
            info.appendChild(emptyLabel);
        }
        
        // Show score when in scoring mode or game over
        if (inScoring || gameOver) {
            const scoreDisplay = document.createElement('div');
            scoreDisplay.className = 'player-score';
            const scoreText = `Score: ${scores[playerNum] || 0}`;
            const hasAccepted = acceptedScores[playerNum] === true;
            scoreDisplay.textContent = hasAccepted ? `${scoreText} ✓` : scoreText;
            if (hasAccepted) scoreDisplay.classList.add('accepted');
            info.appendChild(scoreDisplay);
        }
        
        card.appendChild(info);
        container.appendChild(card);
    });
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
                // In scoring mode (not game over), hover over any stone; otherwise only if it's my turn
                let newHover;
                if (inScoring && !gameOver) {
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

        p.mousePressed = function() {
            if (!board || gameOver) return;
            
            if (inScoring) {
                // In scoring mode, toggle dead state of clicked chain
                const clickedNode = board.findHover(p.mouseX, p.mouseY, false);
                if (clickedNode && clickedNode.color > 0) {
                    toggleDeadChain(clickedNode);
                }
            } else if (hoverNode && canMakeMove()) {
                addMove(hoverNode.i, board.currentMove.to);
                hoverNode = null;
                p.redraw();
            }
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
        };
    };
}
