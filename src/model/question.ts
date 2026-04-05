export class PlayerAnswer {
  constructor(
    public playerId: string,
    public answer: string,
    public answeredAt: Date,
    public timeSpentMillis: number,
    public distanceFromCorrect: number
  ) {}

  isCorrect(): boolean {
    return this.distanceFromCorrect === 0;
  }
}

export class Question {
  public score: number = 100;
  public timeMillis: number = 20000;
  public playerAnswers: { [key: string]: PlayerAnswer } = {};
  public startedAt: Date | null = null;
  public finishTime: Date | null = null;

  constructor(
    public id: string,
    public text: string,
    public sourceUrl: string | null,
    public correctAnswer: string,
    public alternativeAnswers: string[]
  ) {}
}
