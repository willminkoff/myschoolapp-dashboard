import fs from "node:fs";
import { SESSIONS_DIR, loadConfig, sessionPath } from "./session.js";

/**
 * Headless session renewal. The school's auth cookie dies daily, but the
 * persistent browser profile still holds the Google session — so we load the
 * portal, click "Sign in with Google", let Google's existing session carry
 * the SSO through (no credentials are ever typed), and save fresh cookies.
 * Returns true on success.
 */
export async function reloginHeadless(school, { headless = true } = {}) {
  let ctx;
  try {
    const { launchProfile } = await import("./browser.js");
    ctx = await launchProfile({ headless });
  } catch {
    return false;
  }
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto(`https://${school.host}/app`, {
      waitUntil: "domcontentloaded",
    });

    const signedIn = async () => {
      try {
        return await page.evaluate(async (host) => {
          if (!location.host.endsWith(host)) return false;
          const r = await fetch("/api/webapp/context", {
            headers: { accept: "application/json" },
          });
          if (!r.ok) return false;
          const ctx = await r.json().catch(() => ({}));
          const ui = ctx.UserInfo || ctx.MasterUserInfo || {};
          return Boolean(ui.UserId ?? ui.Id ?? ctx.UserId);
        }, school.host);
      } catch {
        return false; // mid-navigation
      }
    };

    const email = loadConfig().loginEmail;
    const deadline = Date.now() + 90 * 1000;
    let submittedEmail = false;
    while (Date.now() < deadline) {
      await page.waitForTimeout(2000);
      if (await signedIn()) {
        const state = await ctx.storageState();
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
        fs.writeFileSync(sessionPath(school.id), JSON.stringify(state, null, 2));
        return true;
      }
      const url = page.url();
      if (url.includes(school.host)) {
        // Email-first login screen: enter the login email (never a
        // password — Google SSO continues from the existing session),
        // tick "Remember me", and continue.
        const emailBox = page.locator('input[type="email"], input[type="text"]').first();
        if (
          !submittedEmail &&
          email &&
          (await emailBox.isVisible().catch(() => false))
        ) {
          await emailBox.fill(email).catch(() => {});
          const remember = page
            .locator('input[type="checkbox"]')
            .first();
          if (await remember.isVisible().catch(() => false)) {
            await remember.check().catch(() => {});
          }
          await page
            .locator('button:has-text("Next"), input[value="Next"]')
            .first()
            .click()
            .catch(() => {});
          submittedEmail = true;
          continue;
        }
        // Some flows then show an explicit Google button.
        const sso = page
          .locator('a:has-text("Google"), button:has-text("Google")')
          .first();
        if (await sso.isVisible().catch(() => false)) {
          await sso.click().catch(() => {});
        }
      } else if (url.includes("accounts.google.com")) {
        // Account chooser: pick the already-signed-in account.
        const acct = email
          ? page.locator(`[data-email="${email}"], li:has-text("${email}")`).first()
          : page.locator("[data-email]").first();
        if (await acct.isVisible().catch(() => false)) {
          await acct.click().catch(() => {});
        }
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    await ctx.close().catch(() => {});
  }
}
