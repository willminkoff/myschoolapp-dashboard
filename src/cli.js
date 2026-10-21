#!/usr/bin/env node
import { loadConfig, readData, writeData } from "./session.js";
import { renderDashboard } from "./dashboard.js";

const [, , cmd, arg] = process.argv;

function schoolOrExit(id) {
  const config = loadConfig();
  const school = config.schools.find((s) => s.id === id);
  if (!school) {
    console.error(
      `Unknown school "${id ?? ""}". Configured schools: ${config.schools.map((s) => s.id).join(", ")}`
    );
    process.exit(1);
  }
  return school;
}

async function render(data) {
  if (!data) {
    console.error("No data yet — run `npm run fetch` first (or `npm run demo`).");
    process.exit(1);
  }
  const html = renderDashboard(data);
  const p = writeData("dashboard.html", html);
  // Copy served over the tailnet — site/ holds ONLY this file, never
  // sessions or raw data.
  writeData("site/index.html", html);
  console.log(`Dashboard written → ${p} (+ data/site/index.html for tailnet)`);
  return p;
}

switch (cmd) {
  case "init": {
    const { init } = await import("./init.js");
    await init();
    break;
  }
  case "login": {
    const { login } = await import("./login.js");
    await login(schoolOrExit(arg));
    break;
  }
  case "probe": {
    const { probe } = await import("./fetcher.js");
    await probe(schoolOrExit(arg));
    break;
  }
  case "fetch": {
    const { fetchAll } = await import("./fetcher.js");
    await fetchAll();
    break;
  }
  case "render":
    await render(readData("normalized.json"));
    break;
  case "all": {
    const { fetchAll } = await import("./fetcher.js");
    await render(await fetchAll());
    break;
  }
  case "demo": {
    const { sampleData } = await import("../sample/sample-data.js");
    await render(sampleData());
    break;
  }
  default:
    console.log(`Usage: ./dashboard <command>   (or: npm run <command> [-- args])
  init               interactive setup — writes config.json
  login <schoolId>   sign in once per school (browser window; cookies saved locally)
  all                fetch assignments + grades and rebuild the dashboard
  open               open the dashboard in your browser
  fetch | render     the two halves of "all"
  probe <schoolId>   dump raw API responses to data/probe-<schoolId>/ for debugging
  demo               render the dashboard with sample data (no login needed)`);
}
