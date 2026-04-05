import { PlayerAnswer, Question } from "../model/question";

export class QuestionEngine {
  constructor(private readonly question: Question) {}

  getState(): Question {
    return this.question;
  }

  start() {
    const now = Date.now();
    this.question.startedAt = new Date(now);
    this.question.finishTime = new Date(now + this.question.timeMillis);
  }

  answer(playerId: string, playerAnswer: string, answeredAt: Date): boolean {
    if (!(playerId in this.question.playerAnswers) && this.question.startedAt != null) {
      this.question.playerAnswers[playerId] = new PlayerAnswer(
        playerId,
        playerAnswer,
        answeredAt,
        answeredAt.getTime() - this.question.startedAt.getTime(),
        this.getDistanceFromCorrect(playerAnswer)
      );
      return true;
    }
    return false;
  }

  getAnsweredPlayerIds(): string[] {
    return Object.keys(this.question.playerAnswers);
  }

  getScore(): Record<string, number> {
    const score: Record<string, number> = {};
    const answersSorted = Object.values(this.question.playerAnswers)
      .sort((a, b) => new Date(a.answeredAt).getTime() - new Date(b.answeredAt).getTime())
      .sort((a, b) => a.distanceFromCorrect - b.distanceFromCorrect);

    let place = 1;
    for (const answer of answersSorted) {
      if (this.hasAlternativeAnswers()) {
        score[answer.playerId] = answer.isCorrect() ? this.question.score / place : 0;
      } else {
        score[answer.playerId] = this.question.score / place;
      }
      place++;
    }

    return score;
  }

  private hasAlternativeAnswers(): boolean {
    return this.question.alternativeAnswers.length > 0;
  }

  private getDistanceFromCorrect(answer: string): number {
    if (!this.hasAlternativeAnswers()) {
      return Math.abs(parseInt(this.question.correctAnswer) - parseInt(answer));
    }
    return this.question.correctAnswer === answer ? 0 : 1;
  }
}
