/**
 * yaNote → Markdown クリップボードコピー
 */

/**
 * ノード＋接続からツリー構造を構築
 */
function buildExportTree(nodes, connections) {
    if (nodes.length === 0) return null;
    const centerNode = nodes.find(n => n.rawText === '中心ノード') || nodes.find(n => n.id === 1) || nodes[0];
    const childrenMap = new Map();
    connections.forEach(c => {
        if (!c.fromNode || !c.toNode) return;
        const fid = c.fromNode.id;
        if (!childrenMap.has(fid)) childrenMap.set(fid, []);
        childrenMap.get(fid).push(c.toNode);
    });
    function sub(node, visited = new Set()) {
        if (visited.has(node.id)) return null;
        visited.add(node.id);
        const children = (childrenMap.get(node.id) || []).map(c => sub(c, visited)).filter(Boolean);
        return { text: node.rawText || '', bold: !!node.boldText, children };
    }
    return sub(centerNode);
}

/**
 * ツリー → Markdown文字列
 */
function treeToMarkdown(tree) {
    const lines = [];
    lines.push(`# ${tree.bold ? '**' + tree.text + '**' : tree.text}`);
    lines.push('');
    if (tree.children) tree.children.forEach(c => mdLines(c, 0, lines));
    return lines.join('\n');
}

function mdLines(node, depth, lines) {
    const t = node.bold ? '**' + node.text + '**' : node.text;
    if (depth === 0) {
        lines.push(`## ${t}`);
    } else {
        lines.push('  '.repeat(depth - 1) + `- ${t}`);
    }
    if (node.children) node.children.forEach(c => mdLines(c, depth + 1, lines));
    if (depth === 0) lines.push('');
}

/**
 * クリップボードにコピー（ボタンから直接呼ぶ）
 */
export async function copyAsMarkdown(app) {
    const tree = buildExportTree(app.nodes, app.connections);
    if (!tree) return false;
    const md = treeToMarkdown(tree);
    await navigator.clipboard.writeText(md);
    return true;
}
