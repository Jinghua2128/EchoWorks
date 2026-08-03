import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  choiceClassification,
  isBracketedStageDirection,
  pathScorePercent,
  prepareVisibleSceneLines,
  validateLearningData
} from "../assets/js/scenario-engine.js";

async function json(path) {
  return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

test("confirmed A/B/C scoring and framework names stay exact", async () => {
  const library = await json("../assets/data/scenarios/scenario-library.json");
  const expected = {
    "real-late-arrival": [2, 0, 1],
    "real-uneven-scale": [0, 2, 0],
    "real-quiet-one": [0, 2, 2],
    "real-star-stopped-caring": [0, 2, 0],
    "care-ambush": [0, 2, 1],
    "care-rating-stings": [2, 0, 0],
    "care-what-did-that-mean": [0, 2, 1],
    "care-three-weeks-one-goal": [0, 2, 0]
  };
  for (const scenario of library.scenarios) {
    assert.deepEqual(scenario.choices.map(choice => choice.points), expected[scenario.id], scenario.id);
  }
  assert.deepEqual(library.frameworks.REAL.dimensions.map(item => item.label), ["Recognise", "Evaluate", "Advise", "Link"]);
  assert.deepEqual(library.frameworks.CARE.dimensions.map(item => item.label), ["Compose", "Analyze", "Resolve", "Execute"]);
  assert.equal(choiceClassification(2), "strong");
  assert.equal(choiceClassification(1), "partial");
  assert.equal(choiceClassification(0), "missed");
  assert.equal(pathScorePercent(6), 75);
});

test("local learning JSON is complete and internally consistent", async () => {
  const [scenarioLibrary, fullGameScript, pulseSurveys, arCards] = await Promise.all([
    json("../assets/data/scenarios/scenario-library.json"),
    json("../assets/data/scenarios/full-game-script.json"),
    json("../assets/data/pulse-surveys.json"),
    json("../assets/data/ar-cards.json")
  ]);
  assert.deepEqual(validateLearningData({ scenarioLibrary, fullGameScript, pulseSurveys, arCards }), []);
  assert.equal(fullGameScript.scenarioOrder.length, 8);
  assert.equal(pulseSurveys.surveys.length, 4);
  assert.ok(pulseSurveys.surveys.every(survey => survey.questions.length === 6));
  assert.deepEqual(
    pulseSurveys.surveys.map(survey => `${survey.role}:${survey.stage}`).sort(),
    ["employee:post", "employee:pre", "manager:post", "manager:pre"]
  );
  assert.equal(pulseSurveys.surveys.reduce((sum, survey) => sum + survey.questions.length, 0), 24);
  assert.equal(
    pulseSurveys.surveys.find(survey => survey.id === "manager-pre-pulse")
      .questions.find(question => question.dimension === "advise").dimensionLabel,
    "Advise"
  );

  const executeChoices = Object.values(
    fullGameScript.scenarios["care-three-weeks-one-goal"].choices
  );
  assert.ok(executeChoices.every(choice => Array.isArray(choice.feedback)));
  assert.ok(executeChoices.every(choice => choice.feedback.length === 2));
  assert.ok(executeChoices.every(choice => choice.feedback[0].speaker === "Feedback Card"));
  assert.ok(executeChoices.every(choice => choice.feedback[0].text.includes("CARE E: EXECUTE")));
  assert.ok(executeChoices.every(choice => choice.feedback[1].speaker === "CARE Coach"));
});
test("stage directions drive presentation without appearing as dialogue", () => {
  const lines = prepareVisibleSceneLines([
    { speaker: "Stage Direction", tone: "tense", text: "[Scene changes to the hallway.]" },
    { speaker: "Alex", text: "Can we talk for a moment?" },
    { speaker: "Jamie", text: "I used [the updated report] for this review." }
  ]);

  assert.equal(isBracketedStageDirection("[Screen transition.]"), true);
  assert.equal(isBracketedStageDirection("Use [the updated report]."), false);
  assert.deepEqual(lines, [
    { speaker: "Alex", tone: "tense", text: "Can we talk for a moment?" },
    { speaker: "Jamie", text: "I used [the updated report] for this review." }
  ]);
});