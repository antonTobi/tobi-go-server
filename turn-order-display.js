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

        this.p5Instance = null;
        this._initCanvas();
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

    _initCanvas() {
        const self = this;

        const sketch = (p) => {
            p.setup = () => {
                const canvas = p.createCanvas(self._totalWidth(), self._canvasHeight());
                canvas.parent(self.containerId);
                p.noLoop();
            };

            p.draw = () => {
                p.clear();
                const sw = self._slotWidth();
                const cy = p.height / 2;

                for (let i = 0; i < self.sequence.length; i++) {
                    const move = self.sequence[i];
                    const cx = i * sw + sw / 2 + self.padding / 2;

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

    destroy() {
        if (this.p5Instance) {
            this.p5Instance.remove();
            this.p5Instance = null;
        }
    }
}
