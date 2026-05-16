import { Question } from "../model/question";

export type GeneratedQuiz = {
  quizName: string;
  questions: Question[];
};

export type RawGeneratedQuestion = {
  text: string;
  correctAnswer: string;
  alternativeAnswers: string | string[] | null;
  sourceUrl: string | null;
};

export type RawGeneratedQuiz = {
  quizName: string;
  questions: RawGeneratedQuestion[];
};
