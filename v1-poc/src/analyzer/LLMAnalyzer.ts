import Groq from "groq-sdk";
import { Message, TopicShift, TreeStateSummary } from "../types";
import { buildAnalysisPrompt, buildInitialTopicPrompt } from "./prompts";

export class LLMAnalyzer {
  private client: Groq;
  private model: string;

  constructor(model: string = "llama-3.3-70b-versatile") {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GROQ_API_KEY environment variable is required.\nGet a free key at https://console.groq.com/keys"
      );
    }
    this.client = new Groq({ apiKey });
    this.model = model;
  }

  async analyzeChunk(
    treeState: TreeStateSummary | null,
    overlapMessages: Message[],
    newMessages: Message[]
  ): Promise<TopicShift[]> {
    const prompt = buildAnalysisPrompt(treeState, overlapMessages, newMessages);
    const responseText = await this.callLLM(prompt);
    return this.parseShifts(responseText);
  }

  async identifyInitialTopic(
    messages: Message[]
  ): Promise<{ label: string; summary: string }> {
    const prompt = buildInitialTopicPrompt(messages);
    const responseText = await this.callLLM(prompt);

    try {
      const parsed = this.extractJSON(responseText);
      return {
        label: parsed.topic_label || "Opening Topic",
        summary: parsed.topic_summary || "Initial conversation topic",
      };
    } catch {
      return {
        label: "Opening Topic",
        summary: "Initial conversation topic",
      };
    }
  }

  private async callLLM(prompt: string, retries: number = 2): Promise<string> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
          max_tokens: 2048,
        });

        const text = response.choices[0]?.message?.content;
        if (!text) {
          throw new Error("No text in response");
        }

        return text;
      } catch (error: any) {
        if (attempt === retries) {
          throw new Error(
            `LLM API call failed after ${retries + 1} attempts: ${error.message}`
          );
        }
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, attempt))
        );
      }
    }

    throw new Error("Unreachable");
  }

  private parseShifts(responseText: string): TopicShift[] {
    try {
      const parsed = this.extractJSON(responseText);

      if (!Array.isArray(parsed)) {
        if (parsed && typeof parsed === "object" && parsed.classification) {
          return [this.normalizeShift(parsed)];
        }
        return [];
      }

      return parsed
        .filter((item: any) => item && item.classification)
        .map((item: any) => this.normalizeShift(item));
    } catch {
      const cleaned = responseText
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item: any) => item && item.classification)
            .map((item: any) => this.normalizeShift(item));
        }
      } catch {
        console.error(
          "Failed to parse LLM response as JSON:",
          responseText.slice(0, 200)
        );
        return [];
      }

      return [];
    }
  }

  private normalizeShift(item: any): TopicShift {
    return {
      afterMessageIndex: item.after_message_index ?? 0,
      classification: item.classification,
      newTopicLabel: item.new_topic_label || "Unknown Topic",
      newTopicSummary: item.new_topic_summary || "",
      returnTargetLabel: item.return_target_label,
      parentTopic: item.parent_topic,
      siblingOf: item.sibling_of,
      confidence: item.confidence ?? 0.5,
      reasoning: item.reasoning || "",
    };
  }

  private extractJSON(text: string): any {
    const trimmed = text.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      // Ignore
    }

    const jsonArrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
      try {
        return JSON.parse(jsonArrayMatch[0]);
      } catch {
        // Ignore
      }
    }

    const jsonObjMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonObjMatch) {
      try {
        return JSON.parse(jsonObjMatch[0]);
      } catch {
        // Ignore
      }
    }

    const cleaned = trimmed
      .replace(/^```(?:json)?\s*/gm, "")
      .replace(/^```\s*/gm, "")
      .trim();

    return JSON.parse(cleaned);
  }
}
