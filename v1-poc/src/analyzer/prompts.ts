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
          "CONTEXT MESSAGES (from previous analysis window - do NOT re-analyze these, they are for context only)",
          overlapMessages
        )
      : "";

  const newSection = buildMessagesSection(
    "NEW MESSAGES (analyze these for topic shifts)",
    newMessages
  );

  return `You are a conversation analyst. Your task is to identify topic shifts in a conversation and classify how new topics relate to existing ones.

${treeSection}

${overlapSection}

${newSection}

CLASSIFICATION RULES:

"continue" — The conversation stays on the current active topic. Most messages are this. Questions, answers, elaboration, and back-and-forth within the same subject are all "continue". Be conservative — only flag a shift when the subject itself changes.

"subtopic" — A specific aspect of the current topic is being explored in depth. The subtopic is clearly a PART OF the parent. Example: "project timeline" → drilling into "Q3 milestones". The subtopic serves the parent topic's goal.

"new_topic" — An entirely new, unrelated topic. Clean break from what was discussed. Example: "project timeline" → "did anyone see the game?"

"tangent" — A digression triggered by the current topic but NOT serving the parent topic's purpose. The speaker veers off on a side track. Example: "project timeline" → "speaking of deadlines, my kid's school deadline is crazy..." Tangents are usually brief asides that don't advance the main discussion.

"return" — Someone returns to a previously discussed topic that was abandoned or left behind. THIS IS CRITICAL TO DETECT. Look for:
  - Explicit signals: "going back to...", "anyway, about the...", "back to...", "returning to...", "so regarding [old topic]..."
  - Implicit signals: picking up a thread that was clearly dropped earlier, re-raising a topic from the tree state
  - If the tree state shows a PAUSED topic and the conversation picks that same subject back up, this is a "return"
  When you classify as "return", set "return_target_label" to the EXACT label of the matching topic from the tree state.

"progression" — The current topic naturally evolves into a related but distinct peer-level topic. Key: a progression is a SIBLING, not a child. Example: "project timeline" → "resource allocation" (natural meeting flow). Use "sibling_of" to specify which topic this is a peer of.

CRITICAL DISTINCTIONS:
1. subtopic vs tangent: A subtopic SERVES the parent topic (drilling deeper into it). A tangent is a DETOUR that doesn't serve the parent.
2. progression vs return: If the topic was PREVIOUSLY discussed and appears in the tree state, it's a RETURN, not a progression. Progression is for topics that haven't been discussed before.
3. continue vs progression: If the core subject hasn't changed, it's "continue". "Progression" means the subject itself has shifted to a neighboring subject. When in doubt, prefer "continue".
4. Where progressions attach: A progression should be a sibling of the topic it naturally flows from. Use "sibling_of" to indicate which existing topic this is a peer of. This prevents deep nesting.

RESPONSE FORMAT:
Respond with ONLY a valid JSON array. If no topic shifts are detected, return [].

For each shift:
{
  "after_message_index": <message index (from the "index" field) of the LAST message BEFORE the shift>,
  "classification": "<continue|subtopic|new_topic|tangent|return|progression>",
  "new_topic_label": "<short 2-5 word label>",
  "new_topic_summary": "<1 sentence summary>",
  "return_target_label": "<ONLY for 'return': EXACT label of the topic being returned to from the tree state>",
  "parent_topic": "<ONLY for 'subtopic': label of the parent topic>",
  "sibling_of": "<ONLY for 'progression': label of the topic this naturally flows from>",
  "confidence": <0.0 to 1.0>,
  "reasoning": "<1-2 sentence explanation>"
}

RULES:
- Be conservative. Prefer "continue" when borderline.
- Multiple shifts CAN occur within one window.
- Prioritize detecting "return" — missing a return creates incorrect tree nesting.
- Use the message "index" field values for after_message_index.
- Respond with ONLY the JSON array, no other text.`;
}

function buildTreeStateSection(state: TreeStateSummary): string {
  if (state.allTopics.length === 0) {
    return "CURRENT TREE STATE:\nNo topics have been identified yet.";
  }

  const topicLines = state.allTopics
    .map(
      (t) =>
        `  - [${t.status.toUpperCase()}] "${t.label}" (${t.topicType}): ${t.summary}`
    )
    .join("\n");

  const pathStr = state.topicPath.join(" > ");

  return `CURRENT TREE STATE:
Active topic: "${state.activeTopicLabel}" — ${state.activeTopicSummary}
Current path: ${pathStr}

All topics in tree:
${topicLines}`;
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

  return `You are a conversation analyst. Look at the opening of this conversation and identify the initial topic being discussed.

MESSAGES:
${messageLines}

Respond with ONLY a valid JSON object:
{
  "topic_label": "<short 2-5 word label>",
  "topic_summary": "<1 sentence summary>"
}`;
}
