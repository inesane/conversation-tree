# Conversation Tree

A tool that analyzes conversations and maps out topics as a navigable tree. It detects when topics shift, branch into subtopics, go off on tangents, and return to previous threads — giving you a visual map of how a conversation actually flowed.

The core problem: in any conversation longer than a few minutes, people go on tangents and forget what they were originally talking about. This tool tracks all of that, shows you what threads you dropped, and tells you where to pick back up.

It works on conversations of any length — from a quick 5-minute chat to a 15+ minute group discussion. A 200-message conversation processes in under a minute.

## How It Works

1. Feed it a conversation transcript (text format)
2. The conversation is chunked into 16-message sliding windows
3. Each window is sent to an LLM (Llama 3.3 70B via Groq, free) along with a compressed snapshot of the current topic tree
4. The LLM classifies whether each chunk continues the current topic, branches into a subtopic, goes on a tangent, or returns to a previous thread
5. Only high-confidence shifts (0.7+) are applied — filler, back-and-forth, and minor pivots are ignored
6. Each topic gets a running summary that captures key points, decisions, and open items
7. The result is an interactive tree you can explore in the browser or terminal

### Handling Long Conversations

The tool is designed for real, natural conversations — not just short demos:

- **Compressed tree state** — the LLM only sees the active topic, its ancestors, and the 5 most recently paused topics. The prompt stays compact no matter how big the tree grows
- **Conservative classification** — 80-90% of messages are classified as "continue". Only major topic shifts create new nodes, not every slight pivot
- **Running summaries** — every ~8 messages, the active topic gets a 2-4 sentence summary. These summaries are used in the tree state sent to the LLM, so it understands what each topic covered without seeing every message
- **Rate limiting** — built-in throttling (2.2s between calls) keeps usage under Groq's free tier limits

### Topic Classifications

- **Subtopic** — drilling deeper into the current topic over multiple messages. "Planning the Japan trip" -> spending 5+ messages on "the budget specifically"
- **Tangent** — a digression triggered by association. "That reminds me..." or "Speaking of..." — something that doesn't serve the main discussion
- **Progression** — the topic naturally evolves into a related but distinct subject. A sibling, not a child
- **New topic** — a clean break, unrelated to anything being discussed
- **Return** — going back to a previously discussed topic. "Anyway, back to..."

### Topic Statuses

- **Active** — the topic currently being discussed (only one at a time)
- **Paused** — was being discussed but the conversation moved away. These are the threads you dropped and might want to return to
- **Completed** — topic was fully resolved (future feature)
- **Abandoned** — topic was intentionally dropped (future feature)

## Example

An 83-message conversation between three friends (Jake, Mia, Sam) planning their weekend. The conversation naturally drifts through tangents — a birthday party, a Netflix show, job talk, running into an old professor — before returning to finalize plans:

```
[Jake]: Hey what are you guys up to this weekend?
...
[Sam]: Oh that reminds me — did you guys hear about Danny's birthday next weekend?
...
[Jake]: Oh speaking of Japanese stuff, have you guys watched that new show on Netflix?
...
[Sam]: Oh right how's the new job going?
...
[Sam]: I ran into professor Chen at the grocery store yesterday
...
[Sam]: Anyway what were we talking about? Oh right the weekend
...
[Mia]: Saturday farmer's market and brunch, Sunday movie night. This is shaping up to be a great weekend
```

The tool produces:

```
├─ ◐ Weekend Plans (19 msgs)
│  ├─ ◐ [tangent] Danny's Birthday (15 msgs)
│  │  └─ ◐ [tangent] Japanese Netflix Show (15 msgs)
│  │     └─ ◐ [tangent] New Job (15 msgs)
│  │        └─ ◐ [tangent] Professor Chen (15 msgs)
│  └─ ◐ [tangent] Sunday Movie Nights (1 msg)
└─ ● [→] Weekend Schedule (16 msgs)
```

Each node has a running summary. For example, "Danny's Birthday" captured: *they're planning a group gift (cooking class experience, ~$60-80/person), Sam is booking it (Italian or Japanese), and the party is the 15th at Danny's place.*

And an interactive web view (click nodes for details, scroll to zoom, drag to pan):

