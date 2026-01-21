class CanvasManager {
  constructor(baseCanvas, overlayCanvas) {
    this.baseCanvas = baseCanvas;
    this.overlayCanvas = overlayCanvas;
    this.baseCtx = baseCanvas.getContext("2d");
    this.overlayCtx = overlayCanvas.getContext("2d");
    this.history = [];
    this.inProgress = new Map();
    this.devicePixelRatio = window.devicePixelRatio || 1;
    this.logicalWidth = 0;
    this.logicalHeight = 0;
    this.needsOverlayRender = true;
    this.startOverlayLoop();
  }

  setSize(width, height) {
    const ratio = this.devicePixelRatio;
    this.logicalWidth = width;
    this.logicalHeight = height;
    this.baseCanvas.width = Math.floor(width * ratio);
    this.baseCanvas.height = Math.floor(height * ratio);
    this.overlayCanvas.width = Math.floor(width * ratio);
    this.overlayCanvas.height = Math.floor(height * ratio);
    this.baseCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.overlayCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.redrawHistory();
  }

  setHistory(history) {
    this.history = history.slice();
    this.redrawHistory();
  }

  addHistoryStroke(stroke) {
    this.history.push(stroke);
    this.drawStroke(this.baseCtx, stroke);
  }

  updateInProgress(stroke) {
    this.inProgress.set(stroke.id, stroke);
    this.needsOverlayRender = true;
  }

  appendInProgressPoints(strokeId, points) {
    const stroke = this.inProgress.get(strokeId);
    if (!stroke) return;
    stroke.points.push(...points);
    this.needsOverlayRender = true;
  }

  endInProgress(strokeId) {
    this.inProgress.delete(strokeId);
    this.needsOverlayRender = true;
  }

  clearInProgress(strokeId) {
    this.inProgress.delete(strokeId);
    this.needsOverlayRender = true;
  }

  redrawHistory() {
    this.baseCtx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
    for (const stroke of this.history) {
      this.drawStroke(this.baseCtx, stroke);
    }
  }

  startOverlayLoop() {
    const tick = () => {
      if (this.needsOverlayRender) {
        this.renderOverlay();
        this.needsOverlayRender = false;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  renderOverlay() {
    this.overlayCtx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
    const strokes = Array.from(this.inProgress.values()).sort((a, b) => a.seq - b.seq);
    for (const stroke of strokes) {
      this.drawStroke(this.overlayCtx, stroke);
    }
  }

  drawStroke(ctx, stroke) {
    if (!stroke.points.length) return;
    const baseWidth = stroke.widthNorm * this.logicalWidth;
    const style = this.getToolStyle(stroke, baseWidth);
    ctx.save();
    ctx.lineCap = style.cap;
    ctx.lineJoin = style.join;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.width;
    ctx.globalAlpha = style.alpha;
    ctx.globalCompositeOperation = style.composite;

    if (style.shadowBlur > 0) {
      ctx.shadowBlur = style.shadowBlur;
      ctx.shadowColor = style.shadowColor;
    }

    if (stroke.tool === "spray") {
      this.drawSprayStroke(ctx, stroke, style);
      ctx.restore();
      return;
    }

    if (stroke.tool === "pencil") {
      this.drawSegmentStroke(ctx, stroke);
    } else {
      this.drawSmoothStroke(ctx, stroke);
    }
    ctx.restore();
  }

  getToolStyle(stroke, baseWidth) {
    const style = {
      width: baseWidth,
      cap: "round",
      join: "round",
      color: stroke.color,
      alpha: 1,
      composite: "source-over",
      shadowBlur: 0,
      shadowColor: stroke.color
    };

    switch (stroke.tool) {
      case "pencil":
        style.width = Math.max(1, baseWidth * 0.6);
        style.alpha = 0.9;
        break;
      case "paint":
        style.width = baseWidth * 1.6;
        style.alpha = 0.95;
        style.shadowBlur = baseWidth * 0.8;
        break;
      case "marker":
        style.width = baseWidth * 1.2;
        style.alpha = 0.65;
        style.cap = "square";
        style.join = "miter";
        break;
      case "highlighter":
        style.width = baseWidth * 2.2;
        style.alpha = 0.32;
        style.cap = "square";
        style.join = "bevel";
        break;
      case "spray":
        style.width = baseWidth * 1.4;
        style.alpha = 0.55;
        break;
      case "eraser":
        style.composite = "destination-out";
        style.color = "rgba(0,0,0,1)";
        break;
      default:
        break;
    }
    return style;
  }

  drawSmoothStroke(ctx, stroke) {
    const points = stroke.points;
    ctx.beginPath();
    const start = this.toCanvasPoint(points[0]);
    ctx.moveTo(start.x, start.y);

    for (let i = 1; i < points.length - 1; i += 1) {
      const current = this.toCanvasPoint(points[i]);
      const next = this.toCanvasPoint(points[i + 1]);
      const mid = {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2
      };
      ctx.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
    }

    const last = this.toCanvasPoint(points[points.length - 1]);
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  drawSegmentStroke(ctx, stroke) {
    const points = stroke.points;
    ctx.beginPath();
    const start = this.toCanvasPoint(points[0]);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < points.length; i += 1) {
      const current = this.toCanvasPoint(points[i]);
      ctx.lineTo(current.x, current.y);
    }
    ctx.stroke();
  }

  drawSprayStroke(ctx, stroke, style) {
    const radius = style.width * 0.9;
    const density = Math.max(6, Math.floor(style.width * 0.8));
    const dotSize = Math.max(1, style.width * 0.12);
    ctx.fillStyle = style.color;

    stroke.points.forEach((point, index) => {
      const rng = this.makeRng(this.hashString(`${stroke.id}:${index}`));
      for (let i = 0; i < density; i += 1) {
        const angle = rng() * Math.PI * 2;
        const spread = Math.sqrt(rng()) * radius;
        const x = point.x * this.logicalWidth + Math.cos(angle) * spread;
        const y = point.y * this.logicalHeight + Math.sin(angle) * spread;
        ctx.fillRect(x, y, dotSize, dotSize);
      }
    });
  }

  hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  makeRng(seed) {
    let t = seed;
    return () => {
      t += 0x6d2b79f5;
      let result = Math.imul(t ^ (t >>> 15), 1 | t);
      result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  toCanvasPoint(point) {
    return {
      x: point.x * this.logicalWidth,
      y: point.y * this.logicalHeight
    };
  }
}

window.CanvasManager = CanvasManager;
