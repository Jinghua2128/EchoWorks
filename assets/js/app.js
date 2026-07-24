import {
  dashboardRole,
  ensureFirestore,
  loadFirebaseAuthClient,
  normalizeEmail
} from "./firebase-client.js";
import {
  clearLocalScenarioProgress,
  latestScenarioRecord,
  mergeCloudScenarioRecords,
  readLocalScenarioRecords,
  retryPendingScenarioRecords
} from "./progress-store.js";

const storageKeys = {
  version: "feedbackPlaybook.storageVersion",
  answers: "feedbackPlaybook.answers",
  legacyAnswers: "answers",
  email: "feedbackPlaybook.userEmail",
  legacyEmail: "userEmail",
  mode: "feedbackPlaybook.mode",
  scenarioResults: "feedbackPlaybook.scenarioResults"
};

const protectedRoutes = new Set(["home", "survey", "ar", "settings"]);
const authRoutes = new Set(["login", "signup"]);
const routeIds = ["login", "signup", "home", "survey", "ar", "settings"];
const storageVersion = "2026-07-four-question-pulse-v8";

function notifyMotion(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

const pulseSurveyFile = "assets/data/pulse-surveys.json";
const arCardsFile = "assets/data/ar-cards.json";
const scenarioLibraryFile = "assets/data/scenarios/scenario-library.json";
let scenarioDefinitions = [];
let scenarioIds = [];
let scenarioTarget = 0;

let surveyDefinitions = [];
let ratingLabels = [];

let firebaseSdk = null;
let firebaseLoadError = null;
let currentUser = null;
let dashboardProfileAllowed = false;
let isGuest = false;
let currentSurvey = 0;
let currentQuestion = 0;
let pendingSurveyValue = null;
let answers = {};
let cameraStream = null;
let activeRoute = "login";
let firebaseReady = null;
let surveyDataReady = Promise.resolve();
let arCardData = null;
let selectedArCard = null;
let activeArRole = "manager";
let barcodeDetector = null;
let arScanFrame = null;
let arScanBusy = false;
let lastArScanAt = 0;
let lastArScanValue = "";
let surveyTransitioning = false;
let mindarTracker = null;
let mindarRenderer = null;
let mindarStarted = false;
let mindarTargetVisible = false;
let mindarLostTimer = null;
let arCameraMode = null;
let cameraStartToken = 0;

const appShell = document.getElementById("appShell");
const mobileNavToggle = document.getElementById("mobileNavToggle");
const primaryNav = document.getElementById("primaryNav");
const mobileNavMedia = window.matchMedia("(max-width: 980px)");
const unitList = document.getElementById("unitList");
const ratingOptions = document.getElementById("ratingOptions");
const surveyForm = document.getElementById("surveyForm");
const surveyTitle = document.getElementById("surveyTitle");
const questionTitle = document.getElementById("questionTitle");
const surveyProgressText = document.getElementById("surveyProgressText");
const surveyLegend = document.getElementById("surveyLegend");
const surveySubmitLabel = document.getElementById("surveySubmitLabel");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const progressPercent = document.getElementById("progressPercent");
const sidebarProgressBar = document.getElementById("sidebarProgressBar");
const sidebarProgressText = document.getElementById("sidebarProgressText");
const cameraPreview = document.getElementById("cameraPreview");
const cameraEmpty = document.getElementById("cameraEmpty");
const arCameraFrame = document.getElementById("arCameraFrame");
const arMindarSurface = document.getElementById("arMindarSurface");
const arScanCanvas = document.getElementById("arScanCanvas");
const arOverlay = document.getElementById("arOverlay");
const arVisual = document.getElementById("arVisual");
const arEffect = document.getElementById("arEffect");
const arCharacterImage = document.getElementById("arCharacterImage");
const arOverlayFramework = document.getElementById("arOverlayFramework");
const arOverlayTitle = document.getElementById("arOverlayTitle");
const arOverlaySpeech = document.getElementById("arOverlaySpeech");
const arCardPicker = document.getElementById("arCardPicker");
const arSupportNote = document.getElementById("arSupportNote");
const arLearningLetter = document.getElementById("arLearningLetter");
const arLearningFramework = document.getElementById("arLearningFramework");
const arLearningTitle = document.getElementById("arLearningTitle");
const arPhysicalText = document.getElementById("arPhysicalText");
const arSpeechBubble = document.getElementById("arSpeechBubble");
const arChecklist = document.getElementById("arChecklist");
const arWatchOut = document.getElementById("arWatchOut");
const arWorkshopTimeline = document.getElementById("arWorkshopTimeline");
const arPrintableCards = document.getElementById("arPrintableCards");
const completedScenariosEl = document.getElementById("completedScenarios");
const remainingScenariosEl = document.getElementById("remainingScenarios");
const latestScoreSummaryEl = document.getElementById("latestScoreSummary");
const scenarioStatusEl = document.getElementById("scenarioStatus");
const latestScenarioScoreEl = document.getElementById("latestScenarioScore");
const dashboardNavLink = document.getElementById("dashboardNavLink");
const preMilestoneStateEl = document.getElementById("preMilestoneState");
const scenarioMilestoneStateEl = document.getElementById("scenarioMilestoneState");
const postMilestoneStateEl = document.getElementById("postMilestoneState");
const pathAchievementEl = document.getElementById("pathAchievement");
const screenWipeEl = document.getElementById("screenWipe");
const screenWipeLabelEl = document.getElementById("screenWipeLabel");
const screenWipeTitleEl = document.getElementById("screenWipeTitle");
const completionMotionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

function isSignedIn() {
  return Boolean(currentUser || isGuest);
}

function setMobileNav(open) {
  const shouldOpen = mobileNavMedia.matches && Boolean(open);
  appShell.classList.toggle("nav-open", shouldOpen);

  if (mobileNavToggle) {
    mobileNavToggle.setAttribute("aria-expanded", String(shouldOpen));
    mobileNavToggle.setAttribute("aria-label", shouldOpen ? "Close navigation" : "Open navigation");
  }

  if (primaryNav) {
    if (mobileNavMedia.matches) primaryNav.setAttribute("aria-hidden", String(!shouldOpen));
    else primaryNav.removeAttribute("aria-hidden");
  }
}

function syncMobileNavState() {
  if (mobileNavMedia.matches) setMobileNav(appShell.classList.contains("nav-open"));
  else setMobileNav(false);
}


function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function loadSurveyDefinitions() {
  const response = await fetch(`${pulseSurveyFile}?v=20260724`);
  if (!response.ok) throw new Error("Pulse survey questions could not be loaded.");

  const data = await response.json();
  if (!Array.isArray(data.surveys) || data.surveys.length !== 2 || !Array.isArray(data.scale?.labels)) {
    throw new Error("Pulse survey data is incomplete.");
  }
  if (data.surveys.some(survey => !Array.isArray(survey.questions) || survey.questions.length !== 2)) {
    throw new Error("Each pulse survey must contain exactly two questions.");
  }

  surveyDefinitions = data.surveys;
  ratingLabels = data.scale.labels;
}

async function loadScenarioDefinitions() {
  const response = await fetch(`${scenarioLibraryFile}?v=20260724`);
  if (!response.ok) throw new Error("Scenario progress definitions could not be loaded.");
  const data = await response.json();
  if (!Array.isArray(data.scenarios) || !data.scenarios.length) throw new Error("Scenario definitions are incomplete.");
  scenarioDefinitions = data.scenarios.filter(item => item?.id && ["manager", "employee"].includes(item.role));
  scenarioIds = scenarioDefinitions.map(item => item.id);
  scenarioTarget = scenarioIds.length;
}

function totalSurveyQuestions() {
  return surveyDefinitions.reduce((sum, survey) => sum + survey.questions.length, 0);
}

function blankAnswers() {
  return Object.fromEntries(surveyDefinitions.map(survey => [survey.id, survey.questions.map(() => null)]));
}

function normalizeAnswer(value) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized >= 1 && normalized <= 5 ? normalized : null;
}

