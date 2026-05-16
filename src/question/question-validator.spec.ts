import { describe, expect, it } from "@jest/globals";
import { DEFAULT_QUIZ_GENERATION_CONFIG } from "./quiz-generation-config";
import { QuestionValidationError, validateGeneratedQuiz } from "./question-validator";
import { RawGeneratedQuiz } from "./types";

function buildValidQuiz(): RawGeneratedQuiz {
  return {
    quizName: "Math and Facts",
    questions: [
      {
        text: "How many days in a week?",
        correctAnswer: "7",
        alternativeAnswers: "",
        sourceUrl: null,
      },
      {
        text: "How many months in a year?",
        correctAnswer: "12",
        alternativeAnswers: "",
        sourceUrl: null,
      },
      {
        text: "Capital of Italy?",
        correctAnswer: "Rome",
        alternativeAnswers: "Rome;Paris;Berlin;Madrid",
        sourceUrl: null,
      },
      {
        text: "Largest ocean?",
        correctAnswer: "Pacific",
        alternativeAnswers: "Atlantic;Indian;Pacific;Arctic",
        sourceUrl: null,
      },
      {
        text: "Fastest land animal?",
        correctAnswer: "Cheetah",
        alternativeAnswers: "Lion;Cheetah;Tiger;Leopard",
        sourceUrl: null,
      },
    ],
  };
}

describe("validateGeneratedQuiz", () => {
  it("accepts valid quiz", () => {
    const quiz = buildValidQuiz();
    expect(() => validateGeneratedQuiz(quiz, DEFAULT_QUIZ_GENERATION_CONFIG)).not.toThrow();
  });

  it("fails with wrong total question count", () => {
    const quiz = buildValidQuiz();
    quiz.questions.pop();
    expect(() => validateGeneratedQuiz(quiz, DEFAULT_QUIZ_GENERATION_CONFIG)).toThrow(QuestionValidationError);
  });

  it("fails when multiple choice answers do not include correct answer", () => {
    const quiz = buildValidQuiz();
    quiz.questions[2].alternativeAnswers = "Paris;Berlin;Madrid;Lisbon";
    expect(() => validateGeneratedQuiz(quiz, DEFAULT_QUIZ_GENERATION_CONFIG)).toThrow(QuestionValidationError);
  });

  it("fails when wrong option is positive integer", () => {
    const quiz = buildValidQuiz();
    quiz.questions[2].alternativeAnswers = "Rome;2;Berlin;Madrid";
    expect(() => validateGeneratedQuiz(quiz, DEFAULT_QUIZ_GENERATION_CONFIG)).toThrow(QuestionValidationError);
  });

  it("fails when quiz name exceeds max length", () => {
    const quiz = buildValidQuiz();
    quiz.quizName = "A".repeat(DEFAULT_QUIZ_GENERATION_CONFIG.quizNameMaxLength + 1);
    expect(() => validateGeneratedQuiz(quiz, DEFAULT_QUIZ_GENERATION_CONFIG)).toThrow(QuestionValidationError);
  });
});
