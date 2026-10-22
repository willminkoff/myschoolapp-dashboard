import fs from "node:fs";
import path from "node:path";
import { SESSIONS_DIR, sessionPath } from "./session.js";

/**
 * Opens a real (headful) browser at the school's sign-in page. YOU type your
 * credentials (and MFA) yourself — this never sees or stores them. Once the
 * portal is loaded and /api/webapp/context answers, it saves the session
 * cookies to data/sessions/<schoolId>.json and closes. Returns true when the
 * cookies were saved; used by both the CLI wrapper below and the Mac app.
 */
export async function interactiveLogin(school, { log = console.log, timeoutMs = 5 * 60e3 } = {}) {
  const { launchProfile } = await import("./browser.js");
  const ctx = await launchProfile({ headless: false });
  let closed = false;
  ctx.on("close", () => { closed = true; });
  try {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const page = ctx.pages()[0] ?? (await ctx.newPage());

    log(`Opening https://${school.host}/app — sign in as yourself (parent).`);
    log("If offered, check “Keep me signed in / Remember me” so the session lasts longer.");
    await page.goto(`https://${school.host}/app`, { waitUntil: "domcontentloaded" });

    // Poll until the internal API answers with JSON — that means we're signed in.
    const deadline = Date.now() + timeoutMs;
    let ok = false;
    while (Date.now() < deadline && !closed) {
      await new Promise((r) => setTimeout(r, 2000));
      if (closed) break;
      try {
        ok = await page.evaluate(async () => {
          const r = await fetch("/api/webapp/context", {
            headers: { accept: "application/json" },
          });
          if (!r.ok) return false;
          const ct = r.headers.get("content-type") || "";
          if (!ct.includes("json")) return false;
          // Anonymous visitors also get a 200 JSON context — only a real
          // signed-in session includes the user's id.
          const ctx = await r.json();
          const ui = ctx.UserInfo || ctx.MasterUserInfo || {};
          return Boolean(ui.UserId ?? ui.Id ?? ctx.UserId);
        });
      } catch {
        ok = false; // mid-navigation (e.g., on the Blackbaud ID page)
      }
      if (ok) break;
    }
    if (!ok) return false;

    const state = await ctx.storageState();
    fs.writeFileSync(sessionPath(school.id), JSON.stringify(state, null, 2));
    return true;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** CLI wrapper: `npm run login -- <schoolId>`. */
export async function login(school) {
  let ok;
  try {
    ok = await interactiveLogin(school);
  } catch {
    console.error(
      "Playwright is not installed. Run:\n  npm install\n  npx playwright install chromium"
    );
    process.exit(1);
  }
  if (!ok) {
    console.error("Timed out after 5 minutes without a signed-in session. Nothing saved.");
    process.exit(1);
  }
  const p = sessionPath(school.id);
  console.log(`✅ Signed in. Session cookies saved to ${path.relative(process.cwd(), p)}`);
  console.log(`   (Cookies only — no username or password is stored.)`);
}
