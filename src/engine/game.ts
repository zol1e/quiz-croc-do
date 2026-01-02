import { GameEvent, GameState } from "../event/game-event";
import { DummyEventListener, GameEventListener } from "../event/game-event-listener";
import { PlayerAnswer, Question } from "../question/question";
import { Player } from "./player";
import { TimeScheduler } from "./time-scheduler";


export class Game {

	id: string;
	topic: string;
	state: GameState;
	unusedQuestions: Question[];
	currentQuestion: Question | null = null;
	usedQuestions: Question[] = [];
	eventListenersByPlayerId: { [key: string]: Player; } = {};
	score: Record<string, number> = {};
	timeSchduler: TimeScheduler;

	constructor(id: string, topic: string, questions: Question[], timeScheduler: TimeScheduler) {
		this.id = id;
		this.topic = topic;
		this.state = GameState.PREPARE;
		this.unusedQuestions = questions;
		this.timeSchduler = timeScheduler;
	}

	static fromState(id: string, topic: string, players: Player[], unusedQuestions: Question[], usedQuestions: Question[], currentQuestion: Question | null, state: GameState, timeScheduler: TimeScheduler): Game {
		const game = new Game(
			id,
			topic,
			unusedQuestions.map(q => Question.fromQuestionObj(q)),
			timeScheduler
		);
		game.usedQuestions = usedQuestions.map(q => Question.fromQuestionObj(q));
		game.currentQuestion = currentQuestion ? Question.fromQuestionObj(currentQuestion) : null;
		game.state = state;

		game.eventListenersByPlayerId = players.reduce((acc, player) => {
			acc[player.playerId] = new Player(
				player.playerId, 
				new DummyEventListener(player.eventListener.sessionId), 
				player.spectator);
			return acc;
		}, {} as { [key: string]: Player; });

		game.computeScore();
		return game;
	}

	addPlayer(playerId: string, gameEventListener: GameEventListener): Game {
		this.eventListenersByPlayerId[playerId] = new Player(playerId, gameEventListener, false);
		this.computeScore();
		this.gameChanged();
		return this;
	}

	setSpectator(playerId: string, spectator: boolean) {
		this.eventListenersByPlayerId[playerId].spectator = spectator;
		this.computeScore();
		this.gameChanged();
	}

	async nextQuestion(): Promise<Question | null> {
		if (!this.unusedQuestions.length) {
			this.state = GameState.FINISH;
			return null;
		}
		this.currentQuestion = this.unusedQuestions.shift()!;
		this.usedQuestions.push(this.currentQuestion);
		
		console.log(`Current question type: ${this.currentQuestion?.constructor?.name}`);
		this.currentQuestion.start();

		await this.timeSchduler.schedule(this.currentQuestion.id, this.currentQuestion.timeMillis);

		this.state = GameState.QUESTION;
		this.gameChanged();

		return this.currentQuestion;
	}

	timeUp(questionId: string) {
		if (this.currentQuestion != null && this.currentQuestion.id === questionId) {
			this.finishQuestion();
		}
	}

	answer(playerId: string, questionId: string, playerAnswer: string): boolean {
		if (this.currentQuestion == null) {
			return false;
		}
		let answered = false;
		if (this.currentQuestion.id === questionId) {
			if (this.currentQuestion.answer(playerId, playerAnswer, new Date())) {
				answered = true;
				this.gameChanged();
			}
		}
		if (this.allPlayerAnswered(this.currentQuestion, this.getPlayerIds())) {
			this.finishQuestion();
		}
		return answered;
	}

	gameChanged() {
		const gameEvent = new GameEvent(
			this.id, this.state, this.topic, this.currentQuestion, this.getLastQuestion(), this.score
		);
		for (const playerId in this.eventListenersByPlayerId) {
			this.eventListenersByPlayerId[playerId].getEventListener().onGameChanged(gameEvent);
		}
	}

	finishQuestion() {
		if (this.currentQuestion != null) {
			this.currentQuestion = null;

			if (!this.unusedQuestions.length) {
				this.state = GameState.FINISH;
			} else {
				this.state = GameState.BETWEEN_QUESTIONS;
			}

			this.computeScore();
			this.gameChanged();
		}
	}

	allPlayerAnswered(question: Question, playerIds: string[]): boolean {
		const answeredPlayerIds = question.getAnsweredPlayerIds();
		for (const playerId of playerIds) {
			if (!answeredPlayerIds.includes(playerId)) {
				return false;
			}
		}
		return true;
	}

	getPlayerIds(): string[] {
		const playerIds = []
		for (const player of Object.values(this.eventListenersByPlayerId)) {
			if (!player.isSpectator()) {
				playerIds.push(player.playerId);
			}
		}
		return playerIds;
	}

	getPlayers(): Player[] {
		return Object.values(this.eventListenersByPlayerId);
	}

	getPlayer(playerId: string): Player {
		return this.eventListenersByPlayerId[playerId];
	}

	getLastQuestion(): Question | null {
		return !this.usedQuestions.length ? null : this.usedQuestions[this.usedQuestions.length - 1];
	}

	computeScore(): Record<string, number> {
		this.score = Object.fromEntries(this.getPlayerIds().map(playerId => [playerId, 0]));
		for (const question of this.usedQuestions) {
			if (question === this.currentQuestion) continue;

			const questionScore = question.getScore();
			for (const playerId in this.score) {
				if (playerId in questionScore) {
					this.score[playerId] += questionScore[playerId];
				}
			}
		}
		return this.score;
	}

	setTimeScheduler(timeScheduler: TimeScheduler) {
		this.timeSchduler = timeScheduler;
	}
}
