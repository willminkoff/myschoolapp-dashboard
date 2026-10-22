import path from "node:path";
import { DATA_DIR } from "./session.js";

/**
 * Launch the persistent automation browser profile. Prefers installed Google
 * Chrome (Google refuses sign-in in anything that isn't a real browser);
 * falls back to Playwright's bundled Chromium when Chrome isn't installed.
 * Works with the full `playwright` package (CLI) or the browser-less
 * `playwright-core` shipped inside the Mac app.
 */
export async function launchProfile({ headless = false } = {}) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    ({ chromium } = await import("playwright-core"));
  }
  const opts = {
    headless,
    viewport: null,
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  };
  const profileDir = path.join(DATA_DIR, "browser-profile");
  try {
    return await chromium.launchPersistentContext(profileDir, {
      ...opts,
      channel: "chrome",
    });
  } catch {
    return await chromium.launchPersistentContext(profileDir, opts);
  }
}
