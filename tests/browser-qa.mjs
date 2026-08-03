import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp } from "node:fs/promises";
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { tmpdir } from "node:os";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.ECHOWORKS_URL || "http://127.0.0.1:4176";
const chromePath = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const output = await mkdtemp(join(tmpdir(), "echoworks-browser-qa-"));
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const report = { auth: {}, resilience: {}, app: {}, scenario: {}, dashboard: {}, access: {}, performance: {}, accessibility: {} };
let typingAudioReport = null;

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
  });
  return errors;
}

async function seriousAxe(page, include) {
  const result = await new AxeBuilder({ page }).include(include).analyze();
  return result.violations.filter(violation => ["serious", "critical"].includes(violation.impact));
}

const requiredViewports = [
  { label: "phone-320", width: 320, height: 700 },
  { label: "phone-390", width: 390, height: 844 },
  { label: "phone-landscape", width: 844, height: 390 },
  { label: "tablet-768", width: 768, height: 1024 },
  { label: "laptop-1024", width: 1024, height: 768 },
  { label: "desktop-1440", width: 1440, height: 900 },
  { label: "zoom-200-equivalent", width: 720, height: 900 },
  { label: "zoom-400-equivalent", width: 360, height: 700 }
];

async function responsiveSweep(page, surface) {
  const results = [];
  for (const viewport of requiredViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(35);
    const state = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      undersizedControls: [...document.querySelectorAll("button,input:not([type=hidden]),select,textarea")]
        .filter(element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0 && !element.disabled;
        })
        .filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .map(element => element.id || element.getAttribute("aria-label") || element.textContent.trim().slice(0, 40))
    }));
    assert.ok(state.scrollWidth <= state.width + 1, `${surface} overflows at ${viewport.label}`);
    assert.deepEqual(state.undersizedControls, [], `${surface} has undersized controls at ${viewport.label}`);
    results.push({ ...viewport, scrollWidth: state.scrollWidth });
  }
  return results;
}

