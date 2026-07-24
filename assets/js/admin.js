import { dashboardRole, loadFirebaseClient, normalizeEmail, rootAdminEmail } from "./firebase-client.js";

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
const adminSignInLink = document.getElementById("adminSignInLink");
const dashboardSyncStatus = document.getElementById("dashboardSyncStatus");
const supportQueue = document.getElementById("supportQueue");
const recentActivity = document.getElementById("recentActivity");
const refreshButtonLabel = document.getElementById("refreshButtonLabel");
const frameworkView = document.getElementById("frameworkView");
const attemptView = document.getElementById("attemptView");
const cohortView = document.getElementById("cohortView");
const scenarioView = document.getElementById("scenarioView");
const overviewSyncText = document.getElementById("overviewSyncText");
const dashboardNotice = document.getElementById("dashboardNotice");
const scoreMetricLabel = document.getElementById("scoreMetricLabel");
const selectedFrameworkScore = document.getElementById("selectedFrameworkScore");
const scoreTrend = document.getElementById("scoreTrend");
const selectedScoreContext = document.getElementById("selectedScoreContext");
const responseRateMetric = document.getElementById("responseRateMetric");
const responseCountMetric = document.getElementById("responseCountMetric");
const priorityAreaValue = document.getElementById("priorityAreaValue");
const priorityAreaDetail = document.getElementById("priorityAreaDetail");
const pulseComparisonChart = document.getElementById("pulseComparisonChart");
const pulseBreakdownTitle = document.getElementById("pulseBreakdownTitle");
const pulseDistribution = document.getElementById("pulseDistribution");
const pulseDistributionSummary = document.getElementById("pulseDistributionSummary");
const recommendationTitle = document.getElementById("recommendationTitle");
const recommendationCopy = document.getElementById("recommendationCopy");
const strongChoiceRate = document.getElementById("strongChoiceRate");
const partialChoiceRate = document.getElementById("partialChoiceRate");
const missedChoiceRate = document.getElementById("missedChoiceRate");
const bothPathsRate = document.getElementById("bothPathsRate");
const improvementValue = document.getElementById("improvementValue");
const dropOffValue = document.getElementById("dropOffValue");
const dateFrom = document.getElementById("dateFrom");
const dateTo = document.getElementById("dateTo");
const dashboardNoticeText = document.getElementById("dashboardNoticeText");
const dashboardRetryButton = document.getElementById("dashboardRetryButton");
const usersPageStatus = document.getElementById("usersPageStatus");
const resultsPageStatus = document.getElementById("resultsPageStatus");
const loadMoreUsersButton = document.getElementById("loadMoreUsers");
const loadMoreResultsButton = document.getElementById("loadMoreResults");
const viewerAdminSection = document.getElementById("viewerAdminSection");
const adminAccountEmail = document.getElementById("adminAccountEmail");
const adminAccountRole = document.getElementById("adminAccountRole");
const adminSignOutButton = document.getElementById("adminSignOutButton");

const scenarioLibraryFile = "assets/data/scenarios/scenario-library.json";

let firebaseClient = null;
let currentUser = null;
let dashboardAllowed = false;
let currentFilter = "all";
let cachedUsers = [];
let cachedResults = [];
let cachedAdmins = [];
let canBootstrapAdmin = false;
let currentDashboardRole = null;
let scenarioDefinitions = [];
let frameworkDefinitions = {};
let usersCursor = null;
let resultsCursor = null;
let hasMoreUsers = false;
let hasMoreResults = false;
let totalUsersFromServer = 0;
let totalResultsFromServer = 0;
const dashboardPageSize = 75;

