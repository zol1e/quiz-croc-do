import { GameEvent } from "../../event/game-event";
import { GameEventListener } from "../../event/game-event-listener";

export class RecordingGameEventListener implements GameEventListener {
  public events: GameEvent[] = [];

  constructor(public sessionId: string) {}

  onGameChanged(gameEvent: GameEvent): void {
    this.events.push(gameEvent);
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getLastEvent(): GameEvent | undefined {
    return this.events.length > 0 ? this.events[this.events.length - 1] : undefined;
  }
}
