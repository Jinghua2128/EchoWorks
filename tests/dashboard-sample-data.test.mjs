import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashboardSampleData,
  FIREBASE_PROJECT_ID,
  SEED_NAMESPACE,
  optionLabels,
  sampleScoringTable
} from "../scripts/dashboard-sample-data.mjs";

test("dashboard sample data is deterministic and exercises dashboard states", async () => {
  const first = await buildDashboardSampleData();
  const second = await buildDashboardSampleData();

  assert.deepEqual(first, second);
  assert.equal(first.metadata.projectId, FIREBASE_PROJECT_ID);
  assert.equal(first.metadata.seedNamespace, SEED_NAMESPACE);
  assert.equal(first.users.length, 12);
  assert.ok(first.scenarioResults.length >= 50);
  assert.ok(first.scenarioReflections.length >= 30);
  assert.ok(first.scenarioResults.some(result => !result.data.completed));
  assert.ok(first.scenarioResults.some(result => result.data.attemptNumber === 2));
  assert.ok(first.scenarioResults.some(result => result.data.choiceClassification === "strong"));
  assert.ok(first.scenarioResults.some(result => result.data.choiceClassification === "partial"));
  assert.ok(first.scenarioResults.some(result => result.data.choiceClassification === "missed"));

  const ids = first.scenarioResults.map(result => result.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(first.users.every(user => user.data.email.endsWith("@echoworks.invalid")));
  assert.ok(first.users.every(user => user.data.isSampleData && user.data.seedNamespace === SEED_NAMESPACE));
  assert.ok(first.scenarioResults.every(result => result.data.isSampleData && result.data.seedNamespace === SEED_NAMESPACE));
  assert.deepEqual(optionLabels(), ["A", "B", "C"]);
});

test("sample choices use the confirmed CARE and REAL scoring table", async () => {
  const sample = await buildDashboardSampleData();
  const scoring = sampleScoringTable();

  sample.scenarioResults
    .filter(result => result.data.completed)
    .forEach(result => {
      const selectedIndex = optionLabels().indexOf(result.data.optionSelected);
      assert.equal(
        result.data.optionScore,
        scoring[result.data.scenarioId][selectedIndex],
        result.data.scenarioId + " option " + result.data.optionSelected
      );
      assert.equal(result.data.scorePercent, result.data.optionScore * 50);
      assert.equal(result.data.maxScore, 2);
    });
});

test("sample data includes complete CARE, complete REAL, both paths, and learning improvement", async () => {
  const sample = await buildDashboardSampleData();
  const expectedByFramework = {
    CARE: new Set(Object.keys(sampleScoringTable()).filter(id => id.startsWith("care-"))),
    REAL: new Set(Object.keys(sampleScoringTable()).filter(id => id.startsWith("real-")))
  };
  const byUser = new Map();

  sample.scenarioResults.forEach(result => {
    const user = byUser.get(result.data.uid) || [];
    user.push(result.data);
    byUser.set(result.data.uid, user);
  });

  const completedPath = (results, frameworkId) => {
    const completed = new Set(results
      .filter(result => result.frameworkId === frameworkId && result.completed)
      .map(result => result.scenarioId));
    return [...expectedByFramework[frameworkId]].every(id => completed.has(id));
  };

  assert.ok([...byUser.values()].some(results => completedPath(results, "CARE")));
  assert.ok([...byUser.values()].some(results => completedPath(results, "REAL")));
  assert.ok([...byUser.values()].some(results => completedPath(results, "CARE") && completedPath(results, "REAL")));

  const improvingUser = byUser.get("demo-learner-02");
  const total = attemptNumber => improvingUser
    .filter(result => result.frameworkId === "CARE" && result.attemptNumber === attemptNumber)
    .reduce((sum, result) => sum + Number(result.optionScore || 0), 0);
  assert.ok(total(2) > total(1));
});
