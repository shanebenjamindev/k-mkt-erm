#!/usr/bin/env sh
set -eu
task_tmp=$(mktemp -d "${TMPDIR:-/tmp}/k-mkt-facebook-oauth.XXXXXX")
trap 'rm -rf "$task_tmp"' EXIT
./node_modules/.bin/tsc --ignoreConfig --types node --target ES2022 --module commonjs --esModuleInterop --skipLibCheck --outDir "$task_tmp/compiled" app/api/facebook/oauth/start/route.ts app/api/facebook/oauth/callback/route.ts app/api/facebook/connection/route.ts app/api/facebook/pages/route.ts app/api/facebook/adaccounts/route.ts app/api/ads/route.ts
NODE_PATH="$PWD/node_modules" node scripts/tests/facebook-oauth.cjs "$task_tmp"