![Tree View](https://github.com/user-attachments/assets/placeholder)

### Try it without an API key

A pre-generated example is included. Open `examples/tree-view.html` in your browser to see the interactive tree — no setup required.

Sample conversations are in `data/`:
- `long-friends-conversation.txt` — 83 messages, friends planning a weekend (recommended)
- `friends-conversation.txt` — 27 messages, shorter conversation about a Japan trip

## Setup

### Prerequisites

- Node.js 18+
- A free Groq API key (no credit card needed)

### Install

```bash
git clone <repo-url>
cd conversation-tree
npm install
```

### Get a Groq API Key (free)

1. Go to [console.groq.com](https://console.groq.com)
2. Sign in with Google or GitHub
3. Go to **API Keys** and create one

### Configure

Create a `.env` file in the project root:

```
GROQ_API_KEY=your-key-here
```

## Usage

### Analyze a conversation

```bash
npx ts-node src/index.ts analyze data/long-friends-conversation.txt
```

Parses the transcript, runs LLM analysis, generates topic summaries, and produces an interactive HTML tree view.

### Open the interactive tree view

```bash
npx ts-node src/index.ts view
```

Opens `output/tree-view.html` in your browser. Click any node to see its summary and messages. Scroll to zoom, drag to pan.

### Terminal commands

```bash
# Show the topic tree in the terminal
npx ts-node src/index.ts tree

# "Where was I?" — shows current topic, paused threads, and what to return to
npx ts-node src/index.ts where

# Show details for a specific topic (by name or ID)
npx ts-node src/index.ts topic "Weekend Plans"
npx ts-node src/index.ts topic topic-1

# Show conversation summary and flow
npx ts-node src/index.ts summary
```

### Conversation format

Plain text, one message per line:

```
[Speaker]: Message text here
Speaker: Message text here
```

Both bracket and non-bracket speaker formats are supported.

## Project Structure

```
src/
├── index.ts                    # CLI entry point
├── types.ts                    # Type definitions
├── tree/
│   └── ConversationTree.ts     # Tree data structure + compressed state
├── analyzer/
│   ├── LLMAnalyzer.ts          # Groq API integration + rate limiting
│   ├── prompts.ts              # Classification + summarization prompts
│   └── chunker.ts              # Sliding window chunker
├── tracker/
│   └── ConversationTracker.ts  # Pipeline orchestrator
├── cli/
│   ├── commands.ts             # CLI command routing
│   ├── renderer.ts             # Terminal tree rendering
│   ├── navigator.ts            # "Where was I?" logic
│   └── viewer.ts               # Interactive HTML tree generator
└── utils/
    └── parser.ts               # Conversation text parser

data/                           # Sample conversations
examples/                       # Pre-generated tree view (no API key needed)
v1-poc/                         # Original proof of concept implementation
output/                         # Generated output (gitignored)
```

## Performance

| Conversation length | Messages | API calls | Processing time |
|---|---|---|---|
| Short (2-3 min) | ~30 | ~5 | ~12s |
| Medium (5-10 min) | ~80 | ~15 | ~35s |
| Long (15+ min) | ~200 | ~25 | ~60s |

Processing time includes rate limiting delays (2.2s between API calls). Actual LLM inference on Groq is fast (<1s per call).

## Future Ideas

- **Speech-to-text pipeline** — connect Whisper or similar to transcribe audio directly into the tool, removing the need for a pre-existing transcript
- **Live conversation tracking** — process messages incrementally as they come in, updating the tree in real-time instead of analyzing a full transcript after the fact
- **Completed/abandoned detection** — have the LLM judge when a topic has been fully resolved vs just dropped, for more accurate status tracking
- **Better return detection** — a dedicated second-pass analysis to catch implicit returns that the single-pass approach misses
- **Conversation replay** — step through the conversation message by message and watch the tree build up in the web UI
- **Multi-conversation memory** — track topics across multiple conversations over days/weeks. "We talked about X last Tuesday but never resolved it"
- **Collaborative mode** — multiple people in a meeting see the live tree and can manually mark topics as completed or flag things to return to
- **Topic depth alerts** — warn when the conversation has gone 3+ levels deep in tangents, nudging people to return to the main thread
- **Slack/Discord integration** — analyze channel conversations or threads directly
- **Export formats** — export the tree as markdown, Mermaid diagram, or Obsidian-compatible notes
- **Swappable LLM backend** — support Anthropic, OpenAI, Gemini, or local models via Ollama as alternatives to Groq
