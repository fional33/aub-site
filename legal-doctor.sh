#!/usr/bin/env bash
set -Eeuo pipefail
echo "== TOOLS =="; command -v vercel >/dev/null && vercel --version || echo "MISSING: vercel"
command -v node >/dev/null && node -v || echo "MISSING: node"
command -v curl >/dev/null && curl --version | head -n1 || echo "MISSING: curl"
echo; echo "== FILES =="; ls -lah legal/index.html terms/index.html 2>/dev/null || true
echo; echo "== MARKER (local) =="; grep -F "AUB-LEGAL // BRUTAL-FINAL" legal/index.html && echo "OK local" || echo "Marker missing locally"
echo; echo "== DONE =="
