#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR on line $LINENO"; exit 1' ERR
export FORCE_COLOR=0   # reduce ANSI noise from vercel
PROJECT="aubsnap"
SCOPE="alberts-projects-7f6ccc22"
APEX="https://aurabytecoin.net"
WWW="https://www.aurabytecoin.net"

cd "${HOME}/AUBSNAP"

echo "== STEP 1: compile tokens (if Node exists) =="
if command -v node >/dev/null 2>&1; then
  if [ -f fill-tokens.mjs ]; then
    node fill-tokens.mjs
  else
    echo "WARN: fill-tokens.mjs not found; skipping token fill"
  fi
else
  echo "WARN: Node not installed; skipping token fill"
fi

echo; echo "== STEP 2: deploy production =="
LOG="$(mktemp -t aub-deploy.XXXXXX.log)"
vercel --prod --yes --scope "$SCOPE" --project "$PROJECT" | tee "$LOG" >/dev/tty

DEPLOY_HOST="$(sed -nE 's/.*Production:[[:space:]]*(https:\/\/[A-Za-z0-9.-]+\.vercel\.app).*/\1/p' "$LOG" | tail -n1)"
if [ -z "$DEPLOY_HOST" ]; then
  DEPLOY_HOST="$(grep -Eo 'https://[A-Za-z0-9.-]+\.vercel\.app' "$LOG" | tail -n1)"
fi
[ -n "$DEPLOY_HOST" ] || { echo "ERROR: could not capture Production host"; exit 1; }
echo "Deploy host → $DEPLOY_HOST"

echo; echo "== STEP 3: alias apex + www =="
vercel alias set "$DEPLOY_HOST" aurabytecoin.net     --scope "$SCOPE"
vercel alias set "$DEPLOY_HOST" www.aurabytecoin.net --scope "$SCOPE"

echo; echo "== STEP 4: verify live =="
echo "— HEADERS /legal —"
curl -sI "$APEX/legal" | sed -n '1p;/^cache-control/Ip;/^content-security-policy/Ip'
echo; echo "— MARKER —"
if curl -fsSL "$APEX/legal" | grep -F "AUB-LEGAL // BRUTAL-FINAL" >/dev/null; then echo "OK marker"; else echo "MISSING marker"; fi
echo; echo "— MIRROR —"
L=/tmp/_L.html T=/tmp/_T.html
curl -fsSL "$APEX/legal" >"$L"
curl -fsSL "$APEX/terms" >"$T"
if [ "$(openssl dgst -sha256 "$L" | awk '{print $2}')" = "$(openssl dgst -sha256 "$T" | awk '{print $2}')" ]; then
  echo "OK: /legal and /terms identical"
else
  echo "MISMATCH: /legal vs /terms"
fi
echo; echo "— WWW→APEX —"
curl -sI "$WWW/legal" | sed -n '1p;/^location:/Ip'

echo; echo "DONE ✓"