{
  const authModule = `
export const rootAdminEmail = "liuguangxuan1230@gmail.com";
export const normalizeEmail = value => String(value || "").trim().toLowerCase();
export const dashboardRole = () => null;
let authListener = () => {};
const learner = { uid: "qa-learner", email: "learner@example.com", emailVerified: false };
const emptySnapshot = { exists: () => false, data: () => null };
const sdk = {
  auth: { currentUser: null }, db: {},
  onAuthStateChanged(_auth, callback) { authListener = callback; queueMicrotask(() => callback(null)); return () => {}; },
  async signInWithEmailAndPassword() { const error = new Error("mock credential rejected"); error.code = "auth/invalid-credential"; throw error; },
  async createUserWithEmailAndPassword() { sdk.auth.currentUser = learner; return { user: learner }; },
  async sendPasswordResetEmail(_auth, email) { sessionStorage.setItem("qaResetEmail", email); },
  async sendEmailVerification() { sessionStorage.setItem("qaVerificationSent", "true"); },
  async signOut() { sdk.auth.currentUser = null; queueMicrotask(() => authListener(null)); },
  doc(_db, ...parts) { return { id: parts.at(-1), parts }; },
  collection(_db, ...parts) { return { name: parts.at(-1), parts }; },
  query(base) { return base; }, where() { return {}; },
  async getDoc() { return emptySnapshot; },
  async getDocs() { return { docs: [], size: 0 }; },
  async setDoc() {}, serverTimestamp() { return new Date(); }, deleteField() { return null; }
};
export async function loadFirebaseAuthClient() { return sdk; }
export async function ensureFirestore() { return sdk; }
`;
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1100, height: 820 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    if (sessionStorage.getItem("qaMainAppInitialized")) return;
    sessionStorage.setItem("qaMainAppInitialized", "true");
    localStorage.clear();
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.route("**/assets/js/firebase-client.js*", route => route.fulfill({ status: 200, contentType: "application/javascript", body: authModule }));
  await page.goto(`${baseUrl}/index.html#login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login.active");
  await page.fill("#loginEmail", "learner@example.com");
  await page.fill("#loginPassword", "WrongPassword1");
  await page.locator('#loginForm button[type="submit"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#loginMessage")?.textContent.includes("incorrect"));
  const loginError = await page.locator("#loginMessage").textContent();
  assert.doesNotMatch(loginError, /not found|does not exist|mock/i);

  await page.locator('[data-action="password-reset"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector("#loginMessage")?.textContent.includes("If an account matches"));
  assert.equal(await page.evaluate(() => sessionStorage.getItem("qaResetEmail")), "learner@example.com");

  await page.locator('[data-route="signup"]:visible').focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#signup.active");
  await page.fill("#signupEmail", "learner@example.com");
  await page.fill("#signupPassword", "short");
  await page.locator('#signupForm button[type="submit"]').focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#signupPassword").getAttribute("aria-invalid"), "true");
  await page.fill("#signupPassword", "StrongPass123");
  await page.locator('#signupForm button[type="submit"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#home.active");
  assert.equal(await page.evaluate(() => sessionStorage.getItem("qaVerificationSent")), "true");
  await page.waitForFunction(() => document.querySelector("#tutorialDialog")?.open);
  assert.equal(await page.locator("[data-tutorial-step='0']").isVisible(), true);
  await page.click('[data-action="tutorial-next"]');
  assert.equal(await page.locator("[data-tutorial-step='1']").isVisible(), true);
  await page.click('[data-action="tutorial-next"]');
  assert.equal(await page.locator("#tutorialDialog").evaluate(dialog => dialog.open), false);
  await page.locator('[data-route="settings"]:visible').first().focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#settings.active");
  await page.locator('[data-action="logout"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector("#login.active");
  report.auth = { genericLoginError: loginError.trim(), reset: true, signupGuidance: true, verification: true, tutorial: true, logout: true, keyboard: true, errors };
  await context.close();
}

{
  const surveyPayload = await readFile(new URL("../assets/data/pulse-surveys.json", import.meta.url), "utf8");
  const arPayload = await readFile(new URL("../assets/data/ar-cards.json", import.meta.url), "utf8");
  const offlineFirebaseModule = `export const normalizeEmail=value=>String(value||"").trim().toLowerCase(); export const dashboardRole=()=>null; export async function ensureFirestore(){throw new Error("offline")}; export async function loadFirebaseAuthClient(){throw new Error("offline")};`;
  let surveyRequests = 0;
  let arRequests = 0;
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("feedbackPlaybook.tutorialSeen.v1.guest", "true");
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.route("**/assets/js/firebase-client.js*", route => route.fulfill({ status: 200, contentType: "application/javascript", body: offlineFirebaseModule }));
  await page.route("**/assets/data/pulse-surveys.json*", route => ++surveyRequests === 1 ? route.abort("failed") : route.fulfill({ status: 200, contentType: "application/json", body: surveyPayload }));
  await page.route("**/assets/data/ar-cards.json*", route => ++arRequests === 1 ? route.abort("failed") : route.fulfill({ status: 200, contentType: "application/json", body: arPayload }));
  await page.goto(`${baseUrl}/index.html#login`, { waitUntil: "domcontentloaded" });
  await page.click('[data-action="guest"]');
  await page.waitForSelector("#home.active");
  await page.evaluate(() => { window.location.hash = "#survey"; });
  await page.waitForSelector("#survey.active");
  await page.waitForSelector('[data-action="retry-survey"]:not([hidden])');
  await page.click('[data-action="retry-survey"]');
  await page.waitForSelector("#ratingOptions input");
  await page.evaluate(() => { window.location.hash = "#ar"; });
  await page.waitForSelector("#ar.active");
  await page.waitForSelector('[data-action="retry-ar"]:not([hidden])');
  await page.click('[data-action="retry-ar"]');
  await page.waitForSelector("[data-ar-card]");
  report.resilience = { shellBeforeOptionalData: true, surveyRetry: true, arRetry: true, errors };
  await context.close();
}

{
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    if (sessionStorage.getItem("qaMainAppInitialized")) return;
    sessionStorage.setItem("qaMainAppInitialized", "true");
    localStorage.clear();
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`${baseUrl}/index.html#login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#login.active");
  assert.equal(await page.locator("#loginTitle").isVisible(), true);
  await page.click('[data-action="guest"]');
  await page.waitForSelector("#home.active");
  await page.waitForSelector('[data-survey-index="0"]');
  await page.waitForFunction(() => document.querySelector("#tutorialDialog")?.open);
  assert.equal(await page.locator("#tutorialStepCount").textContent(), "1 of 2");
  assert.equal(await page.locator('[data-action="tutorial-back"]').isHidden(), true);
  await page.click('[data-action="tutorial-next"]');
  assert.equal(await page.locator("#tutorialStepCount").textContent(), "2 of 2");
  await page.click('[data-action="tutorial-next"]');
  assert.equal(await page.evaluate(() => localStorage.getItem("feedbackPlaybook.tutorialSeen.v1.guest")), "true");

  await page.click('[data-action="continue-learning"]');
  await page.waitForSelector("#survey.active");
  assert.match(await page.locator("#surveyTitle").textContent(), /Employee Pre-Pulse/i);
  await page.click('#survey [data-route="home"]');
  await page.waitForSelector("#home.active");

  assert.equal(await page.locator("#progressTitle").textContent(), "Your progress");
  assert.equal(await page.locator("#unitsTitle").textContent(), "Complete the pre and post survey");
  assert.equal(await page.locator(".support-panel").count(), 0);

  for (const surveyIndex of [0, 2]) {
    await page.click(`[data-survey-index="${surveyIndex}"]`);
    await page.waitForSelector("#survey.active");
    const questionHierarchy = await page.evaluate(() => {
      const question = document.querySelector("#questionTitle");
      return {
        tag: question?.tagName,
        inSurveyBox: Boolean(question?.closest("#surveyForm")),
        weight: Number.parseInt(getComputedStyle(question).fontWeight, 10),
        text: question?.textContent?.trim()
      };
    });
    assert.equal(questionHierarchy.tag, "LEGEND");
    assert.equal(questionHierarchy.inSurveyBox, true);
    assert.ok(questionHierarchy.weight >= 700);
    assert.match(questionHierarchy.text, /^I /);
    assert.equal(await page.locator('[data-action="retry-survey"]').isHidden(), true);
    for (const value of [4, 5, 4, 5, 4, 5]) {
      await page.check(`input[name="comfort"][value="${value}"]`);
      await page.click('#surveyForm button[type="submit"]');
    }
    await page.waitForSelector("#home.active");
    assert.equal(await page.locator(`[data-survey-index="${surveyIndex}"] .unit-state`).textContent(), "Complete");
    if (surveyIndex === 0) {
      assert.equal(await page.locator("#preMilestoneState").textContent(), "Employee survey complete");
      assert.equal(await page.locator('[data-learning-milestone="pre"]').evaluate(item => item.classList.contains("complete")), true);
    }
  }

  assert.equal(await page.locator("#preMilestoneState").textContent(), "Both role surveys complete");
  assert.equal(await page.locator('[data-survey-index="1"]').isDisabled(), true);
  assert.equal(await page.locator('[data-survey-index="3"]').isDisabled(), true);
  assert.match(await page.locator('[data-survey-index="1"]').getAttribute("title"), /Complete one Employee scenario/);

  await page.evaluate(() => {
    localStorage.setItem("feedbackPlaybook.scenarioResults", JSON.stringify({
      "qa-employee-attempt": {
        attemptId: "qa-employee-attempt",
        scenarioId: "care-ambush",
        selectedRole: "employee",
        completed: true,
        completedAtIso: new Date().toISOString()
      }
    }));
  });
  await page.goto(`${baseUrl}/index.html#home`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#home.active");
  await page.waitForSelector('[data-survey-index="1"]:not([disabled])');
  assert.equal(await page.locator('[data-survey-index="3"]').isDisabled(), true);

  await page.click('[data-survey-index="1"]');
  await page.waitForSelector("#survey.active");
  for (const value of [5, 4, 5, 4, 5, 4]) {
    await page.check(`input[name="comfort"][value="${value}"]`);
    await page.click('#surveyForm button[type="submit"]');
  }
  await page.waitForSelector("#home.active");
  assert.equal(await page.locator("#postMilestoneState").textContent(), "Employee survey complete");
  assert.equal(await page.locator('[data-learning-milestone="post"]').evaluate(item => item.classList.contains("complete")), true);

  const surveyState = await page.evaluate(() => ({
    progress: document.querySelector("#progressText")?.textContent,
    answers: JSON.parse(localStorage.getItem("feedbackPlaybook.answers") || "{}"),
    focused: document.activeElement?.id
  }));
  assert.match(surveyState.progress, /3 of 4 surveys complete/);
  assert.equal(Object.values(surveyState.answers).flat().filter(value => value !== null).length, 18);

  await page.locator('[data-route="ar"]:visible').first().click();
  await page.waitForSelector("#ar.active");
  await page.waitForSelector("[data-ar-card]");
  await page.locator("[data-ar-card]").nth(2).click();
  await page.waitForFunction(() => {
    const image = document.querySelector("#arCharacterImage");
    return image?.complete && image.naturalWidth > 0;
  });
  assert.match(
    await page.locator("#arCharacterImage").getAttribute("src"),
    /assets\/ar-models\/real-a-lowpoly\.webp\?v=20260729-base-locked-ar-poses/
  );
  assert.equal(await page.locator("#arLearningPanel").count(), 0);
  assert.equal(await page.locator("#arCardsTitle").textContent(), "Manually choose a card");
  assert.equal(await page.locator('[data-action="retry-ar"]').isHidden(), true);
  assert.equal(await page.locator(".disclosure-panel").first().getAttribute("open"), null);
  await page.locator(".disclosure-panel summary").first().focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(".disclosure-panel").first().getAttribute("open"), "");

  await page.click('[data-route="settings"]');
  await page.click('[data-action="reset-progress"]');
  assert.equal(await page.locator("#deleteProgressDialog").evaluate(dialog => dialog.open), true);
  await page.click('#deleteProgressDialog button[value="confirm"]');
  await page.waitForFunction(() => document.querySelector("#settingsMessage")?.textContent.includes("deleted"));
  assert.equal(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("feedbackPlaybook.answers") || "{}")).flat().filter(Boolean).length), 0);

  await page.setViewportSize({ width: 820, height: 900 });
  await page.click("#mobileNavToggle");
  assert.equal(await page.locator("#mobileNavToggle").getAttribute("aria-expanded"), "true");
  const intermediateNav = await page.evaluate(() => ({
    sidebarBackground: getComputedStyle(document.querySelector(".sidebar")).backgroundColor,
    menuBackground: getComputedStyle(document.querySelector("#primaryNav")).backgroundColor,
    menuVisibility: getComputedStyle(document.querySelector("#primaryNav")).visibility
  }));
  assert.equal(intermediateNav.sidebarBackground, "rgb(255, 255, 255)");
  assert.equal(intermediateNav.menuBackground, "rgb(255, 255, 255)");
  assert.equal(intermediateNav.menuVisibility, "visible");
  await page.click("#mobileNavToggle");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click("#mobileNavToggle");
  assert.equal(await page.locator("#mobileNavToggle").getAttribute("aria-expanded"), "true");
  const mobile = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    target: document.querySelector("#mobileNavToggle").getBoundingClientRect().height,
    arTarget: document.querySelector(".header-ar-button").getBoundingClientRect().height
  }));
  assert.equal(mobile.scrollWidth, mobile.width);
  assert.ok(mobile.target >= 44);
  assert.ok(mobile.arTarget >= 44);
  await page.click("#mobileNavToggle");
  await page.evaluate(() => { window.location.hash = "#home"; });
  await page.waitForSelector("#home.active");
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(60);
  const stickyTop = await page.locator(".sidebar").evaluate(element => Math.round(element.getBoundingClientRect().top));
  assert.ok(Math.abs(stickyTop) <= 1);
  report.accessibility.app = await seriousAxe(page, "#appShell");
  report.app = { surveyProgress: surveyState.progress, intermediateNav, mobile, stickyTop, responsive: await responsiveSweep(page, "app"), errors };
  await page.screenshot({ path: join(output, "app-mobile.png"), fullPage: true });
  await context.close();
}

