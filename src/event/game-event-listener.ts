import { GameEvent } from "./game-event";


export interface GameEventListener {
	sessionId: string;
	onGameChanged(gameEvent: GameEvent): void;
	getSessionId(): string;
}

export class DummyEventListener implements GameEventListener {

	sessionId: string;

	constructor(sessionId: string) {
		this.sessionId = sessionId;
	}

	onGameChanged(gameEvent: GameEvent): void {
		throw new Error("Method not implemented.");
	}

	getSessionId(): string {
		return this.sessionId;
	}
}

export class WebSocketGameEventListener implements GameEventListener {

	ws: WebSocket;
	sessionId: string;

	constructor(ws: WebSocket, sessionId: string) {
		this.ws = ws;
		this.sessionId = sessionId;
	}

	onGameChanged(gameEvent: GameEvent): void {
		if (this.ws.readyState == WebSocket.OPEN) {
			console.log("Send game event: " + JSON.stringify(gameEvent));
			this.ws.send(JSON.stringify(gameEvent));
		}
	}

	getSessionId(): string {
		return this.sessionId;
	}
}
