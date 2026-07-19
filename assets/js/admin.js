import { loadFirebaseClient, normalizeEmail, rootAdminEmail } from "./firebase-client.js";

const accessPanel = document.getElementById("accessPanel");
const accessMessage = document.getElementById("accessMessage");
const dashboardContent = document.getElementById("dashboardContent");
const refreshButton = document.getElementById("refreshButton");
const userCount = document.getElementById("userCount");
const completionRate = document.getElementById("completionRate");
const averageCareScore = document.getElementById("averageCareScore");
const averageRealScore = document.getElementById("averageRealScore");
const followUpCount = document.getElementById("followUpCount");
const completionChart = document.getElementById("completionChart");
const frameworkChart = document.getElementById("frameworkChart");
const scenarioChart = document.getElementById("scenarioChart");
const usersTable = document.getElementById("usersTable");
const resultsTable = document.getElementById("resultsTable");
const detailPanel = document.getElementById("detailPanel");
const detailTitle = document.getElementById("detailTitle");
const detailBody = document.getElementById("detailBody");
const adminForm = document.getElementById("adminForm");
const adminEmail = document.getElementById("adminEmail");
const adminMessage = document.getElementById("adminMessage");
const adminList = document.getElementById("adminList");
const setupAdminButton = document.getElementById("setupAdminButton");
const dashboardSyncStatus = document.getElementById("dashboardSyncStatus");
const supportQueue = document.getElementById("supportQueue");
const recentActivity = document.getElementById("recentActivity");

let firebaseClient = null;
let currentUser = null;
let dashboardAllowed = false;
let currentFilter = "all";
let cachedUsers = [];
let cachedResults = [];
let cachedAdmins = [];
let canBootstrapAdmin = false;

function notifyMotion(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function setAccess(title, message, allowed = false, options = {}) {
  accessPanel.querySelector("h2").textContent = title;
  accessMessage.textContent = message;
  accessPanel.hidden = allowed;
  dashboardContent.hidden = !allowed;
  setupAdminButton.hidden = allowed || !options.canBootstrapAdmin;
  refreshButton.disabled = !allowed;

  if (dashboardSyncStatus) {
    dashboardSyncStatus.textContent = allowed ? "Secure view" : "Access locked";
  }
}

function setDashboardBusy(busy) {
  dashboardContent.setAttribute("aria-busy", String(busy));
  refreshButton.disabled = busy || !dashboardAllowed;
  if (!refreshButton.dataset.idleLabel) refreshButton.dataset.idleLabel = refreshButton.textContent.trim();
  refreshButton.textContent = busy ? refreshButton.dataset.busyLabel : refreshButton.dataset.idleLabel;
}

function setAdminFormBusy(busy) {
  adminForm.setAttribute("aria-busy", String(busy));
  const submit = adminForm.querySelector('button[type="submit"]');
  submit.disabled = busy;
  submit.textContent = busy ? "Adding..." : "Add viewer";
}

function setAdminMessage(message, tone = "error") {
  adminMessage.textContent = message;
  adminMessage.classList.toggle("success", tone === "success");
}

function formatDate(value) {
  if (!value) return "-";
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
  }
  if (typeof value.toDate === "function") return value.toDate().toLocaleString();
  return "-";
}

function scoreLabel(result) {
  if (!result || result.scorePercent == null) return "-";
  return `${result.scorePercent}%`;
}

function formatBreakdown(result) {
  const details = Array.isArray(result.frameworkDetails) ? result.frameworkDetails : [];
  if (details.length) return details.map(detail => `${detail.label}: ${detail.score}/${detail.maxScore}`).join(" | ");

  const entries = Object.entries(result.frameworkScores || {});
  if (!entries.length) return "-";
  return entries.map(([key, value]) => `${key}: ${value}`).join(" | ");
}

function reflectionValues(result) {
  return Object.values(result?.reflectionAnswers || {}).map(value => String(value || "").trim()).filter(Boolean);
}

function reflectionStatus(results) {
  return results.some(result => reflectionValues(result).length) ? "Saved" : "Pending";
}

