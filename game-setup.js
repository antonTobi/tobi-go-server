// Game setup page script
let previewBoard = null;
let boardType = 'grid';
let boardSize = 19;

initSetupPage();

function initSetupPage() {
    // Setup form listeners
    document.getElementById('board-type').addEventListener('change', updatePreview);
    document.getElementById('board-size').addEventListener('input', updatePreview);
    document.getElementById('game-setup-form').addEventListener('submit', handleCreateGame);
    
    // Initial preview
    updatePreview();
}

function updatePreview() {
    boardType = document.getElementById('board-type').value;
    boardSize = parseInt(document.getElementById('board-size').value);
    
    // Create new board based on settings
    switch(boardType) {
        case 'grid':
            previewBoard = Board.grid(boardSize);
            break;
        case 'star':
            previewBoard = Board.star(boardSize);
            break;
        case 'dodecagon':
            previewBoard = Board.dodecagon(boardSize);
            break;
        case 'rotatedGrid':
            previewBoard = Board.rotatedGrid(boardSize);
            break;
    }
    
    redraw();
}

function handleCreateGame(event) {
    event.preventDefault();
    
    if (!currentUser) {
        alert('Please wait for authentication...');
        return;
    }
    
    const timeControl = parseInt(document.getElementById('time-control').value);
    
    attemptCreateGame({
        boardType,
        boardSize
    });
}

function attemptCreateGame(settings, retries = 0) {
    const maxRetries = 5;
    
    if (retries >= maxRetries) {
        alert('Failed to create game after multiple attempts. Please try again.');
        return;
    }
    
    const gameId = generateGameId();
    const newGameRef = db.ref(`games/${gameId}`);
    
    newGameRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                console.log(`Game ID ${gameId} already exists, retrying...`);
                attemptCreateGame(settings, retries + 1);
            } else {
                const gameData = {
                    createdBy: currentUser.uid,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    settings: settings,
                    moves: {}
                };
                
                return newGameRef.set(gameData)
                    .then(() => {
                        console.log('Game created:', gameId);
                        window.location.href = `/game/${gameId}`;
                    });
            }
        })
        .catch((error) => {
            console.error('Error creating game:', error);
            alert('Failed to create game');
        });
}

function generateGameId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// p5.js sketch for preview
function setup() {
    let canvas = createCanvas(600, 600);
    canvas.parent('preview-container');
    noLoop();
}

function draw() {
    background(255, 193, 140);
    
    if (previewBoard) {
        previewBoard.calculateTransform(width, height);
        previewBoard.draw();
    }
}

function windowResized() {
    let container = document.getElementById('preview-container');
    if (container) {
        resizeCanvas(container.offsetWidth, container.offsetWidth);
        if (previewBoard) {
            previewBoard.calculateTransform(width, height);
            redraw();
        }
    }
}
