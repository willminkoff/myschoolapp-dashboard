import path from "node:path";
import { DATA_DIR } from "./session.js";

/**
 * Launch the persistent automation browser profile. Prefers installed Google
 * Chrome (Google SSO is friendliest there); falls back to Playwright's
 * bundled Chromium when Chrome isn't installed.
 */
export async function launchProfile({ headless = false } = {}) {
  const { chromium } = await import("playwright");
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
