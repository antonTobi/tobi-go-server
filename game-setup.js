// Game setup page script
let previewBoard = null;
let boardType = 'grid';
let boardSize = 9;
let variantEntries = [];   // ordered list of { id, type, element, widget?, ... }
let variantCounter = 0;
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
    grid:        { defaultSize: '9',  min: 2, max: 19 },
    star:        { defaultSize: '5',  min: 2, max: 9  },
    dodecagon:   { defaultSize: '4',  min: 2, max: 5  },
    rotatedGrid: { defaultSize: '9',  min: 2, max: 13 },
    hexagon:     { defaultSize: '6',  min: 2, max: 9 },
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSetupPage);
} else {
    initSetupPage();
}

function initSetupPage() {
    const setupContent = document.querySelector('.setup-content');
    document.getElementById('board-type').addEventListener('change', onBoardTypeChange);
    document.getElementById('board-size').addEventListener('input', validateAndUpdateBoardSize);
    document.getElementById('game-setup-form').addEventListener('submit', handleCreateGame);
    document.getElementById('size-decrement').addEventListener('click', () => adjustBoardSize(-1));
    document.getElementById('size-increment').addEventListener('click', () => adjustBoardSize(1));

    // Quick-size buttons
    document.querySelectorAll('.quick-size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('board-type').value = 'grid';
            document.getElementById('board-size').value = btn.dataset.size;
            boardType = 'grid';
            validateAndUpdateBoardSize();
        });
    });

    initBoardSketch();
    initPickerSketch();

    // Add-variant button / menu
    const addBtn = document.getElementById('add-variant-btn');
    const addMenu = document.getElementById('add-variant-menu');
    const menuGap = 4;
    const menuMargin = 8;

    document.querySelectorAll('[data-quick-add]').forEach(btn => {
        btn.addEventListener('click', () => addVariant(btn.dataset.quickAdd));
    });

    function closeAddMenu() {
        addMenu.style.display = 'none';
    }

    function positionAddMenu() {
        if (addMenu.style.display === 'none') return;

        addMenu.style.position = 'fixed';
        addMenu.style.top = '-9999px';
        addMenu.style.left = '-9999px';
        addMenu.style.maxHeight = '';

        const btnRect = addBtn.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const menuWidth = addMenu.offsetWidth;
        const menuHeight = addMenu.offsetHeight;

        let left = btnRect.left;
        left = Math.max(menuMargin, Math.min(left, vw - menuWidth - menuMargin));

        const belowTop = btnRect.bottom + menuGap;
        const belowSpace = vh - belowTop - menuMargin;
        const aboveSpace = btnRect.top - menuGap - menuMargin;

        let top;
        let maxHeight;

        if (menuHeight <= belowSpace || belowSpace >= aboveSpace) {
            top = belowTop;
            if (menuHeight > belowSpace) {
                maxHeight = Math.max(120, belowSpace);
            }
        } else {
            if (menuHeight <= aboveSpace) {
                top = btnRect.top - menuHeight - menuGap;
            } else {
                maxHeight = Math.max(120, aboveSpace);
                top = btnRect.top - maxHeight - menuGap;
            }
        }

        if (maxHeight) {
            addMenu.style.maxHeight = `${Math.floor(maxHeight)}px`;
        }

        top = Math.max(menuMargin, Math.min(top, vh - addMenu.offsetHeight - menuMargin));

        addMenu.style.left = left + 'px';
        addMenu.style.top = top + 'px';
    }

    addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = addMenu.style.display !== 'none';
        if (open) {
            closeAddMenu();
            return;
        }
        addMenu.style.display = '';
        positionAddMenu();
    });
    addMenu.querySelectorAll('[data-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            addVariant(btn.dataset.type);
            closeAddMenu();
        });
    });
    document.addEventListener('mousedown', (e) => {
        if (!addBtn.contains(e.target) && !addMenu.contains(e.target)) {
            closeAddMenu();
        }
    });

    addVariant('turn-order');

    boardType = document.getElementById('board-type').value;
    validateBoardSize();
    updateSpinnerState();
    updatePreview();

    window.addEventListener('resize', () => {
        handleResize();
        positionAddMenu();
    });
    window.addEventListener('scroll', positionAddMenu, { passive: true });
    if (setupContent) {
        setupContent.addEventListener('scroll', positionAddMenu, { passive: true });
    }
    handleResize();
    requestAnimationFrame(() => {
        handleResize();
        requestAnimationFrame(() => { handleResize(); });
    });
}

