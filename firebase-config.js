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

try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    console.log('Firebase initialized successfully!');
} catch (error) {
    console.warn('Firebase initialization failed:', error);
    console.warn('The app will work without Firebase features.');
}
