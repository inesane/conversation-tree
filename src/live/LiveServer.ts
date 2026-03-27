import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import * as path from "path";
import { ConversationTracker } from "../tracker/ConversationTracker";
import { MessageBuffer } from "./MessageBuffer";
import { Transcriber } from "./Transcriber";
import { Message } from "../types";

export interface LiveServerConfig {
  port: number;
  useDeepgram: boolean;
  allowBrowserAudio: boolean;
}

const DEFAULT_CONFIG: LiveServerConfig = {
  port: 3000,
  useDeepgram: false,
  allowBrowserAudio: false,
};

export class LiveServer {
  private config: LiveServerConfig;
  private tracker: ConversationTracker;
  private buffer: MessageBuffer;
  private transcriber: Transcriber | null = null;
  private clients: Set<WebSocket> = new Set();
  private analyzing: boolean = false;
  private pendingFlush: { messages: Message[]; allMessages: Message[] } | null =
    null;

  constructor(config?: Partial<LiveServerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tracker = new ConversationTracker();

    this.buffer = new MessageBuffer(
      (messages, allMessages) => this.onBufferFlush(messages, allMessages),
      { maxMessages: 12, maxWaitMs: 45000, minMessages: 3 }
    );

    if (this.config.useDeepgram || this.config.allowBrowserAudio) {
      this.initTranscriber();
    }
  }

  async start(): Promise<void> {
    const app = express();
    const server = createServer(app);
    const wss = new WebSocketServer({ server });

    // Serve the live UI
    app.use(express.static(path.join(__dirname, "../../public")));

    app.get("/", (_req, res) => {
      res.sendFile(path.join(__dirname, "../../public/live.html"));
    });

    // WebSocket handling
    wss.on("connection", (ws) => {
      this.clients.add(ws);
      console.log(`  Client connected (${this.clients.size} total)`);

      // Send current state to new client
      const tree = this.tracker.getTree();
      ws.send(
        JSON.stringify({
          type: "tree_update",
          tree: tree.toJSON(),
          messages: this.buffer.getAllMessages(),
          totalMessages: this.buffer.getTotalMessages(),
        })
      );

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleClientMessage(ws, msg);
        } catch {
          // Might be binary audio data
          if (data instanceof Buffer && this.transcriber) {
            this.transcriber.sendAudio(data);
          }
        }
      });

      ws.on("close", () => {
        this.clients.delete(ws);
        console.log(`  Client disconnected (${this.clients.size} total)`);
      });
    });

    // Start Deepgram eagerly for --mic mode
    if (this.config.useDeepgram && this.transcriber) {
      await this.transcriber.start({
        encoding: "linear16",
        sampleRate: 16000,
        channels: 1,
      });
      console.log("  Deepgram transcription ready");
    }

    const mode = this.config.useDeepgram
      ? "Microphone (Deepgram STT)"
      : this.config.allowBrowserAudio
        ? "Text input + Tab Audio Capture (Deepgram STT)"
        : "Text input (type messages in the browser)";

    server.listen(this.config.port, () => {
      console.log(
        `\n  Live server running at http://localhost:${this.config.port}\n`
      );
      console.log(`  Mode: ${mode}`);
      console.log("  Open the URL above in your browser to start\n");
    });
  }

  private initTranscriber(): void {
    this.transcriber = new Transcriber(
      (result) => this.onTranscript(result),
      (error) => this.broadcast({ type: "error", message: error.message })
    );
  }

  private handleClientMessage(ws: WebSocket, msg: any): void {
    switch (msg.type) {
      case "text_message": {
        const { speaker, text } = msg;
        if (speaker && text) {
          const message = this.buffer.addMessage(speaker, text);
          this.broadcast({
            type: "new_message",
            message,
            bufferSize: this.buffer.getBufferSize(),
            totalMessages: this.buffer.getTotalMessages(),
          });
        }
        break;
      }

      case "start_audio": {
        // Browser wants to start sending audio (tab capture or mic)
        if (!this.transcriber) {
          if (!process.env.DEEPGRAM_API_KEY) {
            ws.send(JSON.stringify({
              type: "error",
              message: "DEEPGRAM_API_KEY not set on server. Add it to .env to use audio capture.",
            }));
            break;
          }
          this.initTranscriber();
        }

        const sampleRate = msg.sampleRate || 16000;
        const channels = msg.channels || 1;

        this.transcriber!.start({
          encoding: "linear16",
          sampleRate,
          channels,
        }).then(() => {
          console.log(`  Audio capture started (${sampleRate}Hz, ${channels}ch)`);
          ws.send(JSON.stringify({ type: "audio_ready" }));
        }).catch((err: any) => {
          ws.send(JSON.stringify({
            type: "error",
            message: `Failed to start transcription: ${err.message}`,
          }));
        });
        break;
      }

      case "stop_audio": {
        if (this.transcriber) {
          this.transcriber.stop();
          console.log("  Audio capture stopped");
        }
        break;
      }

      case "audio_data": {
        if (this.transcriber && msg.audio) {
          const audioBuffer = Buffer.from(msg.audio, "base64");
          this.transcriber.sendAudio(audioBuffer);
        }
        break;
      }

      case "set_speaker_name": {
        if (this.transcriber && msg.speakerId !== undefined && msg.name) {
          this.transcriber.setSpeakerName(msg.speakerId, msg.name);
        }
        break;
      }

      case "force_analyze": {
        this.buffer.forceFlush();
        break;
      }
    }
  }

  private onTranscript(result: { speaker: number; text: string }): void {
    const speakerName = this.transcriber
      ? this.transcriber.getSpeakerName(result.speaker)
      : `Speaker ${result.speaker + 1}`;

    const message = this.buffer.addMessage(speakerName, result.text);

    this.broadcast({
      type: "new_message",
      message,
      bufferSize: this.buffer.getBufferSize(),
      totalMessages: this.buffer.getTotalMessages(),
    });
  }

  private async onBufferFlush(
    messages: Message[],
    allMessages: Message[]
  ): Promise<void> {
    // If already analyzing, queue the flush
    if (this.analyzing) {
      this.pendingFlush = { messages, allMessages };
      return;
    }

    this.analyzing = true;

    this.broadcast({
      type: "analyzing",
      messageCount: messages.length,
    });

    try {
      const { tree, changed } = await this.tracker.processNewMessages(
        messages,
        allMessages
      );

      if (changed) {
        this.broadcast({
          type: "tree_update",
          tree: tree.toJSON(),
          messages: allMessages,
          totalMessages: allMessages.length,
        });
      }

      // Check tangent depth and alert
      const active = tree.getActiveTopic();
      if (active.depth >= 3 && active.topicType !== "root") {
        const rootTopic = tree
          .getPath(active.id)
          .find((n) => n.depth === 1);
        this.broadcast({
          type: "tangent_alert",
          currentTopic: active.label,
          depth: active.depth,
          mainTopic: rootTopic?.label || "the main topic",
        });
      }
    } catch (error: any) {
      this.broadcast({
        type: "error",
        message: `Analysis failed: ${error.message}`,
      });
    }

    this.analyzing = false;

    // Process any queued flush
    if (this.pendingFlush) {
      const { messages: pendingMsgs, allMessages: pendingAll } =
        this.pendingFlush;
      this.pendingFlush = null;
      await this.onBufferFlush(pendingMsgs, pendingAll);
    }
  }

  private broadcast(data: any): void {
    const json = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }
}
