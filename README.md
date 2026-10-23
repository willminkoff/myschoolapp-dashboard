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

## The Mac app (easiest)

There's a double-clickable menu-bar app, **School Board** — no Terminal at
all. Download the `.dmg` from
[Releases](https://github.com/willminkoff/myschoolapp-dashboard/releases),
drag **School Board** into Applications, and open it. A graduation-cap
icon appears in your menu bar: a first-run wizard asks for your schools, opens
a sign-in window for each (you type your own password/MFA — the app keeps only
session cookies), and then builds your dashboard. The app refreshes on its own
at 6:30am, noon, 4pm and 8pm, renews expired school sessions silently, and can
start at login from its menu.

Sign-in happens in your installed **Google Chrome** (Google refuses to sign
in inside app windows), so have Chrome installed if your schools use Google
SSO. Schools with plain email/password sign-in work even without Chrome.

To update later: **Check for Updates…** in the menu tells you when a newer
version exists and opens the download — install it over the old one; your
settings and sign-ins are kept.

> **Current builds are unsigned**, so the first launch needs right-click →
> **Open** → **Open** (macOS Gatekeeper). See
> [Building & signing the Mac app](#building--signing-the-mac-app) if you're
> building your own.

## Install (macOS — the Terminal way)

Open Terminal (⌘-space, type "Terminal") and paste:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/willminkoff/myschoolapp-dashboard/main/install.sh)"
```

That's the whole install: it sets up everything it needs in
`~/myschoolapp-dashboard` (including its own private copy of Node — no
sudo, no Homebrew, nothing system-wide), then asks for your schools. Finish
with:

```bash
cd ~/myschoolapp-dashboard
./dashboard login <schoolId>       # once per school — sign in in the window
./dashboard all                    # fetch + build
./dashboard open                   # bookmark this page!
./scripts/install-automation.sh    # optional: auto-refresh 4× a day
```

Re-running the installer later updates the app and keeps your data.

## Manual setup (developers / Linux)

Requirements: [Node.js](https://nodejs.org) 20+. Google Chrome recommended.
The scheduling script is macOS; use cron on Linux.

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

## The What's Due Digest (text or email)

A short note — strictly what's due **today and tomorrow**, per kid — sent
through your Mac's own Messages (iMessage) or Mail app, so there's nothing to
sign up for and no mail server involved. macOS asks once to allow it.

In the Mac app: turn it on in **Set Up Schools…** (method + recipients), then
send any time from the menu-bar icon — **Send What's Due Digest** — or list
automatic send times like `06:45, 15:30`.

From the CLI, add a `digest` section to `config.json`:

```json
"digest": { "method": "imessage", "to": ["+16155551234"], "times": ["06:45"] }
```

then run `./dashboard digest` (or `--dry` to preview; schedule it with cron or
an extra launchd entry if you want it automatic).

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

## Building & signing the Mac app

The menu-bar app is Electron, sharing the CLI's provider and renderer code.
Its data lives in `~/Library/Application Support/myschoolapp-dashboard/`,
completely separate from a CLI install — you can run both.

```bash
npm install          # includes electron + electron-builder (dev deps)
npm run app          # run the tray app from source, for development
npm run dist         # build dist/School Board-<version>-universal.dmg
```

The build is **unsigned** by default, so Gatekeeper makes users right-click →
Open on first launch and some browsers warn on download. Distributing without
those warnings requires an [Apple Developer Program](https://developer.apple.com/programs/)
membership ($99/year) for signing + notarization. Once you have it, signing is
a drop-in — no config changes needed, electron-builder picks it up from the
environment:

1. In Xcode (or developer.apple.com), create a **Developer ID Application**
   certificate and install it in your login keychain.
2. Create an app-specific password for your Apple ID at
   [appleid.apple.com](https://appleid.apple.com) (for notarization).
3. Build with the credentials in the environment:

   ```bash
   export APPLE_ID="you@example.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="YOURTEAMID"
   npm run dist
   ```

   electron-builder finds the Developer ID certificate in your keychain,
   signs the app, and notarizes it with Apple automatically when those
   variables are set.

## Roadmap

- [ ] Morning email/text digest
- [ ] Official [Blackbaud SKY API](https://developer.blackbaud.com/skyapi/)
      provider ([src/providers/skyapi.js](src/providers/skyapi.js) documents the
      plan) — requires each school's Blackbaud admin to connect a registered app

## License

MIT
