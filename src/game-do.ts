import { DurableObject } from "cloudflare:workers";
import { GeneratedQuiz } from "./question/question-generator";
import { Game } from "./engine/game";
import { GameEngine } from "./engine/game-engine";
import { AlarmTimeScheduler } from "./engine/time-scheduler";
import { GameMessage, GameMessageType } from "./event/game-message";
import { handleGameMessage } from "./event/game-message-handler";
import { WebSocketGameEventListener } from "./event/game-event-listener";
import { Player } from "./engine/player";
import { Question } from "./question/question";
import { Game as GameData } from "./model/game";
import { corsHeaders } from "./worker";


export class QuizCrocGameDO extends DurableObject<Env> {

	sessions: Map<WebSocket, { [key: string]: string }>;

	game?: GameEngine;
	timeScheduler?: AlarmTimeScheduler;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);

		// As part of constructing the Durable Object,
		// we wake up any hibernating WebSockets and
		// place them back in the `sessions` map.
		this.sessions = new Map();

		this.ctx.blockConcurrencyWhile(async () => {
			const gameJson = await this.ctx.storage.get("game");
			if (gameJson) {
				const gameObj = this.parseGameFromStorage(gameJson as string);
				this.game = GameEngine.fromStoredState(gameObj, this.createTimeScheduler());
			}

			const playersBySessionId = new Map<string, Player>();
			if (this.game) {
				const game = this.getGame();
				for (const player of game.getPlayers()) {
					const sessionId = game.getPlayerSessionHandler().getSessionIdByPlayerId(player.playerId);
					if (sessionId) {
						playersBySessionId.set(sessionId, player);
					}
				}
			}

			// Get all WebSocket connections from the DO
			this.ctx.getWebSockets().forEach((ws) => {
				let attachment = ws.deserializeAttachment();
				if (attachment) {
					// If we previously attached state to our WebSocket,
					// let's add it to `sessions` map to restore the state of the connection.
					this.sessions.set(ws, { ...attachment });
				}

				// Reset the event listener for the player
				const sessionId = this.sessions.get(ws)!.id;
				const player = playersBySessionId.get(sessionId);
				if (player) {
					this.game?.getPlayerSessionHandler().setListener(player.playerId, new WebSocketGameEventListener(ws, sessionId));
				};
			});

			// Sets an application level auto response that does not wake hibernated WebSockets.
			this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
		});
	}

	createTimeScheduler(): AlarmTimeScheduler {
		this.timeScheduler = new AlarmTimeScheduler(this.ctx);
		return this.timeScheduler;
	}

	getGame(): GameEngine {
		if (!this.game) {
			throw new Error('Game does not exist!');
		}
		return this.game;
	}

	async alarm() {
		console.log("Alarm triggered");
		const game = this.getGame()
		game.timeUp(this.timeScheduler?.getQuestionId()!);
		await this.saveGame(game);
	}

	async fetch(request: Request): Promise<Response> {
		const game = this.getGame();

		// Creates two ends of a WebSocket connection.
		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair);

		// Calling `acceptWebSocket()` informs the runtime that this WebSocket is to begin terminating
		// request within the Durable Object. It has the effect of "accepting" the connection,
		// and allowing the WebSocket to send and receive messages.
		this.ctx.acceptWebSocket(server);

		// Generate a random UUID for the session.
		const id = crypto.randomUUID();

		// Attach the session ID to the WebSocket connection and serialize it.
		// This is necessary to restore the state of the connection when the Durable Object wakes up.
		server.serializeAttachment({ id });

		// Add the WebSocket connection to the map of active sessions.
		this.sessions.set(server, { id });

		return new Response(null, {
			status: 101,
			webSocket: client,
			headers: {
            	...corsHeaders,
            },
		});
	}
	async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
		console.log(`WebSocket message received ${message}`);

		const game = this.getGame();
		// Get the session associated with the WebSocket connection.
		const session = this.sessions.get(ws)!;
		const gameMessage: GameMessage = JSON.parse(message as string);

		this.ctx.blockConcurrencyWhile(async () => {
			if (gameMessage.gameMessageType === GameMessageType.JOIN) {
				await this.ctx.storage.put(session.id, gameMessage.playerId);
				await handleGameMessage(game, gameMessage, new WebSocketGameEventListener(ws, session.id));
			} else {
				await handleGameMessage(game, gameMessage, game.getPlayerSessionHandler().getListener(gameMessage.playerId));
			}
			await this.saveGame(game);
		});
	}

	private async saveGame(game: Game) {
		const gameState = game.getState() as GameData & { playerSessionsByPlayerId?: Record<string, string> };
		gameState.playerSessionsByPlayerId = game.getPlayerSessionHandler().serializeSessions();
		await this.ctx.storage.put("game", JSON.stringify(gameState));
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean) {
		// If the client closes the connection, the runtime will invoke the webSocketClose() handler.
		this.sessions.delete(ws);
		ws.close(code, 'Durable Object is closing WebSocket');
	}

	async createQuiz(gameId: string, generatedQuizJson: string) {
		const generatedQuiz: GeneratedQuiz = JSON.parse(generatedQuizJson);
		console.log(`Quiz name: ${generatedQuiz.quizName}! Game ID: ${gameId}`);
		console.log(generatedQuiz.questions);
		const gameData = new GameData(
			gameId,
			generatedQuiz.quizName,
			generatedQuiz.questions.map(q => this.parseQuestion(q))
		);
		this.game = GameEngine.fromStoredState(gameData, this.createTimeScheduler());
		await this.saveGame(this.game);
	}

	private parseQuestion(questionObj: Question): Question {
		const question = new Question(
			questionObj.id,
			questionObj.text,
			questionObj.sourceUrl,
			questionObj.correctAnswer,
			questionObj.alternativeAnswers
		);
		question.score = questionObj.score ?? question.score;
		question.timeMillis = questionObj.timeMillis ?? question.timeMillis;
		question.playerAnswers = questionObj.playerAnswers ?? {};
		question.startedAt = questionObj.startedAt ? new Date(questionObj.startedAt) : null;
		question.finishTime = questionObj.finishTime ? new Date(questionObj.finishTime) : null;
		return question;
	}

	private parseGameFromStorage(gameJson: string): GameData {
		const gameObj = JSON.parse(gameJson) as any;
		const questions = (gameObj.unusedQuestions ?? []).map((q: Question) => this.parseQuestion(q));
		const game = new GameData(gameObj.id, gameObj.topic, questions);
		game.usedQuestions = (gameObj.usedQuestions ?? []).map((q: Question) => this.parseQuestion(q));
		game.currentQuestion = gameObj.currentQuestion ? this.parseQuestion(gameObj.currentQuestion) : null;
		game.state = gameObj.state;
		game.score = gameObj.score ?? {};

		if (gameObj.playersByPlayerId) {
			for (const player of Object.values(gameObj.playersByPlayerId) as Player[]) {
				game.playersByPlayerId[player.playerId] = new Player(player.playerId, player.spectator);
			}
		} else if (gameObj.eventListenersByPlayerId) {
			for (const player of Object.values(gameObj.eventListenersByPlayerId) as any[]) {
				game.playersByPlayerId[player.playerId] = new Player(player.playerId, player.spectator ?? false);
			}
			const sessions: Record<string, string> = {};
			for (const player of Object.values(gameObj.eventListenersByPlayerId) as any[]) {
				sessions[player.playerId] = player.eventListener?.sessionId ?? player.playerId;
			}
			(game as unknown as { playerSessionsByPlayerId: Record<string, string> }).playerSessionsByPlayerId = sessions;
		}

		if (gameObj.playerSessionsByPlayerId) {
			(game as unknown as { playerSessionsByPlayerId: Record<string, string> }).playerSessionsByPlayerId = gameObj.playerSessionsByPlayerId;
		}

		return game;
	}
}
