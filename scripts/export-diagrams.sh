#!/usr/bin/env bash
set -euo pipefail

OUTDIR="state-machines/output"
mkdir -p "$OUTDIR"

for f in state-machines/[0-9][0-9]-*.mmd; do
  base=$(basename "$f" .mmd)
  echo "Exporting $base..."

  # SVG -- vectoriel, fond transparent
  bunx mmdc \
    -i "$f" \
    -o "$OUTDIR/$base.svg" \
    --backgroundColor transparent

  # PNG -- haute qualité, fond transparent, 3000px de large
  bunx mmdc \
    -i "$f" \
    -o "$OUTDIR/$base.png" \
    -w 3000 \
    --backgroundColor transparent
done

echo "Done -- $(ls "$OUTDIR"/*.svg 2>/dev/null | wc -l) SVGs, $(ls "$OUTDIR"/*.png 2>/dev/null | wc -l) PNGs exported"
