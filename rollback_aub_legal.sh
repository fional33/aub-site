#!/usr/bin/env bash
# Fast rollback: re-alias apex+www to a specified vercel.app deploy host.
# Usage: ./rollback_aub_legal.sh aubsnap-XXXXX.vercel.app
set -Eeuo pipefail
SCOPE="alberts-projects-7f6ccc22"
APEX_DOMAIN="aurabytecoin.net"
WWW_DOMAIN="www.aurabytecoin.net"
HOST="$1"
[ -n "${HOST:-}" ] || { echo "Usage: $0 <deploy-host.vercel.app>"; exit 1; }

vercel alias set "https://${HOST}" "${APEX_DOMAIN}" --scope "${SCOPE}" || vercel alias set "https://${HOST}" "${APEX_DOMAIN}"
vercel alias set "https://${HOST}" "${WWW_DOMAIN}"  --scope "${SCOPE}" || vercel alias set "https://${HOST}" "${WWW_DOMAIN}"
echo "Rollback complete → ${HOST}"