function normalizeAnswers(value) {
  const normalized = blankAnswers();
  if (!value || Array.isArray(value) || typeof value !== "object") return normalized;

  surveyDefinitions.forEach(survey => {
    const stored = Array.isArray(value[survey.id]) ? value[survey.id] : [];
    normalized[survey.id] = survey.questions.map((_, index) => normalizeAnswer(stored[index]));
  });
  return normalized;
}

function loadLocalAnswers() {
  if (localStorage.getItem(storageKeys.version) !== storageVersion) {
    localStorage.removeItem(storageKeys.answers);
    localStorage.removeItem(storageKeys.legacyAnswers);
    localStorage.setItem(storageKeys.version, storageVersion);
    return blankAnswers();
  }

  const stored = localStorage.getItem(storageKeys.answers);
  return normalizeAnswers(safeJsonParse(stored, blankAnswers()));
}

function saveLocalAnswers() {
  localStorage.setItem(storageKeys.version, storageVersion);
  localStorage.setItem(storageKeys.answers, JSON.stringify(answers));
  localStorage.removeItem(storageKeys.legacyAnswers);
}

function completedSurveyQuestionCount() {
  return Object.values(answers).flat().filter(answer => answer !== null).length;
}

function scenarioResults() {
  return readLocalScenarioRecords().filter(result => scenarioIds.includes(result.scenarioId));
}

function latestScenarioResult() {
  return latestScenarioRecord(scenarioResults());
}

function wantsGuestMode() {
  return isGuest || localStorage.getItem(storageKeys.mode) === "guest";
}

function encodedAnswers() {
  return Object.fromEntries(Object.entries(answers).map(([surveyId, values]) => [
    surveyId,
    values.map(answer => answer === null ? -1 : answer)
  ]));
}

function progressData() {
  const completed = completedSurveyQuestionCount();
  const total = totalSurveyQuestions();
  const progress = total ? Math.round((completed / total) * 100) : 0;

  return {
    surveyVersion: storageVersion,
    answers: encodedAnswers(),
    completed,
    total,
    progress,
    updatedAt: Date.now()
  };
}

function decodedCloudAnswers(value) {
  if (!value || Array.isArray(value) || typeof value !== "object") return blankAnswers();
  const decoded = Object.fromEntries(Object.entries(value).map(([surveyId, values]) => [
    surveyId,
    Array.isArray(values) ? values.map(answer => Number(answer) < 0 ? null : answer) : []
  ]));
  return normalizeAnswers(decoded);
}

async function loadFirebase() {
  try {
    firebaseSdk = await loadFirebaseAuthClient();

    firebaseSdk.onAuthStateChanged(firebaseSdk.auth, async user => {
      const guestModeRequested = wantsGuestMode();

      if (guestModeRequested) {
        isGuest = true;
        currentUser = null;
        dashboardProfileAllowed = false;
        answers = loadLocalAnswers();
        updateUI();
        if (user) await firebaseSdk.signOut(firebaseSdk.auth).catch(() => {});
        return;
      }

      if (!user) {
        currentUser = null;
        dashboardProfileAllowed = false;
        updateUI();
        if (!authRoutes.has(activeRoute)) goTo("login", { replace: true });
        return;
      }

      isGuest = false;
      localStorage.setItem(storageKeys.mode, "cloud");
      currentUser = user;
      localStorage.setItem(storageKeys.email, user.email || "");
      localStorage.setItem(storageKeys.legacyEmail, user.email || "");

      try {
        await surveyDataReady;
        firebaseSdk = await ensureFirestore(firebaseSdk);
        await Promise.all([
          loadUserProgress(user),
          mergeCloudScenarioRecords(firebaseSdk, user)
        ]);
        await retryPendingScenarioRecords({ firebaseClient: firebaseSdk, user });
        await refreshDashboardAccess(user);
      } catch {
        answers = loadLocalAnswers();
        dashboardProfileAllowed = false;
        setMessage("settingsMessage", "Cloud progress could not be loaded. Local progress is still available.");
        updateUI();
      }

      if (wantsGuestMode()) {
        currentUser = null;
        await firebaseSdk.signOut(firebaseSdk.auth).catch(() => {});
        return;
      }
      if (authRoutes.has(activeRoute)) goTo("home", { replace: true });
    });

    return firebaseSdk;
  } catch (error) {
    firebaseLoadError = error;
    const message = "Cloud sync is unavailable. You can continue as guest and save progress locally.";
    setMessage("loginMessage", message);
    setMessage("signupMessage", message);
    return null;
  }
}
function userDocRef(user = currentUser) {
  return firebaseSdk.doc(firebaseSdk.db, "users", user.uid);
}

async function refreshDashboardAccess(user = currentUser) {
  dashboardProfileAllowed = false;

  if (!firebaseSdk?.db || !user?.email) {
    updateUI();
    return false;
  }

  try {
    const email = normalizeEmail(user.email);
    const snapshot = await firebaseSdk.getDoc(firebaseSdk.doc(firebaseSdk.db, "dashboardAdminEmails", email));
    dashboardProfileAllowed = snapshot.exists() && Boolean(dashboardRole(snapshot.data(), email));
  } catch {
    dashboardProfileAllowed = false;
  }

  updateUI();
  return dashboardProfileAllowed;
}
async function getFirebase(messageId) {
  if (firebaseSdk) return firebaseSdk;

  setMessage(messageId, "Connecting to cloud sync...");
  const sdk = await Promise.race([
    firebaseReady,
    new Promise(resolve => setTimeout(() => resolve(null), 8000))
  ]);

  if (sdk) return sdk;

  const message = firebaseLoadError?.message || "Cloud sync is still loading. Try again in a moment.";
  setMessage(messageId, message);
  return null;
}

function setMessage(id, message, tone = "error") {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("success", tone === "success");
}

function clearMessages() {
  ["loginMessage", "signupMessage", "surveyMessage", "settingsMessage", "cameraMessage"].forEach(id => setMessage(id, ""));
}

