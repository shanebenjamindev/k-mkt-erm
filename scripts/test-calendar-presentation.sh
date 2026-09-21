#!/usr/bin/env sh
set -eu

task_tmp=$(mktemp -d "${TMPDIR:-/tmp}/k-mkt-calendar-test.XXXXXX")
trap 'rm -rf "$task_tmp"' EXIT

./node_modules/.bin/tsc --ignoreConfig --target ES2022 --module node16 --moduleResolution node16 --esModuleInterop --skipLibCheck --outDir "$task_tmp" lib/calendar-presentation.ts lib/types.ts

node - "$task_tmp/calendar-presentation.js" <<'NODE'
const { getCalendarTaskPresentation } = require(process.argv[2]);

const activeTask = {
  workType: "inhouse",
  status: "in_progress",
  deadline: "2026-09-21",
  endTime: "10:00"
};

const exactlyAtEnd = getCalendarTaskPresentation(activeTask, new Date("2026-09-21T03:00:00Z"));
const oneMinuteLate = getCalendarTaskPresentation(activeTask, new Date("2026-09-21T03:01:00Z"));
const completedPastTask = getCalendarTaskPresentation({ ...activeTask, status: "completed" }, new Date("2026-09-22T00:00:00Z"));

if (exactlyAtEnd.isOverdue || !oneMinuteLate.isOverdue || completedPastTask.isOverdue) {
  throw new Error("The calendar overdue rules regressed.");
}

console.log("Calendar presentation unit tests passed.");
NODE
