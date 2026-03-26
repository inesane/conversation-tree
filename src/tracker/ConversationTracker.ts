import { Message, TopicShift } from "../types";
import { ConversationTree } from "../tree/ConversationTree";
import { LLMAnalyzer } from "../analyzer/LLMAnalyzer";
import { chunkMessages } from "../analyzer/chunker";
import { parseConversation } from "../utils/parser";

const CONFIDENCE_THRESHOLD = 0.7;
const SUMMARIZE_EVERY_N_MESSAGES = 8;

export class ConversationTracker {
  private tree: ConversationTree;
  private analyzer: LLMAnalyzer;
  private messages: Message[] = [];
  private initialized: boolean = false;

  constructor(model?: string) {
    this.tree = new ConversationTree();
    this.analyzer = new LLMAnalyzer(model);
  }

  getTree(): ConversationTree {
    return this.tree;
  }

  getMessages(): Message[] {
    return this.messages;
  }

  async processTranscript(
    text: string,
    onProgress?: (stage: string, detail: string) => void
  ): Promise<ConversationTree> {
    this.messages = parseConversation(text);

    if (this.messages.length === 0) {
      throw new Error("No messages found in transcript");
    }

    onProgress?.("parsing", `Parsed ${this.messages.length} messages`);

    // Identify the initial topic from the first few messages
    const initialMessages = this.messages.slice(
      0,
      Math.min(4, this.messages.length)
    );
    onProgress?.("analyzing", "Identifying initial topic...");

    const initialTopic =
      await this.analyzer.identifyInitialTopic(initialMessages);

    // Create the first real topic node under root
    const rootId = this.tree.getRoot().id;
    this.tree.addTopic(
      rootId,
      "main_topic",
      initialTopic.label,
      initialTopic.summary,
      0
    );

    // Mark first few messages as belonging to initial topic
    for (const msg of initialMessages) {
      this.tree.addMessageToActive(msg.index);
    }

    // Chunk and analyze
    const windows = chunkMessages(this.messages);

    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];

      onProgress?.(
        "analyzing",
        `Analyzing window ${i + 1}/${windows.length} (messages ${window.messages[0].index}-${window.messages[window.messages.length - 1].index})...`
      );

      // Get compressed tree state for LLM context
      const treeState = this.tree.getStateSummary();

      // Analyze this chunk
      const shifts = await this.analyzer.analyzeChunk(
        treeState,
        window.overlapMessages,
        window.messages
      );

      // Apply shifts (with confidence filtering)
      this.applyShifts(shifts);

      // Assign unshifted messages to active topic
      this.assignUnshiftedMessages(window.messages, shifts);

