import { Question } from "../model/question";
import { RawGeneratedQuiz } from "./types";

function splitAlternativeAnswers(value: string | string[] | null): string[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter((v) => v.length > 0);
  }

  const normalized = String(value);
  if (normalized.trim() === "") {
    return [];
  }

  return normalized.split(";").map((v) => v.trim()).filter((v) => v.length > 0);
}

export function mapRawQuizToGeneratedQuiz(rawQuiz: RawGeneratedQuiz): { quizName: string; questions: Question[] } {
  const questions: Question[] = [];

  for (let idx = 0; idx < rawQuiz.questions.length; idx += 1) {
    const rawQuestion = rawQuiz.questions[idx];
    questions.push(
      new Question(
        idx.toString(),
        rawQuestion.text,
        rawQuestion.sourceUrl,
        rawQuestion.correctAnswer,
        splitAlternativeAnswers(rawQuestion.alternativeAnswers)
      )
    );
  }

  return {
    quizName: rawQuiz.quizName,
    questions,
  };
}
