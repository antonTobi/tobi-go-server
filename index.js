// Home page script
let gamesRef = null;

// Initialize page immediately
initHomePage();

// Update auth status when ready
async function updateAuthStatus(user) {
    const authStatus = document.getElementById('auth-status');
    const accountSection = document.getElementById('account-section');
    const accountTypeLabel = document.getElementById('account-type-label');
    const toggleAuthBtn = document.getElementById('toggleAuthBtn');
    const signedInSection = document.getElementById('signed-in-section');
    const signedInEmail = document.getElementById('signed-in-email');
    const authForms = document.getElementById('auth-forms');
    
    if (user) {
        authStatus.textContent = `Signed in`;
        authStatus.classList.add('auth-ready');
        
        // Load and display current display name
        await loadDisplayName();
        
        // Update account section based on auth type
        if (user.isAnonymous) {
            accountTypeLabel.textContent = 'Anonymous Account';
            toggleAuthBtn.textContent = 'Link Account';
            toggleAuthBtn.classList.remove('hidden');
            signedInSection.classList.add('hidden');
        } else {
            accountTypeLabel.textContent = 'Linked Account';
            toggleAuthBtn.classList.add('hidden');
            authForms.classList.add('hidden');
            signedInSection.classList.remove('hidden');
            signedInEmail.textContent = user.email || 'Google Account';
        }
    } else {
        authStatus.textContent = 'Connecting...';
        authStatus.classList.remove('auth-ready');
    }
}

async function loadDisplayName() {
    const displayNameInput = document.getElementById('displayNameInput');
    try {
        const name = await getMyDisplayName();
        if (name) {
            displayNameInput.value = name;
        }
    } catch (error) {
        console.error('Error loading display name:', error);
    }
}

// Listen for auth ready event (faster than onAuthStateChanged)
window.addEventListener('authReady', (e) => {
    updateAuthStatus(e.detail.user);
});

// Listen for auth errors (e.g., from Google redirect)
window.addEventListener('authError', (e) => {
    const error = e.detail.error;
    if (error) {
        showAuthError(getAuthErrorMessage(error));
        // Show auth forms so user can see the error
        const authForms = document.getElementById('auth-forms');
        if (authForms) {
            authForms.classList.remove('hidden');
        }
    }
});

// Also listen to onAuthStateChanged as fallback
auth.onAuthStateChanged((user) => {
    updateAuthStatus(user);
});

function initHomePage() {
    // Setup create game button
    document.getElementById('createGameBtn').addEventListener('click', createGame);
    
    // Setup display name save button
    document.getElementById('saveNameBtn').addEventListener('click', saveDisplayName);
    document.getElementById('displayNameInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveDisplayName();
    });
    
    // Setup auth UI
    setupAuthUI();
    
    // Listen for games
    gamesRef = db.ref('games');
    gamesRef.on('value', (snapshot) => {
        displayGames(snapshot.val());
    });
}

async function saveDisplayName() {
    const input = document.getElementById('displayNameInput');
    const status = document.getElementById('displayNameStatus');
    const saveBtn = document.getElementById('saveNameBtn');
    
    const name = input.value.trim();
    if (!name) {
        status.textContent = 'Name cannot be empty';
        status.className = 'display-name-status error';
        return;
    }
    
    saveBtn.disabled = true;
    status.textContent = 'Saving...';
    status.className = 'display-name-status';
    
    try {
        await setDisplayName(name);
        status.textContent = 'Saved!';
        status.className = 'display-name-status success';
        setTimeout(() => {
            status.textContent = '';
        }, 2000);
    } catch (error) {
        status.textContent = error.message;
        status.className = 'display-name-status error';
    } finally {
        saveBtn.disabled = false;
    }
}

