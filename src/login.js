import fs from "node:fs";
import path from "node:path";
import { SESSIONS_DIR, sessionPath } from "./session.js";

/**
 * Opens a real (headful) browser at the school's sign-in page. YOU type your
 * credentials (and MFA) yourself — this script never sees or stores them.
 * Once the portal is loaded and /api/webapp/context answers, it saves the
 * session cookies to data/sessions/<schoolId>.json and closes.
 */
export async function login(school) {
  let ctx;
  try {
    const { launchProfile } = await import("./browser.js");
    ctx = await launchProfile({ headless: false });
  } catch {
    console.error(
      "Playwright is not installed. Run:\n  npm install\n  npx playwright install chromium"
    );
    process.exit(1);
  }
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  console.log(`\nOpening https://${school.host}/app — sign in as yourself (parent).`);
  console.log("If offered, check “Keep me signed in / Remember me” so the session lasts longer.\n");
  await page.goto(`https://${school.host}/app`, { waitUntil: "domcontentloaded" });

  // Poll until the internal API answers with JSON — that means we're signed in.
  const deadline = Date.now() + 5 * 60 * 1000;
  let ok = false;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
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

  if (!ok) {
    console.error("Timed out after 5 minutes without a signed-in session. Nothing saved.");
    await ctx.close();
    process.exit(1);
  }

  const state = await ctx.storageState();
  const p = sessionPath(school.id);
  fs.writeFileSync(p, JSON.stringify(state, null, 2));
  await ctx.close();
  console.log(`✅ Signed in. Session cookies saved to ${path.relative(process.cwd(), p)}`);
  console.log(`   (Cookies only — no username or password is stored.)`);
}
