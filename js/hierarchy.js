/* ===== Hierarchy Navigation Module ===== */

/**
 * Build hierarchy tree from nodes and connections.
 * Root is identified as the first node or the node with text "中心ノード".
 */
export function buildHierarchyTree(nodes, connections) {
    if (nodes.length === 0) return null;

    // Find root node
    const root = nodes.find(n => n.rawText === "中心ノード") || nodes.find(n => n.id === 1) || nodes[0];
    if (!root) return null;

    // Build adjacency: parent -> children (based on connection from -> to)
    const childrenMap = new Map();
    connections.forEach(conn => {
        if (conn.fromNode && conn.toNode) {
            if (!childrenMap.has(conn.fromNode.id)) {
                childrenMap.set(conn.fromNode.id, []);
            }
            childrenMap.get(conn.fromNode.id).push(conn.toNode);
        }
    });

    // BFS to assign levels
    const visited = new Set();
    const levelMap = new Map(); // nodeId -> level
    const nodesByLevel = new Map(); // level -> [nodes]

    const queue = [{ node: root, level: 0 }];
    visited.add(root.id);
    levelMap.set(root.id, 0);

    while (queue.length > 0) {
        const { node, level } = queue.shift();

        if (!nodesByLevel.has(level)) {
            nodesByLevel.set(level, []);
        }
        nodesByLevel.get(level).push(node);

        const children = childrenMap.get(node.id) || [];
        for (const child of children) {
            if (!visited.has(child.id)) {
                visited.add(child.id);
                levelMap.set(child.id, level + 1);
                queue.push({ node: child, level: level + 1 });
            }
        }
    }

    return {
        root,
        levelMap,
        nodesByLevel,
        childrenMap
    };
}

/**
 * Get nodes at the specified hierarchy level
 */
export function getNodesAtLevel(tree, level) {
    if (!tree || !tree.nodesByLevel) return [];
    return tree.nodesByLevel.get(level) || [];
}

/**
 * Get children of a specific node
 */
export function getChildrenOf(tree, node) {
    if (!tree || !tree.childrenMap) return [];
    return tree.childrenMap.get(node.id) || [];
}

/**
 * HierarchyNavigator - manages hierarchy navigation mode
 */
export class HierarchyNavigator {
    constructor(app) {
        this.app = app;
        this.active = false;
        this.currentLevel = 0;
        this.currentIndex = 0;
        this.nodesAtLevel = [];
        this.tree = null;
        this.indicatorEl = document.getElementById('hierarchyIndicator');
    }

    /**
     * Activate hierarchy navigation at a specific level.
     * level 1 = Ctrl+Shift+1 (create child of root)
     * level 2+ = Ctrl+Shift+2+ (navigate children at that level)
     */
    activateCreateFromRoot() {
        // Deactivate any existing navigation first
        if (this.active) this.deactivate();
        this.tree = buildHierarchyTree(this.app.nodes, this.app.connections);
        if (!this.tree) return;

        const root = this.tree.root;
        const offset = root.element.offsetHeight + 60;
        const existingChildren = getChildrenOf(this.tree, root);
        const xOffset = existingChildren.length * 120;

        const pos = this.app.findNonOverlappingPosition(root.x + xOffset, root.y + offset, 160, 50);
        const newNode = this.app.createNode("", pos.x, pos.y);
        newNode.setType(this.app.defaultNodeType);
        const conn = this.app.createConnection(root, newNode);
        conn.setLineType(this.app.defaultLineType);
        conn.setDashType(this.app.defaultDashType);

        this.app.startEditingNode(newNode);
        this.app.selectNode(newNode);
        this.app.updateControlButtonsState();
        this.app.saveState();
    }

