// Firebase Configuration
// Replace with your Firebase project configuration
// Get this from: Firebase Console > Project Settings > General > Your apps > Web app

const firebaseConfig = {
    apiKey: "AIzaSyDsy-Z4R8aZznpfHiHMugWRwfWs3OqBHlQ",
    authDomain: "go-server-a4265.firebaseapp.com",
    databaseURL: "https://go-server-a4265-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "go-server-a4265",
    storageBucket: "go-server-a4265.firebasestorage.app",
    messagingSenderId: "955971546364",
    appId: "1:955971546364:web:13e777f68d3407bcd87b79"
};


// Initialize Firebase
let db = null;
let auth = null;
let currentUser = null;
let authReady = false;
let authReadyPromise = null;
let initialAuthStatePromise = null;
let resolveInitialAuthState = null;
let authBootstrapComplete = false;

// Display name cache to avoid repeated database reads
const displayNameCache = {};

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    auth = firebase.auth();
    initialAuthStatePromise = new Promise((resolve) => {
        resolveInitialAuthState = resolve;
    });
    
    const dispatchAuthReady = (user) => {
        window.dispatchEvent(new CustomEvent('authReady', { detail: { user } }));
    };
    
    const finishAuthBootstrap = () => {
        authBootstrapComplete = true;
        if (currentUser) {
            dispatchAuthReady(currentUser);
        }
    };
    
    const handleAuthBootstrapError = (error) => {
        console.error('Auth initialization failed:', error);
        authBootstrapComplete = true;
        if (!currentUser) {
            authReady = false;
            authReadyPromise = null;
        }
    };

    const logCurrentAuthToken = async (user, reason) => {
        if (!user) {
            console.log(`Auth token unavailable (${reason}): no user`);
            return;
        }
        try {
            const tokenResult = await user.getIdTokenResult();
            console.log('Auth token state:', {
                reason,
                uid: user.uid,
                issuedAtTime: tokenResult.issuedAtTime,
                expirationTime: tokenResult.expirationTime,
                authTime: tokenResult.authTime,
                signInProvider: tokenResult.signInProvider,
                claims: tokenResult.claims,
            });
        } catch (error) {
            console.error(`Failed to inspect auth token (${reason}):`, error);
        }
    };

    db.ref('.info/connected').on('value', (snapshot) => {
        console.log('RTDB connectivity changed:', snapshot.val());
    }, (error) => {
        console.error('RTDB connectivity listener failed:', error);
    });
    
    // Listen for auth state changes
    auth.onAuthStateChanged(async (user) => {
        if (resolveInitialAuthState) {
            resolveInitialAuthState(user);
            resolveInitialAuthState = null;
        }

        if (user) {
            currentUser = user;
            authReady = true;
            console.log('User authenticated:', user.uid);
            logCurrentAuthToken(user, 'onAuthStateChanged');

            try {
                await ensureUserDisplayName(user);
            } catch (error) {
                console.error('Failed to ensure display name:', error);
            }
            
            if (authBootstrapComplete) {
                dispatchAuthReady(user);
            }
        } else {
            currentUser = null;
            authReady = false;
            authReadyPromise = null;
            console.log('User signed out');
        }
    });

    auth.onIdTokenChanged((user) => {
        console.log('Auth ID token changed:', user ? { uid: user.uid, isAnonymous: user.isAnonymous } : null);
        if (user) logCurrentAuthToken(user, 'onIdTokenChanged');
    });
    
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(async () => {
            console.log('Firebase initialized with persistent auth');

            await initialAuthStatePromise;

            const result = await auth.getRedirectResult();
            console.log('getRedirectResult:', result);
            
            // Check if we got a result from redirect (either sign-in or link)
            if (result && result.user) {
                console.log('Google redirect successful, user:', result.user.uid, 'operationType:', result.operationType);
                console.log('User isAnonymous:', result.user.isAnonymous);
            }
            
            // Only fall back to anonymous auth after restored/redirect auth has settled.
            if (!auth.currentUser) {
                console.log('No current user after auth restoration, signing in anonymously');
                await auth.signInAnonymously();
            } else {
                console.log('Auth session restored as:', auth.currentUser.uid, 'isAnonymous:', auth.currentUser.isAnonymous);
            }

            console.log('Auth ready');
            finishAuthBootstrap();
        })
        .catch((error) => {
            // Handle the case where the Google account is already linked to another user
            if (error.code === 'auth/credential-already-in-use') {
                console.log('Credential already in use, signing in with existing account');
                if (error.credential) {
                    return auth.signInWithCredential(error.credential)
                        .then(() => {
                            console.log('Auth ready');
                            finishAuthBootstrap();
                        })
                        .catch(handleAuthBootstrapError);
                }
            }
            // Dispatch error event for UI to handle
            window.dispatchEvent(new CustomEvent('authError', { detail: { error } }));
            handleAuthBootstrapError(error);
        })
        .catch(handleAuthBootstrapError);
} catch (error) {
    console.warn('Firebase initialization failed:', error);
}

