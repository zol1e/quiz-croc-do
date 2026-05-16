export type QuizGenerationConfig = {
  totalQuestions: number;
  numericQuestionCount: number;
  multipleChoiceQuestionCount: number;
  multipleChoiceAlternativeCount: number;
  quizNameMaxLength: number;
};

export const DEFAULT_QUIZ_GENERATION_CONFIG: QuizGenerationConfig = {
  totalQuestions: 5,
  numericQuestionCount: 2,
  multipleChoiceQuestionCount: 3,
  multipleChoiceAlternativeCount: 4,
  quizNameMaxLength: 40,
};

export function validateQuizGenerationConfig(config: QuizGenerationConfig): void {
  const issues: string[] = [];

  if (!Number.isInteger(config.totalQuestions) || config.totalQuestions <= 0) {
    issues.push("totalQuestions must be a positive integer");
  }
  if (!Number.isInteger(config.numericQuestionCount) || config.numericQuestionCount < 0) {
    issues.push("numericQuestionCount must be a non-negative integer");
  }
  if (!Number.isInteger(config.multipleChoiceQuestionCount) || config.multipleChoiceQuestionCount < 0) {
    issues.push("multipleChoiceQuestionCount must be a non-negative integer");
  }
  if (!Number.isInteger(config.multipleChoiceAlternativeCount) || config.multipleChoiceAlternativeCount < 2) {
    issues.push("multipleChoiceAlternativeCount must be an integer >= 2");
  }
  if (!Number.isInteger(config.quizNameMaxLength) || config.quizNameMaxLength <= 0) {
    issues.push("quizNameMaxLength must be a positive integer");
  }

  if (config.numericQuestionCount + config.multipleChoiceQuestionCount !== config.totalQuestions) {
    issues.push("numericQuestionCount + multipleChoiceQuestionCount must equal totalQuestions");
  }

  if (issues.length > 0) {
    throw new Error(`Invalid quiz generation config: ${issues.join("; ")}`);
  }
}

function parseOptionalPositiveInt(value: string | undefined, fallback: number, key: string): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalNonNegativeInt(value: string | undefined, fallback: number, key: string): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return parsed;
}

export function createQuizGenerationConfigFromEnv(env: Env): QuizGenerationConfig {
  const config: QuizGenerationConfig = {
    totalQuestions: parseOptionalPositiveInt(env.QUIZ_TOTAL_QUESTIONS, DEFAULT_QUIZ_GENERATION_CONFIG.totalQuestions, "QUIZ_TOTAL_QUESTIONS"),
    numericQuestionCount: parseOptionalNonNegativeInt(env.QUIZ_NUMERIC_QUESTION_COUNT, DEFAULT_QUIZ_GENERATION_CONFIG.numericQuestionCount, "QUIZ_NUMERIC_QUESTION_COUNT"),
    multipleChoiceQuestionCount: parseOptionalNonNegativeInt(env.QUIZ_MULTIPLE_CHOICE_QUESTION_COUNT, DEFAULT_QUIZ_GENERATION_CONFIG.multipleChoiceQuestionCount, "QUIZ_MULTIPLE_CHOICE_QUESTION_COUNT"),
    multipleChoiceAlternativeCount: parseOptionalPositiveInt(env.QUIZ_MULTIPLE_CHOICE_ALTERNATIVE_COUNT, DEFAULT_QUIZ_GENERATION_CONFIG.multipleChoiceAlternativeCount, "QUIZ_MULTIPLE_CHOICE_ALTERNATIVE_COUNT"),
    quizNameMaxLength: parseOptionalPositiveInt(env.QUIZ_NAME_MAX_LENGTH, DEFAULT_QUIZ_GENERATION_CONFIG.quizNameMaxLength, "QUIZ_NAME_MAX_LENGTH"),
  };

  validateQuizGenerationConfig(config);
  return config;
}
