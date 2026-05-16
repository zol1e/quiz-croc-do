import { GenerateContentParameters, GoogleGenAI, Type } from "@google/genai";
import { IQuestionGenerator } from "./question-generator.interface";
import { QuizGenerationConfig } from "./quiz-generation-config";
import { buildQuestionPrompt } from "./prompt";
import { validateGeneratedQuiz } from "./question-validator";
import { mapRawQuizToGeneratedQuiz } from "./mapper";
import { GeneratedQuiz, RawGeneratedQuiz } from "./types";

export class GeminiQuestionGenerator implements IQuestionGenerator {
  private readonly googleGenAi: GoogleGenAI;
  private readonly geminiModel: string;
  private readonly config: QuizGenerationConfig;

  constructor(apiKey: string, geminiModel: string, config: QuizGenerationConfig) {
    this.googleGenAi = new GoogleGenAI({ apiKey });
    this.geminiModel = geminiModel;
    this.config = config;
  }

  public async generateQuestions(topic: string): Promise<GeneratedQuiz> {
    const prompt = buildQuestionPrompt(topic, this.config);
    const resultText = await this.executePrompt(prompt);
    const rawQuiz = JSON.parse(resultText) as RawGeneratedQuiz;
    validateGeneratedQuiz(rawQuiz, this.config);
    return mapRawQuizToGeneratedQuiz(rawQuiz);
  }

  private async executePrompt(prompt: string): Promise<string> {
    const result = await this.googleGenAi.models.generateContent(this.createConfig(prompt));
    return result.text as string;
  }

  private createConfig(contents: string): GenerateContentParameters {
    const schema = {
      type: Type.OBJECT,
      description: "Quiz with name and questions",
      properties: {
        quizName: { type: Type.STRING, description: "Name of the quiz", nullable: false },
        questions: {
          description: "List of questions",
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: {
                type: Type.STRING,
                description: "Question text",
                nullable: false,
              },
              correctAnswer: {
                type: Type.STRING,
                description: "Correct answer",
                nullable: false,
              },
              alternativeAnswers: {
                type: Type.STRING,
                description: "Alternative answers, with correct answer always included, in random order",
                nullable: false,
              },
              sourceUrl: {
                type: Type.STRING,
                description: "The answer is based on this internet page url. Only if valid source url exists.",
                nullable: true,
              },
            },
            required: ["text", "correctAnswer", "alternativeAnswers", "sourceUrl"],
          },
        },
      },
      required: ["quizName", "questions"],
    };

    return {
      model: this.geminiModel,
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      },
    };
  }
}
