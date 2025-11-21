// Home page script
let gamesRef = null;

// Wait for auth to be ready
auth.onAuthStateChanged((user) => {
    if (user) {
        document.getElementById('auth-status').textContent = `Signed in as: ${user.uid.substring(0, 8)}...`;
        document.getElementById('home-content').style.display = 'block';
        initHomePage();
    }
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
        const gameElement = document.createElement('div');
        gameElement.className = 'game-item';
        
        const moveCount = game.moves ? Object.keys(game.moves).length : 0;
        const date = game.createdAt ? new Date(game.createdAt).toLocaleString() : 'Unknown';
        
        gameElement.innerHTML = `
            <div class="game-info">
                <strong>Game ${gameId.substring(0, 8)}</strong>
                <span>Moves: ${moveCount}</span>
                <span>Created: ${date}</span>
            </div>
            <button class="btn-join" onclick="joinGame('${gameId}')">Join</button>
        `;
        
        gamesList.appendChild(gameElement);
    });
}

function joinGame(gameId) {
    window.location.href = `/game/${gameId}`;
}
