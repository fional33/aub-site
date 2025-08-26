#!/usr/bin/env bash
set -Eeuo pipefail
SCOPE="alberts-projects-7f6ccc22"; PROJECT="aubsnap"
cd "${HOME}/AUBSNAP"
cat > vercel.json <<'JSON'
{
  "headers": [
    { "source": "/legal",       "headers": [
      { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://platform.twitter.comhttps://cdn.syndication.twimg.comstyle-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://.twimg.com https://pbs.twimg.comconnect-src 'self' https://api.twitter.comttps://syndication.twitter.comhttps://cdn.syndication.twimg.comhttps://.twimg.com; frame-src https://platform.twitter.comfont-src 'self' data: https://*.twimg.com" },
      { "key": "Cache-Control", "value": "no-store, max-age=0, must-revalidate" }
    ]},
    { "source": "/legal/(.*)",  "headers": [
      { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://platform.twitter.comhttps://cdn.syndication.twimg.comstyle-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://.twimg.com https://pbs.twimg.comconnect-src 'self' https://api.twitter.comttps://syndication.twitter.comhttps://cdn.syndication.twimg.comhttps://.twimg.com; frame-src https://platform.twitter.comfont-src 'self' data: https://*.twimg.com" },
      { "key": "Cache-Control", "value": "no-store, max-age=0, must-revalidate" }
    ]},
    { "source": "/terms",       "headers": [
      { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://platform.twitter.comhttps://cdn.syndication.twimg.comstyle-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://.twimg.com https://pbs.twimg.comconnect-src 'self' https://api.twitter.comttps://syndication.twitter.comhttps://cdn.syndication.twimg.comhttps://.twimg.com; frame-src https://platform.twitter.comfont-src 'self' data: https://*.twimg.com" },
      { "key": "Cache-Control", "value": "no-store, max-age=0, must-revalidate" }
    ]},
    { "source": "/terms/(.*)",  "headers": [
      { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' 'unsafe-inline' https://platform.twitter.comhttps://cdn.syndication.twimg.comstyle-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://.twimg.com https://pbs.twimg.comconnect-src 'self' https://api.twitter.comttps://syndication.twitter.comhttps://cdn.syndication.twimg.comhttps://.twimg.com; frame-src https://platform.twitter.comfont-src 'self' data: https://*.twimg.com" },
      { "key": "Cache-Control", "value": "no-store, max-age=0, must-revalidate" }
    ]}
  ],
  "redirects": [
    { "source": "/(.*)",
      "has": [{ "type": "host", "value": "www.aurabytecoin.net" }],
      "destination": "https://aurabytecoin.net/$1",
      "permanent": true
    }
  ]
}
JSON
git add vercel.json && git commit -m "vercel: restore scoped headers (legal/terms only)" || true
vercel --prod --yes | tee /tmp/aub-fix.log
DEPLOY_HOST="$(sed -nE 's/.*Production:[[:space:]]*(https:\/\/[a-zA-Z0-9.-]+\.vercel\.app).*/\1/p' /tmp/aub-fix.log | head -n1)"
vercel alias set "${DEPLOY_HOST}" aurabytecoin.net || true
vercel alias set "${DEPLOY_HOST}" www.aurabytecoin.net || true
echo "Scoped headers restored → ${DEPLOY_HOST}"
