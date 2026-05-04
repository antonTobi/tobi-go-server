// Read-only p5 canvas showing the active turn order as a horizontal row of move stones.
// Highlights the currently active move position.

class TurnOrderDisplay {
    constructor(containerId) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.sequence = []; // array of {player, color}
        this.activeIndex = -1;
        this.phase = 'main';

        this.stoneSize = 28;
        this.padding = 6;
        this._resizeObserver = null;

        this.p5Instance = null;
        this._initCanvas();
        this._observeResize();
    }

    update(sequence, activeIndex, phase) {
        this.sequence = sequence || [];
        this.activeIndex = activeIndex;
        this.phase = phase || 'main';
        this._resizeCanvas();
        this._redraw();
    }

    _slotWidth() {
        return this.stoneSize + this.padding;
    }

    _totalWidth() {
        const count = Math.max(1, this.sequence.length);
        return count * this._slotWidth() + this.padding;
    }

    _viewportWidth() {
        if (!this.container) return this._totalWidth();
        const style = window.getComputedStyle(this.container);
        const leftPad = parseFloat(style.paddingLeft) || 0;
        const rightPad = parseFloat(style.paddingRight) || 0;
        return Math.max(1, (this.container.clientWidth || 0) - leftPad - rightPad);
    }

    _canvasHeight() {
        return this.stoneSize + this.padding * 2;
    }

    _maxScrollX() {
        return Math.max(0, this._totalWidth() - this._viewportWidth());
    }

    _scrollX() {
        if (this.activeIndex < 0 || this.sequence.length === 0) return 0;

        const sw = this._slotWidth();
        const firstStoneCenter = sw / 2 + this.padding / 2;
        const activeCenter = this.activeIndex * sw + firstStoneCenter;
        const previousHalfVisibleOffset = sw;
        const desired = activeCenter - previousHalfVisibleOffset;

        return Math.max(0, Math.min(desired, this._maxScrollX()));
    }

    _resizeCanvas() {
        if (this.p5Instance) {
            this.p5Instance.resizeCanvas(this._viewportWidth(), this._canvasHeight());
        }
    }

    _redraw() {
        if (this.p5Instance) {
            this.p5Instance.redraw();
        }
    }

    _initCanvas() {
        const self = this;

        const sketch = (p) => {
            p.setup = () => {
                const canvas = p.createCanvas(self._viewportWidth(), self._canvasHeight());
                canvas.parent(self.containerId);
                p.noLoop();
            };

            p.draw = () => {
                p.clear();
                const sw = self._slotWidth();
                const cy = p.height / 2;
                const scrollX = self._scrollX();
                const startX = scrollX - sw;
                const endX = scrollX + p.width + sw;

                for (let i = 0; i < self.sequence.length; i++) {
                    const move = self.sequence[i];
                    const rawX = i * sw + sw / 2 + self.padding / 2;
                    if (rawX < startX || rawX > endX) continue;
                    const cx = rawX - scrollX;

                    // Active indicator
                    if (i === self.activeIndex) {
                        p.noFill();
                        p.stroke(102, 126, 234);
                        p.strokeWeight(2.5);
                        p.circle(cx, cy, self.stoneSize + 4);
                    }

                    drawMoveStone(p, cx, cy, move, self.stoneSize);
                }
            };
        };

        this.p5Instance = new p5(sketch);
    }

    _observeResize() {
        if (!this.container) return;

        const handleResize = () => {
            this._resizeCanvas();
            this._redraw();
        };

        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(handleResize);
            this._resizeObserver.observe(this.container);
        } else {
            window.addEventListener('resize', handleResize);
            this._windowResizeHandler = handleResize;
        }
    }

    destroy() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        if (this._windowResizeHandler) {
            window.removeEventListener('resize', this._windowResizeHandler);
            this._windowResizeHandler = null;
        }
        if (this.p5Instance) {
            this.p5Instance.remove();
            this.p5Instance = null;
        }
    }
}
