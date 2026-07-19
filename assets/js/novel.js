import { loadFirebaseClient } from "./firebase-client.js";

const scenarioLibraryFile = "assets/data/scenarios/scenario-library.json";
const fullGameScriptFile = "assets/data/scenarios/full-game-script.json";
const lastScenarioKey = "feedbackPlaybook.lastScenarioByRole";
const localResultsKey = "feedbackPlaybook.scenarioResults";
const textSpeed = 16;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const sceneBackdropEl = document.querySelector(".scene-backdrop");
const managerEl = document.getElementById("manager");
const sarahEl = document.getElementById("sarah");
const choicesEl = document.getElementById("choices");
const rolePanelEl = document.getElementById("rolePanel");
const roleMessageEl = document.getElementById("roleMessage");
const scoreHudEl = document.getElementById("scoreHud");
const roleBadgeEl = document.getElementById("roleBadge");
const frameworkBadgeEl = document.getElementById("frameworkBadge");
const scoreTotalEl = document.getElementById("scoreTotal");
const scoreProgressEl = document.getElementById("scoreProgress");
const scoreBreakdownEl = document.getElementById("scoreBreakdown");
const scenarioProgressTextEl = document.getElementById("scenarioProgressText");
const speakerNameEl = document.getElementById("speakerName");
const sceneCountEl = document.getElementById("sceneCount");
const textEl = document.getElementById("dialogueText");
const dialoguePanelEl = document.querySelector(".dialogue-panel");
const resultEl = document.getElementById("result");
const advanceButton = document.querySelector('[data-action="advance"]');
const advanceLabelEl = document.getElementById("advanceLabel");
const sceneCueEl = document.getElementById("sceneCue");
const sceneCueLabelEl = document.getElementById("sceneCueLabel");
const sceneCueTitleEl = document.getElementById("sceneCueTitle");
const sceneCueDetailEl = document.getElementById("sceneCueDetail");
const reflectionPanelEl = document.getElementById("reflectionPanel");
const reflectionTitleEl = document.getElementById("reflectionTitle");
const reflectionSummaryEl = document.getElementById("reflectionSummary");
const frameworkResultEl = document.getElementById("frameworkResult");
const scoreDetailsEl = document.getElementById("scoreDetails");
const strengthsListEl = document.getElementById("strengthsList");
const improvementListEl = document.getElementById("improvementList");
const reflectionFieldsEl = document.getElementById("reflectionFields");
const reflectionFormEl = document.getElementById("reflectionForm");
const reflectionMessageEl = document.getElementById("reflectionMessage");
const scoreRingEl = document.getElementById("scoreRing");
const scoreRingValueEl = document.getElementById("scoreRingValue");
const scenarioTitleEl = document.getElementById("scenarioTitle");
const scenarioRewardTitleEl = document.getElementById("scenarioRewardTitle");
const scenarioRewardDetailEl = document.getElementById("scenarioRewardDetail");
const scenarioWipeEl = document.getElementById("scenarioWipe");
const scenarioWipeTitleEl = document.getElementById("scenarioWipeTitle");

let firebaseClient = null;
let currentUser = null;
let scenarioLibrary = null;
let fullGameScript = null;
let scenario = null;
let scenes = {};
let sceneOrder = [];
let currentSceneId = "";
let typingTimer = null;
let talkingTimer = null;
let pendingNext = null;
let fullText = "";
let typedIndex = 0;
let isTyping = false;
let scoreState = {};
let totalScore = 0;
let choiceHistory = [];
let reflectionAnswers = {};
let completedAtIso = null;
let completionShown = false;

