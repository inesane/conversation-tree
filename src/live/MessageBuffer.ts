import { Message } from "../types";

export interface BufferConfig {
  maxMessages: number;     // Trigger analysis after this many messages
  maxWaitMs: number;       // Trigger analysis after this many ms even if message count not reached
  minMessages: number;     // Don't trigger if fewer than this many messages
  mergePauseMs: number;    // Merge fragments from same speaker within this window
}

const DEFAULT_CONFIG: BufferConfig = {
  maxMessages: 12,
  maxWaitMs: 45000,        // 45 seconds
  minMessages: 3,
  mergePauseMs: 2000,      // 2 seconds — fragments within 2s from same speaker get merged
};

export class MessageBuffer {
  private buffer: Message[] = [];
  private allMessages: Message[] = [];
  private nextIndex: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private mergeTimer: NodeJS.Timeout | null = null;
  private lastSpeaker: string | null = null;
  private lastMessageTime: number = 0;
  private config: BufferConfig;
  private onFlush: (messages: Message[], allMessages: Message[]) => void;
  private onMessageUpdate?: (message: Message, isNew: boolean) => void;

  constructor(
    onFlush: (messages: Message[], allMessages: Message[]) => void,
    config?: Partial<BufferConfig>,
    onMessageUpdate?: (message: Message, isNew: boolean) => void
  ) {
    this.onFlush = onFlush;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onMessageUpdate = onMessageUpdate;
  }

  addMessage(speaker: string, text: string): Message {
    const now = Date.now();
    const timeSinceLast = now - this.lastMessageTime;
    this.lastMessageTime = now;

    // Merge with previous message if same speaker and within the merge window
    if (
      this.lastSpeaker === speaker &&
      timeSinceLast < this.config.mergePauseMs &&
      this.allMessages.length > 0
    ) {
      const lastMsg = this.allMessages[this.allMessages.length - 1];
      lastMsg.text = lastMsg.text + " " + text;

      // Also update in buffer if it's still there
      const inBuffer = this.buffer.find((m) => m.id === lastMsg.id);
      if (inBuffer) {
        inBuffer.text = lastMsg.text;
      }

      this.onMessageUpdate?.(lastMsg, false);
      this.resetMergeTimer();
      return lastMsg;
    }

    // New message (different speaker or pause exceeded)
    const msg: Message = {
      id: `msg-${this.nextIndex}`,
      index: this.nextIndex,
      speaker,
      text,
    };

    this.nextIndex++;
    this.buffer.push(msg);
    this.allMessages.push(msg);
    this.lastSpeaker = speaker;

    this.onMessageUpdate?.(msg, true);

    // Start analysis timer on first message in buffer
    if (this.buffer.length === 1) {
      this.startTimer();
    }

    // Flush if we hit the message threshold
    if (this.buffer.length >= this.config.maxMessages) {
      this.flush();
    }

    this.resetMergeTimer();
    return msg;
  }

  private resetMergeTimer(): void {
    if (this.mergeTimer) clearTimeout(this.mergeTimer);
    // After merge window expires, force next fragment to be a new message
    this.mergeTimer = setTimeout(() => {
      this.lastSpeaker = null;
    }, this.config.mergePauseMs);
  }

  flush(): void {
    this.clearTimer();

    if (this.buffer.length < this.config.minMessages) {
      return;
    }

    const messages = [...this.buffer];
    this.buffer = [];
    this.onFlush(messages, this.allMessages);
  }

  forceFlush(): void {
    this.clearTimer();
    if (this.buffer.length > 0) {
      const messages = [...this.buffer];
      this.buffer = [];
      this.onFlush(messages, this.allMessages);
    }
  }

  getBufferSize(): number {
    return this.buffer.length;
  }

  getTotalMessages(): number {
    return this.allMessages.length;
  }

  getAllMessages(): Message[] {
    return this.allMessages;
  }

  private startTimer(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (this.buffer.length >= this.config.minMessages) {
        this.flush();
      }
    }, this.config.maxWaitMs);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy(): void {
    this.clearTimer();
    if (this.mergeTimer) clearTimeout(this.mergeTimer);
  }
}
