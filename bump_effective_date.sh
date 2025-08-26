#!/usr/bin/env bash
set -Eeuo pipefail
cd "${HOME}/AUBSNAP"
TODAY="$(TZ=Europe/Amsterdam date '+%B %e, %Y' | sed 's/  / /')"

bump() {
  f="$1"
  sed -i.bak -E "s|(Effective date:</strong> )[A-Za-z]+[[:space:]]+[0-9]{1,2},[[:space:]]+[0-9]{4}|\1${TODAY}|g" "$f" \
    || sed -E -i "s|(Effective date:</strong> )[A-Za-z]+[[:space:]]+[0-9]{1,2},[[:space:]]+[0-9]{4}|\1${TODAY}|g" "$f"
}

bump legal/index.html
cp -f legal/index.html terms/index.html

git add -A && git commit -m "legal: bump effective date to ${TODAY}" || true
vercel --prod --yes | tee /tmp/aub-bump.log
DEPLOY_HOST="$(sed -nE 's/.*Production:[[:space:]]*(https:\/\/[a-zA-Z0-9.-]+\.vercel\.app).*/\1/p' /tmp/aub-bump.log | head -n1)"
vercel alias set "${DEPLOY_HOST}" aurabytecoin.net  || true
vercel alias set "${DEPLOY_HOST}" www.aurabytecoin.net || true

# verify marker+headers+mirror
curl -fsSL https://aurabytecoin.net/legal | grep -F 'AUB-LEGAL // FINAL' >/dev/null
L=/tmp/_l.html T=/tmp/_t.html; curl -fsSL https://aurabytecoin.net/legal >"$L"; curl -fsSL https://aurabytecoin.net/terms >"$T"
[ "$(openssl dgst -sha256 "$L" | awk '{print $2}')" = "$(openssl dgst -sha256 "$T" | awk '{print $2}')" ] && echo "OK: date bumped & pages identical"