function latestResult(results) {
  if (!results.length) return null;
  return [...results].sort((a, b) => String(b.updatedAtIso || b.completedAtIso || "").localeCompare(String(a.updatedAtIso || a.completedAtIso || "")))[0];
}

function latestByFramework(results, frameworkId) {
  return latestResult(results.filter(result => result.frameworkId === frameworkId));
}

function allTrackedUsers(users, results) {
  const map = new Map();
  users.forEach(user => {
    if (user.uid) map.set(user.uid, { ...user, uid: user.uid });
  });

  results.forEach(result => {
    const uid = result.uid || result.email || result.id;
    if (!uid || map.has(uid)) return;
    map.set(uid, {
      uid,
      email: result.email || uid,
      selectedRole: result.selectedRole
    });
  });

  return Array.from(map.values());
}

function resultsForUser(user, results = cachedResults) {
  return results.filter(result => {
    if (user.uid && result.uid === user.uid) return true;
    return normalizeEmail(result.email) && normalizeEmail(result.email) === normalizeEmail(user.email);
  });
}

function userStatus(user) {
  const results = resultsForUser(user);
  if (!results.length) return "not_started";
  if (results.some(result => result.needsFollowUp)) return "needs_follow_up";
  if (results.some(result => result.completed)) return "completed";
  return "in_progress";
}

function statusText(status) {
  if (status === "needs_follow_up") return "Needs follow-up";
  if (status === "completed") return "Completed";
  if (status === "in_progress") return "In progress";
  return "Not started";
}

function statusTone(status) {
  if (status === "completed") return "success";
  if (status === "needs_follow_up") return "danger";
  if (status === "in_progress") return "warning";
  return "";
}

function setMetricProgress(element, value) {
  const metric = element?.closest(".admin-metric");
  if (!metric) return;
  metric.style.setProperty("--metric-progress", Math.max(0, Math.min(100, Number(value) || 0)) + "%");
}

function barTone(label) {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("completed") || normalized.includes("care")) return "success";
  if (normalized.includes("needs") || normalized.includes("follow")) return "danger";
  if (normalized.includes("progress") || normalized.includes("real")) return "warning";
  return "neutral";
}

function timestampValue(value) {
  if (!value) return 0;
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function resultTimestamp(result) {
  return Math.max(
    timestampValue(result.updatedAt),
    timestampValue(result.updatedAtIso),
    timestampValue(result.completedAt),
    timestampValue(result.completedAtIso)
  );
}

function averageFor(results, frameworkId) {
  const completed = results.filter(result => result.completed && result.frameworkId === frameworkId && result.scorePercent != null);
  if (!completed.length) return 0;
  return Math.round(completed.reduce((sum, result) => sum + Number(result.scorePercent || 0), 0) / completed.length);
}

function renderMetrics(users, results) {
  const tracked = allTrackedUsers(users, results);
  const completedUsers = tracked.filter(user => resultsForUser(user, results).some(result => result.completed)).length;
  const followUps = tracked.filter(user => resultsForUser(user, results).some(result => result.needsFollowUp)).length;
  const rate = tracked.length ? Math.round((completedUsers / tracked.length) * 100) : 0;
  const careAverage = averageFor(results, "CARE");
  const realAverage = averageFor(results, "REAL");
  const followUpRate = tracked.length ? Math.round((followUps / tracked.length) * 100) : 0;

  userCount.textContent = String(tracked.length);
  completionRate.textContent = rate + "%";
  averageCareScore.textContent = careAverage + "%";
  averageRealScore.textContent = realAverage + "%";
  followUpCount.textContent = String(followUps);

  setMetricProgress(userCount, tracked.length ? 100 : 0);
  setMetricProgress(completionRate, rate);
  setMetricProgress(averageCareScore, careAverage);
  setMetricProgress(averageRealScore, realAverage);
  setMetricProgress(followUpCount, followUpRate);
}

function renderBar(container, label, value, max = 100) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const row = document.createElement("div");
  row.className = "bar-row";
  row.dataset.tone = barTone(label);

  const header = document.createElement("header");
  const name = document.createElement("span");
  name.textContent = label;
  const amount = document.createElement("strong");
  amount.textContent = max === 100 ? `${value}%` : String(value);
  header.append(name, amount);

  const track = document.createElement("div");
  track.className = "bar-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", String(max));
  track.setAttribute("aria-valuenow", String(value));
  track.setAttribute("aria-label", label);

  const bar = document.createElement("span");
  bar.style.width = `${percent}%`;
  track.append(bar);
  row.append(header, track);
  container.append(row);
}

