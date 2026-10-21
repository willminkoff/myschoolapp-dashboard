import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { PROJECT_ROOT } from "./session.js";

/** Interactive first-run setup: writes config.json. */
export async function init() {
  const configPath = path.join(PROJECT_ROOT, "config.json");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (fs.existsSync(configPath)) {
      const over = await rl.question("config.json already exists — overwrite? (y/N) ");
      if (!/^y/i.test(over.trim())) return console.log("Keeping existing config.");
    }
    console.log(
      "\nFor each school, enter the myschoolapp web address you use to check grades,\n" +
        "e.g. stmarks.myschoolapp.com (just press Enter on an empty line when done).\n"
    );
    const schools = [];
    for (;;) {
      const hostRaw = (await rl.question(`School ${schools.length + 1} address: `)).trim();
      if (!hostRaw) {
        if (schools.length) break;
        console.log("At least one school is required.");
        continue;
      }
      const host = hostRaw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      if (!host.endsWith(".myschoolapp.com")) {
        console.log("That doesn't look like a *.myschoolapp.com address — try again.");
        continue;
      }
      const defaultId = host.split(".")[0];
      const name =
        (await rl.question(`Display name for ${host} (e.g. "St. Mark's"): `)).trim() ||
        defaultId;
      schools.push({ id: defaultId, name, host });
    }
    const loginEmail = (
      await rl.question(
        "\nLogin email for the portals (used to pre-fill the sign-in form;\n" +
          "leave blank if you don't sign in with Google/SSO): "
      )
    ).trim();

    const config = { schools, daysBack: 7, daysAhead: 14 };
    if (loginEmail) config.loginEmail = loginEmail;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    console.log(`\n✅ Wrote config.json with ${schools.length} school(s). Next:`);
    for (const s of schools) console.log(`   npm run login -- ${s.id}`);
    console.log("   npm run all   # then open data/dashboard.html");
  } finally {
    rl.close();
  }
}
