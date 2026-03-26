import { Message } from "../types";

/**
 * Parses conversation text in the format:
 *   [Speaker]: Message text here
 *   Speaker: Message text here
 *
 * Also handles multi-line messages (continuation lines without a speaker prefix).
 */
export function parseConversation(text: string): Message[] {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const messages: Message[] = [];

  const speakerPattern = /^\[?([A-Za-z][A-Za-z0-9_ ]*?)\]?\s*:\s*(.+)$/;

  let currentSpeaker: string | null = null;
  let currentText: string = "";
  let messageStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(speakerPattern);

    if (match) {
      // Save previous message if exists
      if (currentSpeaker !== null && currentText.length > 0) {
        messages.push({
          id: `msg-${messages.length}`,
          index: messages.length,
          speaker: currentSpeaker,
          text: currentText.trim(),
        });
      }

      currentSpeaker = match[1].trim();
      currentText = match[2].trim();
      messageStartLine = i;
    } else if (currentSpeaker !== null) {
      // Continuation of previous message
      currentText += " " + line;
    }
  }

  // Don't forget the last message
  if (currentSpeaker !== null && currentText.length > 0) {
    messages.push({
      id: `msg-${messages.length}`,
      index: messages.length,
      speaker: currentSpeaker,
      text: currentText.trim(),
    });
  }

  return messages;
}
