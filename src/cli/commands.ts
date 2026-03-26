import * as fs from "fs";
import * as path from "path";
import { ConversationTracker } from "../tracker/ConversationTracker";
import { ConversationTree } from "../tree/ConversationTree";
import { renderTree, renderTopicDetail } from "./renderer";
import { whereAmI, generateSummary } from "./navigator";
import { generateTreeView, openInBrowser } from "./viewer";
import { LiveServer } from "../live/LiveServer";
import { SerializedTree, Message } from "../types";

const VIEW_FILE = path.join(process.cwd(), "output", "tree-view.html");

const STATE_DIR = path.join(process.cwd(), "output");
const TREE_FILE = path.join(STATE_DIR, "tree.json");
const MESSAGES_FILE = path.join(STATE_DIR, "messages.json");

function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function saveState(tree: ConversationTree, messages: Message[]): void {
  ensureStateDir();
  fs.writeFileSync(TREE_FILE, JSON.stringify(tree.toJSON(), null, 2));
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
}

function loadTree(): ConversationTree | null {
  if (!fs.existsSync(TREE_FILE)) return null;
  const data = JSON.parse(fs.readFileSync(TREE_FILE, "utf-8")) as SerializedTree;
  return ConversationTree.fromJSON(data);
}

function loadMessages(): Message[] {
  if (!fs.existsSync(MESSAGES_FILE)) return [];
  return JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf-8")) as Message[];
}

export async function runAnalyze(filePath: string): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  if (!process.env.GROQ_API_KEY) {
    console.error(
      "Error: GROQ_API_KEY environment variable is required.\nGet a free key at https://console.groq.com/keys"
    );
    process.exit(1);
  }

  const text = fs.readFileSync(filePath, "utf-8");
  const tracker = new ConversationTracker();

  console.log("\n🔍 Analyzing conversation...\n");

  const tree = await tracker.processTranscript(text, (stage, detail) => {
    const icon =
      stage === "complete" ? "✅" : stage === "parsing" ? "📝" : "🔄";
    console.log(`  ${icon} ${detail}`);
  });

  // Save state
  saveState(tree, tracker.getMessages());

  // Generate visual tree view
  generateView();

  // Display results
  console.log("\n" + renderTree(tree));
  console.log(
    "\n\nState saved. Run 'view' to open interactive tree, or 'tree', 'where', 'topic <id>', 'summary'."
  );
}

export function runTree(): void {
  const tree = loadTree();
  if (!tree) {
    console.error(
      "No analysis found. Run 'analyze <file>' first."
    );
    process.exit(1);
  }

  console.log("\n" + renderTree(tree));
}

export function runWhere(): void {
  const tree = loadTree();
  const messages = loadMessages();
  if (!tree) {
    console.error(
      "No analysis found. Run 'analyze <file>' first."
    );
    process.exit(1);
  }

  console.log("\n" + whereAmI(tree, messages));
}

export function runTopic(topicId: string): void {
  const tree = loadTree();
  const messages = loadMessages();
  if (!tree) {
    console.error(
      "No analysis found. Run 'analyze <file>' first."
    );
    process.exit(1);
  }

  // Try exact match first, then search by label
  let node = tree.getNode(topicId);
  if (!node) {
    node = tree.findTopicByLabel(topicId);
  }

  if (!node) {
    console.error(`Topic not found: "${topicId}"`);
    console.log("\nAvailable topics:");
    for (const n of tree.getAllNodes()) {
      if (n.topicType !== "root") {
        console.log(`  ${n.id}: ${n.label}`);
      }
    }
    process.exit(1);
  }

  console.log("\n" + renderTopicDetail(tree, node, messages));
}

function generateView(): void {
  ensureStateDir();
  const treeJson = fs.readFileSync(TREE_FILE, "utf-8");
  const messagesJson = fs.readFileSync(MESSAGES_FILE, "utf-8");
  const html = generateTreeView(treeJson, messagesJson);
  fs.writeFileSync(VIEW_FILE, html);
}

export function runView(): void {
  if (!fs.existsSync(TREE_FILE)) {
    console.error("No analysis found. Run 'analyze <file>' first.");
    process.exit(1);
  }

  generateView();
  console.log(`\nOpening tree view: ${VIEW_FILE}`);
  openInBrowser(VIEW_FILE);
}

export async function runLive(useDeepgram: boolean = false): Promise<void> {
  if (!process.env.GROQ_API_KEY) {
    console.error(
      "Error: GROQ_API_KEY environment variable is required.\nGet a free key at https://console.groq.com/keys"
    );
    process.exit(1);
  }

  if (useDeepgram && !process.env.DEEPGRAM_API_KEY) {
    console.error(
      "Error: DEEPGRAM_API_KEY environment variable is required for microphone mode.\nGet a free key at https://console.deepgram.com\n\nOr run without --mic to use text input mode."
    );
    process.exit(1);
  }

  console.log("\n🎙️  Starting Conversation Tree — Live Mode\n");

  const server = new LiveServer({
    port: parseInt(process.env.PORT || "3000", 10),
    useDeepgram,
  });

  await server.start();

  // Open browser
  const url = `http://localhost:${process.env.PORT || "3000"}`;
  openInBrowser(url);
}

export function runSummary(): void {
  const tree = loadTree();
  const messages = loadMessages();
  if (!tree) {
    console.error(
      "No analysis found. Run 'analyze <file>' first."
    );
    process.exit(1);
  }

  console.log("\n" + generateSummary(tree, messages));
}
