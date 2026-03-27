import { Message, TreeStateSummary } from "../types";

export function buildAnalysisPrompt(
  treeState: TreeStateSummary | null,
  overlapMessages: Message[],
  newMessages: Message[]
): string {
  const treeSection = treeState
    ? buildTreeStateSection(treeState)
    : "No topics have been identified yet. This is the start of the conversation.";

  const overlapSection =
    overlapMessages.length > 0
      ? buildMessagesSection(
          "CONTEXT MESSAGES (from previous window - do NOT re-analyze, for context only)",
          overlapMessages
        )
      : "";

  const newSection = buildMessagesSection(
    "NEW MESSAGES (analyze these for topic shifts)",
    newMessages
  );

  return `You are a conversation analyst identifying MAJOR topic shifts in natural dialogue.

${treeSection}

${overlapSection}

${newSection}

IMPORTANT — BE VERY CONSERVATIVE:
The vast majority of messages (80-90%) in natural conversation are "continue". Only flag a shift when the CORE SUBJECT fundamentally changes. Do NOT create topics for:
- Filler: "yeah", "lol", "oh nice", "right?", "haha", "totally", "wait really?", "hmm"
- Follow-up questions about the same subject
- Elaboration, clarification, or examples within the same subject
- Brief one-off comments that don't change the direction of conversation
- Back-and-forth reactions and acknowledgments
- A single question about a detail (that's still the same topic, not a subtopic)

Only report a shift if you are confident (0.7+). When in doubt, classify as "continue".

CLASSIFICATIONS:

"continue" — Same topic. This is the DEFAULT. Use this for everything that doesn't clearly fit another category.

"subtopic" — The conversation spends MULTIPLE substantial messages drilling into a specific aspect of the current topic. A single question about a detail is NOT a subtopic. Example: spending 5+ messages discussing "budget for the trip" when the main topic is "planning the trip".

"new_topic" — A completely unrelated topic is introduced. Clear break from everything being discussed.

"tangent" — A digression triggered by something in the conversation but NOT serving the current topic. Look for phrases like "that reminds me...", "speaking of...", "oh before I forget...". The key test: would removing this digression lose anything from the main discussion? If no, it's a tangent.

"return" — Someone returns to a previously discussed topic. Look for: "going back to...", "anyway, about the...", "back to...", "so about [old topic]...". ONLY use if the topic appears in the PAUSED TOPICS list above.

"progression" — The topic naturally evolves into a distinct but related subject. This is a SIBLING of the current topic, not a child. Example: "weekend plans" naturally flowing into "work schedule for next week". Use "sibling_of" to indicate which topic this flows from.

RESPONSE FORMAT:
Return ONLY a valid JSON array. Empty array [] if no shifts detected.

For each shift:
{
  "after_message_index": <message index of LAST message BEFORE the shift>,
  "classification": "<continue|subtopic|new_topic|tangent|return|progression>",
  "new_topic_label": "<short 2-5 word label>",
  "new_topic_summary": "<1 sentence summary>",
  "return_target_label": "<for 'return' only: EXACT label from paused topics list>",
  "parent_topic": "<for 'subtopic' only: label of parent topic>",
  "sibling_of": "<for 'progression' only: label of topic this flows from>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<1 sentence explanation>"
}

RULES:
- Prefer fewer, more meaningful topics over many granular ones
- A good conversation tree has 5-15 topics for a 100-message conversation, not 30+
- Use message "index" field values for after_message_index
- Return ONLY the JSON array`;
}

function buildTreeStateSection(state: TreeStateSummary): string {
  if (state.totalTopicCount === 0) {
    return "CURRENT TREE STATE:\nNo topics identified yet.";
  }

  const pathStr = state.topicPath
    .filter((l) => l !== "Conversation Root")
    .join(" > ");

  let section = "";

  // Conversation overview — gives the LLM the big picture
  if (state.conversationSummary) {
    section += `CONVERSATION SO FAR:
${state.conversationSummary}

`;
  }

  // Full tree structure — shows all topics and their relationships
  section += `TOPIC TREE (shows how topics relate — children are subtopics/tangents of their parent):
${state.treeStructure}

CURRENTLY DISCUSSING: "${state.activeTopicLabel}"
Path: ${pathStr}
Summary: ${state.activeTopicRunningSummary || state.activeTopicSummary}`;

  return section;
}

function buildMessagesSection(header: string, messages: Message[]): string {
  const messageLines = messages
    .map((m) => `  [index=${m.index}] ${m.speaker}: ${m.text}`)
    .join("\n");

  return `${header}:
${messageLines}`;
}

export function buildInitialTopicPrompt(messages: Message[]): string {
  const messageLines = messages
    .map((m) => `  [index=${m.index}] ${m.speaker}: ${m.text}`)
    .join("\n");

  return `You are a conversation analyst. Look at the opening of this conversation and identify the main topic being discussed. Choose a broad, encompassing label — not a narrow detail.

MESSAGES:
${messageLines}

Respond with ONLY a valid JSON object:
{
  "topic_label": "<short 2-5 word label — broad enough to cover the opening discussion>",
  "topic_summary": "<1 sentence summary>"
}`;
}

export function buildSummarizationPrompt(
  topicLabel: string,
  existingSummary: string | undefined,
  messages: Message[]
): string {
  const messageLines = messages
    .map((m) => `  ${m.speaker}: ${m.text}`)
    .join("\n");

  const existingSection = existingSummary
    ? `\nEXISTING SUMMARY:\n${existingSummary}\n\nUpdate the summary to incorporate the new messages below. Preserve key points from the existing summary.`
    : `\nCreate an initial summary from the messages below.`;

  return `You are summarizing what was discussed under the topic "${topicLabel}" in a conversation.
${existingSection}

NEW MESSAGES:
${messageLines}

Write a concise 2-4 sentence summary covering:
- What was discussed and any key points raised
- Any decisions made or questions asked
- Any unresolved threads or open items

Respond with ONLY a valid JSON object:
{
  "summary": "<2-4 sentence summary>"
}`;
}

export function buildConversationSummaryPrompt(
  existingSummary: string | undefined,
  treeStructure: string,
  recentMessages: Message[]
): string {
  const msgLines = recentMessages
    .slice(-10)
    .map((m) => `  ${m.speaker}: ${m.text}`)
    .join("\n");

  const existing = existingSummary
    ? `\nEXISTING OVERVIEW:\n${existingSummary}\n\nUpdate this overview to incorporate the latest developments.`
    : `\nCreate an initial overview of the conversation.`;

  return `You are summarizing the overall flow of a conversation. This summary gives context for understanding what the conversation has covered and how topics connect.
${existing}

CURRENT TOPIC TREE:
${treeStructure}

MOST RECENT MESSAGES:
${msgLines}

Write a 2-4 sentence overview that captures:
- The main subjects discussed
- How the conversation flowed between topics
- What the conversation is currently focused on

Respond with ONLY a valid JSON object:
{
  "summary": "<2-4 sentence conversation overview>"
}`;
}
