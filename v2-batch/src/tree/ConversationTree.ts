import {
  TopicNode,
  TopicStatus,
  TopicType,
  TreeStateSummary,
  SerializedTree,
} from "../types";

export class ConversationTree {
  private nodes: Map<string, TopicNode> = new Map();
  private rootId: string;
  private activeTopicId: string;
  private nextId: number = 1;

  constructor() {
    const rootNode: TopicNode = {
      id: "topic-0",
      label: "Conversation Root",
      summary: "Root of the conversation tree",
      status: "active",
      parentId: null,
      children: [],
      messageIndices: [],
      depth: 0,
      topicType: "root",
      createdAtIndex: 0,
    };
    this.nodes.set(rootNode.id, rootNode);
    this.rootId = rootNode.id;
    this.activeTopicId = rootNode.id;
  }

  private generateId(): string {
    return `topic-${this.nextId++}`;
  }

  getNode(id: string): TopicNode | undefined {
    return this.nodes.get(id);
  }

  getRoot(): TopicNode {
    return this.nodes.get(this.rootId)!;
  }

  getActiveTopic(): TopicNode {
    return this.nodes.get(this.activeTopicId)!;
  }

  getAllNodes(): TopicNode[] {
    return Array.from(this.nodes.values());
  }

  addTopic(
    parentId: string,
    topicType: TopicType,
    label: string,
    summary: string,
    messageIndex: number
  ): TopicNode {
    const parent = this.nodes.get(parentId);
    if (!parent) {
      throw new Error(`Parent topic ${parentId} not found`);
    }

    const id = this.generateId();
    const node: TopicNode = {
      id,
      label,
      summary,
      status: "active",
      parentId,
      children: [],
      messageIndices: [messageIndex],
      depth: parent.depth + 1,
      topicType,
      createdAtIndex: messageIndex,
    };

    this.nodes.set(id, node);
    parent.children.push(id);

    // Pause the previously active topic
    const currentActive = this.nodes.get(this.activeTopicId);
    if (currentActive && currentActive.id !== this.rootId) {
      currentActive.status = "paused";
      currentActive.pausedAtIndex = messageIndex;
    }

    this.activeTopicId = id;
    return node;
  }

  addMessageToActive(messageIndex: number): void {
    const active = this.getActiveTopic();
    if (!active.messageIndices.includes(messageIndex)) {
      active.messageIndices.push(messageIndex);
    }
  }

  updateStatus(topicId: string, status: TopicStatus): void {
    const node = this.nodes.get(topicId);
    if (!node) throw new Error(`Topic ${topicId} not found`);
    node.status = status;
  }

  updateTopicSummary(topicId: string, runningSummary: string): void {
    const node = this.nodes.get(topicId);
    if (!node) throw new Error(`Topic ${topicId} not found`);
    node.runningSummary = runningSummary;
    node.lastSummarizedAt = node.messageIndices.length;
  }

  getMessagesSinceLastSummary(topicId: string): number {
    const node = this.nodes.get(topicId);
    if (!node) return 0;
    return node.messageIndices.length - (node.lastSummarizedAt ?? 0);
  }

  returnToTopic(topicId: string, messageIndex: number): TopicNode {
    const target = this.nodes.get(topicId);
    if (!target) throw new Error(`Topic ${topicId} not found`);

    // Pause the current active topic
    const currentActive = this.getActiveTopic();
    if (currentActive && currentActive.id !== this.rootId) {
      currentActive.status = "paused";
      currentActive.pausedAtIndex = messageIndex;
    }

    // Reactivate the target
    target.status = "active";
    target.pausedAtIndex = undefined;
    target.messageIndices.push(messageIndex);
    this.activeTopicId = topicId;

    return target;
  }

  findTopicByLabel(label: string): TopicNode | undefined {
    const labelLower = label.toLowerCase();
    let bestMatch: TopicNode | undefined;
    let bestScore = 0;

    for (const node of this.nodes.values()) {
      if (node.topicType === "root") continue;

      const nodeLabelLower = node.label.toLowerCase();

      // Exact match
      if (nodeLabelLower === labelLower) return node;

      // Substring match scoring
      const labelWords = labelLower.split(/\s+/);
      const nodeWords = nodeLabelLower.split(/\s+/);

      let matchedWords = 0;
      for (const word of labelWords) {
        if (nodeWords.some((nw) => nw.includes(word) || word.includes(nw))) {
          matchedWords++;
        }
      }

      const score = matchedWords / Math.max(labelWords.length, nodeWords.length);
      if (score > bestScore && score > 0.3) {
        bestScore = score;
        bestMatch = node;
      }
    }

    return bestMatch;
  }

  getPath(topicId: string): TopicNode[] {
    const path: TopicNode[] = [];
    let current = this.nodes.get(topicId);

    while (current) {
      path.unshift(current);
      current = current.parentId
        ? this.nodes.get(current.parentId)
        : undefined;
    }

    return path;
  }

  getPausedTopics(): TopicNode[] {
    return Array.from(this.nodes.values()).filter(
      (n) => n.status === "paused" && n.topicType !== "root"
    );
  }

  getUnfinishedTopics(): TopicNode[] {
    return Array.from(this.nodes.values()).filter(
      (n) =>
        (n.status === "paused" || n.status === "active") &&
        n.topicType !== "root"
    );
  }

  getStateSummary(): TreeStateSummary {
    const active = this.getActiveTopic();
    const path = this.getPath(active.id).map((n) => n.label);

    // Only include the 5 most recently paused topics to keep prompt compact
    const recentPausedTopics = this.getPausedTopics()
      .sort((a, b) => (b.pausedAtIndex ?? 0) - (a.pausedAtIndex ?? 0))
      .slice(0, 5)
      .map((n) => ({
        id: n.id,
        label: n.label,
        summary: n.runningSummary || n.summary,
        runningSummary: n.runningSummary,
        status: n.status,
        depth: n.depth,
        topicType: n.topicType,
      }));

    const totalTopicCount = Array.from(this.nodes.values()).filter(
      (n) => n.topicType !== "root"
    ).length;

    return {
      activeTopicId: active.id,
      activeTopicLabel: active.label,
      activeTopicSummary: active.runningSummary || active.summary,
      activeTopicRunningSummary: active.runningSummary,
      topicPath: path,
      recentPausedTopics,
      totalTopicCount,
    };
  }

  toJSON(): SerializedTree {
    const nodes: Record<string, TopicNode> = {};
    for (const [id, node] of this.nodes) {
      nodes[id] = { ...node };
    }
    return {
      nodes,
      rootId: this.rootId,
      activeTopicId: this.activeTopicId,
    };
  }

  static fromJSON(data: SerializedTree): ConversationTree {
    const tree = new ConversationTree();
    tree.nodes.clear();

    for (const [id, node] of Object.entries(data.nodes)) {
      tree.nodes.set(id, { ...node });
    }

    tree.rootId = data.rootId;
    tree.activeTopicId = data.activeTopicId;

    // Set nextId based on existing node count
    const maxId = Math.max(
      ...Array.from(tree.nodes.keys()).map((id) => {
        const num = parseInt(id.replace("topic-", ""), 10);
        return isNaN(num) ? 0 : num;
      })
    );
    tree.nextId = maxId + 1;

    return tree;
  }
}
