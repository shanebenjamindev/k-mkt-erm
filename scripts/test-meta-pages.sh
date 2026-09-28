#!/usr/bin/env sh
set -eu
task_tmp=$(mktemp -d "${TMPDIR:-/tmp}/k-mkt-meta-pages.XXXXXX")
trap 'rm -rf "$task_tmp"' EXIT
./node_modules/.bin/tsc --ignoreConfig --types node --target ES2022 --module commonjs --skipLibCheck --outDir "$task_tmp" lib/meta-pages.ts
NODE_PATH="$PWD/node_modules" node scripts/tests/meta-pages.cjs "$task_tmp"
