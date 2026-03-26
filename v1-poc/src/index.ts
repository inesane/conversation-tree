import "dotenv/config";
import { runAnalyze, runTree, runWhere, runTopic, runSummary, runView } from "./cli/commands";

const USAGE = `
Conversation Tree — Map conversation topics as a navigable tree

Usage:
  npx ts-node src/index.ts analyze <file>   Analyze a conversation transcript
  npx ts-node src/index.ts view             Open interactive tree visualization
  npx ts-node src/index.ts tree             Display the topic tree (terminal)
  npx ts-node src/index.ts where            Show current position & paused topics
  npx ts-node src/index.ts topic <id|name>  Show details for a specific topic
  npx ts-node src/index.ts summary          Show conversation summary & flow

Examples:
  npx ts-node src/index.ts analyze data/sample-conversation.txt
  npx ts-node src/index.ts tree
  npx ts-node src/index.ts where
  npx ts-node src/index.ts topic "Project Timeline"
  npx ts-node src/index.ts topic topic-1
`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  }

  switch (command) {
    case "analyze": {
      const filePath = args[1];
      if (!filePath) {
        console.error("Error: Please provide a file path.");
        console.log("  Usage: npx ts-node src/index.ts analyze <file>");
        process.exit(1);
      }
      await runAnalyze(filePath);
      break;
    }

    case "view":
      runView();
      break;

    case "tree":
      runTree();
      break;

    case "where":
      runWhere();
      break;

    case "topic": {
      const topicId = args.slice(1).join(" ");
      if (!topicId) {
        console.error("Error: Please provide a topic ID or name.");
        console.log('  Usage: npx ts-node src/index.ts topic <id|name>');
        process.exit(1);
      }
      runTopic(topicId);
      break;
    }

    case "summary":
      runSummary();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.log(USAGE);
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("\nError:", error.message);
  process.exit(1);
});
