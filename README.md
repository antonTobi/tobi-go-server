# tobi-go-server

A simple webapp boilerplate using p5.js and Firebase.

## Features

- **p5.js**: Interactive canvas for creative coding
- **Firebase**: Backend integration for data storage
- **Modern Design**: Clean and responsive UI

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/antonTobi/tobi-go-server.git
cd tobi-go-server
```

2. Install dependencies:
```bash
npm install
```

3. Install http-server globally (if not already installed):
```bash
npm install -g http-server
```

### Firebase Setup (Optional)

To enable Firebase features:

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Create a web app in your Firebase project
3. Copy your Firebase configuration
4. Open `firebase-config.js` and replace the placeholder values with your actual Firebase configuration

### Running the App

Start the development server:
```bash
npm start
```

This will open the app in your default browser at `http://localhost:8080`

Alternatively, you can open `index.html` directly in your browser.

## Project Structure

```
tobi-go-server/
├── index.html          # Main HTML file
├── sketch.js           # p5.js sketch code
├── style.css           # Styling
├── firebase-config.js  # Firebase configuration
├── package.json        # npm configuration
└── README.md          # This file
```

## Usage

- Click on the canvas to draw colorful circles
- Click the "Clear Canvas" button to reset the canvas
- If Firebase is configured, circles will be saved to Firestore

## Technologies

- [p5.js](https://p5js.org/) - Creative coding library
- [Firebase](https://firebase.google.com/) - Backend platform
- HTML5, CSS3, JavaScript

## License

ISC