function setBusy(form, busy) {
  form.setAttribute("aria-busy", String(busy));
  form.querySelectorAll("button").forEach(button => {
    button.disabled = busy;
  });

  const submit = form.querySelector('button[type="submit"][data-busy-label]');
  if (!submit) return;
  if (!submit.dataset.idleLabel) submit.dataset.idleLabel = submit.textContent.trim();
  submit.textContent = busy ? submit.dataset.busyLabel : submit.dataset.idleLabel;
}

function friendlyAuthError(error) {
  const code = error?.code || "";
  if (code === "auth/email-already-in-use") return "That email already has an account. Try logging in.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(code)) return "Email or password is incorrect.";
  if (code === "auth/weak-password") return "Choose a stronger password and try again.";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a moment, then try again.";
  if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
  return "Account access is temporarily unavailable. Please try again.";
}

function setInvalidFields(form, fieldNames = []) {
  form.querySelectorAll("input").forEach(input => {
    const invalid = fieldNames.includes(input.name);
    input.setAttribute("aria-invalid", String(invalid));
  });
}

function validateCredentials(form, messageId, options = {}) {
  const email = form.email.value.trim();
  const password = form.password.value;
  setInvalidFields(form);

  if (!email || !password) {
    setInvalidFields(form, [!email ? "email" : "", !password ? "password" : ""].filter(Boolean));
    setMessage(messageId, "Enter your email and password.");
    return null;
  }

  if (!form.email.validity.valid) {
    setInvalidFields(form, ["email"]);
    setMessage(messageId, "Enter a valid email address.");
    return null;
  }

  if (options.requireStrongPassword) {
    const strongEnough = password.length >= 10
      && /[a-z]/.test(password)
      && /[A-Z]/.test(password)
      && /\d/.test(password);
    if (!strongEnough) {
      setInvalidFields(form, ["password"]);
      setMessage(messageId, "Use at least 10 characters with uppercase, lowercase, and a number.");
      return null;
    }
  }

  return { email, password };
}
async function saveUserProfile(user) {
  firebaseSdk = await ensureFirestore(firebaseSdk);
  await firebaseSdk.setDoc(userDocRef(user), {
    email: user.email || "",
    updatedAt: firebaseSdk.serverTimestamp()
  }, { merge: true });
}

async function loadUserProgress(user) {
  if (wantsGuestMode()) return;
  firebaseSdk = await ensureFirestore(firebaseSdk);

  try {
    const snapshot = await firebaseSdk.getDoc(userDocRef(user));
    if (wantsGuestMode()) return;

    const data = snapshot.exists() ? snapshot.data() : null;
    const cloudProgress = data?.learningProgress;
    if (cloudProgress?.answers && !Array.isArray(cloudProgress.answers) && typeof cloudProgress.answers === "object") {
      answers = decodedCloudAnswers(cloudProgress.answers);
    } else {
      answers = loadLocalAnswers();
      await saveProgress(user);
    }
  } catch {
    if (wantsGuestMode()) return;
    answers = loadLocalAnswers();
  }

  if (wantsGuestMode()) return;
  saveLocalAnswers();
  updateUI();
}

async function saveProgress(user = currentUser) {
  let localOk = true;
  let localError = null;
  try {
    saveLocalAnswers();
  } catch (error) {
    localOk = false;
    localError = error;
  }
  updateUI();

  if (wantsGuestMode() || !user) {
    return { ok: localOk, local: { ok: localOk, error: localError }, cloud: { ok: false, state: "not_signed_in" } };
  }

  try {
    firebaseSdk = await ensureFirestore(firebaseSdk);
    await firebaseSdk.setDoc(userDocRef(user), {
      email: user.email || "",
      learningProgress: progressData(),
      updatedAt: firebaseSdk.serverTimestamp()
    }, { merge: true });
    return { ok: localOk, local: { ok: localOk, error: localError }, cloud: { ok: true, state: "synced" } };
  } catch (error) {
    setMessage("settingsMessage", "Progress is saved locally. Cloud sync is pending; retry when you are online.");
    return { ok: false, local: { ok: localOk, error: localError }, cloud: { ok: false, state: "failed", error } };
  }
}
async function enterGuestMode(route = "home") {
  const hadGuestSession = localStorage.getItem(storageKeys.mode) === "guest";

  isGuest = true;
  currentUser = null;
  localStorage.setItem(storageKeys.mode, "guest");
  localStorage.setItem(storageKeys.email, "Guest learner");
  localStorage.setItem(storageKeys.legacyEmail, "Guest learner");

  if (firebaseSdk?.auth?.currentUser) {
    await firebaseSdk.signOut(firebaseSdk.auth).catch(() => {});
  }

  answers = hadGuestSession ? loadLocalAnswers() : blankAnswers();
  saveLocalAnswers();
  updateUI();
  goTo(route);
}

async function requestPasswordReset() {
  const emailInput = document.getElementById("loginEmail");
  const email = emailInput?.value.trim() || "";
  if (!email || !emailInput.validity.valid) {
    emailInput?.setAttribute("aria-invalid", "true");
    setMessage("loginMessage", "Enter your account email, then choose Reset password.");
    emailInput?.focus();
    return;
  }

  const sdk = await getFirebase("loginMessage");
  if (!sdk) return;
  try {
    await sdk.sendPasswordResetEmail(sdk.auth, email);
    setMessage("loginMessage", "If an account matches that email, a reset link has been sent.", "success");
  } catch (error) {
    if (error?.code === "auth/invalid-email") {
      setMessage("loginMessage", "Enter a valid email address.");
      return;
    }
    setMessage("loginMessage", "Password reset is temporarily unavailable. Please try again.");
  }
}

async function resendVerificationEmail() {
  if (!currentUser || currentUser.emailVerified) return;
  const button = document.querySelector('[data-action="resend-verification"]');
  if (button) button.disabled = true;
  try {
    await firebaseSdk.sendEmailVerification(currentUser);
    setMessage("settingsMessage", "Verification email sent. Open the link, then sign in again.", "success");
  } catch {
    setMessage("settingsMessage", "Verification email could not be sent. Please try again later.");
  } finally {
    if (button) button.disabled = false;
  }
}
async function login(event) {
  event.preventDefault();
  clearMessages();

  const form = event.currentTarget;
  const credentials = validateCredentials(form, "loginMessage");
  if (!credentials) return;

  const sdk = await getFirebase("loginMessage");
  if (!sdk) return;

  setBusy(form, true);
  try {
    isGuest = false;
    localStorage.setItem(storageKeys.mode, "cloud");
    const credential = await sdk.signInWithEmailAndPassword(sdk.auth, credentials.email, credentials.password);
    currentUser = credential.user;
    localStorage.setItem(storageKeys.email, currentUser.email || credentials.email);
    localStorage.setItem(storageKeys.legacyEmail, currentUser.email || credentials.email);
    await surveyDataReady;
    firebaseSdk = await ensureFirestore(sdk);
    await Promise.all([
      loadUserProgress(currentUser),
      mergeCloudScenarioRecords(firebaseSdk, currentUser)
    ]);
    await retryPendingScenarioRecords({ firebaseClient: firebaseSdk, user: currentUser });
    await refreshDashboardAccess(currentUser);
    goTo("home");
  } catch (error) {
    setMessage("loginMessage", friendlyAuthError(error));
  } finally {
    setBusy(form, false);
  }
}