function setupAuthUI() {
    // Tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Update active tab
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show corresponding form
            document.getElementById('signin-form').classList.toggle('hidden', targetTab !== 'signin');
            document.getElementById('signup-form').classList.toggle('hidden', targetTab !== 'signup');
            
            // Clear error
            hideAuthError();
        });
    });
    
    // Toggle auth forms visibility
    document.getElementById('toggleAuthBtn').addEventListener('click', () => {
        const authForms = document.getElementById('auth-forms');
        authForms.classList.toggle('hidden');
    });
    
    // Sign in with email
    document.getElementById('signinBtn').addEventListener('click', handleEmailSignIn);
    document.getElementById('signinPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleEmailSignIn();
    });
    
    // Sign up with email
    document.getElementById('signupBtn').addEventListener('click', handleEmailSignUp);
    document.getElementById('signupPassword').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleEmailSignUp();
    });
    
    // Google sign in/up
    document.getElementById('googleSigninBtn').addEventListener('click', handleGoogleAuth);
    document.getElementById('googleSignupBtn').addEventListener('click', handleGoogleAuth);
    
    // Sign out
    document.getElementById('signOutBtn').addEventListener('click', handleSignOut);
}

function showAuthError(message) {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function hideAuthError() {
    document.getElementById('auth-error').classList.add('hidden');
}

async function handleEmailSignIn() {
    const email = document.getElementById('signinEmail').value.trim();
    const password = document.getElementById('signinPassword').value;
    
    if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
    }
    
    hideAuthError();
    
    try {
        // If currently anonymous, try to link first
        if (isAnonymous()) {
            try {
                await linkWithEmail(email, password);
                document.getElementById('auth-forms').classList.add('hidden');
                return;
            } catch (linkError) {
                // If linking fails because credentials already exist, sign in normally
                if (linkError.code === 'auth/email-already-in-use' || 
                    linkError.code === 'auth/credential-already-in-use') {
                    await signInWithEmail(email, password);
                    document.getElementById('auth-forms').classList.add('hidden');
                    return;
                }
                throw linkError;
            }
        } else {
            await signInWithEmail(email, password);
            document.getElementById('auth-forms').classList.add('hidden');
        }
    } catch (error) {
        showAuthError(getAuthErrorMessage(error));
    }
}

async function handleEmailSignUp() {
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    
    if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
    }
    
    if (password.length < 6) {
        showAuthError('Password must be at least 6 characters');
        return;
    }
    
    hideAuthError();
    
    try {
        // If currently anonymous, link the account
        if (isAnonymous()) {
            await linkWithEmail(email, password);
        } else {
            await createAccountWithEmail(email, password);
        }
        document.getElementById('auth-forms').classList.add('hidden');
    } catch (error) {
        showAuthError(getAuthErrorMessage(error));
    }
}

async function handleGoogleAuth() {
    hideAuthError();
    
    // Show loading state
    const googleBtns = document.querySelectorAll('.btn-google');
    googleBtns.forEach(btn => {
        btn.disabled = true;
        btn.textContent = 'Connecting to Google...';
    });
    
    try {
        let user;
        // If currently anonymous, try to link first
        if (isAnonymous()) {
            user = await linkWithGoogle();
        } else {
            user = await signInWithGoogle();
        }
        
        // If popup was used and succeeded, user will be returned
        // If redirect was used, user will be null and page will redirect
        if (user) {
            console.log('Google auth successful via popup:', user.uid);
            document.getElementById('auth-forms').classList.add('hidden');
        }
        // If user is null, redirect is happening, so don't restore buttons
    } catch (error) {
        // Re-enable buttons if there's an error
        googleBtns.forEach(btn => {
            btn.disabled = false;
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
            `;
        });
        showAuthError(getAuthErrorMessage(error));
    }
}

async function handleSignOut() {
    try {
        await signOutUser();
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

function getAuthErrorMessage(error) {
    switch (error.code) {
        case 'auth/email-already-in-use':
            return 'This email is already registered. Try signing in instead.';
        case 'auth/invalid-email':
            return 'Invalid email address.';
        case 'auth/wrong-password':
        case 'auth/user-not-found':
        case 'auth/invalid-credential':
            return 'Invalid email or password.';
        case 'auth/weak-password':
            return 'Password is too weak. Use at least 6 characters.';
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return 'Sign-in was cancelled.';
        case 'auth/credential-already-in-use':
            return 'This Google account is already linked to another user. Signing in...';
        case 'auth/account-exists-with-different-credential':
            return 'An account already exists with this email but with different sign-in method.';
        case 'auth/network-request-failed':
            return 'Network error. Please check your connection and try again.';
        default:
            return error.message || 'An error occurred. Please try again.';
    }
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
