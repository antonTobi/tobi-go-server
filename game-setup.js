// Game setup page script
let previewBoard = null;
let boardType = 'grid';
let boardWidth = 9;
let boardHeight = 9;
let pregameSequence = '';
let turnCycle = '101,202';
let selectedColor = 1; // Default to black
let hoverNode = null;
let hoverPickerColor = null;
let boardP5 = null;
let pickerP5 = null;

// Drag state for placing multiple stones
let isDragging = false;
let dragFromColor = null; // The original color being changed from
let dragToColor = null; // The color being changed to

// Stone picker configuration
const pickerColors = [-1, 1, 2, 3, 4, 5]; // Delete, Black, White, Red, Yellow, Cobalt
const pickerStoneSize = 40;
const pickerPadding = 10;
const pickerSelectionBorder = 4;

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
    // Setup tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    
    // Setup form listeners
    document.getElementById('board-type').addEventListener('change', onBoardTypeChange);
    document.getElementById('board-size').addEventListener('input', validateAndUpdateBoardSize);
    document.getElementById('pregame-sequence').addEventListener('input', validatePregameSequence);
    document.getElementById('turn-cycle').addEventListener('input', validateTurnCycle);
    document.getElementById('game-setup-form').addEventListener('submit', handleCreateGame);
    
    // Setup spinner buttons
    document.getElementById('size-decrement').addEventListener('click', () => adjustBoardSize(-1));
    document.getElementById('size-increment').addEventListener('click', () => adjustBoardSize(1));
    
    // Initialize p5 sketches
    initBoardSketch();
    initPickerSketch();
    
    // Sync JS state with actual form values (browser may restore previous values)
    boardType = document.getElementById('board-type').value;
    
    // Validate initial values and show preview
    validateBoardSize();
    updateSpinnerState();
    updatePreview();
    
    // Handle window resize for responsive layout
    window.addEventListener('resize', handleResize);
    
    // Call resize multiple times during page load to catch layout shifts
    // First call immediately
    handleResize();
    // Second call after rAF (after first paint)
    requestAnimationFrame(() => {
        handleResize();
        // Third call after another rAF (after styles/layout stabilize)
        requestAnimationFrame(() => {
            handleResize();
        });
    });
}

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update panels
    document.querySelectorAll('.setup-panel').forEach(panel => {
        panel.classList.toggle('active', panel.dataset.panel === tabName);
    });
    
    // Redraw canvases when switching to board tab
    if (tabName === 'board') {
        // Use requestAnimationFrame to ensure layout is complete before resizing
        requestAnimationFrame(() => {
            handleResize();
        });
    }
}

function handleResize() {
    const container = document.getElementById('preview-container');
    if (!container || !boardP5) return;
    
    // Get the container's available space
    const rect = container.getBoundingClientRect();
    
    // If container has no size yet, try again later
    if (rect.width < 50 || rect.height < 50) {
        requestAnimationFrame(handleResize);
        return;
    }
    
    // Board should be square - use the smaller dimension
    // but limit to a reasonable maximum
    const maxSize = 600;
    const size = Math.floor(Math.min(rect.width, rect.height, maxSize));
    
    if (size > 50) {
        boardP5.resizeCanvas(size, size);
        if (previewBoard) {
            previewBoard.calculateTransform(size, size);
            boardP5.redraw();
        }
    }
}

function initBoardSketch() {
    const sketch = (p) => {
        let canvas;
        
        p.setup = () => {
            const container = document.getElementById('preview-container');
            const size = Math.min(container.offsetWidth || 400, container.offsetHeight || 400);
            canvas = p.createCanvas(size, size);
            canvas.parent('preview-container');
            p.noLoop();
            
            // Attach mouse/touch events directly to the canvas element
            // This ensures events only fire when the canvas itself is clicked
            canvas.mousePressed(handleMousePressed);
            canvas.mouseReleased(handleMouseReleased);
            canvas.mouseMoved(handleMouseMoved);
            canvas.touchStarted(handleTouchStarted);
            canvas.touchMoved(handleTouchMoved);
            canvas.touchEnded(handleTouchEnded);
        };
        
        function handleMousePressed() {
            if (previewBoard && hoverNode) {
                // Record original color for drag operation
                dragFromColor = hoverNode.color;
                
                // Determine target color: if clicking on stone of same color as selected, remove it
                if (hoverNode.color === selectedColor) {
                    dragToColor = 0; // Remove (set to empty)
                } else {
                    dragToColor = selectedColor; // Add selected color
                }
                
                // Apply the initial change
                hoverNode.color = dragToColor;
                isDragging = true;
                p.redraw();
            }
        }
        
        function handleMouseReleased() {
            isDragging = false;
            dragFromColor = null;
            dragToColor = null;
        }
        
        function handleMouseMoved() {
            if (previewBoard) {
                let newHover = previewBoard.findHover(p.mouseX, p.mouseY, false);
                
                if (hoverNode !== newHover) {
                    hoverNode = newHover;
                    p.redraw();
                }
            }
        }
        
        function handleTouchStarted() {
            if (p.touches.length > 0) {
                const touch = p.touches[0];
                
                if (previewBoard) {
                    let touchNode = previewBoard.findHover(touch.x, touch.y, false);
                    if (touchNode) {
                        hoverNode = touchNode;
                        // Record original color for drag operation
                        dragFromColor = touchNode.color;
                        
                        // Determine target color: if touching stone of same color as selected, remove it
                        if (touchNode.color === selectedColor) {
                            dragToColor = 0; // Remove (set to empty)
                        } else {
                            dragToColor = selectedColor; // Add selected color
                        }
                        
                        // Apply the initial change
                        touchNode.color = dragToColor;
                        isDragging = true;
                        p.redraw();
                    }
                }
                return false; // Prevent default
            }
        }
        
        function handleTouchMoved() {
            if (p.touches.length > 0) {
                const touch = p.touches[0];
                if (!isDragging || !previewBoard) return false;
                
                let newHover = previewBoard.findHover(touch.x, touch.y, false);
                if (newHover && newHover !== hoverNode) {
                    hoverNode = newHover;
                    applyDragToNode(newHover);
                    p.redraw();
                }
                return false; // Prevent default
            }
        }
        
        function handleTouchEnded() {
            isDragging = false;
            dragFromColor = null;
            dragToColor = null;
            // Clear hover node to remove ghost stone
            hoverNode = null;
            p.redraw();
        }

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
        
        // Keep mouseDragged as a p5 method since it needs to track dragging
        p.mouseDragged = () => {
            if (!isDragging || !previewBoard) return;
            
            let newHover = previewBoard.findHover(p.mouseX, p.mouseY, false);
            if (newHover && newHover !== hoverNode) {
                hoverNode = newHover;
                applyDragToNode(newHover);
                p.redraw();
            }
        };

        p.windowResized = () => {
            handleResize();
        };
    };
    
    boardP5 = new p5(sketch);
}

