import { readFile } from "node:fs/promises";

export const FIREBASE_PROJECT_ID = "echoworks-e3b4d";
export const DASHBOARD_OWNER_EMAIL = "liuguangxuan1230@gmail.com";
export const SEED_NAMESPACE = "echoworks-dashboard-demo-v1";

const scenarioLibraryUrl = new URL("../assets/data/scenarios/scenario-library.json", import.meta.url);
const pulseSurveyUrl = new URL("../assets/data/pulse-surveys.json", import.meta.url);
const baseTime = Date.parse("2026-07-01T01:00:00.000Z");

const learnerPlans = [
  { uid: "demo-learner-01", email: "demo.learner01@echoworks.invalid", paths: [{ frameworkId: "CARE", first: ["B", "A", "B", "B"] }] },
  { uid: "demo-learner-02", email: "demo.learner02@echoworks.invalid", paths: [{ frameworkId: "CARE", first: ["C", "A", "C", "B"], replay: ["B", "A", "B", "B"] }] },
  { uid: "demo-learner-03", email: "demo.learner03@echoworks.invalid", paths: [{ frameworkId: "CARE", first: ["A", "B", "A", "C"] }] },
  { uid: "demo-learner-04", email: "demo.learner04@echoworks.invalid", paths: [{ frameworkId: "CARE", first: ["B", "A"], dropOff: true }] },
  { uid: "demo-learner-05", email: "demo.learner05@echoworks.invalid", paths: [{ frameworkId: "REAL", first: ["A", "B", "B", "B"] }] },
  { uid: "demo-learner-06", email: "demo.learner06@echoworks.invalid", paths: [{ frameworkId: "REAL", first: ["C", "B", "C", "B"] }] },
  { uid: "demo-learner-07", email: "demo.learner07@echoworks.invalid", paths: [{ frameworkId: "REAL", first: ["B", "A", "A", "C"], replay: ["A", "B", "C", "B"] }] },
  { uid: "demo-learner-08", email: "demo.learner08@echoworks.invalid", paths: [{ frameworkId: "REAL", first: ["A"], dropOff: true }] },
  {
    uid: "demo-learner-09",
    email: "demo.learner09@echoworks.invalid",
    paths: [
      { frameworkId: "CARE", first: ["B", "A", "B", "B"] },
      { frameworkId: "REAL", first: ["A", "B", "C", "B"] }
    ]
  },
  {
    uid: "demo-learner-10",
    email: "demo.learner10@echoworks.invalid",
    paths: [
      { frameworkId: "CARE", first: ["C", "B", "C", "B"] },
      { frameworkId: "REAL", first: ["C", "B", "B", "A"] }
    ]
  },
  {
    uid: "demo-learner-11",
    email: "demo.learner11@echoworks.invalid",
    paths: [
      { frameworkId: "CARE", first: ["B", "A", "C", "B"] },
      { frameworkId: "REAL", first: ["A", "B"], dropOff: true }
    ]
  },
  { uid: "demo-learner-12", email: "demo.learner12@echoworks.invalid", paths: [{ frameworkId: "REAL", first: [], dropOff: true }] }
];

function optionLabel(index) {
  return String.fromCharCode(65 + index);
}

function optionIndex(label) {
  return String(label || "").toUpperCase().charCodeAt(0) - 65;
}

function classification(score) {
  if (score === 2) return "strong";
  if (score === 1) return "partial";
  return "missed";
}

function resultBand(score) {
  if (score === 2) return "strong";
  if (score === 1) return "developing";
  return "follow_up";
}

function isoAt(learnerIndex, pathIndex, attemptNumber, scenarioIndex, minuteOffset = 0) {
  const elapsed =
    learnerIndex * 36 * 60 * 60 * 1000 +
    pathIndex * 9 * 60 * 60 * 1000 +
    (attemptNumber - 1) * 12 * 24 * 60 * 60 * 1000 +
    scenarioIndex * 34 * 60 * 1000 +
    minuteOffset * 60 * 1000;
  return new Date(baseTime + elapsed).toISOString();
}

function frameworkLabel(library, frameworkId, dimensionId) {
  return library.frameworks[frameworkId].dimensions.find(item => item.id === dimensionId)?.label || dimensionId;
}

