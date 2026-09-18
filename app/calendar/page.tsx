"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { statusLabels, taskStartDate, type Task, type TaskStatus } from "../../lib/types";
import { TaskFormModal } from "../components/TaskFormModal";
import { useWorkspace } from "../components/WorkspaceProvider";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { WorkspaceState } from "../components/WorkspaceState";

const dayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const timeSlots = ["09:00", "11:00", "13:00", "15:00", "17:00"];
type CalendarView = "day" | "week" | "month" | "year";

/** A normalized event is keyed by taskId, never by title. */
type CalendarEvent = {
  taskId: string;
  task: Task;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  status: TaskStatus;
  assigneeId: string | null;
  owner: string;
};
type PositionedEvent = { event: CalendarEvent; row: number; startColumn: number; endColumn: number; lane: number; lanes: number };
type PositionedMonthEvent = { event: CalendarEvent; weekIndex: number; startColumn: number; endColumn: number; lane: number; lanes: number };

export default function CalendarPage() {
  const { tasks, loading } = useWorkspace();
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(() => toIso(new Date()));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const hasSelectedInitialDate = useRef(false);
  const events = useMemo(() => mergeCalendarEvents(normalizeEvents(tasks)), [tasks]);
  const unscheduledCount = tasks.filter((task) => !task.deadline).length;

  useEffect(() => {
    if (loading || hasSelectedInitialDate.current) return;
    hasSelectedInitialDate.current = true;
    const today = toIso(new Date());
    const next = events.filter((event) => event.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? events.at(-1);
    if (next) setCurrentDate(next.startDate);
  }, [events, loading]);

  const focusTask = (task: Task) => {
    const start = taskStartDate(task);
    if (start) setCurrentDate(start);
  };
  const go = (amount: number) => setCurrentDate((date) => {
    if (view === "day") return addDays(date, amount);
    if (view === "week") return addDays(date, amount * 7);
    if (view === "month") return shiftMonth(date, amount);
    return shiftYear(date, amount);
  });

  return <WorkspaceShell title="Lịch sản xuất">
    <WorkspaceState>
      <div className="page-heading"><div><small>WORKSPACE / CALENDAR</small><h1>Lịch sản xuất</h1><p>Xem tiến độ theo ngày, tuần, tháng hoặc toàn năm.</p></div><button className="primary" onClick={() => setCreating(true)}>＋ Thêm lịch</button></div>
      {unscheduledCount > 0 && <div className="calendar-missing-deadline"><span><b>{unscheduledCount} công việc</b> cũ chưa có deadline nên chưa thể đặt lên lịch.</span><Link href="/tasks">Bổ sung deadline</Link></div>}
      <div className="calendar-summary"><div><strong>{viewLabel(view, currentDate)}</strong><span>{events.filter((event) => intersects(event, visibleDays(view, currentDate))).length} công việc trong phạm vi đang xem</span></div><div className="calendar-controls"><div className="calendar-view-toggle" aria-label="Chế độ xem lịch">{(["day", "week", "month", "year"] as CalendarView[]).map((mode) => <button type="button" className={view === mode ? "active" : ""} onClick={() => setView(mode)} key={mode}>{({ day: "Ngày", week: "Tuần", month: "Tháng", year: "Năm" })[mode]}</button>)}</div><button className="secondary" onClick={() => go(-1)}>←</button><button className="secondary" onClick={() => setCurrentDate(toIso(new Date()))}>Hôm nay</button><button className="secondary" onClick={() => go(1)}>→</button></div></div>
      {view === "year" ? <YearView date={currentDate} events={events} onPickDate={(date) => { setCurrentDate(date); setView("day"); }} /> : view === "month" ? <MonthView date={currentDate} events={events} onSelect={setEditing} /> : <TimeGridView days={visibleDays(view, currentDate)} events={events} onSelect={setEditing} />}
      <p className="calendar-note">Task được nhận diện bằng mã task, không phải tên. Một khoảng ngày liên tục chỉ tạo một block; block chỉ tách ở ranh giới hàng của lịch tháng hoặc khi dữ liệu có khoảng trống.</p>
    </WorkspaceState>
    {creating && <TaskFormModal onClose={() => setCreating(false)} onSaved={focusTask} />}
    {editing && <TaskFormModal task={editing} onClose={() => setEditing(null)} onSaved={focusTask} />}
  </WorkspaceShell>;
}

function TimeGridView({ days, events, onSelect }: { days: string[]; events: CalendarEvent[]; onSelect: (task: Task) => void }) {
  const inView = useMemo(() => events.filter((event) => intersects(event, days)), [days, events]);
  const placed = useMemo(() => placeEventsInDays(inView, days), [days, inView]);
  return <div className="calendar-board schedule-board"><div className={`schedule-inner ${days.length === 1 ? "day-schedule" : ""}`}>
    <div className="schedule-header" style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(${days.length === 1 ? 0 : 140}px, 1fr))` }}><span className="time-header">Giờ</span>{days.map((date, index) => <div className={isToday(date) ? "schedule-day-heading today" : "schedule-day-heading"} key={date}><b>{days.length === 1 ? dayLongName(date) : dayNames[index]}</b><span>{date.slice(8, 10)}</span></div>)}</div>
    <div className="schedule-body"><div className="time-column">{timeSlots.map((time) => <span key={time}>{time}</span>)}</div><div className="schedule-grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(${days.length === 1 ? 0 : 140}px, 1fr))` }}>
      {days.map((date, index) => <div className={isToday(date) ? "schedule-day-guide today" : "schedule-day-guide"} style={{ gridColumn: index + 1 }} key={date} />)}
      {placed.map(({ event, row, startColumn, endColumn, lane, lanes }) => {
        const availableHeight = 102 / lanes;
        return <button type="button" className={`schedule-task status-${event.status}`} style={{ gridRow: row + 1, gridColumn: `${startColumn + 1} / ${endColumn + 2}`, height: `${availableHeight}px`, marginTop: `${5 + lane * availableHeight}px` }} key={`${event.taskId}-${startColumn}-${endColumn}`} onClick={() => onSelect(event.task)} aria-label={`Chỉnh sửa ${event.title}`}><strong>{event.title}</strong><small>{rangeLabel(event)} · {event.startTime} – {event.endTime}</small><span>{event.owner} · {statusLabels[event.status]}</span></button>;
      })}
    </div></div>
  </div></div>;
}