{
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    if (sessionStorage.getItem("qaContinueInitialized")) return;
    sessionStorage.setItem("qaContinueInitialized", "true");
    localStorage.clear();
    localStorage.setItem("feedbackPlaybook.tutorialSeen.v1.guest", "true");
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/index.html#login`, { waitUntil: "domcontentloaded" });
  await page.click('[data-action="guest"]');
  await page.waitForSelector("#home.active");
  await page.click('[data-action="continue-learning"]');
  await page.waitForSelector("#survey.active");
  for (const value of [4, 4, 4, 4, 4, 4]) {
    await page.check(`input[name="comfort"][value="${value}"]`);
    await page.click('#surveyForm button[type="submit"]');
  }
  await page.waitForSelector("#home.active");
  await Promise.all([
    page.waitForURL(/scenario\.html/),
    page.click('[data-action="continue-learning"]')
  ]);
  report.app.continueLearning = { prerequisite: true, resumedScenario: true };
  await context.close();
}

{
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    if (sessionStorage.getItem("qaRoleGateInitialized")) return;
    sessionStorage.setItem("qaRoleGateInitialized", "true");
    localStorage.clear();
    localStorage.setItem("feedbackPlaybook.mode", "guest");
    localStorage.setItem("feedbackPlaybook.storageVersion", "2026-07-role-specific-pulse-v9");
    localStorage.setItem("feedbackPlaybook.tutorialSeen.v1.guest", "true");
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/scenario.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-role="manager"].is-locked');
  assert.equal(await page.locator('[data-role="employee"]').evaluate(card => card.classList.contains("is-locked")), true);
  await page.click('[data-role="manager"]');
  await page.waitForURL(/index\.html\?survey=manager-pre-pulse&next=scenario#survey/);
  await page.waitForSelector("#survey.active");
  assert.match(await page.locator("#surveyTitle").textContent(), /Manager Pre-Pulse/);
  for (const value of [4, 4, 5, 4, 5, 4]) {
    await page.check(`input[name="comfort"][value="${value}"]`);
    await page.click('#surveyForm button[type="submit"]');
  }
  await page.waitForURL(/scenario\.html\?ready=manager/);
  await page.waitForSelector("#rolePanel:not([hidden])");
  await page.waitForFunction(() => !document.querySelector('[data-role="manager"]')?.classList.contains("is-locked"));
  assert.equal(await page.locator('[data-role="employee"]').evaluate(card => card.classList.contains("is-locked")), true);
  assert.match(await page.locator("#roleMessage").textContent(), /Manager pre-pulse complete/i);
  report.app.roleGates = { matchingPreRequired: true, matchingRoleUnlocked: true, returnToScenario: true };
  await context.close();
}

