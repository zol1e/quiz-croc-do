import { GeneratedQuiz } from "./types";

export interface IQuestionGenerator {
  generateQuestions(topic: string): Promise<GeneratedQuiz>;
}