function renderCharts(users, results) {
  completionChart.textContent = "";
  frameworkChart.textContent = "";
  scenarioChart.textContent = "";

  const tracked = allTrackedUsers(users, results);
  const total = Math.max(1, tracked.length);
  const completed = tracked.filter(user => userStatus(user) === "completed").length;
  const inProgress = tracked.filter(user => userStatus(user) === "in_progress").length;
  const notStarted = tracked.filter(user => userStatus(user) === "not_started").length;
  const followUp = tracked.filter(user => userStatus(user) === "needs_follow_up").length;

  renderBar(completionChart, "Completed", Math.round((completed / total) * 100));
  renderBar(completionChart, "In progress", Math.round((inProgress / total) * 100));
  renderBar(completionChart, "Not started", Math.round((notStarted / total) * 100));
  renderBar(completionChart, "Needs follow-up", Math.round((followUp / total) * 100));

  renderBar(frameworkChart, "CARE average", averageFor(results, "CARE"));
  renderBar(frameworkChart, "REAL average", averageFor(results, "REAL"));

  const byScenario = new Map();
  results.filter(result => result.completed).forEach(result => {
    const title = result.scenarioTitle || result.scenarioId || "Scenario";
    byScenario.set(title, (byScenario.get(title) || 0) + 1);
  });

  if (!byScenario.size) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = "No completed scenarios yet.";
    scenarioChart.append(note);
    return;
  }

  byScenario.forEach((count, title) => renderBar(scenarioChart, title, count, Math.max(1, tracked.length)));
}

function renderInsightItem(container, title, meta, tone = "") {
  const item = document.createElement("article");
  item.className = "insight-item";
  if (tone) item.dataset.tone = tone;

  const marker = document.createElement("span");
  marker.className = "insight-marker";
  marker.setAttribute("aria-hidden", "true");

  const copy = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = title;
  const small = document.createElement("small");
  small.textContent = meta;
  copy.append(strong, small);
  item.append(marker, copy);
  container.append(item);
}

function renderInsights(users, results) {
  supportQueue.textContent = "";
  recentActivity.textContent = "";

  const followUpUsers = allTrackedUsers(users, results)
    .filter(user => userStatus(user) === "needs_follow_up")
    .slice(0, 5);

  if (!followUpUsers.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "No follow-up signals right now.";
    supportQueue.append(empty);
  } else {
    followUpUsers.forEach(user => {
      const userResults = resultsForUser(user, results);
      const latest = latestResult(userResults) || {};
      renderInsightItem(
        supportQueue,
        user.email || user.uid || "Unknown learner",
        (latest.frameworkId || "Scenario") + " - " + scoreLabel(latest) + " - " + formatDate(latest.updatedAt || latest.updatedAtIso || latest.completedAt || latest.completedAtIso),
        "danger"
      );
    });
  }

  const recentResults = [...results]
    .sort((a, b) => resultTimestamp(b) - resultTimestamp(a))
    .slice(0, 5);

  if (!recentResults.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "Scenario saves will appear here after learners start.";
    recentActivity.append(empty);
    return;
  }

  recentResults.forEach(result => {
    renderInsightItem(
      recentActivity,
      result.email || result.uid || "Unknown learner",
      (result.scenarioTitle || result.scenarioId || "Scenario") + " - " + (result.frameworkId || "Framework") + " - " + scoreLabel(result),
      result.needsFollowUp ? "danger" : statusTone(result.completed ? "completed" : "in_progress")
    );
  });
}

