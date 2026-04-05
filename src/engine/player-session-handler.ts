import { GameEvent } from "../event/game-event";
import { DummyEventListener, GameEventListener } from "../event/game-event-listener";
import { Player } from "../model/player";

export class PlayerSessionHandler {
  private listenersByPlayerId: Record<string, GameEventListener> = {};

  setListener(playerId: string, listener: GameEventListener): void {
    this.listenersByPlayerId[playerId] = listener;
  }

  ensureDummyListener(playerId: string, sessionId: string): void {
    if (!this.listenersByPlayerId[playerId]) {
      this.listenersByPlayerId[playerId] = new DummyEventListener(sessionId);
    }
  }

  getListener(playerId: string): GameEventListener {
    const listener = this.listenersByPlayerId[playerId];
    if (!listener) {
      throw new Error(`Missing listener for player ${playerId}`);
    }
    return listener;
  }

  getSessionIdByPlayerId(playerId: string): string | null {
    const listener = this.listenersByPlayerId[playerId];
    return listener ? listener.getSessionId() : null;
  }

  getPlayerBySessionId(players: Player[]): Map<string, Player> {
    const result = new Map<string, Player>();
    for (const player of players) {
      const sessionId = this.getSessionIdByPlayerId(player.playerId);
      if (sessionId) {
        result.set(sessionId, player);
      }
    }
    return result;
  }

  onGameChanged(gameEvent: GameEvent): void {
    for (const listener of Object.values(this.listenersByPlayerId)) {
      listener.onGameChanged(gameEvent);
    }
  }

  serializeSessions(): Record<string, string> {
    const sessions: Record<string, string> = {};
    for (const [playerId, listener] of Object.entries(this.listenersByPlayerId)) {
      sessions[playerId] = listener.getSessionId();
    }
    return sessions;
  }
}
