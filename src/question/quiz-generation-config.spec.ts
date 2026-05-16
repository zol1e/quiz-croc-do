import { describe, expect, it } from "@jest/globals";
import {
  createQuizGenerationConfigFromEnv,
  DEFAULT_QUIZ_GENERATION_CONFIG,
  validateQuizGenerationConfig,
} from "./quiz-generation-config";

describe("quiz generation config", () => {
  it("keeps defaults when env overrides are missing", () => {
    const env = {} as Env;
    const config = createQuizGenerationConfigFromEnv(env);
    expect(config).toEqual(DEFAULT_QUIZ_GENERATION_CONFIG);
  });

  it("applies env overrides", () => {
    const env = {
      QUIZ_TOTAL_QUESTIONS: "6",
      QUIZ_NUMERIC_QUESTION_COUNT: "2",
      QUIZ_MULTIPLE_CHOICE_QUESTION_COUNT: "4",
      QUIZ_MULTIPLE_CHOICE_ALTERNATIVE_COUNT: "5",
      QUIZ_NAME_MAX_LENGTH: "50",
    } as Env;

    const config = createQuizGenerationConfigFromEnv(env);
    expect(config).toEqual({
      totalQuestions: 6,
      numericQuestionCount: 2,
      multipleChoiceQuestionCount: 4,
      multipleChoiceAlternativeCount: 5,
      quizNameMaxLength: 50,
    });
  });

  it("throws on invalid split", () => {
    expect(() =>
      validateQuizGenerationConfig({
        ...DEFAULT_QUIZ_GENERATION_CONFIG,
        totalQuestions: 10,
      })
    ).toThrow("numericQuestionCount + multipleChoiceQuestionCount must equal totalQuestions");
  });

  it("throws on non-positive totals", () => {
    expect(() =>
      validateQuizGenerationConfig({
        ...DEFAULT_QUIZ_GENERATION_CONFIG,
        totalQuestions: 0,
      })
    ).toThrow("totalQuestions must be a positive integer");
  });
});
