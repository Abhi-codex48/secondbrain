// Your name, kept in this browser, used to greet you.
import { auth } from "./firebase";

const KEY = "sb-name";
const ASKED = "sb-name-asked";
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: not remembered */ } };

/** First name from the Google account, as a suggestion. */
export const googleFirstName = () => (auth.currentUser?.displayName ?? "").trim().split(/\s+/)[0] ?? "";
export const getName = () => (read(KEY) ?? "").trim();
export const setName = (name: string) => {
  write(KEY, name.trim().slice(0, 40));
  write(ASKED, "1");
  window.dispatchEvent(new Event("sb-name"));
};
/** True the first time on this browser, so the app can ask once. */
export const shouldAskName = () => !read(ASKED);
export const skipName = () => write(ASKED, "1");
export const initials = (name: string, email = "") => (name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
