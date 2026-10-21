#!/bin/bash
# Installs macOS launchd agents: scheduled refresh (6:30a/12p/4p/8p daily)
# and, with --web, an always-on local web server for the dashboard
# (127.0.0.1:8321) that you can expose on a tailnet with:
#   tailscale serve --bg 8321
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
AGENTS_DIR="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"
mkdir -p "$AGENTS_DIR" "$PROJECT_DIR/data"

install_agent() {
  local label="$1" plist="$AGENTS_DIR/$1.plist" body="$2"
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
  printf '%s\n' "$body" > "$plist"
  launchctl bootstrap "gui/$UID_NUM" "$plist"
  echo "✅ installed $label"
}

REFRESH_LABEL="com.myschoolapp-dashboard.refresh"
install_agent "$REFRESH_LABEL" "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\"><dict>
  <key>Label</key><string>$REFRESH_LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE_BIN</string><string>src/cli.js</string><string>all</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>30</integer></dict>
    <dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>16</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$PROJECT_DIR/data/refresh.log</string>
  <key>StandardErrorPath</key><string>$PROJECT_DIR/data/refresh.log</string>
</dict></plist>"

if [[ "${1:-}" == "--web" ]]; then
  WEB_LABEL="com.myschoolapp-dashboard.web"
  install_agent "$WEB_LABEL" "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">
<plist version=\"1.0\"><dict>
  <key>Label</key><string>$WEB_LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$NODE_BIN</string><string>src/serve.js</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$PROJECT_DIR/data/web.log</string>
  <key>StandardErrorPath</key><string>$PROJECT_DIR/data/web.log</string>
</dict></plist>"
fi

echo "Done. Refresh runs at 6:30am, noon, 4pm, 8pm (while the Mac is awake)."