async function signup(event) {
  event.preventDefault();
  clearMessages();

  const form = event.currentTarget;
  const credentials = validateCredentials(form, "signupMessage", { requireStrongPassword: true });
  if (!credentials) return;

  const sdk = await getFirebase("signupMessage");
  if (!sdk) return;

  setBusy(form, true);
  try {
    isGuest = false;
    localStorage.setItem(storageKeys.mode, "cloud");
    const credential = await sdk.createUserWithEmailAndPassword(sdk.auth, credentials.email, credentials.password);
    currentUser = credential.user;
    localStorage.setItem(storageKeys.email, currentUser.email || credentials.email);
    localStorage.setItem(storageKeys.legacyEmail, currentUser.email || credentials.email);
    await surveyDataReady;
    firebaseSdk = await ensureFirestore(sdk);
    await saveUserProfile(currentUser);
    await saveProgress(currentUser);
    await sdk.sendEmailVerification(currentUser).catch(() => {});
    await refreshDashboardAccess(currentUser);
    setMessage("settingsMessage", "Account created. Check your email to verify your address.", "success");
    goTo("home");
  } catch (error) {
    setMessage("signupMessage", friendlyAuthError(error));
  } finally {
    setBusy(form, false);
  }
}

async function logout() {
  stopCamera();
  if (currentUser && firebaseSdk) {
    await firebaseSdk.signOut(firebaseSdk.auth).catch(() => {});
  }

  currentUser = null;
  dashboardProfileAllowed = false;
  isGuest = false;
  localStorage.removeItem(storageKeys.mode);
  localStorage.removeItem(storageKeys.email);
  localStorage.removeItem(storageKeys.legacyEmail);
  updateUI();
  goTo("login");
}

function requestProgressDeletion() {
  const dialog = document.getElementById("deleteProgressDialog");
  if (!dialog?.showModal) {
    return Promise.resolve(window.confirm("Delete local and cloud learning progress? This cannot be undone."));
  }

  return new Promise(resolve => {
    const handleClose = () => resolve(dialog.returnValue === "confirm");
    dialog.addEventListener("close", handleClose, { once: true });
    dialog.showModal();
    dialog.querySelector("[value=cancel]")?.focus();
  });
}

async function commitDeleteBatches(references) {
  const chunkSize = 400;
  for (let index = 0; index < references.length; index += chunkSize) {
    const batch = firebaseSdk.writeBatch(firebaseSdk.db);
    references.slice(index, index + chunkSize).forEach(reference => batch.delete(reference));
    await batch.commit();
  }
}

async function clearCloudScenarioProgress(user = currentUser) {
  if (!user?.uid) return { progressDocuments: 0, resultDocuments: 0 };
  firebaseSdk = await ensureFirestore(firebaseSdk);

  const [progressSnapshot, resultSnapshot, reflectionSnapshot] = await Promise.all([
    firebaseSdk.getDocs(firebaseSdk.collection(firebaseSdk.db, "users", user.uid, "scenarioProgress")),
    firebaseSdk.getDocs(firebaseSdk.query(
      firebaseSdk.collection(firebaseSdk.db, "scenarioResults"),
      firebaseSdk.where("uid", "==", user.uid)
    )),
    firebaseSdk.getDocs(firebaseSdk.query(
      firebaseSdk.collection(firebaseSdk.db, "scenarioReflections"),
      firebaseSdk.where("uid", "==", user.uid)
    ))
  ]);

  const references = [
    ...progressSnapshot.docs.map(document => document.ref),
    ...resultSnapshot.docs.map(document => document.ref),
    ...reflectionSnapshot.docs.map(document => document.ref)
  ];
  await commitDeleteBatches(references);

  await firebaseSdk.setDoc(userDocRef(user), {
    email: user.email || "",
    learningProgress: firebaseSdk.deleteField(),
    selectedRole: firebaseSdk.deleteField(),
    anonymousPlayerId: firebaseSdk.deleteField(),
    updatedAt: firebaseSdk.serverTimestamp()
  }, { merge: true });

  return {
    progressDocuments: progressSnapshot.size,
    resultDocuments: resultSnapshot.size,
    reflectionDocuments: reflectionSnapshot.size
  };
}

function clearLocalLearningProgress() {
  answers = blankAnswers();
  clearLocalScenarioProgress();
  localStorage.removeItem("feedbackPlaybook.anonymousPlayerId");
  localStorage.removeItem(storageKeys.answers);
  localStorage.removeItem(storageKeys.legacyAnswers);
  saveLocalAnswers();
  updateUI();
}

async function resetProgress() {
  const confirmed = await requestProgressDeletion();
  if (!confirmed) return;

  const resetButton = document.querySelector('[data-action="reset-progress"]');
  if (resetButton) {
    resetButton.disabled = true;
    resetButton.textContent = currentUser ? "Deleting cloud progress..." : "Deleting progress...";
  }

  try {
    if (currentUser) await clearCloudScenarioProgress(currentUser);
    clearLocalLearningProgress();
    setMessage(
      "settingsMessage",
      currentUser ? "Local and cloud progress were deleted." : "Progress on this device was deleted.",
      "success"
    );
    if (resetButton) {
      resetButton.dataset.retry = "false";
      resetButton.textContent = "Delete progress";
    }
  } catch {
    setMessage(
      "settingsMessage",
      "Deletion was not completed on both storage locations. Your local copy was kept; choose Retry deletion when the connection is available."
    );
    if (resetButton) {
      resetButton.dataset.retry = "true";
      resetButton.textContent = "Retry deletion";
    }
  } finally {
    if (resetButton) resetButton.disabled = false;
  }
}
function renderUnitList() {
  unitList.textContent = "";

  surveyDefinitions.forEach((survey, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "unit-row";
    button.dataset.surveyIndex = String(index);

    const number = document.createElement("span");
    number.className = "unit-number";
    number.textContent = survey.frameworkId;

    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = survey.title;
    const description = document.createElement("small");
    description.textContent = survey.description;
    copy.append(title, description);

    const state = document.createElement("span");
    state.className = "unit-state";

    button.append(number, copy, state);
    unitList.append(button);
    notifyMotion("motion:content-added", { element: button });
  });
}

function renderRatingOptions() {
  ratingOptions.textContent = "";

  ratingLabels.forEach((label, index) => {
    const option = document.createElement("label");
    option.className = "rating-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "comfort";
    input.value = String(index + 1);

    const text = document.createElement("span");
    text.textContent = label;

    option.append(input, text);
    ratingOptions.append(option);
  });
}


function surveyStageProgress(stage) {
  const survey = surveyDefinitions.find(item => item.stage === stage);
  if (!survey) return { answered: 0, total: 0, complete: false };

  const values = answers[survey.id] || [];
  const answered = values.filter(answer => answer !== null).length;
  return {
    answered,
    total: survey.questions.length,
    complete: answered === survey.questions.length
  };
}