    /**
     * Navigate to a specific hierarchy level (1-indexed)
     * Ctrl+Shift+2 → level 1, Ctrl+Shift+3 → level 2, etc.
     */
    activateLevel(hierarchyKey) {
        // Deactivate any existing navigation first
        if (this.active) this.deactivate();
        const level = hierarchyKey - 1;
        this.tree = buildHierarchyTree(this.app.nodes, this.app.connections);
        if (!this.tree) return;

        this.nodesAtLevel = getNodesAtLevel(this.tree, level);
        if (this.nodesAtLevel.length === 0) {
            this.showIndicator(`階層 ${level} にノードがありません`);
            setTimeout(() => this.hideIndicator(), 2000);
            return;
        }

        this.active = true;
        this.currentLevel = level;
        this.currentIndex = 0;

        // Clear previous selection
        this.app.clearSelection();

        // Highlight first node at this level
        this.highlightCurrent();
        this.showIndicator(`階層 ${level} ナビゲーション中 (${this.currentIndex + 1}/${this.nodesAtLevel.length}) — Tab:移動 Enter:子ノード作成 Esc:終了`);
    }

    /**
     * Move to next node at current level
     */
    next() {
        if (!this.active || this.nodesAtLevel.length === 0) return;
        this.unhighlightCurrent();
        this.currentIndex = (this.currentIndex + 1) % this.nodesAtLevel.length;
        this.highlightCurrent();
        this.updateIndicator();
    }

    /**
     * Move to previous node at current level
     */
    prev() {
        if (!this.active || this.nodesAtLevel.length === 0) return;
        this.unhighlightCurrent();
        this.currentIndex = (this.currentIndex - 1 + this.nodesAtLevel.length) % this.nodesAtLevel.length;
        this.highlightCurrent();
        this.updateIndicator();
    }

    /**
     * Create a child node from the currently highlighted node
     */
    createChild() {
        if (!this.active || this.nodesAtLevel.length === 0) return;
        const parentNode = this.nodesAtLevel[this.currentIndex];
        const offset = parentNode.element.offsetHeight + 60;
        const children = getChildrenOf(this.tree, parentNode);
        const xOffset = children.length * 120;

        const pos = this.app.findNonOverlappingPosition(parentNode.x + xOffset, parentNode.y + offset, 160, 50);
        const newNode = this.app.createNode("", pos.x, pos.y);
        newNode.setType(this.app.defaultNodeType);
        const conn = this.app.createConnection(parentNode, newNode);
        conn.setLineType(this.app.defaultLineType);
        conn.setDashType(this.app.defaultDashType);

        this.deactivate();

        this.app.startEditingNode(newNode);
        this.app.selectNode(newNode);
        this.app.updateControlButtonsState();
        this.app.saveState();
    }

    /**
     * Deactivate hierarchy navigation
     */
    deactivate() {
        if (!this.active) return;
        this.unhighlightCurrent();
        this.active = false;
        this.nodesAtLevel = [];
        this.currentIndex = 0;
        this.hideIndicator();
    }

    highlightCurrent() {
        if (this.nodesAtLevel.length === 0) return;
        const node = this.nodesAtLevel[this.currentIndex];
        node.element.classList.add("hierarchy-highlight");
        this.app.selectNode(node);

        // Scroll into view
        const rect = node.element.getBoundingClientRect();
        const viewportCenterX = window.innerWidth / 2;
        const viewportCenterY = window.innerHeight / 2;
        const nodeCenterX = rect.left + rect.width / 2;
        const nodeCenterY = rect.top + rect.height / 2;

        const dx = viewportCenterX - nodeCenterX;
        const dy = viewportCenterY - nodeCenterY;

        if (Math.abs(dx) > window.innerWidth / 3 || Math.abs(dy) > window.innerHeight / 3) {
            this.app.globalPan.x += dx * 0.8;
            this.app.globalPan.y += dy * 0.8;
            this.app.updateGlobalTransform();
            this.app.updateAllConnections();
        }
    }

    unhighlightCurrent() {
        if (this.nodesAtLevel.length === 0) return;
        const node = this.nodesAtLevel[this.currentIndex];
        node.element.classList.remove("hierarchy-highlight");
    }

    showIndicator(text) {
        if (this.indicatorEl) {
            this.indicatorEl.textContent = text;
            this.indicatorEl.classList.add('visible');
        }
    }

    hideIndicator() {
        if (this.indicatorEl) {
            this.indicatorEl.classList.remove('visible');
        }
    }

    updateIndicator() {
        this.showIndicator(`階層 ${this.currentLevel} ナビゲーション中 (${this.currentIndex + 1}/${this.nodesAtLevel.length}) — Tab:移動 Enter:子ノード作成 Esc:終了`);
    }
}
