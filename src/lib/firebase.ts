import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut as fbSignOut, reauthenticateWithPopup, deleteUser } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, type Firestore } from "firebase/firestore";
import { firebaseConfig } from "../firebase-config";

export const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

const app = initializeApp(configured ? firebaseConfig : { apiKey: "none", projectId: "none", appId: "none" });
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

// Firebase only deletes an account after a recent sign-in, so confirm with Google first.
export async function confirmIdentity() {
  const user = auth.currentUser;
  if (!user) throw new Error("You are not signed in.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account", login_hint: user.email ?? "" });
  await reauthenticateWithPopup(user, provider);
}

export async function deleteAccount() {
  const user = auth.currentUser;
  if (!user) throw new Error("You are not signed in.");
  await deleteUser(user);
}
