import { DeepgramClient } from "@deepgram/sdk";

export interface TranscriptResult {
  speaker: number;
  text: string;
  isFinal: boolean;
}

export class Transcriber {
  private client: DeepgramClient;
  private connection: any = null;
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

  async start(): Promise<void> {
    const connection = await this.client.listen.v1.connect({
      model: "nova-2",
      language: "en",
      smart_format: "true",
      diarize: "true",
      punctuate: "true",
      interim_results: "false",
      utterance_end_ms: "1500",
      encoding: "linear16",
      sample_rate: "16000",
      channels: "1",
    } as any);

    this.connection = connection;

    connection.on("open", () => {
      console.log("  Deepgram connection opened");
    });

    connection.on("message", (data: any) => {
      // V1 message events include transcript results
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
    });
  }

  sendAudio(audioData: Buffer): void {
    if (this.connection) {
      this.connection.sendMedia(audioData);
    }
  }

  stop(): void {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }
}
