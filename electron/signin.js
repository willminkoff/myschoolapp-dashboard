import { app, BrowserWindow, session as electronSession } from "electron";
import fs from "node:fs";

/**
 * Sign-in for the menu-bar app, replacing the CLI's Playwright flows
 * (src/login.js and src/relogin.js) with Electron's own BrowserWindow —
 * one bundled runtime, no Chrome/Chromium download.
 *
 * All sign-ins share one persistent session partition, which plays the role
 * of the CLI's data/browser-profile: it keeps the family's Google/SSO
 * session so the daily headless renewal can click straight through.
 * Captured cookies are saved in Playwright storageState shape so
 * src/session.js and the provider work unchanged.
 */
const PARTITION = "persist:msa-signin";

// Google blocks sign-in from embedded Chromium ("This browser or app may not
// be secure"): a Chrome-branded UA that doesn't fingerprint like real Chrome
// fails its checks. A Firefox UA skips the Chrome-specific checks entirely —
// the long-standing workaround for OAuth inside Electron. Blackbaud's portal
// is browser-agnostic, so the whole partition can wear it.
const FIREFOX_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:143.0) Gecko/20100101 Firefox/143.0";

let hintsStripped = false;
function signinSession() {
  const ses = electronSession.fromPartition(PARTITION);
  ses.setUserAgent(FIREFOX_UA);
  if (!hintsStripped) {
    hintsStripped = true;
    // Chromium still sends Sec-CH-UA client hints branding us as Chromium,
    // contradicting the Firefox UA — real Firefox sends none, so drop them.
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      for (const h of Object.keys(details.requestHeaders)) {
        if (/^sec-ch-ua/i.test(h)) delete details.requestHeaders[h];
      }
      callback({ requestHeaders: details.requestHeaders });
    });
  }
  return ses;
}

/** Map Electron cookies to a Playwright-style storageState object. */
async function captureState(ses) {
  const cookies = await ses.cookies.get({});
  return {
    cookies: cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expirationDate ?? -1,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite:
        { no_restriction: "None", lax: "Lax", strict: "Strict" }[c.sameSite] ?? "Lax",
    })),
    origins: [],
  };
}

/** True once /api/webapp/context answers with a signed-in user id. */
async function isSignedIn(win, host) {
  try {
    return await win.webContents.executeJavaScript(
      `(async () => {
        if (!location.host.endsWith(${JSON.stringify(host)})) return false;
        const r = await fetch("/api/webapp/context", { headers: { accept: "application/json" } });
        if (!r.ok) return false;
        if (!(r.headers.get("content-type") || "").includes("json")) return false;
        // Anonymous visitors also get a 200 JSON context — only a real
        // signed-in session includes the user's id.
        const ctx = await r.json();
        const ui = ctx.UserInfo || ctx.MasterUserInfo || {};
        return Boolean(ui.UserId ?? ui.Id ?? ctx.UserId);
      })()`,
      true
    );
  } catch {
    return false; // mid-navigation
  }
}

/**
 * One automation tick for headless renewal — the DOM port of relogin.js:
 * on the school's email-first screen fill the login email (never a
 * password), tick "Remember me" and continue; click a Google SSO button if
 * shown; on Google's account chooser pick the already-signed-in account.
 */
async function autoAdvance(win, { host, email, submittedEmail }) {
  try {
    return await win.webContents.executeJavaScript(
      `(() => {
        const email = ${JSON.stringify(email || "")};
        const visible = (el) => !!el && el.offsetParent !== null;
        const q = (sel) => [...document.querySelectorAll(sel)].filter(visible);
        if (location.host.endsWith(${JSON.stringify(host)})) {
          const box = q('input[type="email"], input[type="text"]')[0];
          if (${!submittedEmail} && email && box) {
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
            set.call(box, email);
            box.dispatchEvent(new Event("input", { bubbles: true }));
            box.dispatchEvent(new Event("change", { bubbles: true }));
            const remember = q('input[type="checkbox"]')[0];
            if (remember && !remember.checked) remember.click();
            const next = q('button, input[type="submit"], input[type="button"]')
              .find((b) => /next/i.test(b.textContent || b.value || ""));
            if (next) next.click();
            return "email";
          }
          const sso = q("a, button").find((el) => /google/i.test(el.textContent || ""));
          if (sso) { sso.click(); return "google"; }
        } else if (location.host.includes("accounts.google.com")) {
          const acct =
            q("[data-email]").find((el) => !email || el.dataset.email === email) ||
            (email && q("li").find((li) => li.textContent.includes(email)));
          if (acct) { acct.click(); return "account"; }
        }
        return null;
      })()`,
      true
    );
  } catch {
    return null; // mid-navigation
  }
}

/**
 * Sign in to one school. Interactive (headless: false): a visible window
 * where the parent types their credentials and MFA themselves — never seen
 * or stored, only the session cookies are kept. Headless (default): silent
 * renewal that rides the Google session kept in the partition.
 * Resolves true when cookies were saved.
 */
export async function signIn(school, { headless = true, loginEmail = "", timeoutMs } = {}) {
  const { SESSIONS_DIR, sessionPath } = await import("../src/session.js");
  const ses = signinSession();
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    show: !headless,
    title: `Sign in to ${school.name}`,
    webPreferences: {
      partition: PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  let closedByUser = false;
  win.on("closed", () => { closedByUser = true; });
  if (!headless) {
    // A menu-bar (LSUIElement) app never activates on its own — without a
    // focus steal the sign-in window opens buried behind other apps.
    win.show();
    win.focus();
    app.focus({ steal: true });
  }

  try {
    await win.loadURL(`https://${school.host}/app`).catch(() => {});
    const deadline = Date.now() + (timeoutMs ?? (headless ? 90e3 : 5 * 60e3));
    let submittedEmail = false;
    while (Date.now() < deadline && !closedByUser && !win.isDestroyed()) {
      await new Promise((r) => setTimeout(r, 2000));
      if (closedByUser || win.isDestroyed()) break;
      if (await isSignedIn(win, school.host)) {
        const state = await captureState(ses);
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
        fs.writeFileSync(sessionPath(school.id), JSON.stringify(state, null, 2));
        return true;
      }
      if (headless) {
        const did = await autoAdvance(win, { host: school.host, email: loginEmail, submittedEmail });
        if (did === "email") submittedEmail = true;
      }
    }
    return false;
  } catch (err) {
    console.error(`sign-in ${school.id} failed: ${err.message}`);
    return false;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
