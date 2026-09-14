/**
 * Thin wrapper over the Highbury API.
 *
 * credentials: "include" is what carries the session cookie. It works
 * because the API is on api.jeksys.net and the site is on jeksys.net, so
 * the cookie is same-site rather than third-party - browsers block the
 * third-party case by default and no amount of CORS config fixes it.
 */
// Served from localhost means a bench rig, so talk to wrangler dev rather
// than production. Anywhere else, production.
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
const API = LOCAL ? `http://${location.hostname}:8787` : "https://api.jeksys.net";

export async function call(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. Check your connection.");
  }

  let data = {};
  try { data = await res.json(); } catch { /* empty body is fine */ }

  if (!res.ok) {
    const err = new Error(messageFor(res, data));
    err.code = data.error;
    err.status = res.status;
    err.retryAfter = parseInt(res.headers.get("Retry-After") || "0", 10) || data.retry_after || 0;
    throw err;
  }
  return data;
}

function messageFor(res, data) {
  // A lockout needs to say how long, or the person just keeps trying and
  // extends it. Rounded up to whole minutes: nobody wants "try again in
  // 847 seconds".
  if (res.status === 429) {
    const secs = parseInt(res.headers.get("Retry-After") || "0", 10) || data.retry_after || 0;
    const mins = Math.ceil(secs / 60);
    return secs
      ? `Too many attempts. Please wait ${mins} minute${mins === 1 ? "" : "s"} and try again.`
      : "Too many attempts. Please wait a few minutes and try again.";
  }
  return MESSAGES[data.error] || "Something went wrong. Try again.";
}

const MESSAGES = {
  invalid_credentials: "That card code and password don't match.",
  unknown_card: "We don't recognise that card code.",
  already_claimed: "This card is already set up. Sign in instead.",
  password_too_short: "Please use at least 8 characters.",
  unauthorised: "Please sign in again.",
  too_many_attempts: "Too many attempts. Please wait a few minutes and try again.",
};

/** Formats a code as the customer reads it off the card. */
export function tidyCode(value) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (clean.length <= 2) return clean;
  if (clean.length <= 6) return `${clean.slice(0, 2)}-${clean.slice(2)}`;
  return `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6)}`;
}

export function whenText(unixSeconds) {
  const then = new Date(unixSeconds * 1000);
  const days = Math.floor((Date.now() - then.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
