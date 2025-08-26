#!/usr/bin/env bash
set -Eeuo pipefail
cd "${HOME}/AUBSNAP"
PROJECT="aubsnap"
SCOPE="alberts-projects-7f6ccc22"
APEX="https://aurabytecoin.net"
WWW="https://www.aurabytecoin.net"

# compile tokens into inline CSS
node fill-tokens.mjs

# deploy
LOG="$(mktemp -t aub-legal.XXXXXX.log)"
vercel --prod --yes --scope "$SCOPE" --project "$PROJECT" | tee "$LOG" >/dev/tty
DEPLOY_HOST="$(sed -nE 's/.*Production:[[:space:]]*(https:\/\/[A-Za-z0-9.-]+\.vercel\.app).*/\1/p' "$LOG" | tail -n1)"
[ -n "$DEPLOY_HOST" ] || { echo "ERROR: could not capture Production host"; exit 1; }

# alias apex + www
vercel alias set "$DEPLOY_HOST" aurabytecoin.net     --scope "$SCOPE"
vercel alias set "$DEPLOY_HOST" www.aurabytecoin.net --scope "$SCOPE"

# verify marker + mirror
echo "— HEADERS /legal —"; curl -sI "$APEX/legal" | sed -n '1p;/^cache-control/Ip;/^content-security-policy/Ip'
echo "— MARKER —";       curl -fsSL "$APEX/legal" | grep -F "AUB-LEGAL // BRUTAL-FINAL" >/dev/null && echo OK || echo MISSING
L=/tmp/_aubL.html T=/tmp/_aubT.html; curl -fsSL "$APEX/legal" >"$L"; curl -fsSL "$APEX/terms" >"$T"
[ "$(openssl dgst -sha256 "$L" | awk '{print $2}')" = "$(openssl dgst -sha256 "$T" | awk '{print $2}')" ] && echo "OK mirror" || echo "MISMATCH"
echo "— WWW→APEX —"; curl -sI "$WWW/legal" | sed -n '1p;/^location:/Ip'
echo "SHIPPED → $DEPLOY_HOST"
