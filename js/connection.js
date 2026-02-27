/* ===== Connection Class ===== */
import { Logger, computeEndpoint } from './utils.js';

export class Connection {
    constructor(fromNode, toNode, app) {
        this.app = app;
        this.fromNode = fromNode;
        this.toNode = toNode;
        this.fromCoord = null;
        this.toCoord = null;
        this.lineType = "standard";
        this.dashType = "solid";
        this.startHandle = null;
        this.endHandle = null;

        this.line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        this.line.setAttribute("stroke", "#404040");
        this.line.setAttribute("stroke-width", "2");

        this.setLineType(this.app.defaultLineType || "standard");
        this.setDashType(this.app.defaultDashType || "solid");

        this.line.style.pointerEvents = "auto";
        this.line.style.cursor = "pointer";
        this.line.style.transition = "stroke 0.15s ease";

        this.line.addEventListener("click", e => {
            e.stopPropagation();
            this.app.selectConnection(this);
        });

        if (this.fromNode === null && this.toNode === null) {
            this.line.addEventListener("mousedown", e => {
                if (e.button === 0) {
                    e.stopPropagation();
                    e.preventDefault();
                    if (this.app.selectedConnections.includes(this)) this.app.startGroupMove(e);
                    else this.startDrag(e);
                }
            });
        }

        this.app.svg.appendChild(this.line);
        this.update();
        Logger.log("Connection created:", this.fromNode?.id, "->", this.toNode?.id);
    }

    update() {
        if (!this.app) return;

        let fromPoint, toPoint;

        // Use logical coordinates (app/node standard) instead of screen coordinates
        if (this.fromNode) {
            const nw = this.fromNode.element.offsetWidth;
            const nh = this.fromNode.element.offsetHeight;
            fromPoint = {
                x: this.fromNode.x + nw / 2,
                y: this.fromNode.y + nh / 2
            };
        } else if (this.fromCoord) {
            fromPoint = { x: this.fromCoord.x, y: this.fromCoord.y };
        } else return;

        if (this.toNode) {
            const nw = this.toNode.element.offsetWidth;
            const nh = this.toNode.element.offsetHeight;
            toPoint = {
                x: this.toNode.x + nw / 2,
                y: this.toNode.y + nh / 2
            };
        } else if (this.toCoord) {
            toPoint = { x: this.toCoord.x, y: this.toCoord.y };
        } else return;

        const origFrom = { ...fromPoint };
        const origTo = { ...toPoint };

        // Adjust for endpoint (arrow) alignment
        if (this.toNode) {
            const nw = this.toNode.element.offsetWidth;
            const nh = this.toNode.element.offsetHeight;
            // Logical rect
            const rect = {
                left: this.toNode.x, top: this.toNode.y,
                right: this.toNode.x + nw, bottom: this.toNode.y + nh,
                width: nw, height: nh
            };
            const endpoint = computeEndpoint(origTo.x, origTo.y, origFrom.x, origFrom.y, rect);
            toPoint.x = endpoint.arrowX;
            toPoint.y = endpoint.arrowY;
        }

        if ((this.lineType === "reverse-arrow" || this.lineType === "both-arrow") && this.fromNode) {
            const nw = this.fromNode.element.offsetWidth;
            const nh = this.fromNode.element.offsetHeight;
            const rect = {
                left: this.fromNode.x, top: this.fromNode.y,
                right: this.fromNode.x + nw, bottom: this.fromNode.y + nh,
                width: nw, height: nh
            };
            const startpoint = computeEndpoint(origFrom.x, origFrom.y, origTo.x, origTo.y, rect);
            fromPoint.x = startpoint.arrowX;
            fromPoint.y = startpoint.arrowY;
        }

        // Text-only / dotted node: adjust start point to edge
        if (this.fromNode && (this.fromNode.nodeType === "text-only" || this.fromNode.nodeType === "dotted")) {
            this._adjustEdgeEndpoint(this.fromNode, fromPoint, toPoint);
        }
        if (this.toNode && (this.toNode.nodeType === "text-only" || this.toNode.nodeType === "dotted")) {
            this._adjustEdgeEndpoint(this.toNode, toPoint, fromPoint);
        }

        this.line.setAttribute("x1", fromPoint.x);
        this.line.setAttribute("y1", fromPoint.y);
        this.line.setAttribute("x2", toPoint.x);
        this.line.setAttribute("y2", toPoint.y);

        if (this.startHandle) {
            this.startHandle.style.left = (fromPoint.x - 5) + "px";
            this.startHandle.style.top = (fromPoint.y - 5) + "px";
        }
        if (this.endHandle) {
            this.endHandle.style.left = (toPoint.x - 5) + "px";
            this.endHandle.style.top = (toPoint.y - 5) + "px";
        }
    }

