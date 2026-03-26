import { Message } from "../types";

export interface BufferConfig {
  maxMessages: number;     // Trigger analysis after this many messages
  maxWaitMs: number;       // Trigger analysis after this many ms even if message count not reached
  minMessages: number;     // Don't trigger if fewer than this many messages
}

const DEFAULT_CONFIG: BufferConfig = {
  maxMessages: 12,
  maxWaitMs: 45000,        // 45 seconds
  minMessages: 3,
};

export class MessageBuffer {
  private buffer: Message[] = [];
  private allMessages: Message[] = [];
  private nextIndex: number = 0;
  private timer: NodeJS.Timeout | null = null;
  private config: BufferConfig;
  private onFlush: (messages: Message[], allMessages: Message[]) => void;

  constructor(
    onFlush: (messages: Message[], allMessages: Message[]) => void,
    config?: Partial<BufferConfig>
  ) {
    this.onFlush = onFlush;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addMessage(speaker: string, text: string): Message {
    const msg: Message = {
      id: `msg-${this.nextIndex}`,
      index: this.nextIndex,
      speaker,
      text,
    };

    this.nextIndex++;
    this.buffer.push(msg);
    this.allMessages.push(msg);

    // Start timer on first message in buffer
    if (this.buffer.length === 1) {
      this.startTimer();
    }

    // Flush if we hit the message threshold
    if (this.buffer.length >= this.config.maxMessages) {
      this.flush();
    }

    return msg;
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
  }
}