function notifyMotion(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function readLocalResults() {
  return safeJsonParse(localStorage.getItem(localResultsKey), {});
}

function writeLocalResult(record) {
  const results = readLocalResults();
  results[record.scenarioId] = record;
  localStorage.setItem(localResultsKey, JSON.stringify(results));
}

function initialiseScoreState(nextScenario) {
  scoreState = {};
  nextScenario.framework.dimensions.forEach(dimension => {
    scoreState[dimension.id] = 0;
  });
  totalScore = 0;
  choiceHistory = [];
  reflectionAnswers = {};
  completedAtIso = null;
  completionShown = false;
}

function clampScore(value) {
  const maxScore = scenario?.framework?.maxScore || 0;
  return Math.max(0, Math.min(maxScore, value));
}

function scorePercent() {
  const maxScore = scenario?.framework?.maxScore || 0;
  return maxScore ? Math.round((totalScore / maxScore) * 100) : 0;
}

function progressPercent() {
  if (!scenario) return 0;
  if (completedAtIso) return 100;
  const decisions = scenario.decisionCount || 1;
  return Math.min(95, Math.round((choiceHistory.length / decisions) * 100));
}

function resultBand() {
  const percent = scorePercent();
  if (percent >= 80) return "strong";
  if (percent >= (scenario?.followUpThreshold || 65)) return "developing";
  return "follow_up";
}

function needsFollowUp() {
  return resultBand() === "follow_up" || choiceHistory.some(choice => choice.effect === "fail");
}

function decisionScenes() {
  return Object.values(scenes).filter(scene => Array.isArray(scene.choices) && scene.choices.length);
}

function dimensionMax(dimensionId) {
  const maxFromChoices = decisionScenes().reduce((sum, scene) => {
    const bestChoice = Math.max(0, ...scene.choices.map(choice => Number(choice.score?.[dimensionId] || 0)));
    return sum + bestChoice;
  }, 0);

  return maxFromChoices;
}

function dimensionPercent(dimensionId) {
  const maxScore = dimensionMax(dimensionId);
  return maxScore ? Math.round(((scoreState[dimensionId] || 0) / maxScore) * 100) : 0;
}

function dimensionTone(percent) {
  if (percent >= 75) return "strong";
  if (percent >= 50) return "developing";
  return "follow_up";
}

function feedbackForDimension(dimension) {
  const percent = dimensionPercent(dimension.id);
  const tone = dimensionTone(percent);
  const guidance = scenario?.framework?.feedback?.[dimension.id] || {};

  return guidance[tone] || (
    tone === "strong"
      ? `You applied ${dimension.label} consistently in this route.`
      : tone === "developing"
        ? `${dimension.label} appeared in parts of your response. Keep practising it in the next scenario.`
        : `${dimension.label} needs more attention. Review the scenario and consider what support would help.`
  );
}

function buildFrameworkDetails() {
  if (!scenario) return [];

  return scenario.framework.dimensions.map(dimension => {
    const maxScore = dimensionMax(dimension.id);
    const percent = dimensionPercent(dimension.id);
    return {
      id: dimension.id,
      label: dimension.label,
      score: scoreState[dimension.id] || 0,
      maxScore,
      percent,
      tone: dimensionTone(percent),
      explanation: feedbackForDimension(dimension)
    };
  }).filter(detail => detail.maxScore > 0);
}

function buildScenarioRecord(status = "in_progress") {
  const nowIso = new Date().toISOString();
  return {
    uid: currentUser?.uid || null,
    email: currentUser?.email || "Guest learner",
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    selectedRole: scenario.role,
    frameworkId: scenario.framework.id,
    progressStatus: status,
    progressPercent: progressPercent(),
    completed: status === "completed",
    completedAtIso,
    updatedAtIso: nowIso,
    score: totalScore,
    maxScore: scenario.framework.maxScore,
    scorePercent: scorePercent(),
    frameworkScores: { ...scoreState },
    frameworkDetails: buildFrameworkDetails(),
    resultBand: resultBand(),
    needsFollowUp: needsFollowUp(),
    choices: choiceHistory.map(choice => ({
      sceneId: choice.sceneId,
      choiceId: choice.choiceId,
      effect: choice.effect,
      score: choice.score,
      totalAfter: choice.totalAfter
    })),
    reflectionAnswers: { ...reflectionAnswers }
  };
}

async function saveScenarioRecord(status = "in_progress") {
  if (!scenario) return;

  const record = buildScenarioRecord(status);
  writeLocalResult(record);

  if (!firebaseClient || !currentUser) return;

  const firestoreRecord = {
    ...record,
    uid: currentUser.uid,
    email: currentUser.email || "",
    updatedAt: firebaseClient.serverTimestamp()
  };

  if (status === "completed") {
    firestoreRecord.completedAt = firebaseClient.serverTimestamp();
  }

  const resultId = `${currentUser.uid}_${scenario.id}`;
  await Promise.all([
    firebaseClient.setDoc(firebaseClient.doc(firebaseClient.db, "users", currentUser.uid), {
      email: currentUser.email || "",
      selectedRole: scenario.role,
      updatedAt: firebaseClient.serverTimestamp()
    }, { merge: true }),
    firebaseClient.setDoc(firebaseClient.doc(firebaseClient.db, "users", currentUser.uid, "scenarioProgress", scenario.id), firestoreRecord, { merge: true }),
    firebaseClient.setDoc(firebaseClient.doc(firebaseClient.db, "scenarioResults", resultId), firestoreRecord, { merge: true })
  ]).catch(error => {
    setRoleMessage(`Cloud save is unavailable. Your scenario result is saved locally. ${error.message || ""}`.trim(), "error");
  });
}

function setRoleMessage(message, tone = "neutral") {
  if (!roleMessageEl) return;
  roleMessageEl.textContent = message;
  roleMessageEl.dataset.tone = tone;
}

function randomIndex(length) {
  if (length <= 1) return 0;
  if (window.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    window.crypto.getRandomValues(values);
    return values[0] % length;
  }
  return Math.floor(Math.random() * length);
}

function chooseRandomScenario(pool, role) {
  const recent = safeJsonParse(localStorage.getItem(lastScenarioKey), {});
  const candidates = pool.length > 1
    ? pool.filter(entry => entry.id !== recent[role])
    : pool;
  const selected = candidates[randomIndex(candidates.length)];

  recent[role] = selected.id;
  localStorage.setItem(lastScenarioKey, JSON.stringify(recent));
  return selected;
}

function addSceneSequence(target, prefix, lines, nextId) {
  let next = nextId;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const id = `${prefix}-${index + 1}`;
    target[id] = {
      ...lines[index],
      next
    };
    next = id;
  }
  return next;
}

