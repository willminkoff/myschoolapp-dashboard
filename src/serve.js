import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./session.js";

/**
 * Tiny static server for the rendered dashboard, bound to localhost only.
 * Tailscale Serve proxies the tailnet to this port (the macOS Tailscale app
 * can't serve file paths directly). It serves exactly one file — never
 * sessions or raw data.
 */
const PORT = 8321;
const PAGE = path.join(DATA_DIR, "site", "index.html");

http
  .createServer((req, res) => {
    fs.readFile(PAGE, (err, body) => {
      if (err) {
        res.writeHead(503, { "content-type": "text/plain" });
        res.end("Dashboard not rendered yet — run: npm run all");
        return;
      }
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(body);
    });
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`Dashboard server on http://127.0.0.1:${PORT}`);
  });
