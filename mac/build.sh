#!/usr/bin/env bash
# Builds HK.app, the menu bar remote, and installs it in ~/Applications.
#   mac/build.sh          build and install
#   mac/build.sh --open   build, install and start it (quits the running copy first)
set -euo pipefail

MAC_DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$MAC_DIR/build/HK.app"
INSTALLED="$HOME/Applications/HK.app"

swift build --package-path "$MAC_DIR" -c release
BIN_DIR="$(swift build --package-path "$MAC_DIR" -c release --show-bin-path)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN_DIR/HKMenu" "$APP/Contents/MacOS/HK"
cp "$MAC_DIR/Info.plist" "$APP/Contents/Info.plist"
# Sign with the first Apple Development certificate (Xcode makes one for any Apple ID): every build then keeps the
# same identity, so the keychain remembers "Always Allow" for the token. Without one, sign ad hoc, which works but
# looks like a new app to the keychain after each build.
IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null | awk -F'"' '/Apple Development/ {print $2; exit}')"
codesign --force --sign "${IDENTITY:--}" "$APP"
echo "Signed with ${IDENTITY:-an ad hoc signature}"

if [ "${1:-}" = "--open" ]; then
  osascript -e 'quit app id "dev.vumble.hk"' 2>/dev/null || true
  # opening it again fails while the old copy is still quitting
  for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -qf "HK.app/Contents/MacOS/HK" || break; sleep 0.5; done
fi

mkdir -p "$HOME/Applications"
rm -rf "$INSTALLED"
cp -R "$APP" "$INSTALLED"
echo "Installed $INSTALLED"

if [ "${1:-}" = "--open" ]; then open "$INSTALLED"; fi
