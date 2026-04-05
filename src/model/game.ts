import { GameState } from "../event/game-event";
import { Player } from "./player";
import { Question } from "./question";

export class Game {
  public state: GameState;
  public unusedQuestions: Question[];
  public currentQuestion: Question | null = null;
  public usedQuestions: Question[] = [];
  public playersByPlayerId: Record<string, Player> = {};
  public score: Record<string, number> = {};

  constructor(id: string, topic: string, questions: Question[]) {
    this.id = id;
    this.topic = topic;
    this.state = GameState.PREPARE;
    this.unusedQuestions = questions;
  }

  id: string;
  topic: string;
}