function notifyMotion(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function setAccess(title, message, allowed = false, options = {}) {
  accessPanel.querySelector("h1").textContent = title;
  accessMessage.textContent = message;
  accessPanel.hidden = allowed;
  dashboardContent.hidden = !allowed;
  setupAdminButton.hidden = allowed || !options.canBootstrapAdmin;
  adminSignInLink.hidden = allowed || !options.needsSignIn;
  refreshButton.disabled = !allowed;

  if (dashboardSyncStatus) {
    dashboardSyncStatus.textContent = allowed ? "Secure view" : "Access locked";
  }
}

function setDashboardBusy(busy) {
  dashboardContent.setAttribute("aria-busy", String(busy));
  refreshButton.disabled = busy || !dashboardAllowed;
  if (!refreshButton.dataset.idleLabel) refreshButton.dataset.idleLabel = refreshButtonLabel?.textContent.trim() || "Refresh";
  if (refreshButtonLabel) {
    refreshButtonLabel.textContent = busy ? refreshButton.dataset.busyLabel : refreshButton.dataset.idleLabel;
  }
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
  return results.some(result => result.reflectionSaved || reflectionValues(result).length) ? "Saved" : "Pending";
}

function latestResult(results) {
  if (!results.length) return null;
  return [...results].sort((a, b) => String(b.updatedAtIso || b.completedAtIso || "").localeCompare(String(a.updatedAtIso || a.completedAtIso || "")))[0];
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

function userStatus(user, results = cachedResults) {
  const userResults = resultsForUser(user, results);
  if (!userResults.length) return "not_started";

  const formalResults = selectAttemptResults(userResults, "first");
  if (formalResults.some(result => resultClassification(result) === "missed")) return "needs_follow_up";
  if (["CARE", "REAL"].some(frameworkId => userCompletedPath(user, results, frameworkId))) return "completed";
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


function barTone(label) {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("completed") || normalized.includes("strong")) return "success";
  if (normalized.includes("needs") || normalized.includes("follow") || normalized.includes("missed") || normalized.includes("drop-off")) return "danger";
  if (normalized.includes("progress") || normalized.includes("partial")) return "warning";
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

async function loadScenarioDefinitions() {
  const response = await fetch(`${scenarioLibraryFile}?v=20260724`);
  if (!response.ok) throw new Error("Scenario scoring definitions could not be loaded.");

  const data = await response.json();
  scenarioDefinitions = Array.isArray(data.scenarios) ? data.scenarios : [];
  frameworkDefinitions = data.frameworks || {};
  syncScenarioOptions();
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resultPlayerKey(result) {
  return result.uid || result.anonymousPlayerId || normalizeEmail(result.email) || result.id;
}

function scenarioDefinition(scenarioId) {
  return scenarioDefinitions.find(item => item.id === scenarioId) || null;
}

function expectedScenarios(frameworkId) {
  return scenarioDefinitions.filter(item => item.frameworkId === frameworkId);
}

function resultOptionScore(result) {
  if (result?.optionScore !== null && result?.optionScore !== undefined) {
    return Number(result.optionScore);
  }

  const selectedChoice = Array.isArray(result?.choices) ? result.choices.at(-1) : null;
  if (selectedChoice?.optionScore !== null && selectedChoice?.optionScore !== undefined) {
    return Number(selectedChoice.optionScore);
  }

  if (result?.completed && Number(result?.maxScore) === 2 && result?.score !== null && result?.score !== undefined) {
    return Number(result.score);
  }

  return null;
}

function resultOptionLabel(result) {
  if (result?.optionSelected) return String(result.optionSelected).toUpperCase();
  const selectedChoice = Array.isArray(result?.choices) ? result.choices.at(-1) : null;
  if (selectedChoice?.optionLabel) return String(selectedChoice.optionLabel).toUpperCase();

  const choiceId = result?.optionId || selectedChoice?.choiceId;
  const definition = scenarioDefinition(result?.scenarioId);
  const index = definition?.choices?.findIndex(choice => choice.id === choiceId) ?? -1;
  return index >= 0 ? String.fromCharCode(65 + index) : null;
}

function resultClassification(result) {
  const supplied = String(result?.choiceClassification || "").toLowerCase();
  if (["strong", "partial", "missed"].includes(supplied)) return supplied;

  const score = resultOptionScore(result);
  if (score === null) return null;
  if (score >= 2) return "strong";
  if (score === 1) return "partial";
  return "missed";
}

function resultAttemptNumber(result) {
  return Math.max(1, Number(result?.attemptNumber || 1));
}

function compareAttempts(a, b) {
  const attemptDifference = resultAttemptNumber(a) - resultAttemptNumber(b);
  return attemptDifference || resultTimestamp(a) - resultTimestamp(b);
}

function selectAttemptResults(results, mode = "first") {
  const scored = results.filter(result => result.completed && resultOptionScore(result) !== null);
  if (mode === "all") return scored;

  const grouped = new Map();
  scored.forEach(result => {
    const key = `${resultPlayerKey(result)}::${result.scenarioId}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, result);
      return;
    }

    const comparison = compareAttempts(result, existing);
    if ((mode === "first" && comparison < 0) || (mode === "latest" && comparison > 0)) {
      grouped.set(key, result);
    }
  });
  return Array.from(grouped.values());
}

function syncScenarioOptions() {
  if (!scenarioView) return;
  const frameworkId = frameworkView?.value || "CARE";
  const previous = scenarioView.value;
  scenarioView.textContent = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All scenarios";
  scenarioView.append(allOption);

  expectedScenarios(frameworkId).forEach(scenarioItem => {
    const option = document.createElement("option");
    option.value = scenarioItem.id;
    option.textContent = scenarioItem.title;
    scenarioView.append(option);
  });

  scenarioView.value = Array.from(scenarioView.options).some(option => option.value === previous) ? previous : "all";
}

function userRole(user, results = cachedResults) {
  const latest = latestResult(resultsForUser(user, results));
  return String(latest?.selectedRole || user?.selectedRole || "").toLowerCase();
}

function dashboardScope(users, results) {
  const framework = frameworkView?.value || "CARE";
  const attemptMode = attemptView?.value || "first";
  const scenarioId = scenarioView?.value || "all";
  const tracked = allTrackedUsers(users, results);
  const frameworkRole = framework === "CARE" ? "employee" : "manager";

  const scopedUsers = tracked.filter(user => {
    const userResults = resultsForUser(user, results);
    return userResults.some(result => result.frameworkId === framework) || userRole(user, results) === frameworkRole;
  });
  const scopedResults = results.filter(result => {
    if (result.frameworkId !== framework) return false;
    return scopedUsers.some(user => resultsForUser(user, [result]).length > 0);
  });

  return { framework, attemptMode, scenarioId, users: scopedUsers, results: scopedResults };
}

function pathScoreForResults(results, frameworkId, mode = "first") {
  const selected = selectAttemptResults(results.filter(result => result.frameworkId === frameworkId), mode);
  if (mode === "all") {
    const scores = selected.map(resultOptionScore).filter(score => score !== null);
    return scores.length ? Math.round((average(scores) / 2) * 100) : null;
  }

  const expectedIds = expectedScenarios(frameworkId).map(item => item.id);
  const scoreByScenario = new Map(selected.map(result => [result.scenarioId, resultOptionScore(result)]));
  if (!expectedIds.length || expectedIds.some(id => !scoreByScenario.has(id))) return null;

  const totalPoints = expectedIds.reduce((sum, id) => sum + Number(scoreByScenario.get(id) || 0), 0);
  return Math.round((totalPoints / 8) * 100);
}

function pathScoreSummary(users, results, frameworkId, mode) {
  const values = users
    .map(user => pathScoreForResults(resultsForUser(user, results), frameworkId, mode))
    .filter(value => value !== null);
  return { average: values.length ? Math.round(average(values)) : null, count: values.length };
}

function userCompletedPath(user, results, frameworkId) {
  const completedIds = new Set(
    resultsForUser(user, results)
      .filter(result => result.frameworkId === frameworkId && result.completed)
      .map(result => result.scenarioId)
  );
  const expectedIds = expectedScenarios(frameworkId).map(item => item.id);
  return expectedIds.length > 0 && expectedIds.every(id => completedIds.has(id));
}

function pathCompletionStats(users, results, frameworkId) {
  const started = users.filter(user => resultsForUser(user, results).some(result => result.frameworkId === frameworkId));
  const completed = started.filter(user => userCompletedPath(user, results, frameworkId));
  return {
    started: started.length,
    completed: completed.length,
    rate: started.length ? Math.round((completed.length / started.length) * 100) : 0
  };
}

function choiceRates(results) {
  const total = results.length;
  const count = classification => results.filter(result => resultClassification(result) === classification).length;
  return {
    total,
    strong: total ? Math.round((count("strong") / total) * 100) : 0,
    partial: total ? Math.round((count("partial") / total) * 100) : 0,
    missed: total ? Math.round((count("missed") / total) * 100) : 0
  };
}

function dimensionDetails(frameworkId, results) {
  const dimensions = frameworkDefinitions?.[frameworkId]?.dimensions || [];
  const firstResults = selectAttemptResults(results, "first");
  const latestResults = selectAttemptResults(results, "latest");

  return dimensions.map(dimension => {
    const scenarios = expectedScenarios(frameworkId)
      .filter(item => item.focusDimension === dimension.id)
      .map(item => item.id);
    const firstScores = firstResults.filter(result => scenarios.includes(result.scenarioId)).map(resultOptionScore);
    const latestScores = latestResults.filter(result => scenarios.includes(result.scenarioId)).map(resultOptionScore);
    return {
      id: dimension.id,
      label: dimension.label,
      firstAverage: average(firstScores),
      latestAverage: average(latestScores)
    };
  });
}

function formatDimensionScore(value) {
  if (value === null || value === undefined) return "-";
  return Number(value).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

function createPerformanceTrack(label, value, tone) {
  const track = document.createElement("div");
  track.className = "pulse-track " + tone;
  const percent = value == null ? 0 : Math.max(0, Math.min(100, (value / 2) * 100));
  track.style.setProperty("--pulse-value", percent + "%");

  if (value == null) {
    track.classList.add("is-empty");
    track.setAttribute("aria-label", label + ": no scored attempts");
  } else {
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", label);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "2");
    track.setAttribute("aria-valuenow", Number(value).toFixed(2));
  }

  const fill = document.createElement("span");
  fill.className = "pulse-fill";
  fill.setAttribute("aria-hidden", "true");
  const amount = document.createElement("span");
  amount.className = "pulse-value";
  amount.textContent = formatDimensionScore(value);
  track.append(fill, amount);
  return track;
}

function renderDimensionComparison(dimensions) {
  pulseComparisonChart.textContent = "";
  if (!dimensions.some(item => item.firstAverage !== null || item.latestAverage !== null)) {
    const empty = document.createElement("p");
    empty.className = "pulse-empty";
    empty.textContent = "Dimension performance will appear after learners complete scenarios.";
    pulseComparisonChart.append(empty);
    return;
  }

  dimensions.forEach(dimension => {
    const row = document.createElement("article");
    row.className = "pulse-row";
    const label = document.createElement("strong");
    label.className = "pulse-row-label";
    label.textContent = dimension.label;
    const bars = document.createElement("div");
    bars.className = "pulse-bars";
    bars.append(
      createPerformanceTrack(dimension.label + " first attempt", dimension.firstAverage, "pre"),
      createPerformanceTrack(dimension.label + " latest attempt", dimension.latestAverage, "post")
    );
    row.append(label, bars);
    pulseComparisonChart.append(row);
  });
}

function renderOptionDistribution(results) {
  pulseDistribution.textContent = "";
  pulseDistribution.classList.remove("is-empty");
  const counts = Object.fromEntries(["A", "B", "C"].map(option => [option, results.filter(result => resultOptionLabel(result) === option).length]));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  if (!total) {
    pulseDistribution.classList.add("is-empty");
    pulseDistribution.textContent = "No scored choices";
    pulseDistribution.removeAttribute("role");
    pulseDistribution.removeAttribute("aria-label");
    pulseDistributionSummary.textContent = "No A, B, or C selection distribution is available.";
    return;
  }

  const parts = ["A", "B", "C"].map(option => ({
    option,
    count: counts[option],
    percent: Math.round((counts[option] / total) * 100)
  }));
  parts.forEach(part => {
    if (!part.count) return;
    const segment = document.createElement("span");
    segment.className = "distribution-segment";
    segment.dataset.option = part.option;
    segment.style.flexBasis = part.percent + "%";
    segment.title = `Option ${part.option}: ${part.percent}% (${part.count})`;
    if (part.percent >= 16) segment.textContent = `${part.option} ${part.percent}%`;
    pulseDistribution.append(segment);
  });

  const summary = parts.map(part => `option ${part.option}: ${part.percent}%`).join(", ");
  pulseDistribution.setAttribute("role", "img");
  pulseDistribution.setAttribute("aria-label", summary);
  pulseDistributionSummary.textContent = "Choice selection distribution: " + summary + ".";
}

function mostSelectedIneffective(results) {
  const groups = new Map();
  results.filter(result => resultOptionScore(result) === 0).forEach(result => {
    const option = resultOptionLabel(result) || "?";
    const key = `${result.scenarioId}::${option}`;
    const current = groups.get(key) || { count: 0, option, title: result.scenarioTitle || scenarioDefinition(result.scenarioId)?.title || result.scenarioId };
    current.count += 1;
    groups.set(key, current);
  });
  return Array.from(groups.values()).sort((a, b) => b.count - a.count)[0] || null;
}

function bothPathsCompletion(users, results) {
  if (!users.length) return 0;
  const completed = users.filter(user => userCompletedPath(user, results, "CARE") && userCompletedPath(user, results, "REAL")).length;
  return Math.round((completed / users.length) * 100);
}

function learningImprovement(users, results, frameworkId) {
  const deltas = users.map(user => {
    const userResults = resultsForUser(user, results).filter(result => result.frameworkId === frameworkId);
    const replayed = userResults.some(result => resultAttemptNumber(result) > 1);
    if (!replayed) return null;
    const first = pathScoreForResults(userResults, frameworkId, "first");
    const latest = pathScoreForResults(userResults, frameworkId, "latest");
    return first === null || latest === null ? null : latest - first;
  }).filter(value => value !== null);
  return deltas.length ? Math.round(average(deltas)) : null;
}

function highestDropOff(results) {
  const groups = new Map();
  results.forEach(result => {
    const key = result.scenarioId || "unknown";
    const current = groups.get(key) || { started: 0, incomplete: 0, title: result.scenarioTitle || scenarioDefinition(key)?.title || key };
    current.started += 1;
    if (!result.completed) current.incomplete += 1;
    groups.set(key, current);
  });

  return Array.from(groups.values())
    .filter(item => item.incomplete > 0)
    .map(item => ({ ...item, rate: Math.round((item.incomplete / item.started) * 100) }))
    .sort((a, b) => b.rate - a.rate || b.incomplete - a.incomplete)[0] || null;
}

function renderPrimaryAnalytics(users, results, framework) {
  const attemptMode = attemptView?.value || "first";
  const selectedScenarioId = scenarioView?.value || "all";
  const selectedAttempts = selectAttemptResults(results, attemptMode);
  const scenarioAttempts = selectedScenarioId === "all"
    ? selectedAttempts
    : selectedAttempts.filter(result => result.scenarioId === selectedScenarioId);
  const scoreSummary = pathScoreSummary(users, results, framework, attemptMode);
  const completion = pathCompletionStats(users, results, framework);
  const rates = choiceRates(scenarioAttempts);
  const improvement = learningImprovement(users, results, framework);
  const dropOff = highestDropOff(results);
  const ineffective = mostSelectedIneffective(scenarioAttempts);
  const selectedScenario = scenarioDefinition(selectedScenarioId);

  scoreMetricLabel.textContent = attemptMode === "all" ? framework + " all-attempt average" : framework + " path score";
  selectedFrameworkScore.textContent = scoreSummary.average == null ? "-" : scoreSummary.average + "%";
  selectedScoreContext.textContent = scoreSummary.count
    ? scoreSummary.count + (attemptMode === "all" ? " learner average" : " completed path") + (scoreSummary.count === 1 ? "" : "s")
    : "No completed " + framework + " paths";

  scoreTrend.classList.toggle("negative", improvement !== null && improvement < 0);
  if (attemptMode === "first") scoreTrend.textContent = "Formal evaluation score";
  else if (attemptMode === "latest" && improvement !== null) scoreTrend.textContent = (improvement >= 0 ? "+" : "") + improvement + " points from first attempt";
  else if (attemptMode === "all") scoreTrend.textContent = "Across every scored attempt";
  else scoreTrend.textContent = "No replay comparison yet";

  responseRateMetric.textContent = completion.rate + "%";
  responseCountMetric.textContent = completion.completed + " of " + completion.started + " learners completed all four scenarios";
  priorityAreaValue.textContent = rates.strong + "%";
  priorityAreaDetail.textContent = rates.total + " scored choice" + (rates.total === 1 ? "" : "s") + " in this view";

  pulseBreakdownTitle.textContent = (selectedScenario?.title || framework + " path") + " option selection";
  renderDimensionComparison(dimensionDetails(framework, results));
  renderOptionDistribution(scenarioAttempts);

  if (ineffective) {
    recommendationTitle.textContent = `${ineffective.title} - Option ${ineffective.option}`;
    recommendationCopy.textContent = ineffective.count + " missed selection" + (ineffective.count === 1 ? "" : "s") + ". Review this choice during follow-up support.";
  } else {
    recommendationTitle.textContent = "No missed choices in this view";
    recommendationCopy.textContent = "Missed choices score 0 and will appear here when follow-up may be useful.";
  }

  strongChoiceRate.textContent = rates.strong + "%";
  partialChoiceRate.textContent = rates.partial + "%";
  missedChoiceRate.textContent = rates.missed + "%";
  bothPathsRate.textContent = bothPathsCompletion(allTrackedUsers(cachedUsers, cachedResults), cachedResults) + "%";
  improvementValue.textContent = improvement === null ? "No replay data" : (improvement >= 0 ? "+" : "") + improvement + " pts";
  dropOffValue.textContent = dropOff ? dropOff.title + " (" + dropOff.rate + "%)" : "No drop-off";
}
function renderMetrics(users, results) {
  const tracked = allTrackedUsers(users, results);
  const completedUsers = tracked.filter(user => {
    return userCompletedPath(user, results, "CARE") || userCompletedPath(user, results, "REAL");
  }).length;
  const formalResults = selectAttemptResults(results, "first");
  const followUps = tracked.filter(user => {
    return resultsForUser(user, formalResults).some(result => resultClassification(result) === "missed");
  }).length;
  const rate = tracked.length ? Math.round((completedUsers / tracked.length) * 100) : 0;
  const careSummary = pathScoreSummary(tracked, results, "CARE", "first");
  const realSummary = pathScoreSummary(tracked, results, "REAL", "first");

  userCount.textContent = String(tracked.length);
  completionRate.textContent = rate + "%";
  averageCareScore.textContent = careSummary.average == null ? "-" : careSummary.average + "%";
  averageRealScore.textContent = realSummary.average == null ? "-" : realSummary.average + "%";
  followUpCount.textContent = String(followUps);
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

  const frameworkId = frameworkView?.value || "CARE";
  const attemptMode = attemptView?.value || "first";
  const selectedScenarioId = scenarioView?.value || "all";
  const completion = pathCompletionStats(users, results, frameworkId);
  const total = Math.max(1, users.length);
  const inProgress = Math.max(0, completion.started - completion.completed);
  const notStarted = Math.max(0, users.length - completion.started);

  renderBar(completionChart, "Completed path", Math.round((completion.completed / total) * 100));
  renderBar(completionChart, "In progress", Math.round((inProgress / total) * 100));
  renderBar(completionChart, "Not started", Math.round((notStarted / total) * 100));

  const selectedAttempts = selectAttemptResults(results, attemptMode)
    .filter(result => selectedScenarioId === "all" || result.scenarioId === selectedScenarioId);
  const rates = choiceRates(selectedAttempts);
  renderBar(frameworkChart, "Strong choices", rates.strong);
  renderBar(frameworkChart, "Partial / risky", rates.partial);
  renderBar(frameworkChart, "Missed choices", rates.missed);

  expectedScenarios(frameworkId).forEach(definition => {
    const scenarioResults = results.filter(result => result.scenarioId === definition.id);
    const playerKeys = new Set(scenarioResults.map(resultPlayerKey));
    const completedKeys = new Set(scenarioResults.filter(result => result.completed).map(resultPlayerKey));
    const started = playerKeys.size;
    const completionPercent = started ? Math.round((completedKeys.size / started) * 100) : 0;
    const dropOffPercent = started ? 100 - completionPercent : 0;
    renderBar(scenarioChart, definition.title + " complete", completionPercent);
    if (dropOffPercent > 0) renderBar(scenarioChart, definition.title + " drop-off", dropOffPercent);
  });

  if (!expectedScenarios(frameworkId).length) {
    const note = document.createElement("p");
    note.className = "empty-note";
    note.textContent = "Scenario definitions are unavailable.";
    scenarioChart.append(note);
  }
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
    .filter(user => userStatus(user, results) === "needs_follow_up")
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
      resultClassification(result) === "missed" ? "danger" : statusTone(result.completed ? "completed" : "in_progress")
    );
  });
}

const tableHeaderIds = {
  Name: "users-name", Role: "users-role", "Completed scenarios": "users-completed",
  "CARE score": "users-care", "REAL score": "users-real", Status: "users-status",
  Reflection: "users-reflection", "Last activity": "users-activity", Action: "users-action",
  User: "results-user", Scenario: "results-scenario", Attempt: "results-attempt",
  Dimension: "results-dimension", Option: "results-option", Result: "results-class", Score: "results-score"
};

function createCell(label, value, headerId = "") {
  const cell = document.createElement("td");
  cell.dataset.label = label;
  const table = label === "User" || ["Scenario", "Attempt", "Dimension", "Option", "Result", "Score"].includes(label)
    ? "results"
    : "users";
  const reflectionHeader = table === "results" ? "results-reflection" : "users-reflection";
  cell.setAttribute("headers", headerId || (label === "Reflection" ? reflectionHeader : (tableHeaderIds[label] || "")));
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
  const filtered = currentFilter === "all" ? tracked : tracked.filter(user => userStatus(user, results) === currentFilter);

  if (!filtered.length) {
    const row = document.createElement("tr");
    const cell = createCell("Status", "No learners match this filter yet.");
    cell.colSpan = 9;
    row.append(cell);
    usersTable.append(row);
    return;
  }

  filtered.forEach(user => {
    const userResults = resultsForUser(user, results);
    const latest = latestResult(userResults) || {};
    const careScore = pathScoreForResults(userResults, "CARE", "first");
    const realScore = pathScoreForResults(userResults, "REAL", "first");
    const status = userStatus(user, results);
    const completedCount = new Set(userResults.filter(result => result.completed).map(result => result.scenarioId)).size;
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
      createCell("CARE score", careScore === null ? "-" : careScore + "%"),
      createCell("REAL score", realScore === null ? "-" : realScore + "%"),
      createCell("Status", createStatusPill(statusText(status), statusTone(status))),
      createCell("Reflection", createStatusPill(reflectionStatus(userResults), reflectionStatus(userResults) === "Saved" ? "success" : "warning")),
      createCell("Last activity", formatDate(latest.updatedAt || latest.updatedAtIso || latest.completedAt || latest.completedAtIso)),
      createCell("Action", action)
    );
    usersTable.append(row);
  });
}
function renderResults(results) {
  resultsTable.textContent = "";

  if (!results.length) {
    const row = document.createElement("tr");
    const cell = createCell("Status", "No scenario attempts have been saved yet.");
    cell.colSpan = 8;
    row.append(cell);
    resultsTable.append(row);
    return;
  }

  [...results]
    .sort((a, b) => resultTimestamp(b) - resultTimestamp(a))
    .forEach(result => {
      const classification = resultClassification(result);
      const optionScore = resultOptionScore(result);
      const dimension = result.frameworkDimension
        || frameworkDefinitions?.[result.frameworkId]?.dimensions?.find(item => item.id === (result.frameworkDimensionId || scenarioDefinition(result.scenarioId)?.focusDimension))?.label
        || result.frameworkDimensionId
        || scenarioDefinition(result.scenarioId)?.focusDimension
        || "-";
      const row = document.createElement("tr");
      if (classification === "missed") row.className = "needs-follow-up";
      row.append(
        createCell("User", result.email || result.uid || "Unknown"),
        createCell("Scenario", result.scenarioTitle || result.scenarioId || "-"),
        createCell("Attempt", "#" + resultAttemptNumber(result)),
        createCell("Dimension", (result.frameworkId || "-") + " / " + dimension),
        createCell("Option", resultOptionLabel(result) || "Not selected"),
        createCell("Result", classification ? createStatusPill(classification === "partial" ? "Partial / risky" : classification[0].toUpperCase() + classification.slice(1), classification === "strong" ? "success" : classification === "partial" ? "warning" : "danger") : createStatusPill("In progress", "warning")),
        createCell("Score", optionScore === null ? "-" : optionScore + "/2"),
        createCell("Reflection", result.reflectionSaved || reflectionValues(result).length ? "Saved - open learner details" : "Not saved", "results-reflection")
      );
      resultsTable.append(row);
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
    meta.textContent = email === rootAdminEmail
      ? "Dashboard owner"
      : (email === normalizeEmail(currentUser?.email) ? "Current viewer" : "Read-only viewer");

    const copy = document.createElement("div");
    copy.append(label, meta);

    const button = document.createElement("button");
    button.className = "button subtle fit";
    button.type = "button";
    button.dataset.removeAdmin = email;
    button.textContent = "Remove";
    button.disabled = email === rootAdminEmail || email === normalizeEmail(currentUser?.email);

    item.append(copy, button);
    adminList.append(item);
  });
}

function renderDashboardData() {
  const scoped = dashboardScope(cachedUsers, cachedResults);
  renderPrimaryAnalytics(scoped.users, scoped.results, scoped.framework);
  renderMetrics(cachedUsers, cachedResults);
  renderCharts(scoped.users, scoped.results);
  renderInsights(scoped.users, scoped.results);
  renderUsers(scoped.users, cachedResults);
  renderResults(scoped.results);
  if (currentDashboardRole === "owner") renderAdmins(cachedAdmins);
}
async function renderDetail(userId) {
  const user = allTrackedUsers(cachedUsers, cachedResults).find(item => String(item.uid || item.email) === String(userId));
  if (!user) return;

  const results = resultsForUser(user);
  const latest = latestResult(results) || {};
  detailPanel.hidden = false;
  detailTitle.textContent = user.email || user.uid || "Learner detail";
  detailBody.textContent = "Loading reflections...";

  let reflectionByAttempt = new Map();
  try {
    const reflectionSnapshot = await firebaseClient.getDocs(firebaseClient.query(
      firebaseClient.collection(firebaseClient.db, "scenarioReflections"),
      firebaseClient.where("uid", "==", user.uid)
    ));
    reflectionByAttempt = new Map(reflectionSnapshot.docs.map(document => {
      const data = document.data();
      return [data.attemptId, data.answers || {}];
    }));
  } catch {
    // Legacy result records may still contain reflectionAnswers and remain readable here.
  }

  detailBody.textContent = "";
  const summary = document.createElement("div");
  summary.className = "detail-grid";
  [
    ["Role", latest.selectedRole || user.selectedRole || "-"],
    ["Completed", String(results.filter(result => result.completed).length)],
    ["Status", statusText(userStatus(user, results))]
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

    const values = Object.values(reflectionByAttempt.get(result.attemptId) || result.reflectionAnswers || {})
      .map(value => String(value || "").trim())
      .filter(Boolean);
    const reflection = document.createElement("p");
    reflection.textContent = values.length ? values.join(" / ") : "No reflection saved.";
    item.append(reflection);
    reflections.append(item);
  });

  detailBody.append(summary, reflections);
  detailTitle.setAttribute("tabindex", "-1");
  detailTitle.focus({ preventScroll: true });
  detailPanel.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
async function checkAdminAccess(user) {
  canBootstrapAdmin = false;
  currentDashboardRole = null;
  if (!user) return false;

  const email = normalizeEmail(user.email);
  if (!email) return false;

  const snap = await firebaseClient.getDoc(firebaseClient.doc(firebaseClient.db, "dashboardAdminEmails", email));
  if (snap.exists()) {
    currentDashboardRole = dashboardRole(snap.data(), email);
    return Boolean(currentDashboardRole);
  }

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
  currentDashboardRole = "owner";
  setupAdminButton.disabled = false;
  await loadDashboard();
}

function resultFilterConstraints() {
  const constraints = [firebaseClient.where("frameworkId", "==", frameworkView.value)];
  if (cohortView.value !== "all") constraints.push(firebaseClient.where("selectedRole", "==", cohortView.value));
  if (scenarioView.value !== "all") constraints.push(firebaseClient.where("scenarioId", "==", scenarioView.value));
  if (dateFrom.value) constraints.push(firebaseClient.where("updatedAt", ">=", new Date(`${dateFrom.value}T00:00:00`)));
  if (dateTo.value) {
    const exclusiveEnd = new Date(`${dateTo.value}T00:00:00`);
    exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
    constraints.push(firebaseClient.where("updatedAt", "<", exclusiveEnd));
  }
  return constraints;
}

function mergeDocumentPage(existing, incoming, identity = "id") {
  const merged = new Map(existing.map(item => [item[identity], item]));
  incoming.forEach(item => merged.set(item[identity], item));
  return [...merged.values()];
}

function updatePaginationStatus() {
  usersPageStatus.textContent = `${cachedUsers.length} of ${totalUsersFromServer} learner profiles loaded.`;
  resultsPageStatus.textContent = `${cachedResults.length} of ${totalResultsFromServer} filtered result records loaded.`;
  loadMoreUsersButton.hidden = !hasMoreUsers;
  loadMoreResultsButton.hidden = !hasMoreResults;
  loadMoreUsersButton.disabled = !hasMoreUsers;
  loadMoreResultsButton.disabled = !hasMoreResults;
}

async function loadDashboard(options = {}) {
  if (!dashboardAllowed) return;
  const appendTarget = options.append || "";
  const loadUsers = appendTarget !== "results";
  const loadResults = appendTarget !== "users";

  if (!appendTarget) {
    usersCursor = null;
    resultsCursor = null;
    cachedUsers = [];
    cachedResults = [];
  }

  setAccess("Loading dashboard", "Fetching a protected Firestore snapshot...", true);
  setDashboardBusy(true);
  loadMoreUsersButton.disabled = true;
  loadMoreResultsButton.disabled = true;
  dashboardNotice.hidden = true;
  viewerAdminSection.hidden = currentDashboardRole !== "owner";
  adminAccountEmail.textContent = currentUser?.email || "Unknown account";
  adminAccountRole.textContent = currentDashboardRole === "owner" ? "Dashboard owner" : "Read-only viewer";

  try {
    const operations = {};
    if (loadUsers) {
      const userFilters = cohortView.value === "all" ? [] : [firebaseClient.where("selectedRole", "==", cohortView.value)];
      const constraints = [...userFilters, firebaseClient.orderBy(firebaseClient.documentId())];
      if (usersCursor) constraints.push(firebaseClient.startAfter(usersCursor));
      constraints.push(firebaseClient.limit(dashboardPageSize));
      operations.users = firebaseClient.getDocs(firebaseClient.query(
        firebaseClient.collection(firebaseClient.db, "users"),
        ...constraints
      ));
      operations.userCount = firebaseClient.getCountFromServer(firebaseClient.query(firebaseClient.collection(firebaseClient.db, "users"), ...userFilters));
    }

    if (loadResults) {
      const filterConstraints = resultFilterConstraints();
      const pageConstraints = [...filterConstraints, firebaseClient.orderBy("updatedAt", "desc")];
      if (resultsCursor) pageConstraints.push(firebaseClient.startAfter(resultsCursor));
      pageConstraints.push(firebaseClient.limit(dashboardPageSize));
      operations.results = firebaseClient.getDocs(firebaseClient.query(
        firebaseClient.collection(firebaseClient.db, "scenarioResults"),
        ...pageConstraints
      ));
      operations.resultCount = firebaseClient.getCountFromServer(firebaseClient.query(
        firebaseClient.collection(firebaseClient.db, "scenarioResults"),
        ...filterConstraints
      ));
    }

    if (currentDashboardRole === "owner" && !appendTarget) {
      operations.admins = firebaseClient.getDocs(firebaseClient.collection(firebaseClient.db, "dashboardAdminEmails"));
    }

    const keys = Object.keys(operations);
    const values = await Promise.all(Object.values(operations));
    const loaded = Object.fromEntries(keys.map((key, index) => [key, values[index]]));

    if (loaded.users) {
      const page = loaded.users.docs.map(document => ({ uid: document.id, ...document.data() }));
      cachedUsers = mergeDocumentPage(cachedUsers, page, "uid");
      usersCursor = loaded.users.docs.at(-1) || usersCursor;
      hasMoreUsers = loaded.users.size === dashboardPageSize;
      totalUsersFromServer = loaded.userCount.data().count;
    }
    if (loaded.results) {
      const page = loaded.results.docs.map(document => ({ id: document.id, ...document.data() }));
      cachedResults = mergeDocumentPage(cachedResults, page, "id");
      resultsCursor = loaded.results.docs.at(-1) || resultsCursor;
      hasMoreResults = loaded.results.size === dashboardPageSize;
      totalResultsFromServer = loaded.resultCount.data().count;
    }
    if (loaded.admins) cachedAdmins = loaded.admins.docs.map(document => ({ id: document.id, ...document.data() }));

    renderDashboardData();
    if (totalUsersFromServer) userCount.textContent = String(totalUsersFromServer);
    updatePaginationStatus();

    const updatedTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    dashboardSyncStatus.textContent = "Updated " + updatedTime;
    overviewSyncText.textContent = `Firestore snapshot | ${cachedResults.length} of ${totalResultsFromServer} filtered results loaded`;
  } catch (error) {
    dashboardNoticeText.textContent = error?.code === "failed-precondition"
      ? "This filter needs the included Firestore index. Deploy the indexes, then retry."
      : "Dashboard data could not be loaded. Retry when the connection is available.";
    dashboardNotice.hidden = false;
    dashboardSyncStatus.textContent = "Update failed";
    overviewSyncText.textContent = "Firestore snapshot unavailable";
  } finally {
    setDashboardBusy(false);
    updatePaginationStatus();
  }
}
async function addAdmin(event) {
  event.preventDefault();
  if (currentDashboardRole !== "owner") {
    setAdminMessage("Only the dashboard owner can manage viewers.");
    return;
  }
  const email = normalizeEmail(adminEmail.value);
  if (!email || !adminEmail.validity.valid) {
    adminEmail.setAttribute("aria-invalid", "true");
    setAdminMessage("Enter a valid email address.");
    return;
  }

  setAdminFormBusy(true);
  try {
    await firebaseClient.setDoc(firebaseClient.doc(firebaseClient.db, "dashboardAdminEmails", email), {
      email,
      role: "viewer",
      addedBy: currentUser?.email || "",
      addedAt: firebaseClient.serverTimestamp()
    }, { merge: true });

    adminEmail.value = "";
    adminEmail.setAttribute("aria-invalid", "false");
    setAdminMessage("Dashboard viewer added.", "success");
    await loadDashboard();
  } finally {
    setAdminFormBusy(false);
  }
}

async function removeAdmin(email) {
  if (currentDashboardRole !== "owner") {
    setAdminMessage("Only the dashboard owner can manage viewers.");
    return;
  }
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  if (normalized === rootAdminEmail || normalized === normalizeEmail(currentUser?.email)) {
    setAdminMessage("The owner profile cannot be removed or downgraded.");
    return;
  }

  await firebaseClient.deleteDoc(firebaseClient.doc(firebaseClient.db, "dashboardAdminEmails", normalized));
  setAdminMessage("Dashboard viewer removed.", "success");
  await loadDashboard();
}

function bindEvents() {
  refreshButton.addEventListener("click", () => loadDashboard());
  dashboardRetryButton.addEventListener("click", () => loadDashboard());
  loadMoreUsersButton.addEventListener("click", () => loadDashboard({ append: "users" }));
  loadMoreResultsButton.addEventListener("click", () => loadDashboard({ append: "results" }));
  adminSignOutButton.addEventListener("click", async () => {
    if (firebaseClient && currentUser) await firebaseClient.signOut(firebaseClient.auth).catch(() => {});
    window.location.href = "index.html#login";
  });

  setupAdminButton.addEventListener("click", () => {
    createAdminProfile().catch(() => {
      setupAdminButton.disabled = false;
      setAccess("Setup failed", "The owner profile could not be created. Deploy the included Firestore rules, then try again.", false, { canBootstrapAdmin });
    });
  });

  frameworkView.addEventListener("change", () => {
    syncScenarioOptions();
    detailPanel.hidden = true;
    loadDashboard();
  });
  cohortView.addEventListener("change", () => {
    detailPanel.hidden = true;
    loadDashboard();
  });
  scenarioView.addEventListener("change", () => {
    detailPanel.hidden = true;
    loadDashboard();
  });
  [dateFrom, dateTo].forEach(control => control.addEventListener("change", () => {
    if (dateFrom.value && dateTo.value && dateFrom.value > dateTo.value) {
      dashboardNoticeText.textContent = "The start date must be before the end date.";
      dashboardNotice.hidden = false;
      control.setAttribute("aria-invalid", "true");
      return;
    }
    dateFrom.setAttribute("aria-invalid", "false");
    dateTo.setAttribute("aria-invalid", "false");
    detailPanel.hidden = true;
    loadDashboard();
  }));
  attemptView.addEventListener("change", () => {
    detailPanel.hidden = true;
    renderDashboardData();
  });

  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(item => {
        const selected = item === button;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
      const scoped = dashboardScope(cachedUsers, cachedResults);
      renderUsers(scoped.users, cachedResults);
    });
  });

  usersTable.addEventListener("click", event => {
    const userId = event.target.closest("[data-user-id]")?.dataset.userId;
    if (userId) renderDetail(userId).catch(() => {
      dashboardNoticeText.textContent = "Learner details could not be loaded. Retry from the learner row.";
      dashboardNotice.hidden = false;
    });
  });

  adminEmail.addEventListener("input", () => adminEmail.setAttribute("aria-invalid", "false"));
  adminForm.addEventListener("submit", event => {
    addAdmin(event).catch(() => setAdminMessage("Could not add dashboard viewer. Check your owner access and try again."));
  });

  adminList.addEventListener("click", event => {
    const email = event.target.closest("[data-remove-admin]")?.dataset.removeAdmin;
    if (email) removeAdmin(email).catch(() => setAdminMessage("Could not remove dashboard viewer. Try again."));
  });
}
async function init() {
  bindEvents();
  setAccess("Connecting", "Checking Firebase Authentication and dashboard permissions...");

  try {
    await loadScenarioDefinitions();
  } catch {
    scenarioDefinitions = [];
    frameworkDefinitions = {};
  }

  try {
    firebaseClient = await loadFirebaseClient();
    firebaseClient.onAuthStateChanged(firebaseClient.auth, async user => {
      currentUser = user;
      if (!user) {
        dashboardAllowed = false;
        setAccess(
          "Sign in required",
          "Sign in from the learning app with an authorised dashboard account.",
          false,
          { needsSignIn: true }
        );
        return;
      }

      dashboardAllowed = await checkAdminAccess(user);
      if (!dashboardAllowed) {
        if (canBootstrapAdmin) {
          try {
            await createAdminProfile();
          } catch (error) {
            setupAdminButton.disabled = false;
            setAccess(
              "Admin profile setup failed",
              "The owner profile could not be created. Deploy the included Firestore rules, then try again.",
              false,
              { canBootstrapAdmin: true }
            );
          }
          return;
        }

        setAccess("Access denied", (user.email || "This account") + " is not listed as a dashboard viewer.", false, { needsSignIn: true });
        return;
      }

      await loadDashboard();
    });
  } catch {
    setAccess("Dashboard unavailable", "The secure dashboard cannot connect right now. Return to the learning app and try again later.");
  }
}

init();