function buildRuntimeScenario(entry, library, scriptLibrary) {
  const roleSettings = library.roleSettings?.[entry.role];
  const frameworkDefinition = library.frameworks?.[entry.frameworkId];
  const scriptEntry = scriptLibrary?.scenarios?.[entry.id];
  if (!roleSettings || !frameworkDefinition || !entry.focusDimension || !scriptEntry) {
    throw new Error("Scenario configuration is incomplete.");
  }

  const scenes = {};
  const endingLines = Array.isArray(scriptLibrary.gameEnd) && scriptLibrary.gameEnd.length
    ? scriptLibrary.gameEnd
    : [{
      speaker: "EchoWorks",
      tone: "mentor",
      text: "Play again — try the other side."
    }];
  const endingStart = addSceneSequence(scenes, "game-end", endingLines, null);
  scenes[`game-end-${endingLines.length}`].ending = true;

  const decisionChoices = entry.choices.map(choice => {
    const scriptedChoice = scriptEntry.choices?.[choice.id];
    if (!scriptedChoice) {
      throw new Error(`The FULL GAME SCRIPT is missing choice ${choice.id}.`);
    }

    const feedbackId = `feedback-${choice.id}`;
    scenes[feedbackId] = {
      ...scriptedChoice.feedback,
      effect: scriptedChoice.effect || choice.effect,
      next: endingStart
    };

    const outcomeLines = Array.isArray(scriptedChoice.outcome) && scriptedChoice.outcome.length
      ? scriptedChoice.outcome
      : [choice.response];
    const outcomeStart = addSceneSequence(
      scenes,
      `outcome-${choice.id}`,
      outcomeLines,
      feedbackId
    );

    return {
      id: choice.id,
      label: scriptedChoice.label,
      text: scriptedChoice.text,
      next: outcomeStart,
      effect: scriptedChoice.effect || choice.effect,
      score: { [entry.focusDimension]: Number(choice.points || 0) }
    };
  });

  scenes.decision = {
    speaker: "Decision",
    tone: "neutral",
    text: scriptEntry.decisionPrompt || entry.prompt.text,
    choices: decisionChoices
  };

  const scenarioIntro = (scriptEntry.intro || []).map(line => ({ ...line }));
  if (scenarioIntro[0]) {
    scenarioIntro[0].cue = {
      tone: "neutral",
      label: entry.profile.name || "Scenario profile",
      title: entry.profile.headline || entry.title,
      detail: entry.profile.detail || "Observe / Decide / Reflect"
    };
  }

  const introLines = [
    ...(scriptLibrary.titleIntro || []),
    ...(scriptLibrary.roleIntros?.[entry.role] || []),
    ...scenarioIntro
  ];
  const startScene = addSceneSequence(scenes, "intro", introLines, "decision");

  return {
    id: entry.id,
    title: entry.title,
    role: entry.role,
    roleLabel: roleSettings.roleLabel,
    framework: {
      ...frameworkDefinition,
      maxScore: 2
    },
    focusDimension: entry.focusDimension,
    profile: entry.profile,
    characters: {
      manager: { name: "Alex" },
      employee: { name: entry.profile.name || "Jamie" }
    },
    decisionCount: 1,
    followUpThreshold: 50,
    startScene,
    assets: library.assets,
    reflectionPrompts: roleSettings.reflectionPrompts,
    sceneOrder: Object.keys(scenes),
    scenes,
    estimatedDuration: "8-10 minutes",
    difficulty: "Foundational",
    description: entry.description
  };
}