function createCell(label, value) {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  if (value instanceof Node) cell.append(value);
  else cell.textContent = value;
  return cell;
}

function createStatusPill(text, tone = "") {
  const pill = document.createElement("span");
  pill.className = ("status-pill " + tone).trim();
  pill.textContent = text;
  return pill;
}

function createScoreMeter(result) {
  const percent = Number(result?.scorePercent ?? 0);
  const wrap = document.createElement("div");
  wrap.className = "score-meter";
  wrap.style.setProperty("--score", Math.max(0, Math.min(100, percent)) + "%");

  const value = document.createElement("strong");
  value.textContent = String(result?.score ?? 0) + "/" + String(result?.maxScore ?? 0) + " (" + percent + "%)";
  const track = document.createElement("span");
  track.setAttribute("aria-hidden", "true");
  wrap.append(value, track);
  return wrap;
}

function renderUsers(users, results) {
  usersTable.textContent = "";
  const tracked = allTrackedUsers(users, results);
  const filtered = currentFilter === "all" ? tracked : tracked.filter(user => userStatus(user) === currentFilter);

  if (!filtered.length) {
    const row = document.createElement("tr");
    const cell = createCell("Status", "No learners match this filter yet.");
    cell.colSpan = 9;
    row.append(cell);
    usersTable.append(row);
    notifyMotion("motion:content-added", { element: row });
    return;
  }

  filtered.forEach(user => {
    const userResults = resultsForUser(user, results);
    const latest = latestResult(userResults) || {};
    const care = latestByFramework(userResults, "CARE");
    const real = latestByFramework(userResults, "REAL");
    const status = userStatus(user);
    const completedCount = userResults.filter(result => result.completed).length;
    const action = document.createElement("button");
    action.className = "button subtle fit";
    action.type = "button";
    action.dataset.userId = user.uid || user.email || "";
    action.textContent = "View details";

    const row = document.createElement("tr");
    if (status === "needs_follow_up") row.className = "needs-follow-up";
    row.append(
      createCell("Name", user.email || user.uid || "Unknown"),
      createCell("Role", latest.selectedRole || user.selectedRole || "-"),
      createCell("Completed scenarios", String(completedCount)),
      createCell("CARE score", scoreLabel(care)),
      createCell("REAL score", scoreLabel(real)),
      createCell("Status", createStatusPill(statusText(status), statusTone(status))),
      createCell("Reflection", createStatusPill(reflectionStatus(userResults), reflectionStatus(userResults) === "Saved" ? "success" : "warning")),
      createCell("Last activity", formatDate(latest.updatedAt || latest.updatedAtIso || latest.completedAt || latest.completedAtIso)),
      createCell("Action", action)
    );
    usersTable.append(row);
    notifyMotion("motion:content-added", { element: row });
  });
}

function renderResults(results) {
  resultsTable.textContent = "";

  if (!results.length) {
    const row = document.createElement("tr");
    const cell = createCell("Status", "No scenario results have been saved yet.");
    cell.colSpan = 6;
    row.append(cell);
    resultsTable.append(row);
      notifyMotion("motion:content-added", { element: row });
    return;
  }

  [...results]
    .sort((a, b) => String(b.updatedAtIso || "").localeCompare(String(a.updatedAtIso || "")))
    .forEach(result => {
      const row = document.createElement("tr");
      if (result.needsFollowUp) row.className = "needs-follow-up";
      row.append(
        createCell("User", result.email || result.uid || "Unknown"),
        createCell("Scenario", result.scenarioTitle || result.scenarioId || "-"),
        createCell("Framework", result.frameworkId || "-"),
        createCell("Score", createScoreMeter(result)),
        createCell("Breakdown", formatBreakdown(result)),
        createCell("Reflection", reflectionValues(result).join(" / ") || "No reflection saved")
      );
      resultsTable.append(row);
      notifyMotion("motion:content-added", { element: row });
    });
}