function setMilestoneState(name, state, text, active) {
  const item = document.querySelector(`[data-learning-milestone="${name}"]`);
  if (!item) return;

  item.classList.toggle("complete", state);
  item.classList.toggle("active", !state && active);
  item.setAttribute("aria-label", `${item.querySelector("strong")?.textContent || name}: ${text}`);
}

function renderLearningMilestones(completedScenarioCount) {
  const pre = surveyStageProgress("pre");
  const post = surveyStageProgress("post");
  const scenariosComplete = completedScenarioCount >= scenarioTarget;

  const preText = pre.complete ? "Completed" : `${pre.answered} of ${pre.total} questions`;
  const scenarioText = scenariosComplete ? "Library completed" : `${completedScenarioCount} of ${scenarioTarget} complete`;
  const postText = post.complete ? "Completed" : `${post.answered} of ${post.total} questions`;

  if (preMilestoneStateEl) preMilestoneStateEl.textContent = preText;
  if (scenarioMilestoneStateEl) scenarioMilestoneStateEl.textContent = scenarioText;
  if (postMilestoneStateEl) postMilestoneStateEl.textContent = postText;

  setMilestoneState("pre", pre.complete, preText, !pre.complete);
  setMilestoneState("scenario", scenariosComplete, scenarioText, pre.complete);
  setMilestoneState("post", post.complete, postText, pre.complete && scenariosComplete);

  if (pathAchievementEl) {
    pathAchievementEl.hidden = !(pre.complete && scenariosComplete && post.complete);
  }
}

function runCompletionWipe(label, title, onCovered) {
  if (!screenWipeEl || completionMotionMedia.matches) {
    onCovered();
    return Promise.resolve();
  }

  screenWipeLabelEl.textContent = label;
  screenWipeTitleEl.textContent = title;
  screenWipeEl.hidden = false;
  screenWipeEl.classList.remove("is-active");
  void screenWipeEl.offsetWidth;
  screenWipeEl.classList.add("is-active");

  return new Promise(resolve => {
    window.setTimeout(onCovered, 360);
    window.setTimeout(() => {
      screenWipeEl.classList.remove("is-active");
      screenWipeEl.hidden = true;
      resolve();
    }, 860);
  });
}

function renderSurvey() {
  const survey = surveyDefinitions[currentSurvey];
  if (!survey) return;

  currentQuestion = Math.max(0, Math.min(survey.questions.length - 1, currentQuestion));
  const question = survey.questions[currentQuestion];
  pendingSurveyValue = answers[survey.id]?.[currentQuestion] ?? null;
  surveyTitle.textContent = survey.title;
  questionTitle.textContent = question.text;
  surveyProgressText.textContent = `Question ${currentQuestion + 1} of ${survey.questions.length} / ${survey.frameworkId}`;
  surveyLegend.textContent = "How strongly do you agree?";
  surveySubmitLabel.textContent = currentQuestion === survey.questions.length - 1 ? "Finish survey" : "Save and continue";
  setMessage("surveyMessage", "");

  surveyForm.querySelectorAll('input[name="comfort"]').forEach(input => {
    input.checked = Number(input.value) === pendingSurveyValue;
  });
}

function openSurvey(index) {
  if (!surveyDefinitions.length) {
    setMessage("surveyMessage", "Survey questions are still loading. Try again in a moment.");
    return;
  }
  currentSurvey = Math.max(0, Math.min(surveyDefinitions.length - 1, Number(index) || 0));
  const survey = surveyDefinitions[currentSurvey];
  const firstIncomplete = answers[survey.id]?.findIndex(answer => answer === null) ?? -1;
  currentQuestion = firstIncomplete >= 0 ? firstIncomplete : 0;
  renderSurvey();
  goTo("survey");
}

async function submitSurvey(event) {
  event.preventDefault();
  if (surveyTransitioning) return;

  const selected = surveyForm.querySelector('input[name="comfort"]:checked');

  if (!selected) {
    setMessage("surveyMessage", "Choose a response before continuing.");
    return;
  }

  const survey = surveyDefinitions[currentSurvey];
  answers[survey.id][currentQuestion] = Number(selected.value);
  await saveProgress();

  if (currentQuestion < survey.questions.length - 1) {
    currentQuestion += 1;
    renderSurvey();
    surveyForm.querySelector("fieldset")?.focus({ preventScroll: true });
    return;
  }

  surveyTransitioning = true;
  const submitButton = surveyForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  setMessage("surveyMessage", "Completed. Saving your milestone...", "success");

  await runCompletionWipe(
    "Milestone complete",
    `${survey.title} completed`,
    () => goTo("home")
  );

  surveyTransitioning = false;
  if (submitButton) submitButton.disabled = false;
}

function updateUI() {
  const completed = completedSurveyQuestionCount();
  const surveyTotal = totalSurveyQuestions();
  const results = scenarioResults();
  const completedScenarioCount = new Set(results.filter(result => result.completed).map(result => result.scenarioId)).size;
  const latestScenario = latestScenarioResult();
  const totalTasks = surveyTotal + scenarioTarget;
  const completedTasks = completed + completedScenarioCount;
  const progress = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const email = currentUser?.email || localStorage.getItem(storageKeys.email) || localStorage.getItem(storageKeys.legacyEmail) || "Guest learner";

  progressBar.style.width = `${progress}%`;
  sidebarProgressBar.style.width = `${progress}%`;
  progressPercent.textContent = `${progress}%`;
  progressText.textContent = `${completed} of ${surveyTotal} pulse responses; ${completedScenarioCount} of ${scenarioTarget} scenarios`;

  if (completedScenariosEl) completedScenariosEl.textContent = String(completedScenarioCount);
  if (remainingScenariosEl) remainingScenariosEl.textContent = String(Math.max(0, scenarioTarget - completedScenarioCount));
  if (latestScoreSummaryEl) latestScoreSummaryEl.textContent = latestScenario?.scorePercent == null ? "-" : `${latestScenario.scorePercent}%`;
  if (scenarioStatusEl) scenarioStatusEl.textContent = completedScenarioCount ? `${completedScenarioCount} of ${scenarioTarget} complete` : latestScenario ? "In progress" : "Not started";
  if (latestScenarioScoreEl) latestScenarioScoreEl.textContent = latestScenario?.scorePercent == null ? "-" : `${latestScenario.scorePercent}%`;
  sidebarProgressText.textContent = `${progress}% complete`;
  renderLearningMilestones(completedScenarioCount);

  document.getElementById("userEmail").textContent = email;
  document.getElementById("accountMode").textContent = currentUser
    ? (currentUser.emailVerified
      ? "Verified account. Progress syncs across devices."
      : "Progress syncs across devices. Verify your email before dashboard access.")
    : "Progress is saved on this device.";
  const verificationButton = document.querySelector('[data-action="resend-verification"]');
  if (verificationButton) verificationButton.hidden = !currentUser || currentUser.emailVerified;

  if (dashboardNavLink) {
    dashboardNavLink.hidden = !(currentUser && dashboardProfileAllowed);
  }

  document.querySelectorAll(".unit-row").forEach((row, index) => {
    const survey = surveyDefinitions[index];
    const values = answers[survey.id] || [];
    const answered = values.filter(answer => answer !== null).length;
    const complete = answered === survey.questions.length;
    row.classList.toggle("complete", complete);
    row.querySelector(".unit-state").textContent = complete ? "Complete" : `${answered}/${survey.questions.length}`;
  });
}