async function loadScenario(role) {
  if (!scenarioLibrary || !fullGameScript) {
    const [libraryResponse, scriptResponse] = await Promise.all([
      fetch(scenarioLibraryFile, { cache: "no-store" }),
      fetch(fullGameScriptFile, { cache: "no-store" })
    ]);
    if (!libraryResponse.ok) throw new Error("Scenario library could not be loaded.");
    if (!scriptResponse.ok) throw new Error("The FULL GAME SCRIPT could not be loaded.");
    [scenarioLibrary, fullGameScript] = await Promise.all([
      libraryResponse.json(),
      scriptResponse.json()
    ]);
  }

  const pool = scenarioLibrary.scenarios?.filter(entry => entry.role === role) || [];
  if (!pool.length) throw new Error("No scenarios are available for this role.");
  return buildRuntimeScenario(chooseRandomScenario(pool, role), scenarioLibrary, fullGameScript);
}

function preloadImage(src) {
  if (!src) return;
  const image = new Image();
  image.decoding = "async";
  image.src = src;
}

function sceneToneFor(scene) {
  return scene?.tone || "neutral";
}

function backgroundForScene(scene) {
  const backgrounds = scenario?.assets?.backgrounds || {};
  return backgrounds[sceneToneFor(scene)] || backgrounds.neutral || "assets/office-vn.webp";
}

function preloadSceneAssets(sceneId) {
  const nextScene = scenes[sceneId];
  if (!nextScene) return;
  preloadImage(backgroundForScene(nextScene));

  if (nextScene.next) preloadImage(backgroundForScene(scenes[nextScene.next]));
  if (Array.isArray(nextScene.choices)) {
    nextScene.choices.forEach(choice => preloadImage(backgroundForScene(scenes[choice.next])));
  }
}

function setSceneEnvironment(scene) {
  const tone = sceneToneFor(scene);
  const background = backgroundForScene(scene);
  const backgroundUrl = new URL(background, document.baseURI).href;
  const nextBackground = `url("${backgroundUrl}")`;

  document.body.dataset.sceneTone = tone;

  if (sceneBackdropEl.style.getPropertyValue("--scene-bg") === nextBackground) return;

  sceneBackdropEl.classList.remove("is-changing");
  void sceneBackdropEl.offsetWidth;
  sceneBackdropEl.style.setProperty("--scene-bg", nextBackground);
  sceneBackdropEl.classList.add("is-changing");
}

function sceneCueFor(scene) {
  if (scene?.cue) return scene.cue;

  const dimensions = scenario?.framework?.dimensions?.map(dimension => dimension.id).join(" / ") || "";
  const hasChoices = Array.isArray(scene?.choices) && scene.choices.length > 0;

  if (scene?.speaker === "Profile") {
    return {
      tone: "neutral",
      label: scenario?.profile?.name || "Scenario profile",
      title: scenario?.profile?.headline || scenario?.title || "Workplace scenario",
      detail: scenario?.profile?.detail || "Observe / Decide / Reflect"
    };
  }

  if (hasChoices) {
    return {
      tone: "neutral",
      label: "Decision " + Math.min(choiceHistory.length + 1, scenario?.decisionCount || 1),
      title: "Choose your response",
      detail: (scenario?.framework?.id || "Framework") + " lens: " + (scenario?.focusDimension || dimensions)
    };
  }

  if (scene?.speaker === "Outcome") {
    return sceneToneFor(scene) === "success"
      ? { tone: "success", label: "Impact", title: "Conversation opens", detail: "Trust / Clarity / Action" }
      : { tone: "tense", label: "Impact", title: "Conversation narrows", detail: "Defence / Low reflection" };
  }

  if (scene?.speaker === "Lesson") {
    return {
      tone: "mentor",
      label: "Coach's note",
      title: "Use behaviour, not labels",
      detail: "Specific / Observable / Fair"
    };
  }

  if (scene?.speaker === "HR Mentor" || / Coach$/.test(scene?.speaker || "")) {
    return {
      tone: "mentor",
      label: "Framework lens",
      title: (scenario?.framework?.id || "Framework") + " coaching",
      detail: dimensions
    };
  }

  const tone = sceneToneFor(scene);
  if (tone === "success") {
    return { tone, label: "Conversation signal", title: "Trust stays open", detail: "Recognition / Clarity / Action" };
  }
  if (tone === "tense") {
    return { tone, label: "Conversation signal", title: "Defence rises", detail: "Intent is overtaking impact" };
  }
  if (tone === "mentor") {
    return { tone, label: "Practice", title: "Pause and apply", detail: dimensions };
  }

  return {
    tone: "neutral",
    label: scene?.speaker || "Scene",
    title: "Performance + impact",
    detail: "Balance both"
  };
}

