export const scenarioStorageKeys = Object.freeze({
  results: "feedbackPlaybook.scenarioResults",
  recentByRole: "feedbackPlaybook.lastScenarioByRole",
  anonymousPlayerId: "feedbackPlaybook.anonymousPlayerId"
});

function storageOrDefault(storage) {
  return storage || globalThis.localStorage;
}

export function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function resultTimestamp(record) {
  return Math.max(
    timestampMillis(record?.updatedAt),
    timestampMillis(record?.updatedAtIso),
    timestampMillis(record?.completedAt),
    timestampMillis(record?.completedAtIso),
    timestampMillis(record?.attemptStartedAtIso)
  );
}

export function scenarioRecordIdentity(record) {
  if (record?.attemptId) return String(record.attemptId);
  const player = record?.uid || record?.anonymousPlayerId || "anonymous";
  return [player, record?.scenarioId || "scenario", Number(record?.attemptNumber || 1)].join("::");
}

function reflectionCount(record) {
  return Object.values(record?.reflectionAnswers || {}).filter(value => String(value || "").trim()).length;
}

function preferredRecord(left, right) {
  const timeDifference = resultTimestamp(left) - resultTimestamp(right);
  let preferred = timeDifference > 0 ? left : right;
  if (timeDifference === 0) {
    if (Boolean(left?.completed) !== Boolean(right?.completed)) preferred = left?.completed ? left : right;
    else {
      const reflectionDifference = reflectionCount(left) - reflectionCount(right);
      if (reflectionDifference !== 0) preferred = reflectionDifference > 0 ? left : right;
      else if (left?._sync?.state === "synced" && right?._sync?.state !== "synced") preferred = left;
    }
  }
  const alternate = preferred === left ? right : left;
  return {
    ...alternate,
    ...preferred,
    reflectionAnswers: reflectionCount(preferred) ? preferred.reflectionAnswers : (alternate.reflectionAnswers || {})
  };
}
export function recordsFromStoredValue(value) {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === "object");
  if (!value || typeof value !== "object") return [];
  return Object.values(value).filter(item => item && typeof item === "object");
}

export function readLocalScenarioRecords(storage) {
  const target = storageOrDefault(storage);
  return recordsFromStoredValue(safeJsonParse(target.getItem(scenarioStorageKeys.results), {}));
}

export function scenarioRecordsToMap(records) {
  return Object.fromEntries(records.map(record => [scenarioRecordIdentity(record), record]));
}

export function writeLocalScenarioRecords(records, storage) {
  const target = storageOrDefault(storage);
  target.setItem(scenarioStorageKeys.results, JSON.stringify(scenarioRecordsToMap(records)));
}

export function writeLocalScenarioRecord(record, storage) {
  const records = readLocalScenarioRecords(storage);
  const identity = scenarioRecordIdentity(record);
  const next = records.filter(item => scenarioRecordIdentity(item) !== identity);
  next.push(record);
  writeLocalScenarioRecords(next, storage);
  return record;
}

export function mergeScenarioRecords(localRecords = [], cloudRecords = []) {
  const merged = new Map();

  [...localRecords, ...cloudRecords].forEach(record => {
    if (!record?.scenarioId) return;
    const identity = scenarioRecordIdentity(record);
    const previous = merged.get(identity);
    merged.set(identity, previous ? preferredRecord(previous, record) : record);
  });

  return [...merged.values()].sort((a, b) => {
    const timeDifference = resultTimestamp(b) - resultTimestamp(a);
    return timeDifference || scenarioRecordIdentity(a).localeCompare(scenarioRecordIdentity(b));
  });
}

export function nextAttemptNumber(records, scenarioId) {
  return records
    .filter(record => record.scenarioId === scenarioId)
    .reduce((highest, record) => Math.max(highest, Number(record.attemptNumber || 1)), 0) + 1;
}

export function latestScenarioRecord(records) {
  return [...records].sort((a, b) => resultTimestamp(b) - resultTimestamp(a))[0] || null;
}

export function completionForRole(records, role, definitions = []) {
  const expected = definitions.filter(item => item.role === role);
  const completedIds = new Set(records
    .filter(record => record.selectedRole === role && record.completed)
    .map(record => record.scenarioId));
  return {
    completedScenarioCount: expected.filter(item => completedIds.has(item.id)).length,
    totalScenarioCount: expected.length,
    pathCompleted: expected.length > 0 && expected.every(item => completedIds.has(item.id))
  };
}

export async function loadCloudScenarioRecords(firebaseClient, user) {
  if (!firebaseClient?.db || !user?.uid) return [];
  const ownResults = firebaseClient.query(
    firebaseClient.collection(firebaseClient.db, "scenarioResults"),
    firebaseClient.where("uid", "==", user.uid)
  );
  const snapshot = await firebaseClient.getDocs(ownResults);
  return snapshot.docs.map(document => ({ id: document.id, ...document.data(), _sync: { state: "synced" } }));
}