function MonthView({ date, events, onSelect }: { date: string; events: CalendarEvent[]; onSelect: (task: Task) => void }) {
  const days = useMemo(() => calendarDays(monthStart(date)), [date]);
  const placed = useMemo(() => placeMonthEvents(events, days), [days, events]);
  return <div className="month-board"><div className="month-weekdays">{dayNames.map((day) => <span key={day}>{day}</span>)}</div><div className="month-grid">
    {days.map((day) => <button type="button" className={`${day.slice(0, 7) === date.slice(0, 7) ? "" : "outside"} ${isToday(day) ? "today" : ""}`.trim()} key={day}><b>{day.slice(8, 10)}</b></button>)}
    <div className="month-event-layer">{placed.map(({ event, weekIndex, startColumn, endColumn, lane }) => <button type="button" className={`month-task status-${event.status}`} style={{ gridRow: weekIndex + 1, gridColumn: `${startColumn + 1} / ${endColumn + 2}`, marginTop: `${30 + lane * 29}px` }} key={`${event.taskId}-${weekIndex}-${startColumn}-${endColumn}`} onClick={() => onSelect(event.task)}><span>{event.startTime}–{event.endTime}</span><strong>{event.title}</strong></button>)}</div>
  </div></div>;
}

function YearView({ date, events, onPickDate }: { date: string; events: CalendarEvent[]; onPickDate: (date: string) => void }) {
  const year = date.slice(0, 4);
  return <div className="year-board">{Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}-01`;
    const days = calendarDays(month);
    return <section className="year-month" key={month}><h2>{new Intl.DateTimeFormat("vi-VN", { month: "long", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`))}</h2><div className="year-weekdays">{dayNames.map((name) => <span key={name}>{name.slice(0, 1)}</span>)}</div><div className="year-days">{days.map((day) => {
      const count = events.filter((event) => event.startDate <= day && day <= event.endDate).length;
      return <button type="button" className={`${day.slice(0, 7) === month.slice(0, 7) ? "" : "outside"} ${isToday(day) ? "today" : ""} ${count ? "has-events" : ""}`.trim()} onClick={() => onPickDate(day)} key={day}>{day.slice(8, 10)}{count ? <i>{count}</i> : null}</button>;
    })}</div></section>;
  })}</div>;
}

function normalizeEvents(tasks: Task[]): CalendarEvent[] {
  return tasks.flatMap((task) => {
    const startDate = taskStartDate(task);
    if (!startDate || !task.deadline) return [];
    return [{ taskId: task.id, task, title: task.title, startDate, endDate: task.deadline, startTime: task.startTime, endTime: task.endTime, status: task.status, assigneeId: null, owner: task.owner }];
  });
}

