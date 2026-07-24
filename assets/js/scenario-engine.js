export function choiceClassification(score) {
  const normalized = Number(score);
  if (normalized >= 2) return "strong";
  if (normalized === 1) return "partial";
  return "missed";
}

export function optionScore(choice) {
  if (choice?.points !== undefined) return Number(choice.points || 0);
  return Object.values(choice?.score || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

export function pathScorePercent(points, maximum = 8) {
  const earned = Math.max(0, Number(points || 0));
  const available = Math.max(1, Number(maximum || 8));
  return Math.round((earned / available) * 100);
}

export function isBracketedStageDirection(text) {
  return /^\s*\[[\s\S]*\]\s*$/.test(String(text || ""));
}

export function prepareVisibleSceneLines(lines) {
  const visibleLines = [];
  let pendingPresentation = {};

  for (const rawLine of Array.isArray(lines) ? lines : []) {
    const line = rawLine && typeof rawLine === "object"
      ? { ...rawLine }
      : { text: String(rawLine || "") };

    if (isBracketedStageDirection(line.text)) {
      for (const key of ["tone", "focus", "mood", "cue", "background"]) {
        if (line[key] !== undefined) pendingPresentation[key] = line[key];
      }
      continue;
    }

    visibleLines.push({ ...pendingPresentation, ...line });
    pendingPresentation = {};
  }

  return visibleLines;
}

export function validateLearningData({ scenarioLibrary, fullGameScript, pulseSurveys, arCards }) {
  const errors = [];
  const scenarios = scenarioLibrary?.scenarios;
  if (!Array.isArray(scenarios) || scenarios.length !== 8) errors.push("Scenario library must contain eight scenarios.");

  const roles = new Set(scenarios?.map(item => item.role));
  if (!roles.has("manager") || !roles.has("employee")) errors.push("Both manager and employee paths are required.");

  (scenarios || []).forEach(entry => {
    const script = fullGameScript?.scenarios?.[entry.id];
    if (!script) errors.push(`FULL GAME SCRIPT is missing ${entry.id}.`);
    if (!Array.isArray(entry.choices) || entry.choices.length !== 3) errors.push(`${entry.id} must contain choices A, B, and C.`);
    entry.choices?.forEach((choice, index) => {
      const expectedLabel = String.fromCharCode(65 + index);
      const scriptedChoice = script?.choices?.[choice.id];
      if (scriptedChoice?.label !== expectedLabel) errors.push(`${entry.id} choice ${choice.id} must be option ${expectedLabel}.`);
      if (![0, 1, 2].includes(optionScore(choice))) errors.push(`${entry.id} choice ${expectedLabel} has an invalid score.`);
    });
  });

  const surveys = pulseSurveys?.surveys;
  if (!Array.isArray(surveys) || surveys.length !== 2 || surveys.some(survey => survey.questions?.length !== 2)) {
    errors.push("Pulse survey must contain two pre and two post questions.");
  }

  if (!Array.isArray(arCards?.cards) || arCards.cards.length < 8) errors.push("CARE and REAL AR card definitions are incomplete.");
  return errors;
}