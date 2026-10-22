import { app, BrowserWindow, Menu, Notification, Tray, ipcMain, nativeImage, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Data home ─────────────────────────────────────────────────────────────────
// Everything the app writes (config.json, data/, sessions) lives in the
// per-user Application Support folder — a packaged .app bundle is read-only,
// and the dev app must never touch a repo checkout's config/data.
const HOME = path.join(app.getPath("appData"), "myschoolapp-dashboard");
fs.mkdirSync(path.join(HOME, "data"), { recursive: true });
process.env.MSA_DASHBOARD_HOME = HOME;

// src modules read MSA_DASHBOARD_HOME at import time → import them only now.
const src = await import("../src/session.js");
const { fetchAll } = await import("../src/fetcher.js");
const { renderDashboard } = await import("../src/dashboard.js");
const { signIn } = await import("./signin.js");

app.setName("School Dashboard");

// ── Logging ───────────────────────────────────────────────────────────────────
// The packaged app has no terminal; mirror console output to data/app.log.
const LOG = path.join(HOME, "data", "app.log");
try {
  if (fs.existsSync(LOG) && fs.statSync(LOG).size > 1e6) {
    const tail = fs.readFileSync(LOG, "utf8").slice(-200e3);
    fs.writeFileSync(LOG, tail);
  }
} catch {}
for (const level of ["log", "warn", "error"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    orig(...args);
    const line = args.map((a) => (a instanceof Error ? a.stack : String(a))).join(" ");
    try { fs.appendFileSync(LOG, `${new Date().toISOString()} [${level}] ${line}\n`); } catch {}
  };
}

console.log(
  `started v${app.getVersion()} packaged=${app.isPackaged} home=${HOME} exe=${process.execPath}`
);

// ── State ─────────────────────────────────────────────────────────────────────
let tray = null;
let dashboardWin = null;
let wizardWin = null;
let refreshing = false;
let lastRefreshAt = null;
/** schoolId → human message, for schools whose session needs a manual sign-in */
const needsSignin = new Map();

function loadConfigOrNull() {
  try { return src.loadConfig(); } catch { return null; }
}

function dashboardFile() {
  return path.join(HOME, "data", "dashboard.html");
}

/**
 * Bring a window to the front. An LSUIElement (menu-bar) app never activates
 * on its own, so without stealing focus every window opens buried behind
 * whatever app is frontmost.
 */
function present(win) {
  win.show();
  win.focus();
  app.focus({ steal: true });
}

/** Mirror a window's renderer console + preload errors into app.log. */
function pipeConsole(win, tag) {
  win.webContents.on("console-message", (...args) => {
    // Electron is migrating this event from positional args to an event
    // object — take the message wherever it is.
    const msg = args.find((a) => typeof a === "string") ?? args[0]?.message ?? "";
    console.log(`[${tag}]`, msg);
  });
  win.webContents.on("preload-error", (_e, preloadPath, err) =>
    console.error(`[${tag}] preload failed:`, preloadPath, err)
  );
  win.webContents.on("did-fail-load", (_e, code, desc, url) =>
    console.error(`[${tag}] load failed ${code} ${desc} ${url}`)
  );
}

// ── Refresh ───────────────────────────────────────────────────────────────────
const SCHEDULE = [[6, 30], [12, 0], [16, 0], [20, 0]]; // same as the launchd agent

async function refresh(trigger = "manual") {
  const config = loadConfigOrNull();
  if (refreshing || !config) return;
  refreshing = true;
  updateTray();
  console.log(`refresh (${trigger}) starting`);
  try {
    const data = await fetchAll({
      // Daily session renewal through the app's own hidden BrowserWindow
      // instead of the CLI's Playwright flow.
      relogin: (school) => signIn(school, { loginEmail: config.loginEmail }),
    });
    // The CLI's error banners say "npm run login" — translate for app users.
    for (const e of data.errors ?? []) {
      e.message = e.message
        .replace(/Fix with: npm run login -- \S+/, "Fix it from the mortarboard 🎓 menu-bar icon: Sign In")
        .replace(/Run: npm run login -- \S+/, "Sign in from the mortarboard 🎓 menu-bar icon.");
    }
    const html = renderDashboard(data);
    src.writeData("dashboard.html", html);
    src.writeData("site/index.html", html); // parity with the CLI (tailnet sharing)
    lastRefreshAt = new Date();
    updateSigninNeeded(config, data);
    if (dashboardWin && !dashboardWin.isDestroyed()) {
      if (dashboardWin.webContents.getURL().startsWith("data:")) {
        dashboardWin.loadFile(dashboardFile());
      } else {
        dashboardWin.webContents.reload();
      }
    }
    console.log(`refresh (${trigger}) done: ${data.assignments.length} assignments`);
  } catch (err) {
    console.error("refresh failed:", err);
  } finally {
    refreshing = false;
    updateTray();
  }
}

function updateSigninNeeded(config, data) {
  const before = new Set(needsSignin.keys());
  needsSignin.clear();
  for (const e of data.errors ?? []) {
    if (/session|sign.?in|expired/i.test(e.message)) needsSignin.set(e.school, e.message);
  }
  for (const id of needsSignin.keys()) {
    if (before.has(id)) continue; // notify once, when a school first breaks
    const school = config.schools.find((s) => s.id === id);
    if (!Notification.isSupported()) continue;
    const n = new Notification({
      title: `${school?.name ?? id} needs a quick sign-in`,
      body: "The saved session expired and couldn't be renewed. Click to sign in.",
    });
    n.on("click", () => interactiveSignIn(school ?? { id, name: id }));
    n.show();
  }
}

function msUntilNextScheduled() {
  const now = new Date();
  let best = Infinity;
  for (const [h, m] of SCHEDULE) {
    const t = new Date(now);
    t.setHours(h, m, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    best = Math.min(best, t - now);
  }
  return best;
}

function scheduleNext() {
  setTimeout(async () => {
    await refresh("scheduled");
    scheduleNext();
  }, msUntilNextScheduled() + 1000);
}

// ── Digest ────────────────────────────────────────────────────────────────────
let digestTimer = null;

async function sendDigestNow(trigger = "manual") {
  try {
    const { sendDigest } = await import("../src/digest.js");
    await sendDigest();
    console.log(`digest sent (${trigger})`);
  } catch (err) {
    console.error("digest failed:", err);
    if (Notification.isSupported()) {
      new Notification({ title: "Digest didn't send", body: String(err.message) }).show();
    }
  }
}

/** Optional scheduled sends — config.digest.times, e.g. ["06:45","15:30"]. */
function scheduleDigest() {
  clearTimeout(digestTimer);
  const d = loadConfigOrNull()?.digest;
  const times = (d?.times ?? []).map((t) => String(t).match(/^(\d{1,2}):(\d{2})$/)).filter(Boolean);
  if (!d?.to?.length || !times.length) return;
  const now = new Date();
  let best = Infinity;
  for (const [, h, m] of times) {
    const t = new Date(now);
    t.setHours(+h, +m, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    best = Math.min(best, t - now);
  }
  digestTimer = setTimeout(async () => {
    await sendDigestNow("scheduled");
    scheduleDigest();
  }, best + 1000);
}

// ── Windows ───────────────────────────────────────────────────────────────────
function openDashboard() {
  if (dashboardWin && !dashboardWin.isDestroyed()) {
    present(dashboardWin);
    return;
  }
  dashboardWin = new BrowserWindow({
    width: 1020,
    height: 820,
    title: "Family School Dashboard",
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  // Teacher links etc. open in the real browser, not inside the app.
  dashboardWin.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  dashboardWin.webContents.on("will-navigate", (e, url) => {
    if (/^https?:/.test(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  dashboardWin.on("closed", () => { dashboardWin = null; });
  pipeConsole(dashboardWin, "dashboard");
  present(dashboardWin);
  if (fs.existsSync(dashboardFile())) {
    dashboardWin.loadFile(dashboardFile());
  } else {
    dashboardWin.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<body style="font:16px -apple-system;display:grid;place-items:center;height:95vh;color:#444">
             <div>Fetching your schools’ data — this page will load when it’s ready…</div></body>`
        )
    );
    refresh("first-open");
  }
}

function openWizard() {
  if (wizardWin && !wizardWin.isDestroyed()) {
    present(wizardWin);
    return;
  }
  wizardWin = new BrowserWindow({
    width: 600,
    height: 700,
    title: "School Dashboard Setup",
    webPreferences: {
      preload: path.join(__dirname, "wizard-preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  wizardWin.on("closed", () => { wizardWin = null; });
  pipeConsole(wizardWin, "wizard");
  console.log("opening setup wizard");
  wizardWin.loadFile(path.join(__dirname, "wizard.html"));
  present(wizardWin);
}

async function interactiveSignIn(school) {
  const config = loadConfigOrNull();
  const ok = await signIn(school, { headless: false, loginEmail: config?.loginEmail });
  if (ok) {
    needsSignin.delete(school.id);
    updateTray();
    refresh("after-signin");
  }
  return ok;
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function updateTray() {
  if (!tray) return;
  const config = loadConfigOrNull();
  const items = [];
  if (!config) {
    items.push({ label: "Set Up Schools…", click: openWizard });
  } else {
    items.push({ label: "Open Dashboard", click: openDashboard });
    items.push({
      label: refreshing ? "Refreshing…" : "Refresh Now",
      enabled: !refreshing,
      click: () => refresh("manual"),
    });
    items.push({ type: "separator" });
    items.push({
      label: lastRefreshAt
        ? `Updated ${lastRefreshAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
        : "Not refreshed yet this run",
      enabled: false,
    });
    for (const id of needsSignin.keys()) {
      const school = config.schools.find((s) => s.id === id) ?? { id, name: id };
      items.push({ label: `⚠️ Sign in to ${school.name}`, click: () => interactiveSignIn(school) });
    }
    if (config.digest?.to?.length) {
      items.push({
        label: config.digest.method === "email" ? "Email the Digest Now" : "Text Me the Digest Now",
        click: () => sendDigestNow("menu"),
      });
    }
    items.push({ type: "separator" });
    items.push({
      label: "Sign In",
      submenu: config.schools.map((s) => ({
        label: s.name,
        click: () => interactiveSignIn(s),
      })),
    });
    items.push({ label: "Set Up Schools…", click: openWizard });
  }
  items.push({
    label: "Start at Login",
    type: "checkbox",
    checked: app.getLoginItemSettings().openAtLogin,
    enabled: app.isPackaged, // in dev this would register the bare Electron binary
    click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
  });
  items.push({ type: "separator" });
  items.push({ label: "Quit School Dashboard", role: "quit" });
  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setTitle(needsSignin.size ? "⚠️" : "");
}

// ── Wizard IPC ────────────────────────────────────────────────────────────────
ipcMain.handle("wizard:getState", () => {
  const config = loadConfigOrNull();
  const sessions = {};
  for (const s of config?.schools ?? []) {
    sessions[s.id] = fs.existsSync(src.sessionPath(s.id));
  }
  return { config, sessions };
});

ipcMain.handle("wizard:saveConfig", (_ev, { schools, loginEmail, digest }) => {
  const cleaned = [];
  for (const s of schools) {
    const host = String(s.host || "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!host) continue;
    if (!host.endsWith(".myschoolapp.com")) {
      return { error: `"${host}" doesn't look like a *.myschoolapp.com address.` };
    }
    const id = host.split(".")[0];
    cleaned.push({ id, name: String(s.name || "").trim() || id, host });
  }
  if (!cleaned.length) return { error: "At least one school is required." };
  const existing = loadConfigOrNull();
  const config = {
    ...existing,
    schools: cleaned,
    daysBack: existing?.daysBack ?? 7,
    daysAhead: existing?.daysAhead ?? 14,
  };
  const email = String(loginEmail || "").trim();
  if (email) config.loginEmail = email;
  else delete config.loginEmail;

  const method = digest?.method;
  const to = String(digest?.to || "").split(",").map((s) => s.trim()).filter(Boolean);
  const times = String(digest?.times || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (method && to.length) {
    for (const t of times) {
      if (!/^\d{1,2}:\d{2}$/.test(t)) return { error: `"${t}" isn't a time like 15:30.` };
    }
    config.digest = { method, to, ...(times.length ? { times } : {}) };
  } else {
    delete config.digest;
  }

  fs.writeFileSync(path.join(HOME, "config.json"), JSON.stringify(config, null, 2) + "\n");
  updateTray();
  scheduleDigest();
  return { ok: true, config };
});

ipcMain.handle("wizard:signIn", async (_ev, schoolId) => {
  const config = loadConfigOrNull();
  const school = config?.schools.find((s) => s.id === schoolId);
  if (!school) return { error: "Unknown school" };
  const ok = await signIn(school, { headless: false, loginEmail: config.loginEmail });
  if (ok) needsSignin.delete(school.id);
  updateTray();
  return { ok };
});

ipcMain.handle("wizard:finish", async () => {
  if (wizardWin && !wizardWin.isDestroyed()) wizardWin.close();
  openDashboard();
  refresh("wizard");
  return { ok: true };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    console.log("second launch — fronting the existing instance");
    if (loadConfigOrNull()) openDashboard();
    else openWizard();
  });
  app.on("window-all-closed", () => {}); // menu-bar app: stay alive
  // Never `await app.whenReady()` at top level in an ESM main process:
  // Electron doesn't emit "ready" until this module finishes evaluating,
  // so awaiting it here deadlocks the app before any UI appears.
  app.whenReady().then(() => {
    if (process.platform === "darwin") app.dock?.hide();
    // The "Template" filename suffix makes macOS recolor the icon to match
    // the menu bar in light/dark mode.
    tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "assets", "trayTemplate.png")));
    tray.setToolTip("School Dashboard");
    updateTray();
    scheduleNext();
    scheduleDigest();
    console.log("ready: tray up");

    const config = loadConfigOrNull();
    if (!config) {
      openWizard();
    } else {
      // Refresh at launch when there's no data yet or it's gone stale.
      const data = src.readData("normalized.json");
      const age = data?.fetchedAt ? Date.now() - new Date(data.fetchedAt) : Infinity;
      if (age > 3 * 3600e3) refresh("launch");
      // When the user opens the app themself, show the dashboard — a
      // menu-bar app that launches with no window at all looks broken.
      if (!app.getLoginItemSettings().wasOpenedAtLogin) openDashboard();
    }
  });
}
