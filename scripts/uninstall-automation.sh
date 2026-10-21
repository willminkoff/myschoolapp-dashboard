#!/bin/bash
# Removes the launchd agents installed by install-automation.sh.
set -uo pipefail
UID_NUM="$(id -u)"
for label in com.myschoolapp-dashboard.refresh com.myschoolapp-dashboard.web; do
  launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null && echo "stopped $label"
  rm -f "$HOME/Library/LaunchAgents/$label.plist"
done
echo "Done."
