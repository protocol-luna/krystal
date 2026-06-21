#!/usr/bin/env bash
set -euo pipefail

OUTDIR="state-machines/output"
mkdir -p "$OUTDIR"

for f in state-machines/[0-9][0-9]-*.mmd; do
  base=$(basename "$f" .mmd)
  echo "Exporting $base..."
  bunx mmdc \
    -i "$f" \
    -o "$OUTDIR/$base.svg" \
    --backgroundColor transparent
done

echo "Done -- $(ls "$OUTDIR"/*.svg | wc -l) SVGs exported"
