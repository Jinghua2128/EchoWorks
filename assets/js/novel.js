import { ensureFirestore, loadFirebaseAuthClient } from "./firebase-client.js";
import { choiceClassification, prepareVisibleSceneLines } from "./scenario-engine.js";
import {
  completionForRole,
  mergeCloudScenarioRecords,
  nextAttemptNumber,
  readLocalScenarioRecords,
  retryPendingScenarioRecords,
  safeJsonParse,
  saveScenarioRecordWithStatus,
  scenarioRecordsToMap,
  scenarioStorageKeys
} from "./progress-store.js";

const scenarioLibraryFile = "assets/data/scenarios/scenario-library.json";
const fullGameScriptFile = "assets/data/scenarios/full-game-script.json";
const lastScenarioKey = scenarioStorageKeys.recentByRole;
const anonymousPlayerKey = scenarioStorageKeys.anonymousPlayerId;
const soundPreferenceKey = "feedbackPlaybook.dialogueSound";
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
const dialogueAnnouncementEl = document.getElementById("dialogueAnnouncement");
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
const soundToggleEl = document.getElementById("soundToggle");

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
let anonymousPlayerId = "";
let attemptId = "";
let attemptNumber = 1;
let attemptStartedAtIso = null;
let decisionShownAtMs = null;
let choiceResponseTimeMs = null;
let feedbackCardViewed = false;
let playAgainSelected = false;
let replayedSamePath = false;
let triedOtherRole = false;
let exitPoint = "role_selection";
let dialogueAudioContext = null;
let dialogueSoundEnabled = localStorage.getItem(soundPreferenceKey) !== "off";
const activeDialogueOscillators = new Set();
let resolveInitialHistory;
const initialHistoryReady = new Promise(resolve => { resolveInitialHistory = resolve; });

function notifyMotion(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}


function audioContextConstructor() {
  return window.AudioContext || window.webkitAudioContext || null;
}

function updateSoundToggle() {
  if (!soundToggleEl) return;
  const supported = Boolean(audioContextConstructor());
  soundToggleEl.disabled = !supported;
  soundToggleEl.setAttribute("aria-pressed", String(dialogueSoundEnabled && supported));
  const label = supported
    ? (dialogueSoundEnabled ? "Mute dialogue sounds" : "Play dialogue sounds")
    : "Dialogue sounds are not supported in this browser";
  soundToggleEl.setAttribute("aria-label", label);
  soundToggleEl.title = label;
}

async function unlockDialogueAudio() {
  if (!dialogueSoundEnabled) return null;
  const AudioContextClass = audioContextConstructor();
  if (!AudioContextClass) return null;

  if (!dialogueAudioContext) dialogueAudioContext = new AudioContextClass();
  if (dialogueAudioContext.state === "suspended") {
    await dialogueAudioContext.resume().catch(() => {});
  }
  return dialogueAudioContext;
}

function stopDialogueSounds() {
  activeDialogueOscillators.forEach(oscillator => {
    try {
      oscillator.stop();
    } catch {
      // The oscillator may already have ended.
    }
  });
  activeDialogueOscillators.clear();
}

function playDialogueTone(frequency, duration, volume, type = "sine", delay = 0) {
  if (!dialogueSoundEnabled || !dialogueAudioContext || dialogueAudioContext.state !== "running") return;

  const now = dialogueAudioContext.currentTime + delay;
  const oscillator = dialogueAudioContext.createOscillator();
  const gain = dialogueAudioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(dialogueAudioContext.destination);
  oscillator.addEventListener("ended", () => activeDialogueOscillators.delete(oscillator), { once: true });
  activeDialogueOscillators.add(oscillator);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.01);
}

function playLineCue() {
  playDialogueTone(330, 0.055, 0.014, "sine");
  playDialogueTone(470, 0.07, 0.01, "sine", 0.025);
}