{
  const staleCloudModule = `
const user = { uid: "qa-cloud-learner", email: "learner@example.com" };
const staleAnswers = {
  "manager-pre-pulse": [-1, -1, -1, -1, -1, -1],
  "manager-post-pulse": [-1, -1, -1, -1, -1, -1],
  "employee-pre-pulse": [-1, -1, -1, -1, -1, -1],
  "employee-post-pulse": [-1, -1, -1, -1, -1, -1]
};
const sdk = {
  auth: { currentUser: user },
  db: {},
  onAuthStateChanged(_auth, callback) { queueMicrotask(() => callback(user)); return () => {}; },
  doc(_db, ...parts) { return { id: parts.at(-1), parts }; },
  collection(_db, ...parts) { return { name: parts.at(-1), parts }; },
  query(base) { return base; },
  where() { return {}; },
  async getDoc() {
    sessionStorage.setItem("qaStaleCloudPulseRead", "true");
    return { exists: () => true, data: () => ({ learningProgress: { answers: staleAnswers } }) };
  },
  async getDocs() { return { docs: [], size: 0 }; },
  async setDoc() {},
  serverTimestamp() { return new Date(); },
  deleteField() { return null; }
};
export async function loadFirebaseAuthClient() { return sdk; }
export async function ensureFirestore() { return sdk; }
`;
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("feedbackPlaybook.mode", "cloud");
    localStorage.setItem("feedbackPlaybook.storageVersion", "2026-07-role-specific-pulse-v9");
    localStorage.setItem("feedbackPlaybook.answers", JSON.stringify({
      "manager-pre-pulse": [4, 4, 5, 4, 5, 4],
      "manager-post-pulse": [null, null, null, null, null, null],
      "employee-pre-pulse": [null, null, null, null, null, null],
      "employee-post-pulse": [null, null, null, null, null, null]
    }));
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.route("**/assets/js/firebase-client.js*", route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: staleCloudModule
  }));
  await page.goto(`${baseUrl}/scenario.html?ready=manager`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => sessionStorage.getItem("qaStaleCloudPulseRead") === "true");
  await page.waitForTimeout(250);
  const cloudMergeState = await page.evaluate(() => ({
    locked: document.querySelector('[data-role="manager"]')?.classList.contains("is-locked"),
    answers: JSON.parse(localStorage.getItem("feedbackPlaybook.answers") || "{}")["manager-pre-pulse"],
    roleMessage: document.querySelector("#roleMessage")?.textContent
  }));
  assert.equal(cloudMergeState.locked, false, JSON.stringify(cloudMergeState));
  assert.deepEqual(cloudMergeState.answers, [4, 4, 5, 4, 5, 4]);
  assert.deepEqual(errors, []);
  report.app.roleGates.cloudRefreshPreservesCompletion = true;
  await context.close();
}

