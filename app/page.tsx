"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceShell } from "./components/WorkspaceShell";
import { WorkspaceState } from "./components/WorkspaceState";
import { TaskTable } from "./components/TaskTable";
import { TaskFormModal } from "./components/TaskFormModal";
import { useWorkspace } from "./components/WorkspaceProvider";
import { WorkloadCard } from "./components/WorkloadCard";
import { useAuth } from "./components/AuthProvider";
import { statusLabels, taskCoversDate, taskStartDate, type Task, type TaskStatus } from "../lib/types";

type StatusChartView = "bar" | "donut" | "list";
type WeekChartView = "bar" | "line" | "list";
const statuses: TaskStatus[] = ["todo", "in_progress", "pending_review", "completed"];
const statusColors: Record<TaskStatus, string> = { todo: "#8492a6", in_progress: "#3984d8", pending_review: "#d78c18", completed: "#269461" };
const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const STATUS_CHART_VIEWS: StatusChartView[] = ["bar", "donut", "list"];
const WEEK_CHART_VIEWS: WeekChartView[] = ["bar", "line", "list"];

export default function Dashboard() {
  const { tasks } = useWorkspace();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const today = todayIso();
  const stats = useMemo(() => {
    const completed = tasks.filter((task) => task.status === "completed").length;
    const open = tasks.filter((task) => task.status !== "completed");
    const overdue = open.filter((task) => Boolean(task.deadline && task.deadline < today));
    const dueSoon = open.filter((task) => Boolean(task.deadline && task.deadline >= today && daysUntil(task.deadline, today) <= 3));
    return {
      total: tasks.length,
      inProgress: tasks.filter((task) => task.status === "in_progress").length,
      completed,
      attention: open.filter((task) => task.status === "pending_review" || Boolean(task.deadline && task.deadline >= today && daysUntil(task.deadline, today) <= 3)).length,
      open: open.length,
      overdue: overdue.length,
      completionRate: tasks.length ? Math.round(completed / tasks.length * 100) : 0,
      dueSoon: dueSoon.length,
      inHouse: tasks.filter((task) => task.workType === "inhouse").length,
      outsource: tasks.filter((task) => task.workType === "outsource").length
    };
  }, [tasks, today]);
  const todayLabel = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()).toLocaleUpperCase();
  const overdueTasks = tasks.filter((task) => task.status !== "completed" && task.deadline && task.deadline < today);
  const openTasks = tasks.filter((task) => task.status !== "completed");

  return <WorkspaceShell><WorkspaceState>
    <div className="intro"><div><small>{todayLabel}</small><h1>Xin chào, {user?.name || "bạn"} <i>✦</i></h1><p>Đây là tình hình công việc của phòng Marketing hôm nay.</p></div><button className="primary" onClick={() => setCreating(true)}>＋ Tạo công việc</button></div>
    <div className="stats"><Stat label="Tổng công việc" value={stats.total} note="Toàn bộ workspace"/><Stat label="Đang thực hiện" value={stats.inProgress} note={stats.total ? `${Math.round(stats.inProgress / stats.total * 100)}% tổng task` : "Chưa có task"}/><Stat label="Đã hoàn thành" value={stats.completed} note={`${stats.completionRate}% tổng công việc`}/><Stat label="Cần chú ý" value={stats.attention} note={`${stats.overdue} quá hạn · ${stats.dueSoon} sắp đến hạn`}/></div>
    <div className="dashboard-charts"><StatusChart tasks={tasks}/><WeekChart tasks={tasks}/></div>
    <EfficiencyAnalysis tasks={tasks} total={stats.total} completed={stats.completed} open={stats.open} completionRate={stats.completionRate} overdue={overdueTasks} inHouse={stats.inHouse} outsource={stats.outsource} today={today}/>
    <div className="section-title"><div><h2>Công việc của team</h2><p>Theo dõi tiến độ nội dung từ brief đến lên sóng.</p></div><Link className="view" href="/tasks">Xem tất cả →</Link></div>
    <div className="tabs"><Link className="tab active" href="/tasks">Tất cả&nbsp; {stats.total}</Link><Link className="tab" href="/tasks?type=inhouse">In-house&nbsp; {stats.inHouse}</Link><Link className="tab" href="/tasks?type=outsource">Outsource&nbsp; {stats.outsource}</Link></div>
    <TaskTable items={tasks.slice(0, 5)}/><div className={user?.accessRole === "admin" ? "lower" : "lower single-card"}><ProductionCard tasks={tasks}/>{user?.accessRole === "admin" && <WorkloadCard/>}</div>
  </WorkspaceState>{creating && <TaskFormModal onClose={() => setCreating(false)} />}</WorkspaceShell>;
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="stat"><small>{label}</small><strong>{value}</strong><span>{note}</span></div>;
}

