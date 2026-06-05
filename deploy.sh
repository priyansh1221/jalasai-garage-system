#!/bin/bash
set -euo pipefail

TIMESTAMP=$(date +%s)
PROJECT_NAME="${CF_PAGES_PROJECT:-jalasai-garage}"
BRANCH_NAME="${CF_PAGES_BRANCH:-main}"

rm -rf deploy
mkdir -p deploy/newui

rsync -a index.html style.css manifest.webmanifest sw.js assets icons js deploy/
rsync -a "NEW UI/" deploy/newui/ --exclude js
if [ -f config.js ]; then
  cp config.js deploy/config.js
fi

sed -i.bak -E "s/jalasai-(v[0-9]+|BUILD_TIMESTAMP)/jalasai-${TIMESTAMP}/g" deploy/sw.js
sed -i.bak -E "s/sw\\.js\\?v=([0-9]+|BUILD_TIMESTAMP)/sw.js?v=${TIMESTAMP}/g" deploy/index.html deploy/newui/index.html
rm -f deploy/sw.js.bak deploy/index.html.bak deploy/newui/index.html.bak

npx wrangler pages deploy deploy --project-name "$PROJECT_NAME" --branch "$BRANCH_NAME"
echo "Deployed with cache version jalasai-${TIMESTAMP}"
