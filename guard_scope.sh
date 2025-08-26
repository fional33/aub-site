#!/usr/bin/env bash
set -Eeuo pipefail
BASE="https://aurabytecoin.net"
WWW="https://www.aurabytecoin.net"

# legal+terms must have CSP+no-store
for p in /legal /terms; do
  curl -sI "$BASE$p" | grep -iq '^content-security-policy:' || { echo "FAIL: $p missing CSP"; exit 1; }
  curl -sI "$BASE$p" | grep -iq '^cache-control:.*no-store'   || { echo "FAIL: $p missing no-store"; exit 1; }
done

# home must NOT have the legal CSP
if curl -sI "$BASE/" | grep -iq '^content-security-policy:'; then
  echo "FAIL: HOME has CSP (should not)"; exit 1
fi

# www → apex redirect
WWW_STATUS="$(curl -sI "$WWW/legal" | head -n1 | awk '{print $2}')"
case "$WWW_STATUS" in 301|308) :;; *) echo "WARN: www redirect status $WWW_STATUS";; esac

echo "PASS scope | www=$WWW_STATUS"