{
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("feedbackPlaybook.storageVersion", "2026-07-role-specific-pulse-v9");
    localStorage.setItem("feedbackPlaybook.answers", JSON.stringify({
      "manager-pre-pulse": [4, 4, 4, 4, 4, 4],
      "employee-pre-pulse": [4, 4, 4, 4, 4, 4]
    }));
    const state = { starts: 0, stops: 0 };
    class QaOscillator {
      constructor() {
        this.frequency = { setValueAtTime() {} };
        this.ended = null;
      }
      connect() {}
      addEventListener(type, listener) {
        if (type === "ended") this.ended = listener;
      }
      start() { state.starts += 1; }
      stop() {
        state.stops += 1;
        queueMicrotask(() => this.ended?.());
      }
    }
    class QaGain {
      constructor() {
        this.gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
      }
      connect() {}
    }
    class QaAudioContext {
      constructor() {
        this.currentTime = 0;
        this.state = "running";
        this.destination = {};
      }
      resume() {
        this.state = "running";
        return Promise.resolve();
      }
      createOscillator() { return new QaOscillator(); }
      createGain() { return new QaGain(); }
    }
    Object.defineProperty(window, "__qaTypingAudio", { value: state, configurable: true });
    Object.defineProperty(window, "AudioContext", { value: QaAudioContext, configurable: true });
    const voiceState = { started: 0, ended: 0, cancelled: 0, active: null, speaking: false };
    class QaSpeechSynthesisUtterance {
      constructor(text) {
        this.text = text;
        this.listeners = new Map();
      }
      addEventListener(type, listener) {
        this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
      }
      emit(type) {
        (this.listeners.get(type) || []).forEach(listener => listener());
      }
    }
    const synthesis = {
      get speaking() { return voiceState.speaking; },
      get pending() { return false; },
      getVoices() {
        return [
          { name: "Microsoft Aria", lang: "en-SG", localService: true },
          { name: "Microsoft Guy", lang: "en-SG", localService: true }
        ];
      },
      addEventListener() {},
      speak(utterance) {
        voiceState.active = utterance;
        voiceState.speaking = true;
        voiceState.started += 1;
      },
      cancel() {
        voiceState.cancelled += 1;
        voiceState.speaking = false;
        const active = voiceState.active;
        voiceState.active = null;
        active?.emit("end");
      }
    };
    Object.defineProperty(window, "__qaVoiceAnimation", {
      value: {
        state: voiceState,
        finish() {
          const active = voiceState.active;
          if (!active) return;
          voiceState.active = null;
          voiceState.speaking = false;
          voiceState.ended += 1;
          active.emit("end");
        }
      },
      configurable: true
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: QaSpeechSynthesisUtterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { value: synthesis, configurable: true });
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`${baseUrl}/scenario.html`, { waitUntil: "domcontentloaded" });
  await page.click('[data-role="manager"]');
  await page.waitForFunction(() => document.querySelector("#rolePanel")?.hidden === true);
  await page.waitForFunction(() => window.__qaTypingAudio.starts >= 5);
  const beforeMute = await page.evaluate(() => ({
    ...window.__qaTypingAudio,
    visibleCharacters: document.querySelector("#dialogueText")?.textContent?.length || 0
  }));
  assert.ok(beforeMute.visibleCharacters >= 4);
  await page.click("#soundToggle");
  const startsAfterMute = await page.evaluate(() => window.__qaTypingAudio.starts);
  await page.waitForTimeout(120);
  const afterMute = await page.evaluate(() => ({ ...window.__qaTypingAudio }));
  assert.equal(afterMute.starts, startsAfterMute);
  assert.equal(await page.locator("#soundToggle").getAttribute("aria-pressed"), "false");

  await page.click("#soundToggle");
  assert.equal(await page.locator("#soundToggle").getAttribute("aria-pressed"), "true");
  for (let index = 0; index < 30; index += 1) {
    const characterIsSpeaking = await page.evaluate(() => Boolean(
      document.querySelector(".character.active")
      && document.querySelector(".dialogue-panel")?.classList.contains("is-speaking")
    ));
    if (characterIsSpeaking) break;
    await page.click('[data-action="advance"]');
    await page.waitForTimeout(280);
  }
  assert.equal(await page.locator(".dialogue-panel").evaluate(element => element.classList.contains("is-speaking")), true);
  assert.equal(await page.locator(".character.active").evaluate(element => element.classList.contains("is-talking")), true);
  await page.waitForFunction(() => {
    const active = document.querySelector(".character.active");
    return active && active.getAttribute("src") === active.dataset.speaking;
  });
  const speakingGif = await page.locator(".character.active").evaluate(async element => {
    const response = await fetch(element.dataset.speaking);
    const bytes = new Uint8Array(await response.arrayBuffer());
    return {
      contentType: response.headers.get("content-type"),
      header: String.fromCharCode(...bytes.slice(0, 6)),
      ok: response.ok
    };
  });
  assert.equal(speakingGif.ok, true);
  assert.ok(["image/gif", "application/octet-stream"].includes(speakingGif.contentType));
  assert.equal(speakingGif.header, "GIF89a");
  const laptopCharacterInset = await page.evaluate(() => ({
    manager: Number.parseFloat(getComputedStyle(document.querySelector("#manager")).right),
    employee: Number.parseFloat(getComputedStyle(document.querySelector("#sarah")).left)
  }));
  assert.ok(laptopCharacterInset.manager >= 70);
  assert.ok(laptopCharacterInset.employee >= 70);
  await page.waitForFunction(() => document.querySelector("#advanceLabel")?.textContent !== "Reveal");
  assert.equal(await page.locator(".dialogue-panel").evaluate(element => element.classList.contains("is-speaking")), true);
  assert.equal(await page.locator(".character.active").evaluate(element => (
    element.getAttribute("src") === element.dataset.speaking
  )), true);
  await page.evaluate(() => window.__qaVoiceAnimation.finish());
  await page.waitForFunction(() => !document.querySelector(".dialogue-panel")?.classList.contains("is-speaking"));
  const voiceAnimation = await page.evaluate(() => {
    const active = document.querySelector(".character.active");
    return {
      ...window.__qaVoiceAnimation.state,
      active: null,
      returnedToIdle: Boolean(active && active.getAttribute("src") === active.dataset.idle)
    };
  });
  assert.equal(voiceAnimation.returnedToIdle, true);
  assert.ok(voiceAnimation.started >= 1);
  assert.ok(voiceAnimation.ended >= 1);
  assert.deepEqual(errors, []);
  typingAudioReport = { beforeMute, afterMute, voiceAnimation };
  await context.close();
}

