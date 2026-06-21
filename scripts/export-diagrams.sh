#!/usr/bin/env bash
set -euo pipefail

OUTDIR="state-machines/output"
mkdir -p "$OUTDIR"

for f in state-machines/[0-9][0-9]-*.mmd; do
  base=$(basename "$f" .mmd)
  echo "Exporting $base..."
  bunx mmdc \
    -i "$f" \
    -o "$OUTDIR/$base.png" \
    -s 3 -w 4096 \
    -b "#1e1e2e"
done

echo "Done — $(ls "$OUTDIR"/*.png | wc -l) PNGs exported"