function setSceneCue(scene) {
  const cue = sceneCueFor(scene);
  sceneCueEl.hidden = false;
  sceneCueEl.dataset.tone = cue.tone;
  sceneCueLabelEl.textContent = cue.label;
  sceneCueTitleEl.textContent = cue.title;
  sceneCueDetailEl.textContent = cue.detail;
}

function renderFrameworkStrip() {
  scoreBreakdownEl.textContent = "";
  if (!scenario?.framework?.dimensions?.length) {
    scoreBreakdownEl.hidden = true;
    return;
  }

  scenario.framework.dimensions.forEach(dimension => {
    const chip = document.createElement("span");
    chip.className = "framework-chip";
    chip.setAttribute("aria-label", dimension.label);

    const letter = document.createElement("strong");
    letter.textContent = dimension.id;

    const name = document.createElement("small");
    name.textContent = dimension.label;

    chip.append(letter, name);
    scoreBreakdownEl.append(chip);
  });

  scoreBreakdownEl.hidden = false;
}

function clearTimers() {
  window.clearTimeout(typingTimer);
  window.clearInterval(talkingTimer);
  typingTimer = null;
  talkingTimer = null;
}

function speakerToCharacter(speaker, focus) {
  if (focus) return focus;
  if (speaker === "Sarah") return "sarah";
  if (speaker === "Manager") return "manager";
  return null;
}

function resetCharacter(element) {
  element.classList.remove("active", "inactive", "visible", "happy", "frustrated", "decision-ready");
  element.src = element.dataset.idle;
}

function setCharacters(scene) {
  const activeCharacter = speakerToCharacter(scene.speaker, scene.focus);
  resetCharacter(managerEl);
  resetCharacter(sarahEl);

  if (activeCharacter === "manager") {
    managerEl.classList.add("visible", "active");
    sarahEl.classList.add("visible", "inactive");
  } else if (activeCharacter === "sarah") {
    sarahEl.classList.add("visible", "active");
    managerEl.classList.add("visible", "inactive");
  } else if (Array.isArray(scene.choices) && scene.choices.length) {
    managerEl.classList.add("visible", "decision-ready");
    sarahEl.classList.add("visible", "decision-ready");
  } else {
    managerEl.classList.add("visible", "inactive");
    sarahEl.classList.add("visible", "inactive");
  }

  if (scene.mood === "happy") document.getElementById(activeCharacter)?.classList.add("happy");
  if (scene.mood === "frustrated") document.getElementById(activeCharacter)?.classList.add("frustrated");
}

function getActiveCharacterElement() {
  if (managerEl.classList.contains("active")) return managerEl;
  if (sarahEl.classList.contains("active")) return sarahEl;
  return null;
}

function startTalking() {
  if (reducedMotion) return;
  const activeElement = getActiveCharacterElement();
  if (!activeElement) return;

  dialoguePanelEl.classList.add("is-speaking");
  let talking = false;
  talkingTimer = window.setInterval(() => {
    talking = !talking;
    activeElement.src = talking ? activeElement.dataset.talk : activeElement.dataset.idle;
  }, 140);
}

function stopTalking() {
  window.clearInterval(talkingTimer);
  talkingTimer = null;
  dialoguePanelEl.classList.remove("is-speaking");
  [managerEl, sarahEl].forEach(element => {
    element.src = element.dataset.idle;
  });
}

function setText(value) {
  textEl.textContent = value;
}

function decisionProgressLabel() {
  if (!scenario) return "Choose a role";
  if (completedAtIso) return "Complete";

  const decisions = scenario.decisionCount || 1;
  const completed = Math.min(choiceHistory.length, decisions);
  return completed + " / " + decisions + " decisions";
}