function renderAdmins(admins) {
  adminList.textContent = "";

  const viewerEmails = admins
    .map(admin => normalizeEmail(admin.email || admin.id))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  if (!viewerEmails.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "No dashboard viewers have been added yet.";
    adminList.append(empty);
    return;
  }

  viewerEmails.forEach(email => {
    const item = document.createElement("div");
    item.className = "admin-list-item";
    const label = document.createElement("strong");
    label.textContent = email;
    const meta = document.createElement("span");
    meta.textContent = email === normalizeEmail(currentUser?.email) ? "Current viewer" : "Dashboard viewer";

    const copy = document.createElement("div");
    copy.append(label, meta);

    const button = document.createElement("button");
    button.className = "button subtle fit";
    button.type = "button";
    button.dataset.removeAdmin = email;
    button.textContent = "Remove";
    button.disabled = email === normalizeEmail(currentUser?.email);

    item.append(copy, button);
    adminList.append(item);
  });
}

function renderDetail(userId) {
  const user = allTrackedUsers(cachedUsers, cachedResults).find(item => String(item.uid || item.email) === String(userId));
  if (!user) return;

  const results = resultsForUser(user);
  const latest = latestResult(results) || {};
  detailPanel.hidden = false;
  detailTitle.textContent = user.email || user.uid || "Learner detail";
  detailBody.textContent = "";

  const summary = document.createElement("div");
  summary.className = "detail-grid";
  [
    ["Role", latest.selectedRole || user.selectedRole || "-"],
    ["Completed", String(results.filter(result => result.completed).length)],
    ["Status", statusText(userStatus(user))]
  ].forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "detail-card";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = value;
    card.append(span, strong);
    summary.append(card);
  });

  const reflections = document.createElement("div");
  reflections.className = "reflection-list";
  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "No scenario records yet.";
    reflections.append(empty);
  }

  results.forEach(result => {
    const item = document.createElement("article");
    item.className = "reflection-item";
    const title = document.createElement("strong");
    title.textContent = `${result.scenarioTitle || result.scenarioId || "Scenario"} - ${result.frameworkId || "Framework"} - ${scoreLabel(result)}`;
    item.append(title);

    const breakdown = document.createElement("p");
    breakdown.textContent = formatBreakdown(result);
    item.append(breakdown);

    const values = reflectionValues(result);
    const reflection = document.createElement("p");
    reflection.textContent = values.length ? values.join(" / ") : "No reflection saved.";
    item.append(reflection);
    reflections.append(item);
  });

  detailBody.append(summary, reflections);
  notifyMotion("motion:content-added", { element: detailPanel });
  detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function checkAdminAccess(user) {
  canBootstrapAdmin = false;
  if (!user) return false;

  const email = normalizeEmail(user.email);
  if (!email) return false;

  const snap = await firebaseClient.getDoc(firebaseClient.doc(firebaseClient.db, "dashboardAdminEmails", email));
  if (snap.exists()) return true;

  canBootstrapAdmin = email === rootAdminEmail;
  return false;
}

async function createAdminProfile() {
  const email = normalizeEmail(currentUser?.email);
  if (!email || email !== rootAdminEmail) return;

  setupAdminButton.disabled = true;
  setAccess("Creating admin profile", "Adding this email to the dashboard viewer profile list...", false, { canBootstrapAdmin: true });

  await firebaseClient.setDoc(firebaseClient.doc(firebaseClient.db, "dashboardAdminEmails", email), {
    email,
    role: "owner",
    addedBy: email,
    addedAt: firebaseClient.serverTimestamp()
  }, { merge: true });

  canBootstrapAdmin = false;
  dashboardAllowed = true;
  setupAdminButton.disabled = false;
  await loadDashboard();
}