function routeFromHash() {
  const route = window.location.hash.replace("#", "");
  return routeIds.includes(route) ? route : "login";
}

function goTo(route, options = {}) {
  const nextRoute = routeIds.includes(route) ? route : "home";

  if (activeRoute === "ar" && nextRoute !== "ar") stopCamera();

  let resolvedRoute = nextRoute;
  if (protectedRoutes.has(resolvedRoute) && !isSignedIn()) {
    resolvedRoute = "login";
  }

  if (resolvedRoute === "survey") renderSurvey();

  if (activeRoute === "ar" && resolvedRoute !== "ar") stopCamera();

  activeRoute = resolvedRoute;
  appShell.classList.toggle("auth-mode", authRoutes.has(resolvedRoute));
  setMobileNav(false);

  routeIds.forEach(id => {
    const page = document.getElementById(id);
    const active = id === resolvedRoute;
    page.classList.toggle("active", active);
    page.setAttribute("aria-hidden", String(!active));
  });

  document.querySelectorAll("[data-route]").forEach(control => {
    const isCurrent = control.dataset.route === resolvedRoute;
    if (control.classList.contains("nav-button")) {
      if (isCurrent) control.setAttribute("aria-current", "page");
      else control.removeAttribute("aria-current");
    }
  });

  clearMessages();
  updateUI();
  notifyMotion("motion:route-change", { route: resolvedRoute });

  window.requestAnimationFrame(() => {
    const heading = document.getElementById(resolvedRoute)?.querySelector("h1, h2");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  });

  const hash = `#${resolvedRoute}`;
  if (window.location.hash !== hash) {
    if (options.replace) history.replaceState(null, "", hash);
    else history.pushState(null, "", hash);
  }
}

function arEffectMarkup(animation) {
  const effects = {
    spotlight: '<span class="effect-person"></span><span class="effect-beam"></span>',
    balance: '<span class="effect-scale-beam"></span><span class="effect-scale-pan left"></span><span class="effect-scale-pan right"></span>',
    compass: '<span class="effect-compass-ring"></span><span class="effect-compass-needle"></span>',
    bridge: '<span class="effect-gap"></span><span class="effect-bridge-deck"></span>',
    breathe: '<span class="effect-breath-ring one"></span><span class="effect-breath-ring two"></span><span class="effect-breath-ring three"></span>',
    magnify: '<span class="effect-blur-text">EVIDENCE</span><span class="effect-lens"></span>',
    question: '<span class="effect-question-mark">?</span>',
    steps: '<span class="effect-step one"></span><span class="effect-step two"></span><span class="effect-step three"></span><span class="effect-step four"></span>'
  };
  return effects[animation] || effects.spotlight;
}

function renderArOverlay(card) {
  if (!card || !arOverlay) return;

  arCharacterImage.src = card.characterImage;
  arCharacterImage.alt = `${card.character} demonstrating ${card.title}`;
  arOverlayFramework.textContent = `${card.framework} · ${card.letter}`;
  arOverlayTitle.textContent = card.title;
  arOverlaySpeech.textContent = card.speechBubble;
  arEffect.dataset.animation = card.animation;
  arEffect.innerHTML = arEffectMarkup(card.animation);
  arOverlay.hidden = false;
  arOverlay.classList.remove("is-active");
  void arOverlay.offsetWidth;
  arOverlay.classList.add("is-active");
  arCameraFrame.dataset.card = card.id;
}

function renderArLearning(card) {
  if (!card) return;

  arLearningLetter.textContent = card.letter;
  arLearningLetter.dataset.framework = card.framework;
  arLearningFramework.textContent = `${card.framework} framework`;
  arLearningTitle.textContent = card.title;
  arPhysicalText.textContent = card.physicalText;
  arSpeechBubble.textContent = card.speechBubble;
  arWatchOut.textContent = card.watchOut;
  arChecklist.textContent = "";

  card.checklist.forEach(item => {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    arChecklist.append(listItem);
  });
}

function renderArCardPicker() {
  if (!arCardData || !arCardPicker) return;

  arCardPicker.textContent = "";
  arCardData.cards
    .filter(card => card.role === activeArRole)
    .forEach(card => {
      const button = document.createElement("button");
      button.className = "ar-card-option";
      button.type = "button";
      button.dataset.arCard = card.id;
      button.setAttribute("aria-pressed", String(selectedArCard?.id === card.id));

      const letter = document.createElement("span");
      letter.className = "ar-card-letter";
      letter.textContent = card.letter;

      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = card.title;
      const prompt = document.createElement("small");
      prompt.textContent = card.physicalText;
      copy.append(title, prompt);

      button.append(letter, copy);
      arCardPicker.append(button);
    });
}

function selectArCard(cardId, options = {}) {
  const card = arCardData?.cards.find(item => item.id === cardId);
  if (!card) return;

  selectedArCard = card;
  activeArRole = card.role;
  document.querySelectorAll("[data-ar-role]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.arRole === activeArRole));
  });
  renderArCardPicker();
  renderArLearning(card);
  renderArOverlay(card);
  notifyMotion("motion:content-added", { element: arOverlay });

  if (options.scanned) {
    setMessage("cameraMessage", `${card.framework} ${card.letter} card detected: ${card.title}.`, "success");
  }
}

function setArRole(role) {
  if (!["manager", "employee"].includes(role) || !arCardData) return;
  activeArRole = role;
  document.querySelectorAll("[data-ar-role]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.arRole === role));
  });
  const currentMatches = selectedArCard?.role === role;
  const nextCard = currentMatches
    ? selectedArCard
    : arCardData.cards.find(card => card.role === role);
  renderArCardPicker();
  if (nextCard) selectArCard(nextCard.id);
}

function renderArWorkshop() {
  if (!arCardData?.workshop?.agenda || !arWorkshopTimeline) return;

  arWorkshopTimeline.textContent = "";
  arCardData.workshop.agenda.forEach((item, index) => {
    const article = document.createElement("article");
    article.className = "ar-workshop-step";

    const number = document.createElement("span");
    number.textContent = String(index + 1).padStart(2, "0");

    const copy = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = item.stage;
    const activity = document.createElement("p");
    activity.textContent = item.activity;
    const meta = document.createElement("small");
    meta.textContent = `${item.duration} · ${item.purpose}`;
    copy.append(heading, activity, meta);

    article.append(number, copy);
    arWorkshopTimeline.append(article);
  });
}

