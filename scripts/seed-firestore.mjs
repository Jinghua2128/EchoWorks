import process from "node:process";
import {
  buildDashboardSampleData,
  FIREBASE_PROJECT_ID,
  SEED_NAMESPACE
} from "./dashboard-sample-data.mjs";

function argumentValue(name) {
  const prefix = "--" + name + "=";
  const argument = process.argv.slice(2).find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : "";
}

function hasFlag(name) {
  return process.argv.slice(2).includes("--" + name);
}

function printSummary(sample, mode) {
  console.log("");
  console.log("EchoWorks Firestore sample data");
  console.log("Mode: " + mode);
  console.log("Project: " + FIREBASE_PROJECT_ID);
  console.log("Marker: " + SEED_NAMESPACE);
  console.table(sample.metadata.counts);
}

function timestampMaterializer(Timestamp) {
  const timestampFields = new Set(["createdAt", "updatedAt", "completedAt"]);
  return data => Object.fromEntries(Object.entries(data).map(([key, value]) => {
    if (timestampFields.has(key) && typeof value === "string" && !Number.isNaN(Date.parse(value))) {
      return [key, Timestamp.fromDate(new Date(value))];
    }
    return [key, value];
  }));
}

async function commitInChunks(db, operations) {
  const chunkSize = 400;
  for (let offset = 0; offset < operations.length; offset += chunkSize) {
    const batch = db.batch();
    operations.slice(offset, offset + chunkSize).forEach(operation => operation(batch));
    await batch.commit();
  }
}

const write = hasFlag("write");
const cleanup = hasFlag("cleanup");
const projectId = argumentValue("project") || FIREBASE_PROJECT_ID;
const confirmedProject = argumentValue("confirm-project");
const sample = await buildDashboardSampleData();

printSummary(sample, write ? (cleanup ? "cleanup" : "write") : (cleanup ? "cleanup dry run" : "seed dry run"));

if (!write) {
  console.log("");
  console.log("Dry run only. No Firestore documents were changed.");
  console.log("Add --write and --confirm-project=" + FIREBASE_PROJECT_ID + " after reviewing the setup guide.");
  process.exit(0);
}

if (projectId !== FIREBASE_PROJECT_ID || confirmedProject !== FIREBASE_PROJECT_ID) {
  throw new Error(
    "Write refused. Both --project and --confirm-project must equal " + FIREBASE_PROJECT_ID + "."
  );
}

if (process.env.FIRESTORE_EMULATOR_HOST && !hasFlag("allow-emulator")) {
  throw new Error(
    "FIRESTORE_EMULATOR_HOST is set. Remove it, or add --allow-emulator if this is intentional."
  );
}

const [{ applicationDefault, initializeApp }, { getFirestore, Timestamp }] = await Promise.all([
  import("firebase-admin/app"),
  import("firebase-admin/firestore")
]);

const app = initializeApp({
  credential: applicationDefault(),
  projectId
});
const db = getFirestore(app);
const materialize = timestampMaterializer(Timestamp);
const operations = [];

if (cleanup) {
  sample.scenarioProgress.forEach(record => {
    operations.push(batch => batch.delete(
      db.collection("users").doc(record.userId).collection("scenarioProgress").doc(record.scenarioId)
    ));
  });
  sample.scenarioReflections.forEach(record => {
    operations.push(batch => batch.delete(db.collection("scenarioReflections").doc(record.id)));
  });
  sample.scenarioResults.forEach(record => {
    operations.push(batch => batch.delete(db.collection("scenarioResults").doc(record.id)));
  });
  sample.users.forEach(record => {
    operations.push(batch => batch.delete(db.collection("users").doc(record.id)));
  });
} else {
  operations.push(batch => batch.set(
    db.collection("dashboardAdminEmails").doc(sample.owner.id),
    materialize(sample.owner.data),
    { merge: true }
  ));
  sample.users.forEach(record => {
    operations.push(batch => batch.set(db.collection("users").doc(record.id), materialize(record.data)));
  });
  sample.scenarioResults.forEach(record => {
    operations.push(batch => batch.set(db.collection("scenarioResults").doc(record.id), materialize(record.data)));
  });
  sample.scenarioReflections.forEach(record => {
    operations.push(batch => batch.set(db.collection("scenarioReflections").doc(record.id), materialize(record.data)));
  });
  sample.scenarioProgress.forEach(record => {
    operations.push(batch => batch.set(
      db.collection("users").doc(record.userId).collection("scenarioProgress").doc(record.scenarioId),
      materialize(record.data)
    ));
  });
}

await commitInChunks(db, operations);

console.log("");
console.log(
  cleanup
    ? "Removed " + operations.length + " deterministic sample documents. The dashboard owner profile was kept."
    : "Seeded " + operations.length + " documents. Open admin.html while signed in as the dashboard owner."
);
