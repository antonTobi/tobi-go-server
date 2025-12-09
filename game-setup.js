// Game setup page script
let previewBoard = null;
let boardType = 'grid';
let boardWidth = 9;
let boardHeight = 9;
let pregameSequence = '';
let turnCycle = '101,202';
let selectedColor = 1; // Default to black
let hoverNode = null;
let p = null;

// Board type configuration
const boardTypeConfig = {
    grid: { defaultSize: '9x9', supportsRectangular: true, min: 2, max: 25 },
    star: { defaultSize: '5', supportsRectangular: false, min: 2, max: 9 },
    dodecagon: { defaultSize: '4', supportsRectangular: false, min: 2, max: 7 },
    rotatedGrid: { defaultSize: '9', supportsRectangular: true, min: 2, max: 19 },
    hexagon: { defaultSize: '6', supportsRectangular: false, min: 2, max: 11 }
};

initSetupPage();

function initSetupPage() {
    // Setup form listeners
    document.getElementById('board-type').addEventListener('change', onBoardTypeChange);
    document.getElementById('board-size').addEventListener('input', validateAndUpdateBoardSize);
    document.getElementById('pregame-sequence').addEventListener('input', validatePregameSequence);
    document.getElementById('turn-cycle').addEventListener('input', validateTurnCycle);
    document.getElementById('game-setup-form').addEventListener('submit', handleCreateGame);
    
    // Setup spinner buttons
    document.getElementById('size-decrement').addEventListener('click', () => adjustBoardSize(-1));
    document.getElementById('size-increment').addEventListener('click', () => adjustBoardSize(1));
    
    // Setup stone color toolbar
    document.querySelectorAll('.stone-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.stone-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedColor = parseInt(btn.dataset.color);
        });
    });
    
    // Set default active button
    document.querySelector('.stone-btn[data-color="1"]').classList.add('active');
    
    // Initialize p5 sketch
    initSketch();
    
    // Sync JS state with actual form values (browser may restore previous values)
    boardType = document.getElementById('board-type').value;
    
    // Validate initial values and show preview
    validateBoardSize();
    updateSpinnerState();
    updatePreview();
}

function initSketch() {
    const sketch = (p) => {
        p.setup = () => {
            // p.pixelDensity(1); // Ensure 1:1 canvas pixels to screen pixels for crisp lines
            let canvas = p.createCanvas(600, 600);
            canvas.parent('preview-container');
            p.noLoop();
        };

        p.draw = () => {
            p.background(255, 193, 140);
            
            if (previewBoard) {
                previewBoard.calculateTransform(p.width, p.height);
                previewBoard.draw(p);
                
                // Draw ghost stone on hover
                if (hoverNode) {
                    previewBoard.drawGhostStone(hoverNode, selectedColor, p);
                }
            }
        };

        p.mouseMoved = () => {
            if (previewBoard) {
                let newHover = previewBoard.findHover(p.mouseX, p.mouseY, false);
                
                if (hoverNode !== newHover) {
                    hoverNode = newHover;
                    p.redraw();
                }
            }
        };

        p.mousePressed = () => {
            if (previewBoard && hoverNode) {
                // Toggle stone: if same color, remove; otherwise set to selected color
                if (hoverNode.color === selectedColor) {
                    hoverNode.color = 0;
                } else {
                    hoverNode.color = selectedColor;
                }
                p.redraw();
            }
        };

        p.windowResized = () => {
            let container = document.getElementById('preview-container');
            if (container) {
                p.resizeCanvas(container.offsetWidth, container.offsetWidth);
                if (previewBoard) {
                    previewBoard.calculateTransform(p.width, p.height);
                    p.redraw();
                }
            }
        };
    };
    
    p = new p5(sketch);
}

function onBoardTypeChange() {
    const newBoardType = document.getElementById('board-type').value;
    const sizeInput = document.getElementById('board-size');
    
    // Set default size for the new board type
    const config = boardTypeConfig[newBoardType];
    if (config) {
        sizeInput.value = config.defaultSize;
    }
    
    // Update the board type and validate/preview
    boardType = newBoardType;
    validateAndUpdateBoardSize();
}

function updatePreview() {
    // Create new board based on settings using the unified factory
    previewBoard = Board.fromSettings({
        boardType,
        boardWidth,
        boardHeight
    });
    
    if (p) {
        p.redraw();
    }
}

function parseBoardSize(value, currentBoardType) {
    value = value.trim();
    const config = boardTypeConfig[currentBoardType] || { supportsRectangular: false, min: 2, max: 25 };
    const { min, max } = config;
    
    if (!value) {
        throw new Error('Board size is required');
    }
    
    // Check for WxH format (e.g., "19x13" or "19X13")
    const wxhMatch = value.match(/^(\d+)\s*[xX]\s*(\d+)$/);
    if (wxhMatch) {
        if (!config.supportsRectangular) {
            throw new Error(`${currentBoardType} boards don't support WxH format`);
        }
        
        const width = parseInt(wxhMatch[1], 10);
        const height = parseInt(wxhMatch[2], 10);
        
        if (width < min || width > max) {
            throw new Error(`Width ${width} out of range (${min}-${max})`);
        }
        if (height < min || height > max) {
            throw new Error(`Height ${height} out of range (${min}-${max})`);
        }
        
        return { width, height };
    }
    
    // Check for single number (square board)
    const singleMatch = value.match(/^(\d+)$/);
    if (singleMatch) {
        const size = parseInt(singleMatch[1], 10);
        
        if (size < min || size > max) {
            throw new Error(`Size ${size} out of range (${min}-${max})`);
        }
        
        return { width: size, height: size };
    }
    
    throw new Error('Use a number (e.g. "19") or WxH format (e.g. "19x13")');;;
}

