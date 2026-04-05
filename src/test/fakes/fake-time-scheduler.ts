import { TimeScheduler } from "../../engine/time-scheduler";

export class FakeTimeScheduler implements TimeScheduler {
  public scheduled: Array<{ questionId: string; delay: number }> = [];
  private currentQuestionId: string | undefined;

  async schedule(questionId: string, delay: number): Promise<void> {
    this.currentQuestionId = questionId;
    this.scheduled.push({ questionId, delay });
  }

  getQuestionId(): string | undefined {
    return this.currentQuestionId;
  }
}
