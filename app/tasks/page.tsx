"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { TaskTable } from "../components/TaskTable";
import { TaskFormModal } from "../components/TaskFormModal";
import { WorkspaceState } from "../components/WorkspaceState";
import { useWorkspace } from "../components/WorkspaceProvider";
import { statusLabels, workTypeLabels, type TaskStatus, type WorkType } from "../../lib/types";

export default function TasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { tasks, members } = useWorkspace();
  const [type, setType] = useState<"all" | WorkType>("all");
  const [status, setStatus] = useState<"all" | TaskStatus>("all");
  const [owner, setOwner] = useState("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => { const queryType = searchParams.get("type"); if (searchParams.get("new") === "1") setCreating(true); if (queryType === "inhouse" || queryType === "outsource") setType(queryType); }, [searchParams]);
  const visible = useMemo(() => tasks.filter((task) => (type === "all" || task.workType === type) && (status === "all" || task.status === status) && (owner === "all" || task.owner === owner) && (`${task.code} ${task.title} ${task.owner}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [tasks, type, status, owner, query]);

  return <WorkspaceShell title="Tất cả công việc"><WorkspaceState><div className="page-heading"><div><small>WORKSPACE / TASKS</small><h1>Tất cả công việc</h1><p>Quản lý toàn bộ nội dung, deadline và người phụ trách.</p></div><button className="primary" onClick={() => setCreating(true)}>＋ Tạo công việc</button></div><div className="task-toolbar"><div className="tabs">{(["all", "inhouse", "outsource"] as const).map((item) => <button key={item} className={type === item ? "tab active" : "tab"} onClick={() => setType(item)}>{item === "all" ? `Tất cả (${tasks.length})` : `${workTypeLabels[item]} (${tasks.filter((task) => task.workType === item).length})`}</button>)}</div><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm task, người phụ trách..." /></label></div><div className="filters"><label>Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as "all" | TaskStatus)}><option value="all">Tất cả trạng thái</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Người phụ trách<select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="all">Tất cả thành viên</option>{members.map((member) => <option key={member.id} value={member.name}>{member.name}</option>)}</select></label><button className="secondary" onClick={() => { setType("all"); setStatus("all"); setOwner("all"); setQuery(""); }}>Xoá bộ lọc</button></div><TaskTable items={visible} openTaskId={searchParams.get("task")} onTaskOpened={() => router.replace("/tasks", { scroll: false })}/></WorkspaceState>{creating && <TaskFormModal onClose={() => setCreating(false)} />}</WorkspaceShell>;
}
