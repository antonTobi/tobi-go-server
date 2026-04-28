// Reusable graphical move list editor
// Renders a horizontal list of Turn tokens on a p5 canvas with a DOM popup for editing.
// Each turn has: player (0-5), color (1-5).

class MoveListWidget {
    constructor(containerId, options = {}) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.onChange = options.onChange || null;
        this.allowEmpty = options.allowEmpty !== undefined ? options.allowEmpty : true;
        this.defaultMove = options.defaultMove || { player: 1, color: 1 };

        this.moves = [];
        this.hoverIndex = -1;   // index of hovered move, or -1
        this.selectedIndex = -1; // index of move with open popup

        // Drag state
        this.dragIndex = -1;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.dragMouseX = 0;
        this.dragMouseY = 0;
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragThreshold = 5; // pixels before drag starts

        // Sizing (matches picker style)
        this.stoneSize = 36;
        this.padding = 8;
        this.addBtnSize = 30;

        this.p5Instance = null;
        this.popup = null;

        this._initCanvas();
        this._initPopup();
        this._onClickOutside = this._onClickOutside.bind(this);
        document.addEventListener('mousedown', this._onClickOutside);
    }

    // --- Public API ---

    getMoves() {
        return this.moves.map(m => {
            const obj = { player: m.player, color: m.color };
            if (m.hidden) obj.hidden = true;
            if (m.traitorColor !== undefined) obj.traitorColor = m.traitorColor;
            if (m.traitorPercentage !== undefined) obj.traitorPercentage = m.traitorPercentage;
            return obj;
        });
    }

    setMoves(arr) {
        this.moves = (arr || []).map(m => new Turn(m));
        this.selectedIndex = -1;
        this._closePopup();
        this._resizeCanvas();
        this._redraw();
    }

    destroy() {
        document.removeEventListener('mousedown', this._onClickOutside);
        if (this.popup && this.popup.parentNode) {
            this.popup.parentNode.removeChild(this.popup);
        }
        if (this.p5Instance) {
            this.p5Instance.remove();
        }
    }

    // --- Private: Canvas ---

    _slotWidth() {
        return this.stoneSize + this.padding * 2;
    }

    _totalWidth() {
        return this.moves.length * this._slotWidth() + this._slotWidth(); // +1 for add button
    }

    _canvasHeight() {
        return this.stoneSize + this.padding * 2;
    }

    _resizeCanvas() {
        if (this.p5Instance) {
            this.p5Instance.resizeCanvas(this._totalWidth(), this._canvasHeight());
        }
    }

    _redraw() {
        if (this.p5Instance) {
            this.p5Instance.redraw();
        }
    }

    _drawStone(p, cx, cy, move, opts = {}) {
        const { ghost = false } = opts;

        drawMoveStone(p, cx, cy, move, this.stoneSize);

        if (ghost) {
            p.fill(245, 245, 245, 120);
            p.noStroke();
            p.circle(cx, cy, this.stoneSize - 2);
        }
    }

    _initCanvas() {
        const self = this;

        const sketch = (p) => {
            p.setup = () => {
                const canvas = p.createCanvas(self._totalWidth(), self._canvasHeight());
                canvas.parent(self.containerId);
                p.noLoop();

                canvas.mousePressed(() => self._handleMouseDown(p));
                canvas.mouseMoved(() => self._handleHover(p));
                canvas.mouseOut(() => {
                    if (self.dragIndex !== -1) return; // don't clear during drag
                    if (self.hoverIndex !== -1) {
                        self.hoverIndex = -1;
                        p.redraw();
                    }
                });
            };

            p.draw = () => {
                p.background(245);
                const sw = self._slotWidth();
                const cy = p.height / 2;

                // Compute drop target position during drag
                let dropTarget = -1;
                if (self.isDragging && self.dragIndex !== -1) {
                    // Where the dragged stone's center is in canvas coords
                    const canvasRect = p.canvas.getBoundingClientRect();
                    const dragCx = self.dragMouseX - canvasRect.left;
                    dropTarget = Math.round((dragCx - sw / 2) / sw);
                    dropTarget = Math.max(0, Math.min(self.moves.length - 1, dropTarget));
                }

                // Draw each move token
                for (let i = 0; i < self.moves.length; i++) {
                    if (self.isDragging && i === self.dragIndex) {
                        // Draw ghost placeholder at original position
                        const cx = i * sw + sw / 2;
                        self._drawStone(p, cx, cy, self.moves[i], { ghost: true });
                        continue;
                    }

                    const move = self.moves[i];
                    let drawX = i * sw + sw / 2;

                    // Shift stones to make room at drop target
                    if (self.isDragging && self.dragIndex !== -1 && dropTarget !== -1) {
                        if (self.dragIndex < dropTarget) {
                            // Dragging right: shift items between (dragIndex, dropTarget] left
                            if (i > self.dragIndex && i <= dropTarget) {
                                drawX -= sw;
                            }
                        } else if (self.dragIndex > dropTarget) {
                            // Dragging left: shift items between [dropTarget, dragIndex) right
                            if (i >= dropTarget && i < self.dragIndex) {
                                drawX += sw;
                            }
                        }
                    }

                    // Selection ring
                    if (i === self.selectedIndex) {
                        p.noFill();
                        p.stroke(102, 126, 234);
                        p.strokeWeight(3);
                        p.circle(drawX, cy, self.stoneSize + 4);
                    }

                    // Hover ring
                    if (i === self.hoverIndex && i !== self.selectedIndex) {
                        p.noFill();
                        p.stroke(180, 180, 200);
                        p.strokeWeight(2);
                        p.circle(drawX, cy, self.stoneSize + 4);
                    }

                    self._drawStone(p, drawX, cy, move);
                }

                // Draw "+" add button
                const addCx = self.moves.length * sw + sw / 2;
                const addCy = cy;
                const addR = self.addBtnSize;

                if (self.hoverIndex === self.moves.length) {
                    p.fill(220, 220, 230);
                } else {
                    p.fill(235, 235, 240);
                }
                p.stroke(200, 200, 210);
                p.strokeWeight(2);
                p.circle(addCx, addCy, addR);

                p.stroke(140, 140, 150);
                p.strokeWeight(3);
                const plusSize = addR * 0.25;
                p.line(addCx - plusSize, addCy, addCx + plusSize, addCy);
                p.line(addCx, addCy - plusSize, addCx, addCy + plusSize);

                // Draw the dragged stone floating at mouse position
                if (self.isDragging && self.dragIndex !== -1 && self.dragIndex < self.moves.length) {
                    const canvasRect = p.canvas.getBoundingClientRect();
                    const fx = self.dragMouseX - canvasRect.left;
                    const fy = self.dragMouseY - canvasRect.top;
                    self._drawStone(p, fx, fy, self.moves[self.dragIndex]);
                }
            };
        };

        this.p5Instance = new p5(sketch);
    }

    _hitTest(mx, my) {
        const sw = this._slotWidth();
        const cy = this._canvasHeight() / 2;

        for (let i = 0; i < this.moves.length; i++) {
            const cx = i * sw + sw / 2;
            const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
            if (dist < this.stoneSize / 2) return i;
        }

        const addCx = this.moves.length * sw + sw / 2;
        const dist = Math.sqrt((mx - addCx) ** 2 + (my - cy) ** 2);
        if (dist < this.addBtnSize / 2) return this.moves.length;

        return -1;
    }

    _handleHover(p) {
        if (this.dragIndex !== -1) return; // don't change hover during drag
        const idx = this._hitTest(p.mouseX, p.mouseY);
        if (idx !== this.hoverIndex) {
            this.hoverIndex = idx;
            p.redraw();
        }
    }

    _handleMouseDown(p) {
        const idx = this._hitTest(p.mouseX, p.mouseY);
        if (idx === -1) return;

        if (idx === this.moves.length) {
            // Add button clicked — copy rightmost move or use default
            const template = this.moves.length > 0
                ? { ...this.moves[this.moves.length - 1] }
                : { ...this.defaultMove };
            this.moves.push(new Turn(template));
            this._resizeCanvas();
            this._redraw();
            this._fireChange();
            // Auto-open popup for the new move
            const newIdx = this.moves.length - 1;
            this.selectedIndex = newIdx;
            this._showPopup(newIdx);
            this._redraw();
            return;
        }

        // Start potential drag on a move token
        const canvasRect = p.canvas.getBoundingClientRect();
        this.dragIndex = idx;
        this.isDragging = false;
        this.dragStartX = p.mouseX + canvasRect.left;
        this.dragStartY = p.mouseY + canvasRect.top;
        this.dragMouseX = this.dragStartX;
        this.dragMouseY = this.dragStartY;

        const onMouseMove = (e) => {
            this.dragMouseX = e.clientX;
            this.dragMouseY = e.clientY;
            const dx = this.dragMouseX - this.dragStartX;
            const dy = this.dragMouseY - this.dragStartY;

            if (!this.isDragging && Math.sqrt(dx * dx + dy * dy) > this.dragThreshold) {
                this.isDragging = true;
                // Close popup when starting drag
                this.selectedIndex = -1;
                this._closePopup();
            }

            if (this.isDragging) {
                this._redraw();
            }
        };

        const onMouseUp = (e) => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            if (this.isDragging) {
                this._finishDrag(e);
            } else {
                // Was a click, not a drag — toggle popup
                if (this.selectedIndex === idx) {
                    this.selectedIndex = -1;
                    this._closePopup();
                } else {
                    this.selectedIndex = idx;
                    this._showPopup(idx);
                }
                this._redraw();
            }

            this.dragIndex = -1;
            this.isDragging = false;
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    _finishDrag(e) {
        const canvasRect = this.p5Instance.canvas.getBoundingClientRect();
        const mx = e.clientX;
        const my = e.clientY;

        // Check if dropped outside the canvas — delete
        const outsideX = mx < canvasRect.left || mx > canvasRect.right;
        const outsideY = my < canvasRect.top - 20 || my > canvasRect.bottom + 20;

        if (outsideX || outsideY) {
            if (this.moves.length > 1) {
                this.moves.splice(this.dragIndex, 1);
                this._resizeCanvas();
            }
        } else {
            // Compute drop position
            const sw = this._slotWidth();
            const dragCx = mx - canvasRect.left;
            let dropTarget = Math.round((dragCx - sw / 2) / sw);
            dropTarget = Math.max(0, Math.min(this.moves.length - 1, dropTarget));

            if (dropTarget !== this.dragIndex) {
                const [moved] = this.moves.splice(this.dragIndex, 1);
                this.moves.splice(dropTarget, 0, moved);
            }
        }

        this.dragIndex = -1;
        this.isDragging = false;
        this._redraw();
        this._fireChange();
    }

    // --- Private: Popup ---

    _initPopup() {
        this.popup = document.createElement('div');
        this.popup.className = 'move-edit-popup';
        this.popup.style.display = 'none';
        this.popup.style.position = 'fixed';
        document.body.appendChild(this.popup);
        // Always stop mousedown propagation so outside-click handler doesn't dismiss popup
        this.popup.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    _showPopup(idx) {
        const move = this.moves[idx];
        if (!move) return;

        const isRebuild = (this.selectedIndex === idx && this.popup.style.display !== 'none');
        this.popup.style.display = '';
        this.popup.innerHTML = this._buildPopupHTML(move, idx);

        if (!isRebuild) {
            // Position relative to viewport so the popup escapes any scroll/overflow containers.
            const containerRect = this.container.getBoundingClientRect();
            const sw = this._slotWidth();
            const idealLeft = containerRect.left + idx * sw + sw / 2;
            const popupWidth = this.popup.offsetWidth || 260;
            const popupHeight = this.popup.offsetHeight || 200;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            let left = idealLeft - popupWidth / 2;
            left = Math.max(4, Math.min(left, vw - popupWidth - 4));

            let top = containerRect.bottom + 4;
            if (top + popupHeight > vh - 4) {
                const topAbove = containerRect.top - popupHeight - 4;
                top = topAbove >= 4 ? topAbove : Math.max(4, vh - popupHeight - 4);
            }

            this.popup.style.left = left + 'px';
            this.popup.style.top = top + 'px';
            this.popup.style.transform = 'none';
        }

        this._attachPopupListeners(idx);
    }

    _closePopup() {
        if (this.popup) {
            this.popup.style.display = 'none';
            this.popup.innerHTML = '';
        }
    }

    _buildPopupHTML(move, idx) {
        const isTraitor = move.traitorColor !== undefined;
        const traitorPct = move.traitorPercentage ?? 10;
        const canDelete = this.moves.length > 1;

        let html = '';

        html += '<div class="popup-section">';
        html += '<div class="popup-label">Player</div>';
        html += '<div class="popup-canvas-row" data-row="player"></div>';
        html += '</div>';

        html += '<div class="popup-section">';
        html += '<div class="popup-label">Color</div>';
        html += '<div class="popup-canvas-row" data-row="color"></div>';
        html += '</div>';

        html += '<div class="popup-section">';
        html += '<div class="popup-label">Traitor</div>';
        html += '<div class="popup-canvas-row" data-row="traitor"></div>';
        html += '</div>';

        if (isTraitor) {
            html += '<div class="popup-section">';
            html += '<div class="popup-label">Percentage</div>';
            html += '<div class="popup-spinner-row">';
            html += '<button type="button" class="popup-spinner-btn" data-action="dec">−</button>';
            html += `<input type="number" class="popup-pct-input" min="1" max="50" value="${traitorPct}">`;
            html += '<button type="button" class="popup-spinner-btn" data-action="inc">+</button>';
            html += '</div>';
            html += '</div>';
        }

        html += '<div class="popup-section popup-bottom-row">';
        html += `<button type="button" class="popup-delete-btn"${canDelete ? '' : ' disabled'}>Delete</button>`;
        html += '</div>';

        return html;
    }

    _attachPopupListeners(idx) {
        const self = this;
        const move = this.moves[idx];
        const ISIZE = 28, IPAD = 5, ISLOT = ISIZE + IPAD;

        function makeSelectorCanvas(container, numItems) {
            const w = numItems * ISLOT + IPAD;
            const h = ISIZE + IPAD * 2;
            const dpr = window.devicePixelRatio || 1;
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            canvas.style.width  = w + 'px';
            canvas.style.height = h + 'px';
            canvas.style.display = 'block';
            canvas.style.cursor = 'pointer';
            container.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            return { canvas, p: createCanvas2DAdapter(ctx), w, h };
        }

        function addClickHandler(canvas, items, onSelect) {
            const cy = (ISIZE + IPAD * 2) / 2;
            canvas.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                for (let i = 0; i < items.length; i++) {
                    const cx = i * ISLOT + ISLOT / 2 + IPAD / 2;
                    if (Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2) < ISIZE / 2) {
                        onSelect(items[i]);
                        break;
                    }
                }
            });
        }

        // --- Player selector ---
        const playerRowEl = this.popup.querySelector('[data-row="player"]');
        if (playerRowEl) {
            const players = [0, 1, 2, 3, 4, 5];
            const { canvas, p, h } = makeSelectorCanvas(playerRowEl, players.length);
            const cy = h / 2;
            for (let i = 0; i < players.length; i++) {
                const pl = players[i];
                const cx = i * ISLOT + ISLOT / 2 + IPAD / 2;
                if (pl === move.player) {
                    p.noFill(); p.stroke(102, 126, 234); p.strokeWeight(2.5);
                    p.circle(cx, cy, ISIZE + 4);
                }
                const r = ISIZE * 0.38;
                p.fill(stoneColors[pl]); p.stroke(strokeColors[pl]); p.strokeWeight(1.5);
                p.triangle(cx - r, cy - r, cx + r, cy - r, cx - r, cy + r);
            }
            addClickHandler(canvas, players, (pl) => {
                move.player = pl;
                self._showPopup(idx); self._redraw(); self._fireChange();
            });
        }

        // --- Color selector: 2 rows ---
        // Row 0: normal colors 0-5 (hidden=false)
        // Row 1: color -1 (no X), hidden variants of colors 1-5 (hidden=true)
        const colorRowEl = this.popup.querySelector('[data-row="color"]');
        if (colorRowEl) {
            const ROW_H = ISIZE + IPAD * 2;
            const numCols = 6;
            const ww = numCols * ISLOT + IPAD;
            const hh = ROW_H * 2;
            const dpr = window.devicePixelRatio || 1;
            const colorCanvas = document.createElement('canvas');
            colorCanvas.width  = Math.round(ww * dpr);
            colorCanvas.height = Math.round(hh * dpr);
            colorCanvas.style.width  = ww + 'px';
            colorCanvas.style.height = hh + 'px';
            colorCanvas.style.display = 'block';
            colorCanvas.style.cursor  = 'pointer';
            colorRowEl.appendChild(colorCanvas);
            const cctx = colorCanvas.getContext('2d');
            cctx.scale(dpr, dpr);
            const cp = createCanvas2DAdapter(cctx);
            const colorRows = [
                [{c:0,h:false},{c:1,h:false},{c:2,h:false},{c:3,h:false},{c:4,h:false},{c:5,h:false}],
                [{c:-1,h:false},{c:1,h:true},{c:2,h:true},{c:3,h:true},{c:4,h:true},{c:5,h:true}]
            ];
            const od = ISIZE - 4, rod = od / 2;
            for (let ri = 0; ri < 2; ri++) {
                const cy = ri * ROW_H + ROW_H / 2;
                for (let ci = 0; ci < 6; ci++) {
                    const item = colorRows[ri][ci];
                    const cx = ci * ISLOT + ISLOT / 2 + IPAD / 2;
                    const isSelected = move.color === item.c && !!move.hidden === item.h;
                    if (isSelected) {
                        cp.noFill(); cp.stroke(102, 126, 234); cp.strokeWeight(2.5);
                        cp.circle(cx, cy, ISIZE + 4);
                    }
                    const colorIdx = Math.max(0, item.c);
                    if (item.h) {
                        cp.fill(...stoneColors[colorIdx], 127);
                    } else {
                        cp.fill(...stoneColors[colorIdx]);
                    }
                    cp.stroke(...strokeColors[colorIdx]); cp.strokeWeight(2);
                    cp.circle(cx, cy, od);
                    if (item.c === 0) {
                        const s = rod / 3;
                        cp.stroke(...strokeColors[0]); cp.strokeWeight(1.5);
                        cp.line(cx - s, cy - s, cx + s, cy + s);
                        cp.line(cx - s, cy + s, cx + s, cy - s);
                    }
                }
            }
            colorCanvas.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const rect = colorCanvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                const ri = Math.floor(my / ROW_H);
                if (ri < 0 || ri >= 2) return;
                const cy = ri * ROW_H + ROW_H / 2;
                for (let ci = 0; ci < 6; ci++) {
                    const cx = ci * ISLOT + ISLOT / 2 + IPAD / 2;
                    if (Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2) < ISIZE / 2) {
                        const item = colorRows[ri][ci];
                        move.color = item.c;
                        move.hidden = item.h;
                        if (item.c === 0 || item.c === -1 || item.h) {
                            delete move.traitorColor; delete move.traitorPercentage;
                        }
                        self._showPopup(idx); self._redraw(); self._fireChange();
                        break;
                    }
                }
            });
        }

        // --- Traitor color selector: Disabled + 1-5 ---
        const traitorRowEl = this.popup.querySelector('[data-row="traitor"]');
        if (traitorRowEl) {
            const traitorItems = [0, 1, 2, 3, 4, 5]; // 0 = disabled
            const { canvas: tCanvas, p: tp, h: th } = makeSelectorCanvas(traitorRowEl, traitorItems.length);
            const tcy = th / 2;
            const od = ISIZE - 4, rod = od / 2;
            for (let i = 0; i < traitorItems.length; i++) {
                const c = traitorItems[i];
                const cx = i * ISLOT + ISLOT / 2 + IPAD / 2;
                const isSelected = c === 0 ? (move.traitorColor === undefined) : (c === move.traitorColor);
                if (isSelected) {
                    tp.noFill(); tp.stroke(102, 126, 234); tp.strokeWeight(2.5);
                    tp.circle(cx, tcy, ISIZE + 4);
                }
                if (c === 0) {
                    tp.fill(170, 170, 170); tp.stroke(100, 100, 100); tp.strokeWeight(2);
                    tp.circle(cx, tcy, od);
                    const s = rod / 3;
                    tp.stroke(100, 100, 100); tp.strokeWeight(1.5);
                    tp.line(cx - s, tcy - s, cx + s, tcy + s);
                    tp.line(cx - s, tcy + s, cx + s, tcy - s);
                } else {
                    tp.fill(...stoneColors[c]); tp.stroke(...strokeColors[c]); tp.strokeWeight(2);
                    tp.circle(cx, tcy, od);
                }
            }
            addClickHandler(tCanvas, traitorItems, (c) => {
                move.hidden = 0;
                if (move.color < 1) move.color = 1;
                if (c === 0) {
                    delete move.traitorColor; delete move.traitorPercentage;
                } else {
                    move.traitorColor = c;
                    if (move.traitorPercentage === undefined) move.traitorPercentage = 10;
                }
                self._showPopup(idx); self._redraw(); self._fireChange();
            });
        }

        // --- Traitor percentage spinner ---
        const pctInput = this.popup.querySelector('.popup-pct-input');
        if (pctInput) {
            pctInput.addEventListener('change', (e) => {
                const val = Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 10));
                move.traitorPercentage = val;
                self._redraw(); self._fireChange();
            });
            this.popup.querySelectorAll('.popup-spinner-btn').forEach(btn => {
                btn.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    const delta = btn.dataset.action === 'inc' ? 1 : -1;
                    const val = Math.max(1, Math.min(50, (parseInt(pctInput.value, 10) || 10) + delta));
                    pctInput.value = val;
                    move.traitorPercentage = val;
                    self._redraw(); self._fireChange();
                });
            });
        }

        // --- Delete button ---
        const delBtn = this.popup.querySelector('.popup-delete-btn');
        if (delBtn) {
            delBtn.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                if (self.moves.length <= 1) return;
                self.moves.splice(idx, 1);
                self.selectedIndex = -1;
                self._closePopup();
                self._resizeCanvas();
                self._redraw();
                self._fireChange();
            });
        }
    }

    _onClickOutside(e) {
        if (this.selectedIndex === -1) return;
        if (this.container.contains(e.target)) return;
        this.selectedIndex = -1;
        this._closePopup();
        this._redraw();
    }

    _fireChange() {
        if (this.onChange) {
            this.onChange(this.getMoves());
        }
    }
}
