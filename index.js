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
    
    // Navigate to game setup page
    window.location.href = '/game-setup';
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
        
        p.setup = () => {
            p.createCanvas(200, 200);
            p.noLoop();
            
            // Initialize board from game settings
            if (game.settings) {
                const { boardType, boardSize, initialStones } = game.settings;
                
                switch(boardType) {
                    case 'grid':
                        board = Board.grid(boardSize);
                        break;
                    case 'star':
                        board = Board.star(boardSize);
                        break;
                    case 'dodecagon':
                        board = Board.dodecagon(boardSize);
                        break;
                    case 'rotatedGrid':
                        board = Board.rotatedGrid(boardSize);
                        break;
                    default:
                        board = Board.grid(19);
                }
                
                // Apply initial stones
                if (initialStones && initialStones.length > 0) {
                    initialStones.forEach(stone => {
                        const node = board.nodes[stone.nodeIndex];
                        if (node) {
                            node.color = stone.color;
                        }
                    });
                }
                
                // Apply moves using placeStone to handle captures
                if (game.moves) {
                    Object.values(game.moves).forEach(move => {
                        if (move.nodeIndex != null && move.color) {
                            board.placeStone(move.nodeIndex, move.color);
                        }
                    });
                }
                
                board.calculateTransform(p.width, p.height);
            }
        };
        
        p.draw = () => {
            p.background(255, 193, 140);
            
            if (board) {
                board.draw(p);
            }
        };
    };
    
    new p5(sketch, container);
}

function joinGame(gameId) {
    if (window.location.href == "http://127.0.0.1:3000/") {
        window.location.href = `/game.html?id=${gameId}`
    } else {
        window.location.href = `/game/${gameId}`;
    }
}
