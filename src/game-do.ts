import { DurableObject } from "cloudflare:workers";
import { GeneratedQuiz } from "./question/question-generator";
import { Game } from "./engine/game";
import { AlarmTimeScheduler } from "./engine/time-scheduler";
import { GameMessage, GameMessageType } from "./event/game-message";
import { handleGameMessage } from "./event/game-message-handler";
import { WebSocketGameEventListener } from "./event/game-event-listener";
import { Player } from "./engine/player";
import { Question } from "./question/question";


export class QuizCrocGameDO extends DurableObject<Env> {

	sessions: Map<WebSocket, { [key: string]: string }>;

	game?: Game;
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
				const gameObj = JSON.parse(gameJson as string);
				this.game = Game.fromState(
					gameObj.id,
					gameObj.topic,
					Object.values(gameObj.eventListenersByPlayerId),
					gameObj.unusedQuestions,
					gameObj.usedQuestions,
					gameObj.currentQuestion,
					gameObj.state,
					this.createTimeScheduler(),
				)
			}

			const playersBySessionId = new Map<string, Player>();
			if (this.game) {
				const game = this.getGame();
				for (const player of game.getPlayers()) {
					playersBySessionId.set(player.getEventListener().getSessionId(), player);
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
					player.setEventListener(new WebSocketGameEventListener(ws, sessionId));
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

	getGame(): Game {
		if (!this.game) {
			throw new Error('Game does not exist!');
		}
		return this.game;
	}

	async alarm() {
		console.log("Alarm triggered");
		this.getGame().timeUp(this.timeScheduler?.getQuestionId()!);
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
		});
	}
	async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string) {
		const game = this.getGame();
		// Get the session associated with the WebSocket connection.
		const session = this.sessions.get(ws)!;
		const gameMessage: GameMessage = JSON.parse(message as string);

		this.ctx.blockConcurrencyWhile(async () => {
			if (gameMessage.gameMessageType === GameMessageType.JOIN) {
				await this.ctx.storage.put(session.id, gameMessage.playerId);
				await handleGameMessage(game, gameMessage, new WebSocketGameEventListener(ws, session.id));
			} else {
				await handleGameMessage(game, gameMessage, game.getPlayer(gameMessage.playerId).getEventListener());
			}
			await this.ctx.storage.put("game", JSON.stringify(game));
		});
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
		this.game = new Game(
			gameId, 
			generatedQuiz.quizName, 
			generatedQuiz.questions.map(q => Question.fromQuestionObj(q)), 
			this.createTimeScheduler()
		);
		await this.ctx.storage.put("game", JSON.stringify(this.game));
	}
}
