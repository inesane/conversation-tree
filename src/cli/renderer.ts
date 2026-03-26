import { ConversationTree } from "../tree/ConversationTree";
import { TopicNode, TopicStatus, TopicType, Message } from "../types";

// ANSI color codes
const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  strikethrough: "\x1b[9m",

  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  red: "\x1b[31m",
  white: "\x1b[37m",
};

function statusColor(status: TopicStatus): string {
  switch (status) {
    case "active":
      return COLORS.green;
    case "paused":
      return COLORS.yellow;
    case "completed":
      return COLORS.gray;
    case "abandoned":
      return COLORS.red;
  }
}

function statusIcon(status: TopicStatus): string {
  switch (status) {
    case "active":
      return "●";
    case "paused":
      return "◐";
    case "completed":
      return "✓";
    case "abandoned":
      return "✗";
  }
}

function typeTag(topicType: TopicType): string {
  switch (topicType) {
    case "root":
      return "";
    case "main_topic":
      return "";
    case "subtopic":
      return `${COLORS.cyan}[subtopic]${COLORS.reset} `;
    case "tangent":
      return `${COLORS.magenta}[tangent]${COLORS.reset} `;
    case "return":
      return `${COLORS.blue}[return]${COLORS.reset} `;
    case "progression":
      return `${COLORS.white}[→]${COLORS.reset} `;
  }
}

export function renderTree(tree: ConversationTree): string {
  const root = tree.getRoot();
  const lines: string[] = [];

  lines.push(
    `${COLORS.bold}${COLORS.cyan}Conversation Topic Tree${COLORS.reset}`
  );
  lines.push(`${COLORS.dim}${"─".repeat(50)}${COLORS.reset}`);

  if (root.children.length === 0) {
    lines.push(`${COLORS.dim}  (no topics identified)${COLORS.reset}`);
    return lines.join("\n");
  }

  // Render each child of root
  for (let i = 0; i < root.children.length; i++) {
    const childId = root.children[i];
    const isLast = i === root.children.length - 1;
    renderNode(tree, childId, "", isLast, lines);
  }

  // Summary line
  const allNodes = tree.getAllNodes().filter((n) => n.topicType !== "root");
  const activeCount = allNodes.filter((n) => n.status === "active").length;
  const pausedCount = allNodes.filter((n) => n.status === "paused").length;

  lines.push(`${COLORS.dim}${"─".repeat(50)}${COLORS.reset}`);
  lines.push(
    `${COLORS.dim}Topics: ${allNodes.length} total | ${COLORS.green}${activeCount} active${COLORS.reset}${COLORS.dim} | ${COLORS.yellow}${pausedCount} paused${COLORS.reset}`
  );

  return lines.join("\n");
}

function renderNode(
  tree: ConversationTree,
  nodeId: string,
  prefix: string,
  isLast: boolean,
  lines: string[]
): void {
  const node = tree.getNode(nodeId);
  if (!node) return;

  const connector = isLast ? "└─" : "├─";
  const color = statusColor(node.status);
  const icon = statusIcon(node.status);
  const tag = typeTag(node.topicType);

  const label =
    node.status === "abandoned"
      ? `${COLORS.strikethrough}${node.label}${COLORS.reset}`
      : node.label;

  const msgCount = node.messageIndices.length;
  const msgInfo = `${COLORS.dim}(${msgCount} msg${msgCount !== 1 ? "s" : ""})${COLORS.reset}`;

  lines.push(
    `${prefix}${connector} ${color}${icon}${COLORS.reset} ${tag}${COLORS.bold}${label}${COLORS.reset} ${msgInfo}`
  );

  // Render summary on next line if it exists
  const childPrefix = prefix + (isLast ? "   " : "│  ");
  const displaySummary = node.runningSummary || node.summary;
  if (displaySummary && node.topicType !== "root") {
    // Truncate long running summaries to first sentence for tree view
    const shortSummary = displaySummary.length > 120
      ? displaySummary.slice(0, 117) + "..."
      : displaySummary;
    lines.push(
      `${childPrefix}${COLORS.dim}${shortSummary}${COLORS.reset}`
    );
  }

  // Render children
  for (let i = 0; i < node.children.length; i++) {
    const childId = node.children[i];
    const childIsLast = i === node.children.length - 1;
    renderNode(tree, childId, childPrefix, childIsLast, lines);
  }
}

export function renderTopicDetail(
  tree: ConversationTree,
  node: TopicNode,
  messages: Message[]
): string {
  const lines: string[] = [];
  const color = statusColor(node.status);
  const icon = statusIcon(node.status);

  lines.push(
    `${COLORS.bold}${COLORS.cyan}Topic Detail${COLORS.reset}`
  );
  lines.push(`${COLORS.dim}${"─".repeat(50)}${COLORS.reset}`);
  lines.push(
    `${color}${icon}${COLORS.reset} ${COLORS.bold}${node.label}${COLORS.reset}`
  );
  lines.push(`  Status: ${color}${node.status}${COLORS.reset}`);
  lines.push(`  Type: ${node.topicType}`);
  lines.push(`  Summary: ${node.runningSummary || node.summary}`);

  // Path from root
  const path = tree.getPath(node.id);
  const pathStr = path
    .filter((n) => n.topicType !== "root")
    .map((n) => n.label)
    .join(" > ");
  lines.push(`  Path: ${COLORS.cyan}${pathStr}${COLORS.reset}`);

  // Messages
  if (node.messageIndices.length > 0 && messages.length > 0) {
    lines.push(
      `\n  ${COLORS.bold}Messages (${node.messageIndices.length}):${COLORS.reset}`
    );
    for (const idx of node.messageIndices) {
      const msg = messages.find((m) => m.index === idx);
      if (msg) {
        lines.push(
          `    ${COLORS.dim}[${idx}]${COLORS.reset} ${COLORS.bold}${msg.speaker}:${COLORS.reset} ${msg.text}`
        );
      }
    }
  }

  // Children
  if (node.children.length > 0) {
    lines.push(
      `\n  ${COLORS.bold}Child topics:${COLORS.reset}`
    );
    for (const childId of node.children) {
      const child = tree.getNode(childId);
      if (child) {
        const cColor = statusColor(child.status);
        const cIcon = statusIcon(child.status);
        lines.push(
          `    ${cColor}${cIcon}${COLORS.reset} ${child.label} (${child.status})`
        );
      }
    }
  }

  return lines.join("\n");
}

export function renderBreadcrumb(tree: ConversationTree): string {
  const active = tree.getActiveTopic();
  const path = tree.getPath(active.id);
  const pathLabels = path
    .filter((n) => n.topicType !== "root")
    .map((n, i, arr) => {
      const color = i === arr.length - 1 ? COLORS.green : COLORS.dim;
      return `${color}${n.label}${COLORS.reset}`;
    });

  return pathLabels.join(` ${COLORS.dim}>${COLORS.reset} `);
}
