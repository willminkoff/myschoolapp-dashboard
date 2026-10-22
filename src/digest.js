import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig, readData } from "./session.js";

const run = promisify(execFile);

/**
 * Digest: strictly what's due today and tomorrow, per kid, sent as a text
 * (iMessage) or email through the Mac's own Messages/Mail apps — no SMTP
 * accounts or API keys, and nothing leaves the machine except the message
 * itself. macOS asks once to allow controlling Messages/Mail. Sent on
 * demand from the app's menu, and optionally on a schedule.
 *
 * config.json:
 *   "digest": {
 *     "method": "imessage" | "email",
 *     "to": ["+16155551234", "spouse@example.com"],
 *     "times": ["06:45", "15:30"]       // optional; empty = manual only
 *   }
 */

const dayMs = 86400e3;

function startOfDay(d) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t.getTime();
}

function short(s, max = 48) {
  s = String(s ?? "").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function item(a) {
  return a.className ? `${short(a.title)} (${short(a.className, 24)})` : short(a.title);
}

/**
 * iMessage needs a handle that matches an account: "6153945567" silently
 * goes nowhere, "+16153945567" delivers. Emails pass through untouched.
 */
function normalizeHandle(h) {
  h = String(h).trim();
  if (h.includes("@")) return h;
  const digits = h.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (/^1\d{10}$/.test(digits)) return "+" + digits;
  if (/^\d{10}$/.test(digits)) return "+1" + digits;
  return h;
}

/**
 * Build the digest as plain text (iMessage-friendly): nothing but what's
 * due today and tomorrow, per kid.
 */
export function buildDigest(data, { now = new Date() } = {}) {
  const today = startOfDay(now);
  const lines = [
    `📚 What's Due — ${now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}`,
  ];

  for (const s of data.students ?? []) {
    const pending = (data.assignments ?? []).filter(
      (a) =>
        a.studentId === s.id &&
        a.school === s.school &&
        !["completed", "graded"].includes(a.status) &&
        a.dateDue
    );
    const due = (a) => startOfDay(new Date(a.dateDue));
    const dueToday = pending.filter((a) => due(a) === today);
    const dueTomorrow = pending.filter((a) => due(a) === today + dayMs);

    const firstName = s.name.split(" ")[0];
    lines.push("", `${firstName}`);
    if (!dueToday.length && !dueTomorrow.length) {
      lines.push("  ✅ Nothing due today or tomorrow");
      continue;
    }
    if (dueToday.length) lines.push(`  📅 Today: ${dueToday.map(item).join("; ")}`);
    if (dueTomorrow.length) lines.push(`  ▸ Tomorrow: ${dueTomorrow.map(item).join("; ")}`);
  }
  return lines.join("\n");
}

async function sendIMessage(text, to) {
  await run("osascript", [
    "-e",
    `on run argv
      tell application "Messages"
        send (item 1 of argv) to participant (item 2 of argv) of (1st account whose service type = iMessage)
      end tell
    end run`,
    text,
    to,
  ]);
}

async function sendMail(subject, body, recipients) {
  await run("osascript", [
    "-e",
    `on run argv
      tell application "Mail"
        set m to make new outgoing message with properties {subject:item 1 of argv, content:item 2 of argv, visible:false}
        repeat with i from 3 to count of argv
          tell m to make new to recipient with properties {address:item i of argv}
        end repeat
        send m
      end tell
    end run`,
    subject,
    body,
    ...recipients,
  ]);
}

/** Build and send today's digest. `dry: true` prints instead of sending. */
export async function sendDigest({ dry = false } = {}) {
  const data = readData("normalized.json");
  if (!data) throw new Error("No data yet — run a fetch first.");
  const config = loadConfig();
  const d = config.digest;
  const text = buildDigest(data);
  if (dry) {
    console.log(text);
    return text;
  }
  if (!d?.method || !d?.to?.length) {
    throw new Error('No "digest" section in config.json — see README (Morning digest).');
  }
  if (d.method === "imessage") {
    for (const to of d.to) await sendIMessage(text, normalizeHandle(to));
  } else if (d.method === "email") {
    await sendMail(`What's Due — ${new Date().toLocaleDateString()}`, text, d.to.map(normalizeHandle));
  } else {
    throw new Error(`Unknown digest method "${d.method}" (use "imessage" or "email").`);
  }
  console.log(`digest sent via ${d.method} to ${d.to.join(", ")}`);
  return text;
}
