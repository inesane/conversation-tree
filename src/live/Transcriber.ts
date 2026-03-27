import { DeepgramClient } from "@deepgram/sdk";

export interface TranscriptResult {
  speaker: number;
  text: string;
  isFinal: boolean;
}

export class Transcriber {
  private client: DeepgramClient;
  private connection: any = null;
  private ready: boolean = false;
  private audioQueue: Buffer[] = [];
  private onTranscript: (result: TranscriptResult) => void;
  private onError: (error: Error) => void;
  private speakerNames: Map<number, string> = new Map();

  constructor(
    onTranscript: (result: TranscriptResult) => void,
    onError: (error: Error) => void
  ) {
    const apiKey = process.env.DEEPGRAM_API_KEY;
    if (!apiKey) {
      throw new Error(
        "DEEPGRAM_API_KEY environment variable is required for live mode.\nGet a free key at https://console.deepgram.com"
      );
    }
    this.client = new DeepgramClient(apiKey as any);
    this.onTranscript = onTranscript;
    this.onError = onError;
  }

  setSpeakerName(speakerId: number, name: string): void {
    this.speakerNames.set(speakerId, name);
  }

  getSpeakerName(speakerId: number): string {
    return this.speakerNames.get(speakerId) || `Speaker ${speakerId + 1}`;
  }

  async start(audioConfig?: {
    encoding?: string;
    sampleRate?: number;
    channels?: number;
  }): Promise<void> {
    const config: Record<string, string> = {
      model: "nova-2",
      smart_format: "true",
      diarize: "true",
      punctuate: "true",
    };

    // Set audio format if provided (required for raw PCM streams)
    if (audioConfig?.encoding) {
      config.encoding = audioConfig.encoding;
    }
    if (audioConfig?.sampleRate) {
      config.sample_rate = String(audioConfig.sampleRate);
    }
    if (audioConfig?.channels) {
      config.channels = String(audioConfig.channels);
    }

    const connection = await this.client.listen.v1.connect(config as any);

    this.connection = connection;

    connection.on("message", (data: any) => {
      if (!data || !data.channel) return;

      const transcript = data.channel?.alternatives?.[0];
      if (!transcript || !transcript.transcript) return;

      const text = transcript.transcript.trim();
      if (!text) return;

      const speakerId = transcript.words?.[0]?.speaker ?? 0;

      this.onTranscript({
        speaker: speakerId,
        text,
        isFinal: data.is_final ?? true,
      });
    });

    connection.on("error", (error: any) => {
      this.onError(new Error(`Deepgram error: ${error.message || error}`));
    });

    connection.on("close", () => {
      console.log("  Deepgram connection closed");
      this.ready = false;
    });

    // Connect and wait for open via callback
    await new Promise<void>((resolve) => {
      connection.on("open", () => {
        console.log("  Deepgram connection opened");
        this.ready = true;

        // Flush queued audio
        for (const chunk of this.audioQueue) {
          this.connection.sendMedia(chunk);
        }
        this.audioQueue = [];
        resolve();
      });
      connection.connect();
    });
  }

  sendAudio(audioData: Buffer): void {
    if (!this.connection) return;

    if (!this.ready) {
      // Queue audio until connection is ready
      this.audioQueue.push(audioData);
      return;
    }

    try {
      this.connection.sendMedia(audioData);
    } catch (err: any) {
      // Socket may have closed — queue it
      this.ready = false;
      this.audioQueue.push(audioData);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  stop(): void {
    if (this.connection) {
      this.ready = false;
      this.connection.close();
      this.connection = null;
    }
  }
}
