/* ===== yaNote Remix - Main Application ===== */
import { VERSION, Logger } from './utils.js';
import { NoteNode } from './node.js';
import { Connection } from './connection.js';
import { HierarchyNavigator } from './hierarchy.js';
import { showTooltip, showRightAlignedTooltip, hideAllTooltips } from './tooltip.js';
import { copyAsMarkdown } from './notion.js';

class YaNoteApp {
    constructor() {
        this.canvas = document.getElementById("canvas");
        this.svg = document.getElementById("svg");
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.selectedNodes = [];
        this.selectedConnection = null;
        this.selectedConnections = [];
        this.branchCreationJustHappened = false;
        this.moveTimer = null;
        this.undoStack = [];
        this.redoStack = [];
        this.globalPan = { x: 0, y: 0 };
        this.globalZoom = 1;
        this.firstNodeType = "standard";
        this.defaultNodeType = "dotted";
        this.defaultLineType = "standard";
        this.defaultDashType = "solid";
        this.restored = false;
        this.editingNode = null;
        this.autoChainEnabled = true;
        this.currentTheme = localStorage.getItem('yaNoteRemixTheme') || 'light';
        this.titleField = document.getElementById("titleField");
        this.hierarchyNav = new HierarchyNavigator(this);

        this.updateGlobalTransform();
        this.initEventListeners();
        this.initTitleField();
        this.initTouchPrevention();
        this.applyTheme(this.currentTheme);

        const stored = localStorage.getItem("yaNoteRemixData");
        const skipGuide = localStorage.getItem("skipGuideLoad");

        if (stored) {
            this.loadFromLocalStorage();
            this.restored = true;
        } else if (skipGuide === "true") {
            localStorage.removeItem("skipGuideLoad");
            const cx = 5000, cy = 5000;
            let node = this.createNode("中心ノード", cx, cy);
            node.setType(this.firstNodeType);
            this.centerNode = node;
            this.saveState();
            this.restored = true;
        } else {
            const cx = 5000, cy = 5000;
            let node = this.createNode("中心ノード", cx, cy);
            node.setType(this.firstNodeType);
            this.centerNode = node;
            this.saveState();
            this.restored = true;
        }

        if (!this.restored) {
            window.addEventListener("resize", () => this.recalcCenter());
            window.addEventListener("load", () => this.recalcCenter());
        }
        this.updateControlButtonsState();
        this.checkForAppUpdates();

        const copyright = document.getElementById("copyright");
        if (copyright) copyright.textContent = `© 2025 yaNote Remix | ${VERSION}`;
        Logger.log("YaNoteApp initialized");
    }

    checkForAppUpdates() {
        const key = 'yaNoteRemix-currentVersion';
        const stored = localStorage.getItem(key);
        if (!stored) { localStorage.setItem(key, VERSION); return; }
        if (stored !== VERSION) {
            localStorage.setItem(key, VERSION);
            const n = document.createElement('div');
            n.style.cssText = 'position:fixed;bottom:50px;left:50%;transform:translateX(-50%);background:var(--color-accent);color:white;padding:10px 24px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:30000;font-weight:600;font-family:var(--font-family);';
            n.textContent = `yaNote Remix が ${VERSION} に更新されました`;
            const c = document.createElement('span');
            c.textContent = '×'; c.style.cssText = 'margin-left:12px;cursor:pointer;';
            c.onclick = () => document.body.removeChild(n);
            n.appendChild(c);
            setTimeout(() => { if (document.body.contains(n)) { n.style.opacity = '0'; n.style.transition = 'opacity 0.5s'; setTimeout(() => { if (document.body.contains(n)) document.body.removeChild(n) }, 500); } }, 5000);
            document.body.appendChild(n);
        }
    }