function updateScoreHud() {
  if (!scenario) {
    scoreHudEl.hidden = true;
    return;
  }

  const progress = progressPercent();
  scoreHudEl.hidden = false;
  roleBadgeEl.textContent = scenario.roleLabel;
  frameworkBadgeEl.textContent = scenario.framework.id;
  scoreProgressEl.style.width = String(progress) + "%";
  scoreProgressEl.parentElement.setAttribute("aria-valuenow", String(progress));
  scenarioProgressTextEl.textContent = decisionProgressLabel();
  scoreTotalEl.hidden = !completedAtIso;
  scoreTotalEl.textContent = completedAtIso ? String(scorePercent()) + "%" : "";
  renderFrameworkStrip();
}
function finishTyping() {
  window.clearTimeout(typingTimer);
  setText(fullText);
  isTyping = false;
  stopTalking();
  const scene = scenes[currentSceneId];
  if (scene.choices) {
    advanceLabelEl.textContent = "Choose a response";
    advanceButton.disabled = true;
    renderChoices(scene.choices);
  } else {
    advanceLabelEl.textContent = pendingNext ? "Continue" : "Restart";
    advanceButton.disabled = false;
  }
  if (scene.ending) showCompletion();
}

function typeText(text) {
  clearTimers();
  fullText = text;
  typedIndex = 0;
  isTyping = true;
  setText("");
  advanceButton.disabled = false;
  advanceLabelEl.textContent = "Reveal";
  startTalking();

  if (reducedMotion) {
    finishTyping();
    return;
  }

  function tick() {
    if (!isTyping) return;
    if (typedIndex >= fullText.length) {
      finishTyping();
      return;
    }

    typedIndex += 1;
    setText(fullText.slice(0, typedIndex));
    const previousCharacter = fullText[typedIndex - 1];
    typingTimer = window.setTimeout(tick, previousCharacter === "\n" ? 0 : textSpeed);
  }

  tick();
}

function applyChoiceScore(choice) {
  const score = choice.score || {};
  Object.entries(score).forEach(([dimension, points]) => {
    scoreState[dimension] = (scoreState[dimension] || 0) + Number(points || 0);
  });

  totalScore = clampScore(totalScore + Object.values(score).reduce((sum, value) => sum + Number(value || 0), 0));
  choiceHistory.push({
    sceneId: currentSceneId,
    choiceId: choice.id,
    effect: choice.effect || "neutral",
    score: { ...score },
    totalAfter: totalScore
  });
  updateScoreHud();
  saveScenarioRecord("in_progress");
}

function renderChoices(choices) {
  choicesEl.textContent = "";
  choicesEl.hidden = false;

  choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.type = "button";
    button.setAttribute("aria-label", "Choice " + (choice.label || index + 1) + ": " + choice.text);

    const key = document.createElement("span");
    key.className = "choice-key";
    key.textContent = choice.label || String(index + 1);

    const copy = document.createElement("span");
    copy.className = "choice-copy";
    copy.textContent = choice.text;

    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    arrow.setAttribute("viewBox", "0 0 24 24");
    arrow.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M5 12h13m-5-5 5 5-5 5");
    arrow.append(path);

    button.append(key, copy, arrow);
    button.addEventListener("click", () => {
      applyChoiceScore(choice);
      renderScene(choice.next);
    });
    choicesEl.append(button);
    notifyMotion("motion:content-added", { element: button });
  });

  choicesEl.querySelector("button")?.focus({ preventScroll: true });
}

function hideChoices() {
  choicesEl.hidden = true;
  choicesEl.textContent = "";
}

function renderScene(id) {
  const scene = scenes[id] || scenes[scenario.startScene];
  currentSceneId = id;
  pendingNext = scene.next || null;
  hideChoices();
  resultEl.hidden = true;
  reflectionPanelEl.hidden = true;
  speakerNameEl.textContent = scene.speaker;

  if (scene.choices) {
    const decisions = scenario.decisionCount || 1;
    sceneCountEl.textContent = `Decision ${Math.min(choiceHistory.length + 1, decisions)} of ${decisions}`;
  } else {
    sceneCountEl.textContent = scenario?.estimatedDuration ? scenario.estimatedDuration : "Interactive scenario";
  }

  document.body.dataset.scenarioState = "playing";
  setSceneEnvironment(scene);
  setSceneCue(scene);
  preloadSceneAssets(scene.next);
  if (Array.isArray(scene.choices)) scene.choices.forEach(choice => preloadSceneAssets(choice.next));
  setCharacters(scene);
  updateScoreHud();
  typeText(scene.displayText || scene.text);
}

function completionCopy() {
  const percent = scorePercent();
  if (percent >= 80) return "Strong application of the framework.";
  if (percent >= (scenario.followUpThreshold || 65)) return "Good progress, with a few skills to practise.";
  return "Follow-up support is recommended.";
}

function addListItem(list, text) {
  const item = document.createElement("li");
  item.textContent = text;
  list.append(item);
}

