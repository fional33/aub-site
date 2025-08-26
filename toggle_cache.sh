#!/usr/bin/env bash
set -Eeuo pipefail
cd "${HOME}/AUBSNAP"
MODE="${1:-iterate}"  # iterate|freeze

ITERATE="no-store, max-age=0, must-revalidate"
FREEZE="public, max-age=604800, immutable"

case "${MODE}" in
  iterate) TARGET="${ITERATE}";;
  freeze)  TARGET="${FREEZE}";;
  *) echo "usage: $0 [iterate|freeze]"; exit 2;;
esac

# patch vercel.json Cache-Control value
if grep -q '"Cache-Control"' vercel.json; then
  sed -i.bak -E "s#(\"Cache-Control\"[[:space:]]*:[[:space:]]*\").*\"#\1${TARGET}\"#g" vercel.json \
    || sed -E -i "s#(\"Cache-Control\"[[:space:]]*:[[:space:]]*\").*\"#\1${TARGET}\"#g" vercel.json
else
  echo "ERROR: Cache-Control header not found in vercel.json"; exit 1
fi

git add vercel.json && git commit -m "vercel: Cache-Control -> ${MODE}" || true
vercel --prod --yes | tee /tmp/aub-cache.log
DEPLOY_HOST="$(sed -nE 's/.*Production:[[:space:]]*(https:\/\/[a-zA-Z0-9.-]+\.vercel\.app).*/\1/p' /tmp/aub-cache.log | head -n1)"
vercel alias set "${DEPLOY_HOST}" aurabytecoin.net || true
vercel alias set "${DEPLOY_HOST}" www.aurabytecoin.net || true

# show header
curl -sI https://aurabytecoin.net/legal | sed -n '1p;/^cache-control/Ip'
