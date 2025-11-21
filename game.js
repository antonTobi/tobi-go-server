// Game page script
let gameId = null;
let gameRef = null;
let movesRef = null;
let moves = {};

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
        document.getElementById('auth-status').textContent = `Signed in as: ${user.uid.substring(0, 8)}...`;
        document.getElementById('game-content').style.display = 'block';
        initGame();
    }
});

function initGame() {
    gameRef = db.ref(`games/${gameId}`);
    movesRef = db.ref(`games/${gameId}/moves`);
    
    // Listen for moves updates
    movesRef.on('value', (snapshot) => {
        moves = snapshot.val() || {};
        updateMoveCount();
        redrawCanvas();
    });
}

function updateMoveCount() {
    const count = Object.keys(moves).length;
    document.getElementById('move-count').textContent = count;
}

// p5.js sketch for game
function setup() {
    let canvas = createCanvas(600, 400);
    canvas.parent('canvas-container');
    background(220);
}

function draw() {
    // Drawing is handled by redrawCanvas when data changes
}

function mousePressed() {
    // Only process clicks on canvas
    if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
        addMove(mouseX, mouseY);
    }
}

function addMove(x, y) {
    if (!currentUser) {
        console.error('User not authenticated');
        return;
    }
    
    const moveData = {
        x: x,
        y: y,
        userId: currentUser.uid,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    
    movesRef.push(moveData)
        .then(() => {
            console.log('Move added at', x, y);
        })
        .catch((error) => {
            console.error('Error adding move:', error);
        });
}

function redrawCanvas() {
    background(220);
    
    // Draw all moves as circles
    Object.values(moves).forEach((move) => {
        fill(100, 100, 200, 150);
        noStroke();
        ellipse(move.x, move.y, 30);
    });
}
