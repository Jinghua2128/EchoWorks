import { loadFirebaseClient } from "./firebase-client.js";

const scenarioFiles = {
  manager: "assets/data/scenarios/sarah-manager.json",
  employee: "assets/data/scenarios/sarah-employee.json"
};

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
const resultEl = document.getElementById("result");
const advanceButton = document.querySelector('[data-action="advance"]');
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

let firebaseClient = null;
let currentUser = null;
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

  return Math.max(1, maxFromChoices);
}

function dimensionPercent(dimensionId) {
  return Math.round(((scoreState[dimensionId] || 0) / dimensionMax(dimensionId)) * 100);
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
    const percent = dimensionPercent(dimension.id);
    return {
      id: dimension.id,
      label: dimension.label,
      score: scoreState[dimension.id] || 0,
      maxScore: dimensionMax(dimension.id),
      percent,
      tone: dimensionTone(percent),
      explanation: feedbackForDimension(dimension)
    };
  });
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

async function loadScenario(role) {
  const file = scenarioFiles[role];
  if (!file) throw new Error("Choose a valid role.");

  const response = await fetch(file, { cache: "no-store" });
  if (!response.ok) throw new Error("Scenario data could not be loaded.");
  return await response.json();
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
  const nextBackground = `url("${background}")`;

  document.body.dataset.sceneTone = tone;

  if (sceneBackdropEl.style.getPropertyValue("--scene-bg") === nextBackground) return;

  sceneBackdropEl.classList.remove("is-changing");
  void sceneBackdropEl.offsetWidth;
  sceneBackdropEl.style.setProperty("--scene-bg", nextBackground);
  sceneBackdropEl.classList.add("is-changing");
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
  element.classList.remove("active", "inactive", "visible", "happy", "frustrated");
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

  let talking = false;
  talkingTimer = window.setInterval(() => {
    talking = !talking;
    activeElement.src = talking ? activeElement.dataset.talk : activeElement.dataset.idle;
  }, 140);
}

function stopTalking() {
  window.clearInterval(talkingTimer);
  talkingTimer = null;
  [managerEl, sarahEl].forEach(element => {
    element.src = element.dataset.idle;
  });
}

function setText(value) {
  textEl.textContent = value;
}

function decisionProgressLabel() {
  if (!scenario) return "Choose a role to start.";
  if (completedAtIso) return "Scenario complete. Review your reflection below.";

  const decisions = scenario.decisionCount || 1;
  const completed = Math.min(choiceHistory.length, decisions);
  const nextDecision = Math.min(completed + 1, decisions);
  return `${completed} of ${decisions} decisions completed. Decision ${nextDecision} is ${completed >= decisions ? "complete" : "next"}.`;
}

function updateScoreHud() {
  if (!scenario) {
    scoreHudEl.hidden = true;
    return;
  }

  const progress = progressPercent();
  scoreHudEl.hidden = false;
  roleBadgeEl.textContent = `${scenario.roleLabel} route`;
  frameworkBadgeEl.textContent = `${scenario.framework.id} framework`;
  scoreProgressEl.style.width = `${progress}%`;
  scoreProgressEl.parentElement.setAttribute("aria-valuenow", String(progress));
  scenarioProgressTextEl.textContent = decisionProgressLabel();
  scoreTotalEl.textContent = completedAtIso
    ? `Final result: ${scorePercent()}%`
    : "Scoring is evaluated quietly and shown at the end.";
  scoreBreakdownEl.hidden = true;
}

