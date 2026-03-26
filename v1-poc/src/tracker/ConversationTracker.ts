import { Message, TopicShift } from "../types";
import { ConversationTree } from "../tree/ConversationTree";
import { LLMAnalyzer } from "../analyzer/LLMAnalyzer";
import { chunkMessages } from "../analyzer/chunker";
import { parseConversation } from "../utils/parser";

export class ConversationTracker {
  private tree: ConversationTree;
  private analyzer: LLMAnalyzer;
  private messages: Message[] = [];
  private processedUpTo: number = -1;

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
      Math.min(3, this.messages.length)
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

    // Chunk the remaining messages and analyze
    const windows = chunkMessages(this.messages);

    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];

      onProgress?.(
        "analyzing",
        `Analyzing window ${i + 1}/${windows.length} (messages ${window.messages[0].index}-${window.messages[window.messages.length - 1].index})...`
      );

      // Get current tree state for LLM context
      const treeState = this.tree.getStateSummary();

      // Analyze this chunk
      const shifts = await this.analyzer.analyzeChunk(
        treeState,
        window.overlapMessages,
        window.messages
      );

      // Apply detected shifts
      this.applyShifts(shifts, window.messages);

      // Add all messages in this window to the active topic
      // (messages before the first shift in this window)
      this.assignUnshiftedMessages(window.messages, shifts);
    }

    onProgress?.(
      "complete",
      `Analysis complete. Found ${this.tree.getAllNodes().length - 1} topics.`
    );

    return this.tree;
  }

  private applyShifts(shifts: TopicShift[], windowMessages: Message[]): void {
    // Sort shifts by message index to process in order
    const sorted = [...shifts].sort(
      (a, b) => a.afterMessageIndex - b.afterMessageIndex
    );

    for (const shift of sorted) {
      if (shift.classification === "continue") continue;

      this.applyShift(shift);
    }
  }

  private applyShift(shift: TopicShift): void {
    const active = this.tree.getActiveTopic();
    const root = this.tree.getRoot();
    const messageIndex = shift.afterMessageIndex + 1;

    switch (shift.classification) {
      case "subtopic": {
        // Find the parent - either the explicitly named one or the active topic
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
        // If we can't find the return target, treat as a progression
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
        // Progression is a sibling — find the right parent via sibling_of
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
        .filter((s) => s.classification !== "continue")
        .map((s) => s.afterMessageIndex)
    );

    for (const msg of messages) {
      // Messages that aren't at a shift point belong to the current active topic
      if (!shiftIndices.has(msg.index)) {
        this.tree.addMessageToActive(msg.index);
      }
    }
  }
}
