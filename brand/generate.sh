#!/usr/bin/env bash
# Regenerate every GemType icon, for every surface, from the two vector masters
# in this folder. Requires rsvg-convert (librsvg) and iconutil (macOS).
#   brand/icon-app.svg      -> app tiles (macOS desktop app, Safari mac app)
#   brand/icon-toolbar.svg  -> toolbar/store/ribbon (extension, Word)
set -euo pipefail
cd "$(dirname "$0")/.."
BRAND=brand
APP=$BRAND/icon-app.svg
TB=$BRAND/icon-toolbar.svg

render() { # svg w out
  rsvg-convert -w "$2" -h "$2" "$1" -o "$3"
}

echo "== extension (Chrome/Edge/Firefox toolbar + store) =="
for s in 16 32 48 128; do render "$TB" "$s" "extension/icons/icon${s}.png"; done

echo "== msword add-in (ribbon + store) =="
for s in 16 32 64 80 128; do render "$TB" "$s" "msword/assets/icon-${s}.png"; done

echo "== safari extension toolbar (shares extension look) =="
if [ -d "safari/GemType/GemType" ]; then
  # Safari mac APP icon -> app-style squircle
  AI=safari/GemType/GemType/Assets.xcassets/AppIcon.appiconset
  if [ -d "$AI" ]; then
    render "$APP" 16   "$AI/mac-icon-16@1x.png"
    render "$APP" 32   "$AI/mac-icon-16@2x.png"
    render "$APP" 32   "$AI/mac-icon-32@1x.png"
    render "$APP" 64   "$AI/mac-icon-32@2x.png"
    render "$APP" 128  "$AI/mac-icon-128@1x.png"
    render "$APP" 256  "$AI/mac-icon-128@2x.png"
    render "$APP" 256  "$AI/mac-icon-256@1x.png"
    render "$APP" 512  "$AI/mac-icon-256@2x.png"
    render "$APP" 512  "$AI/mac-icon-512@1x.png"
    render "$APP" 1024 "$AI/mac-icon-512@2x.png"
  fi
  # Safari app container Resources/Icon.png
  [ -f safari/GemType/GemType/Resources/Icon.png ] && render "$APP" 512 safari/GemType/GemType/Resources/Icon.png
fi

echo "== desktop app (Electron .app) =="
render "$APP" 128 desktop/assets/icon.png
render "$TB"  128 desktop/assets/tray.png     # tray/menu-bar: full-bleed reads better tiny
render "$TB"  64  desktop/assets/tray@2x.png
ICONSET=desktop/assets/icon.iconset
rm -rf "$ICONSET"; mkdir -p "$ICONSET"
for s in 16 32 64 128 256 512 1024; do render "$APP" "$s" "$ICONSET/icon_${s}x${s}.png"; done
cp "$ICONSET/icon_32x32.png"     "$ICONSET/icon_16x16@2x.png"
cp "$ICONSET/icon_64x64.png"     "$ICONSET/icon_32x32@2x.png"
cp "$ICONSET/icon_256x256.png"   "$ICONSET/icon_128x128@2x.png"
cp "$ICONSET/icon_512x512.png"   "$ICONSET/icon_256x256@2x.png"
cp "$ICONSET/icon_1024x1024.png" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o desktop/assets/icon.icns
rm -rf "$ICONSET"

echo "== done =="