function demoPlayerId(learnerIndex) {
  return "demo-player-" + String(learnerIndex + 1).padStart(2, "0");
}

function attemptIdFor(scenarioId, attemptNumber, learnerIndex) {
  return scenarioId + "_attempt_" + attemptNumber + "_demo_" + String(learnerIndex + 1).padStart(2, "0");
}

function completedRecord({
  learner,
  learnerIndex,
  path,
  pathIndex,
  scenario,
  scenarioIndex,
  choiceLabel,
  attemptNumber,
  library
}) {
  const choiceIndex = optionIndex(choiceLabel);
  const choice = scenario.choices[choiceIndex];
  if (!choice) {
    throw new Error("Unknown option " + choiceLabel + " for " + scenario.id + ".");
  }

  const score = Number(choice.points);
  const startedAtIso = isoAt(learnerIndex, pathIndex, attemptNumber, scenarioIndex);
  const completedAtIso = isoAt(learnerIndex, pathIndex, attemptNumber, scenarioIndex, 6 + scenarioIndex);
  const attemptId = attemptIdFor(scenario.id, attemptNumber, learnerIndex);
  const resultId = learner.uid + "_" + attemptId;
  const dimensionLabel = frameworkLabel(library, scenario.frameworkId, scenario.focusDimension);
  const isReplay = attemptNumber > 1;
  const reflectionSaved = (learnerIndex + pathIndex + scenarioIndex + attemptNumber) % 4 !== 0;
  const firstPathFinished = path.first.length === 4;
  const completedBefore = isReplay ? 4 : scenarioIndex;
  const completedCount = Math.min(4, completedBefore + 1);
  const pathCompleted = isReplay || (firstPathFinished && scenarioIndex === 3);
  const responseTime = 6800 + learnerIndex * 430 + scenarioIndex * 1170 + attemptNumber * 290;

  return {
    id: resultId,
    data: {
      uid: learner.uid,
      email: learner.email,
      anonymousPlayerId: demoPlayerId(learnerIndex),
      attemptId,
      attemptNumber,
      attemptStartedAtIso: startedAtIso,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      selectedRole: scenario.role,
      frameworkId: scenario.frameworkId,
      frameworkDimensionId: scenario.focusDimension,
      frameworkDimension: dimensionLabel,
      optionSelected: choiceLabel,
      optionId: choice.id,
      optionScore: score,
      choiceClassification: classification(score),
      choiceResponseTimeMs: responseTime,
      progressStatus: "completed",
      progressPercent: 100,
      completed: true,
      scenarioCompleted: true,
      pathStarted: true,
      pathCompleted,
      pathCompletedScenarioCount: pathCompleted ? 4 : completedCount,
      pathScenarioCount: 4,
      completedAt: completedAtIso,
      completedAtIso,
      completionDateTime: completedAtIso,
      playAgainSelected: Boolean(path.replay && attemptNumber === 1 && scenarioIndex === path.first.length - 1),
      feedbackCardViewed: (learnerIndex + scenarioIndex) % 5 !== 0,
      replayedSamePath: isReplay,
      triedOtherRole: pathIndex > 0,
      exitPoint: "completed",
      updatedAt: completedAtIso,
      updatedAtIso: completedAtIso,
      score,
      maxScore: 2,
      scorePercent: score * 50,
      frameworkScores: { [scenario.focusDimension]: score },
      frameworkDetails: [{
        id: scenario.focusDimension,
        label: dimensionLabel,
        score,
        maxScore: 2,
        percent: score * 50,
        tone: resultBand(score),
        explanation: "Demo result for " + dimensionLabel + "."
      }],
      resultBand: resultBand(score),
      needsFollowUp: score === 0,
      reflectionSaved,
      choices: [{
        sceneId: "decision",
        choiceId: choice.id,
        optionLabel: choiceLabel,
        optionScore: score,
        classification: classification(score),
        choiceResponseTimeMs: responseTime,
        effect: choice.effect,
        score: { [scenario.focusDimension]: score },
        totalAfter: score
      }],
      isSampleData: true,
      seedNamespace: SEED_NAMESPACE
    },
    reflection: reflectionSaved
      ? {
          uid: learner.uid,
          email: learner.email,
          attemptId,
          scenarioId: scenario.id,
          answers: {
            takeaway: "I noticed how option " + choiceLabel + " affected " + dimensionLabel + ".",
            nextStep: score === 2
              ? "I will keep using the " + dimensionLabel + " behaviour in my next conversation."
              : "I will pause and practise a stronger " + dimensionLabel + " response next time."
          },
          updatedAt: completedAtIso,
          updatedAtIso: completedAtIso,
          isSampleData: true,
          seedNamespace: SEED_NAMESPACE
        }
      : null
  };
}

