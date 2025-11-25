// Game setup page script
let previewBoard = null;
let boardType = 'grid';
let boardSize = 19;
let selectedColor = 1; // Default to black
let hoverNode = null;

initSetupPage();

function initSetupPage() {
    // Setup form listeners
    document.getElementById('board-type').addEventListener('change', updatePreview);
    document.getElementById('board-size').addEventListener('input', updatePreview);
    document.getElementById('game-setup-form').addEventListener('submit', handleCreateGame);
    
    // Setup stone color toolbar
    document.querySelectorAll('.stone-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stone-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedColor = parseInt(btn.dataset.color);
        });
    });
    
    // Set default active button
    document.querySelector('.stone-btn[data-color="1"]').classList.add('active');
    
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
    
    // redraw();
}

function handleCreateGame(event) {
    event.preventDefault();
    
    if (!currentUser) {
        alert('Please wait for authentication...');
        return;
    }
    
    // Collect initial stones
    const initialStones = [];
    if (previewBoard) {
        previewBoard.nodes.forEach(node => {
            if (node.color) {
                initialStones.push({
                    nodeIndex: node.i,
                    color: node.color
                });
            }
        });
    }
    
    attemptCreateGame({
        boardType,
        boardSize,
        initialStones
    });
}

function attemptCreateGame(settings) {    
    const gameId = generateGameId();
    const newGameRef = db.ref(`games/${gameId}`);
    
    newGameRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                console.log(`Game ID ${gameId} already exists, retrying...`);
                attemptCreateGame(settings);
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
        
        // Draw ghost stone on hover
        if (hoverNode) {
            previewBoard.drawGhostStone(hoverNode, selectedColor);
        }
    }
}

function mouseMoved() {
    if (previewBoard) {
        let newHover = previewBoard.findHover(mouseX, mouseY)
        
        if (hoverNode !== newHover) {
            hoverNode = newHover;
            redraw();
        }
    }
}

function mousePressed() {
    if (previewBoard && hoverNode) {
        // Toggle stone: if same color, remove; otherwise set to selected color
        if (hoverNode.color === selectedColor) {
            hoverNode.color = 0;
        } else {
            hoverNode.color = selectedColor;
        }
        redraw();
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
