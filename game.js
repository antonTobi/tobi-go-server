// Game page script
let gameId = null;
let gameRef = null;
let movesRef = null;
let board = null;
let hoverNode = null;
let gameSettings = null;

// Get game ID from URL path (e.g., /game/abc123) or query parameter (e.g., /game.html?id=abc123)
const pathParts = window.location.pathname.split('/');
const pathGameId = pathParts[pathParts.length - 1];
const urlParams = new URLSearchParams(window.location.search);
const queryGameId = urlParams.get('id');

gameId = queryGameId || pathGameId;

if (!gameId || gameId === 'game.html') {
    alert('No game ID provided');
    window.location.href = '/';
}

// Display game ID
document.getElementById('game-id').textContent = gameId.substring(0, 8);

// Initialize game immediately (don't wait for auth)
// Auth is only needed for making moves
initGame();

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
    const { boardType, boardSize, initialStones } = gameSettings;
    
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
    
    // Apply initial stones if any
    if (initialStones && initialStones.length > 0) {
        initialStones.forEach(stone => {
            const node = board.nodes[stone.nodeIndex];
            if (node) {
                node.color = stone.color;
            }
        });
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
        addMove(hoverNode.i, board.nextColor); // TODO: add back index prop
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