function ProductionCard({ tasks }: { tasks: Task[] }) {
  const scheduled = tasks.filter((task) => task.deadline).sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? "")).slice(0, 3);
  return <div className="card"><h2>Lịch sản xuất</h2><p>Các deadline gần nhất</p>{scheduled.length ? <div className="event-list">{scheduled.map((task) => <div className="event" key={task.id}>{task.title}<span>{taskStartDate(task)?.slice(8, 10)}/{taskStartDate(task)?.slice(5, 7)}–{task.deadline?.slice(8, 10)}/{task.deadline?.slice(5, 7)}</span></div>)}</div> : <p className="empty-copy">Chưa có deadline nào.</p>}</div>;
}

function ChartViewPicker<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return <div className="chart-view-picker" role="group" aria-label={label}>{options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} className={value === option.value ? "active" : ""} onClick={() => onChange(option.value)}>{option.label}</button>)}</div>;
}

function usePersistentChartView<T extends string>(key: string, initial: T, allowed: readonly T[]) {
  const [view, setView] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored && allowed.includes(stored as T)) setView(stored as T);
    } catch { /* Keep this chart's default when browser storage is unavailable. */ }
    setReady(true);
  }, [key, allowed]);
  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(key, view); } catch { /* The chart remains usable without persistent storage. */ }
  }, [key, ready, view]);
  return [view, setView] as const;
}

function StatusChart({ tasks }: { tasks: Task[] }) {
  const [view, setView] = usePersistentChartView<StatusChartView>("k-mkt-dashboard-status-chart-view", "bar", STATUS_CHART_VIEWS);
  const counts = statuses.map((status) => ({ status, count: tasks.filter((task) => task.status === status).length }));
  const max = Math.max(1, ...counts.map((item) => item.count));
  let cursor = 0;
  const gradient = tasks.length ? counts.map(({ status, count }) => {
    const start = cursor;
    cursor += count / tasks.length * 100;
    return `${statusColors[status]} ${start}% ${cursor}%`;
  }).join(",") : "#e8ebf1 0 100%";
  return <section className="chart-card" aria-labelledby="status-chart-title">
    <header className="chart-card-header"><div><h2 id="status-chart-title">Tiến độ theo trạng thái</h2><p>Tỷ trọng công việc hiện tại.</p></div><ChartViewPicker value={view} onChange={setView} label="Kiểu biểu đồ trạng thái" options={[{ value: "bar", label: "Cột" }, { value: "donut", label: "Vòng" }, { value: "list", label: "Số liệu" }]}/></header>
    {view === "bar" && <div className="status-chart">{counts.map(({ status, count }) => <Link href={`/tasks?status=${status}`} className="status-bar chart-mark" key={status} title={`${statusLabels[status]}: ${count} công việc`} aria-label={`Mở ${count} công việc trạng thái ${statusLabels[status]}`}><span className={`bar ${status}`} style={{ height: `${Math.max(7, count / max * 100)}%` }}><b>{count}</b></span><small>{statusLabels[status]}</small></Link>)}</div>}
    {view === "donut" && <div className="status-donut-layout"><div className="status-donut" role="img" aria-label={counts.map(({ status, count }) => `${statusLabels[status]} ${count}`).join(", ")} style={{ background: `conic-gradient(${gradient})` }}><span><b>{tasks.length}</b><small>công việc</small></span></div><div className="status-donut-legend">{counts.map(({ status, count }) => <Link href={`/tasks?status=${status}`} key={status} title={`Xem ${count} công việc ${statusLabels[status]}`}><i style={{ background: statusColors[status] }}/><span>{statusLabels[status]}</span><b>{count}</b></Link>)}</div></div>}
    {view === "list" && <div className="chart-number-list">{counts.map(({ status, count }) => <Link href={`/tasks?status=${status}`} key={status}><i style={{ background: statusColors[status] }}/><span>{statusLabels[status]}</span><b>{count}</b><small>{tasks.length ? Math.round(count / tasks.length * 100) : 0}%</small></Link>)}</div>}
  </section>;
}

