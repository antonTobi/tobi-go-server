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

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    auth = firebase.auth();
    console.log('Firebase initialized successfully!');
    
    // Enable anonymous authentication
    auth.signInAnonymously()
        .then(() => {
            console.log('Signed in anonymously');
        })
        .catch((error) => {
            console.error('Anonymous sign-in failed:', error);
        });
    
    // Listen for auth state changes
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            console.log('User authenticated:', user.uid);
        } else {
            currentUser = null;
            console.log('User signed out');
        }
    });
} catch (error) {
    console.warn('Firebase initialization failed:', error);
}
