import { Message, ChunkWindow } from "../types";

const DEFAULT_WINDOW_SIZE = 16;
const DEFAULT_OVERLAP = 3;

export function chunkMessages(
  messages: Message[],
  windowSize: number = DEFAULT_WINDOW_SIZE,
  overlap: number = DEFAULT_OVERLAP
): ChunkWindow[] {
  if (messages.length === 0) return [];

  // For short conversations, return a single window with all messages
  if (messages.length <= windowSize) {
    return [
      {
        messages,
        windowIndex: 0,
        overlapMessages: [],
      },
    ];
  }

  const windows: ChunkWindow[] = [];
  let start = 0;
  let windowIndex = 0;

  while (start < messages.length) {
    const end = Math.min(start + windowSize, messages.length);
    const windowMessages = messages.slice(start, end);

    // Get overlap messages from before this window (for context)
    const overlapStart = Math.max(0, start - overlap);
    const overlapMessages =
      start > 0 ? messages.slice(overlapStart, start) : [];

    windows.push({
      messages: windowMessages,
      windowIndex,
      overlapMessages,
    });

    // Advance by (windowSize - overlap) so we get overlapping coverage
    const step = windowSize - overlap;
    start += step;
    windowIndex++;

    // If the remaining messages would be very small, include them in this last window
    if (start < messages.length && messages.length - start < overlap + 1) {
      // Extend the last window to include remaining messages
      const lastWindow = windows[windows.length - 1];
      lastWindow.messages = messages.slice(
        start - step,
        messages.length
      );
      break;
    }
  }

  return windows;
}
