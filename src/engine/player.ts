import { GameEventListener } from "../event/game-event-listener";


export class Player {
    playerId: string;
    eventListener: GameEventListener;
    spectator: boolean = false;

	constructor(playerId: string, eventListener: GameEventListener, spectator: boolean) {
        this.playerId = playerId;
        this.eventListener = eventListener;
        this.spectator = spectator;
    }

    getEventListener(): GameEventListener {
        return this.eventListener;
    }

    setEventListener(eventListener: GameEventListener): void {
        this.eventListener = eventListener;
    }

    isSpectator(): boolean {
        return this.spectator;
    }
}