    initTitleField() {
        this.titleField.addEventListener("click", () => {
            this.titleField.readOnly = false;
            this.titleField.style.borderBottom = "1px solid var(--color-accent)";
            this.titleField.style.textAlign = "left";
            this.titleField.focus();
        });
        this.titleField.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); this.titleField.blur(); }
        });
        this.titleField.addEventListener("blur", () => {
            this.titleField.readOnly = true;
            this.titleField.style.borderBottom = "none";
            if (this.titleField.value.trim() === "") this.titleField.value = "無題";
            this.adjustTitleFieldWidth();
            this.titleField.style.textAlign = "right";
        });
    }

    adjustTitleFieldWidth() {
        const span = document.createElement("span");
        const style = window.getComputedStyle(this.titleField);
        span.style.font = style.font;
        span.style.visibility = "hidden";
        span.style.whiteSpace = "nowrap";
        span.textContent = this.titleField.value;
        document.body.appendChild(span);
        this.titleField.style.width = (span.offsetWidth + 10) + "px";
        document.body.removeChild(span);
    }

    initTouchPrevention() {
        document.addEventListener('touchmove', e => { if (!e.target.closest('#canvas')) e.preventDefault(); }, { passive: false });
        let lastTouchEnd = 0;
        document.addEventListener('touchend', e => { if (Date.now() - lastTouchEnd < 300) e.preventDefault(); lastTouchEnd = Date.now(); }, { passive: false });
    }

    updateGlobalTransform() {
        this.canvas.style.transform = `translate(-5000px, -5000px) translate(${this.globalPan.x}px, ${this.globalPan.y}px) scale(${this.globalZoom})`;
    }

    recalcCenter() {
        let center = this.nodes.find(n => n.element.textContent.trim() === "中心ノード") || this.nodes[0];
        if (center) {
            const rect = center.element.getBoundingClientRect();
            this.globalPan.x = (window.innerWidth / 2) - (rect.left + rect.width / 2);
            this.globalPan.y = (window.innerHeight / 2) - (rect.top + rect.height / 2);
            this.updateGlobalTransform();
            this.updateAllConnections();
        }
    }

    eventToLogical(e) {
        const rect = this.canvas.getBoundingClientRect();
        return { x: (e.clientX - rect.left) / this.globalZoom, y: (e.clientY - rect.top) / this.globalZoom };
    }

    // ===== Event Listeners =====
    initEventListeners() {
        this.canvas.addEventListener("mousedown", e => { if (e.button === 2) this.startPan(e); });
        this.canvas.addEventListener("contextmenu", e => {
            const editingNode = e.target.closest(".node");
            if (!editingNode || !(editingNode.isContentEditable || editingNode.classList.contains("editing"))) e.preventDefault();
        });
        this.canvas.addEventListener("mousedown", e => { if (e.button === 0) this.onCanvasMouseDown(e); });
        window.addEventListener("resize", () => this.updateAllConnections());
        document.addEventListener("mousedown", e => {
            if (!e.target.closest(".node") && !e.target.closest(".html-handle") && e.target.tagName.toLowerCase() !== "line") this.hideAllHandles();
        });

        // Main keyboard handler (capture phase to intercept before contentEditable)
        document.addEventListener("keydown", e => this.handleKeyDown(e), true);
        window.addEventListener("storage", e => { if (e.key === "yaNoteRemixData") location.reload(); });

        // Global Paste handler for JSON loading
        window.addEventListener("paste", e => {
            // Only process if not editing a node
            if (this.editingNode || (document.activeElement && document.activeElement.isContentEditable)) return;
            const text = e.clipboardData.getData("text");
            try {
                const json = JSON.parse(text);
                // Simple validation to check if it's a yaNote data
                if (json.nodes && Array.isArray(json.nodes)) {
                    if (confirm("貼り付けられたJSONデータからノートを読み込みますか？現在のデータは破棄されます。")) {
                        this.restoreState(json);
                        this.saveState();
                    }
                }
            } catch (err) { /* Not a valid JSON, ignore */ }
        });

        // Wheel scroll
        this.canvas.addEventListener("wheel", e => {
            if (e.ctrlKey || e.metaKey) return;
            e.preventDefault();
            if (e.shiftKey) { this.globalPan.x -= (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.5; }
            else { if (e.deltaY !== 0) this.globalPan.y -= e.deltaY * 0.5; if (e.deltaX !== 0) this.globalPan.x -= e.deltaX * 0.5; }
            this.updateGlobalTransform();
            this.updateAllConnections();
        }, { passive: false });

        // Touch panning
        this.canvas.addEventListener("touchstart", e => {
            if (e.touches.length === 1) {
                e.preventDefault();
                const t = e.touches[0]; const sx = t.clientX, sy = t.clientY; const ip = { ...this.globalPan }; let moved = false;
                const onMove = ev => { if (ev.touches.length === 1) { ev.preventDefault(); const tt = ev.touches[0]; const dx = tt.clientX - sx, dy = tt.clientY - sy; if (!moved && Math.sqrt(dx * dx + dy * dy) > 5) moved = true; if (moved) { this.globalPan.x = ip.x + dx; this.globalPan.y = ip.y + dy; requestAnimationFrame(() => { this.updateGlobalTransform(); this.updateAllConnections(); }); } } };
                const onEnd = () => { this.canvas.removeEventListener("touchmove", onMove); this.canvas.removeEventListener("touchend", onEnd); this.canvas.removeEventListener("touchcancel", onEnd); };
                this.canvas.addEventListener("touchmove", onMove, { passive: false });
                this.canvas.addEventListener("touchend", onEnd);
                this.canvas.addEventListener("touchcancel", onEnd);
            }
        }, { passive: false });

        this.initControlPanel();
    }

    async copyJsonToClipboard() {
        const state = this.captureState();
        const json = JSON.stringify(state, null, 2);
        try {
            await navigator.clipboard.writeText(json);
            const btn = document.getElementById("notionBtn");
            if (btn) showRightAlignedTooltip(btn, "JSONをコピーしました");
        } catch (err) {
            alert("コピーに失敗しました: " + err);
        }
    }

    // ===== Keyboard Handler (capture phase) =====
    handleKeyDown(e) {
        if (document.activeElement === this.titleField) return;

        // Escape: ALWAYS handle first (modals / editing cancel / hierarchy exit)
        if (e.key === "Escape") {
            e.preventDefault(); e.stopPropagation();
            // Close shortcuts help modal if open
            const helpModal = document.getElementById("shortcutsHelp");
            const helpOverlay = document.getElementById("shortcutsHelpOverlay");
            if (helpModal && helpModal.style.display === "block") {
                helpModal.style.display = "none";
                if (helpOverlay) helpOverlay.style.display = "none";
                return;
            }
            // Close share modal if open
            const shareModal = document.getElementById("shareModal");
            const shareOverlay = document.getElementById("shareOverlay");
            if (shareModal && shareModal.style.display === "block") {
                shareModal.style.display = "none";
                if (shareOverlay) shareOverlay.style.display = "none";
                return;
            }
            if (this.editingNode) { this.finishEditingNode(this.editingNode, false); return; }
            if (this.hierarchyNav.active) { this.hierarchyNav.deactivate(); return; }
            return;
        }

        // Tab / Shift+Tab
        if (e.key === "Tab") {
            e.preventDefault(); e.stopPropagation();
            // Hierarchy nav active: navigate within that level
            if (this.hierarchyNav.active) {
                e.shiftKey ? this.hierarchyNav.prev() : this.hierarchyNav.next();
                return;
            }
            // Otherwise: cycle through all nodes sequentially
            if (this.nodes.length === 0) return;
            if (this.editingNode) this.finishEditingNode(this.editingNode, false);
            const curIdx = this.selectedNode ? this.nodes.indexOf(this.selectedNode) : -1;
            let nextIdx;
            if (e.shiftKey) {
                nextIdx = curIdx <= 0 ? this.nodes.length - 1 : curIdx - 1;
            } else {
                nextIdx = curIdx >= this.nodes.length - 1 ? 0 : curIdx + 1;
            }
            const targetNode = this.nodes[nextIdx];
            this.selectNode(targetNode);
            // Pan canvas so node is roughly centered on screen
            const rect = targetNode.element.getBoundingClientRect();
            const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
            const dx = cx - (rect.left + rect.width / 2);
            const dy = cy - (rect.top + rect.height / 2);
            if (Math.abs(dx) > 200 || Math.abs(dy) > 200) {
                this.globalPan.x += dx;
                this.globalPan.y += dy;
                this.updateGlobalTransform();
                this.updateAllConnections();
            }
            return;
        }

        // Hierarchy navigation mode: Enter creates child
        if (this.hierarchyNav.active) {
            if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); e.stopPropagation(); this.hierarchyNav.createChild(); return; }
        }

        // Alt+1~9: Hierarchy navigation (Alt avoids browser conflicts)
        if (e.altKey && !e.ctrlKey && !e.metaKey) {
            const codeMatch = e.code && e.code.match(/^Digit([1-9])$/);
            if (codeMatch) {
                const num = parseInt(codeMatch[1]);
                e.preventDefault();
                if (num === 1) this.hierarchyNav.activateCreateFromRoot();
                else this.hierarchyNav.activateLevel(num);
                return;
            }
        }

        // Ctrl+B: Toggle bold
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
            e.preventDefault(); this.toggleBold(); return;
        }

        // Ctrl+A: Select all
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
            if (document.activeElement && document.activeElement.isContentEditable) return;
            e.preventDefault(); this.selectAll(); return;
        }

        // Ctrl+Enter: create CHILD node below with connection line
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.isComposing) {
            e.preventDefault(); e.stopPropagation();
            if (this.editingNode) {
                const n = this.editingNode;
                this.finishEditingNode(n, false);
                // Create child node
                const off = n.element.offsetHeight + 40;
                const pos = this.findNonOverlappingPosition(n.x, n.y + off, n.element.offsetWidth + 40, n.element.offsetHeight + 20);
                const nn = this.createNode("", pos.x, pos.y); nn.setType(n.nodeType);
                const conn = this.createConnection(n, nn);
                conn.setLineType(this.defaultLineType);
                conn.setDashType(this.defaultDashType);
                this.startEditingNode(nn); this.selectNode(nn);
                this.updateControlButtonsState(); this.saveState();
                return;
            }
            let cur = this.selectedNode || this.nodes[this.nodes.length - 1];
            if (cur) {
                const off = cur.element.offsetHeight + 40;
                const pos = this.findNonOverlappingPosition(cur.x, cur.y + off, 160, cur.element.offsetHeight + 20);
                const nn = this.createNode("", pos.x, pos.y);
                nn.setType(cur.nodeType);
                const conn = this.createConnection(cur, nn);
                conn.setLineType(this.defaultLineType);
                conn.setDashType(this.defaultDashType);
                this.startEditingNode(nn); this.selectNode(nn);
                this.updateControlButtonsState(); this.saveState();
            }
            return;
        }

        // Ctrl+J: Copy full JSON state to clipboard
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
            e.preventDefault(); e.stopPropagation();
            this.copyJsonToClipboard();
            return;
        }

        // 'e' key: start editing (only when not editing)
        if (e.key === "e" && !e.ctrlKey && !e.metaKey && !e.altKey) {
            if (this.selectedNode && !this.editingNode) { e.preventDefault(); this.startEditingNode(this.selectedNode); }
            return;
        }

        if (document.activeElement && document.activeElement.isContentEditable) return;

        // ★ Single-key shortcuts (only when NOT editing a node)
        // N: Cycle node type
        if (e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            e.preventDefault(); this.cycleNodeType(); return;
        }
        // L: Cycle line style (arrow direction)
        if (e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            e.preventDefault(); this.cycleLineStyle(); return;
        }
        // T: Cycle line type (solid/dashed)
        if (e.key.toLowerCase() === "t" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
            e.preventDefault(); this.cycleLineType(); return;
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); this.undo(); }
        else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); this.redo(); }
        else if (["Backspace", "Delete"].includes(e.key)) { e.preventDefault(); this.deleteSelection(); this.saveState(); }
    }

    // ===== Shortcut Actions =====
    toggleBold() {
        const btn = document.getElementById("boldTextBtn");
        if (this.selectedNodes.length > 0) {
            const ns = !this.selectedNodes.every(n => n.boldText);
            this.selectedNodes.forEach(n => n.setBold(ns)); this.saveState(); this.updateControlButtonsState();
            showTooltip(btn, `太字: ${ns ? "オン" : "オフ"}`);
        } else if (this.selectedNode) {
            const ns = !this.selectedNode.boldText; this.selectedNode.setBold(ns); this.saveState(); this.updateControlButtonsState();
            showTooltip(btn, `太字: ${ns ? "オン" : "オフ"}`);
        }
    }

    cycleNodeType() {
        const types = ["standard", "text-only", "grey", "red", "dotted"];
        const next = c => types[(types.indexOf(c) + 1) % types.length];
        const btn = document.getElementById("changeTypeBtn");
        const label = t => ({ standard: "標準", "text-only": "テキスト", grey: "グレー", red: "赤", dotted: "点線" }[t] || t);
        if (this.selectedNodes.length > 0) {
            const t = next(this.selectedNodes[0].nodeType); this.selectedNodes.forEach(n => n.setType(t)); this.defaultNodeType = t;
        } else if (this.selectedNode) {
            const t = next(this.selectedNode.nodeType); this.selectedNode.setType(t); this.defaultNodeType = t;
        } else {
            this.defaultNodeType = next(this.defaultNodeType);
        }
        this.saveState(); this.updateControlButtonsState();
        showTooltip(btn, `ノード種類: ${label(this.defaultNodeType)}`);
    }

    cycleLineStyle() {
        const btn = document.getElementById("changeLineTypeBtn");
        const nextL = c => ({ standard: "no-arrow", "no-arrow": "reverse-arrow", "reverse-arrow": "both-arrow", "both-arrow": "standard" }[c] || "standard");
        if (this.selectedConnections.length > 0) {
            const t = nextL(this.selectedConnections[0].lineType); this.selectedConnections.forEach(c => c.setLineType(t)); this.defaultLineType = t;
        } else if (this.selectedConnection) {
            const t = nextL(this.selectedConnection.lineType); this.selectedConnection.setLineType(t); this.defaultLineType = t;
        } else {
            this.defaultLineType = nextL(this.defaultLineType);
        }
        this.saveState(); this.updateControlButtonsState();
        showTooltip(btn, `線種: ${this.getLineTypeName(this.defaultLineType)}`);
    }

    cycleLineType() {
        const btn = document.getElementById("changeDashTypeBtn");
        if (this.selectedConnections.length > 0) {
            const t = this.selectedConnections[0].dashType === "solid" ? "dashed" : "solid"; this.selectedConnections.forEach(c => c.setDashType(t)); this.defaultDashType = t;
        } else if (this.selectedConnection) {
            const t = this.selectedConnection.dashType === "solid" ? "dashed" : "solid"; this.selectedConnection.setDashType(t); this.defaultDashType = t;
        } else {
            this.defaultDashType = this.defaultDashType === "solid" ? "dashed" : "solid";
        }
        this.saveState(); this.updateControlButtonsState();
        showTooltip(btn, `線タイプ: ${this.getDashTypeName(this.defaultDashType)}`);
    }

    // ===== Control Panel =====
    initControlPanel() {
        const changeTypeBtn = document.getElementById("changeTypeBtn");
        const changeLineTypeBtn = document.getElementById("changeLineTypeBtn");
        const changeDashTypeBtn = document.getElementById("changeDashTypeBtn");
        const boldTextBtn = document.getElementById("boldTextBtn");

        changeTypeBtn.addEventListener("click", () => this.cycleNodeType());
        changeLineTypeBtn.addEventListener("click", () => this.cycleLineStyle());
        changeDashTypeBtn.addEventListener("click", () => this.cycleLineType());
        boldTextBtn.addEventListener("click", () => this.toggleBold());

        // Tooltips on hover
        changeTypeBtn.addEventListener("mouseenter", () => {
            const label = t => ({ standard: "標準", "text-only": "テキスト", grey: "グレー", red: "赤", dotted: "点線" }[t] || t);
            let tip = this.selectedNode ? `選択中: ${label(this.selectedNode.nodeType)}` : `現在: ${label(this.defaultNodeType)}`;
            showTooltip(changeTypeBtn, tip);
        });
        changeLineTypeBtn.addEventListener("mouseenter", () => showTooltip(changeLineTypeBtn, `線種: ${this.getLineTypeName(this.defaultLineType)}`));
        changeDashTypeBtn.addEventListener("mouseenter", () => showTooltip(changeDashTypeBtn, `線タイプ: ${this.getDashTypeName(this.defaultDashType)}`));
        boldTextBtn.addEventListener("mouseenter", () => {
            let tip = this.selectedNode ? `${this.selectedNode.boldText ? "太字" : "通常"}` : "太字";
            showTooltip(boldTextBtn, tip);
        });

        document.getElementById("guideBtn").addEventListener("click", () => this.showShortcutsHelp());
        document.getElementById("resetViewBtn").addEventListener("click", () => { this.resetView(); showTooltip(document.getElementById("resetViewBtn"), "表示リセット"); });

        // JSON copy (N button)
        const notionBtn = document.getElementById("notionBtn");
        if (notionBtn) {
            notionBtn.addEventListener("click", () => this.copyJsonToClipboard());
            notionBtn.addEventListener("mouseenter", () => showRightAlignedTooltip(notionBtn, "JSON形式でコピー"));
        }

        // Theme toggle
        const themeBtn = document.getElementById("themeBtn");
        if (themeBtn) {
            themeBtn.addEventListener("click", () => this.toggleTheme());
            themeBtn.addEventListener("mouseenter", () => showTooltip(themeBtn, this.currentTheme === 'dark' ? 'ライトモード' : 'ダークモード'));
        }

        const tooltips = { resetBtn: "新規作成", importBtn: "開く", exportBtn: "保存", shareBtn: "共有", notionBtn: "JSONコピー", guideBtn: "ショートカット", resetViewBtn: "表示リセット" };
        Object.keys(tooltips).forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.addEventListener("mouseenter", () => (id === "guideBtn" || id === "shareBtn") ? showRightAlignedTooltip(btn, tooltips[id]) : showTooltip(btn, tooltips[id]));
        });

        changeTypeBtn.classList.remove("standard", "text-only", "grey", "red", "dotted");
        changeTypeBtn.classList.add(this.defaultNodeType);
    }

    getLineTypeName(t) { return { standard: "標準矢印", "no-arrow": "矢印なし", "reverse-arrow": "逆矢印", "both-arrow": "両方向" }[t] || "標準矢印"; }
    getDashTypeName(t) { return t === "solid" ? "実線" : "点線"; }
    getLineTypeSymbol(t) { return { standard: "→", "no-arrow": "—", "reverse-arrow": "←", "both-arrow": "↔" }[t] || "→"; }
    getDashTypeSymbol(t) { return t === "solid" ? "—" : "‥"; }

    // ===== Pan =====
    startPan(e) {
        if (e.button !== 2) return;
        const ed = e.target.closest(".node");
        if (ed && (ed.isContentEditable || ed.classList.contains("editing"))) return;
        e.preventDefault();
        const sx = e.clientX, sy = e.clientY, ip = { ...this.globalPan };
        this.canvas.style.cursor = "grabbing"; let moved = false;
        const onMove = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; if (!moved && Math.sqrt(dx * dx + dy * dy) > 5) moved = true; if (moved) { this.globalPan.x = ip.x + dx; this.globalPan.y = ip.y + dy; requestAnimationFrame(() => { this.updateGlobalTransform(); this.updateAllConnections(); }); } };
        const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); if (moved) this.canvas.style.cursor = "default"; };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    }

    resetView() {
        let cn = this.nodes.find(n => n.element.textContent.trim() === "中心ノード") || this.nodes.find(n => n.id === 1) || this.nodes[0];
        if (cn) {
            setTimeout(() => {
                const r = cn.element.getBoundingClientRect();
                this.globalPan.x += (window.innerWidth / 2) - (r.left + r.width / 2);
                this.globalPan.y += (window.innerHeight / 2) - (r.top + r.height / 2);
                this.updateGlobalTransform(); this.updateAllConnections();
            }, 50);
        }
    }

    // ===== Canvas Mouse =====
    onCanvasMouseDown(e) {
        if (this.editingNode && e.target.closest(".node") === this.editingNode.element && e.detail === 1) return;
        if (this.editingNode) this.finishEditingNode(this.editingNode, false);
        if (e.target.closest(".node") && e.detail === 1) return;
        if (e.detail === 1) { this.clearSelection(); this.startRubberBand(e); }
        else if (e.detail === 2) this.startBlankDoubleClick(e);
    }

    startRubberBand(e) {
        const sel = document.createElement("div"); sel.id = "selectionRect";
        sel.style.left = e.clientX + "px"; sel.style.top = e.clientY + "px";
        document.body.appendChild(sel);
        const sx = e.clientX, sy = e.clientY;
        const onMove = ev => { sel.style.left = Math.min(sx, ev.clientX) + "px"; sel.style.top = Math.min(sy, ev.clientY) + "px"; sel.style.width = Math.abs(ev.clientX - sx) + "px"; sel.style.height = Math.abs(ev.clientY - sy) + "px"; };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp);
            const sb = sel.getBoundingClientRect();
            this.nodes.forEach(n => { const nb = n.element.getBoundingClientRect(); if (!(nb.right < sb.left || nb.left > sb.right || nb.bottom < sb.top || nb.top > sb.bottom)) { this.selectedNodes.push(n); n.element.classList.add("selected"); } });
            this.connections.forEach(c => { const lb = c.line.getBoundingClientRect(); if (!(lb.right < sb.left || lb.left > sb.right || lb.bottom < sb.top || lb.top > sb.bottom)) { this.selectedConnections.push(c); c.line.classList.add("selected-line"); c.showHandles(); } });
            document.body.removeChild(sel); this.updateControlButtonsState(); this.saveState();
        };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    }

    // ===== Node Interaction =====
    handleNodeMouseDown(e, node) {
        if (this.editingNode && this.editingNode !== node) this.finishEditingNode(this.editingNode, false);
        if (this.selectedConnection) { this.selectedConnection.line.classList.remove("selected-line"); this.selectedConnection.hideHandles(); this.selectedConnection = null; }
        if (e.detail === 2) { if (this.moveTimer) { clearTimeout(this.moveTimer); this.moveTimer = null; } this.startDoubleClick(e, node); return; }
        const st = Date.now();
        this.moveTimer = setTimeout(() => { this.startMove(e, node); this.moveTimer = null; }, 250);
        const cancel = () => { if (Date.now() - st < 250) { clearTimeout(this.moveTimer); this.moveTimer = null; this.clearSelection(); this.selectNode(node); this.hideAllHandles(); this.updateControlButtonsState(); } document.removeEventListener("mouseup", cancel); };
        document.addEventListener("mouseup", cancel);
    }

    startMove(e, node) {
        if (!this.selectedNodes.includes(node)) { this.clearSelection(); this.selectNode(node); }
        if (this.selectedNodes.length + this.selectedConnections.length > 1) { this.startGroupMove(e); return; }
        const group = [node]; this.clearSelection(); group.forEach(n => n.element.classList.add("selected")); this.selectedNodes = group; this.selectedNode = node;
        const start = this.eventToLogical(e); const initPos = new Map(group.map(n => [n, { x: n.x, y: n.y }])); let dragging = false;
        const onMove = ev => { const c = this.eventToLogical(ev); const dx = c.x - start.x, dy = c.y - start.y; if (!dragging && Math.sqrt(dx * dx + dy * dy) > 5) dragging = true; if (dragging) { group.forEach(n => { const p = initPos.get(n); n.setPosition(p.x + dx, p.y + dy) }); this.updateAllConnections(); } };
        const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); this.saveState(); };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    }

    startGroupMove(e) {
        const start = this.eventToLogical(e); const initPos = new Map(this.selectedNodes.map(n => [n, { x: n.x, y: n.y }]));
        const connInit = new Map(); this.selectedConnections.forEach(c => { if (c.fromCoord && c.toCoord) connInit.set(c, { from: { ...c.fromCoord }, to: { ...c.toCoord } }); });
        const connected = new Set(); this.connections.forEach(c => { if ((c.fromNode && this.selectedNodes.includes(c.fromNode)) || (c.toNode && this.selectedNodes.includes(c.toNode))) if (!this.selectedConnections.includes(c)) connected.add(c); });
        const onMove = ev => { const c = this.eventToLogical(ev); const dx = c.x - start.x, dy = c.y - start.y; this.selectedNodes.forEach(n => { const p = initPos.get(n); n.setPosition(p.x + dx, p.y + dy) }); this.selectedConnections.forEach(cn => { if (connInit.has(cn)) { const p = connInit.get(cn); cn.fromCoord = { x: p.from.x + dx, y: p.from.y + dy }; cn.toCoord = { x: p.to.x + dx, y: p.to.y + dy }; } cn.update(); }); connected.forEach(cn => cn.update()); };
        const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); this.saveState(); };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    }

    startDoubleClick(e, node) {
        const start = { x: e.clientX, y: e.clientY }; let branch = false;
        const onMove = ev => { if (!branch && Math.sqrt((ev.clientX - start.x) ** 2 + (ev.clientY - start.y) ** 2) > 10) { branch = true; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); this.startBranchCreation(ev, node); } };
        const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); if (!branch) this.startEditingNode(node); };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    }

    startBranchCreation(e, node) {
        const cR = this.canvas.getBoundingClientRect(); const nR = node.element.getBoundingClientRect();
        const cx = nR.left + nR.width / 2 - cR.left, cy = nR.top + nR.height / 2 - cR.top;
        const tl = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tl.setAttribute("stroke", "var(--color-accent-light,#818cf8)"); tl.setAttribute("stroke-width", "2"); tl.setAttribute("stroke-dasharray", "6");
        tl.setAttribute("x1", cx); tl.setAttribute("y1", cy); tl.setAttribute("x2", e.clientX - cR.left); tl.setAttribute("y2", e.clientY - cR.top);
        this.svg.appendChild(tl);
        const onMove = ev => { tl.setAttribute("x2", ev.clientX - cR.left); tl.setAttribute("y2", ev.clientY - cR.top); };
        const onUp = ev => {
            document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); this.svg.removeChild(tl);
            this.branchCreationJustHappened = true; setTimeout(() => this.branchCreationJustHappened = false, 300);
            const de = document.elementFromPoint(ev.clientX, ev.clientY); const dne = de ? de.closest(".node") : null; let dn = this.nodes.find(n => n.element === dne);
            if (dn && dn !== node) {
                const conn = this.createConnection(node, dn);
                if (node.nodeType === "dotted") { conn.setLineType("no-arrow"); conn.setDashType("dashed"); }
                this.clearSelection(); this.selectNode(dn);
            } else {
                const pos = this.eventToLogical(ev); const nn = this.createNode("", pos.x, pos.y); nn.setType("text-only"); this.startEditingNode(nn);
                const conn = this.createConnection(node, nn);
                if (node.nodeType === "dotted") { conn.setLineType("no-arrow"); conn.setDashType("dashed"); }
                this.clearSelection(); this.selectNode(nn);
            }
            this.updateControlButtonsState(); this.saveState();
        };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    }

    startBlankDoubleClick(e) {
        const cR = this.canvas.getBoundingClientRect(); const sx = e.clientX - cR.left, sy = e.clientY - cR.top;
        const tl = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tl.setAttribute("stroke", "var(--color-accent-light,#818cf8)"); tl.setAttribute("stroke-width", "2"); tl.setAttribute("stroke-dasharray", "6");
        tl.setAttribute("x1", sx); tl.setAttribute("y1", sy); tl.setAttribute("x2", sx); tl.setAttribute("y2", sy);
        const ic = { x: e.clientX, y: e.clientY }; let lm = false, fc = null;
        const onMove = ev => { const dx = ev.clientX - ic.x, dy = ev.clientY - ic.y; if (!lm && Math.sqrt(dx * dx + dy * dy) > 10) { lm = true; fc = this.eventToLogical({ clientX: ic.x, clientY: ic.y }); this.svg.appendChild(tl); } if (lm) { tl.setAttribute("x2", ev.clientX - cR.left); tl.setAttribute("y2", ev.clientY - cR.top); } };
        const onUp = ev => {
            document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp);
            if (lm) {
                this.svg.removeChild(tl); const de = document.elementFromPoint(ev.clientX, ev.clientY); const dne = de ? de.closest(".node") : null;
                if (dne) { const t = this.nodes.find(n => n.element === dne); const conn = this.createConnection(null, t); conn.fromCoord = fc; conn.update(); }
                else { const conn = this.createConnection(null, null); conn.fromCoord = fc; conn.toCoord = this.eventToLogical(ev); conn.update(); }
                this.saveState();
            } else {
                const pos = this.eventToLogical(ev); const nn = this.createNode("", pos.x, pos.y); nn.setType(this.defaultNodeType);
                this.startEditingNode(nn); this.selectNode(nn); this.updateControlButtonsState(); this.saveState();
            }
        };
        document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
    }

    // ===== Node Editing =====
    startEditingNode(n) {
        if (this.editingNode && this.editingNode !== n) this.finishEditingNode(this.editingNode, false);
        this.clearSelection(); this.selectedNode = n; this.selectedNodes = [n]; n.element.classList.add("selected");
        n._originalZIndex = n.element.style.zIndex || "";
        n.element.textContent = n.rawText; n.element.contentEditable = "true"; n.element.classList.add("editing"); n.element.style.zIndex = "1000";
        const onKeyDown = e => {
            // Escape and Tab are handled by document capture handler, no need here
            if (e.key === "Escape" || e.key === "Tab") return;
            if (e.key === "Enter") {
                if (e.isComposing) return;
                if (e.shiftKey) {
                    // Shift+Enter: newline
                    e.stopPropagation();
                    setTimeout(() => { n.setPosition(n.x, n.y); this.updateAllConnections() }, 0);
                }
                else if (e.ctrlKey || e.metaKey) {
                    // Ctrl+Enter during editing: create CHILD node  (handled by document capture handler)
                    // Let it bubble up to the capture handler
                    return;
                }
                else {
                    // Enter during editing: finish and create SIBLING node
                    e.preventDefault();
                    this.finishEditingNode(n, true);
                }
            }
        };
        const onInput = () => { n.setPosition(n.x, n.y); this.updateAllConnections(); };
        n.element.addEventListener("keydown", onKeyDown); n.element.addEventListener("input", onInput);
        n._onKeyDown = onKeyDown; n._onInput = onInput;
        n.element.focus();
        const range = document.createRange(); range.selectNodeContents(n.element); range.collapse(false);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        this.editingNode = n;
    }

    finishEditingNode(n, autoChain = false) {
        if (n._onKeyDown) { n.element.removeEventListener("keydown", n._onKeyDown); delete n._onKeyDown; }
        if (n._onInput) { n.element.removeEventListener("input", n._onInput); delete n._onInput; }
        n.element.contentEditable = "false"; n.element.classList.remove("editing");
        if (n._originalZIndex !== undefined) { n.element.style.zIndex = n._originalZIndex; delete n._originalZIndex; } else n.element.style.removeProperty("z-index");
        let newRaw = n.element.innerText.trim();
        if (newRaw === "") { this.selectNode(n); this.deleteSelection(); this.saveState(); this.editingNode = null; return; }
        n.rawText = newRaw; n.setText(n.rawText);
        this.selectNode(n); this.updateAllConnections(); this.saveState(); this.editingNode = null;
        // Title update: center node name always syncs with title (original yaNote behavior)
        if (n === this.centerNode) { this.titleField.value = newRaw; this.adjustTitleFieldWidth(); }
        // ★ Auto chain: Enter creates SIBLING node (same parent, with connection)
        if (autoChain && this.autoChainEnabled) {
            this.createSiblingNode(n);
        }
    }

    // Create sibling node (same parent as the given node)
    createSiblingNode(n) {
        const parent = this.findParentOf(n);
        if (parent) {
            // Count existing children of parent to determine x offset
            const siblings = this.connections.filter(c => c.fromNode === parent).map(c => c.toNode);
            const rightmost = siblings.reduce((max, s) => Math.max(max, s.x), parent.x);
            const xPos = rightmost + 160;
            const yPos = n.y;
            const pos = this.findNonOverlappingPosition(xPos, yPos, 160, n.element.offsetHeight + 20);
            const nn = this.createNode("", pos.x, pos.y); nn.setType(n.nodeType);
            const conn = this.createConnection(parent, nn);
            conn.setLineType(this.defaultLineType);
            conn.setDashType(this.defaultDashType);
            this.startEditingNode(nn); this.selectNode(nn); this.updateControlButtonsState(); this.saveState();
        } else {
            // No parent found: create node to the right
            const pos = this.findNonOverlappingPosition(n.x + 160, n.y, 160, n.element.offsetHeight + 20);
            const nn = this.createNode("", pos.x, pos.y); nn.setType(n.nodeType);
            this.startEditingNode(nn); this.selectNode(nn); this.updateControlButtonsState(); this.saveState();
        }
    }

    // Find the parent node of a given node (via connections)
    findParentOf(node) {
        const conn = this.connections.find(c => c.toNode === node);
        return conn ? conn.fromNode : null;
    }

    // Find a position that does not overlap with any existing nodes
    findNonOverlappingPosition(x, y, estWidth, estHeight) {
        const margin = 10;
        let posX = x, posY = y;
        let maxAttempts = 50;
        while (maxAttempts-- > 0) {
            let overlap = false;
            for (const node of this.nodes) {
                const nw = node.element.offsetWidth || 100;
                const nh = node.element.offsetHeight || 30;
                // Check bounding box overlap
                if (posX < node.x + nw + margin &&
                    posX + estWidth + margin > node.x &&
                    posY < node.y + nh + margin &&
                    posY + estHeight + margin > node.y) {
                    overlap = true;
                    // Shift down below the overlapping node
                    posY = node.y + nh + margin + 10;
                    break;
                }
            }
            if (!overlap) break;
        }
        return { x: posX, y: posY };
    }

    // ===== CRUD =====
    createNode(text, x, y) { const n = new NoteNode(text, x, y, this); n.setType(this.defaultNodeType); this.nodes.push(n); return n; }
    createConnection(from, to) { const c = new Connection(from, to, this); c.setLineType(this.defaultLineType); c.setDashType(this.defaultDashType); this.connections.push(c); return c; }
    updateAllConnections() { this.connections.forEach(c => c.update()); }
    createHtmlHandle() { const h = document.createElement("div"); h.className = "html-handle"; this.canvas.appendChild(h); return h; }

    addHandleDrag(handle, conn, which) {
        handle.addEventListener("mousedown", e => {
            e.stopPropagation(); e.preventDefault();
            const sx = e.clientX, sy = e.clientY, il = parseFloat(handle.style.left), it = parseFloat(handle.style.top);
            const onMove = ev => { const dx = ev.clientX - sx, dy = ev.clientY - sy; handle.style.left = (il + dx) + "px"; handle.style.top = (it + dy) + "px"; if (which === "from") { conn.fromNode = null; conn.fromCoord = { x: il + dx + 5, y: it + dy + 5 }; } else { conn.toNode = null; conn.toCoord = { x: il + dx + 5, y: it + dy + 5 }; } conn.update(); };
            const onUp = ev => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); handle.style.display = "none"; const de = document.elementFromPoint(ev.clientX, ev.clientY); handle.style.display = ""; const dne = de ? de.closest(".node") : null; const dn = this.nodes.find(n => n.element === dne); if (dn) { if (which === "from") { conn.fromNode = dn; conn.fromCoord = null; } else { conn.toNode = dn; conn.toCoord = null; } } conn.update(); this.saveState(); };
            document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
        });
    }

    // ===== Selection =====
    clearSelection() {
        if (this.selectedNode) { this.selectedNode.element.classList.remove("selected"); this.selectedNode = null; }
        if (this.selectedConnection) { this.selectedConnection.line.classList.remove("selected-line"); this.selectedConnection.hideHandles(); this.selectedConnection = null; }
        this.selectedNodes.forEach(n => n.element.classList.remove("selected")); this.selectedNodes = [];
        this.selectedConnections.forEach(c => { c.line.classList.remove("selected-line"); c.hideHandles(); }); this.selectedConnections = [];
        this.updateControlButtonsState();
    }

    selectAll() {
        this.clearSelection();
        this.nodes.forEach(n => { this.selectedNodes.push(n); n.element.classList.add("selected"); });
        this.connections.forEach(c => { this.selectedConnections.push(c); c.line.classList.add("selected-line"); c.showHandles(); });
        this.updateControlButtonsState();
    }

    hideAllHandles() { this.connections.forEach(c => c.hideHandles()); }

    selectNode(n) {
        if (this.editingNode && this.editingNode !== n) this.finishEditingNode(this.editingNode, false);
        this.clearSelection(); this.selectedNode = n; this.selectedNodes = [n]; n.element.classList.add("selected"); this.updateControlButtonsState();
    }

    selectConnection(c) {
        this.clearSelection(); this.selectedConnection = c; this.selectedConnections = [c]; c.line.classList.add("selected-line"); c.showHandles(); this.updateControlButtonsState();
    }

    deleteSelection() {
        if (this.selectedConnections.length > 0) { this.selectedConnections.forEach(c => { c.hideHandles(); if (c.line.parentNode) c.line.parentNode.removeChild(c.line) }); this.connections = this.connections.filter(c => !this.selectedConnections.includes(c)); this.selectedConnections = []; }
        if (this.selectedNodes.length > 0) {
            this.selectedNodes.forEach(n => { this.connections = this.connections.filter(c => { if (c.fromNode === n || c.toNode === n) { c.hideHandles(); if (c.line.parentNode) c.line.parentNode.removeChild(c.line); return false; } return true; }); if (n.element.parentNode) n.element.parentNode.removeChild(n.element) });
            this.nodes = this.nodes.filter(n => !this.selectedNodes.includes(n)); this.selectedNodes = [];
        } else if (this.selectedNode) {
            if (this.selectedNode.element.parentNode) this.selectedNode.element.parentNode.removeChild(this.selectedNode.element);
            this.connections = this.connections.filter(c => { if (c.fromNode === this.selectedNode || c.toNode === this.selectedNode) { c.hideHandles(); if (c.line.parentNode) c.line.parentNode.removeChild(c.line); return false; } return true; });
            this.selectedNode = null;
        }
        this.clearSelection();
    }

    // ===== State Management =====
    captureState() {
        return {
            title: this.titleField.value, nodes: this.nodes.map(n => ({ id: n.id, text: n.rawText, x: n.x, y: n.y, nodeType: n.nodeType, boldText: n.boldText })),
            connections: this.connections.map(c => ({ fromId: c.fromNode ? c.fromNode.id : null, toId: c.toNode ? c.toNode.id : null, fromCoord: c.fromCoord, toCoord: c.toCoord, lineType: c.lineType, dashType: c.dashType })),
            globalPan: { ...this.globalPan }, globalZoom: this.globalZoom, defaultNodeType: this.defaultNodeType, defaultLineType: this.defaultLineType, defaultDashType: this.defaultDashType
        };
    }

    saveState() { this.undoStack.push(this.captureState()); this.redoStack = []; this.saveToLocalStorage(); }

    restoreState(state) {
        this.nodes.forEach(n => { if (n.element.parentNode) n.element.parentNode.removeChild(n.element) });
        this.connections.forEach(c => { if (c.line.parentNode) c.line.parentNode.removeChild(c.line); c.hideHandles() });
        this.nodes = []; this.connections = [];
        const map = {};
        state.nodes.forEach(nd => { const node = new NoteNode(nd.text, nd.x, nd.y, this, nd.id); node.setType(nd.nodeType || "standard"); if (nd.boldText) node.setBold(true); this.nodes.push(node); map[nd.id] = node; });
        state.connections.forEach(cd => { const conn = new Connection(cd.fromId in map ? map[cd.fromId] : null, cd.toId in map ? map[cd.toId] : null, this); if (cd.lineType) conn.setLineType(cd.lineType); if (cd.dashType) conn.setDashType(cd.dashType); conn.fromCoord = cd.fromCoord; conn.toCoord = cd.toCoord; conn.update(); this.connections.push(conn); });
        if (state.defaultNodeType) this.defaultNodeType = state.defaultNodeType;
        if (state.defaultLineType) this.defaultLineType = state.defaultLineType;
        if (state.defaultDashType) this.defaultDashType = state.defaultDashType;
        this.globalPan = state.globalPan; this.globalZoom = state.globalZoom;
        if (state.title) { this.titleField.value = state.title; this.adjustTitleFieldWidth(); }
        // Restore centerNode reference
        this.centerNode = this.nodes.find(n => n.rawText === "中心ノード") || this.nodes.find(n => n.id === 1) || this.nodes[0];
        this.updateGlobalTransform(); this.updateAllConnections(); this.updateControlButtonsState();
    }

    saveToLocalStorage() { localStorage.setItem("yaNoteRemixData", JSON.stringify({ version: VERSION, data: this.captureState() })); }
    loadFromLocalStorage() { const d = localStorage.getItem("yaNoteRemixData"); if (d) { try { const o = JSON.parse(d); this.restoreState(o.data); this.undoStack.push(this.captureState()); } catch (e) { alert("データ読み込みエラー: " + e.message); } } }
    undo() { if (this.undoStack.length > 1) { this.redoStack.push(this.undoStack.pop()); this.restoreState(this.undoStack[this.undoStack.length - 1]); } }
    redo() { if (this.redoStack.length > 0) { const n = this.redoStack.pop(); this.undoStack.push(n); this.restoreState(n); } }
    exportState() { return JSON.stringify({ version: VERSION, data: this.undoStack[this.undoStack.length - 1] }, null, 2); }

    updateControlButtonsState() {
        const ctb = document.getElementById("changeTypeBtn"); const clb = document.getElementById("changeLineTypeBtn"); const cdb = document.getElementById("changeDashTypeBtn"); const bb = document.getElementById("boldTextBtn");
        ctb.classList.remove("standard", "text-only", "grey", "red", "dotted"); ctb.classList.add(this.defaultNodeType);
        const gl = t => ({ standard: "◻︎", "text-only": "T", grey: "G", red: "R", dotted: "d" }[t] || t);
        ctb.textContent = gl(this.defaultNodeType);
        clb.textContent = this.selectedConnections.length > 0 ? this.getLineTypeSymbol(this.selectedConnections[0].lineType) : (this.selectedConnection ? this.getLineTypeSymbol(this.selectedConnection.lineType) : this.getLineTypeSymbol(this.defaultLineType));
        cdb.textContent = this.selectedConnections.length > 0 ? this.getDashTypeSymbol(this.selectedConnections[0].dashType) : (this.selectedConnection ? this.getDashTypeSymbol(this.selectedConnection.dashType) : this.getDashTypeSymbol(this.defaultDashType));
        bb.classList.remove("active"); bb.disabled = !(this.selectedNodes.length > 0 || this.selectedNode);
        if (this.selectedNodes.length > 0 && this.selectedNodes.every(n => n.boldText)) bb.classList.add("active");
        else if (this.selectedNode && this.selectedNode.boldText) bb.classList.add("active");
    }

    // ===== Theme =====
    applyTheme(theme) {
        this.currentTheme = theme;
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        localStorage.setItem('yaNoteRemixTheme', theme);
        const themeBtn = document.getElementById('themeBtn');
        if (themeBtn) themeBtn.textContent = theme === 'dark' ? '☼' : '☽';
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
        const themeBtn = document.getElementById('themeBtn');
        showTooltip(themeBtn, newTheme === 'dark' ? 'ダークモード' : 'ライトモード');
    }

    showShortcutsHelp() {
        let modal = document.getElementById("shortcutsHelp");
        let overlay = document.getElementById("shortcutsHelpOverlay");
        if (!modal) {
            overlay = document.createElement("div"); overlay.id = "shortcutsHelpOverlay"; overlay.className = "modal-overlay"; overlay.style.display = "block"; overlay.onclick = () => { modal.style.display = "none"; overlay.style.display = "none"; }; document.body.appendChild(overlay);
            modal = document.createElement("div"); modal.id = "shortcutsHelp";
            modal.innerHTML = `<h3>⌨️ ショートカット一覧</h3>
<h4>ノード操作</h4>
<div class="shortcut-row"><span class="shortcut-desc">ノード作成</span><span class="shortcut-key"><kbd>ダブルクリック</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">ノード編集</span><span class="shortcut-key"><kbd>E</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">編集確定 → 兄弟ノード作成</span><span class="shortcut-key"><kbd>Enter</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">編集確定 → 子ノード作成</span><span class="shortcut-key"><kbd>Ctrl</kbd>+<kbd>Enter</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">改行挿入</span><span class="shortcut-key"><kbd>Shift</kbd>+<kbd>Enter</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">削除</span><span class="shortcut-key"><kbd>Delete</kbd></span></div>
<h4>スタイル変更（非編集時）</h4>
<div class="shortcut-row"><span class="shortcut-desc">太字切替</span><span class="shortcut-key"><kbd>Ctrl</kbd>+<kbd>B</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">JSONコピー</span><span class="shortcut-key"><kbd>Ctrl</kbd>+<kbd>J</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">JSON貼り付け</span><span class="shortcut-key"><kbd>Ctrl</kbd>+<kbd>V</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">ノード種類変更</span><span class="shortcut-key"><kbd>N</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">線種変更（矢印方向）</span><span class="shortcut-key"><kbd>L</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">線タイプ変更（実線/点線）</span><span class="shortcut-key"><kbd>T</kbd></span></div>
<h4>階層操作</h4>
<div class="shortcut-row"><span class="shortcut-desc">中心から派生ノード作成</span><span class="shortcut-key"><kbd>Alt</kbd>+<kbd>1</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">階層Nへ移動</span><span class="shortcut-key"><kbd>Alt</kbd>+<kbd>2~9</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">同階層の次ノード</span><span class="shortcut-key"><kbd>Tab</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">同階層の前ノード</span><span class="shortcut-key"><kbd>Shift</kbd>+<kbd>Tab</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">子ノード作成（線付き）</span><span class="shortcut-key"><kbd>Enter</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">ナビゲーション終了</span><span class="shortcut-key"><kbd>Esc</kbd></span></div>
<h4>その他</h4>
<div class="shortcut-row"><span class="shortcut-desc">全選択</span><span class="shortcut-key"><kbd>Ctrl</kbd>+<kbd>A</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">元に戻す</span><span class="shortcut-key"><kbd>Ctrl</kbd>+<kbd>Z</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">やり直し</span><span class="shortcut-key"><kbd>Ctrl</kbd>+<kbd>Y</kbd></span></div>
<div class="shortcut-row"><span class="shortcut-desc">テーマ切替</span><span class="shortcut-key">コントロールパネル ☼/☽</span></div>
<div style="margin-top:16px;text-align:right"><button onclick="this.closest('#shortcutsHelp').style.display='none';document.getElementById('shortcutsHelpOverlay').style.display='none'" style="background:var(--color-accent);color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-family:var(--font-family)">閉じる</button></div>`;
            document.body.appendChild(modal);
        }
        overlay.style.display = "block"; modal.style.display = "block";
    }
}

