import { GeminiQuestionGenerator } from "./gemini-question-generator";
import { IQuestionGenerator } from "./question-generator.interface";
import { QuizGenerationConfig } from "./quiz-generation-config";
import { OpenRouterQuestionGenerator } from "./openrouter-question-generator";

export function createQuestionGenerator(env: Env, config: QuizGenerationConfig): IQuestionGenerator {
  const provider = (env.QUESTION_GENERATOR_PROVIDER ?? "gemini").toLowerCase();

  if (provider === "gemini") {
    const apiKey = env.GOOGLE_AI_API_KEY ?? (() => { throw new Error("Missing GOOGLE_AI_API_KEY"); })();
    const geminiModel = env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";
    return new GeminiQuestionGenerator(apiKey, geminiModel, config);
  }

  if (provider === "openrouter") {
    const apiKey = env.OPENROUTER_API_KEY ?? (() => { throw new Error("Missing OPENROUTER_API_KEY"); })();
    const model = env.OPENROUTER_MODEL ?? (() => { throw new Error("Missing OPENROUTER_MODEL"); })();
    return new OpenRouterQuestionGenerator(apiKey, model, config);
  }

  throw new Error(`Unsupported QUESTION_GENERATOR_PROVIDER: ${provider}`);
}
