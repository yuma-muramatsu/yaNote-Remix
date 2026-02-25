/* ===== Utility Functions ===== */

export const VERSION = "v1.0.0";
export const DEBUG = false;

export const Logger = {
  log: (...args) => { if (DEBUG) console.log("[yaNote-Remix]", ...args); }
};

/**
 * Orientation of three points (for segment intersection)
 */
export function orientation(a, b, c) {
  const val = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(val) < 1e-10) return 0;
  return (val > 0) ? 1 : 2;
}

/**
 * Check if two segments intersect
 */
export function segmentsIntersect(p1, p2, p3, p4) {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  return (o1 !== o2 && o3 !== o4);
}

/**
 * Check if a rectangle intersects a line segment
 */
export function rectIntersectsLine(rect, p1, p2) {
  if (p1.x >= rect.left && p1.x <= rect.right && p1.y >= rect.top && p1.y <= rect.bottom) return true;
  if (p2.x >= rect.left && p2.x <= rect.right && p2.y >= rect.top && p2.y <= rect.bottom) return true;
  const edges = [
    [{ x: rect.left, y: rect.top }, { x: rect.right, y: rect.top }],
    [{ x: rect.left, y: rect.bottom }, { x: rect.right, y: rect.bottom }],
    [{ x: rect.left, y: rect.top }, { x: rect.left, y: rect.bottom }],
    [{ x: rect.right, y: rect.top }, { x: rect.right, y: rect.bottom }]
  ];
  return edges.some(edge => segmentsIntersect(p1, p2, edge[0], edge[1]));
}

/**
 * Compute endpoint of connection line at the edge of a node
 */
export function computeEndpoint(tcx, tcy, fx, fy, toRect) {
  const dx = fx - tcx, dy = fy - tcy;
  let t = 1;
  const hw = toRect.width / 2, hh = toRect.height / 2;
  if (dx === 0 && dy === 0) t = 1;
  else if (dx === 0) t = hh / Math.abs(dy);
  else if (dy === 0) t = hw / Math.abs(dx);
  else t = Math.min(hw / Math.abs(dx), hh / Math.abs(dy));
  return { arrowX: tcx + t * dx, arrowY: t * dy + tcy };
}

/**
 * Compare version strings
 */
export function compareVersions(v1, v2) {
  const parts1 = v1.replace(/^v/, "").split('.').map(Number);
  const parts2 = v2.replace(/^v/, "").split('.').map(Number);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const a = parts1[i] || 0;
    const b = parts2[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}
