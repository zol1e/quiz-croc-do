import { QuizGenerationConfig } from "./quiz-generation-config";
import { RawGeneratedQuiz } from "./types";

export class QuestionValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Generated quiz failed validation: ${issues.join("; ")}`);
    this.name = "QuestionValidationError";
  }
}

function isPositiveIntegerString(value: string): boolean {
  return /^[1-9]\d*$/.test(value.trim());
}

function splitAlternatives(value: string | string[] | null): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((part) => String(part).trim()).filter((part) => part.length > 0);
  }

  const normalized = String(value);
  if (normalized.trim() === "") {
    return [];
  }

  return normalized.split(";").map((part) => part.trim()).filter((part) => part.length > 0);
}

export function validateGeneratedQuiz(rawQuiz: RawGeneratedQuiz, config: QuizGenerationConfig): void {
  const issues: string[] = [];

  if (!rawQuiz || typeof rawQuiz !== "object") {
    throw new QuestionValidationError(["quiz must be an object"]);
  }

  const quizName = typeof rawQuiz.quizName === "string" ? rawQuiz.quizName.trim() : "";
  if (quizName.length === 0) {
    issues.push("quizName must be a non-empty string");
  }
  if (quizName.length > config.quizNameMaxLength) {
    issues.push(`quizName must be at most ${config.quizNameMaxLength} characters`);
  }

  if (!Array.isArray(rawQuiz.questions)) {
    throw new QuestionValidationError(["questions must be an array"]);
  }

  if (rawQuiz.questions.length !== config.totalQuestions) {
    issues.push(`questions must contain exactly ${config.totalQuestions} items`);
  }

  let numericCount = 0;
  let multipleChoiceCount = 0;

  for (let idx = 0; idx < rawQuiz.questions.length; idx += 1) {
    const question = rawQuiz.questions[idx];
    const path = `questions[${idx}]`;

    if (!question || typeof question !== "object") {
      issues.push(`${path} must be an object`);
      continue;
    }

    const text = typeof question.text === "string" ? question.text.trim() : "";
    const correctAnswer = typeof question.correctAnswer === "string" ? question.correctAnswer.trim() : "";
    const alternativesRaw =
      typeof question.alternativeAnswers === "string" || Array.isArray(question.alternativeAnswers)
        ? question.alternativeAnswers
        : null;
    const alternatives = splitAlternatives(alternativesRaw);

    if (text.length === 0) {
      issues.push(`${path}.text must be a non-empty string`);
    }
    if (correctAnswer.length === 0) {
      issues.push(`${path}.correctAnswer must be a non-empty string`);
    }

    if (alternatives.length === 0) {
      numericCount += 1;
      if (!isPositiveIntegerString(correctAnswer)) {
        issues.push(`${path}.correctAnswer must be a positive integer for numeric questions`);
      }
      continue;
    }

    multipleChoiceCount += 1;
    if (alternatives.length !== config.multipleChoiceAlternativeCount) {
      issues.push(`${path}.alternativeAnswers must contain exactly ${config.multipleChoiceAlternativeCount} items`);
    }
    if (!alternatives.includes(correctAnswer)) {
      issues.push(`${path}.alternativeAnswers must include correctAnswer`);
    }

    for (const alt of alternatives) {
      if (alt !== correctAnswer && isPositiveIntegerString(alt)) {
        issues.push(`${path}.alternativeAnswers wrong options must not be positive integers`);
        break;
      }
    }
  }

  if (numericCount !== config.numericQuestionCount) {
    issues.push(`quiz must contain exactly ${config.numericQuestionCount} numeric questions`);
  }
  if (multipleChoiceCount !== config.multipleChoiceQuestionCount) {
    issues.push(`quiz must contain exactly ${config.multipleChoiceQuestionCount} multiple-choice questions`);
  }

  if (issues.length > 0) {
    throw new QuestionValidationError(issues);
  }
}
