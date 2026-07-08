import { isRootAdmin, loadFirebaseClient, normalizeEmail, rootAdminEmail } from "./firebase-client.js";

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

let firebaseClient = null;
let currentUser = null;
let dashboardAllowed = false;
let currentFilter = "all";
let cachedUsers = [];
let cachedResults = [];
let cachedAdmins = [];

function notifyMotion(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function setAccess(title, message, allowed = false) {
  accessPanel.querySelector("h2").textContent = title;
  accessMessage.textContent = message;
  accessPanel.hidden = allowed;
  dashboardContent.hidden = !allowed;
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

  userCount.textContent = String(tracked.length);
  completionRate.textContent = `${rate}%`;
  averageCareScore.textContent = `${averageFor(results, "CARE")}%`;
  averageRealScore.textContent = `${averageFor(results, "REAL")}%`;
  followUpCount.textContent = String(followUps);
}

function renderBar(container, label, value, max = 100) {
  const percent = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const row = document.createElement("div");
  row.className = "bar-row";

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

function createCell(label, value) {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  if (value instanceof Node) cell.append(value);
  else cell.textContent = value;
  return cell;
}

function createStatusPill(text, tone = "") {
  const pill = document.createElement("span");
  pill.className = `status-pill ${tone}`.trim();
  pill.textContent = text;
  return pill;
}

function renderUsers(users, results) {
  usersTable.textContent = "";
  const tracked = allTrackedUsers(users, results);
  const filtered = currentFilter === "all" ? tracked : tracked.filter(user => userStatus(user) === currentFilter);

  if (!filtered.length) {
    const row = document.createElement("tr");
    const cell = createCell("Status", "No learners match this filter yet.");
    cell.colSpan = 8;
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
        createCell("Score", `${result.score ?? 0}/${result.maxScore ?? 0} (${result.scorePercent ?? 0}%)`),
        createCell("Breakdown", formatBreakdown(result)),
        createCell("Reflection", reflectionValues(result).join(" / ") || "No reflection saved")
      );
      resultsTable.append(row);
      notifyMotion("motion:content-added", { element: row });
    });
}

function renderAdmins(admins) {
  adminList.textContent = "";

  const rootItem = document.createElement("div");
  rootItem.className = "admin-list-item";
  const root = document.createElement("strong");
  root.textContent = rootAdminEmail;
  const rootLabel = document.createElement("span");
  rootLabel.textContent = "Root admin";
  rootItem.append(root, rootLabel);
  adminList.append(rootItem);

  admins.forEach(admin => {
    const email = normalizeEmail(admin.email || admin.id);
    if (!email || email === rootAdminEmail) return;

    const item = document.createElement("div");
    item.className = "admin-list-item";
    const label = document.createElement("strong");
    label.textContent = email;
    const button = document.createElement("button");
    button.className = "button subtle fit";
    button.type = "button";
    button.dataset.removeAdmin = email;
    button.textContent = "Remove";
    item.append(label, button);
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
  if (!user) return false;
  if (isRootAdmin(user)) return true;

  const email = normalizeEmail(user.email);
  if (!email) return false;
  const snap = await firebaseClient.getDoc(firebaseClient.doc(firebaseClient.db, "dashboardAdminEmails", email));
  return snap.exists();
}

async function loadDashboard() {
  if (!dashboardAllowed) return;

  setAccess("Loading dashboard", "Fetching user progress and scenario scoring records...", true);

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
  renderUsers(cachedUsers, cachedResults);
  renderResults(cachedResults);
  renderAdmins(cachedAdmins);
}

async function addAdmin(event) {
  event.preventDefault();
  const email = normalizeEmail(adminEmail.value);
  if (!email) {
    setAdminMessage("Enter a valid email address.");
    return;
  }

  await firebaseClient.setDoc(firebaseClient.doc(firebaseClient.db, "dashboardAdminEmails", email), {
    email,
    addedBy: currentUser?.email || "",
    addedAt: firebaseClient.serverTimestamp()
  }, { merge: true });

  adminEmail.value = "";
  setAdminMessage("Dashboard viewer added.", "success");
  await loadDashboard();
}

async function removeAdmin(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized === rootAdminEmail) return;

  await firebaseClient.deleteDoc(firebaseClient.doc(firebaseClient.db, "dashboardAdminEmails", normalized));
  setAdminMessage("Dashboard viewer removed.", "success");
  await loadDashboard();
}

function bindEvents() {
  refreshButton.addEventListener("click", () => loadDashboard().catch(error => {
    setAccess("Dashboard error", error.message || "Could not refresh dashboard.");
  }));

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
        setAccess("Access denied", `${user.email || "This account"} is not authorised to view the dashboard.`);
        return;
      }

      await loadDashboard();
    });
  } catch (error) {
    setAccess("Firebase unavailable", error.message || "Dashboard data cannot be loaded.");
  }
}

init();

