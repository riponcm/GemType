#!/bin/sh
# Build the Chrome Web Store upload package + promo tile.
set -e
cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")
ZIP="store/gemtype-v$VERSION.zip"

rm -f "$ZIP"
(cd extension && zip -qr "../$ZIP" . -x '.*' -x '*/.*')
echo "package: $ZIP ($(du -h "$ZIP" | cut -f1))"

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if [ -x "$CHROME" ]; then
  "$CHROME" --headless=new --disable-gpu --force-device-scale-factor=1 --hide-scrollbars \
    --window-size=440,280 --screenshot=store/promo-tile.png \
    "file://$PWD/store/promo-tile.html" 2>/dev/null
  echo "promo tile: store/promo-tile.png"
fi
