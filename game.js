// Game page script
let gameId = null;
let gameRef = null;
let movesRef = null;
let board = null;
let hoverNode = null;
let gameSettings = null;

// Get game ID from URL path (e.g., /game/abc123)
const pathParts = window.location.pathname.split('/');
gameId = pathParts[pathParts.length - 1];

if (!gameId || gameId === 'game.html') {
    alert('No game ID provided');
    window.location.href = '/';
}

// Display game ID
document.getElementById('game-id').textContent = gameId.substring(0, 8);

// Wait for auth to be ready
auth.onAuthStateChanged((user) => {
    if (user) {
        initGame();
    }
});

function initGame() {
    gameRef = db.ref(`games/${gameId}`);
    
    // Load game settings first
    gameRef.child('settings').once('value')
        .then((snapshot) => {
            gameSettings = snapshot.val();
            if (!gameSettings) {
                alert('Game not found');
                window.location.href = '/';
                return;
            }
            
            // Initialize board based on settings
            initializeBoard();
            
            // Then listen for moves
            movesRef = db.ref(`games/${gameId}/moves`);
            movesRef.on('child_added', handleMoveAdded);
        })
        .catch((error) => {
            console.error('Error loading game:', error);
            alert('Failed to load game');
        });
}

function initializeBoard() {
    const { boardType, boardSize } = gameSettings;
    
    switch(boardType) {
        case 'grid':
            board = Board.grid(boardSize);
            break;
        case 'star':
            board = Board.star(Math.max(2, Math.floor(boardSize / 5)));
            break;
        case 'dodecagon':
            board = Board.dodecagon(Math.max(2, Math.floor(boardSize / 3)));
            break;
        case 'rotatedGrid':
            board = Board.rotatedGrid(boardSize);
            break;
        default:
            board = Board.grid(19);
    }
    
    board.calculateTransform(width, height);
    redraw();
}

function handleMoveAdded(snapshot) {
    const move = snapshot.val();
    if (board && move.nodeIndex != null && move.color) {
        board.placeStone(move.nodeIndex, move.color);
        redraw();
    }
}

// p5.js sketch for game
function setup() {
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent(document.body);
    noLoop();
}

function draw() {
    background(255, 193, 140);
    
    if (board) {
        board.draw();
        if (hoverNode) {
            board.drawGhostStone(hoverNode, board.nextColor);
        }
    }
}

function mouseMoved() {
    if (board) {
        let newHover = board.findHover(mouseX, mouseY);
        if (hoverNode !== newHover) {
            hoverNode = newHover;
            redraw();
        }
    }
}

function mousePressed() {
    if (board && hoverNode) {
        addMove(hoverNode.i, board.nextColor);
        hoverNode = null;
        redraw();
    }
}

function addMove(nodeIndex, color) {
    if (!currentUser) {
        console.error('User not authenticated');
        return;
    }
    
    const moveData = {
        nodeIndex: nodeIndex,
        color: color,
        userId: currentUser.uid,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    movesRef.push(moveData)
        .then(() => {
            console.log('Move added at node', nodeIndex);
        })
        .catch((error) => {
            console.error('Error adding move:', error);
        });
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    if (board) {
        board.calculateTransform(width, height);
        redraw();
    }
}