function waitForAuthReady() {
    if (currentUser) {
        return Promise.resolve(currentUser);
    }

    if (!authReadyPromise) {
        authReadyPromise = new Promise((resolve) => {
            const onReady = (event) => {
                window.removeEventListener('authReady', onReady);
                resolve(event.detail.user);
            };

            window.addEventListener('authReady', onReady);

            if (currentUser) {
                window.removeEventListener('authReady', onReady);
                resolve(currentUser);
            }
        });
    }

    return authReadyPromise;
}

// ============================================
// Display Name Functions
// ============================================

// Get display name for a user (with caching)
async function getDisplayName(uid) {
    if (!uid) return null;
    
    // Check cache first
    if (displayNameCache[uid]) {
        return displayNameCache[uid];
    }
    
    try {
        console.log('Fetching display name for uid:', uid);
        const snapshot = await db.ref(`users/${uid}/displayName`).once('value');
        const name = snapshot.val();
        console.log('Fetched display name result:', { uid, exists: snapshot.exists(), name });
        if (name) {
            displayNameCache[uid] = name;
        }
        return name;
    } catch (error) {
        console.error('Error fetching display name:', error);
        return null;
    }
}

// Set display name for current user
async function setDisplayName(name) {
    if (!currentUser) {
        throw new Error('Not authenticated');
    }
    
    const trimmedName = name.trim();
    if (!trimmedName) {
        throw new Error('Display name cannot be empty');
    }
    
    if (trimmedName.length > 20) {
        throw new Error('Display name must be 20 characters or less');
    }
    
    await db.ref(`users/${currentUser.uid}/displayName`).set(trimmedName);
    displayNameCache[currentUser.uid] = trimmedName;
    
    return trimmedName;
}

// Get current user's display name
async function getMyDisplayName() {
    if (!currentUser) return null;
    return getDisplayName(currentUser.uid);
}

function generatePlaceholderDisplayName() {
    const consonants = 'mnptkswlj';
    const vowels = 'aeiou';
    const pick = (chars) => chars.charAt(Math.floor(Math.random() * chars.length));

    return `${pick(consonants).toUpperCase()}${pick(vowels)}${pick(consonants)}${pick(vowels)}`;
}

async function ensureUserDisplayName(user, preferredName = user?.displayName) {
    if (!user) return null;

    const existingName = await getDisplayName(user.uid);
    if (existingName) return existingName;

    const trimmedPreferredName = preferredName?.trim();
    const displayName = trimmedPreferredName
        ? trimmedPreferredName.slice(0, 20)
        : generatePlaceholderDisplayName();

    console.log('Creating fallback display name:', { uid: user.uid, displayName, preferredName: trimmedPreferredName || null });
    await db.ref(`users/${user.uid}/displayName`).set(displayName);
    displayNameCache[user.uid] = displayName;
    return displayName;
}

