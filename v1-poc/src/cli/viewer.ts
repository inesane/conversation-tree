import { exec } from "child_process";
import * as path from "path";

export function generateTreeView(
  treeJson: string,
  messagesJson: string
): string {
  return HTML_TEMPLATE.replace("__TREE_JSON__", treeJson).replace(
    "__MESSAGES_JSON__",
    messagesJson
  );
}

export function openInBrowser(filePath: string): void {
  const absPath = path.resolve(filePath);
  const cmd =
    process.platform === "darwin"
      ? `open "${absPath}"`
      : process.platform === "win32"
        ? `start "" "${absPath}"`
        : `xdg-open "${absPath}"`;

  exec(cmd, (err) => {
    if (err) {
      console.log(`Open manually: file://${absPath}`);
    }
  });
}

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Conversation Tree</title>
<script src="https://d3js.org/d3.v7.min.js"><\/script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f172a;
    color: #e2e8f0;
    overflow: hidden;
    height: 100vh;
    width: 100vw;
  }

  #header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 56px;
    background: #1e293b;
    border-bottom: 1px solid #334155;
    display: flex;
    align-items: center;
    padding: 0 24px;
    z-index: 100;
    gap: 16px;
  }

  #header h1 {
    font-size: 18px;
    font-weight: 600;
    color: #f1f5f9;
  }

  #header .stats {
    font-size: 13px;
    color: #94a3b8;
  }

  .legend {
    display: flex;
    gap: 16px;
    margin-left: auto;
    font-size: 12px;
    color: #94a3b8;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  #tree-container {
    position: fixed;
    top: 56px;
    left: 0;
    right: 0;
    bottom: 0;
  }

  #tree-container svg {
    width: 100%;
    height: 100%;
  }

  .link {
    fill: none;
    stroke: #334155;
    stroke-width: 2;
  }

  .node-group { cursor: pointer; }

  .node-rect {
    fill: #1e293b;
    stroke: #475569;
    stroke-width: 1.5;
    rx: 8;
    ry: 8;
    transition: stroke 0.15s;
  }

  .node-group:hover .node-rect {
    stroke: #94a3b8;
    filter: drop-shadow(0 0 8px rgba(148,163,184,0.15));
  }

  .node-group.active .node-rect {
    stroke: #22c55e;
    stroke-width: 2;
    filter: drop-shadow(0 0 12px rgba(34,197,94,0.3));
  }

  .status-bar {
    rx: 8;
    ry: 8;
  }

  .node-label {
    fill: #f1f5f9;
    font-size: 13px;
    font-weight: 600;
  }

  .node-type-badge {
    font-size: 10px;
    font-weight: 500;
  }

  .node-msg-count {
    fill: #64748b;
    font-size: 11px;
  }

  /* Detail panel */
  #detail-panel {
    position: fixed;
    top: 56px;
    right: 0;
    bottom: 0;
    width: 420px;
    background: #1e293b;
    border-left: 1px solid #334155;
    z-index: 200;
    transform: translateX(100%);
    transition: transform 0.25s ease;
    overflow-y: auto;
    padding: 24px;
  }

  #detail-panel.open {
    transform: translateX(0);
  }

  #detail-panel .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    background: #334155;
    border: none;
    color: #94a3b8;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  #detail-panel .close-btn:hover {
    background: #475569;
    color: #e2e8f0;
  }

  #detail-panel h2 {
    font-size: 20px;
    font-weight: 700;
    color: #f1f5f9;
    margin-bottom: 12px;
    padding-right: 40px;
  }

  .detail-meta {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-active { background: #052e16; color: #22c55e; }
  .badge-paused { background: #451a03; color: #f59e0b; }
  .badge-completed { background: #1e293b; color: #9ca3af; border: 1px solid #475569; }
  .badge-abandoned { background: #450a0a; color: #ef4444; }

  .badge-subtopic { background: #083344; color: #06b6d4; }
  .badge-tangent { background: #2e1065; color: #a855f7; }
  .badge-return { background: #172554; color: #3b82f6; }
  .badge-progression { background: #1e293b; color: #94a3b8; border: 1px solid #475569; }
  .badge-main_topic { background: #1e293b; color: #e2e8f0; border: 1px solid #475569; }

  .detail-section {
    margin-bottom: 20px;
  }

  .detail-section h3 {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .detail-section p {
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.5;
  }

  .breadcrumb {
    font-size: 13px;
    color: #94a3b8;
  }

  .breadcrumb span {
    color: #06b6d4;
  }

  .message-list {
    list-style: none;
  }

  .message-item {
    padding: 10px 12px;
    background: #0f172a;
    border-radius: 8px;
    margin-bottom: 8px;
    font-size: 13px;
    line-height: 1.5;
  }

  .message-item .speaker {
    font-weight: 600;
    color: #06b6d4;
  }

  .message-item .text {
    color: #cbd5e1;
  }

  .message-item .msg-index {
    color: #475569;
    font-size: 11px;
    margin-right: 6px;
  }

  .hint {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 12px;
    color: #64748b;
    z-index: 50;
    pointer-events: none;
  }
</style>
</head>
<body>

<div id="header">
  <h1>Conversation Tree</h1>
  <span class="stats" id="stats"></span>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div> Active</div>
    <div class="legend-item"><div class="legend-dot" style="background:#f59e0b"></div> Paused</div>
    <div class="legend-item"><div class="legend-dot" style="background:#9ca3af"></div> Completed</div>
    <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div> Abandoned</div>
  </div>
</div>

<div id="tree-container"></div>

<div id="detail-panel">
  <button class="close-btn" onclick="closePanel()">&times;</button>
  <div id="detail-content"></div>
</div>

<div class="hint">Scroll to zoom &middot; Drag to pan &middot; Click a node for details</div>

<script>
const TREE_DATA = __TREE_JSON__;
const MESSAGES_DATA = __MESSAGES_JSON__;

const STATUS_COLORS = {
  active: '#22c55e',
  paused: '#f59e0b',
  completed: '#9ca3af',
  abandoned: '#ef4444'
};

const TYPE_COLORS = {
  subtopic: '#06b6d4',
  tangent: '#a855f7',
  return: '#3b82f6',
  progression: '#64748b',
  main_topic: null,
  root: null
};

const NODE_W = 220;
const NODE_H = 56;
const H_SPACING = 300;
const V_SPACING = 80;

// Build hierarchy
function buildHierarchy(data) {
  const nodes = data.nodes;
  function build(nodeId) {
    const n = nodes[nodeId];
    const children = (n.children || []).map(cid => build(cid));
    return { ...n, children: children.length > 0 ? children : null };
  }
  return d3.hierarchy(build(data.rootId));
}

const root = buildHierarchy(TREE_DATA);
const treeLayout = d3.tree().nodeSize([V_SPACING, H_SPACING]);
treeLayout(root);

// Stats
const allNodes = root.descendants().filter(d => d.data.topicType !== 'root');
const activeCount = allNodes.filter(d => d.data.status === 'active').length;
const pausedCount = allNodes.filter(d => d.data.status === 'paused').length;
document.getElementById('stats').textContent =
  allNodes.length + ' topics | ' + activeCount + ' active | ' + pausedCount + ' paused';

// SVG setup
const container = document.getElementById('tree-container');
const svg = d3.select(container).append('svg');
const g = svg.append('g');

// Zoom
const zoom = d3.zoom()
  .scaleExtent([0.2, 3])
  .on('zoom', (e) => g.attr('transform', e.transform));
svg.call(zoom);

// Draw links
const links = root.links().filter(d => d.source.data.topicType !== 'root' || true);
g.selectAll('.link')
  .data(links)
  .enter()
  .append('path')
  .attr('class', 'link')
  .attr('d', d3.linkHorizontal()
    .x(d => d.y)
    .y(d => d.x)
  );

// Draw nodes
const nodeGroups = g.selectAll('.node-group')
  .data(root.descendants())
  .enter()
  .append('g')
  .attr('class', d => 'node-group' + (d.data.id === TREE_DATA.activeTopicId ? ' active' : ''))
  .attr('transform', d => 'translate(' + d.y + ',' + d.x + ')')
  .on('click', (e, d) => showDetail(d.data));

// Skip rendering the root node visuals
nodeGroups.each(function(d) {
  const el = d3.select(this);

  if (d.data.topicType === 'root') {
    // Small circle for root
    el.append('circle')
      .attr('r', 6)
      .attr('fill', '#475569');
    return;
  }

  const halfW = NODE_W / 2;
  const halfH = NODE_H / 2;

  // Main rect
  el.append('rect')
    .attr('class', 'node-rect')
    .attr('x', -halfW)
    .attr('y', -halfH)
    .attr('width', NODE_W)
    .attr('height', NODE_H);

  // Status bar (left edge)
  el.append('rect')
    .attr('class', 'status-bar')
    .attr('x', -halfW)
    .attr('y', -halfH)
    .attr('width', 5)
    .attr('height', NODE_H)
    .attr('fill', STATUS_COLORS[d.data.status] || '#475569');

  // Clip long labels
  const label = d.data.label.length > 24
    ? d.data.label.slice(0, 22) + '...'
    : d.data.label;

  // Label
  el.append('text')
    .attr('class', 'node-label')
    .attr('x', -halfW + 14)
    .attr('y', d.data.topicType !== 'main_topic' && TYPE_COLORS[d.data.topicType] ? -4 : 2)
    .attr('dominant-baseline', 'middle')
    .text(label);

  // Type badge (if not main_topic)
  if (d.data.topicType !== 'main_topic' && TYPE_COLORS[d.data.topicType]) {
    const typeLabel = d.data.topicType === 'progression' ? 'flow' : d.data.topicType;
    el.append('text')
      .attr('class', 'node-type-badge')
      .attr('x', -halfW + 14)
      .attr('y', 14)
      .attr('fill', TYPE_COLORS[d.data.topicType])
      .text(typeLabel);
  }

  // Message count
  const msgCount = (d.data.messageIndices || []).length;
  el.append('text')
    .attr('class', 'node-msg-count')
    .attr('x', halfW - 12)
    .attr('y', 2)
    .attr('text-anchor', 'end')
    .attr('dominant-baseline', 'middle')
    .text(msgCount + ' msg' + (msgCount !== 1 ? 's' : ''));
});

// Fit the view initially
function fitView() {
  const bounds = g.node().getBBox();
  const parent = container.getBoundingClientRect();
  const fullWidth = parent.width;
  const fullHeight = parent.height;
  const padding = 80;

  const scale = Math.min(
    (fullWidth - padding * 2) / bounds.width,
    (fullHeight - padding * 2) / bounds.height,
    1.2
  );

  const tx = fullWidth / 2 - (bounds.x + bounds.width / 2) * scale;
  const ty = fullHeight / 2 - (bounds.y + bounds.height / 2) * scale;

  svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
}

fitView();
window.addEventListener('resize', fitView);

// Detail panel
function showDetail(nodeData) {
  if (nodeData.topicType === 'root') return;

  const panel = document.getElementById('detail-panel');
  const content = document.getElementById('detail-content');

  // Build breadcrumb path
  const path = [];
  let current = nodeData;
  while (current) {
    if (current.topicType !== 'root') path.unshift(current.label);
    current = TREE_DATA.nodes[current.parentId];
  }

  const msgs = (nodeData.messageIndices || [])
    .sort((a, b) => a - b)
    .map(idx => MESSAGES_DATA.find(m => m.index === idx))
    .filter(Boolean);

  content.innerHTML =
    '<h2>' + escHtml(nodeData.label) + '</h2>' +
    '<div class="detail-meta">' +
      '<span class="badge badge-' + nodeData.status + '">' + nodeData.status + '</span>' +
      '<span class="badge badge-' + nodeData.topicType + '">' + nodeData.topicType.replace('_', ' ') + '</span>' +
    '</div>' +
    '<div class="detail-section">' +
      '<h3>Summary</h3>' +
      '<p>' + escHtml(nodeData.summary) + '</p>' +
    '</div>' +
    '<div class="detail-section">' +
      '<h3>Path</h3>' +
      '<p class="breadcrumb">' + path.map(p => '<span>' + escHtml(p) + '</span>').join(' &rsaquo; ') + '</p>' +
    '</div>' +
    '<div class="detail-section">' +
      '<h3>Messages (' + msgs.length + ')</h3>' +
      '<ul class="message-list">' +
        msgs.map(m =>
          '<li class="message-item">' +
            '<span class="msg-index">#' + m.index + '</span>' +
            '<span class="speaker">' + escHtml(m.speaker) + ':</span> ' +
            '<span class="text">' + escHtml(m.text) + '</span>' +
          '</li>'
        ).join('') +
      '</ul>' +
    '</div>';

  panel.classList.add('open');
}

function closePanel() {
  document.getElementById('detail-panel').classList.remove('open');
}

// Close panel on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePanel();
});

// Close panel when clicking on background
svg.on('click', (e) => {
  if (e.target.tagName === 'svg') closePanel();
});

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
<\/script>
</body>
</html>`;