// ===== Initialize =====
document.addEventListener("DOMContentLoaded", () => {
    if ("serviceWorker" in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register("sw.js").then(r => { console.log("SW registered"); r.addEventListener('updatefound', () => { const nw = r.installing; nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) console.log('New SW installed') }); }); }).catch(e => console.error("SW registration failed", e));
    }

    window.app = new YaNoteApp();

    // Share modal
    const shareModal = new ShareModal();
    document.getElementById("shareBtn").addEventListener("click", () => shareModal.show());

    // URL params
    const params = new URLSearchParams(window.location.search);
    const jsonParam = params.get('json');
    const newParam = params.get('new');

    if (jsonParam) {
        fetch(jsonParam).then(r => r.json()).then(data => {
            app.restoreState(data.data || data); app.saveState();
            window.history.replaceState({}, document.title, window.location.pathname);
            requestAnimationFrame(() => app.resetView());
        }).catch(e => { alert("読み込みエラー: " + e.message); window.history.replaceState({}, document.title, window.location.pathname); });
    } else if (newParam === 'true') {
        localStorage.removeItem("yaNoteRemixData"); localStorage.setItem("skipGuideLoad", "true");
        window.history.replaceState({}, document.title, window.location.pathname); location.reload();
    }

    // Reset / Export / Import
    document.getElementById("resetBtn").addEventListener("click", () => { if (confirm("新規作成しますか？\n現在の内容は失われます。")) { localStorage.removeItem("yaNoteRemixData"); localStorage.setItem("skipGuideLoad", "true"); location.reload(); } });
    document.getElementById("exportBtn").addEventListener("click", () => {
        const json = app.exportState(); const blob = new Blob([json], { type: "application/json" }); const url = URL.createObjectURL(blob);
        const now = new Date(); const pad = n => n.toString().padStart(2, "0");
        const title = app.titleField.value.trim() || "無題";
        const fn = `${title}_yaNoteRemix_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.json`;
        const a = document.createElement("a"); a.href = url; a.download = fn; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    });
    document.getElementById("importBtn").addEventListener("click", () => { if (confirm("開きますか？\n現在の内容は失われます。")) document.getElementById("importInput").click(); });
    document.getElementById("importInput").addEventListener("change", e => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => { try { const imp = JSON.parse(ev.target.result); app.restoreState(imp.data); app.saveState(); requestAnimationFrame(() => app.resetView()); } catch (err) { alert("インポートエラー: " + err.message); } };
        reader.readAsText(file); e.target.value = "";
    });
});

