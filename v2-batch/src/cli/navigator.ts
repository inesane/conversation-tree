import { ConversationTree } from "../tree/ConversationTree";
import { Message } from "../types";

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

export function whereAmI(tree: ConversationTree, messages: Message[]): string {
  const lines: string[] = [];
  const active = tree.getActiveTopic();

  lines.push(
    `${COLORS.bold}${COLORS.cyan}Where Was I?${COLORS.reset}`
  );
  lines.push(`${COLORS.dim}${"─".repeat(50)}${COLORS.reset}`);

  // Current position
  if (active.topicType === "root") {
    lines.push(
      `${COLORS.dim}No topics have been discussed yet.${COLORS.reset}`
    );
    return lines.join("\n");
  }

  lines.push(
    `${COLORS.bold}Currently discussing:${COLORS.reset} ${COLORS.green}${active.label}${COLORS.reset}`
  );
  lines.push(`  ${COLORS.dim}${active.runningSummary || active.summary}${COLORS.reset}`);

  // Breadcrumb path
  const path = tree.getPath(active.id);
  const pathStr = path
    .filter((n) => n.topicType !== "root")
    .map((n) => n.label)
    .join(" > ");
  lines.push(`\n${COLORS.bold}Path:${COLORS.reset} ${COLORS.cyan}${pathStr}${COLORS.reset}`);

  // Last message in active topic
  if (active.messageIndices.length > 0 && messages.length > 0) {
    const lastMsgIdx =
      active.messageIndices[active.messageIndices.length - 1];
    const lastMsg = messages.find((m) => m.index === lastMsgIdx);
    if (lastMsg) {
      lines.push(
        `\n${COLORS.bold}Last message:${COLORS.reset}`
      );
      lines.push(
        `  ${COLORS.dim}[${lastMsgIdx}]${COLORS.reset} ${COLORS.bold}${lastMsg.speaker}:${COLORS.reset} ${lastMsg.text}`
      );
    }
  }

  // Paused topics
  const paused = tree.getPausedTopics();
  if (paused.length > 0) {
    lines.push(
      `\n${COLORS.bold}${COLORS.yellow}Paused topics you might want to return to:${COLORS.reset}`
    );

    // Sort by most recently paused (highest pausedAtIndex)
    const sorted = [...paused].sort(
      (a, b) => (b.pausedAtIndex ?? 0) - (a.pausedAtIndex ?? 0)
    );

    for (const topic of sorted) {
      const pausedAgo =
        topic.pausedAtIndex !== undefined && messages.length > 0
          ? messages.length - 1 - topic.pausedAtIndex
          : "?";

      const topicPath = tree
        .getPath(topic.id)
        .filter((n) => n.topicType !== "root")
        .map((n) => n.label)
        .join(" > ");

      lines.push(
        `  ${COLORS.yellow}◐${COLORS.reset} ${COLORS.bold}${topic.label}${COLORS.reset} ${COLORS.dim}(paused ~${pausedAgo} messages ago)${COLORS.reset}`
      );
      lines.push(`    ${COLORS.dim}Path: ${topicPath}${COLORS.reset}`);
      lines.push(`    ${COLORS.dim}${topic.summary}${COLORS.reset}`);
    }

    // Suggest the most recent paused topic
    const suggestion = sorted[0];
    lines.push(
      `\n${COLORS.bold}${COLORS.magenta}Suggestion:${COLORS.reset} Return to "${suggestion.label}" — it was paused most recently.`
    );
  } else {
    lines.push(
      `\n${COLORS.dim}No paused topics — all threads are resolved or active.${COLORS.reset}`
    );
  }

  return lines.join("\n");
}

export function generateSummary(
  tree: ConversationTree,
  messages: Message[]
): string {
  const lines: string[] = [];
  const allNodes = tree.getAllNodes().filter((n) => n.topicType !== "root");

  lines.push(
    `${COLORS.bold}${COLORS.cyan}Conversation Summary${COLORS.reset}`
  );
  lines.push(`${COLORS.dim}${"─".repeat(50)}${COLORS.reset}`);
  lines.push(`Total messages: ${messages.length}`);
  lines.push(`Topics identified: ${allNodes.length}`);

  // Topic type breakdown
  const typeCounts: Record<string, number> = {};
  for (const node of allNodes) {
    typeCounts[node.topicType] = (typeCounts[node.topicType] || 0) + 1;
  }

  lines.push(`\n${COLORS.bold}Topic breakdown:${COLORS.reset}`);
  for (const [type, count] of Object.entries(typeCounts)) {
    lines.push(`  ${type}: ${count}`);
  }

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  for (const node of allNodes) {
    statusCounts[node.status] = (statusCounts[node.status] || 0) + 1;
  }

  lines.push(`\n${COLORS.bold}Status:${COLORS.reset}`);
  for (const [status, count] of Object.entries(statusCounts)) {
    lines.push(`  ${status}: ${count}`);
  }

  // Topic flow (chronological order)
  const chronological = [...allNodes].sort(
    (a, b) => a.createdAtIndex - b.createdAtIndex
  );

  lines.push(
    `\n${COLORS.bold}Conversation flow:${COLORS.reset}`
  );
  for (let i = 0; i < chronological.length; i++) {
    const node = chronological[i];
    const arrow = i < chronological.length - 1 ? "→" : "●";
    const typeLabel =
      node.topicType === "main_topic" ? "" : ` (${node.topicType})`;
    lines.push(
      `  ${COLORS.dim}${arrow}${COLORS.reset} ${node.label}${COLORS.dim}${typeLabel}${COLORS.reset}`
    );
  }

  // Deepest thread
  const maxDepth = Math.max(...allNodes.map((n) => n.depth));
  const deepest = allNodes.find((n) => n.depth === maxDepth);
  if (deepest) {
    const deepPath = tree
      .getPath(deepest.id)
      .filter((n) => n.topicType !== "root")
      .map((n) => n.label)
      .join(" > ");
    lines.push(
      `\n${COLORS.bold}Deepest thread (depth ${maxDepth}):${COLORS.reset}`
    );
    lines.push(`  ${COLORS.cyan}${deepPath}${COLORS.reset}`);
  }

  return lines.join("\n");
}
