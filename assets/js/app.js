const firebaseVersion = "12.15.0";
const firebaseBaseUrl = `https://www.gstatic.com/firebasejs/${firebaseVersion}`;

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
const storageVersion = "2026-07-mdc-pulse-v7";
const bootstrapAdminEmail = "liuguangxuan1230@gmail.com";

function notifyMotion(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

const pulseSurveyFile = "assets/data/pulse-surveys.json";
const arCardsFile = "assets/data/ar-cards.json";
const scenarioIds = [
  "real-late-arrival",
  "real-uneven-scale",
  "real-quiet-one",
  "real-star-stopped-caring",
  "care-ambush",
  "care-rating-stings",
  "care-what-did-that-mean",
  "care-three-weeks-one-goal"
];
const scenarioTarget = scenarioIds.length;

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
let arCardData = null;
let selectedArCard = null;
let activeArRole = "manager";
let barcodeDetector = null;
let arScanFrame = null;
let arScanBusy = false;
let lastArScanAt = 0;
let lastArScanValue = "";

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

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function loadSurveyDefinitions() {
  const response = await fetch(pulseSurveyFile, { cache: "no-store" });
  if (!response.ok) throw new Error("Pulse survey questions could not be loaded.");

  const data = await response.json();
  if (!Array.isArray(data.surveys) || !data.surveys.length || !Array.isArray(data.scale?.labels)) {
    throw new Error("Pulse survey data is incomplete.");
  }

  surveyDefinitions = data.surveys;
  ratingLabels = data.scale.labels;
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

function readScenarioResults() {
  return safeJsonParse(localStorage.getItem(storageKeys.scenarioResults), {});
}

function scenarioResults() {
  return Object.values(readScenarioResults()).filter(result => scenarioIds.includes(result.scenarioId));
}

function latestScenarioResult() {
  const results = scenarioResults();
  if (!results.length) return null;

  return results.sort((a, b) => String(b.updatedAtIso || b.completedAtIso || "").localeCompare(String(a.updatedAtIso || a.completedAtIso || "")))[0];
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

async function loadFirebaseConfig() {
  try {
    const configUrl = new URL("../../firebase-config.js?v=20260701-firebase", import.meta.url);
    const localConfig = await import(configUrl.href);
    if (localConfig.firebaseConfig) return localConfig.firebaseConfig;
  } catch {
    // Local config is optional for GitHub Pages and local demos.
  }

  try {
    const response = await fetch("/__/firebase/init.json", { cache: "no-store" });
    if (response.ok) return await response.json();
  } catch {
    // Firebase Hosting provides this file after deployment.
  }

  throw new Error("Cloud sync is unavailable. You can continue locally and save progress on this device.");
}

async function loadFirebase() {
  try {
    const firebaseConfig = await loadFirebaseConfig();
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(`${firebaseBaseUrl}/firebase-app.js`),
      import(`${firebaseBaseUrl}/firebase-auth.js`),
      import(`${firebaseBaseUrl}/firebase-firestore.js`)
    ]);

    const app = appModule.initializeApp(firebaseConfig);
    firebaseSdk = {
      app,
      auth: authModule.getAuth(app),
      db: firestoreModule.getFirestore(app),
      createUserWithEmailAndPassword: authModule.createUserWithEmailAndPassword,
      deleteDoc: firestoreModule.deleteDoc,
      doc: firestoreModule.doc,
      getDoc: firestoreModule.getDoc,
      onAuthStateChanged: authModule.onAuthStateChanged,
      serverTimestamp: firestoreModule.serverTimestamp,
      setDoc: firestoreModule.setDoc,
      signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
      signOut: authModule.signOut
    };

    firebaseSdk.onAuthStateChanged(firebaseSdk.auth, async user => {
      const guestModeRequested = wantsGuestMode();

      if (guestModeRequested) {
        isGuest = true;
        currentUser = null;
        dashboardProfileAllowed = false;
        answers = loadLocalAnswers();
        updateUI();

        if (user) {
          await firebaseSdk.signOut(firebaseSdk.auth).catch(() => {});
        }

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
      await loadUserProgress(user);
      await refreshDashboardAccess(user);
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

  if (!firebaseSdk || !user?.email) {
    updateUI();
    return false;
  }

  try {
    const email = normalizeEmail(user.email);

    if (email === bootstrapAdminEmail) {
      dashboardProfileAllowed = true;
      updateUI();
      return true;
    }

    const snapshot = await firebaseSdk.getDoc(firebaseSdk.doc(firebaseSdk.db, "dashboardAdminEmails", email));
    dashboardProfileAllowed = snapshot.exists();
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
  if (code === "auth/operation-not-allowed") return "Email and password sign-in is not enabled in Firebase Authentication.";
  if (code === "auth/weak-password") return "Use a password with at least 6 characters.";
  if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
  return error?.message || "Something went wrong. Please try again.";
}

function validateCredentials(form, messageId) {
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!email || !password) {
    setMessage(messageId, "Enter your email and password.");
    return null;
  }

  if (!form.email.validity.valid) {
    setMessage(messageId, "Enter a valid email address.");
    return null;
  }

  if (password.length < 6) {
    setMessage(messageId, "Password must be at least 6 characters.");
    return null;
  }

  return { email, password };
}

async function saveUserProfile(user) {
  if (!firebaseSdk) return;
  await firebaseSdk.setDoc(userDocRef(user), {
    email: user.email || "",
    updatedAt: firebaseSdk.serverTimestamp()
  }, { merge: true });
}

async function loadUserProgress(user) {
  if (!firebaseSdk || wantsGuestMode()) return;

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
  saveLocalAnswers();
  updateUI();

  if (wantsGuestMode() || !user || !firebaseSdk) return;

  try {
    await firebaseSdk.setDoc(userDocRef(user), {
      email: user.email || "",
      learningProgress: progressData(),
      updatedAt: firebaseSdk.serverTimestamp()
    }, { merge: true });
  } catch {
    setMessage("settingsMessage", "Progress is saved locally. Cloud sync will retry next time.");
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
    await loadUserProgress(currentUser);
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
  const credentials = validateCredentials(form, "signupMessage");
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
    await saveUserProfile(currentUser).catch(() => {});
    await saveProgress(currentUser);
    await refreshDashboardAccess(currentUser);
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

async function clearCloudScenarioProgress(user = currentUser) {
  if (!firebaseSdk?.db || !user) return;

  const storedScenarioIds = [
    ...scenarioIds,
    "sarah-feedback-manager",
    "sarah-feedback-employee"
  ];
  const deletes = storedScenarioIds.flatMap(scenarioId => [
    firebaseSdk.deleteDoc(firebaseSdk.doc(firebaseSdk.db, "users", user.uid, "scenarioProgress", scenarioId)),
    firebaseSdk.deleteDoc(firebaseSdk.doc(firebaseSdk.db, "scenarioResults", `${user.uid}_${scenarioId}`))
  ]);

  await Promise.all(deletes.map(task => task.catch(() => {})));
}

async function resetProgress() {
  const confirmed = window.confirm("Delete your saved learning progress?");
  if (!confirmed) return;

  answers = blankAnswers();
  localStorage.removeItem(storageKeys.scenarioResults);
  localStorage.removeItem("feedbackPlaybook.lastScenarioByRole");
  saveLocalAnswers();
  updateUI();

  if (currentUser && firebaseSdk) {
    try {
      await firebaseSdk.setDoc(userDocRef(currentUser), {
        email: currentUser.email || "",
        learningProgress: progressData(),
        updatedAt: firebaseSdk.serverTimestamp()
      }, { merge: true });
      await clearCloudScenarioProgress(currentUser);
    } catch {
      setMessage("settingsMessage", "Local progress was deleted. Cloud progress could not be reached.");
      return;
    }
  }

  setMessage("settingsMessage", "Progress reset to 0%.", "success");
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
  currentSurvey = Math.max(0, Math.min(surveyDefinitions.length - 1, Number(index) || 0));
  const survey = surveyDefinitions[currentSurvey];
  const firstIncomplete = answers[survey.id]?.findIndex(answer => answer === null) ?? -1;
  currentQuestion = firstIncomplete >= 0 ? firstIncomplete : 0;
  renderSurvey();
  goTo("survey");
}

async function submitSurvey(event) {
  event.preventDefault();
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

  setMessage("surveyMessage", "Pulse survey completed.", "success");
  goTo("home");
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

  document.getElementById("userEmail").textContent = email;
  document.getElementById("accountMode").textContent = currentUser
    ? "Progress syncs with your training account."
    : "Progress is saved on this device.";

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

    const qr = document.createElement("img");
    qr.src = `assets/ar/${card.id}.svg`;
    qr.alt = `Scan code for ${card.framework} ${card.title}`;
    qr.loading = "lazy";
    qr.width = 180;
    qr.height = 180;

    const watchOut = document.createElement("p");
    watchOut.textContent = card.watchOut;
    article.append(header, prompt, qr, watchOut);
    arPrintableCards.append(article);
  });
}

async function loadArCards() {
  const response = await fetch(arCardsFile, { cache: "no-store" });
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

async function startCamera() {
  clearMessages();

  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    setMessage("cameraMessage", "Camera scanning needs HTTPS or localhost. Choose a card to use the interactive preview.");
    return;
  }

  setCameraButtonBusy(true);
  try {
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    cameraPreview.srcObject = cameraStream;
    cameraPreview.hidden = false;
    cameraEmpty.hidden = true;
    arCameraFrame.classList.add("camera-active");
    await cameraPreview.play();

    barcodeDetector = await createBarcodeDetector();
    lastArScanValue = "";
    lastArScanAt = 0;
    arScanFrame = window.requestAnimationFrame(scanArFrame);

    setMessage(
      "cameraMessage",
      barcodeDetector
        ? "Camera is active. Hold a printed card inside the frame."
        : "Camera is active. Automatic scanning is not supported here, so choose a card to preview it.",
      barcodeDetector ? "success" : ""
    );
  } catch (error) {
    const message = error?.name === "NotAllowedError"
      ? "Camera permission was blocked. Allow camera access or choose a card below."
      : "Camera could not start on this device. Choose a card to continue.";
    setMessage("cameraMessage", message);
    stopCamera();
  } finally {
    setCameraButtonBusy(false);
  }
}

function stopCamera() {
  if (arScanFrame) {
    window.cancelAnimationFrame(arScanFrame);
    arScanFrame = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  barcodeDetector = null;
  arScanBusy = false;

  if (cameraPreview) {
    cameraPreview.pause();
    cameraPreview.srcObject = null;
    cameraPreview.hidden = true;
  }

  if (cameraEmpty) cameraEmpty.hidden = false;
  arCameraFrame?.classList.remove("camera-active");
}

function bindEvents() {
  document.getElementById("loginForm").addEventListener("submit", login);
  document.getElementById("signupForm").addEventListener("submit", signup);
  surveyForm.addEventListener("submit", submitSurvey);

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
    if (action === "reset-progress") resetProgress();
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
    if (document.hidden && cameraStream) stopCamera();
  });
}

async function init() {
  await Promise.all([loadSurveyDefinitions(), loadArCards()]);
  answers = loadLocalAnswers();
  renderUnitList();
  renderRatingOptions();
  bindEvents();
  syncMobileNavState();
  updateUI();
  firebaseReady = loadFirebase();

  const requestedRoute = routeFromHash();
  const storedGuest = localStorage.getItem(storageKeys.mode) === "guest";

  if (storedGuest && !authRoutes.has(requestedRoute)) {
    enterGuestMode(protectedRoutes.has(requestedRoute) ? requestedRoute : "home");
  } else {
    goTo(authRoutes.has(requestedRoute) ? requestedRoute : "login", { replace: true });
  }
}

init().catch(error => {
  console.error(error);
  questionTitle.textContent = "Pulse survey content is unavailable.";
  setMessage("surveyMessage", error.message || "The pulse survey could not be loaded.");
});


