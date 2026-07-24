#!/usr/bin/env bash
#
# Build the app icon from resources/icons/logo.svg, using only tools that ship with macOS
# (sips + iconutil), no new dependency. Produces resources/icons/icon.icns for
# electron-builder and a 512px PNG for the linux/windows targets a later build may add.
#
# logo.svg is the bare mark on a transparent background, drawn on a 1024 canvas. This script
# is what puts it on the macOS plate: a full-bleed square icon looks foreign in the Dock next
# to every other app, which is the whole reason the composition below exists.
#
#   - The plate is 824x824 centred in the 1024 canvas, i.e. a 100px margin on every side.
#     That is the Big Sur icon grid, and WeChat.app, Notes.app and Microsoft Edge.app all
#     measure exactly that.
#   - Its outline is the superellipse |x/412|^5 + |y/412|^5 = 1, sampled as 32 cubic
#     segments (a plain rounded rect is visibly too round mid-corner and too pointy near the
#     edges). Rasterised and compared row by row against the real plate of WeChat.app, this
#     path tracks it to within 6px at 1024, 1.9px on average: under half a pixel at Dock size.
#   - The mark's own 1024 canvas maps into a 768 box centred on the plate, which leaves it
#     the same optical margin the system icons keep around their content.
#   - No drop shadow: sips silently ignores SVG filters, and WeChat ships none either.
#
# Run after changing the logo: `bun run icons`.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/resources/icons/logo.svg"
ICONSET="$ROOT/build/icon.iconset"        # scratch, gitignored
COMPOSED="$ROOT/build/icon-macos.svg"     # scratch, gitignored
OUT="$ROOT/resources/icons/icon.icns"

[ -f "$SVG" ] || { echo "no logo at $SVG" >&2; exit 1; }

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

# The mark without its <svg> wrapper. logo.svg is a one-line export, so one sed does it; the
# guard means a differently shaped export fails here instead of shipping an empty plate.
MARK="$(sed -e 's/.*<svg[^>]*>//' -e 's|</svg>||' "$SVG")"
case "$MARK" in
  *"<path"*) ;;
  *) echo "no <path> found inside $SVG: is it still a single-line, single-mark export?" >&2; exit 1 ;;
esac

# See the header for where this outline comes from and what it was measured against.
PLATE="M924.00 512.00C924.00 583.43 922.96 679.52 920.81 726.28C918.67 773.05 915.51 774.00 911.16 792.56C906.80 811.13 901.43 824.66 894.68 837.68C887.93 850.70 880.17 861.17 870.67 870.67C861.17 880.17 850.70 887.93 837.68 894.68C824.66 901.43 811.13 906.80 792.56 911.16C774.00 915.51 773.05 918.67 726.28 920.81C679.52 922.96 583.43 924.00 512.00 924.00C440.57 924.00 344.48 922.96 297.72 920.81C250.95 918.67 250.00 915.51 231.44 911.16C212.87 906.80 199.34 901.43 186.32 894.68C173.30 887.93 162.83 880.17 153.33 870.67C143.83 861.17 136.07 850.70 129.32 837.68C122.57 824.66 117.20 811.13 112.84 792.56C108.49 774.00 105.33 773.05 103.19 726.28C101.04 679.52 100.00 583.43 100.00 512.00C100.00 440.57 101.04 344.48 103.19 297.72C105.33 250.95 108.49 250.00 112.84 231.44C117.20 212.87 122.57 199.34 129.32 186.32C136.07 173.30 143.83 162.83 153.33 153.33C162.83 143.83 173.30 136.07 186.32 129.32C199.34 122.57 212.87 117.20 231.44 112.84C250.00 108.49 250.95 105.33 297.72 103.19C344.48 101.04 440.57 100.00 512.00 100.00C583.43 100.00 679.52 101.04 726.28 103.19C773.05 105.33 774.00 108.49 792.56 112.84C811.13 117.20 824.66 122.57 837.68 129.32C850.70 136.07 861.17 143.83 870.67 153.33C880.17 162.83 887.93 173.30 894.68 186.32C901.43 199.34 906.80 212.87 911.16 231.44C915.51 250.00 918.67 250.95 920.81 297.72C922.96 344.48 924.00 440.57 924.00 512.00Z"

# 0.75 = 768/1024, and 128 = (1024 - 768)/2, so the mark lands centred on the plate.
cat > "$COMPOSED" <<EOF
<?xml version="1.0" encoding="utf-8" ?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">
<path fill="white" d="$PLATE"/>
<g transform="translate(128 128) scale(0.75)">$MARK</g>
</svg>
EOF

render() {
  local size="$1" name="$2"
  # sips reads the SVG directly on modern macOS; rsvg-convert is the fallback where it does not.
  if ! sips -s format png -z "$size" "$size" "$COMPOSED" --out "$ICONSET/$name" >/dev/null 2>&1; then
    command -v rsvg-convert >/dev/null 2>&1 || { echo "sips could not rasterize the SVG and rsvg-convert is not installed" >&2; exit 1; }
    rsvg-convert -w "$size" -h "$size" "$COMPOSED" -o "$ICONSET/$name"
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