      // Periodically summarize the active topic
      await this.maybeSummarize(i === windows.length - 1, onProgress);
    }

    // Final summarization pass for all topics that have messages but no summary
    await this.finalSummarize(onProgress);

    onProgress?.(
      "complete",
      `Analysis complete. Found ${this.tree.getAllNodes().length - 1} topics.`
    );

    return this.tree;
  }

  private applyShifts(shifts: TopicShift[]): void {
    const sorted = [...shifts]
      .filter(
        (s) =>
          s.classification !== "continue" &&
          s.confidence >= CONFIDENCE_THRESHOLD
      )
      .sort((a, b) => a.afterMessageIndex - b.afterMessageIndex);

    for (const shift of sorted) {
      this.applyShift(shift);
    }
  }

  private applyShift(shift: TopicShift): void {
    const active = this.tree.getActiveTopic();
    const root = this.tree.getRoot();
    const messageIndex = shift.afterMessageIndex + 1;

    switch (shift.classification) {
      case "subtopic": {
        let parentId = active.id;
        if (shift.parentTopic) {
          const parent = this.tree.findTopicByLabel(shift.parentTopic);
          if (parent) parentId = parent.id;
        }

        this.tree.addTopic(
          parentId,
          "subtopic",
          shift.newTopicLabel,
          shift.newTopicSummary,
          messageIndex
        );
        break;
      }

      case "new_topic": {
        this.tree.addTopic(
          root.id,
          "main_topic",
          shift.newTopicLabel,
          shift.newTopicSummary,
          messageIndex
        );
        break;
      }

      case "tangent": {
        this.tree.addTopic(
          active.id,
          "tangent",
          shift.newTopicLabel,
          shift.newTopicSummary,
          messageIndex
        );
        break;
      }

      case "return": {
        if (shift.returnTargetLabel) {
          const target = this.tree.findTopicByLabel(shift.returnTargetLabel);
          if (target) {
            this.tree.returnToTopic(target.id, messageIndex);
            break;
          }
        }
        // Fallback: treat as progression
        this.tree.addTopic(
          active.parentId || root.id,
          "progression",
          shift.newTopicLabel,
          shift.newTopicSummary,
          messageIndex
        );
        break;
      }

      case "progression": {
        let parentId = active.parentId || root.id;
        if (shift.siblingOf) {
          const sibling = this.tree.findTopicByLabel(shift.siblingOf);
          if (sibling && sibling.parentId) {
            parentId = sibling.parentId;
          }
        }
        this.tree.addTopic(
          parentId,
          "progression",
          shift.newTopicLabel,
          shift.newTopicSummary,
          messageIndex
        );
        break;
      }
    }
  }

  private assignUnshiftedMessages(
    messages: Message[],
    shifts: TopicShift[]
  ): void {
    const shiftIndices = new Set(
      shifts
        .filter(
          (s) =>
            s.classification !== "continue" &&
            s.confidence >= CONFIDENCE_THRESHOLD
        )
        .map((s) => s.afterMessageIndex)
    );

    for (const msg of messages) {
      if (!shiftIndices.has(msg.index)) {
        this.tree.addMessageToActive(msg.index);
      }
    }
  }

  private async maybeSummarize(
    isLastWindow: boolean,
    onProgress?: (stage: string, detail: string) => void
  ): Promise<void> {
    const active = this.tree.getActiveTopic();
    const messagesSinceSummary =
      this.tree.getMessagesSinceLastSummary(active.id);

    if (messagesSinceSummary >= SUMMARIZE_EVERY_N_MESSAGES || isLastWindow) {
      await this.summarizeTopic(active.id, onProgress);
    }
  }

  private async finalSummarize(
    onProgress?: (stage: string, detail: string) => void
  ): Promise<void> {
    const allNodes = this.tree
      .getAllNodes()
      .filter((n) => n.topicType !== "root" && !n.runningSummary);

    for (const node of allNodes) {
      if (node.messageIndices.length > 0) {
        await this.summarizeTopic(node.id, onProgress);
      }
    }
  }

  private async summarizeTopic(
    topicId: string,
    onProgress?: (stage: string, detail: string) => void
  ): Promise<void> {
    const node = this.tree.getNode(topicId);
    if (!node) return;

    const topicMessages = node.messageIndices
      .sort((a, b) => a - b)
      .map((idx) => this.messages.find((m) => m.index === idx))
      .filter((m): m is Message => m !== undefined);

    if (topicMessages.length === 0) return;

    onProgress?.(
      "summarizing",
      `Summarizing "${node.label}" (${topicMessages.length} messages)...`
    );

    const summary = await this.analyzer.summarizeTopic(
      node.label,
      node.runningSummary,
      topicMessages
    );

    if (summary) {
      this.tree.updateTopicSummary(topicId, summary);
    }
  }

  // --- Incremental / live mode ---

  async processNewMessages(
    newMessages: Message[],
    allMessages: Message[]
  ): Promise<{ tree: ConversationTree; changed: boolean }> {
    this.messages = allMessages;

    if (newMessages.length === 0) {
      return { tree: this.tree, changed: false };
    }

    // First batch: identify initial topic
    if (!this.initialized) {
      this.initialized = true;

      const initialTopic = await this.analyzer.identifyInitialTopic(
        newMessages.slice(0, Math.min(4, newMessages.length))
      );

      const rootId = this.tree.getRoot().id;
      this.tree.addTopic(
        rootId,
        "main_topic",
        initialTopic.label,
        initialTopic.summary,
        newMessages[0].index
      );

      for (const msg of newMessages) {
        this.tree.addMessageToActive(msg.index);
      }

      // Summarize initial topic
      await this.summarizeTopic(this.tree.getActiveTopic().id);

      return { tree: this.tree, changed: true };
    }

    // Get context: last 3 messages before this batch
    const firstNewIndex = newMessages[0].index;
    const overlapMessages = allMessages
      .filter((m) => m.index < firstNewIndex)
      .slice(-3);

    // Analyze
    const treeState = this.tree.getStateSummary();
    const shifts = await this.analyzer.analyzeChunk(
      treeState,
      overlapMessages,
      newMessages
    );

    // Apply
    this.applyShifts(shifts);
    this.assignUnshiftedMessages(newMessages, shifts);

    // Summarize if needed
    const active = this.tree.getActiveTopic();
    const msgsSinceSummary = this.tree.getMessagesSinceLastSummary(active.id);
    if (msgsSinceSummary >= SUMMARIZE_EVERY_N_MESSAGES) {
      await this.summarizeTopic(active.id);
    }

    return { tree: this.tree, changed: true };
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
