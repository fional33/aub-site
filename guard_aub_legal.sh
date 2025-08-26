#!/usr/bin/env bash
# Nightly/Hourly guard: verifies aliases, headers, marker/version, section count,
# and mirrors; prints a crisp status line for external monitoring.
set -Eeuo pipefail
APEX="https://aurabytecoin.net"
WWW="https://www.aurabytecoin.net"
MARK="${MARK:-AUB-LEGAL v22 (final-inline, no-rewrites, NO TOC)}"

L="$(mktemp)"; T="$(mktemp)"; H="$(mktemp)"; WH="$(mktemp)"; trap 'rm -f "$L" "$T" "$H" "$WH"' EXIT
curl -fsSL "${APEX}/legal" > "$L"
curl -fsSL "${APEX}/terms" > "$T"
curl -fsSI "${APEX}/legal" > "$H"
curl -fsSI "${WWW}/legal" > "$WH"

grep -F "$MARK" "$L" >/dev/null
grep -F 'AURA BYTE ($AUB) — LEGAL TERMS, RISK DISCLOSURE, AND USER AGREEMENT' "$L" >/dev/null
grep -F 'WORSHIP THE AURA' "$L" >/dev/null

S="$(grep -o '<h2>' "$L" | wc -l | awk '{print $1}')"
[ "$S" = "28" ]

LSHA="$(openssl dgst -sha256 "$L" | awk '{print $2}')"
TSHA="$(openssl dgst -sha256 "$T" | awk '{print $2}')"
[ "$LSHA" = "$TSHA" ]

grep -i '^cache-control:.*no-store' "$H" >/dev/null
grep -i '^content-security-policy:' "$H" >/dev/null

WSTAT="$(head -n1 "$WH" | awk '{print $2}')"
case "$WSTAT" in 301|308) :;; *) echo "WARN www-status:$WSTAT";; esac

echo "AUB-GUARD OK | sections=28 sha=${LSHA} www=${WSTAT}"