function finishTyping() {
  window.clearTimeout(typingTimer);
  setText(fullText);
  isTyping = false;
  stopTalking();
  const scene = scenes[currentSceneId];
  if (scene.choices) {
    advanceButton.textContent = "Choose a response";
    advanceButton.disabled = true;
    renderChoices(scene.choices);
  } else {
    advanceButton.textContent = pendingNext ? "Continue" : "Restart";
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
  advanceButton.textContent = "Reveal text";
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

  choices.forEach(choice => {
    const button = document.createElement("button");
    button.className = "choice-button";
    button.type = "button";
    button.textContent = choice.text;
    button.addEventListener("click", () => {
      applyChoiceScore(choice);
      renderScene(choice.next);
    });
    choicesEl.append(button);
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

  setSceneEnvironment(scene);
  preloadSceneAssets(scene.next);
  if (Array.isArray(scene.choices)) scene.choices.forEach(choice => preloadSceneAssets(choice.next));
  setCharacters(scene);
  updateScoreHud();
  typeText(scene.text);
}

function completionCopy() {
  const percent = scorePercent();
  if (percent >= 80) return "Strong application. Your decisions showed confident use of the framework and created space for a constructive workplace conversation.";
  if (percent >= (scenario.followUpThreshold || 65)) return "Developing application. You showed useful strengths and a few areas to practise in future feedback conversations.";
  return "Additional support recommended. This route highlights useful practice areas that can be strengthened through coaching or review.";
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

    const explanation = document.createElement("p");
    explanation.textContent = detail.explanation;
    card.append(header, explanation);
    scoreDetailsEl.append(card);

    if (detail.percent >= 70) {
      addListItem(strengthsListEl, `${detail.label}: ${detail.explanation}`);
    } else {
      addListItem(improvementListEl, `${detail.label}: ${detail.explanation}`);
    }
  });

  if (!strengthsListEl.children.length) {
    addListItem(strengthsListEl, "You completed the scenario and created a record for reflection. That is a useful first step for learning.");
  }

  if (!improvementListEl.children.length) {
    addListItem(improvementListEl, "Keep practising the framework in different workplace situations so the behaviour becomes consistent.");
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

function showCompletion() {
  if (!scenario || completionShown) return;
  completionShown = true;
  completedAtIso = completedAtIso || new Date().toISOString();
  updateScoreHud();

  reflectionTitleEl.textContent = `${scenario.framework.id} result: ${scorePercent()}%`;
  reflectionSummaryEl.textContent = completionCopy();
  frameworkResultEl.textContent = `${totalScore} of ${scenario.framework.maxScore} points | ${progressPercent()}% complete | ${needsFollowUp() ? "Follow-up support suggested" : "No urgent follow-up signal"}`;
  renderEvaluationDetails();
  renderReflectionFields();
  reflectionPanelEl.hidden = false;
  saveScenarioRecord("completed");
}

function restartScenario() {
  clearTimers();
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
  resultEl.hidden = true;
  scoreHudEl.hidden = true;
  rolePanelEl.hidden = false;
  speakerNameEl.textContent = "Role";
  sceneCountEl.textContent = "";
  setText("Choose Manager or Employee to begin the workplace learning scenario.");
  setSceneEnvironment({ tone: "neutral" });
  setCharacters({ speaker: "Scene" });
}

async function selectRole(role) {
  setRoleMessage("Loading your scenario...", "neutral");
  rolePanelEl.querySelectorAll("button").forEach(button => { button.disabled = true; });

  try {
    const nextScenario = await loadScenario(role);
    scenario = nextScenario;
    scenes = nextScenario.scenes;
    sceneOrder = nextScenario.sceneOrder || Object.keys(scenes);
    initialiseScoreState(nextScenario);
    rolePanelEl.hidden = true;
    setRoleMessage(currentUser ? "Cloud sync is ready." : "Signed out: this scenario saves on this device only.", currentUser ? "success" : "neutral");
    updateScoreHud();
    await saveScenarioRecord("in_progress");
    renderScene(nextScenario.startScene);
  } catch (error) {
    setRoleMessage(error.message || "Scenario could not be loaded.", "error");
  } finally {
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

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      advanceScene();
    }
  });
}

bindEvents();
restartScenario();
window.setTimeout(() => { initFirebase(); }, 1200);

