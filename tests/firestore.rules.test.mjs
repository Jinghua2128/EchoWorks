import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";

let environment;
const projectId = "demo-echoworks-rules";
const ownerEmail = "liuguangxuan1230@gmail.com";

function userDb(uid, email) {
  return environment.authenticatedContext(uid, { email, email_verified: true }).firestore();
}

function validResult(uid, overrides = {}) {
  return {
    uid,
    email: `${uid}@example.com`,
    anonymousPlayerId: `player-${uid}`,
    attemptId: "real-late-arrival_attempt_1_100",
    attemptNumber: 1,
    attemptStartedAtIso: "2026-07-24T00:00:00.000Z",
    scenarioId: "real-late-arrival",
    scenarioTitle: "The Late Arrival",
    selectedRole: "manager",
    frameworkId: "REAL",
    frameworkDimensionId: "R",
    optionSelected: "A",
    optionScore: 2,
    choiceClassification: "strong",
    score: 2,
    maxScore: 2,
    scorePercent: 100,
    progressPercent: 100,
    completed: true,
    pathStarted: true,
    reflectionSaved: false,
    updatedAt: serverTimestamp(),
    ...overrides
  };
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") }
  });
});

after(async () => environment?.cleanup());
beforeEach(async () => environment.clearFirestore());

async function seedAccessAndLearners() {
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "dashboardAdminEmails", ownerEmail), { email: ownerEmail, role: "owner" });
    await setDoc(doc(db, "dashboardAdminEmails", "viewer@example.com"), { email: "viewer@example.com", role: "viewer" });
    await setDoc(doc(db, "users", "learner-a"), { email: "learner-a@example.com", updatedAt: new Date() });
    await setDoc(doc(db, "users", "learner-b"), { email: "learner-b@example.com", updatedAt: new Date() });
    await setDoc(doc(db, "scenarioResults", "learner-a_attempt-a"), validResult("learner-a", { updatedAt: new Date() }));
  });
}

test("anonymous users cannot read learner or dashboard data", async () => {
  await seedAccessAndLearners();
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "users", "learner-a")));
  await assertFails(getDocs(collection(db, "scenarioResults")));
});

test("learners can write valid own records but cannot cross user boundaries", async () => {
  await seedAccessAndLearners();
  const db = userDb("learner-a", "learner-a@example.com");
  await assertSucceeds(setDoc(doc(db, "users", "learner-a"), {
    email: "learner-a@example.com",
    selectedRole: "manager",
    updatedAt: serverTimestamp()
  }, { merge: true }));
  await assertFails(getDoc(doc(db, "users", "learner-b")));
  await assertSucceeds(setDoc(doc(db, "scenarioResults", "learner-a_attempt-new"), validResult("learner-a", {
    attemptId: "real-late-arrival_attempt_2_200",
    attemptNumber: 2
  })));
  await assertFails(setDoc(doc(db, "scenarioResults", "learner-b_forged"), validResult("learner-b")));
});

test("completed attempt identity and competency scores are immutable", async () => {
  await seedAccessAndLearners();
  const db = userDb("learner-a", "learner-a@example.com");
  const ref = doc(db, "scenarioResults", "learner-a_attempt-a");
  await assertFails(updateDoc(ref, { score: 0, scorePercent: 0, optionScore: 0, choiceClassification: "missed" }));
  await assertFails(updateDoc(ref, { scenarioId: "care-ambush" }));
  await assertSucceeds(updateDoc(ref, { reflectionSaved: true, updatedAt: serverTimestamp() }));
});

test("viewers are read-only while the owner manages viewer profiles", async () => {
  await seedAccessAndLearners();
  const viewer = userDb("viewer", "viewer@example.com");
  await assertSucceeds(getDocs(collection(viewer, "users")));
  await assertSucceeds(getDocs(collection(viewer, "scenarioResults")));
  await assertFails(updateDoc(doc(viewer, "users", "learner-a"), { selectedRole: "employee" }));
  await assertFails(setDoc(doc(viewer, "dashboardAdminEmails", "new@example.com"), { email: "new@example.com", role: "viewer" }));
  await assertFails(getDocs(collection(viewer, "dashboardAdminEmails")));

  const owner = userDb("owner", ownerEmail);
  await assertSucceeds(setDoc(doc(owner, "dashboardAdminEmails", "new@example.com"), {
    email: "new@example.com",
    role: "viewer",
    addedBy: ownerEmail,
    addedAt: serverTimestamp()
  }));
  await assertSucceeds(getDocs(collection(owner, "dashboardAdminEmails")));
  await assertFails(updateDoc(doc(owner, "dashboardAdminEmails", ownerEmail), { role: "viewer" }));
  await assertFails(deleteDoc(doc(owner, "dashboardAdminEmails", ownerEmail)));
});

test("progress deletion removes owned records without permission to delete unrelated records", async () => {
  await seedAccessAndLearners();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, "users", "learner-a", "scenarioProgress", "real-late-arrival"), validResult("learner-a", { updatedAt: new Date() }));
    await setDoc(doc(db, "scenarioReflections", "learner-a_attempt-a"), {
      uid: "learner-a",
      attemptId: "real-late-arrival_attempt_1_100",
      scenarioId: "real-late-arrival",
      answers: { next: "Pause" },
      updatedAt: new Date()
    });
  });
  const db = userDb("learner-a", "learner-a@example.com");
  await assertSucceeds(deleteDoc(doc(db, "users", "learner-a", "scenarioProgress", "real-late-arrival")));
  await assertSucceeds(deleteDoc(doc(db, "scenarioResults", "learner-a_attempt-a")));
  await assertSucceeds(deleteDoc(doc(db, "scenarioReflections", "learner-a_attempt-a")));
  await assertFails(deleteDoc(doc(db, "users", "learner-b")));
  assert.equal((await getDoc(doc(db, "users", "learner-a"))).exists(), true);
});