function renderEvaluationDetails() {
  const details = buildFrameworkDetails();
  scoreDetailsEl.textContent = "";
  strengthsListEl.textContent = "";
  improvementListEl.textContent = "";

  details.forEach(detail => {
    const card = document.createElement("article");
    card.className = `evaluation-card ${detail.tone}`;

    const header = document.createElement("header");
    const heading = document.createElement("h3");
    heading.textContent = detail.label;
    const score = document.createElement("strong");
    score.textContent = `${detail.score}/${detail.maxScore}`;
    header.append(heading, score);

    const meter = document.createElement("div");
    meter.className = "evaluation-meter";
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", detail.label);
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", String(detail.percent));
    const meterFill = document.createElement("span");
    meterFill.style.width = String(detail.percent) + "%";
    meter.append(meterFill);

    const explanation = document.createElement("p");
    explanation.textContent = detail.explanation;
    card.append(header, meter, explanation);
    scoreDetailsEl.append(card);

    if (detail.percent >= 70) {
      addListItem(strengthsListEl, detail.label);
    } else {
      addListItem(improvementListEl, detail.label);
    }
  });

  if (!strengthsListEl.children.length) {
    addListItem(strengthsListEl, "Scenario completed");
  }

  if (!improvementListEl.children.length) {
    addListItem(improvementListEl, "Keep practising");
  }
}

function renderReflectionFields() {
  reflectionFieldsEl.textContent = "";
  scenario.reflectionPrompts.forEach(prompt => {
    const label = document.createElement("label");
    label.className = "reflection-field";
    label.htmlFor = `reflection-${prompt.id}`;

    const span = document.createElement("span");
    span.textContent = prompt.label;

    const textarea = document.createElement("textarea");
    textarea.id = `reflection-${prompt.id}`;
    textarea.name = prompt.id;
    textarea.rows = 3;
    textarea.value = reflectionAnswers[prompt.id] || "";
    textarea.maxLength = 600;

    label.append(span, textarea);
    reflectionFieldsEl.append(label);
  });
}

function revealScenarioCompletion(percent) {
  document.body.dataset.scenarioState = "complete";
  scoreHudEl.hidden = true;
  sceneCueEl.hidden = true;
  scoreRingValueEl.textContent = String(percent) + "%";
  scoreRingEl.style.setProperty("--score-angle", String(percent * 3.6) + "deg");
  reflectionTitleEl.textContent = scenario.framework.id + " result";
  reflectionSummaryEl.textContent = completionCopy();
  frameworkResultEl.textContent = totalScore + "/" + scenario.framework.maxScore + " / " + (needsFollowUp() ? "Follow-up suggested" : "On track");
  scenarioRewardTitleEl.textContent = scenario.title;
  scenarioRewardDetailEl.textContent = scenario.framework.id + " · " + String(percent) + "%";
  renderEvaluationDetails();
  renderReflectionFields();
  reflectionPanelEl.hidden = false;
  notifyMotion("motion:content-added", { element: reflectionPanelEl });
}

function runScenarioCompletionWipe(title, onCovered) {
  if (!scenarioWipeEl || reducedMotion) {
    onCovered();
    return;
  }

  scenarioWipeTitleEl.textContent = title;
  scenarioWipeEl.hidden = false;
  scenarioWipeEl.classList.remove("is-active");
  void scenarioWipeEl.offsetWidth;
  scenarioWipeEl.classList.add("is-active");

  window.setTimeout(onCovered, 360);
  window.setTimeout(() => {
    scenarioWipeEl.classList.remove("is-active");
    scenarioWipeEl.hidden = true;
  }, 860);
}

function showCompletion() {
  if (!scenario || completionShown) return;
  completionShown = true;
  completedAtIso = completedAtIso || new Date().toISOString();
  updateScoreHud();

  const percent = scorePercent();
  saveScenarioRecord("completed");
  runScenarioCompletionWipe(scenario.title, () => revealScenarioCompletion(percent));
}
function restartScenario() {
  clearTimers();
  document.body.dataset.scenarioState = "role";
  dialoguePanelEl.classList.remove("is-speaking");
  sceneCueEl.hidden = true;
  scenario = null;
  scenes = {};
  sceneOrder = [];
  currentSceneId = "";
  pendingNext = null;
  fullText = "";
  isTyping = false;
  completionShown = false;
  hideChoices();
  reflectionPanelEl.hidden = true;
  scenarioWipeEl.classList.remove("is-active");
  scenarioWipeEl.hidden = true;
  resultEl.hidden = true;
  scoreHudEl.hidden = true;
  rolePanelEl.hidden = false;
  scenarioTitleEl.textContent = "EchoWorks";
  managerEl.alt = "Manager character";
  sarahEl.alt = "Employee character";
  speakerNameEl.textContent = "Role";
  sceneCountEl.textContent = "";
  setText("Every day, someone has to speak. And someone has to listen.");
  setSceneEnvironment({ tone: "neutral" });
  setCharacters({ speaker: "Scene" });
}