function playTypingBlip(character, index) {
  if (!character || /\s/.test(character) || index % 3 !== 0) return;
  const pitch = 390 + (character.codePointAt(0) % 8) * 18;
  playDialogueTone(pitch, 0.022, 0.006, "triangle");
}

async function toggleDialogueSound() {
  dialogueSoundEnabled = !dialogueSoundEnabled;
  localStorage.setItem(soundPreferenceKey, dialogueSoundEnabled ? "on" : "off");
  if (!dialogueSoundEnabled) {
    stopDialogueSounds();
  } else {
    await unlockDialogueAudio();
    playLineCue();
  }
  updateSoundToggle();
}
function readLocalResults() {
  return scenarioRecordsToMap(readLocalScenarioRecords());
}

function persistentAnonymousPlayerId() {
  const existing = localStorage.getItem(anonymousPlayerKey);
  if (existing) return existing;

  const generated = window.crypto?.randomUUID
    ? window.crypto.randomUUID()
    : `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(anonymousPlayerKey, generated);
  return generated;
}

function initialiseAttemptTracking(nextScenario) {
  const previousResults = Object.values(readLocalResults());

  anonymousPlayerId = persistentAnonymousPlayerId();
  attemptNumber = nextAttemptNumber(previousResults, nextScenario.id);
  attemptId = `${nextScenario.id}_attempt_${attemptNumber}_${Date.now()}`;
  attemptStartedAtIso = new Date().toISOString();
  decisionShownAtMs = null;
  choiceResponseTimeMs = null;
  feedbackCardViewed = false;
  playAgainSelected = false;
  replayedSamePath = previousResults.some(result => result.selectedRole === nextScenario.role);
  triedOtherRole = previousResults.some(result => result.selectedRole && result.selectedRole !== nextScenario.role);
  exitPoint = "path_started";
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


function selectedChoiceSummary() {
  const selected = choiceHistory.at(-1);
  const optionScore = selected
    ? Object.values(selected.score || {}).reduce((sum, value) => sum + Number(value || 0), 0)
    : null;
  return { selected, optionScore };
}

function pathCompletionSnapshot(status) {
  const records = Object.values(readLocalResults());
  if (status === "completed") {
    records.push({ scenarioId: scenario.id, selectedRole: scenario.role, completed: true });
  }
  return completionForRole(records, scenario.role, scenarioLibrary?.scenarios || []);
}

function buildScenarioRecord(status = "in_progress") {
  const nowIso = new Date().toISOString();
  const { selected, optionScore } = selectedChoiceSummary();
  const pathProgress = pathCompletionSnapshot(status);
  const frameworkDimension = scenario.framework.dimensions.find(dimension => dimension.id === scenario.focusDimension);
  return {
    uid: currentUser?.uid || null,
    email: currentUser?.email || "Guest learner",
    anonymousPlayerId,
    attemptId,
    attemptNumber,
    attemptStartedAtIso,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    selectedRole: scenario.role,
    frameworkId: scenario.framework.id,
    frameworkDimensionId: scenario.focusDimension,
    frameworkDimension: frameworkDimension?.label || scenario.focusDimension,
    optionSelected: selected?.optionLabel || null,
    optionId: selected?.choiceId || null,
    optionScore,
    choiceClassification: optionScore === null ? null : choiceClassification(optionScore),
    choiceResponseTimeMs,
    progressStatus: status,
    progressPercent: progressPercent(),
    completed: status === "completed",
    scenarioCompleted: status === "completed",
    pathStarted: true,
    pathCompleted: pathProgress.pathCompleted,
    pathCompletedScenarioCount: pathProgress.completedScenarioCount,
    pathScenarioCount: pathProgress.totalScenarioCount,
    completedAtIso,
    completionDateTime: completedAtIso,
    playAgainSelected,
    feedbackCardViewed,
    replayedSamePath,
    triedOtherRole,
    exitPoint,
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
      optionLabel: choice.optionLabel,
      optionScore: choice.optionScore,
      classification: choice.classification,
      choiceResponseTimeMs: choice.choiceResponseTimeMs,
      effect: choice.effect,
      score: choice.score,
      totalAfter: choice.totalAfter
    })),
    reflectionAnswers: { ...reflectionAnswers }
  };
}

async function saveScenarioRecord(status = "in_progress") {
  if (!scenario) return null;

  const outcome = await saveScenarioRecordWithStatus({
    record: buildScenarioRecord(status),
    firebaseClient,
    user: currentUser
  });

  if (!outcome.local.ok) {
    setRoleMessage("Progress could not be saved on this device. Check browser storage and try again.", "error");
  } else if (currentUser && !outcome.cloud.ok) {
    setRoleMessage("Saved on this device. Cloud sync is pending; use Retry sync when your connection is available.", "error");
  } else if (currentUser && outcome.cloud.ok) {
    setRoleMessage("Saved to your training record.", "success");
  } else {
    setRoleMessage("Saved on this device only.", "neutral");
  }

  return outcome;
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
  const completedIds = new Set(
    Object.values(readLocalResults())
      .filter(result => result.selectedRole === role && result.completed)
      .map(result => result.scenarioId)
  );
  const unseen = pool.filter(entry => !completedIds.has(entry.id));
  const availablePool = unseen.length ? unseen : pool;
  const candidates = availablePool.length > 1
    ? availablePool.filter(entry => entry.id !== recent[role])
    : availablePool;
  const selected = candidates[randomIndex(candidates.length)];

  recent[role] = selected.id;
  localStorage.setItem(lastScenarioKey, JSON.stringify(recent));
  return selected;
}
function addSceneSequence(target, prefix, lines, nextId) {
  const visibleLines = prepareVisibleSceneLines(lines);
  let next = nextId;
  for (let index = visibleLines.length - 1; index >= 0; index -= 1) {
    const id = `${prefix}-${index + 1}`;
    target[id] = {
      ...visibleLines[index],
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
  const visibleEndingLines = prepareVisibleSceneLines(endingLines);
  const endingStart = addSceneSequence(scenes, "game-end", visibleEndingLines, null);
  scenes[`game-end-${visibleEndingLines.length}`].ending = true;

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
      fetch(`${scenarioLibraryFile}?v=20260724`),
      fetch(`${fullGameScriptFile}?v=20260724`)
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
  if (dialogueAnnouncementEl) {
    const speaker = speakerNameEl.textContent.trim();
    dialogueAnnouncementEl.textContent = speaker ? `${speaker}: ${fullText}` : fullText;
  }
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
  playLineCue();
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
    playTypingBlip(previousCharacter, typedIndex);
    typingTimer = window.setTimeout(tick, previousCharacter === "\n" ? 0 : textSpeed);
  }

  tick();
}

function applyChoiceScore(choice) {
  const score = choice.score || {};
  const optionScore = Object.values(score).reduce((sum, value) => sum + Number(value || 0), 0);
  choiceResponseTimeMs = decisionShownAtMs === null
    ? null
    : Math.max(0, Math.round(performance.now() - decisionShownAtMs));
  exitPoint = "choice_selected";
  Object.entries(score).forEach(([dimension, points]) => {
    scoreState[dimension] = (scoreState[dimension] || 0) + Number(points || 0);
  });

  totalScore = clampScore(totalScore + Object.values(score).reduce((sum, value) => sum + Number(value || 0), 0));
  choiceHistory.push({
    sceneId: currentSceneId,
    choiceId: choice.id,
    optionLabel: choice.label || null,
    optionScore,
    classification: choiceClassification(optionScore),
    choiceResponseTimeMs,
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

  let nextExitPoint = "scene";
  if (id === "decision") nextExitPoint = "decision";
  else if (id.startsWith("outcome-")) nextExitPoint = "outcome";
  else if (id.startsWith("feedback-")) nextExitPoint = "feedback_card";
  else if (id.startsWith("game-end-")) nextExitPoint = "ending";
  else if (id.startsWith("intro-")) nextExitPoint = "introduction";

  const phaseChanged = exitPoint !== nextExitPoint;
  exitPoint = nextExitPoint;
  if (id === "decision") decisionShownAtMs = performance.now();
  if (id.startsWith("feedback-")) feedbackCardViewed = true;
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
  if (phaseChanged) saveScenarioRecord("in_progress");
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
    textarea.minLength = 3;
    textarea.required = true;
    textarea.setAttribute("aria-describedby", "reflectionMessage");
    textarea.setAttribute("aria-invalid", "false");
    textarea.addEventListener("input", () => textarea.setAttribute("aria-invalid", "false"));

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
  const pathProgress = pathCompletionSnapshot("completed");
  const classification = choiceClassification(totalScore);
  const classificationLabel = classification === "partial" ? "Partial / risky" : classification[0].toUpperCase() + classification.slice(1);
  frameworkResultEl.textContent = totalScore + "/2 | " + classificationLabel + " | " + pathProgress.completedScenarioCount + "/" + pathProgress.totalScenarioCount + " path scenarios";
  scenarioRewardTitleEl.textContent = scenario.title;
  scenarioRewardDetailEl.textContent = scenario.framework.id + " | " + String(percent) + "%";  renderEvaluationDetails();
  renderReflectionFields();
  reflectionPanelEl.hidden = false;
  notifyMotion("motion:content-added", { element: reflectionPanelEl });
  window.requestAnimationFrame(() => {
    reflectionTitleEl.setAttribute("tabindex", "-1");
    reflectionTitleEl.focus({ preventScroll: true });
  });
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
  exitPoint = "completed";
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
  window.requestAnimationFrame(() => {
    const roleTitle = document.getElementById("roleTitle");
    roleTitle?.setAttribute("tabindex", "-1");
    roleTitle?.focus({ preventScroll: true });
  });
}

async function selectRole(role) {
  setRoleMessage("Loading your scenario...", "neutral");
  rolePanelEl.setAttribute("aria-busy", "true");
  rolePanelEl.querySelectorAll("button").forEach(button => { button.disabled = true; });

  try {
    await Promise.race([
      initialHistoryReady,
      new Promise(resolve => window.setTimeout(resolve, 3500))
    ]);
    const nextScenario = await loadScenario(role);
    scenario = nextScenario;
    scenes = nextScenario.scenes;
    sceneOrder = nextScenario.sceneOrder || Object.keys(scenes);
    scenarioTitleEl.textContent = nextScenario.title;
    managerEl.alt = `${nextScenario.characters?.manager?.name || "Manager"} character`;
    sarahEl.alt = `${nextScenario.characters?.employee?.name || "Employee"} character`;
    initialiseScoreState(nextScenario);
    initialiseAttemptTracking(nextScenario);
    document.body.dataset.scenarioState = "playing";
    rolePanelEl.hidden = true;
    setRoleMessage("Preparing your training record...", "neutral");
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

  const invalidField = scenario.reflectionPrompts
    .map(prompt => reflectionFormEl.elements[prompt.id])
    .find(field => String(field?.value || "").trim().length < 3);
  if (invalidField) {
    invalidField.setAttribute("aria-invalid", "true");
    reflectionMessageEl.textContent = "Write a short response for each reflection question before saving.";
    reflectionMessageEl.classList.remove("success");
    invalidField.focus();
    return;
  }

  reflectionAnswers = {};
  scenario.reflectionPrompts.forEach(prompt => {
    reflectionAnswers[prompt.id] = String(reflectionFormEl.elements[prompt.id]?.value || "").trim();
  });

  const outcome = await saveScenarioRecord("completed");
  if (currentUser && outcome?.cloud.ok) {
    reflectionMessageEl.textContent = "Reflection saved to your training record.";
    reflectionMessageEl.classList.add("success");
  } else if (outcome?.local.ok) {
    reflectionMessageEl.textContent = currentUser
      ? "Reflection saved on this device. Cloud sync is pending."
      : "Reflection saved on this device.";
    reflectionMessageEl.classList.toggle("success", !currentUser);
  } else {
    reflectionMessageEl.textContent = "Reflection could not be saved. Check browser storage and try again.";
    reflectionMessageEl.classList.remove("success");
  }
}

async function syncPendingScenarioRecords() {
  if (!firebaseClient || !currentUser) {
    setRoleMessage("Sign in from the main app to sync this device's training records.", "neutral");
    return [];
  }
  setRoleMessage("Syncing saved progress...", "neutral");
  const outcomes = await retryPendingScenarioRecords({ firebaseClient, user: currentUser });
  await mergeCloudScenarioRecords(firebaseClient, currentUser);
  const failed = outcomes.filter(outcome => !outcome.ok);
  setRoleMessage(
    failed.length ? "Some records are still saved locally. Try sync again when the connection improves." : "Training records are up to date.",
    failed.length ? "error" : "success"
  );
  return outcomes;
}

async function initFirebase() {
  try {
    firebaseClient = await loadFirebaseAuthClient();
    firebaseClient.onAuthStateChanged(firebaseClient.auth, async user => {
      currentUser = user;
      if (!user) {
        resolveInitialHistory();
        setRoleMessage("Signed out: scenario progress stays on this device.", "neutral");
        return;
      }

      try {
        firebaseClient = await ensureFirestore(firebaseClient);
        await mergeCloudScenarioRecords(firebaseClient, user);
        await syncPendingScenarioRecords();
        resolveInitialHistory();
        if (scenario) await saveScenarioRecord(completedAtIso ? "completed" : "in_progress");
      } catch {
        resolveInitialHistory();
        setRoleMessage("Cloud progress could not be loaded. Local progress is still available.", "error");
      }
    });
  } catch {
    resolveInitialHistory();
    setRoleMessage("Cloud sync is unavailable. Scenario progress will save on this device.", "neutral");
  }
}
function bindEvents() {
  updateSoundToggle();
  document.addEventListener("pointerdown", () => { unlockDialogueAudio(); }, { once: true, capture: true });
  document.addEventListener("keydown", () => { unlockDialogueAudio(); }, { once: true, capture: true });
  soundToggleEl?.addEventListener("click", () => { toggleDialogueSound(); });

  rolePanelEl.addEventListener("click", event => {
    const button = event.target.closest("[data-role]");
    if (button) selectRole(button.dataset.role);
  });

  advanceButton.addEventListener("click", advanceScene);
  reflectionFormEl.addEventListener("submit", saveReflection);
  document.querySelector('[data-action="retry-sync"]')?.addEventListener("click", () => {
    syncPendingScenarioRecords().catch(() => setRoleMessage("Cloud sync is still unavailable. Local progress is safe.", "error"));
  });

  sceneBackdropEl.addEventListener("animationend", () => sceneBackdropEl.classList.remove("is-changing"));

  const replayAndRestart = async () => {
    if (scenario && completedAtIso) {
      playAgainSelected = true;
      await saveScenarioRecord("completed");
    }
    restartScenario();
  };
  document.querySelector('[data-action="restart"]').addEventListener("click", replayAndRestart);
  document.querySelector('[data-action="restart-route"]').addEventListener("click", replayAndRestart);

  document.addEventListener("keydown", event => {
    const target = event.target;
    const isTypingField = target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement || target instanceof HTMLSelectElement;
    const isInteractive = target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement || target?.isContentEditable;
    const scenarioIsActive = scenario && !document.body.matches('[data-scenario-state="complete"]');
    if (isTypingField || isInteractive || !scenarioIsActive || !reflectionPanelEl.hidden) return;

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
initFirebase();