function addVariant(type) {
    if (type === 'turn-order') {
        const existingTurnOrder = variantEntries.find(entry => entry.type === 'turn-order');
        if (existingTurnOrder) return existingTurnOrder;
    }

    const id = ++variantCounter;
    const isLocked = type === 'turn-order';
    const entry = { id, type, locked: isLocked };

    const typeLabels = {
        'turn-order': 'Turn Order',
        'setup':      'Setup',
        'power':      'Power',
        'clock':      'Clock',
        'komi':       'Komi',
        'legalitycheck': 'Forbidden Chain-Size',
        'komaster':      'Ko Master',
        'capturecheck':  'Capture Go',
    };

    const bodyId = `variant-body-${id}`;
    const el = document.createElement('div');
    el.className = `variant-entry${isLocked ? ' locked-variant' : ''}`;
    el.dataset.id = id;
    const actionsHtml = isLocked
        ? ''
        : `
            <div class="variant-entry-actions">
                <button type="button" class="variant-move-btn" title="Move up">↑</button>
                <button type="button" class="variant-move-btn" title="Move down">↓</button>
                <button type="button" class="btn-remove-small variant-delete">✕</button>
            </div>
        `;
    el.innerHTML = `
        <div class="variant-entry-header">
            <span class="variant-type-label">${typeLabels[type]}</span>
            ${actionsHtml}
        </div>
        <div class="variant-entry-body" id="${bodyId}"></div>
    `;

    entry.element = el;
    if (isLocked) {
        variantEntries.unshift(entry);
    } else {
        variantEntries.push(entry);
    }

    const variantsList = document.getElementById('variants-list');
    if (isLocked) {
        variantsList.prepend(el);
    } else {
        variantsList.appendChild(el);
    }

    if (!isLocked) {
        const moveBtns = el.querySelectorAll('.variant-move-btn');
        moveBtns[0].addEventListener('click', () => moveVariant(id, -1));
        moveBtns[1].addEventListener('click', () => moveVariant(id, 1));
        el.querySelector('.variant-delete').addEventListener('click', () => removeVariant(id));
    }

    buildVariantBody(entry, bodyId);

    // Scroll the content area to the bottom so the new entry is visible
    const content = document.querySelector('.setup-content');
    if (content) content.scrollTop = content.scrollHeight;
}

