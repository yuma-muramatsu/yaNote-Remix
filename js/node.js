/* ===== NoteNode Class ===== */
import { Logger } from './utils.js';

export class NoteNode {
    static nextId = 1;

    constructor(text, x, y, app, id) {
        this.app = app;
        this.element = document.createElement("div");
        this.element.className = "node";
        this.setText(text);
        this.app.canvas.appendChild(this.element);
        this.x = x;
        this.y = y;
        this.setPosition(x, y);
        this.nodeType = "standard";
        this.boldText = false;
        this.addEventListeners();
        if (id !== undefined) {
            this.id = id;
            if (id >= NoteNode.nextId) NoteNode.nextId = id + 1;
        } else {
            this.id = NoteNode.nextId++;
        }
        Logger.log("NoteNode created:", this.id, text, x, y);
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.element.style.transform = `translate(${x}px, ${y}px)`;
    }

    addEventListeners() {
        this.element.addEventListener("mousedown", e => {
            e.stopPropagation();

            // Right-click: allow context menu only in edit mode
            if (e.button === 2) {
                if (!this.element.isContentEditable && !this.element.classList.contains("editing")) {
                    e.preventDefault();
                    const canvasEvent = new MouseEvent('mousedown', {
                        bubbles: true, cancelable: true, view: window,
                        button: 2, buttons: 2,
                        clientX: e.clientX, clientY: e.clientY
                    });
                    this.app.canvas.dispatchEvent(canvasEvent);
                }
                return;
            }

            // Shift+click: multi-select toggle
            if (e.shiftKey) {
                if (!this.app.selectedNodes.includes(this)) {
                    this.app.selectedNodes.push(this);
                    this.element.classList.add("selected");
                } else {
                    this.app.selectedNodes = this.app.selectedNodes.filter(n => n !== this);
                    this.element.classList.remove("selected");
                }
                this.app.updateControlButtonsState();
                return;
            }

            // Skip if editing
            if (this.element.isContentEditable || this.element.classList.contains("editing")) return;

            if (e.button === 0) {
                e.preventDefault();
                this.app.handleNodeMouseDown(e, this);
            }
        });

        // Touch events
        this.element.addEventListener("touchstart", e => {
            if (e.target.tagName.toLowerCase() === 'a') {
                this._touchedLink = e.target.href;
                e.stopPropagation();
            } else {
                this._touchedLink = null;
            }
        });

        this.element.addEventListener("touchend", e => {
            if (this._touchedLink && e.target.tagName.toLowerCase() === 'a') {
                e.preventDefault();
                e.stopPropagation();
                window.open(this._touchedLink, '_blank');
                this._touchedLink = null;
                return false;
            }
        });

        // Prevent context menu when not editing
        this.element.addEventListener("contextmenu", e => {
            if (!this.element.isContentEditable && !this.element.classList.contains("editing")) {
                e.preventDefault();
            }
        });
    }

    setText(text) {
        this.rawText = text;
        this.element.innerHTML = this.convertMarkdownLinks(text);
    }

    convertMarkdownLinks(text) {
        const isInternalLink = (url) => {
            try {
                const urlObj = new URL(url, window.location.href);
                return urlObj.host === window.location.host;
            } catch (e) {
                return !url.startsWith('http');
            }
        };

        // Collapse newlines to <br>
        let htmlText = text.replace(/\n+/g, "<br>");

        // Markdown links
        const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g;
        htmlText = htmlText.replace(mdLinkRegex, (match, linkText, url) => {
            const target = isInternalLink(url) ? "_top" : "_blank";
            return `<a href="${url}" target="${target}">${linkText}</a>`;
        });

        // Auto URL links
        const urlRegex = /(?<!href=")(https?:\/\/[^\s<]+)/g;
        htmlText = htmlText.replace(urlRegex, (match) => {
            let display = match;
            if (display.length > 30) {
                display = display.substring(0, 30) + "...";
            }
            const target = isInternalLink(match) ? "_top" : "_blank";
            return `<a href="${match}" target="${target}">${display}</a>`;
        });

        // Remove stray <br> after </a>
        htmlText = htmlText.replace(/(<\/a>)<br>/g, "$1");

        return htmlText;
    }

    startEditing() {
        this.app.startEditingNode(this);
    }

    setType(newType) {
        this.nodeType = newType;
        this.element.classList.remove("standard", "text-only", "grey", "red", "dotted");
        this.element.classList.add(newType);
        this.app.connections.forEach(conn => {
            if (conn.fromNode === this) conn.update();
        });
    }

    setBold(isBold) {
        this.boldText = isBold;
        if (isBold) this.element.classList.add("bold-text");
        else this.element.classList.remove("bold-text");
    }
}
