const firebaseVersion = "12.15.0";
const firebaseBaseUrl = `https://www.gstatic.com/firebasejs/${firebaseVersion}`;

const storageKeys = {
  answers: "feedbackPlaybook.answers",
  legacyAnswers: "answers",
  email: "feedbackPlaybook.userEmail",
  legacyEmail: "userEmail",
  mode: "feedbackPlaybook.mode"
};

const protectedRoutes = new Set(["home", "survey", "ar", "settings"]);
const authRoutes = new Set(["login", "signup"]);
const routeIds = ["login", "signup", "home", "survey", "ar", "settings"];

const units = [
  {
    title: "Understanding Feedback",
    description: "Recognize what useful feedback should clarify.",
    question: "How comfortable are you identifying useful feedback?"
  },
  {
    title: "Giving Feedback",
    description: "Practice clear recognition and constructive evaluation.",
    question: "How comfortable are you giving balanced feedback?"
  },
  {
    title: "Receiving Feedback",
    description: "Respond productively when feedback is difficult.",
    question: "How comfortable are you receiving feedback?"
  },
  {
    title: "Practice",
    description: "Apply the REAL framework in a workplace scenario.",
    question: "How comfortable are you applying the skill in practice?"
  }
];

const ratingLabels = [
  "Very uncomfortable",
  "Somewhat uncomfortable",
  "Neutral",
  "Somewhat comfortable",
  "Very comfortable"
];

let firebaseSdk = null;
let firebaseLoadError = null;
let currentUser = null;
let isGuest = false;
let currentSurvey = 0;
let pendingSurveyValue = null;
let answers = loadLocalAnswers();
let cameraStream = null;
let activeRoute = "login";

const firebaseReady = loadFirebase();

const appShell = document.getElementById("appShell");
const unitList = document.getElementById("unitList");
const ratingOptions = document.getElementById("ratingOptions");
const surveyForm = document.getElementById("surveyForm");
const questionTitle = document.getElementById("questionTitle");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const progressPercent = document.getElementById("progressPercent");
const sidebarProgressBar = document.getElementById("sidebarProgressBar");
const sidebarProgressText = document.getElementById("sidebarProgressText");
const cameraPreview = document.getElementById("cameraPreview");
const cameraEmpty = document.getElementById("cameraEmpty");

