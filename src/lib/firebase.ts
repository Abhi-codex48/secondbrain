import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut as fbSignOut } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, type Firestore } from "firebase/firestore";
import { firebaseConfig } from "../firebase-config";

// Settings come from src/firebase-config.ts, or from the setup screen, which
// keeps them only on this device (so they never have to be put in the public code).
const LOCAL_KEY = "sb-firebase-config";
function localConfig(): typeof firebaseConfig | null {
  try {
    const s = localStorage.getItem(LOCAL_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
const config = firebaseConfig.apiKey ? firebaseConfig : localConfig() ?? firebaseConfig;
export const configured = Boolean(config.apiKey && config.projectId && config.appId);

/** Reads the config Firebase shows (JS or JSON), checks it and saves it on this device. */
export function saveLocalConfig(raw: string) {
  const pick = (k: string) => raw.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`))?.[1] ?? "";
  const c = { apiKey: pick("apiKey"), authDomain: pick("authDomain"), projectId: pick("projectId"), storageBucket: pick("storageBucket"), messagingSenderId: pick("messagingSenderId"), appId: pick("appId") };
  if (!c.apiKey || !c.projectId || !c.appId || !c.authDomain) throw new Error("That doesn't look like a Firebase config. Copy the whole firebaseConfig block from Project settings → Your apps.");
  localStorage.setItem(LOCAL_KEY, JSON.stringify(c));
}
export function clearLocalConfig() {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch { /* ignore */ }
}

const app = initializeApp(configured ? config : { apiKey: "none", projectId: "none", appId: "none" });
export const auth = getAuth(app);

function makeDb(): Firestore {
  try {
    // Keeps a copy of your data on this device: the app works offline and
    // pending edits are sent when you are back online.
    return initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true });
  } catch {
    return initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
  }
}
export const db = makeDb();

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "";
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") await signInWithRedirect(auth, provider);
    else if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") throw e;
  }
}

export const signOut = () => fbSignOut(auth);