    _adjustEdgeEndpoint(node, point, otherPoint) {
        const nw = node.element.offsetWidth;
        const nh = node.element.offsetHeight;

        // Logical local rect
        const localRect = {
            left: node.x,
            top: node.y,
            right: node.x + nw,
            bottom: node.y + nh
        };
        const cx = (localRect.left + localRect.right) / 2;
        const cy = (localRect.top + localRect.bottom) / 2;

        const dirX = otherPoint.x - point.x;
        const dirY = otherPoint.y - point.y;
        const len = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
        const ndx = dirX / len;
        const ndy = dirY / len;

        let tCandidates = [];
        if (ndx > 0) tCandidates.push((localRect.right - cx) / ndx);
        else if (ndx < 0) tCandidates.push((localRect.left - cx) / ndx);
        if (ndy > 0) tCandidates.push((localRect.bottom - cy) / ndy);
        else if (ndy < 0) tCandidates.push((localRect.top - cy) / ndy);

        const t = Math.min(...tCandidates.filter(v => v > 0));
        const offset = 2 + (nw / 50);
        point.x = cx + ndx * (t + offset);
        point.y = cy + ndy * (t + offset);
    }

    showHandles() {
        this.hideHandles();
        this.startHandle = this.app.createHtmlHandle();
        this.endHandle = this.app.createHtmlHandle();
        const x1 = parseFloat(this.line.getAttribute("x1"));
        const y1 = parseFloat(this.line.getAttribute("y1"));
        const x2 = parseFloat(this.line.getAttribute("x2"));
        const y2 = parseFloat(this.line.getAttribute("y2"));
        this.startHandle.style.left = (x1 - 5) + "px";
        this.startHandle.style.top = (y1 - 5) + "px";
        this.endHandle.style.left = (x2 - 5) + "px";
        this.endHandle.style.top = (y2 - 5) + "px";
        this.app.addHandleDrag(this.startHandle, this, "from");
        this.app.addHandleDrag(this.endHandle, this, "to");
    }

    hideHandles() {
        if (this.startHandle && this.startHandle.parentNode) this.startHandle.parentNode.removeChild(this.startHandle);
        if (this.endHandle && this.endHandle.parentNode) this.endHandle.parentNode.removeChild(this.endHandle);
        this.startHandle = this.endHandle = null;
    }

    startDrag(e) {
        const startX = e.clientX, startY = e.clientY;
        const initFrom = Object.assign({}, this.fromCoord);
        const initTo = Object.assign({}, this.toCoord);
        const onMove = ev => {
            const dx = ev.clientX - startX, dy = ev.clientY - startY;
            this.fromCoord = { x: initFrom.x + dx, y: initFrom.y + dy };
            this.toCoord = { x: initTo.x + dx, y: initTo.y + dy };
            this.update();
        };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            this.app.saveState();
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    }

    setLineType(type) {
        this.lineType = type;
        this.line.removeAttribute("marker-start");
        this.line.removeAttribute("marker-end");
        switch (type) {
            case "standard":
                this.line.setAttribute("marker-end", "url(#arrowhead)");
                break;
            case "no-arrow":
                break;
            case "reverse-arrow":
                this.line.setAttribute("marker-start", "url(#start-arrow)");
                break;
            case "both-arrow":
                this.line.setAttribute("marker-start", "url(#both-start-arrow)");
                this.line.setAttribute("marker-end", "url(#both-end-arrow)");
                break;
            default:
                this.line.setAttribute("marker-end", "url(#arrowhead)");
        }
        this.update();
    }

    setDashType(type) {
        this.dashType = type;
        this.line.removeAttribute("stroke-dasharray");
        if (type === "dashed") {
            this.line.setAttribute("stroke-dasharray", "6,4");
        }
        this.update();
    }
}