function isSignedIn() {
  return Boolean(currentUser || isGuest);
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeAnswers(value) {
  if (!Array.isArray(value)) return [null, null, null, null];

  return units.map((_, index) => {
    const answer = value[index];
    const normalized = Number(answer);
    return Number.isInteger(normalized) && normalized >= 0 && normalized <= 4 ? normalized : null;
  });
}

function loadLocalAnswers() {
  const stored = localStorage.getItem(storageKeys.answers) ?? localStorage.getItem(storageKeys.legacyAnswers);
  return normalizeAnswers(safeJsonParse(stored, [null, null, null, null]));
}

function saveLocalAnswers() {
  localStorage.setItem(storageKeys.answers, JSON.stringify(answers));
  localStorage.setItem(storageKeys.legacyAnswers, JSON.stringify(answers));
}

function encodedAnswers() {
  return answers.map(answer => answer === null ? -1 : answer);
}

function progressData() {
  const completed = answers.filter(answer => answer !== null).length;
  const progress = completed * 25;

  return {
    answers: encodedAnswers(),
    completed,
    progress,
    updatedAt: Date.now()
  };
}

function decodedCloudAnswers(value) {
  if (!Array.isArray(value)) return [null, null, null, null];
  return normalizeAnswers(value.map(answer => Number(answer) < 0 ? null : answer));
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

  throw new Error("Firebase config is unavailable. Guest mode will save progress on this device only.");
}

async function loadFirebase() {
  try {
    const firebaseConfig = await loadFirebaseConfig();
    const [appModule, authModule, databaseModule] = await Promise.all([
      import(`${firebaseBaseUrl}/firebase-app.js`),
      import(`${firebaseBaseUrl}/firebase-auth.js`),
      import(`${firebaseBaseUrl}/firebase-database.js`)
    ]);

    const app = appModule.initializeApp(firebaseConfig);
    firebaseSdk = {
      app,
      auth: authModule.getAuth(app),
      db: databaseModule.getDatabase(app),
      createUserWithEmailAndPassword: authModule.createUserWithEmailAndPassword,
      get: databaseModule.get,
      onAuthStateChanged: authModule.onAuthStateChanged,
      ref: databaseModule.ref,
      remove: databaseModule.remove,
      set: databaseModule.set,
      signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
      signOut: authModule.signOut
    };

    firebaseSdk.onAuthStateChanged(firebaseSdk.auth, async user => {
      if (!user) {
        currentUser = null;
        if (!isGuest) {
          updateUI();
          if (!authRoutes.has(activeRoute)) goTo("login", { replace: true });
        }
        return;
      }

      isGuest = false;
      localStorage.setItem(storageKeys.mode, "cloud");
      currentUser = user;
      localStorage.setItem(storageKeys.email, user.email || "");
      localStorage.setItem(storageKeys.legacyEmail, user.email || "");
      await loadUserProgress(user);
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

function userProgressRef(user = currentUser) {
  return firebaseSdk.ref(firebaseSdk.db, `users/${user.uid}/progress`);
}

function userProfileRef(user = currentUser) {
  return firebaseSdk.ref(firebaseSdk.db, `users/${user.uid}/profile`);
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
  form.querySelectorAll("button").forEach(button => {
    button.disabled = busy;
  });
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
  await firebaseSdk.set(userProfileRef(user), {
    email: user.email,
    updatedAt: Date.now()
  });
}

async function loadUserProgress(user) {
  if (!firebaseSdk) return;

  try {
    const snapshot = await firebaseSdk.get(userProgressRef(user));
    if (snapshot.exists()) {
      answers = decodedCloudAnswers(snapshot.val().answers);
    } else {
      answers = loadLocalAnswers();
      await saveProgress(user);
    }
  } catch {
    answers = loadLocalAnswers();
  }

  saveLocalAnswers();
  updateUI();
}

async function saveProgress(user = currentUser) {
  saveLocalAnswers();
  updateUI();

  if (!user || !firebaseSdk) return;

  try {
    await firebaseSdk.set(userProgressRef(user), progressData());
  } catch {
    setMessage("settingsMessage", "Progress is saved locally. Cloud sync will retry next time.");
  }
}

function enterGuestMode(route = "home") {
  isGuest = true;
  currentUser = null;
  localStorage.setItem(storageKeys.mode, "guest");
  localStorage.setItem(storageKeys.email, "Guest learner");
  localStorage.setItem(storageKeys.legacyEmail, "Guest learner");
  answers = loadLocalAnswers();
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
    const credential = await sdk.signInWithEmailAndPassword(sdk.auth, credentials.email, credentials.password);
    currentUser = credential.user;
    localStorage.setItem(storageKeys.email, currentUser.email || credentials.email);
    localStorage.setItem(storageKeys.legacyEmail, currentUser.email || credentials.email);
    await loadUserProgress(currentUser);
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
    const credential = await sdk.createUserWithEmailAndPassword(sdk.auth, credentials.email, credentials.password);
    currentUser = credential.user;
    localStorage.setItem(storageKeys.email, currentUser.email || credentials.email);
    localStorage.setItem(storageKeys.legacyEmail, currentUser.email || credentials.email);
    await saveUserProfile(currentUser).catch(() => {});
    await saveProgress(currentUser);
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
  isGuest = false;
  localStorage.removeItem(storageKeys.mode);
  localStorage.removeItem(storageKeys.email);
  localStorage.removeItem(storageKeys.legacyEmail);
  updateUI();
  goTo("login");
}

async function resetProgress() {
  const confirmed = window.confirm("Delete your saved progress for all four units?");
  if (!confirmed) return;

  answers = [null, null, null, null];
  localStorage.removeItem(storageKeys.answers);
  localStorage.removeItem(storageKeys.legacyAnswers);
  updateUI();

  if (currentUser && firebaseSdk) {
    try {
      await firebaseSdk.remove(userProgressRef(currentUser));
    } catch {
      setMessage("settingsMessage", "Local progress was deleted. Cloud progress could not be reached.");
      return;
    }
  }

  setMessage("settingsMessage", "Progress deleted.", "success");
}

function renderUnitList() {
  unitList.textContent = "";

  units.forEach((unit, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "unit-row";
    button.dataset.surveyIndex = String(index);

    const number = document.createElement("span");
    number.className = "unit-number";
    number.textContent = String(index + 1);

    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = unit.title;
    const description = document.createElement("small");
    description.textContent = unit.description;
    copy.append(title, description);

    const state = document.createElement("span");
    state.className = "unit-state";

    button.append(number, copy, state);
    unitList.append(button);
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
    input.value = String(index);

    const text = document.createElement("span");
    text.textContent = label;

    option.append(input, text);
    ratingOptions.append(option);
  });
}

function renderSurvey() {
  const unit = units[currentSurvey];
  pendingSurveyValue = answers[currentSurvey];
  questionTitle.textContent = unit.question;
  setMessage("surveyMessage", "");

  surveyForm.querySelectorAll('input[name="comfort"]').forEach(input => {
    input.checked = Number(input.value) === pendingSurveyValue;
  });
}

function openSurvey(index) {
  currentSurvey = Math.max(0, Math.min(units.length - 1, Number(index) || 0));
  renderSurvey();
  goTo("survey");
}

async function submitSurvey(event) {
  event.preventDefault();
  const selected = surveyForm.querySelector('input[name="comfort"]:checked');

  if (!selected) {
    setMessage("surveyMessage", "Choose a response before saving.");
    return;
  }

  answers[currentSurvey] = Number(selected.value);
  await saveProgress();
  setMessage("surveyMessage", "Response saved.", "success");
  goTo("home");
}

function updateUI() {
  const completed = answers.filter(answer => answer !== null).length;
  const progress = completed * 25;
  const email = currentUser?.email || localStorage.getItem(storageKeys.email) || localStorage.getItem(storageKeys.legacyEmail) || "Guest learner";

  progressBar.style.width = `${progress}%`;
  sidebarProgressBar.style.width = `${progress}%`;
  progressPercent.textContent = `${progress}%`;
  progressText.textContent = `${completed} of ${units.length} units completed`;
  sidebarProgressText.textContent = `${progress}% complete`;

  document.getElementById("userEmail").textContent = email;
  document.getElementById("accountMode").textContent = currentUser
    ? "Progress syncs with your training account."
    : "Progress is saved on this device.";

  document.querySelectorAll(".unit-row").forEach((row, index) => {
    const complete = answers[index] !== null;
    row.classList.toggle("complete", complete);
    row.querySelector(".unit-state").textContent = complete ? "Complete" : "Start";
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

  activeRoute = resolvedRoute;
  appShell.classList.toggle("auth-mode", authRoutes.has(resolvedRoute));

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

  const hash = `#${resolvedRoute}`;
  if (window.location.hash !== hash) {
    if (options.replace) history.replaceState(null, "", hash);
    else history.pushState(null, "", hash);
  }
}

async function startCamera() {
  clearMessages();

  if (!navigator.mediaDevices?.getUserMedia) {
    setMessage("cameraMessage", "Camera access is not supported in this browser.");
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    cameraPreview.srcObject = cameraStream;
    cameraPreview.hidden = false;
    cameraEmpty.hidden = true;
    setMessage("cameraMessage", "Camera is active.", "success");
  } catch (error) {
    const message = error?.name === "NotAllowedError"
      ? "Camera permission was blocked. Allow camera access to use the scanner."
      : "Camera could not start on this device.";
    setMessage("cameraMessage", message);
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }

  if (cameraPreview) {
    cameraPreview.srcObject = null;
    cameraPreview.hidden = true;
  }

  if (cameraEmpty) cameraEmpty.hidden = false;
}

function bindEvents() {
  document.getElementById("loginForm").addEventListener("submit", login);
  document.getElementById("signupForm").addEventListener("submit", signup);
  surveyForm.addEventListener("submit", submitSurvey);

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

    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "guest") enterGuestMode();
    if (action === "logout") logout();
    if (action === "reset-progress") resetProgress();
    if (action === "start-camera") startCamera();
    if (action === "stop-camera") {
      stopCamera();
      setMessage("cameraMessage", "Camera stopped.", "success");
    }
  });

  window.addEventListener("hashchange", () => {
    const route = routeFromHash();
    if (route !== activeRoute) goTo(route, { replace: true });
  });
}

function init() {
  renderUnitList();
  renderRatingOptions();
  bindEvents();
  updateUI();

  const requestedRoute = routeFromHash();
  const storedGuest = localStorage.getItem(storageKeys.mode) === "guest";

  if (storedGuest && !authRoutes.has(requestedRoute)) {
    enterGuestMode(protectedRoutes.has(requestedRoute) ? requestedRoute : "home");
  } else {
    goTo(authRoutes.has(requestedRoute) ? requestedRoute : "login", { replace: true });
  }
}

init();
