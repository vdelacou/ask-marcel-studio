#!/usr/bin/env bash
#
# Build the app icon from resources/icons/logo.svg, using only tools that ship with macOS
# (sips + iconutil), no new dependency. Produces build/icon.icns for electron-builder and a
# 512px PNG for the linux/windows targets a later build may add.
#
# Run after changing the logo: `bun run icons`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/resources/icons/logo.svg"
ICONSET="$ROOT/build/icon.iconset"  # scratch, gitignored
OUT="$ROOT/resources/icons/icon.icns"

[ -f "$SVG" ] || { echo "no logo at $SVG" >&2; exit 1; }

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

render() {
  local size="$1" name="$2"
  # sips reads the SVG directly on modern macOS; rsvg-convert is the fallback where it does not.
  if ! sips -s format png -z "$size" "$size" "$SVG" --out "$ICONSET/$name" >/dev/null 2>&1; then
    command -v rsvg-convert >/dev/null 2>&1 || { echo "sips could not rasterize the SVG and rsvg-convert is not installed" >&2; exit 1; }
    rsvg-convert -w "$size" -h "$size" "$SVG" -o "$ICONSET/$name"
  fi
}

# The ten entries a .icns needs, 16 through 1024.
render 16   icon_16x16.png
render 32   icon_16x16@2x.png
render 32   icon_32x32.png
render 64   icon_32x32@2x.png
render 128  icon_128x128.png
render 256  icon_128x128@2x.png
render 256  icon_256x256.png
render 512  icon_256x256@2x.png
render 512  icon_512x512.png
render 1024 icon_512x512@2x.png

iconutil -c icns "$ICONSET" -o "$OUT"
# A standalone 512 PNG for the renderer and non-mac targets.
cp "$ICONSET/icon_512x512.png" "$ROOT/resources/icons/icon.png"
echo "wrote $OUT and resources/icons/icon.png"
