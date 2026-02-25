/* ===== Tooltip Module ===== */

/**
 * Hide all visible tooltips
 */
export function hideAllTooltips() {
    document.querySelectorAll(".tooltip").forEach(t => {
        if (t.parentNode) t.parentNode.removeChild(t);
    });
}

/**
 * Show tooltip below an element
 */
export function showTooltip(el, text) {
    hideAllTooltips();
    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.textContent = text;
    document.body.appendChild(tip);
    const rect = el.getBoundingClientRect();

    // Position tooltip centered below element
    let left = rect.left + rect.width / 2 - tip.offsetWidth / 2;
    // Prevent overflow on right side
    const rightEdge = window.innerWidth - 16;
    if (left + tip.offsetWidth > rightEdge) {
        left = rightEdge - tip.offsetWidth;
    }
    // Prevent overflow on left side
    if (left < 16) left = 16;

    tip.style.left = left + "px";
    tip.style.top = (rect.bottom + 4) + "px";

    setTimeout(() => {
        if (tip.parentNode) tip.parentNode.removeChild(tip);
    }, 2000);
}

/**
 * Show tooltip aligned to the right (for buttons near the right edge)
 */
export function showRightAlignedTooltip(el, text) {
    hideAllTooltips();
    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.textContent = text;
    document.body.appendChild(tip);
    const rect = el.getBoundingClientRect();

    const rightEdge = window.innerWidth - 20;
    const idealLeft = rect.left + rect.width / 2 - tip.offsetWidth / 2;
    const adjustedLeft = Math.min(idealLeft, rightEdge - tip.offsetWidth);

    tip.style.left = adjustedLeft + "px";
    tip.style.top = (rect.bottom + 4) + "px";
    setTimeout(() => { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 2000);
}