async function loadDashboard() {
  if (!dashboardAllowed) return;

  setAccess("Loading dashboard", "Fetching user progress and scenario scoring records...", true);
  setDashboardBusy(true);

  try {
    const [usersSnap, resultsSnap, adminsSnap] = await Promise.all([
      firebaseClient.getDocs(firebaseClient.collection(firebaseClient.db, "users")),
      firebaseClient.getDocs(firebaseClient.collection(firebaseClient.db, "scenarioResults")),
      firebaseClient.getDocs(firebaseClient.collection(firebaseClient.db, "dashboardAdminEmails"))
    ]);

    cachedUsers = usersSnap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    cachedResults = resultsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    cachedAdmins = adminsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    renderMetrics(cachedUsers, cachedResults);
    renderCharts(cachedUsers, cachedResults);
    renderInsights(cachedUsers, cachedResults);
    renderUsers(cachedUsers, cachedResults);
    renderResults(cachedResults);
    renderAdmins(cachedAdmins);
    if (dashboardSyncStatus) {
      dashboardSyncStatus.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  } finally {
    setDashboardBusy(false);
  }
}

async function addAdmin(event) {
  event.preventDefault();
  const email = normalizeEmail(adminEmail.value);
  if (!email) {
    setAdminMessage("Enter a valid email address.");
    return;
  }

  setAdminFormBusy(true);
  try {
    await firebaseClient.setDoc(firebaseClient.doc(firebaseClient.db, "dashboardAdminEmails", email), {
      email,
      addedBy: currentUser?.email || "",
      addedAt: firebaseClient.serverTimestamp()
    }, { merge: true });

    adminEmail.value = "";
    setAdminMessage("Dashboard viewer added.", "success");
    await loadDashboard();
  } finally {
    setAdminFormBusy(false);
  }
}

async function removeAdmin(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  if (normalized === normalizeEmail(currentUser?.email)) {
    setAdminMessage("You cannot remove your own admin profile while signed in.");
    return;
  }

  await firebaseClient.deleteDoc(firebaseClient.doc(firebaseClient.db, "dashboardAdminEmails", normalized));
  setAdminMessage("Dashboard viewer removed.", "success");
  await loadDashboard();
}

function bindEvents() {
  refreshButton.addEventListener("click", () => loadDashboard().catch(error => {
    setAccess("Dashboard error", error.message || "Could not refresh dashboard.");
  }));

  setupAdminButton.addEventListener("click", () => {
    createAdminProfile().catch(error => {
      setupAdminButton.disabled = false;
      setAccess("Setup failed", error.message || "Could not create the admin profile.", false, { canBootstrapAdmin });
    });
  });

  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("active", item === button));
      renderUsers(cachedUsers, cachedResults);
    });
  });

  usersTable.addEventListener("click", event => {
    const userId = event.target.closest("[data-user-id]")?.dataset.userId;
    if (userId) renderDetail(userId);
  });

  adminForm.addEventListener("submit", event => {
    addAdmin(event).catch(error => setAdminMessage(error.message || "Could not add dashboard viewer."));
  });

  adminList.addEventListener("click", event => {
    const email = event.target.closest("[data-remove-admin]")?.dataset.removeAdmin;
    if (email) removeAdmin(email).catch(error => setAdminMessage(error.message || "Could not remove dashboard viewer."));
  });
}

async function init() {
  bindEvents();
  setAccess("Connecting", "Checking Firebase Authentication and dashboard permissions...");

  try {
    firebaseClient = await loadFirebaseClient();
    firebaseClient.onAuthStateChanged(firebaseClient.auth, async user => {
      currentUser = user;
      if (!user) {
        dashboardAllowed = false;
        setAccess("Sign in required", "Sign in from the main app with an authorised dashboard account, then return here.");
        return;
      }

      dashboardAllowed = await checkAdminAccess(user);
      if (!dashboardAllowed) {
        if (canBootstrapAdmin) {
          setAccess(
            "Admin profile required",
            "This email is approved for first setup, but the dashboard will stay hidden until its admin profile is created.",
            false,
            { canBootstrapAdmin: true }
          );
          return;
        }

        setAccess("Access denied", (user.email || "This account") + " is not authorised to view the dashboard.");
        return;
      }

      await loadDashboard();
    });
  } catch (error) {
    setAccess("Firebase unavailable", error.message || "Dashboard data cannot be loaded.");
  }
}

init();

