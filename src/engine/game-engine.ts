import { GameEvent, GameState } from "../event/game-event";
import { GameEventListener } from "../event/game-event-listener";
import { Game } from "../model/game";
import { Player } from "../model/player";
import { Question } from "../model/question";
import { PlayerSessionHandler } from "./player-session-handler";
import { QuestionEngine } from "./question-engine";
import { TimeScheduler } from "./time-scheduler";

export class GameEngine {
  constructor(
    private readonly game: Game,
    private timeScheduler: TimeScheduler,
    private readonly playerSessions: PlayerSessionHandler
  ) {}

  static fromStoredState(game: Game, timeScheduler: TimeScheduler): GameEngine {
    const sessions = new PlayerSessionHandler();
    const storedSessions = (game as unknown as { playerSessionsByPlayerId?: Record<string, string> }).playerSessionsByPlayerId ?? {};
    for (const player of Object.values(game.playersByPlayerId)) {
      const sessionId = storedSessions[player.playerId] ?? player.playerId;
      sessions.ensureDummyListener(player.playerId, sessionId);
    }
    return new GameEngine(game, timeScheduler, sessions);
  }

  getState(): Game {
    return this.game;
  }

  getPlayerSessionHandler(): PlayerSessionHandler {
    return this.playerSessions;
  }

  addPlayer(playerId: string, gameEventListener: GameEventListener): GameEngine {
    this.game.playersByPlayerId[playerId] = new Player(playerId, false);
    this.playerSessions.setListener(playerId, gameEventListener);
    this.computeScore();
    this.gameChanged();
    return this;
  }

  setSpectator(playerId: string, spectator: boolean) {
    this.game.playersByPlayerId[playerId].spectator = spectator;
    this.computeScore();
    this.gameChanged();
  }

  async nextQuestion(): Promise<Question | null> {
    if (!this.game.unusedQuestions.length) {
      this.game.state = GameState.FINISH;
      return null;
    }
    this.game.currentQuestion = this.game.unusedQuestions.shift()!;
    this.game.usedQuestions.push(this.game.currentQuestion);

    new QuestionEngine(this.game.currentQuestion).start();

    await this.timeScheduler.schedule(this.game.currentQuestion.id, this.game.currentQuestion.timeMillis);

    this.game.state = GameState.QUESTION;
    this.gameChanged();

    return this.game.currentQuestion;
  }

  timeUp(questionId: string) {
    if (this.game.currentQuestion != null && this.game.currentQuestion.id === questionId) {
      this.finishQuestion();
    }
  }

  answer(playerId: string, questionId: string, playerAnswer: string): boolean {
    if (this.game.currentQuestion == null) {
      return false;
    }
    let answered = false;
    if (this.game.currentQuestion.id === questionId) {
      if (new QuestionEngine(this.game.currentQuestion).answer(playerId, playerAnswer, new Date())) {
        answered = true;
        this.gameChanged();
      }
    }
    if (this.allPlayerAnswered(this.game.currentQuestion, this.getPlayerIds())) {
      this.finishQuestion();
    }
    return answered;
  }

  finishQuestion() {
    if (this.game.currentQuestion != null) {
      this.game.currentQuestion = null;

      if (!this.game.unusedQuestions.length) {
        this.game.state = GameState.FINISH;
      } else {
        this.game.state = GameState.BETWEEN_QUESTIONS;
      }

      this.computeScore();
      this.gameChanged();
    }
  }

  allPlayerAnswered(question: Question, playerIds: string[]): boolean {
    const answeredPlayerIds = new QuestionEngine(question).getAnsweredPlayerIds();
    for (const playerId of playerIds) {
      if (!answeredPlayerIds.includes(playerId)) {
        return false;
      }
    }
    return true;
  }

  getPlayerIds(): string[] {
    const playerIds = [];
    for (const player of Object.values(this.game.playersByPlayerId)) {
      if (!player.spectator) {
        playerIds.push(player.playerId);
      }
    }
    return playerIds;
  }

  getPlayers(): Player[] {
    return Object.values(this.game.playersByPlayerId);
  }

  getPlayer(playerId: string): Player {
    return this.game.playersByPlayerId[playerId];
  }

  getLastQuestion(): Question | null {
    return !this.game.usedQuestions.length ? null : this.game.usedQuestions[this.game.usedQuestions.length - 1];
  }

  computeScore(): Record<string, number> {
    this.game.score = Object.fromEntries(this.getPlayerIds().map(playerId => [playerId, 0]));
    for (const question of this.game.usedQuestions) {
      if (question.id === this.game.currentQuestion?.id) continue;

      const questionScore = new QuestionEngine(question).getScore();
      for (const playerId in this.game.score) {
        if (playerId in questionScore) {
          this.game.score[playerId] += questionScore[playerId];
        }
      }
    }
    return this.game.score;
  }

  setTimeScheduler(timeScheduler: TimeScheduler) {
    this.timeScheduler = timeScheduler;
  }

  private gameChanged() {
    const gameEvent = new GameEvent(
      this.game.id,
      this.game.state,
      this.game.topic,
      this.game.currentQuestion,
      this.getLastQuestion(),
      this.game.score
    );
    this.playerSessions.onGameChanged(gameEvent);
  }
}
