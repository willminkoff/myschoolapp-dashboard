# myschoolapp-dashboard

Kids at different schools, every school on Blackbaud's **myschoolapp.com**,
and you're tired of logging into all of them? This gives you **one dashboard**
for the whole family: every kid's assignments grouped by **Overdue / Due today /
Due tomorrow / This week / Later / Recently done**, plus current grades for
every class — refreshed automatically a few times a day.

- Click any row with a ▸ to expand the teacher's full instructions, attached
  links, point values, and teacher comments on graded work.
- Graded items show real scores (18/20), color-coded chips filter by kid.
- Works in light and dark mode; optionally share it with your spouse over a
  [Tailscale](https://tailscale.com) network.

> **Unofficial.** This project is not affiliated with or endorsed by Blackbaud.
> It reads data through the same internal JSON endpoints the myschoolapp web
> portal itself uses, signed in as *you*, the parent — it only ever sees what
> you see when you log in. Those endpoints are unsupported and can change
> without notice. Use at your own discretion.

## How sign-in works (and what is stored)

You sign in yourself, in a real Chrome window the tool opens — password,
Google SSO, MFA and all. The tool never sees or stores your password; it keeps
only the **session cookies**, locally in `data/sessions/`. School sessions
expire daily, so the fetcher renews them headlessly: it re-opens the portal
invisibly, fills in your login email, and lets the Google/SSO session kept in
its dedicated browser profile click through. If renewal ever fails, the
dashboard keeps showing the last good data with a banner telling you which
school needs a quick re-login. Nothing ever leaves your machine.

## Setup

Requirements: [Node.js](https://nodejs.org) 20+, macOS or Linux
(scheduling script is macOS; use cron on Linux). Google Chrome recommended.

```bash
git clone https://github.com/willminkoff/myschoolapp-dashboard.git
cd myschoolapp-dashboard
npm install
npx playwright install chromium   # fallback browser for the login window
npm run init                      # interactive: your schools + login email
npm run login -- <schoolId>       # once per school; sign in in the window
npm run all                       # fetch everything + build the dashboard
open data/dashboard.html
```

The login window uses its own blank browser profile (stored in
`data/browser-profile`), so it won't have your bookmarks — that's deliberate:
it keeps the tool's cookies out of your daily browser. Sign into Google once
there and later logins click straight through.

## Daily use

```bash
npm run all        # refresh + rebuild
```

Or set it and forget it (macOS):

```bash
./scripts/install-automation.sh         # auto-refresh 6:30am / noon / 4pm / 8pm
./scripts/install-automation.sh --web   # + always-on local server at 127.0.0.1:8321
```

The dashboard page also reloads itself every 15 minutes, so a pinned tab
stays current. Remove the automation anytime with
`./scripts/uninstall-automation.sh`.

## Sharing with your spouse (Tailscale)

With the `--web` server installed, expose it to your private tailnet only:

```bash
tailscale serve --bg 8321
```

Then any device on your tailnet can open (and bookmark)
`https://<your-machine>.<your-tailnet>.ts.net`. The server binds to
localhost and serves **only the rendered dashboard page** — never your session
cookies or raw data. Turn it off with `tailscale serve --https=443 off`.

## When something breaks

School portals differ slightly. If one errors:

```bash
npm run probe -- <schoolId>
```

dumps raw API responses into `data/probe-<schoolId>/`; the endpoint mappings
all live in [src/providers/myschoolapp.js](src/providers/myschoolapp.js).
Sessions needing a manual re-login are named on the dashboard itself.
`npm run demo` renders the dashboard with sample data if you just want to see it.

## Roadmap

- [ ] Morning email/text digest
- [ ] Official [Blackbaud SKY API](https://developer.blackbaud.com/skyapi/)
      provider ([src/providers/skyapi.js](src/providers/skyapi.js) documents the
      plan) — requires each school's Blackbaud admin to connect a registered app

## License

MIT
