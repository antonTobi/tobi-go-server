// p5.js sketch
let circles = [];

function setup() {
    // Create canvas and place it in the container
    let canvas = createCanvas(600, 400);
    canvas.parent('canvas-container');
    background(240);
    
    // Setup clear button
    let clearBtn = select('#clearBtn');
    clearBtn.mousePressed(clearCanvas);
    
    console.log('p5.js setup complete!');
}

function draw() {
    // Drawing is handled in mousePressed
}

function mousePressed() {
    // Only draw if mouse is on canvas
    if (mouseX >= 0 && mouseX <= width && mouseY >= 0 && mouseY <= height) {
        // Create a new circle object
        let circle = {
            x: mouseX,
            y: mouseY,
            size: random(20, 50),
            color: color(random(255), random(255), random(255), 150)
        };
        
        circles.push(circle);
        
        // Draw the circle
        fill(circle.color);
        noStroke();
        ellipse(circle.x, circle.y, circle.size);
        
        // Save to Firebase (if configured)
        saveToFirebase(circle);
    }
}

function clearCanvas() {
    background(240);
    circles = [];
    console.log('Canvas cleared!');
}

function saveToFirebase(circle) {
    // Check if Firebase is initialized
    if (typeof db !== 'undefined' && db !== null) {
        db.ref('circles').push({
            x: circle.x,
            y: circle.y,
            size: circle.size,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        })
        .then((ref) => {
            console.log('Circle saved with ID: ', ref.key);
        })
        .catch((error) => {
            console.error('Error saving circle: ', error);
        });
    } else {
        console.log('Firebase not configured - circle not saved');
    }
}
