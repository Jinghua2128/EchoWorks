import test from "node:test";
import assert from "node:assert/strict";
import {
  completionForRole,
  mergeScenarioRecords,
  nextAttemptNumber,
  readLocalScenarioRecords,
  saveScenarioRecordWithStatus
} from "../assets/js/progress-store.js";

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

function record(overrides = {}) {
  return {
    uid: "learner-1",
    email: "learner@example.com",
    anonymousPlayerId: "player-1",
    attemptId: "real-late-arrival_attempt_1_100",
    attemptNumber: 1,
    scenarioId: "real-late-arrival",
    scenarioTitle: "The Late Arrival",
    selectedRole: "manager",
    frameworkId: "REAL",
    frameworkDimensionId: "R",
    optionScore: 2,
    choiceClassification: "strong",
    score: 2,
    maxScore: 2,
    scorePercent: 100,
    progressPercent: 100,
    completed: true,
    pathStarted: true,
    reflectionAnswers: {},
    updatedAtIso: "2026-07-24T01:00:00.000Z",
    ...overrides
  };
}

function firebaseMock({ failAt = 0 } = {}) {
  let writes = 0;
  return {
    db: {},
    doc: (_db, ...segments) => segments.join("/"),
    serverTimestamp: () => ({ seconds: 1 }),
    deleteField: () => ({ __deleteField: true }),
    setDoc: async () => {
      writes += 1;
      if (failAt === writes) throw new Error("offline");
    }
  };
}

test("merge is deterministic, keeps local reflections, and preserves unsynced attempts", () => {
  const local = record({ reflectionAnswers: { next: "Pause first" }, _sync: { state: "pending" } });
  const cloud = record({ updatedAt: { seconds: 2 }, reflectionSaved: true, reflectionAnswers: undefined, _sync: { state: "synced" } });
  const unsynced = record({ attemptId: "care-ambush_attempt_1_200", scenarioId: "care-ambush", uid: null, selectedRole: "employee", frameworkId: "CARE" });
  const merged = mergeScenarioRecords([local, unsynced], [cloud]);
  assert.equal(merged.length, 2);
  assert.equal(merged.find(item => item.scenarioId === "real-late-arrival").reflectionAnswers.next, "Pause first");
  assert.ok(merged.some(item => item.scenarioId === "care-ambush"));
});

test("attempt numbering and role completion use merged scenario IDs", () => {
  const records = [record(), record({ attemptId: "attempt-2", attemptNumber: 2 })];
  assert.equal(nextAttemptNumber(records, "real-late-arrival"), 3);
  const definitions = [
    { id: "real-late-arrival", role: "manager" },
    { id: "real-quiet-one", role: "manager" }
  ];
  assert.deepEqual(completionForRole(records, "manager", definitions), {
    completedScenarioCount: 1,
    totalScenarioCount: 2,
    pathCompleted: false
  });
});

test("save reports confirmed local and cloud outcomes", async () => {
  const storage = new MemoryStorage();
  const outcome = await saveScenarioRecordWithStatus({
    record: record(),
    firebaseClient: firebaseMock(),
    user: { uid: "learner-1", email: "learner@example.com" },
    storage
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.local.ok, true);
  assert.equal(outcome.cloud.state, "synced");
  assert.equal(readLocalScenarioRecords(storage)[0]._sync.state, "synced");
});

test("failed cloud save remains local and retryable", async () => {
  const storage = new MemoryStorage();
  const outcome = await saveScenarioRecordWithStatus({
    record: record(),
    firebaseClient: firebaseMock({ failAt: 2 }),
    user: { uid: "learner-1", email: "learner@example.com" },
    storage
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.local.ok, true);
  assert.equal(outcome.cloud.state, "failed");
  assert.equal(readLocalScenarioRecords(storage)[0]._sync.state, "failed");
});