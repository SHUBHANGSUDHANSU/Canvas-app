function normalizePoint(point) {
  return {
    x: clamp01(point.x),
    y: clamp01(point.y),
    t: typeof point.t === "number" ? point.t : Date.now()
  };
}

function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function buildStroke({ id, userId, color, widthNorm, tool, points, seq }) {
  return {
    id,
    userId,
    color,
    widthNorm,
    tool,
    points: points.map(normalizePoint),
    seq
  };
}

module.exports = {
  normalizePoint,
  buildStroke
};
