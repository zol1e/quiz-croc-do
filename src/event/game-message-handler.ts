import { Game } from "../engine/game";
import { GameEventListener } from "./game-event-listener";
import { GameMessage, GameMessageType } from "./game-message";


export async function handleGameMessage(game: Game, gameMessage: GameMessage, gameEventListener: GameEventListener) {
	switch (gameMessage.gameMessageType as GameMessageType) {
		case GameMessageType.JOIN: {
			game.addPlayer(gameMessage.playerId, gameEventListener);
			break;
		}
		case GameMessageType.NEXT_QUESTION: {
			await game.nextQuestion();
			break;
		}
		case GameMessageType.ANSWER: {
			game.answer(
				gameMessage.playerId,
				gameMessage.questionId as string,
				gameMessage.answer as string
			);
			break;
		}
		case GameMessageType.PLAY_OR_SPECTATE: {
			game.setSpectator(gameMessage.playerId, gameMessage.spectator);
			break;
		}
		default:
			throw new Error("Unhandled GameMessageType: " + gameMessage.gameMessageType);
	}
}