function incompleteRecord({ learner, learnerIndex, pathIndex, scenario, scenarioIndex, library }) {
  const attemptNumber = 1;
  const startedAtIso = isoAt(learnerIndex, pathIndex, attemptNumber, scenarioIndex);
  const updatedAtIso = isoAt(learnerIndex, pathIndex, attemptNumber, scenarioIndex, 3);
  const attemptId = attemptIdFor(scenario.id, attemptNumber, learnerIndex);
  const dimensionLabel = frameworkLabel(library, scenario.frameworkId, scenario.focusDimension);

  return {
    id: learner.uid + "_" + attemptId,
    data: {
      uid: learner.uid,
      email: learner.email,
      anonymousPlayerId: demoPlayerId(learnerIndex),
      attemptId,
      attemptNumber,
      attemptStartedAtIso: startedAtIso,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      selectedRole: scenario.role,
      frameworkId: scenario.frameworkId,
      frameworkDimensionId: scenario.focusDimension,
      frameworkDimension: dimensionLabel,
      optionSelected: null,
      optionId: null,
      optionScore: null,
      choiceClassification: null,
      choiceResponseTimeMs: null,
      progressStatus: "in_progress",
      progressPercent: 55,
      completed: false,
      scenarioCompleted: false,
      pathStarted: true,
      pathCompleted: false,
      pathCompletedScenarioCount: scenarioIndex,
      pathScenarioCount: 4,
      completedAt: null,
      completedAtIso: null,
      completionDateTime: null,
      playAgainSelected: false,
      feedbackCardViewed: false,
      replayedSamePath: false,
      triedOtherRole: pathIndex > 0,
      exitPoint: "decision",
      updatedAt: updatedAtIso,
      updatedAtIso,
      score: 0,
      maxScore: 2,
      scorePercent: 0,
      frameworkScores: {},
      frameworkDetails: [],
      resultBand: "follow_up",
      needsFollowUp: false,
      reflectionSaved: false,
      choices: [],
      isSampleData: true,
      seedNamespace: SEED_NAMESPACE
    },
    reflection: null
  };
}

function latestProgress(results) {
  const byUserAndScenario = new Map();
  results.forEach(result => {
    const key = result.data.uid + "::" + result.data.scenarioId;
    const current = byUserAndScenario.get(key);
    if (!current || result.data.attemptNumber > current.data.attemptNumber) {
      byUserAndScenario.set(key, result);
    }
  });

  return [...byUserAndScenario.values()].map(result => ({
    userId: result.data.uid,
    scenarioId: result.data.scenarioId,
    data: { ...result.data }
  }));
}

