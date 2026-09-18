"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { WorkspaceState } from "./components/WorkspaceState";
import { TaskTable } from "./components/TaskTable";
import { TaskFormModal } from "./components/TaskFormModal";
import { useWorkspace } from "./components/WorkspaceProvider";
import { WorkloadCard } from "./components/WorkloadCard";
import { useAuth } from "./components/AuthProvider";
import { statusLabels, taskCoversDate, taskStartDate, type TaskStatus } from "../lib/types";

export default function Dashboard() {
  const { tasks } = useWorkspace();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const stats = useMemo(() => ({
    total: tasks.length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    completed: tasks.filter((task) => task.status === "completed").length,
    attention: tasks.filter((task) => task.status !== "completed" && (task.status === "pending_review" || Boolean(task.deadline && daysUntil(task.deadline) <= 2))).length
  }), [tasks]);
  const inHouse = tasks.filter((task) => task.workType === "inhouse").length;
  const outsource = tasks.filter((task) => task.workType === "outsource").length;
  const today = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()).toLocaleUpperCase();

  return <WorkspaceShell><WorkspaceState><div className="intro"><div><small>{today}</small><h1>Xin chào, {user?.name || "bạn"} <i>✦</i></h1><p>Đây là tình hình công việc của phòng Marketing hôm nay.</p></div><button className="primary" onClick={() => setCreating(true)}>＋ Tạo công việc</button></div><div className="stats"><Stat label="Tổng công việc" value={stats.total} note="Toàn bộ workspace"/><Stat label="Đang thực hiện" value={stats.inProgress} note={stats.total ? `${Math.round(stats.inProgress / stats.total * 100)}% tổng task` : "Chưa có task"}/><Stat label="Đã hoàn thành" value={stats.completed} note="Đã được bàn giao"/><Stat label="Cần chú ý" value={stats.attention} note="Chờ duyệt hoặc gần hạn"/></div><div className="dashboard-charts"><StatusChart/><WeekChart/></div><div className="section-title"><div><h2>Công việc của team</h2><p>Theo dõi tiến độ nội dung từ brief đến lên sóng.</p></div><Link className="view" href="/tasks">Xem tất cả →</Link></div><div className="tabs"><Link className="tab active" href="/tasks">Tất cả&nbsp; {stats.total}</Link><Link className="tab" href="/tasks?type=inhouse">In-house&nbsp; {inHouse}</Link><Link className="tab" href="/tasks?type=outsource">Outsource&nbsp; {outsource}</Link></div><TaskTable items={tasks.slice(0, 5)}/><div className={user?.accessRole === "admin" ? "lower" : "lower single-card"}><ProductionCard/>{user?.accessRole === "admin" && <WorkloadCard/>}</div></WorkspaceState>{creating && <TaskFormModal onClose={() => setCreating(false)} />}</WorkspaceShell>;
}

function daysUntil(date: string) { return Math.ceil((new Date(`${date}T23:59:59`).getTime() - Date.now()) / 86_400_000); }
function Stat({ label, value, note }: { label: string; value: number; note: string }) { return <div className="stat"><small>{label}</small><strong>{value}</strong><span>{note}</span></div>; }
function ProductionCard() { const { tasks } = useWorkspace(); const scheduled = tasks.filter((task) => task.deadline).slice(0, 3); return <div className="card"><h2>Lịch sản xuất</h2><p>Các deadline gần nhất</p>{scheduled.length ? <div className="event-list">{scheduled.map((task) => <div className="event" key={task.id}>{task.title}<span>{taskStartDate(task)?.slice(8, 10)}/{taskStartDate(task)?.slice(5, 7)}–{task.deadline?.slice(8, 10)}/{task.deadline?.slice(5, 7)}</span></div>)}</div> : <p className="empty-copy">Chưa có deadline nào.</p>}</div>; }
function StatusChart() { const { tasks } = useWorkspace(); const statuses: TaskStatus[] = ["todo", "in_progress", "pending_review", "completed"]; const counts = statuses.map((status) => ({ status, count: tasks.filter((task) => task.status === status).length })); const max = Math.max(1, ...counts.map((item) => item.count)); return <section className="chart-card"><div><h2>Tiến độ theo trạng thái</h2><p>Tỷ trọng công việc hiện tại.</p></div><div className="status-chart">{counts.map(({ status, count }) => <div className="status-bar" key={status}><span className={`bar ${status}`} style={{ height: `${Math.max(8, count / max * 100)}%` }}><b>{count}</b></span><small>{statusLabels[status]}</small></div>)}</div></section>; }
function WeekChart() { const { tasks } = useWorkspace(); const dates = Array.from({ length: 7 }, (_, index) => toIso(addDays(startOfWeek(new Date()), index))); const values = dates.map((date) => tasks.filter((task) => taskCoversDate(task, date)).length); const max = Math.max(1, ...values); return <section className="chart-card"><div><h2>Sản lượng theo ngày</h2><p>Số task đang diễn ra trong tuần này.</p></div><div className="week-chart">{dates.map((date, index) => <div className="week-bar" key={date}><span style={{ height: `${Math.max(8, values[index] / max * 100)}%` }}><b>{values[index]}</b></span><small>{["T2", "T3", "T4", "T5", "T6", "T7", "CN"][index]}</small></div>)}</div></section>; }
function toIso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function addDays(date: Date, amount: number) { const value = new Date(date); value.setDate(value.getDate() + amount); return value; }
function startOfWeek(date: Date) { const value = new Date(date); value.setDate(value.getDate() - ((value.getDay() + 6) % 7)); return value; }