async function selectRole(role) {
  setRoleMessage("Loading your scenario...", "neutral");
  rolePanelEl.setAttribute("aria-busy", "true");
  rolePanelEl.querySelectorAll("button").forEach(button => { button.disabled = true; });

  try {
    const nextScenario = await loadScenario(role);
    scenario = nextScenario;
    scenes = nextScenario.scenes;
    sceneOrder = nextScenario.sceneOrder || Object.keys(scenes);
    scenarioTitleEl.textContent = nextScenario.title;
    managerEl.alt = `${nextScenario.characters?.manager?.name || "Manager"} character`;
    sarahEl.alt = `${nextScenario.characters?.employee?.name || "Employee"} character`;
    initialiseScoreState(nextScenario);
    document.body.dataset.scenarioState = "playing";
    rolePanelEl.hidden = true;
    setRoleMessage(currentUser ? "Cloud sync is ready." : "Signed out: this scenario saves on this device only.", currentUser ? "success" : "neutral");
    updateScoreHud();
    await saveScenarioRecord("in_progress");
    renderScene(nextScenario.startScene);
    notifyMotion("motion:content-added", { element: scoreHudEl });
  } catch (error) {
    setRoleMessage(error.message || "Scenario could not be loaded.", "error");
  } finally {
    rolePanelEl.setAttribute("aria-busy", "false");
    rolePanelEl.querySelectorAll("button").forEach(button => { button.disabled = false; });
  }
}

function advanceScene() {
  if (!scenario) return;

  if (isTyping) {
    finishTyping();
    return;
  }

  const scene = scenes[currentSceneId];
  if (scene?.choices) {
    choicesEl.querySelector("button")?.focus({ preventScroll: true });
    return;
  }

  if (scene?.ending) {
    showCompletion();
    return;
  }

  if (pendingNext) {
    renderScene(pendingNext);
    return;
  }

  restartScenario();
}

async function saveReflection(event) {
  event.preventDefault();
  if (!scenario) return;

  reflectionAnswers = {};
  scenario.reflectionPrompts.forEach(prompt => {
    reflectionAnswers[prompt.id] = String(reflectionFormEl.elements[prompt.id]?.value || "").trim();
  });

  await saveScenarioRecord("completed");
  reflectionMessageEl.textContent = currentUser
    ? "Reflection saved to your training record."
    : "Reflection saved on this device.";
  reflectionMessageEl.classList.add("success");
}

async function initFirebase() {
  try {
    firebaseClient = await loadFirebaseClient();
    firebaseClient.onAuthStateChanged(firebaseClient.auth, user => {
      currentUser = user;
      if (scenario) saveScenarioRecord(completedAtIso ? "completed" : "in_progress");
      setRoleMessage(user ? "Cloud sync is ready." : "Signed out: scenario saves on this device only.", user ? "success" : "neutral");
    });
  } catch (error) {
    setRoleMessage(error.message || "Scenario progress will save locally only.", "neutral");
  }
}

function bindEvents() {
  rolePanelEl.addEventListener("click", event => {
    const button = event.target.closest("[data-role]");
    if (button) selectRole(button.dataset.role);
  });

  advanceButton.addEventListener("click", advanceScene);
  reflectionFormEl.addEventListener("submit", saveReflection);

  sceneBackdropEl.addEventListener("animationend", () => sceneBackdropEl.classList.remove("is-changing"));

  document.querySelector('[data-action="restart"]').addEventListener("click", restartScenario);
  document.querySelector('[data-action="restart-route"]').addEventListener("click", restartScenario);

  document.addEventListener("keydown", event => {
    const target = event.target;
    const isTypingField = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;
    const isButton = target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement;
    if (isTypingField || isButton || !scenario) return;

    if (!choicesEl.hidden && /^[1-3a-c]$/i.test(event.key)) {
      event.preventDefault();
      const index = /^[a-c]$/i.test(event.key)
        ? event.key.toLowerCase().charCodeAt(0) - 97
        : Number(event.key) - 1;
      choicesEl.querySelectorAll("button")[index]?.click();
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      advanceScene();
    }
  });
}

bindEvents();
restartScenario();
window.setTimeout(() => { initFirebase(); }, 1200);
