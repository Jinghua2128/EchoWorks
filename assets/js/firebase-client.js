const firebaseVersion = "12.15.0";
const firebaseBaseUrl = `https://www.gstatic.com/firebasejs/${firebaseVersion}`;

let cachedClient = null;
let cachedConfig = null;

export const rootAdminEmail = "liuguangxuan1230@gmail.com";

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export async function loadFirebaseConfig() {
  if (cachedConfig) return cachedConfig;

  try {
    const configUrl = new URL("../../firebase-config.js?v=20260701-firebase", import.meta.url);
    const localConfig = await import(configUrl.href);
    if (localConfig.firebaseConfig) {
      cachedConfig = localConfig.firebaseConfig;
      return cachedConfig;
    }
  } catch {
    // Local config is optional for GitHub Pages and offline demos.
  }

  try {
    const response = await fetch("/__/firebase/init.json", { cache: "no-store" });
    if (response.ok) {
      cachedConfig = await response.json();
      return cachedConfig;
    }
  } catch {
    // Firebase Hosting provides this file after deployment.
  }

  throw new Error("Cloud sync is unavailable. Scenario progress will save locally on this device.");
}

export async function loadFirebaseClient() {
  if (cachedClient) return cachedClient;

  const firebaseConfig = await loadFirebaseConfig();
  const [appModule, authModule, firestoreModule] = await Promise.all([
    import(`${firebaseBaseUrl}/firebase-app.js`),
    import(`${firebaseBaseUrl}/firebase-auth.js`),
    import(`${firebaseBaseUrl}/firebase-firestore.js`)
  ]);

  const app = appModule.initializeApp(firebaseConfig);
  cachedClient = {
    app,
    auth: authModule.getAuth(app),
    db: firestoreModule.getFirestore(app),
    onAuthStateChanged: authModule.onAuthStateChanged,
    signOut: authModule.signOut,
    collection: firestoreModule.collection,
    deleteDoc: firestoreModule.deleteDoc,
    doc: firestoreModule.doc,
    getDoc: firestoreModule.getDoc,
    getDocs: firestoreModule.getDocs,
    query: firestoreModule.query,
    serverTimestamp: firestoreModule.serverTimestamp,
    setDoc: firestoreModule.setDoc,
    where: firestoreModule.where
  };

  return cachedClient;
}

export function isRootAdmin(user) {
  return normalizeEmail(user?.email) === rootAdminEmail;
}