function adjustBoardSize(delta) {
    const input = document.getElementById('board-size');
    const value = input.value.trim();
    const config = boardTypeConfig[boardType] || { min: 2, max: 25 };
    const { min, max } = config;
    
    // Check for WxH format
    const wxhMatch = value.match(/^(\d+)\s*[xX]\s*(\d+)$/);
    if (wxhMatch) {
        let width = parseInt(wxhMatch[1], 10) + delta;
        let height = parseInt(wxhMatch[2], 10) + delta;
        
        // Clamp to valid range
        width = Math.max(min, Math.min(max, width));
        height = Math.max(min, Math.min(max, height));
        
        input.value = `${width}x${height}`;
    } else {
        // Single number format
        const singleMatch = value.match(/^(\d+)$/);
        if (singleMatch) {
            let size = parseInt(singleMatch[1], 10) + delta;
            size = Math.max(min, Math.min(max, size));
            input.value = size.toString();
        }
    }
    
    validateAndUpdateBoardSize();
}

function updateSpinnerState() {
    const config = boardTypeConfig[boardType] || { min: 2, max: 25 };
    const { min, max } = config;
    
    const decrementBtn = document.getElementById('size-decrement');
    const incrementBtn = document.getElementById('size-increment');
    
    // Check current values against min/max
    const atMin = boardWidth <= min && boardHeight <= min;
    const atMax = boardWidth >= max || boardHeight >= max;
    
    decrementBtn.disabled = atMin;
    incrementBtn.disabled = atMax;
}

function validateAndUpdateBoardSize() {
    const isValid = validateBoardSize();
    updateSpinnerState();
    if (isValid) {
        updatePreview();
    }
    return isValid;
}

function validateBoardSize() {
    const input = document.getElementById('board-size');
    const errorSpan = document.getElementById('board-size-error');
    
    try {
        const { width, height } = parseBoardSize(input.value, boardType);
        boardWidth = width;
        boardHeight = height;
        errorSpan.textContent = '';
        input.classList.remove('input-error');
        return true;
    } catch (e) {
        errorSpan.textContent = e.message;
        input.classList.add('input-error');
        return false;
    }
}

function validatePregameSequence() {
    const input = document.getElementById('pregame-sequence');
    const errorSpan = document.getElementById('pregame-sequence-error');
    const value = input.value.trim();
    
    // Empty is valid for pregame sequence
    if (!value) {
        errorSpan.textContent = '';
        input.classList.remove('input-error');
        pregameSequence = '';
        return true;
    }
    
    try {
        orderFromString(value);
        errorSpan.textContent = '';
        input.classList.remove('input-error');
        pregameSequence = value;
        return true;
    } catch (e) {
        errorSpan.textContent = e.message;
        input.classList.add('input-error');
        return false;
    }
}

function validateTurnCycle() {
    const input = document.getElementById('turn-cycle');
    const errorSpan = document.getElementById('turn-cycle-error');
    const value = input.value.trim();
    
    if (!value) {
        errorSpan.textContent = 'Turn cycle is required';
        input.classList.add('input-error');
        return false;
    }
    
    try {
        orderFromString(value);
        errorSpan.textContent = '';
        input.classList.remove('input-error');
        turnCycle = value;
        return true;
    } catch (e) {
        errorSpan.textContent = e.message;
        input.classList.add('input-error');
        return false;
    }
}

function handleCreateGame(event) {
    event.preventDefault();
    
    if (!currentUser) {
        alert('Please wait for authentication...');
        return;
    }
    
    // Validate all inputs before creating game
    const isBoardSizeValid = validateBoardSize();
    const isPregameValid = validatePregameSequence();
    const isTurnCycleValid = validateTurnCycle();
    
    if (!isBoardSizeValid || !isPregameValid || !isTurnCycleValid) {
        return;
    }
    
    // Collect preset stones from the board preview
    const presetStones = [];
    if (previewBoard) {
        previewBoard.nodes.forEach(node => {
            if (node.color) {
                presetStones.push({
                    i: node.i,
                    c: node.color
                });
            }
        });
    }
    
    attemptCreateGame({
        boardType,
        boardWidth,
        boardHeight,
        presetStones,
        pregameSequence,
        turnCycle
    });
}

function attemptCreateGame(settings) {    
    const gameId = generateGameId();
    const newGameRef = db.ref(`games/${gameId}`);
    
    newGameRef.once('value')
        .then((snapshot) => {
            if (snapshot.exists()) {
                console.log(`Game ID ${gameId} already exists, retrying...`);
                attemptCreateGame(settings);
            } else {
                const gameData = {
                    createdBy: currentUser.uid,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    settings: settings,
                    moves: {}
                };
                
                return newGameRef.set(gameData)
                    .then(() => {
                        console.log('Game created:', gameId);
                        joinGame(gameId);
                    });
            }
        })
        .catch((error) => {
            console.error('Error creating game:', error);
            alert('Failed to create game');
        });
}

function generateGameId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function joinGame(gameId) {
    if (window.location.href == "http://127.0.0.1:3000/game-setup.html" ) {
        window.location.replace(`/game.html?id=${gameId}`);
    } else {
        window.location.replace(`/game/${gameId}`);
    }
}