/** Merge only records for the exact task id with an uninterrupted compatible range. */
function mergeCalendarEvents(events: CalendarEvent[]) {
  const output: CalendarEvent[] = [];
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = `${event.taskId}|${event.startTime}|${event.status}|${event.assigneeId ?? ""}|${event.owner}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  for (const group of groups.values()) {
    for (const event of [...group].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
      const previous = output.at(-1);
      const compatible = previous && previous.taskId === event.taskId && previous.startTime === event.startTime && previous.status === event.status && previous.assigneeId === event.assigneeId && previous.owner === event.owner;
      if (compatible && event.startDate <= addDays(previous.endDate, 1)) previous.endDate = event.endDate > previous.endDate ? event.endDate : previous.endDate;
      else output.push({ ...event });
    }
  }
  return output;
}

function placeEventsInDays(events: CalendarEvent[], days: string[]): PositionedEvent[] {
  const groups = new Map<number, Array<Omit<PositionedEvent, "lane" | "lanes">>>();
  for (const event of events) {
    const startColumn = Math.max(0, days.findIndex((date) => date >= event.startDate));
    const reverseIndex = [...days].reverse().findIndex((date) => date <= event.endDate);
    if (startColumn < 0 || reverseIndex < 0) continue;
    const endColumn = days.length - 1 - reverseIndex;
    const row = Math.max(0, timeSlots.indexOf(event.startTime));
    groups.set(row, [...(groups.get(row) ?? []), { event, row, startColumn, endColumn }]);
  }
  const placed: PositionedEvent[] = [];
  for (const group of groups.values()) {
    const laneEnds: number[] = [];
    const assigned = [...group].sort((a, b) => a.startColumn - b.startColumn || a.endColumn - b.endColumn).map((item) => {
      let lane = laneEnds.findIndex((end) => end < item.startColumn);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(-1); }
      laneEnds[lane] = item.endColumn;
      return { ...item, lane };
    });
    placed.push(...assigned.map((item) => ({ ...item, lanes: laneEnds.length })));
  }
  return placed;
}

function placeMonthEvents(events: CalendarEvent[], days: string[]): PositionedMonthEvent[] {
  const placed: PositionedMonthEvent[] = [];
  for (let weekIndex = 0; weekIndex < 6; weekIndex += 1) {
    const week = days.slice(weekIndex * 7, weekIndex * 7 + 7);
    const intervals = events.flatMap((event) => {
      if (!intersects(event, week)) return [];
      const startColumn = Math.max(0, week.findIndex((day) => day >= event.startDate));
      const reverseIndex = [...week].reverse().findIndex((day) => day <= event.endDate);
      if (startColumn < 0 || reverseIndex < 0) return [];
      return [{ event, startColumn, endColumn: 6 - reverseIndex }];
    }).sort((a, b) => a.startColumn - b.startColumn || a.endColumn - b.endColumn);
    const laneEnds: number[] = [];
    const assigned = intervals.map((item) => {
      let lane = laneEnds.findIndex((end) => end < item.startColumn);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(-1); }
      laneEnds[lane] = item.endColumn;
      return { ...item, lane };
    });
    placed.push(...assigned.map((item) => ({ ...item, weekIndex, lanes: laneEnds.length })));
  }
  return placed;
}

function visibleDays(view: CalendarView, date: string) { if (view === "day") return [date]; if (view === "week") return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(date), index)); if (view === "month") return calendarDays(monthStart(date)); return Array.from({ length: 366 }, (_, index) => addDays(`${date.slice(0, 4)}-01-01`, index)).filter((item) => item.startsWith(date.slice(0, 4))); }
function intersects(event: CalendarEvent, days: string[]) { return Boolean(days.length && event.startDate <= days.at(-1)! && event.endDate >= days[0]); }
function rangeLabel(event: CalendarEvent) { return event.startDate === event.endDate ? "Deadline" : `${event.startDate.slice(8, 10)}/${event.startDate.slice(5, 7)} – ${event.endDate.slice(8, 10)}/${event.endDate.slice(5, 7)}`; }
function dayLongName(date: string) { return new Intl.DateTimeFormat("vi-VN", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)).replace("thứ ", "T").toLocaleUpperCase(); }
function viewLabel(view: CalendarView, date: string) { if (view === "day") return new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); if (view === "week") { const week = visibleDays("week", date); return `${formatDate(week[0])} – ${formatDate(week[6])}`; } if (view === "month") return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthStart(date)}T00:00:00Z`)); return date.slice(0, 4); }
function addDays(date: string, amount: number) { const value = new Date(`${date}T00:00:00`); value.setDate(value.getDate() + amount); return toIso(value); }
function toIso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function startOfWeek(date: string | Date) { const value = typeof date === "string" ? new Date(`${date}T00:00:00`) : new Date(date); value.setDate(value.getDate() - ((value.getDay() + 6) % 7)); return toIso(value); }
function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }
function shiftMonth(date: string, amount: number) { const value = new Date(`${monthStart(date)}T00:00:00`); value.setMonth(value.getMonth() + amount); return toIso(value); }
function shiftYear(date: string, amount: number) { return `${Number(date.slice(0, 4)) + amount}${date.slice(4)}`; }
function calendarDays(month: string) { const first = new Date(`${month}T00:00:00`); first.setDate(first.getDate() - ((first.getDay() + 6) % 7)); return Array.from({ length: 42 }, (_, index) => addDays(toIso(first), index)); }
function isToday(date: string) { return toIso(new Date()) === date; }
function formatDate(date: string) { return new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); }
