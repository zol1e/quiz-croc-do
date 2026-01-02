
export interface TimeScheduler {

	schedule(questionId: string, delay: number): Promise<void>;
    getQuestionId(): string | undefined;

}

export class AlarmTimeScheduler {

    questionId: string | undefined;
    ctx: DurableObjectState;
    
    constructor(ctx: DurableObjectState) {
        this.ctx = ctx;
    }

    async schedule(questionId: string, delay: number): Promise<void> {
        this.questionId = questionId;
        console.log(`Scheduling alarm for ${delay}ms`);
        await this.ctx.storage.setAlarm(Date.now() + delay);
    }

    getQuestionId(): string | undefined {
        return this.questionId;
    }
}
