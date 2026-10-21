import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { DATA_DIR, loadSession } from "./session.js";

/**
 * Loads the signed-in portal (reusing the persistent login profile) and
 * records every JSON API response the web app makes, so we can see the real
 * endpoints and shapes this school uses. Writes data/probe-<id>/net/*.json.
 */
const [, , schoolId, host] = process.argv;
if (!schoolId || !host) {
  console.error("usage: node src/discover.js <schoolId> <host>");
  process.exit(1);
}

const outDir = path.join(DATA_DIR, `probe-${schoolId}`, "net");
fs.mkdirSync(outDir, { recursive: true });

const ctx = await chromium.launchPersistentContext(
  path.join(DATA_DIR, "browser-profile"),
  {
    headless: true,
    channel: "chrome",
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  }
);
const page = ctx.pages()[0] ?? (await ctx.newPage());

// The portal's auth cookie is a session cookie, gone after the login browser
// closed — re-inject the ones captured at login time.
const saved = loadSession(schoolId);
if (saved?.cookies?.length) await ctx.addCookies(saved.cookies);

const seen = [];
page.on("response", async (res) => {
  const url = res.url();
  if (!url.includes(`${host}/api/`)) return;
  const ct = res.headers()["content-type"] || "";
  if (!ct.includes("json")) return;
  const rel = url.split(`${host}`)[1];
  const name =
    rel.replace(/^\/api\//, "").replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 120) +
    ".json";
  try {
    const body = await res.text();
    fs.writeFileSync(path.join(outDir, name), body);
    seen.push(`${res.status()} ${rel}`);
  } catch {}
});

const shot = async (name) =>
  fs.writeFileSync(path.join(outDir, `_${name}.png`), await page.screenshot());

await page.goto(`https://${host}/app`, { waitUntil: "domcontentloaded" });
// Give the SPA time to bootstrap and load the default (parent) view.
await page.waitForTimeout(12000);

// Dismiss the "Welcome / guided tours" modal if present.
const closeBtn = page.locator(".modal button.close, .modal .close").first();
if (await closeBtn.isVisible().catch(() => false)) {
  await closeBtn.click().catch(() => {});
  await page.waitForTimeout(1500);
}
await shot("home");
console.log("home url:", page.url());

// Click the child's tab (first name passed as argv[4]), then try to open
// an assignments view from whatever navigation appears.
const childName = process.argv[4];
if (childName) {
  const tab = page.locator(`a:has-text("${childName}"), li:has-text("${childName}") a`).first();
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(8000);
    await shot("child");
    console.log("child url:", page.url());
    for (const label of ["Assignment Center", "Assignments", "Progress", "Classes"]) {
      const link = page.locator(`a:has-text("${label}")`).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click().catch(() => {});
        await page.waitForTimeout(8000);
        await shot(label.toLowerCase().replace(/\s+/g, "-"));
        console.log(`${label} url:`, page.url());
      }
    }
  } else {
    console.log(`child tab "${childName}" not found`);
  }
}
await ctx.close();

console.log(`Captured ${seen.length} API responses → ${outDir}`);
for (const s of seen) console.log("  " + s);
