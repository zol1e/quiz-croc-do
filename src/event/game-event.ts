import { Question } from "../question/question";


export enum GameState {
  PREPARE = "PREPARE",
  QUESTION = "QUESTION",
  BETWEEN_QUESTIONS = "BETWEEN_QUESTIONS",
  FINISH = "FINISH"
}


export class GameEvent {

  constructor(
    public gameId: string,
    public gameState: GameState,
    public topic: string,
    public currentQuestion: Question | null,
    public lastQuestion: Question | null,
    public score: { [key: string]: number }
  ) {}

}
