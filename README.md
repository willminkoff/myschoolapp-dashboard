# School Board

Kids at different schools, every school on Blackbaud's **myschoolapp.com**,
and you're tired of logging into all of them? **School Board** is a Mac
menu-bar app that gives you **one dashboard** for the whole family: every
kid's assignments grouped by **Overdue / Due today / Due tomorrow / This week /
Later / Recently done**, plus current grades for every class — refreshed
automatically a few times a day.

- Click any row to see the teacher's full instructions, attached links,
  assigned/due dates, point values, and teacher comments on graded work.
- Graded items show real scores (18/20); red tags call out missing, late,
  and overdue work; color-coded chips filter by kid.
- The **What's Due Digest** texts or emails you what's due today and
  tomorrow — on demand or on a schedule.
- Works in light and dark mode.

> **Unofficial.** This project is not affiliated with or endorsed by Blackbaud.
> It reads data through the same internal JSON endpoints the myschoolapp web
> portal itself uses, signed in as *you*, the parent — it only ever sees what
> you see when you log in. Those endpoints are unsupported and can change
> without notice. Use at your own discretion.

## Install

1. Download the `.dmg` from
   [Releases](https://github.com/willminkoff/myschoolapp-dashboard/releases),
   open it, and drag **School Board** into Applications.
2. Launch it. Current builds are **unsigned**, so macOS balks the first time:
   - **macOS 15 (Sequoia) or newer:** double-click → "Apple could not
     verify…" → **Done**, then **System Settings → Privacy & Security** →
     scroll down → **Open Anyway**.
   - **macOS 14 or earlier:** right-click the app → **Open** → **Open**.
3. A graduation-cap icon appears in the menu bar and the setup wizard opens:
   enter your schools' myschoolapp addresses, your login email, and
   (optionally) the digest, then sign in to each school.

Each parent installs on their own Mac and signs in with their own parent
account — installs are independent.

## How sign-in works (and what is stored)

You sign in yourself — password, Google SSO, MFA and all — in a real
**Google Chrome** window the app opens (Google refuses to sign in inside
embedded app windows, so have Chrome installed if your schools use Google
SSO; schools with plain email/password sign-in work without it). The app
never sees or stores your password; it keeps only the **session cookies**,
locally in `~/Library/Application Support/myschoolapp-dashboard/`.

School sessions expire daily, so the app renews them invisibly using the
Google/SSO session kept in its own separate Chrome profile (that's why the
sign-in window has no bookmarks — it keeps the app's cookies out of your
daily browser). If renewal ever fails, the dashboard keeps showing the last
good data with a banner, the menu-bar icon gets a ⚠️, and a notification
offers a one-click re-sign-in. Nothing ever leaves your machine.

## The What's Due Digest (text or email)

A short note — strictly what's due **today and tomorrow**, per kid — sent
through your Mac's own Messages (iMessage) or Mail app, so there's nothing to
sign up for and no mail server involved. macOS asks once to allow it.

Turn it on in **Set Up Schools…** (method + recipients), then send any time
from the menu — **Send What's Due Digest** — or add automatic send times
with the time picker.

## Updating

**Check for Updates…** in the menu tells you when a newer version exists and
opens the download — install it over the old one; your settings and sign-ins
are kept. (Being unsigned, each update repeats the "Open Anyway" step.)

## When something breaks

School portals differ slightly. The app logs to
`~/Library/Application Support/myschoolapp-dashboard/data/app.log`; sessions
needing a manual re-login are named on the dashboard itself and in the menu.
For endpoint mismatches, the mappings all live in
[src/providers/myschoolapp.js](src/providers/myschoolapp.js), and `probe()`
in [src/fetcher.js](src/fetcher.js) dumps raw API responses for one school.

## Building & signing (developers)

Requires [Node.js](https://nodejs.org) 20+.

```bash
git clone https://github.com/willminkoff/myschoolapp-dashboard.git
cd myschoolapp-dashboard
npm install
npm run app          # run the tray app from source
npm run dist         # build dist/School Board-<version>-universal.dmg
```

The build is **unsigned** by default. Distributing without Gatekeeper
warnings requires an [Apple Developer Program](https://developer.apple.com/programs/)
membership ($99/year) for signing + notarization. Once you have it, signing
is a drop-in — electron-builder picks it up from the environment:

1. Create a **Developer ID Application** certificate and install it in your
   login keychain.
2. Create an app-specific password at [appleid.apple.com](https://appleid.apple.com).
3. Build with the credentials in the environment:

   ```bash
   export APPLE_ID="you@example.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
   export APPLE_TEAM_ID="YOURTEAMID"
   npm run dist
   ```

## Roadmap

- [ ] Signed/notarized builds (and with them, true auto-update)
- [ ] A real app icon (the menu-bar icon is custom; the bundle still uses
      Electron's default)
- [ ] Official [Blackbaud SKY API](https://developer.blackbaud.com/skyapi/)
      provider ([src/providers/skyapi.js](src/providers/skyapi.js) documents the
      plan) — requires each school's Blackbaud admin to connect a registered app

## License

MIT