export async function buildDashboardSampleData() {
  const [library, pulseSurvey] = await Promise.all([
    readFile(scenarioLibraryUrl, "utf8").then(JSON.parse),
    readFile(pulseSurveyUrl, "utf8").then(JSON.parse)
  ]);
  const scenariosByFramework = Object.groupBy(library.scenarios, scenario => scenario.frameworkId);
  const results = [];
  const reflections = [];

  learnerPlans.forEach((learner, learnerIndex) => {
    learner.paths.forEach((path, pathIndex) => {
      const scenarios = scenariosByFramework[path.frameworkId] || [];
      path.first.forEach((choiceLabel, scenarioIndex) => {
        const result = completedRecord({
          learner,
          learnerIndex,
          path,
          pathIndex,
          scenario: scenarios[scenarioIndex],
          scenarioIndex,
          choiceLabel,
          attemptNumber: 1,
          library
        });
        results.push({ id: result.id, data: result.data });
        if (result.reflection) reflections.push({ id: result.id, data: result.reflection });
      });

      if (path.dropOff && path.first.length < scenarios.length) {
        const result = incompleteRecord({
          learner,
          learnerIndex,
          pathIndex,
          scenario: scenarios[path.first.length],
          scenarioIndex: path.first.length,
          library
        });
        results.push({ id: result.id, data: result.data });
      }

      (path.replay || []).forEach((choiceLabel, scenarioIndex) => {
        const result = completedRecord({
          learner,
          learnerIndex,
          path,
          pathIndex,
          scenario: scenarios[scenarioIndex],
          scenarioIndex,
          choiceLabel,
          attemptNumber: 2,
          library
        });
        results.push({ id: result.id, data: result.data });
        if (result.reflection) reflections.push({ id: result.id, data: result.reflection });
      });
    });
  });

  const users = learnerPlans.map((learner, learnerIndex) => {
    const latestResult = results
      .filter(result => result.data.uid === learner.uid)
      .sort((left, right) => Date.parse(right.data.updatedAtIso) - Date.parse(left.data.updatedAtIso))[0];
    const completedAnyPath = learner.paths.some(path => path.first.length === 4);
    const updatedAtIso = latestResult?.data.updatedAtIso || isoAt(learnerIndex, 0, 1, 0);
    const preAnswers = [3 + (learnerIndex % 2), 2 + (learnerIndex % 3)];
    const postAnswers = completedAnyPath ? [Math.min(5, preAnswers[0] + 1), Math.min(5, preAnswers[1] + 1)] : [-1, -1];
    const completedSurveyAnswers = completedAnyPath ? 4 : 2;

    return {
      id: learner.uid,
      data: {
        uid: learner.uid,
        email: learner.email,
        selectedRole: latestResult?.data.selectedRole || (learner.paths[0].frameworkId === "REAL" ? "manager" : "employee"),
        anonymousPlayerId: demoPlayerId(learnerIndex),
        learningProgress: {
          surveyVersion: pulseSurvey.version,
          answers: {
            "pre-pulse": preAnswers,
            "post-pulse": postAnswers
          },
          completed: completedSurveyAnswers,
          total: 4,
          progress: completedSurveyAnswers * 25,
          updatedAt: Date.parse(updatedAtIso)
        },
        createdAt: isoAt(learnerIndex, 0, 1, 0, -20),
        updatedAt: updatedAtIso,
        isSampleData: true,
        seedNamespace: SEED_NAMESPACE
      }
    };
  });

  const scenarioProgress = latestProgress(results);
  const completedResults = results.filter(result => result.data.completed);
  const incompleteResults = results.filter(result => !result.data.completed);
  const replayResults = results.filter(result => result.data.attemptNumber > 1);

  return {
    metadata: {
      projectId: FIREBASE_PROJECT_ID,
      seedNamespace: SEED_NAMESPACE,
      generatedAtIso: "2026-07-24T00:00:00.000Z",
      note: "Synthetic dashboard data only. These learners do not have Firebase Authentication accounts.",
      counts: {
        users: users.length,
        scenarioResults: results.length,
        completedResults: completedResults.length,
        incompleteResults: incompleteResults.length,
        replayResults: replayResults.length,
        scenarioReflections: reflections.length,
        scenarioProgress: scenarioProgress.length
      }
    },
    owner: {
      id: DASHBOARD_OWNER_EMAIL,
      data: {
        email: DASHBOARD_OWNER_EMAIL,
        role: "owner",
        updatedAt: "2026-07-24T00:00:00.000Z"
      }
    },
    users,
    scenarioResults: results,
    scenarioReflections: reflections,
    scenarioProgress
  };
}

export function sampleScoringTable() {
  return {
    "real-late-arrival": [2, 0, 1],
    "real-uneven-scale": [0, 2, 0],
    "real-quiet-one": [0, 2, 2],
    "real-star-stopped-caring": [0, 2, 0],
    "care-ambush": [0, 2, 1],
    "care-rating-stings": [2, 0, 0],
    "care-what-did-that-mean": [0, 2, 1],
    "care-three-weeks-one-goal": [0, 2, 0]
  };
}

export function optionLabels() {
  return [0, 1, 2].map(optionLabel);
}
