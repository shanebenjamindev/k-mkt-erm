"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { TaskKanban } from "../components/TaskKanban";
import { TaskSheet } from "../components/TaskSheet";
import { TaskTable } from "../components/TaskTable";
import { TaskFormModal } from "../components/TaskFormModal";
import { WorkspaceState } from "../components/WorkspaceState";
import { useWorkspace } from "../components/WorkspaceProvider";
import { statusLabels, taskCoversDate, workTypeLabels, TASK_STATUSES, type TaskStatus, type WorkType } from "../../lib/types";
import { TASK_SORT_OPTIONS, sortTasks, type SortDirection, type TaskSortKey } from "../../lib/task-sort";

export default function TasksClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tasks, members } = useWorkspace();
  const [type, setType] = useState<"all" | WorkType>("all");
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [owner, setOwner] = useState("all");
  const [query, setQuery] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"sheet" | "kanban" | "table">("table");
  const [sortKey, setSortKey] = useState<TaskSortKey>("deadline");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  useEffect(() => {
    const queryType = searchParams.get("type");
    const queryStatus = searchParams.get("status");
    if (searchParams.get("new") === "1") setCreating(true);
    setType(queryType === "inhouse" || queryType === "outsource" ? queryType : "all");
    setStatus(queryStatus && TASK_STATUSES.includes(queryStatus as TaskStatus) ? queryStatus as TaskStatus : "all");
    const queryDate = searchParams.get("date");
    setDate(queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : null);
    setOverdueOnly(searchParams.get("overdue") === "1");
  }, [searchParams]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const visible = useMemo(() => sortTasks(tasks.filter((task) => (type === "all" || task.workType === type) && (status === "all" || task.status === status) && (!date || taskCoversDate(task, date)) && (!overdueOnly || Boolean(task.deadline && task.deadline < today && task.status !== "completed")) && (owner === "all" || task.assigneeIds.includes(owner)) && (`${task.title} ${task.owner}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), sortKey, sortDirection), [tasks, type, status, date, overdueOnly, today, owner, query, sortDirection, sortKey]);

  return <WorkspaceShell title="Tất cả công việc"><WorkspaceState><div className="page-heading"><div><small>WORKSPACE / TASKS</small><h1>Tất cả công việc</h1><p>Quản lý toàn bộ nội dung, deadline và người phụ trách.</p></div><div className="page-heading-actions"><Link className="secondary" href="/calendar">Xem lịch</Link><button className="primary" onClick={() => setCreating(true)}>＋ Tạo công việc</button></div></div><section className="task-controls" aria-label="Tìm kiếm và lọc công việc"><div className="task-toolbar"><div className="tabs">{(["all", "inhouse", "outsource"] as const).map((item) => <button key={item} className={type === item ? "tab active" : "tab"} onClick={() => setType(item)}>{item === "all" ? `Tất cả (${tasks.length})` : `${workTypeLabels[item]} (${tasks.filter((task) => task.workType === item).length})`}</button>)}</div><div className="task-view-toggle" aria-label="Chế độ hiển thị công việc"><button type="button" aria-pressed={view === "sheet"} className={view === "sheet" ? "active" : ""} onClick={() => setView("sheet")}>Bảng tính</button><button type="button" aria-pressed={view === "kanban"} className={view === "kanban" ? "active" : ""} onClick={() => setView("kanban")}>Kanban</button><button type="button" aria-pressed={view === "table"} className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Danh sách</button></div><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Tìm công việc hoặc người phụ trách" placeholder="Tìm công việc, người phụ trách…" /></label></div><div className="filters"><label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as "all" | TaskStatus)}><option value="all">Tất cả trạng thái</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Người phụ trách<select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="all">Tất cả thành viên</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Sắp xếp<select value={sortKey} onChange={(event) => setSortKey(event.target.value as TaskSortKey)}>{TASK_SORT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><button className="secondary sort-direction" onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")} aria-label={sortDirection === "asc" ? "Đổi sang sắp xếp giảm dần" : "Đổi sang sắp xếp tăng dần"}>{sortDirection === "asc" ? "↑ Tăng dần" : "↓ Giảm dần"}</button><button className="secondary" onClick={() => { setType("all"); setStatus("all"); setOwner("all"); setQuery(""); setDate(null); setOverdueOnly(false); setSortKey("deadline"); setSortDirection("asc"); }}>Xoá bộ lọc</button></div><div className="task-results-summary" role="status"><strong>{visible.length}</strong> / {tasks.length} công việc{(query || status !== "all" || owner !== "all" || type !== "all" || date || overdueOnly) ? ` phù hợp với bộ lọc${date ? ` · ${date}` : ""}${overdueOnly ? " · quá hạn" : ""}` : " trong workspace"}</div></section>{view === "sheet" ? <TaskSheet items={visible} openTaskId={searchParams.get("task")} onTaskOpened={() => router.replace("/tasks", { scroll: false })} onCreate={() => setCreating(true)}/> : view === "kanban" ? <TaskKanban items={visible} openTaskId={searchParams.get("task")} onTaskOpened={() => router.replace("/tasks", { scroll: false })}/> : <TaskTable items={visible} openTaskId={searchParams.get("task")} onTaskOpened={() => router.replace("/tasks", { scroll: false })}/>}</WorkspaceState>{creating && <TaskFormModal onClose={() => setCreating(false)} />}</WorkspaceShell>;
}
