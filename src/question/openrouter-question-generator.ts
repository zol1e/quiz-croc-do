import { OpenRouter } from "@openrouter/sdk";
import { IQuestionGenerator } from "./question-generator.interface";
import { QuizGenerationConfig } from "./quiz-generation-config";
import { buildQuestionPrompt } from "./prompt";
import { validateGeneratedQuiz } from "./question-validator";
import { mapRawQuizToGeneratedQuiz } from "./mapper";
import { GeneratedQuiz, RawGeneratedQuiz } from "./types";

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter((part) => part.length > 0);
    return textParts.join("\n");
  }

  return "";
}

function parseJsonFromModelOutput(output: string): RawGeneratedQuiz {
  const trimmed = output.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch ? fencedMatch[1] : trimmed;
  return JSON.parse(candidate) as RawGeneratedQuiz;
}

function normalizeAlternativeAnswers(rawQuiz: RawGeneratedQuiz): RawGeneratedQuiz {
  return {
    quizName: rawQuiz.quizName,
    questions: rawQuiz.questions.map((q) => {
      if (Array.isArray(q.alternativeAnswers)) {
        return {
          ...q,
          alternativeAnswers: q.alternativeAnswers.map((v) => String(v).trim()).join(";"),
        };
      }
      return q;
    }),
  };
}

export class OpenRouterQuestionGenerator implements IQuestionGenerator {
  private readonly client: OpenRouter;
  private readonly model: string;
  private readonly config: QuizGenerationConfig;

  constructor(apiKey: string, model: string, config: QuizGenerationConfig) {
    this.client = new OpenRouter({ apiKey });
    this.model = model;
    this.config = config;
  }

  public async generateQuestions(topic: string): Promise<GeneratedQuiz> {
    const prompt = buildQuestionPrompt(topic, this.config);

    const response = await this.client.chat.send({
      chatRequest: {
        model: this.model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You generate quiz JSON only. Return only valid JSON without markdown or extra commentary.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      },
    });

    const firstChoice = response.choices?.[0];
    const messageContent = extractTextContent(firstChoice?.message?.content);
    if (!messageContent) {
      throw new Error("OpenRouter returned empty response content");
    }

    const rawQuiz = normalizeAlternativeAnswers(parseJsonFromModelOutput(messageContent));
    validateGeneratedQuiz(rawQuiz, this.config);
    return mapRawQuizToGeneratedQuiz(rawQuiz);
  }
}