function renderPrintableArCards() {
  if (!arCardData?.cards || !arPrintableCards) return;

  arPrintableCards.textContent = "";
  arCardData.cards.forEach(card => {
    const article = document.createElement("article");
    article.className = "print-ar-card";

    const header = document.createElement("header");
    const mark = document.createElement("span");
    mark.textContent = card.letter;
    const heading = document.createElement("div");
    const framework = document.createElement("small");
    framework.textContent = card.framework;
    const title = document.createElement("h3");
    title.textContent = card.title;
    heading.append(framework, title);
    header.append(mark, heading);

    const prompt = document.createElement("strong");
    prompt.textContent = card.physicalText;

    const scanImage = document.createElement("img");
    scanImage.src = card.imageTarget?.sourceImage || `assets/ar/${card.id}.svg`;
    scanImage.alt = card.imageTarget
      ? `Physical ${card.framework} ${card.title} card artwork`
      : `Scan code for ${card.framework} ${card.title}`;
    scanImage.loading = "lazy";
    scanImage.width = 180;
    scanImage.height = 180;

    const watchOut = document.createElement("p");
    watchOut.textContent = card.watchOut;
    article.append(header, prompt, scanImage, watchOut);
    arPrintableCards.append(article);
  });
}

async function loadArCards() {
  const response = await fetch(`${arCardsFile}?v=20260724`);
  if (!response.ok) throw new Error("AR card content could not be loaded.");

  const data = await response.json();
  if (!Array.isArray(data.cards) || data.cards.length !== 8) {
    throw new Error("AR card content is incomplete.");
  }

  arCardData = data;
  renderArWorkshop();
  renderPrintableArCards();
  selectArCard(data.cards.find(card => card.role === activeArRole)?.id || data.cards[0].id);
}

async function createBarcodeDetector() {
  if (!("BarcodeDetector" in window)) return null;

  try {
    const formats = typeof BarcodeDetector.getSupportedFormats === "function"
      ? await BarcodeDetector.getSupportedFormats()
      : ["qr_code"];
    if (!formats.includes("qr_code")) return null;
    return new BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

async function scanArFrame(timestamp) {
  if (!cameraStream) return;
  arScanFrame = window.requestAnimationFrame(scanArFrame);

  if (!barcodeDetector || arScanBusy || timestamp - lastArScanAt < 180 || cameraPreview.readyState < 2) {
    return;
  }

  lastArScanAt = timestamp;
  arScanBusy = true;
  try {
    const results = await barcodeDetector.detect(cameraPreview);
    const value = results.find(result => result.rawValue?.startsWith(arCardData.scanPrefix))?.rawValue;
    if (value && value !== lastArScanValue) {
      lastArScanValue = value;
      selectArCard(value.slice(arCardData.scanPrefix.length), { scanned: true });
    }
  } catch {
    barcodeDetector = null;
    arSupportNote.textContent = "Automatic scanning is unavailable here. Choose a card to continue.";
  } finally {
    arScanBusy = false;
  }
}

function setCameraButtonBusy(busy) {
  const button = document.querySelector('[data-action="start-camera"]');
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? button.dataset.busyLabel : "Start camera";
}

function imageTargetCard() {
  return arCardData?.cards.find(card => card.imageTarget?.src);
}

function stopMindarTracking() {
  if (mindarLostTimer) {
    window.clearTimeout(mindarLostTimer);
    mindarLostTimer = null;
  }

  mindarRenderer?.setAnimationLoop(null);
  const tracker = mindarTracker;

  if (tracker) {
    try {
      if (mindarStarted) {
        tracker.stop();
      } else {
        tracker.controller?.stopProcessVideo?.();
        tracker.video?.srcObject?.getTracks().forEach(track => track.stop());
        tracker.video?.remove();
      }
    } catch (error) {
      console.warn("Image tracker cleanup failed.", error);
    }
  }

  mindarTracker = null;
  mindarRenderer = null;
  mindarStarted = false;
  mindarTargetVisible = false;
  arMindarSurface?.replaceChildren();
  arCameraFrame?.classList.remove("target-detected", "image-tracking");
}

function handleImageTargetFound(card) {
  if (mindarLostTimer) {
    window.clearTimeout(mindarLostTimer);
    mindarLostTimer = null;
  }

  mindarTargetVisible = true;
  arCameraFrame?.classList.add("target-detected");
  selectArCard(card.id, { scanned: true });
}

function handleImageTargetLost() {
  mindarTargetVisible = false;
  arCameraFrame?.classList.remove("target-detected");

  if (mindarLostTimer) window.clearTimeout(mindarLostTimer);
  mindarLostTimer = window.setTimeout(() => {
    if (mindarTargetVisible || arCameraMode !== "image") return;
    if (arOverlay) arOverlay.hidden = true;
    setMessage("cameraMessage", "Card lost. Hold the Recognise artwork steady inside the frame.");
  }, 700);
}

function cameraCancellationError() {
  const error = new Error("Camera startup was cancelled.");
  error.cameraCancelled = true;
  return error;
}

async function startImageTargetCamera(card) {
  const { MindARThree } = await import("mindar-image-three");
  const targetIndex = Number.isInteger(card.imageTarget.targetIndex)
    ? card.imageTarget.targetIndex
    : 0;

  const tracker = new MindARThree({
    container: arMindarSurface,
    imageTargetSrc: card.imageTarget.src,
    maxTrack: 1,
    uiLoading: "no",
    uiScanning: "no",
    uiError: "no",
    warmupTolerance: 3,
    missTolerance: 8
  });
  const renderer = tracker.renderer;
  mindarTracker = tracker;
  mindarRenderer = renderer;

  const anchor = tracker.addAnchor(targetIndex);
  anchor.onTargetFound = () => handleImageTargetFound(card);
  anchor.onTargetLost = handleImageTargetLost;

  if (arOverlay) arOverlay.hidden = true;
  cameraPreview.hidden = true;
  cameraEmpty.hidden = true;
  arCameraMode = "image";
  arCameraFrame.classList.add("camera-active", "image-tracking");
  setMessage("cameraMessage", "Requesting camera access to scan the REAL Recognise card.");

  try {
    await tracker.start();
  } catch (error) {
    if (mindarTracker !== tracker) throw cameraCancellationError();

    const wrappedError = new Error(
      tracker.video?.srcObject
        ? "The image target could not be loaded."
        : "Camera access was unavailable."
    );
    wrappedError.cause = error;
    wrappedError.cameraUnavailable = !tracker.video?.srcObject;
    throw wrappedError;
  }

  if (mindarTracker !== tracker) {
    try {
      tracker.stop();
    } catch {
      tracker.video?.srcObject?.getTracks().forEach(track => track.stop());
    }
    throw cameraCancellationError();
  }

  mindarStarted = true;
  renderer.setAnimationLoop(() => {
    if (mindarTracker !== tracker) return;
    renderer.render(tracker.scene, tracker.camera);
  });

  setMessage(
    "cameraMessage",
    "Camera is active. Hold the REAL Recognise artwork flat inside the frame.",
    "success"
  );
}

async function startQrCamera(startToken) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });

  if (startToken !== cameraStartToken) {
    stream.getTracks().forEach(track => track.stop());
    throw cameraCancellationError();
  }

  cameraStream = stream;
  cameraPreview.srcObject = stream;
  cameraPreview.hidden = false;
  cameraEmpty.hidden = true;
  arCameraMode = "qr";
  arCameraFrame.classList.add("camera-active");
  await cameraPreview.play();

  if (startToken !== cameraStartToken) throw cameraCancellationError();

  barcodeDetector = await createBarcodeDetector();
  lastArScanValue = "";
  lastArScanAt = 0;
  arScanFrame = window.requestAnimationFrame(scanArFrame);

  setMessage(
    "cameraMessage",
    barcodeDetector
      ? "QR fallback is active. Hold a printed card inside the frame."
      : "Camera is active. Automatic scanning is not supported here, so choose a card to preview it.",
    barcodeDetector ? "success" : ""
  );
}