function WeekChart({ tasks }: { tasks: Task[] }) {
  const [view, setView] = usePersistentChartView<WeekChartView>("k-mkt-dashboard-week-chart-view", "bar", WEEK_CHART_VIEWS);
  const dates = Array.from({ length: 7 }, (_, index) => toIso(addDays(startOfWeek(parseIsoDate(todayIso())), index)));
  const values = dates.map((date) => tasks.filter((task) => taskCoversDate(task, date)).length);
  const max = Math.max(1, ...values);
  const points = values.map((value, index) => `${40 + index * 103.3},${132 - value / max * 100}`).join(" ");
  const busiest = Math.max(0, ...values);
  return <section className="chart-card" aria-labelledby="week-chart-title">
    <header className="chart-card-header"><div><h2 id="week-chart-title">Sản lượng theo ngày</h2><p>Số task đang diễn ra trong tuần này.</p></div><ChartViewPicker value={view} onChange={setView} label="Kiểu biểu đồ sản lượng" options={[{ value: "bar", label: "Cột" }, { value: "line", label: "Đường" }, { value: "list", label: "Số liệu" }]}/></header>
    {view === "bar" && <div className="week-chart">{dates.map((date, index) => <Link href={`/tasks?date=${date}`} className="week-bar chart-mark" key={date} title={`${formatDate(date)}: ${values[index]} công việc`} aria-label={`Xem ${values[index]} công việc ngày ${formatDate(date)}`}><span style={{ height: `${Math.max(7, values[index] / max * 100)}%` }}><b>{values[index]}</b></span><small>{weekdays[index]}</small></Link>)}</div>}
    {view === "line" && <div className="week-line-wrap"><svg className="week-line-chart" viewBox="0 0 700 160" role="img" aria-label="Biểu đồ đường số công việc theo ngày"><line x1="30" y1="132" x2="670" y2="132"/><line x1="30" y1="82" x2="670" y2="82"/><line x1="30" y1="32" x2="670" y2="32"/><polyline points={points}/>{values.map((value, index) => <Link key={dates[index]} href={`/tasks?date=${dates[index]}`} aria-label={`${formatDate(dates[index])}: ${value} công việc`}><circle cx={40 + index * 103.3} cy={132 - value / max * 100} r="8"><title>{formatDate(dates[index])}: {value} công việc</title></circle></Link>)}</svg><div className="week-line-labels">{weekdays.map((day, index) => <Link key={dates[index]} href={`/tasks?date=${dates[index]}`} title={`Xem ${values[index]} task · ${formatDate(dates[index])}`}>{day}<b>{values[index]}</b></Link>)}</div></div>}
    {view === "list" && <div className="chart-number-list week-number-list">{dates.map((date, index) => <Link href={`/tasks?date=${date}`} key={date}><i className="week-dot"/><span>{weekdays[index]} · {formatDate(date)}</span><b>{values[index]}</b><small>{busiest ? Math.round(values[index] / busiest * 100) : 0}% cao điểm</small></Link>)}</div>}
  </section>;
}

function EfficiencyAnalysis({ tasks, total, completed, open, completionRate, overdue, inHouse, outsource, today }: { tasks: Task[]; total: number; completed: number; open: number; completionRate: number; overdue: Task[]; inHouse: number; outsource: number; today: string }) {
  const deadlineDates = Array.from({ length: 7 }, (_, index) => toIso(addDays(startOfWeek(parseIsoDate(today)), index)));
  const daily = deadlineDates.map((date) => tasks.filter((task) => taskCoversDate(task, date)).length);
  const peak = Math.max(0, ...daily);
  const peakIndex = daily.indexOf(peak);
  const efficiencyMessage = !total ? "Tạo công việc đầu tiên để bắt đầu theo dõi hiệu quả." : overdue.length ? `${overdue.length} công việc đang quá hạn. Ưu tiên rà soát người phụ trách và deadline của các task này.` : completionRate >= 70 ? "Tỷ lệ hoàn thành đang tốt. Tiếp tục theo dõi các deadline gần để duy trì nhịp bàn giao." : open ? "Phần lớn công việc vẫn đang mở. Chia nhỏ ưu tiên theo deadline và rà soát các task chờ duyệt." : "Toàn bộ công việc hiện đã hoàn thành.";
  return <section className="efficiency-card"><div className="efficiency-heading"><div><small>WORKSPACE / INSIGHTS</small><h2>Phân tích hiệu quả</h2><p>Tóm tắt được tính trực tiếp từ dữ liệu công việc hiện tại.</p></div><span className="efficiency-period">Tuần này</span></div><div className="efficiency-metrics"><Link href="/tasks?status=completed"><small>Hoàn thành</small><strong>{completionRate}%</strong><span>{completed} / {total} công việc</span></Link><Link href="/tasks?overdue=1"><small>Quá hạn</small><strong>{overdue.length}</strong><span>Công việc chưa hoàn thành</span></Link><div><small>Phân công</small><strong>{inHouse} / {outsource}</strong><span>In-house / Outsource</span></div><div><small>Ngày cao điểm</small><strong>{peak ? weekdays[peakIndex] : "—"}</strong><span>{peak ? `${peak} công việc đang diễn ra` : "Chưa có dữ liệu tuần"}</span></div></div><div className="efficiency-insight"><span aria-hidden="true">✦</span><p>{efficiencyMessage}</p>{overdue.length > 0 && <Link href="/tasks?overdue=1">Xem task quá hạn →</Link>}</div></section>;
}

function todayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function daysUntil(date: string, today: string) { return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000); }
function parseIsoDate(date: string) { return new Date(`${date}T12:00:00Z`); }
function toIso(date: Date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`; }
function addDays(date: Date, amount: number) { const value = new Date(date); value.setUTCDate(value.getUTCDate() + amount); return value; }
function startOfWeek(date: Date) { const value = new Date(date); value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7)); return value; }
function formatDate(date: string) { const [year, month, day] = date.split("-"); return `${day}/${month}/${year}`; }
