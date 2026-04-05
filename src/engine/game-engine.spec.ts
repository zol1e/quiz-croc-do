import { describe, expect, it } from "@jest/globals";
import { GameState } from "../event/game-event";
import { Game } from "../model/game";
import { Question } from "../model/question";
import { GameEngine } from "./game-engine";
import { PlayerSessionHandler } from "./player-session-handler";
import { FakeTimeScheduler } from "../test/fakes/fake-time-scheduler";
import { RecordingGameEventListener } from "../test/fakes/recording-game-event-listener";

function createQuestions(): Question[] {
  const q1 = new Question("q1", "How many continents?", null, "7", []);
  q1.score = 100;
  q1.timeMillis = 10000;

  const q2 = new Question(
    "q2",
    "Capital of France?",
    null,
    "Paris",
    ["Paris", "Madrid", "Berlin", "Rome"]
  );
  q2.score = 100;
  q2.timeMillis = 5000;

  return [q1, q2];
}

describe("GameEngine", () => {
  it("plays a complete 2-player game and finishes with expected state and score", async () => {
    const scheduler = new FakeTimeScheduler();
    const sessions = new PlayerSessionHandler();
    const game = new Game("g1", "General", createQuestions());
    const engine = new GameEngine(game, scheduler, sessions);

    const l1 = new RecordingGameEventListener("s1");
    const l2 = new RecordingGameEventListener("s2");

    engine.addPlayer("p1", l1);
    engine.addPlayer("p2", l2);

    await engine.nextQuestion();
    const q1 = engine.getState().currentQuestion;
    expect(q1?.id).toBe("q1");

    const a1 = engine.answer("p1", "q1", "7");
    const a2 = engine.answer("p2", "q1", "6");
    expect(a1).toBe(true);
    expect(a2).toBe(true);
    expect(engine.getState().state).toBe(GameState.BETWEEN_QUESTIONS);

    await engine.nextQuestion();
    const q2 = engine.getState().currentQuestion;
    expect(q2?.id).toBe("q2");

    const b1 = engine.answer("p1", "q2", "Paris");
    const b2 = engine.answer("p2", "q2", "Berlin");
    expect(b1).toBe(true);
    expect(b2).toBe(true);

    const state = engine.getState();
    expect(state.state).toBe(GameState.FINISH);
    expect(state.currentQuestion).toBeNull();
    expect(state.unusedQuestions).toHaveLength(0);
    expect(state.usedQuestions).toHaveLength(2);

    expect(scheduler.scheduled).toEqual([
      { questionId: "q1", delay: 10000 },
      { questionId: "q2", delay: 5000 },
    ]);

    expect(state.score).toEqual({ p1: 200, p2: 50 });
    expect(l1.events.length).toBeGreaterThan(0);
    expect(l2.events.length).toBeGreaterThan(0);
  });

  it("excludes spectators from answer completion and score", async () => {
    const scheduler = new FakeTimeScheduler();
    const sessions = new PlayerSessionHandler();
    const game = new Game("g2", "General", createQuestions());
    const engine = new GameEngine(game, scheduler, sessions);

    const l1 = new RecordingGameEventListener("s1");
    const l2 = new RecordingGameEventListener("s2");
    engine.addPlayer("p1", l1);
    engine.addPlayer("p2", l2);
    engine.setSpectator("p2", true);

    await engine.nextQuestion();
    const accepted = engine.answer("p1", "q1", "7");
    expect(accepted).toBe(true);
    expect(engine.getState().state).toBe(GameState.BETWEEN_QUESTIONS);
    expect(engine.getState().score).toEqual({ p1: 100 });
  });

  it("finishes current question when timeUp is called", async () => {
    const scheduler = new FakeTimeScheduler();
    const sessions = new PlayerSessionHandler();
    const game = new Game("g3", "General", createQuestions());
    const engine = new GameEngine(game, scheduler, sessions);

    const l1 = new RecordingGameEventListener("s1");
    const l2 = new RecordingGameEventListener("s2");
    engine.addPlayer("p1", l1);
    engine.addPlayer("p2", l2);

    await engine.nextQuestion();
    expect(engine.getState().state).toBe(GameState.QUESTION);
    engine.timeUp("q1");
    expect(engine.getState().state).toBe(GameState.BETWEEN_QUESTIONS);
    expect(engine.getState().currentQuestion).toBeNull();
  });

  it("rejects answer when question id does not match current question", async () => {
    const scheduler = new FakeTimeScheduler();
    const sessions = new PlayerSessionHandler();
    const game = new Game("g4", "General", createQuestions());
    const engine = new GameEngine(game, scheduler, sessions);

    const l1 = new RecordingGameEventListener("s1");
    engine.addPlayer("p1", l1);

    await engine.nextQuestion();
    const accepted = engine.answer("p1", "wrong-id", "7");
    expect(accepted).toBe(false);
    expect(engine.getState().state).toBe(GameState.QUESTION);
    expect(engine.getState().score).toEqual({ p1: 0 });
  });

  it("restores session mapping from stored state", () => {
    const scheduler = new FakeTimeScheduler();
    const sessions = new PlayerSessionHandler();
    const game = new Game("g5", "General", createQuestions());
    const engine = new GameEngine(game, scheduler, sessions);

    engine.addPlayer("p1", new RecordingGameEventListener("s1"));
    engine.addPlayer("p2", new RecordingGameEventListener("s2"));

    const stored = engine.getState() as Game & { playerSessionsByPlayerId?: Record<string, string> };
    stored.playerSessionsByPlayerId = engine.getPlayerSessionHandler().serializeSessions();

    const restored = GameEngine.fromStoredState(stored, scheduler);
    const restoredSessions = restored.getPlayerSessionHandler().serializeSessions();

    expect(restoredSessions).toEqual({ p1: "s1", p2: "s2" });
  });
});
