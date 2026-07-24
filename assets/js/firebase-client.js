const firebaseVersion = "12.15.0";
const firebaseBaseUrl = `https://www.gstatic.com/firebasejs/${firebaseVersion}`;

let cachedAuthClient = null;
let cachedFirestoreClient = null;
let cachedConfig = null;

export const dashboardOwnerEmail = "liuguangxuan1230@gmail.com";
export const rootAdminEmail = dashboardOwnerEmail;
export const dashboardRoles = Object.freeze({ owner: "owner", viewer: "viewer" });

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function dashboardRole(profile, email = "") {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail === dashboardOwnerEmail) {
    return profile?.role === dashboardRoles.owner ? dashboardRoles.owner : null;
  }
  return profile?.role === dashboardRoles.viewer ? dashboardRoles.viewer : null;
}

export function isDashboardViewer(profile, email = "") {
  return Boolean(dashboardRole(profile, email));
}

export function isDashboardOwner(email = "") {
  return normalizeEmail(email) === dashboardOwnerEmail;
}

export async function loadFirebaseConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    const configUrl = new URL("../../firebase-config.js?v=20260724", import.meta.url);
    const localConfig = await import(configUrl.href);
    if (localConfig.firebaseConfig) {
      cachedConfig = localConfig.firebaseConfig;
      return cachedConfig;
    }
  } catch {
    // Firebase Hosting can provide the configuration when no local file is present.
  }

  try {
    const response = await fetch("/__/firebase/init.json");
    if (response.ok) {
      cachedConfig = await response.json();
      return cachedConfig;
    }
  } catch {
    // Local and GitHub Pages builds may not expose the Firebase Hosting endpoint.
  }

  throw new Error("Cloud sync is unavailable. You can continue locally on this device.");
}

export async function loadFirebaseAuthClient() {
  if (cachedAuthClient) return cachedAuthClient;

  const firebaseConfig = await loadFirebaseConfig();
  const [appModule, authModule] = await Promise.all([
    import(`${firebaseBaseUrl}/firebase-app.js`),
    import(`${firebaseBaseUrl}/firebase-auth.js`)
  ]);

  const app = appModule.getApps().length ? appModule.getApp() : appModule.initializeApp(firebaseConfig);
  cachedAuthClient = {
    app,
    auth: authModule.getAuth(app),
    createUserWithEmailAndPassword: authModule.createUserWithEmailAndPassword,
    onAuthStateChanged: authModule.onAuthStateChanged,
    sendEmailVerification: authModule.sendEmailVerification,
    sendPasswordResetEmail: authModule.sendPasswordResetEmail,
    signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
    signOut: authModule.signOut
  };

  return cachedAuthClient;
}

export async function ensureFirestore(client = null) {
  if (cachedFirestoreClient) return cachedFirestoreClient;

  const authClient = client || await loadFirebaseAuthClient();
  const firestoreModule = await import(`${firebaseBaseUrl}/firebase-firestore.js`);
  cachedFirestoreClient = Object.assign(authClient, {
    db: firestoreModule.getFirestore(authClient.app),
    collection: firestoreModule.collection,
    deleteDoc: firestoreModule.deleteDoc,
    deleteField: firestoreModule.deleteField,
    doc: firestoreModule.doc,
    documentId: firestoreModule.documentId,
    getCountFromServer: firestoreModule.getCountFromServer,
    getDoc: firestoreModule.getDoc,
    getDocs: firestoreModule.getDocs,
    limit: firestoreModule.limit,
    orderBy: firestoreModule.orderBy,
    query: firestoreModule.query,
    serverTimestamp: firestoreModule.serverTimestamp,
    setDoc: firestoreModule.setDoc,
    startAfter: firestoreModule.startAfter,
    updateDoc: firestoreModule.updateDoc,
    where: firestoreModule.where,
    writeBatch: firestoreModule.writeBatch
  });

  return cachedFirestoreClient;
}

export async function loadFirebaseClient() {
  return ensureFirestore(await loadFirebaseAuthClient());
}