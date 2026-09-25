#!/usr/bin/env sh
set -eu
task_root=$(pwd)
task_tmp=$(mktemp -d "${TMPDIR:-/tmp}/k-mkt-workspace-test.XXXXXX")
trap 'rm -rf "$task_tmp"' EXIT
./node_modules/.bin/tsc --ignoreConfig --types node --target ES2022 --module node16 --moduleResolution node16 --esModuleInterop --skipLibCheck --outDir "$task_tmp/compiled" lib/workspace-repository.ts lib/notification-state.ts lib/client-request.ts lib/web-push.ts lib/workload.ts
NODE_PATH="$task_root/node_modules" node scripts/tests/workspace.cjs "$task_tmp"
NODE_PATH="$task_root/node_modules" node scripts/tests/notification-remote.cjs "$task_tmp/compiled"
NODE_PATH="$task_root/node_modules" node scripts/tests/push-config.cjs "$task_tmp/compiled"
