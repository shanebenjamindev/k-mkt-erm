"use client";

import { useMemo, useState } from "react";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { WorkspaceState } from "../components/WorkspaceState";
import { TaskFormModal } from "../components/TaskFormModal";
import { formatDateRange } from "../components/TaskTable";
import { useWorkspace } from "../components/WorkspaceProvider";
import { statusLabels, type Task } from "../../lib/types";

type BriefFilter = "all" | "missing" | "review" | "delivered";

export default function BriefsPage() {
  const { tasks } = useWorkspace();
  const [filter, setFilter] = useState<BriefFilter>("all");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const filtered = useMemo(() => tasks.filter((task) => filter === "all" || (filter === "missing" && !task.brief.trim()) || (filter === "review" && task.status === "pending_review") || (filter === "delivered" && task.status === "completed")), [tasks, filter]);
  const counts: Record<BriefFilter, number> = { all: tasks.length, missing: tasks.filter((task) => !task.brief.trim()).length, review: tasks.filter((task) => task.status === "pending_review").length, delivered: tasks.filter((task) => task.status === "completed").length };
  const options: [BriefFilter, string][] = [["all", "Tất cả tài liệu"], ["missing", "Chưa có brief"], ["review", "Đang chờ duyệt"], ["delivered", "Đã bàn giao"]];
  return <WorkspaceShell title="Brief & tài liệu"><WorkspaceState><div className="page-heading"><div><small>WORKSPACE / DOCUMENTS</small><h1>Brief & tài liệu</h1><p>Tập trung brief, caption, link thiết kế và file bàn giao.</p></div><button className="primary" onClick={() => setCreating(true)}>＋ Tạo brief</button></div><div className="document-layout"><aside className="document-tabs">{options.map(([value, label]) => <button key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{label}<b>{counts[value]}</b></button>)}</aside><div className="document-list">{filtered.length ? filtered.map((task) => <button className="document-card interactive" key={task.id} onClick={() => setEditing(task)}><div className="file-icon">▤</div><div><small>{task.code} · {task.format || "Chưa xác định"}</small><h3>{task.title}</h3><p>{task.brief || "Chưa có brief — nhấp để bổ sung"}</p></div><span className={`status ${task.status}`}>{statusLabels[task.status]}</span><b>{formatDateRange(task.startDate, task.deadline)}</b></button>) : <div className="empty-panel">Không có tài liệu phù hợp với bộ lọc này.</div>}</div></div></WorkspaceState>{creating && <TaskFormModal onClose={() => setCreating(false)} />}{editing && <TaskFormModal task={editing} onClose={() => setEditing(null)} />}</WorkspaceShell>;
}