// ============================================
// Authentication Functions
// ============================================

// Sign in with email and password
async function signInWithEmail(email, password) {
    try {
        const credential = await auth.signInWithEmailAndPassword(email, password);
        return credential.user;
    } catch (error) {
        console.error('Email sign-in failed:', error);
        throw error;
    }
}

// Create account with email and password
async function createAccountWithEmail(email, password) {
    try {
        const credential = await auth.createUserWithEmailAndPassword(email, password);
        return credential.user;
    } catch (error) {
        console.error('Account creation failed:', error);
        throw error;
    }
}

// Sign in with Google (tries popup first, falls back to redirect)
async function signInWithGoogle() {
    try {
        console.log('signInWithGoogle: Starting...');
        const provider = new firebase.auth.GoogleAuthProvider();
        
        // Try popup first (works better when not blocked)
        try {
            const result = await auth.signInWithPopup(provider);
            console.log('signInWithGoogle: Popup successful');
            
            currentUser = result.user;
            
            return result.user;
        } catch (popupError) {
            // If popup is blocked or fails, fall back to redirect
            if (popupError.code === 'auth/popup-blocked' || 
                popupError.code === 'auth/popup-closed-by-user' ||
                popupError.code === 'auth/cancelled-popup-request') {
                console.log('signInWithGoogle: Popup blocked/closed, trying redirect...');
                await auth.signInWithRedirect(provider);
                return null; // Will be handled by getRedirectResult
            }
            throw popupError;
        }
    } catch (error) {
        console.error('Google sign-in failed:', error);
        throw error;
    }
}

// Link anonymous account to email/password
async function linkWithEmail(email, password) {
    if (!currentUser) {
        throw new Error('Not authenticated');
    }
    
    try {
        const credential = firebase.auth.EmailAuthProvider.credential(email, password);
        const result = await currentUser.linkWithCredential(credential);
        return result.user;
    } catch (error) {
        console.error('Account linking failed:', error);
        throw error;
    }
}

// Link anonymous account to Google (tries popup first, falls back to redirect)
async function linkWithGoogle() {
    if (!currentUser) {
        throw new Error('Not authenticated');
    }
    
    try {
        console.log('linkWithGoogle: Starting for user', currentUser.uid);
        const provider = new firebase.auth.GoogleAuthProvider();
        
        // Try popup first (works better when not blocked)
        try {
            const result = await currentUser.linkWithPopup(provider);
            console.log('linkWithGoogle: Popup successful');
            
            // Reload the user to get updated auth state
            await result.user.reload();
            // Update currentUser reference
            currentUser = auth.currentUser;
            
            return auth.currentUser;
        } catch (popupError) {
            // If popup is blocked or fails, fall back to redirect
            if (popupError.code === 'auth/popup-blocked' || 
                popupError.code === 'auth/popup-closed-by-user' ||
                popupError.code === 'auth/cancelled-popup-request') {
                console.log('linkWithGoogle: Popup blocked/closed, trying redirect...');
                await currentUser.linkWithRedirect(provider);
                return null; // Will be handled by getRedirectResult
            }
            
            // If credential is already in use, sign in with that credential instead
            if (popupError.code === 'auth/credential-already-in-use') {
                console.log('linkWithGoogle: Credential already in use, signing in with existing account');
                const credential = popupError.credential;
                if (credential) {
                    const result = await auth.signInWithCredential(credential);
                    currentUser = result.user;
                    return result.user;
                }
            }
            
            throw popupError;
        }
    } catch (error) {
        console.error('Google linking failed:', error);
        throw error;
    }
}

// Sign out
async function signOutUser() {
    try {
        await auth.signOut();
        // After signing out, sign in anonymously again
        await auth.signInAnonymously();
    } catch (error) {
        console.error('Sign out failed:', error);
        throw error;
    }
}

// Check if current user is anonymous
function isAnonymous() {
    return currentUser && currentUser.isAnonymous;
}
