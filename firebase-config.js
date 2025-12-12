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

// Display name cache to avoid repeated database reads
const displayNameCache = {};

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    auth = firebase.auth();
    
    // Check for redirect result FIRST, before any other auth operations
    auth.getRedirectResult()
        .then((result) => {
            console.log('getRedirectResult:', result);
            
            // Check if we got a result from redirect (either sign-in or link)
            if (result && result.user) {
                console.log('Google redirect successful, user:', result.user.uid, 'operationType:', result.operationType);
                console.log('User isAnonymous:', result.user.isAnonymous);
                
                // Use Google display name if user doesn't have one set
                if (result.user.displayName) {
                    db.ref(`users/${result.user.uid}/displayName`).once('value').then(snapshot => {
                        if (!snapshot.val()) {
                            db.ref(`users/${result.user.uid}/displayName`).set(result.user.displayName);
                            displayNameCache[result.user.uid] = result.user.displayName;
                            console.log('Set display name from Google:', result.user.displayName);
                        }
                    });
                }
            }
        })
        .catch((error) => {
            console.error('getRedirectResult error:', error);
            // Handle the case where the Google account is already linked to another user
            if (error.code === 'auth/credential-already-in-use') {
                console.log('Credential already in use, signing in with existing account');
                if (error.credential) {
                    return auth.signInWithCredential(error.credential);
                }
            }
            // Dispatch error event for UI to handle
            window.dispatchEvent(new CustomEvent('authError', { detail: { error } }));
        });
    
    // Set persistence to LOCAL (survives browser restarts)
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            console.log('Firebase initialized with persistent auth');
            
            // Only sign in anonymously if not already signed in
            if (!auth.currentUser) {
                console.log('No current user, signing in anonymously');
                return auth.signInAnonymously();
            } else {
                console.log('Already signed in as:', auth.currentUser.uid, 'isAnonymous:', auth.currentUser.isAnonymous);
            }
        })
        .then(() => {
            console.log('Auth ready');
        })
        .catch((error) => {
            console.error('Auth initialization failed:', error);
        });
    
    // Listen for auth state changes
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            authReady = true;
            console.log('User authenticated:', user.uid);
            
            // Dispatch custom event for pages to listen to
            window.dispatchEvent(new CustomEvent('authReady', { detail: { user } }));
        } else {
            currentUser = null;
            authReady = false;
            console.log('User signed out');
        }
    });
} catch (error) {
    console.warn('Firebase initialization failed:', error);
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
        const snapshot = await db.ref(`users/${uid}/displayName`).once('value');
        const name = snapshot.val();
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

// Sign in with Google (uses redirect for mobile compatibility)
async function signInWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        // Use redirect instead of popup for better mobile support and to avoid popup blockers
        await auth.signInWithRedirect(provider);
        // The result will be handled by getRedirectResult on page load
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

// Link anonymous account to Google (uses redirect for mobile compatibility)
async function linkWithGoogle() {
    if (!currentUser) {
        throw new Error('Not authenticated');
    }
    
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        // Use redirect instead of popup for better mobile support
        await currentUser.linkWithRedirect(provider);
        // The result will be handled by getRedirectResult on page load
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