// ===== ShareModal Class =====
class ShareModal {
    constructor() {
        this.modal = document.getElementById('shareModal');
        this.overlay = document.getElementById('shareModalOverlay');
        this.jsonUrlInput = document.getElementById('jsonUrlInput');
        this.generatedUrlContainer = document.getElementById('generatedUrlContainer');
        this.generatedUrlInput = document.getElementById('generatedUrlInput');
        this.cancelBtn = document.getElementById('cancelShareBtn');
        this.generateBtn = document.getElementById('generateUrlBtn');
        this.copyBtn = document.getElementById('copyUrlBtn');
        this.copyMessage = document.querySelector('#shareModal .copy-message');
        this.cancelBtn.addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', () => this.close());
        this.generateBtn.addEventListener('click', () => this.generateUrl());
        this.copyBtn.addEventListener('click', () => this.copyToClipboard());
        this.jsonUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') this.generateUrl(); });
    }
    show() { this.overlay.style.display = 'block'; this.modal.style.display = 'block'; this.jsonUrlInput.focus(); this.generatedUrlContainer.style.display = 'none'; this.generateBtn.style.display = 'inline-block'; this.copyBtn.style.display = 'none'; this.jsonUrlInput.value = ''; this.generatedUrlInput.value = ''; if (this.copyMessage) this.copyMessage.style.display = 'none'; }
    close() { this.overlay.style.display = 'none'; this.modal.style.display = 'none'; }
    generateUrl() { const u = this.jsonUrlInput.value.trim(); if (!u) { alert('URLを入力してください'); return; } this.generatedUrlInput.value = `${window.location.origin}${window.location.pathname}?json=${encodeURIComponent(u)}`; this.generatedUrlContainer.style.display = 'block'; this.generateBtn.style.display = 'none'; this.copyBtn.style.display = 'inline-block'; }
    copyToClipboard() { this.generatedUrlInput.select(); document.execCommand('copy'); if (this.copyMessage) { this.copyMessage.style.display = 'block'; setTimeout(() => this.copyMessage.style.display = 'none', 2000); } }
}