{
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("feedbackPlaybook.storageVersion", "2026-07-role-specific-pulse-v9");
    localStorage.setItem("feedbackPlaybook.answers", JSON.stringify({
      "manager-pre-pulse": [4, 4, 4, 4, 4, 4],
      "employee-pre-pulse": [4, 4, 4, 4, 4, 4]
    }));
    const state = { spoken: [], cancelled: 0, speaking: false };
    const voices = [
      { name: "Microsoft Aria", lang: "en-SG", localService: true },
      { name: "Microsoft Guy", lang: "en-SG", localService: true }
    ];
    class QaSpeechSynthesisUtterance {
      constructor(text) {
        this.text = text;
      }
      addEventListener() {}
    }
    const synthesis = {
      get speaking() { return state.speaking; },
      get pending() { return false; },
      getVoices() { return voices; },
      addEventListener() {},
      speak(utterance) {
        state.speaking = true;
        state.spoken.push({
          text: utterance.text,
          lang: utterance.lang,
          rate: utterance.rate,
          pitch: utterance.pitch,
          voice: utterance.voice?.name || null
        });
      },
      cancel() {
        state.cancelled += 1;
        state.speaking = false;
      }
    };
    Object.defineProperty(window, "__qaSpeech", { value: state, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: QaSpeechSynthesisUtterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", { value: synthesis, configurable: true });
  });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.goto(`${baseUrl}/test3.html`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/scenario\.html/);

  async function startAndReachChoice(role) {
    await page.click(`[data-role="${role}"]`);
    await page.waitForFunction(() => document.querySelector("#rolePanel")?.hidden === true);
    const openingNarration = await page.evaluate(() => {
      const announcement = document.querySelector("#dialogueAnnouncement");
      return {
        text: document.querySelector("#dialogueText")?.textContent?.trim(),
        speaker: document.querySelector("#speakerName")?.textContent?.trim(),
        metaDisplay: getComputedStyle(document.querySelector(".dialogue-meta")).display,
        sceneCueHidden: document.querySelector("#sceneCue")?.hidden,
        announcementWidth: announcement?.getBoundingClientRect().width
      };
    });
    assert.ok(openingNarration.text);
    assert.doesNotMatch(openingNarration.text, /[\[\]()]/);
    assert.equal(openingNarration.speaker, "Narrator");
    assert.notEqual(openingNarration.metaDisplay, "none");
    assert.equal(openingNarration.sceneCueHidden, false);
    assert.ok(openingNarration.announcementWidth <= 1);
    assert.equal(await page.locator(".dialogue-panel").getAttribute("tabindex"), "0");
    assert.equal(await page.locator(".dialogue-panel").evaluate(element => element.classList.contains("is-clickable")), true);
    const firstLine = await page.locator("#dialogueText").textContent();
    const openingSpeech = await page.evaluate(() => ({ ...window.__qaSpeech, spoken: [...window.__qaSpeech.spoken] }));
    assert.equal(openingSpeech.spoken.at(-1)?.text, firstLine.trim());
    assert.equal(openingSpeech.spoken.at(-1)?.voice, "Microsoft Aria");
    assert.equal(await page.locator("#soundToggle").getAttribute("aria-pressed"), "true");

    await page.click("#soundToggle");
    assert.equal(await page.locator("#soundToggle").getAttribute("aria-pressed"), "false");
    const speechCountWhileMuted = await page.evaluate(() => window.__qaSpeech.spoken.length);
    await page.locator(".dialogue-panel").click({ position: { x: 24, y: 42 } });
    await page.waitForTimeout(280);
    const secondLine = await page.locator("#dialogueText").textContent();
    assert.notEqual(secondLine, firstLine);
    assert.equal(await page.evaluate(() => window.__qaSpeech.spoken.length), speechCountWhileMuted);
    assert.ok(await page.evaluate(() => window.__qaSpeech.cancelled) >= 1);

    await page.click("#soundToggle");
    await page.waitForFunction(expected => window.__qaSpeech.spoken.length > expected, speechCountWhileMuted);
    assert.equal(await page.locator("#soundToggle").getAttribute("aria-pressed"), "true");
    assert.equal(await page.evaluate(() => window.__qaSpeech.spoken.at(-1)?.text), secondLine.trim());
    await page.evaluate(() => {
      const text = document.querySelector("#dialogueText");
      const range = document.createRange();
      range.selectNodeContents(text);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.querySelector(".dialogue-panel").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(await page.locator("#dialogueText").textContent(), secondLine);
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.locator(".dialogue-panel").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(280);
    assert.notEqual(await page.locator("#dialogueText").textContent(), secondLine);
    for (let index = 0; index < 30 && await page.locator("#choices .choice-button").count() === 0; index += 1) {
      await page.click('[data-action="advance"]');
      await page.waitForTimeout(280);
    }
    assert.equal(await page.locator("#choices .choice-button").count(), 3);
  }

  async function completeCurrentScenario() {
    await page.locator("#choices .choice-button").nth(1).click();
    for (let index = 0; index < 30 && await page.locator("#reflectionPanel").evaluate(element => element.hidden); index += 1) {
      await page.click('[data-action="advance"]');
      await page.waitForTimeout(280);
    }
    assert.equal(await page.locator("#reflectionPanel").isVisible(), true);
    assert.equal(await page.locator("#reflectionTitle").evaluate(element => element === document.activeElement), true);
    const fields = page.locator("#reflectionFields textarea");
    for (let index = 0; index < await fields.count(); index += 1) await fields.nth(index).fill(`Reflection ${index + 1}`);
    await page.click('#reflectionForm button[type="submit"]');
    await page.waitForFunction(() => document.querySelector("#reflectionMessage")?.textContent.includes("saved"));
  }

  await startAndReachChoice("manager");
  const liveState = await page.evaluate(() => ({
    dialogueLive: document.querySelector(".dialogue-panel")?.getAttribute("aria-live"),
    dialogueHeight: Math.round(document.querySelector(".dialogue-panel")?.getBoundingClientRect().height || 0),
    announcement: document.querySelector("#dialogueAnnouncement")?.textContent,
    managerTransform: getComputedStyle(document.querySelector("#manager")).transform
  }));
  assert.equal(liveState.dialogueLive, null);
  assert.ok(liveState.dialogueHeight <= 110);
  assert.match(liveState.announcement, /:/);
  assert.doesNotMatch(liveState.managerTransform, /matrix\(-/);
  await completeCurrentScenario();
  await page.click('[data-action="restart-route"]');
  await page.waitForFunction(() => !document.querySelector("#rolePanel")?.hidden);
  await page.waitForFunction(() => document.activeElement?.id === "roleTitle");
  assert.equal(await page.locator("#roleTitle").evaluate(element => element === document.activeElement), true);
  await startAndReachChoice("employee");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const hud = document.querySelector("#scoreHud").getBoundingClientRect();
    const dialogueElement = document.querySelector(".dialogue-panel");
    const dialogue = dialogueElement.getBoundingClientRect();
    const choices = document.querySelector(".choice-panel").getBoundingClientRect();
    return {
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      hudBottom: Math.round(hud.bottom),
      dialogueTop: Math.round(dialogue.top),
      dialogueBottomGap: Math.round(window.innerHeight - dialogue.bottom),
      dialoguePaddingBottom: Number.parseFloat(getComputedStyle(dialogueElement).paddingBottom),
      dialogueMarginBottom: Number.parseFloat(getComputedStyle(dialogueElement).marginBottom),
      choiceBottomGap: Math.round(window.innerHeight - choices.bottom),
      choiceTargets: [...document.querySelectorAll(".choice-button")].map(button => Math.round(button.getBoundingClientRect().height))
    };
  });
  assert.equal(mobile.scrollWidth, mobile.width);
  assert.ok(mobile.hudBottom < mobile.dialogueTop);
  assert.equal(mobile.dialoguePaddingBottom, 8);
  assert.ok(mobile.dialogueMarginBottom >= 24);
  assert.ok(mobile.dialogueBottomGap >= 32);
  assert.ok(mobile.choiceBottomGap >= 208);
  assert.ok(mobile.choiceTargets.every(height => height >= 44));
  report.accessibility.scenario = await seriousAxe(page, "#scenarioMain");
  const voiceOverlay = await page.evaluate(() => ({ ...window.__qaSpeech, spoken: [...window.__qaSpeech.spoken] }));
  assert.ok(voiceOverlay.spoken.some(line => line.voice === "Microsoft Guy" && line.pitch < 1));
  assert.ok(voiceOverlay.spoken.some(line => line.voice === "Microsoft Aria" && line.pitch > 1));
  assert.equal(voiceOverlay.spoken.some(line => /[\[\]()]/.test(line.text)), false);
  report.scenario = { legacyRedirect: page.url(), liveState, voiceOverlay, typingAudio: typingAudioReport, mobile, responsive: await responsiveSweep(page, "scenario"), errors };
  await page.screenshot({ path: join(output, "scenario-mobile.png"), fullPage: false });
  await context.close();
}

{
  let source = await readFile(new URL("../assets/js/admin.js", import.meta.url), "utf8");
  const deniedClient = `({
    auth: {}, db: {},
    onAuthStateChanged(_auth, callback) { queueMicrotask(() => callback({ uid: "unauthorised", email: "not-viewer@example.com" })); },
    doc() { return {}; },
    async getDoc() { return { exists: () => false, data: () => null }; }
  })`;
  source = source.replace(/^import\s+\{[^;]+;\s*/, `const normalizeEmail=value=>String(value||"").trim().toLowerCase(); const rootAdminEmail="liuguangxuan1230@gmail.com"; const dashboardRole=(profile,email)=>email===rootAdminEmail?"owner":profile?.role; const loadFirebaseClient=async()=>${deniedClient};\n`);
  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1024, height: 768 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.route("**/assets/js/admin.js*", route => route.fulfill({ status: 200, contentType: "application/javascript", body: source }));
  await page.goto(`${baseUrl}/admin.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#accessPanel h1")?.textContent === "Access denied");
  assert.equal(await page.locator("#dashboardContent").isHidden(), true);
  assert.equal(await page.locator("#adminSignInLink").isVisible(), true);
  report.access = { denied: true, errors };
  await context.close();
}

{
  const library = JSON.parse(await readFile(new URL("../assets/data/scenarios/scenario-library.json", import.meta.url), "utf8"));
  const pulse = JSON.parse(await readFile(new URL("../assets/data/pulse-surveys.json", import.meta.url), "utf8"));
  let source = await readFile(new URL("../assets/js/admin.js", import.meta.url), "utf8");
  source = source.replace(/^import\s+\{[^;]+;\s*/, 'const normalizeEmail=value=>String(value||"").trim().toLowerCase(); const rootAdminEmail="liuguangxuan1230@gmail.com"; const dashboardRole=(profile,email)=>email===rootAdminEmail?"owner":profile?.role; const loadFirebaseClient=async()=>null;\n');
  const users = Array.from({ length: 75 }, (_, index) => ({
    uid: `u${index + 1}`,
    email: `learner${index + 1}@example.com`,
    selectedRole: index % 2 ? "manager" : "employee",
    learningProgress: {
      surveyVersion: pulse.version,
      answers: index % 2 ? {
        "employee-pre-pulse": [-1, -1, -1, -1, -1, -1],
        "employee-post-pulse": [-1, -1, -1, -1, -1, -1],
        "manager-pre-pulse": [4, 4, 4, 3, 4, 4],
        "manager-post-pulse": [5, 4, 5, 4, 4, 5]
      } : {
        "employee-pre-pulse": [3, 3, 4, 4, 4, 3],
        "employee-post-pulse": [4, 4, 4, 4, 5, 4],
        "manager-pre-pulse": [-1, -1, -1, -1, -1, -1],
        "manager-post-pulse": [-1, -1, -1, -1, -1, -1]
      },
      completed: 12,
      total: 24,
      progress: 50
    }
  }));
  const results = users.flatMap((user, userIndex) => library.scenarios
    .filter(scenario => scenario.role === user.selectedRole)
    .map((scenario, scenarioIndex) => {
      const index = userIndex * 4 + scenarioIndex;
      return {
        id: `r${index}`, uid: user.uid, email: user.email,
        attemptId: `attempt-${index}`, attemptNumber: 1, scenarioId: scenario.id, scenarioTitle: scenario.title,
        selectedRole: scenario.role, frameworkId: scenario.frameworkId, frameworkDimensionId: scenario.focusDimension,
        optionSelected: "B", optionScore: 2, choiceClassification: "strong", completed: true,
        score: 2, maxScore: 2, scorePercent: 100, reflectionSaved: true,
        updatedAtIso: `2026-07-24T${String(userIndex % 24).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}:00Z`
      };
    }));
  const seed = [
    `scenarioDefinitions=${JSON.stringify(library.scenarios)};`,
    `pulseSurveyDefinitions=${JSON.stringify(pulse.surveys)};`,
    `frameworkDefinitions=${JSON.stringify(library.frameworks)};`,
    `cachedUsers=${JSON.stringify(users)};`,
    `cachedResults=${JSON.stringify(results)};`,
    `cachedAdmins=[{id:rootAdminEmail,email:rootAdminEmail,role:"owner"}];`,
    `const qaUsers=[...cachedUsers],qaResults=[...cachedResults];let qaAdmins=[...cachedAdmins];`,
    `const qaSnapshot=items=>({docs:items.map((item,index)=>({id:item.id||item.uid||String(index),data:()=>item,ref:{id:item.id||item.uid||String(index)}})),size:items.length});`,
    `firebaseClient={auth:{},db:{},doc(_db,...parts){return{id:parts.at(-1),path:parts.join("/")}},collection(_db,...parts){return{name:parts.at(-1)}},query(base){return base},where(){return{}},orderBy(){return{}},documentId(){return{}},startAfter(){return{}},limit(){return{}},serverTimestamp(){return new Date()},async getDocs(ref){if(ref.name==="users")return qaSnapshot(qaUsers);if(ref.name==="scenarioResults")return qaSnapshot(qaResults);if(ref.name==="dashboardAdminEmails")return qaSnapshot(qaAdmins);if(ref.name==="scenarioReflections")return qaSnapshot(qaResults.map(result=>({id:result.id,attemptId:result.attemptId,answers:{takeaway:"Reflection for "+result.attemptId}})));return qaSnapshot([])},async getCountFromServer(ref){const count=ref.name==="users"?qaUsers.length:qaResults.length;return{data:()=>({count})}},async setDoc(ref,data){if(ref.path.startsWith("dashboardAdminEmails/")){qaAdmins=[...qaAdmins.filter(item=>item.id!==ref.id),{id:ref.id,...data}]}},async deleteDoc(ref){qaAdmins=qaAdmins.filter(item=>item.id!==ref.id)},async signOut(){}};`,
    `currentUser={uid:"owner",email:rootAdminEmail}; currentDashboardRole="owner"; dashboardAllowed=true;`,
    `totalUsersFromServer=cachedUsers.length; totalResultsFromServer=cachedResults.length;`,
    `syncScenarioOptions(); bindEvents(); setAccess("Dashboard preview","",true); const qaRenderStart=performance.now(); renderDashboardData(); window.__dashboardRenderMs=performance.now()-qaRenderStart; updatePaginationStatus();`,
    `adminAccountEmail.textContent=rootAdminEmail; adminAccountRole.textContent="Dashboard owner"; viewerAdminSection.hidden=false;`
  ].join("\n");
  source = source.replace(/\ninit\(\);\s*$/, `\n${seed}`);

  const context = await browser.newContext({ bypassCSP: true, viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = watchErrors(page);
  await page.route("**/assets/js/admin.js*", route => route.fulfill({ status: 200, contentType: "application/javascript", body: source }));
  await page.goto(`${baseUrl}/admin.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#dashboardContent:not([hidden])");
  const dashboardRenderMs = await page.evaluate(() => window.__dashboardRenderMs);
  assert.ok(dashboardRenderMs < 2000, `Dashboard render took ${dashboardRenderMs}ms`);
  assert.equal(await page.locator("#learnerProgressDisclosure").getAttribute("open"), null);
  assert.equal(await page.locator("#resultRecordsDisclosure").getAttribute("open"), null);
  assert.doesNotMatch(await page.locator("#employeePulseScore").textContent(), /^-$/);
  assert.doesNotMatch(await page.locator("#managerPulseScore").textContent(), /^-$/);
  await page.locator('[data-pulse-detail="employee"]').click();
  await page.waitForSelector("#pulseDetailPanel:not([hidden])");
  assert.match(await page.locator("#culturePulseDetailTitle").textContent(), /Employee CARE breakdown/);
  assert.ok(await page.locator("#culturePulseChart .culture-pulse-row").count() >= 5);
  await page.locator('#closePulseDetail').click();
  await page.locator("#learnerProgressDisclosure summary").click();
  await page.locator("[data-user-id]").first().click();
  await page.waitForSelector("#detailPanel:not([hidden])");
  assert.equal(await page.locator("#detailTitle").evaluate(element => element === document.activeElement), true);
  assert.match(await page.locator("#detailBody").textContent(), /Reflection for attempt-/);
  await page.fill("#adminEmail", "viewer@example.com");
  await page.locator('#adminForm button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector("#adminMessage")?.textContent.includes("added"));
  assert.equal(await page.locator('[data-remove-admin="viewer@example.com"]').isVisible(), true);
  assert.equal(await page.locator('[data-remove-admin="liuguangxuan1230@gmail.com"]').isDisabled(), true);
  await page.locator('[data-remove-admin="viewer@example.com"]').click();
  await page.waitForFunction(() => document.querySelector("#adminMessage")?.textContent.includes("removed"));
  assert.equal(await page.locator('[data-remove-admin="viewer@example.com"]').count(), 0);
  await page.click('[data-filter="completed"]');
  assert.equal(await page.locator('[data-filter="completed"]').getAttribute("aria-pressed"), "true");
  await page.locator("#resultRecordsDisclosure summary").click();
  const desktop = await page.evaluate(() => ({
    rows: document.querySelectorAll("#usersTable tr").length,
    results: document.querySelectorAll("#resultsTable tr").length,
    ownerSection: !document.querySelector("#viewerAdminSection").hidden,
    duplicateIds: [...document.querySelectorAll("[id]")].map(node => node.id).filter((id, index, ids) => ids.indexOf(id) !== index),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  assert.deepEqual(desktop.duplicateIds, []);
  assert.equal(desktop.overflow, false);
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert.equal(mobile.scrollWidth, mobile.width);
  const invalidHeaders = await page.evaluate(() => [...document.querySelectorAll("td[headers]")].map(cell => ({ headers: cell.getAttribute("headers"), table: cell.closest("table")?.parentElement?.getAttribute("aria-label"), label: cell.dataset.label, valid: Boolean(cell.closest("table")?.querySelector(`#${CSS.escape(cell.getAttribute("headers"))}`)) })).filter(item => !item.valid));
  if (invalidHeaders.length) console.log("INVALID_HEADERS", JSON.stringify(invalidHeaders.slice(0, 20)));
  report.accessibility.dashboard = await seriousAxe(page, "#dashboardContent");
  report.dashboard = { desktop, mobile, detailFocus: true, viewerManagement: true, responsive: await responsiveSweep(page, "dashboard"), errors };
  report.access.owner = true;
  report.performance = { dashboardLearners: users.length, dashboardResults: results.length, dashboardRenderMs };
  await page.screenshot({ path: join(output, "dashboard-mobile.png"), fullPage: true });
  await context.close();
}

await browser.close();
for (const [surface, violations] of Object.entries(report.accessibility)) {
  if (violations.length) console.log("AXE", surface, JSON.stringify(violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => ({ target: node.target, html: node.html, summary: node.failureSummary })) })), null, 2));
  assert.deepEqual(violations.map(item => ({ id: item.id, impact: item.impact })), [], `${surface} has serious axe violations`);
}
for (const [surface, result] of Object.entries(report)) {
  if (surface !== "accessibility" && Array.isArray(result.errors)) assert.deepEqual(result.errors, [], `${surface} browser errors`);
}
console.log(JSON.stringify(report, null, 2));