function applyDragToNode(node) {
    if (!node || dragFromColor === null) return;
    
    // Only change nodes that have the same color as the first clicked node
    if (node.color === dragFromColor) {
        node.color = dragToColor;
    }
}

function initPickerSketch() {
    const sketch = (p) => {
        p.setup = () => {
            const totalWidth = pickerColors.length * (pickerStoneSize + pickerPadding * 2);
            const height = pickerStoneSize + pickerPadding * 2;
            let canvas = p.createCanvas(totalWidth, height);
            canvas.parent('stone-picker-container');
            p.noLoop();
        };

        p.draw = () => {
            p.background(245);
            
            for (let i = 0; i < pickerColors.length; i++) {
                const color = pickerColors[i];
                const x = i * (pickerStoneSize + pickerPadding * 2) + pickerStoneSize / 2 + pickerPadding;
                const y = p.height / 2;
                
                // Draw selection indicator
                if (color === selectedColor) {
                    p.noFill();
                    p.stroke(102, 126, 234); // #667eea
                    p.strokeWeight(pickerSelectionBorder);
                    p.circle(x, y, pickerStoneSize + pickerSelectionBorder);
                }
                
                // Draw hover highlight
                if (hoverPickerColor === color && color !== selectedColor) {
                    p.noFill();
                    p.stroke(180, 180, 200);
                    p.strokeWeight(2);
                    p.circle(x, y, pickerStoneSize + 4);
                }
                
                // Draw the stone or delete icon
                if (color === -1) {
                    // Draw delete "X" icon
                    p.fill(255);
                    p.stroke(200);
                    p.strokeWeight(2);
                    p.circle(x, y, pickerStoneSize - 4);
                    
                    // Draw X
                    p.stroke(100);
                    p.strokeWeight(3);
                    const offset = pickerStoneSize / 5;
                    p.line(x - offset, y - offset, x + offset, y + offset);
                    p.line(x - offset, y + offset, x + offset, y - offset);
                } else if (color >= 1 && color <= 5) {
                    // Draw stone using board.js colors
                    p.fill(...stoneColors[color]);
                    p.stroke(...strokeColors[color]);
                    p.strokeWeight(2);
                    p.circle(x, y, pickerStoneSize - 4);
                }
            }
        };

        p.mouseMoved = () => {
            const newHover = getHoverPickerColor(p.mouseX, p.mouseY, p.height);
            if (newHover !== hoverPickerColor) {
                hoverPickerColor = newHover;
                p.redraw();
            }
        };
        
        p.mouseOut = () => {
            if (hoverPickerColor !== null) {
                hoverPickerColor = null;
                p.redraw();
            }
        };

        p.mousePressed = () => {
            const clicked = getHoverPickerColor(p.mouseX, p.mouseY, p.height);
            if (clicked !== null) {
                selectedColor = clicked;
                p.redraw();
            }
        };
    };
    
    pickerP5 = new p5(sketch);
}

function getHoverPickerColor(mouseX, mouseY, canvasHeight) {
    const height = canvasHeight || (pickerStoneSize + pickerPadding * 2);
    
    for (let i = 0; i < pickerColors.length; i++) {
        const x = i * (pickerStoneSize + pickerPadding * 2) + pickerStoneSize / 2 + pickerPadding;
        const y = height / 2;
        const dist = Math.sqrt((mouseX - x) ** 2 + (mouseY - y) ** 2);
        if (dist < pickerStoneSize / 2) {
            return pickerColors[i];
        }
    }
    return null;
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
    
    if (boardP5) {
        boardP5.redraw();
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

