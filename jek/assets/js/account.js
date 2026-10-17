/* ==========================================================================
   JEK Systems — your account, on every page
   One account for the site and JEKray. Sign-in is the API's (api.jeksys.net):
   a page sends the person to /auth/<provider>/start with itself as the place to
   come back to, the provider sends them back with ?jekauth=<outcome>, and the
   session lives in a cookie on the API's host that no page here ever sees.

   On every page this puts Sign in, or the person's picture and name, beside
   Cart in the masthead, both leading to /jek/account.html. Who is signed in is
   asked of the API once a page (GET /v1/me, credentialed) and kept for the
   visit in sessionStorage, so the masthead does not flicker between pages.

   window.JEKAccount: { me() -> Promise<me | null>, signIn(provider, back, link),
   signOut(), api(path, opts), avatarNode(user, size), API_BASE } for the account
   page and the cart, which fills in a signed-in person's name and email.
   ========================================================================== */

(function (window, document) {
  "use strict";

  var API_BASE = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) ? "http://localhost:8787" : "https://api.jeksys.net";
  var KEY = "JEK_ME";                                   // sessionStorage: { name, avatar } or "out"
  var ACCOUNT_PAGE = "/jek/account.html";
  var OUTCOMES = {
    signed_in: "Signed in.", linked: "That sign-in is now linked to your account.", cancelled: "Sign-in cancelled.",
    expired: "That sign-in took too long or was opened in another browser. Please try again.",
    failed: "Sign-in did not work. Please try again.", taken: "That sign-in already belongs to another account.",
    signed_out: "Please sign in first.", unavailable: "That way of signing in is not available yet. Please use another."
  };

  /* ------------------------------------------------------------------ API */

  function api(path, opts) {
    opts = opts || {};
    var init = { credentials: "include", method: opts.method || "GET", headers: { Accept: "application/json" } };
    if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers["Content-Type"] = "application/json"; }
    return window.fetch(API_BASE + path, init).then(function (res) {
      return (res.status === 204 ? Promise.resolve(null) : res.json().catch(function () { return null; })).then(function (body) {
        if (!res.ok) {
          var e = new Error((body && body.error && body.error.message) || "The service is unavailable.");
          e.status = res.status; e.code = body && body.error ? body.error.code : undefined;
          throw e;
        }
        return body;
      });
    });
  }

  var mePromise = null, status = "unknown";            // "in", "out", or "unknown" (the service not reached)
  /** who is signed in: their /v1/me, or null; asked once a page (fresh: ask again) */
  function me(fresh) {
    if (!mePromise || fresh) {
      mePromise = api("/v1/me").then(function (m) { status = "in"; remember(m); return m; }, function (e) {
        if (e.status === 401) { status = "out"; remember(null); return null; }
        status = "unknown";
        // the service unreachable: say nothing either way, and keep what the visit knew
        return null;
      });
    }
    return mePromise;
  }
  function remember(m) {
    try {
      if (m && m.user) window.sessionStorage.setItem(KEY, JSON.stringify({ name: m.user.name || "", avatar: m.user.avatar || null }));
      else window.sessionStorage.setItem(KEY, "out");
    } catch (e) { /* this page only */ }
  }
  function remembered() {
    try { var v = window.sessionStorage.getItem(KEY); return v === "out" ? null : v ? JSON.parse(v) : undefined; } catch (e) { return undefined; }
  }

  /** to the provider and back to back (a page of this site), or to this page */
  function signIn(provider, back, link) {
    var ret = new URL(back || window.location.href, window.location.href);
    ret.hash = ""; ret.searchParams.delete("jekauth");
    var q = new URLSearchParams({ return: ret.toString() });
    if (link) q.set("link", "1");
    window.location.href = API_BASE + "/auth/" + provider + "/start?" + q.toString();
  }
  function signOut() {
    return api("/auth/signout", { method: "POST" }).catch(function () { /* already out */ }).then(function () {
      status = "out"; remember(null); mePromise = Promise.resolve(null); render(null);
    });
  }

  /* ------------------------------------------------------------ the masthead */

  function initials(name) {
    var w = String(name || "?").split(/\s+/).filter(function (x) { return /^\p{L}/u.test(x); }).map(function (x) { return x[0]; });
    return (w.slice(0, 2).join("") || String(name || "?")[0]).toUpperCase();
  }
  /** a person's round picture, or their initials when they have none */
  function avatarNode(u, size) {
    var n = document.createElement("span");
    n.className = "acct-avatar" + (size ? " " + size : "");
    n.setAttribute("aria-hidden", "true");
    if (u && u.avatar) { var img = document.createElement("img"); img.src = API_BASE + u.avatar; img.alt = ""; img.decoding = "async"; n.appendChild(img); }
    else n.textContent = initials(u && u.name);
    return n;
  }
  var firstName = function (name) { return String(name || "").trim().split(/\s+/)[0] || "Account"; };

  /** the masthead's right-hand group: the account link, then Cart */
  function slot() {
    var bar = document.querySelector(".top-container .bar6");
    if (!bar) return null;
    var right = bar.querySelector(".nav-right");
    if (!right) {
      right = document.createElement("span");
      right.className = "nav-right";
      var cart = bar.querySelector(".nav-cart");
      bar.appendChild(right);
      if (cart) right.appendChild(cart);
    }
    var a = right.querySelector(".nav-acct");
    if (!a) {
      a = document.createElement("a");
      a.className = "nav-acct";
      right.insertBefore(a, right.firstChild);
    }
    return a;
  }
  /** u: { name, avatar } signed in; null signed out; undefined not known yet */
  function render(u) {
    var a = slot();
    if (!a) return;
    a.textContent = "";
    if (u === undefined) { a.hidden = true; return; }
    a.hidden = false;
    if (u) {
      a.href = ACCOUNT_PAGE;
      a.appendChild(avatarNode(u, "sm"));
      a.appendChild(document.createTextNode(firstName(u.name)));
      a.title = "Your account: " + (u.name || "");
      a.setAttribute("aria-label", "Your account, signed in as " + (u.name || "you"));
    } else {
      a.href = ACCOUNT_PAGE + "?back=" + encodeURIComponent(window.location.pathname + window.location.search);
      a.appendChild(document.createTextNode("Sign in"));
      a.title = "Sign in to your JEK Systems account";
      a.removeAttribute("aria-label");
    }
  }

  /* ----------------------------------------------- back from signing in */

  /** ?jekauth=<outcome>: say how it went, and take it out of the address */
  function outcome() {
    var u = new URL(window.location.href), o = u.searchParams.get("jekauth");
    if (!o) return;
    u.searchParams.delete("jekauth");
    try { window.history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); } catch (e) { /* stays */ }
    var msg = OUTCOMES[o] || "";
    if (!msg) return;
    var n = document.createElement("div");
    n.className = "acct-toast" + (o === "signed_in" || o === "linked" ? "" : " warn");
    n.setAttribute("role", "status");
    n.textContent = msg;
    document.body.appendChild(n);
    window.setTimeout(function () { n.classList.add("gone"); }, 4200);
    window.setTimeout(function () { n.remove(); }, 5000);
  }

  function start() {
    var known = remembered();
    var fresh = new URL(window.location.href).searchParams.has("jekauth");
    outcome();
    render(fresh ? undefined : known);
    me(fresh).then(function (m) {
      if (m && m.user) render({ name: m.user.name, avatar: m.user.avatar });
      else if (status === "out") render(null);
      // the service not reached: what the visit last knew, else Sign in (the account page says if it is down)
      else render(remembered() || null);
    });
  }

  window.JEKAccount = { me: me, signIn: signIn, signOut: signOut, api: api, avatarNode: avatarNode, API_BASE: API_BASE, ACCOUNT_PAGE: ACCOUNT_PAGE, render: render, status: function () { return status; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})(window, document);
