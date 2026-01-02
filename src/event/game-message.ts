
export enum GameMessageType {
    CREATE = "CREATE",
    JOIN = "JOIN",
    NEXT_QUESTION = "NEXT_QUESTION",
    ANSWER = "ANSWER",
    PLAY_OR_SPECTATE = "PLAY_OR_SPECTATE"
  }


export class GameMessage {
    constructor(
      public gameMessageType: GameMessageType,
      public playerId: string,
      public gameId: string,
      public questionId: string | null = null,
      public answer: string | null = null,
      public spectator: boolean = true
    ) {}
}