async function startCamera() {
  const startToken = ++cameraStartToken;
  clearMessages();

  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    setMessage("cameraMessage", "Camera scanning needs HTTPS or localhost. Choose a card to use the interactive preview.");
    return;
  }

  setCameraButtonBusy(true);
  try {
    stopCamera({ cancelPending: false });
    const targetCard = imageTargetCard();

    if (targetCard && "WebGLRenderingContext" in window) {
      try {
        await startImageTargetCamera(targetCard);
        return;
      } catch (error) {
        if (error?.cameraCancelled || startToken !== cameraStartToken) throw error;

        const cameraUnavailable = error?.cameraUnavailable;
        console.warn("Image recognition could not start.", error);
        stopCamera({ cancelPending: false });

        if (cameraUnavailable) throw error;
      }
    }

    await startQrCamera(startToken);
  } catch (error) {
    if (error?.cameraCancelled || startToken !== cameraStartToken) return;

    const message = error?.name === "NotAllowedError" || error?.cameraUnavailable
      ? "Camera permission was blocked. Allow camera access or choose a card below."
      : "Camera could not start on this device. Choose a card to continue.";
    setMessage("cameraMessage", message);
    stopCamera({ cancelPending: false });
  } finally {
    if (startToken === cameraStartToken) setCameraButtonBusy(false);
  }
}

function stopCamera(options = {}) {
  if (options.cancelPending !== false) {
    cameraStartToken += 1;
    setCameraButtonBusy(false);
  }

  if (arScanFrame) {
    window.cancelAnimationFrame(arScanFrame);
    arScanFrame = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  stopMindarTracking();
  barcodeDetector = null;
  arScanBusy = false;
  arCameraMode = null;

  if (cameraPreview) {
    cameraPreview.pause();
    cameraPreview.srcObject = null;
    cameraPreview.hidden = true;
  }

  if (cameraEmpty) cameraEmpty.hidden = false;
  arCameraFrame?.classList.remove("camera-active", "target-detected");

  if (selectedArCard && arOverlay) renderArOverlay(selectedArCard);
}
function bindEvents() {
  document.getElementById("loginForm").addEventListener("submit", login);
  document.getElementById("signupForm").addEventListener("submit", signup);
  surveyForm.addEventListener("submit", submitSurvey);
  document.querySelectorAll(".auth-card input").forEach(input => {
    input.addEventListener("input", () => input.setAttribute("aria-invalid", "false"));
  });

  if (mobileNavToggle) {
    mobileNavToggle.addEventListener("click", () => {
      setMobileNav(!appShell.classList.contains("nav-open"));
    });
  }

  if (typeof mobileNavMedia.addEventListener === "function") {
    mobileNavMedia.addEventListener("change", syncMobileNavState);
  } else if (typeof mobileNavMedia.addListener === "function") {
    mobileNavMedia.addListener(syncMobileNavState);
  }

  ratingOptions.addEventListener("change", event => {
    if (event.target.name === "comfort") {
      pendingSurveyValue = Number(event.target.value);
      setMessage("surveyMessage", "");
    }
  });

  document.addEventListener("click", event => {
    const routeControl = event.target.closest("[data-route]");
    if (routeControl) {
      event.preventDefault();
      goTo(routeControl.dataset.route);
      return;
    }

    const unit = event.target.closest("[data-survey-index]");
    if (unit) {
      openSurvey(unit.dataset.surveyIndex);
      return;
    }

    const arRoleControl = event.target.closest("[data-ar-role]");
    if (arRoleControl) {
      setArRole(arRoleControl.dataset.arRole);
      return;
    }

    const arCardControl = event.target.closest("[data-ar-card]");
    if (arCardControl) {
      selectArCard(arCardControl.dataset.arCard);
      return;
    }

    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "guest") enterGuestMode();
    if (action === "logout") logout();
    if (action === "password-reset") requestPasswordReset();
    if (action === "resend-verification") resendVerificationEmail();
    if (action === "reset-progress") resetProgress();
    if (action === "retry-survey") initialiseSurveyData();
    if (action === "retry-ar") initialiseArData();
    if (action === "start-camera") startCamera();
    if (action === "print-ar-cards") {
      document.body.classList.add("printing-ar-cards");
      window.print();
    }
    if (action === "stop-camera") {
      stopCamera();
      setMessage("cameraMessage", "Camera stopped.", "success");
    }
  });

  window.addEventListener("hashchange", () => {
    const route = routeFromHash();
    if (route !== activeRoute) goTo(route, { replace: true });
  });

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-ar-cards");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (cameraStream || mindarTracker)) stopCamera();
  });
}

async function initialiseSurveyData() {
  const retryButton = document.querySelector('[data-action="retry-survey"]');
  if (retryButton) retryButton.hidden = true;
  try {
    await loadSurveyDefinitions();
    answers = loadLocalAnswers();
    renderUnitList();
    renderRatingOptions();
    renderSurvey();
    updateUI();
  } catch (error) {
    questionTitle.textContent = "Pulse survey content is unavailable.";
    setMessage("surveyMessage", error.message || "The pulse survey could not be loaded.");
    if (retryButton) retryButton.hidden = false;
  }
}

async function initialiseScenarioDefinitions() {
  try {
    await loadScenarioDefinitions();
    updateUI();
  } catch {
    scenarioIds = [];
    scenarioTarget = 0;
    if (scenarioStatusEl) scenarioStatusEl.textContent = "Progress unavailable";
  }
}

async function initialiseArData() {
  const retryButton = document.querySelector('[data-action="retry-ar"]');
  if (retryButton) retryButton.hidden = true;
  try {
    await loadArCards();
    setMessage("cameraMessage", "");
  } catch (error) {
    setMessage("cameraMessage", error.message || "AR card content could not be loaded.");
    if (retryButton) retryButton.hidden = false;
  }
}

function init() {
  bindEvents();
  syncMobileNavState();
  answers = {};
  updateUI();

  const requestedRoute = routeFromHash();
  const storedGuest = localStorage.getItem(storageKeys.mode) === "guest";
  if (storedGuest && !authRoutes.has(requestedRoute)) {
    enterGuestMode(protectedRoutes.has(requestedRoute) ? requestedRoute : "home");
  } else {
    goTo(authRoutes.has(requestedRoute) ? requestedRoute : "login", { replace: true });
  }

  firebaseReady = loadFirebase();
  surveyDataReady = initialiseSurveyData();
  initialiseScenarioDefinitions();
  initialiseArData();
}

init();


