import { QuizGenerationConfig } from "./quiz-generation-config";

export function buildQuestionPrompt(topic: string, config: QuizGenerationConfig): string {
  return [
    `Give ${config.numericQuestionCount} questions, which answer is a positive integer`,
    ` and ${config.multipleChoiceQuestionCount} questions, which has ${config.multipleChoiceAlternativeCount} alternatives and only one of them is the correct answer.`,
    " The alternative answer questions should not contain wrong answers, which answer is a positive integer.",
    ` So give ${config.multipleChoiceAlternativeCount - 1} wrong answers and the correct answer for multiple-choice questions.`,
    " The topic of the questions should be:",
    topic,
    " The result should be in json format. ",
    " The alternativeAnswers should be semicolon separated text values.",
    ` The ${config.multipleChoiceAlternativeCount} alternative answers should include the correct answer.`,
    " In case of numeric questions, the alternativeAnswers field should be empty.",
    " The correctAnswer field should always contain the correct answer.",
    " The text field should be the question.",
    ` Give a nice name for the quiz based on the topic. The quiz name should be short, maximum ${config.quizNameMaxLength} characters.`,
    " The json object should have two properties: quizName and questions.",
  ].join(" ");
}