export async function mergeCloudScenarioRecords(firebaseClient, user, storage) {
  const localRecords = readLocalScenarioRecords(storage);
  const cloudRecords = await loadCloudScenarioRecords(firebaseClient, user);
  const merged = mergeScenarioRecords(localRecords, cloudRecords);
  writeLocalScenarioRecords(merged, storage);
  return merged;
}

function cloudRecord(record, firebaseClient, user) {
  const { _sync, id, reflectionAnswers, ...serializable } = record;
  const reflectionSaved = Object.values(reflectionAnswers || {}).some(value => String(value || "").trim());
  return {
    ...serializable,
    uid: user.uid,
    email: user.email || "",
    reflectionSaved,
    updatedAt: firebaseClient.serverTimestamp(),
    ...(record.completed ? { completedAt: firebaseClient.serverTimestamp() } : {})
  };
}

function syncMetadata(state, error = "") {
  return {
    state,
    attemptedAtIso: new Date().toISOString(),
    error: error ? String(error) : ""
  };
}

export async function saveScenarioRecordWithStatus({ record, firebaseClient, user, storage }) {
  let localOk = false;
  let localError = null;
  const signedIn = Boolean(firebaseClient?.db && user?.uid);
  let localRecord = {
    ...record,
    uid: user?.uid || record.uid || null,
    email: user?.email || record.email || "Guest learner",
    _sync: syncMetadata(signedIn ? "pending" : "local_only")
  };

  try {
    writeLocalScenarioRecord(localRecord, storage);
    localOk = true;
  } catch (error) {
    localError = error;
  }

  if (!signedIn) {
    return {
      ok: localOk,
      local: { ok: localOk, error: localError },
      cloud: { ok: false, state: "not_signed_in", error: null },
      record: localRecord
    };
  }

  const payload = cloudRecord(record, firebaseClient, user);
  const resultPayload = { ...payload, reflectionAnswers: firebaseClient.deleteField() };
  const resultId = `${user.uid}_${scenarioRecordIdentity(record)}`;
  const writeOperations = [
    firebaseClient.setDoc(firebaseClient.doc(firebaseClient.db, "users", user.uid), {
      email: user.email || "",
      selectedRole: record.selectedRole,
      anonymousPlayerId: record.anonymousPlayerId,
      updatedAt: firebaseClient.serverTimestamp()
    }, { merge: true }),
    firebaseClient.setDoc(
      firebaseClient.doc(firebaseClient.db, "users", user.uid, "scenarioProgress", record.scenarioId),
      resultPayload,
      { merge: true }
    ),
    firebaseClient.setDoc(firebaseClient.doc(firebaseClient.db, "scenarioResults", resultId), resultPayload, { merge: true })
  ];
  if (payload.reflectionSaved) {
    writeOperations.push(firebaseClient.setDoc(
      firebaseClient.doc(firebaseClient.db, "scenarioReflections", resultId),
      {
        uid: user.uid,
        attemptId: record.attemptId,
        scenarioId: record.scenarioId,
        answers: record.reflectionAnswers,
        updatedAt: firebaseClient.serverTimestamp()
      },
      { merge: true }
    ));
  }
  const writes = await Promise.allSettled(writeOperations);
  const rejected = writes.find(result => result.status === "rejected");
  const cloudOk = !rejected;
  const cloudError = rejected?.reason || null;

  localRecord = {
    ...localRecord,
    _sync: syncMetadata(cloudOk ? "synced" : "failed", cloudError?.message || cloudError || "")
  };
  try {
    writeLocalScenarioRecord(localRecord, storage);
    localOk = true;
    localError = null;
  } catch (error) {
    localOk = false;
    localError = error;
  }

  return {
    ok: localOk && cloudOk,
    local: { ok: localOk, error: localError },
    cloud: { ok: cloudOk, state: cloudOk ? "synced" : "failed", error: cloudError },
    record: localRecord
  };
}

export async function retryPendingScenarioRecords({ firebaseClient, user, storage }) {
  const pending = readLocalScenarioRecords(storage).filter(record => {
    return record.uid === user?.uid && ["pending", "failed"].includes(record?._sync?.state);
  });
  const outcomes = [];
  for (const record of pending) {
    outcomes.push(await saveScenarioRecordWithStatus({ record, firebaseClient, user, storage }));
  }
  return outcomes;
}

export function clearLocalScenarioProgress(storage) {
  const target = storageOrDefault(storage);
  target.removeItem(scenarioStorageKeys.results);
  target.removeItem(scenarioStorageKeys.recentByRole);
}