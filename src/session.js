import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The Electron app points MSA_DASHBOARD_HOME at its own per-user folder
// (~/Library/Application Support/…) so a packaged app never writes inside
// its read-only bundle. The CLI leaves it unset and keeps using the repo.
const root =
  process.env.MSA_DASHBOARD_HOME ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(root, "data");
export const SESSIONS_DIR = path.join(DATA_DIR, "sessions");

export function loadConfig() {
  const p = path.join(root, "config.json");
  if (!fs.existsSync(p)) {
    throw new Error(
      "config.json not found. Copy config.example.json to config.json and fill in your schools' myschoolapp hosts."
    );
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function sessionPath(schoolId) {
  return path.join(SESSIONS_DIR, `${schoolId}.json`);
}

/**
 * Sessions are Playwright storageState files: { cookies: [...], origins: [...] }.
 * Only cookies are stored — never usernames or passwords.
 */
export function loadSession(schoolId) {
  const p = sessionPath(schoolId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/** Build a Cookie header for the given host from a storageState object. */
export function cookieHeaderFor(session, host) {
  const now = Date.now() / 1000;
  return (session.cookies || [])
    .filter((c) => {
      const domain = (c.domain || "").replace(/^\./, "");
      const match = host === domain || host.endsWith("." + domain);
      const alive = !c.expires || c.expires === -1 || c.expires > now;
      return match && alive;
    })
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

export function writeData(relPath, obj) {
  const p = path.join(DATA_DIR, relPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
  return p;
}

export function readData(relPath) {
  const p = path.join(DATA_DIR, relPath);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export { root as PROJECT_ROOT };