function buildVariantBody(entry, containerId) {
    const container = document.getElementById(containerId);
    const id = entry.id;

    switch (entry.type) {
        case 'turn-order': {
            const widgetId = `variant-widget-${id}`;
            container.innerHTML = `<div id="${widgetId}" class="move-list-container"></div>`;
            entry.widget = new MoveListWidget(widgetId, {
                allowEmpty: false,
                defaultMove: { player: 1, color: 1 },
            });
            entry.widget.setMoves([{ player: 1, color: 1 }, { player: 2, color: 2 }]);
            break;
        }
        case 'setup': {
            const widgetId = `variant-widget-${id}`;
            const repeatId = `variant-repeat-${id}`;
            container.innerHTML = `
                <div class="setup-entry-row">
                    <div id="${widgetId}" class="move-list-container"></div>
                    <label class="setup-entry-repeat">Repeat <input type="number" id="${repeatId}" min="1" value="1"></label>
                </div>
            `;
            entry.widget = new MoveListWidget(widgetId, {
                allowEmpty: true,
                defaultMove: { player: 1, color: 1 },
            });
            entry.widget.setMoves([{ player: 1, color: 1 }]);
            entry.repeatInputId = repeatId;
            break;
        }
        case 'power': {
            const widgetId       = `variant-widget-${id}`;
            const usesId         = `variant-uses-${id}`;
            const playerSelectId = `variant-power-player-${id}`;
            container.innerHTML = `
                <div class="setup-entry-row">
                    <div id="${widgetId}" class="move-list-container"></div>
                    <label class="setup-entry-repeat">Uses <input type="number" id="${usesId}" min="1" value="1"></label>
                    <label class="setup-entry-repeat">Player
                        <select id="${playerSelectId}">
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                        </select>
                    </label>
                </div>
            `;
            entry.widget = new MoveListWidget(widgetId, {
                allowEmpty: true,
                defaultMove: { player: 1, color: 1 },
            });
            entry.usesInputId    = usesId;
            entry.playerSelectId = playerSelectId;
            break;
        }
        case 'clock': {
            const mainValId      = `variant-main-val-${id}`;
            const mainUnitId     = `variant-main-unit-${id}`;
            const incValId       = `variant-inc-val-${id}`;
            const incUnitId      = `variant-inc-unit-${id}`;
            const playerSelectId = `variant-clock-player-${id}`;

            // Default: 5m + 10s. If a previous clock exists, copy its values.
            const prevClock = [...variantEntries].reverse().find(e => e.type === 'clock' && e.id !== id);
            const defMainVal  = prevClock ? document.getElementById(prevClock.mainValId)?.value  ?? '5' : '5';
            const defMainUnit = prevClock ? document.getElementById(prevClock.mainUnitId)?.value ?? '60000' : '60000';
            const defIncVal   = prevClock ? document.getElementById(prevClock.incValId)?.value   ?? '10' : '10';
            const defIncUnit  = prevClock ? document.getElementById(prevClock.incUnitId)?.value  ?? '1000' : '1000';

            container.innerHTML = `
                <div class="variant-clock-row">
                    <select class="variant-player-select" id="${playerSelectId}">
                        <option value="all">All players</option>
                        <option value="1">Player 1</option>
                        <option value="2">Player 2</option>
                        <option value="3">Player 3</option>
                        <option value="4">Player 4</option>
                        <option value="5">Player 5</option>
                    </select>
                    <div class="time-settings-row">
                        <input type="number" class="time-num" id="${mainValId}" min="0" value="${defMainVal}">
                        <select class="time-unit" id="${mainUnitId}">
                            <option value="1000" ${defMainUnit==='1000'?'selected':''}>s</option>
                            <option value="60000" ${defMainUnit==='60000'?'selected':''}>m</option>
                            <option value="3600000" ${defMainUnit==='3600000'?'selected':''}>h</option>
                            <option value="86400000" ${defMainUnit==='86400000'?'selected':''}>d</option>
                        </select>
                        <span class="time-plus">+</span>
                        <input type="number" class="time-num" id="${incValId}" min="0" value="${defIncVal}">
                        <select class="time-unit" id="${incUnitId}">
                            <option value="1000" ${defIncUnit==='1000'?'selected':''}>s</option>
                            <option value="60000" ${defIncUnit==='60000'?'selected':''}>m</option>
                            <option value="3600000" ${defIncUnit==='3600000'?'selected':''}>h</option>
                            <option value="86400000" ${defIncUnit==='86400000'?'selected':''}>d</option>
                        </select>
                    </div>
                </div>
            `;
            entry.mainValId      = mainValId;
            entry.mainUnitId     = mainUnitId;
            entry.incValId       = incValId;
            entry.incUnitId      = incUnitId;
            entry.playerSelectId = playerSelectId;
            break;
        }
        case 'komi': {
            const komiInputId    = `variant-komi-val-${id}`;
            const playerSelectId = `variant-komi-player-${id}`;
            container.innerHTML = `
                <div class="variant-komi-row">
                    <select class="variant-player-select" id="${playerSelectId}">
                        <option value="1">Player 1</option>
                        <option value="2" selected>Player 2</option>
                        <option value="3">Player 3</option>
                        <option value="4">Player 4</option>
                        <option value="5">Player 5</option>
                    </select>
                    <input type="number" class="variant-komi-input" id="${komiInputId}" step="0.5" value="7">
                </div>
            `;
            entry.komiInputId    = komiInputId;
            entry.playerSelectId = playerSelectId;
            break;
        }
        case 'legalitycheck': {
            const sizeInputId    = `variant-lc-size-${id}`;
            const playerSelectId = `variant-lc-player-${id}`;
            container.innerHTML = `
                <div class="variant-clock-row">
                    <select class="variant-player-select" id="${playerSelectId}">
                        <option value="all">All players</option>
                        <option value="1">Player 1</option>
                        <option value="2">Player 2</option>
                        <option value="3">Player 3</option>
                        <option value="4">Player 4</option>
                        <option value="5">Player 5</option>
                    </select>
                    <label class="setup-entry-repeat">Forbidden size
                        <input type="number" id="${sizeInputId}" min="1" value="4">
                    </label>
                </div>
            `;
            entry.sizeInputId    = sizeInputId;
            entry.playerSelectId = playerSelectId;
            break;
        }
        case 'komaster': {
            const playerSelectId = `variant-komaster-player-${id}`;
            container.innerHTML = `
                <div class="variant-clock-row">
                    <select class="variant-player-select" id="${playerSelectId}">
                        <option value="1">Player 1</option>
                        <option value="2">Player 2</option>
                        <option value="3">Player 3</option>
                        <option value="4">Player 4</option>
                        <option value="5">Player 5</option>
                    </select>
                </div>
            `;
            entry.playerSelectId = playerSelectId;
            break;
        }
        case 'capturecheck': {
            const sizeInputId    = `variant-cap-size-${id}`;
            const playerSelectId = `variant-cap-player-${id}`;
            container.innerHTML = `
                <div class="variant-clock-row">
                    <select class="variant-player-select" id="${playerSelectId}">
                        <option value="all">All players</option>
                        <option value="1">Player 1</option>
                        <option value="2">Player 2</option>
                        <option value="3">Player 3</option>
                        <option value="4">Player 4</option>
                        <option value="5">Player 5</option>
                    </select>
                    <label class="setup-entry-repeat">Capture limit
                        <input type="number" id="${sizeInputId}" min="1" value="1">
                    </label>
                </div>
            `;
            entry.sizeInputId    = sizeInputId;
            entry.playerSelectId = playerSelectId;
            break;
        }
    }
}

