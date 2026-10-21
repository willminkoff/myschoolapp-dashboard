#!/bin/bash
# myschoolapp-dashboard installer — zero prerequisites beyond macOS + curl.
#
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/willminkoff/myschoolapp-dashboard/main/install.sh)"
#
# Installs to ~/myschoolapp-dashboard with a private copy of Node (no sudo,
# no Homebrew, nothing touched system-wide). Safe to re-run: updates the app
# and keeps your config, sign-ins, and data.
set -euo pipefail

REPO="willminkoff/myschoolapp-dashboard"
APP_DIR="${MYSA_DIR:-$HOME/myschoolapp-dashboard}"
NODE_VERSION="22.11.0"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n❌ %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || fail "This installer is macOS-only for now. On Linux, follow the README's manual setup."
case "$(uname -m)" in
  arm64) NODE_ARCH="darwin-arm64" ;;
  x86_64) NODE_ARCH="darwin-x64" ;;
  *) fail "Unsupported architecture: $(uname -m)" ;;
esac

say "Installing myschoolapp-dashboard into $APP_DIR"
mkdir -p "$APP_DIR"

# ── Private Node runtime (skipped if a recent system Node exists) ─────────────
NODE_BIN="$(command -v node || true)"
if [ -n "$NODE_BIN" ] && [ "$("$NODE_BIN" -e 'console.log(+process.versions.node.split(".")[0] >= 20 ? "ok" : "")')" = "ok" ]; then
  say "Using your existing Node ($("$NODE_BIN" --version))"
  NPM_BIN="$(command -v npm)"
else
  NODE_HOME="$APP_DIR/.node"
  NODE_BIN="$NODE_HOME/bin/node"
  NPM_BIN="$NODE_HOME/bin/npm"
  if [ ! -x "$NODE_BIN" ]; then
    say "Downloading a private copy of Node.js (one-time, ~50 MB)…"
    TARBALL="node-v$NODE_VERSION-$NODE_ARCH"
    curl -fL --progress-bar "https://nodejs.org/dist/v$NODE_VERSION/$TARBALL.tar.gz" -o "$APP_DIR/.node.tar.gz"
    rm -rf "$NODE_HOME"; mkdir -p "$NODE_HOME"
    tar -xzf "$APP_DIR/.node.tar.gz" -C "$NODE_HOME" --strip-components=1
    rm "$APP_DIR/.node.tar.gz"
  fi
  export PATH="$NODE_HOME/bin:$PATH"
fi

# ── App code (GitHub tarball — no git required) ───────────────────────────────
say "Downloading the app…"
curl -fL --progress-bar "https://github.com/$REPO/archive/refs/heads/main.tar.gz" -o "$APP_DIR/.app.tar.gz"
tar -xzf "$APP_DIR/.app.tar.gz" -C "$APP_DIR" --strip-components=1
rm "$APP_DIR/.app.tar.gz"

say "Installing dependencies…"
cd "$APP_DIR"
# --omit=dev skips the Mac app's build toolchain (Electron) — the CLI
# only needs the production dependencies.
"$NPM_BIN" install --omit=dev --no-audit --no-fund --loglevel=error

# The login window prefers installed Google Chrome; only download Playwright's
# browser when Chrome is missing.
if [ ! -d "/Applications/Google Chrome.app" ]; then
  say "Google Chrome not found — downloading a browser for the sign-in window…"
  "$APP_DIR/node_modules/.bin/playwright" install chromium
fi

chmod +x "$APP_DIR/dashboard" "$APP_DIR/scripts/"*.sh
say "✅ Installed."
if [ -t 0 ] && [ ! -f "$APP_DIR/config.json" ]; then
  say "Let's set up your schools."
  "$NODE_BIN" src/cli.js init
fi
cat <<EOF

Next steps (run these in Terminal, in order):
  cd $APP_DIR
  ./dashboard login <schoolId>       # once per school — sign in in the window
  ./dashboard all                    # fetch + build your dashboard
  ./dashboard open                   # view it — bookmark this page!
  ./scripts/install-automation.sh    # optional: auto-refresh 4× a day
EOF
