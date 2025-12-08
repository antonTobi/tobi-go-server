// Home page script
let gamesRef = null;

// Initialize page immediately
initHomePage();

// Update auth status when ready
function updateAuthStatus(user) {
    const authStatus = document.getElementById('auth-status');
    if (user) {
        authStatus.textContent = `Signed in`;
        authStatus.classList.add('auth-ready');
    } else {
        authStatus.textContent = 'Connecting...';
        authStatus.classList.remove('auth-ready');
    }
}

// Listen for auth ready event (faster than onAuthStateChanged)
window.addEventListener('authReady', (e) => {
    updateAuthStatus(e.detail.user);
});

// Also listen to onAuthStateChanged as fallback
auth.onAuthStateChanged((user) => {
    updateAuthStatus(user);
});

function initHomePage() {
    // Setup create game button
    document.getElementById('createGameBtn').addEventListener('click', createGame);
    
    // Listen for games
    gamesRef = db.ref('games');
    gamesRef.on('value', (snapshot) => {
        displayGames(snapshot.val());
    });
}

function createGame() {
    if (!currentUser) {
        alert('Please wait for authentication...');
        return;
    }

    if (window.location.href == "http://127.0.0.1:3000/" || window.location.href == "http://127.0.0.1:3000/index.html" ) {
        window.location.href = `/game-setup.html`
    } else {
        window.location.href = '/game-setup';
    }
}

function displayGames(games) {
    const gamesList = document.getElementById('games-list');
    gamesList.innerHTML = '';
    
    if (!games) {
        gamesList.innerHTML = '<p class="no-games">No active games. Create one to get started!</p>';
        return;
    }
    
    Object.keys(games).forEach((gameId) => {
        const game = games[gameId];
        
        // Create thumbnail container
        const thumbContainer = document.createElement('div');
        thumbContainer.className = 'game-thumbnail';
        thumbContainer.onclick = () => joinGame(gameId);
        
        // Create canvas container for p5 instance
        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'thumbnail-canvas';
        thumbContainer.appendChild(canvasContainer);
        
        gamesList.appendChild(thumbContainer);
        
        // Create p5 instance for this thumbnail
        createThumbnail(canvasContainer, game);
    });
}

function createThumbnail(container, game) {
    const sketch = (p) => {
        let board = null;
        let deadChains = null;
        let canonicalIndexMap = null;
        let territory = null;
        
        p.setup = () => {
            p.pixelDensity(1); // Ensure 1:1 canvas pixels to screen pixels for crisp lines
            p.createCanvas(200, 200);
            p.noLoop();
            
            // Initialize board from game settings
            if (game.settings) {
                const { boardType, boardWidth, boardHeight, presetStones, pregameSequence, turnCycle } = game.settings;
                
                board = Board.fromSettings({
                    boardType: boardType || 'grid',
                    boardWidth: boardWidth || 9,
                    boardHeight: boardHeight || 9,
                    pregameSequence: pregameSequence || '',
                    turnCycle: turnCycle,
                    presetStones: presetStones
                });
                
                // Apply moves using placeStone to handle captures
                if (game.moves) {
                    Object.values(game.moves).forEach(move => {
                        if (move.i != null && move.c) {
                            board.placeStone(move.i, move.c);
                        }
                    });
                }
                
                // If game is in scoring or game over, compute territory display
                if (game.inScoring || game.gameOver) {
                    deadChains = game.deadChains || {};
                    canonicalIndexMap = board.computeCanonicalIndexMap();
                    territory = board.calculateTerritory(deadChains, canonicalIndexMap);
                }
                
                board.calculateTransform(p.width, p.height);
            }
        };
        
        p.draw = () => {
            p.background(255, 193, 140);
            
            if (board) {
                board.draw(p, deadChains, canonicalIndexMap, territory);
            }
        };
    };
    
    new p5(sketch, container);
}

function joinGame(gameId) {
    if (window.location.href == "http://127.0.0.1:3000/" || window.location.href == "http://127.0.0.1:3000/index.html" ) {
        window.location.href = `/game.html?id=${gameId}`
    } else {
        window.location.href = `/game/${gameId}`;
    }
}