function moveVariant(id, direction) {
    const idx = variantEntries.findIndex(e => e.id === id);
    if (idx === -1) return;
    if (variantEntries[idx].locked) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= variantEntries.length) return;
    if (variantEntries[newIdx].locked) return;
    [variantEntries[idx], variantEntries[newIdx]] = [variantEntries[newIdx], variantEntries[idx]];
    const list = document.getElementById('variants-list');
    for (const entry of variantEntries) list.appendChild(entry.element);
}

function removeVariant(id) {
    const idx = variantEntries.findIndex(e => e.id === id);
    if (idx === -1) return;
    const entry = variantEntries[idx];
    if (entry.locked) return;
    if (entry.widget) entry.widget.destroy();
    entry.element.remove();
    variantEntries.splice(idx, 1);
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
            // Note: touchEnded is attached globally via p.touchEnded below
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
        
        // Use global touchEnded to ensure it fires even if finger moves off canvas
        p.touchEnded = () => {
            isDragging = false;
            dragFromColor = null;
            dragToColor = null;
            // Clear hover node to remove ghost stone
            hoverNode = null;
            p.redraw();
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
                
                // Draw the stone
                if (color === -1) {
                    // Board-colored stone (represents removing a stone)
                    p.fill(...stoneColors[-1]);
                    p.stroke(...strokeColors[-1]);
                    p.strokeWeight(2);
                    p.circle(x, y, pickerStoneSize - 4);
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
    previewBoard = Board.fromSettings({ boardType, boardSize });
    if (boardP5) boardP5.redraw();
}

function parseBoardSize(value, currentBoardType) {
    value = value.trim();
    const config = boardTypeConfig[currentBoardType] || { min: 2, max: 25 };
    const { min, max } = config;
    if (!value) throw new Error('Board size is required');
    const singleMatch = value.match(/^(\d+)$/);
    if (singleMatch) {
        const size = parseInt(singleMatch[1], 10);
        if (size < min || size > max) throw new Error(`Size ${size} out of range (${min}\u2013${max})`);
        return size;
    }
    throw new Error('Use a number (e.g. "9")');
}

function adjustBoardSize(delta) {
    const input = document.getElementById('board-size');
    const config = boardTypeConfig[boardType] || { min: 2, max: 25 };
    const { min, max } = config;
    const current = parseInt(input.value.trim(), 10);
    if (!isNaN(current)) {
        input.value = Math.max(min, Math.min(max, current + delta)).toString();
    }
    validateAndUpdateBoardSize();
}

function updateSpinnerState() {
    const config = boardTypeConfig[boardType] || { min: 2, max: 25 };
    const { min, max } = config;
    document.getElementById('size-decrement').disabled = boardSize <= min;
    document.getElementById('size-increment').disabled = boardSize >= max;
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
        boardSize = parseBoardSize(input.value, boardType);
        errorSpan.textContent = '';
        input.classList.remove('input-error');
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

    if (!validateBoardSize()) return;

    let mainSequence = [{ player: 1, color: 1 }, { player: 2, color: 2 }];
    const setupTurns = [];
    const powers = {};
    const komi = {};
    const timeSettings = {};
    const legalityChecks = [];

    for (const entry of variantEntries) {
        switch (entry.type) {
            case 'turn-order': {
                const moves = entry.widget.getMoves();
                if (moves.length > 0) mainSequence = moves;
                break;
            }
            case 'setup': {
                const moves = entry.widget.getMoves();
                const repeat = Math.max(1, parseInt(document.getElementById(entry.repeatInputId).value, 10) || 1);
                if (moves.length > 0) setupTurns.push({ sequence: moves, repeat });
                break;
            }
            case 'power': {
                const p = parseInt(document.getElementById(entry.playerSelectId).value, 10);
                const moves = entry.widget.getMoves();
                const uses = Math.max(1, parseInt(document.getElementById(entry.usesInputId).value, 10) || 1);
                if (moves.length > 0) {
                    if (!powers[p]) powers[p] = [];
                    powers[p].push({ sequence: moves, numberOfUses: uses });
                }
                break;
            }
            case 'clock': {
                const target = document.getElementById(entry.playerSelectId).value;
                const maintime = Math.round(
                    (parseFloat(document.getElementById(entry.mainValId).value) || 0) *
                    (parseInt(document.getElementById(entry.mainUnitId).value, 10) || 60000)
                );
                const increment = Math.round(
                    (parseFloat(document.getElementById(entry.incValId).value) || 0) *
                    (parseInt(document.getElementById(entry.incUnitId).value, 10) || 1000)
                );
                if (maintime > 0 || increment > 0) {
                    const players = target === 'all' ? [1, 2, 3, 4, 5] : [parseInt(target, 10)];
                    for (const p of players) timeSettings[p] = { maintime, increment };
                }
                break;
            }
            case 'komi': {
                const p = parseInt(document.getElementById(entry.playerSelectId).value, 10);
                const val = parseFloat(document.getElementById(entry.komiInputId).value) || 0;
                if (val !== 0) komi[p] = val;
                break;
            }
            case 'legalitycheck': {
                const size = Math.max(1, parseInt(document.getElementById(entry.sizeInputId).value, 10) || 4);
                const target = document.getElementById(entry.playerSelectId).value;
                const player = target === 'all' ? null : parseInt(target, 10);
                legalityChecks.push({ type: 'forbiddenChainSize', size, player });
                break;
            }
            case 'komaster': {
                const player = parseInt(document.getElementById(entry.playerSelectId).value, 10);
                legalityChecks.push({ type: 'koMaster', player });
                break;
            }
            case 'capturecheck': {
                const size = Math.max(1, parseInt(document.getElementById(entry.sizeInputId).value, 10) || 1);
                const target = document.getElementById(entry.playerSelectId).value;
                const player = target === 'all' ? null : parseInt(target, 10);
                legalityChecks.push({ type: 'captureGo', size, player });
                break;
            }
        }
    }

    // Collect preset stones from the board preview (including color -1 = removed nodes)
    const setupStones = [];
    if (previewBoard) {
        for (const node of previewBoard.nodes) {
            if (node.color !== 0) setupStones.push({ i: node.i, c: node.color });
        }
    }

    // Determine player count from all sequences and power owners
    const playerNums = new Set();
    const addFromSeq = (seq) => seq.forEach(t => { if (t.player >= 1 && t.player <= 5) playerNums.add(t.player); });
    addFromSeq(mainSequence);
    for (const st of setupTurns) addFromSeq(st.sequence);
    for (const p of Object.keys(powers)) { const n = parseInt(p); if (n >= 1 && n <= 5) playerNums.add(n); }
    const numPlayers = playerNums.size > 0 ? Math.max(...playerNums) : 2;
    const effectivePlayers = Math.max(2, numPlayers);

    attemptCreateGame({
        boardType,
        boardSize,
        players:        effectivePlayers,
        setupStones:    setupStones.length               ? setupStones    : null,
        setupTurns:     setupTurns.length                ? setupTurns     : null,
        mainSequence,
        powers:         Object.keys(powers).length       ? powers         : null,
        komi:           Object.keys(komi).length         ? komi           : null,
        timeSettings:   Object.keys(timeSettings).length ? timeSettings   : null,
        legalityChecks: legalityChecks.length            ? legalityChecks : null,
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
                const compressed = compressGameSetting(settings);

                // Build initial clocks: each player's maintime stored as paused ms-remaining
                const initialClocks = {};
                if (settings.timeSettings) {
                    for (const [playerNum, ts] of Object.entries(settings.timeSettings)) {
                        if (ts.maintime > 0) initialClocks[parseInt(playerNum)] = ts.maintime;
                    }
                }

                const gameData = {
                    createdBy: currentUser.uid,
                    createdAt: firebase.database.ServerValue.TIMESTAMP,
                    ...compressed,
                    [G_PHASE]:       'lobby',
                    [G_CLOCKS]:      Object.keys(initialClocks).length ? initialClocks : null,
                    [G_MOVES]:       null,
                    [G_REQUEST]:     null,
                    [G_DEAD_CHAINS]: null,
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

function isLocalhost() {
    return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
}

function joinGame(gameId) {
    if (isLocalhost()) {
        window.location.replace(`/game.html?id=${gameId}`);
    } else {
        window.location.replace(`/game/${gameId}`);
    }
}

