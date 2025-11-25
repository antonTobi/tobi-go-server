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

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    auth = firebase.auth();
    
    // Set persistence to LOCAL (survives browser restarts)
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            console.log('Firebase initialized with persistent auth');
            
            // Only sign in anonymously if not already signed in
            return auth.currentUser ? Promise.resolve() : auth.signInAnonymously();
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
