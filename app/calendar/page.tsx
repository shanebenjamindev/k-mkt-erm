"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { calendarAlertTokens, calendarStatusPresentation, calendarWorkTypeTokens, getCalendarTaskPresentation } from "../../lib/calendar-presentation";
import { TASK_STATUSES, WORK_TYPES, taskStartDate, workTypeLabels, type Task, type TaskStatus, type WorkType } from "../../lib/types";
import { TaskFormModal } from "../components/TaskFormModal";
import { useWorkspace } from "../components/WorkspaceProvider";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { WorkspaceState } from "../components/WorkspaceState";

const dayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const timeSlots = ["09:00", "11:00", "13:00", "15:00", "17:00"];
type CalendarView = "day" | "week" | "month" | "year";

/** Normalized by task id, rather than by the title shown to people. */
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
type MultiDaySegment = {
  event: CalendarEvent;
  startColumn: number;
  endColumn: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};
type EventStyle = CSSProperties & Record<"--event-bg" | "--event-bar" | "--event-text" | "--event-completed-bg" | "--event-alert-border" | "--event-alert-bg" | "--event-alert-text", string>;

export default function CalendarPage() {
  const { tasks, loading, updateTask } = useWorkspace();
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(() => toIso(new Date()));
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<WorkType[]>([...WORK_TYPES]);
  const [visibleStatuses, setVisibleStatuses] = useState<TaskStatus[]>([...TASK_STATUSES]);
  const [actionError, setActionError] = useState<string | null>(null);
  const hasSelectedInitialDate = useRef(false);
  const events = useMemo(() => mergeCalendarEvents(normalizeEvents(tasks)), [tasks]);
  const filteredEvents = useMemo(() => events.filter((event) => visibleTypes.includes(event.task.workType) && visibleStatuses.includes(event.status)), [events, visibleStatuses, visibleTypes]);
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
  const toggleType = (type: WorkType) => setVisibleTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  const toggleStatus = (status: TaskStatus) => setVisibleStatuses((current) => current.includes(status) ? current.filter((item) => item !== status) : [...current, status]);
  const changeStatus = async (task: Task, status: TaskStatus) => {
    if (task.status === status) return;
    setActionError(null);
    try { await updateTask(task.id, { status }); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Không thể đổi trạng thái công việc."); }
  };

  return <WorkspaceShell title="Lịch sản xuất">
    <WorkspaceState>
      <div className="page-heading"><div><small>WORKSPACE / CALENDAR</small><h1>Lịch sản xuất</h1><p>Xem tiến độ theo ngày, tuần, tháng hoặc toàn năm.</p></div><button className="primary" onClick={() => setCreating(true)}>＋ Thêm lịch</button></div>
      {unscheduledCount > 0 && <div className="calendar-missing-deadline"><span><b>{unscheduledCount} công việc</b> cũ chưa có deadline nên chưa thể đặt lên lịch.</span><Link href="/tasks">Bổ sung deadline</Link></div>}
      <div className="calendar-summary"><div><strong>{viewLabel(view, currentDate)}</strong><span>{filteredEvents.filter((event) => intersects(event, visibleDays(view, currentDate))).length} công việc trong phạm vi đang xem</span></div><div className="calendar-controls"><div className="calendar-view-toggle" aria-label="Chế độ xem lịch">{(["day", "week", "month", "year"] as CalendarView[]).map((mode) => <button type="button" className={view === mode ? "active" : ""} onClick={() => setView(mode)} key={mode}>{({ day: "Ngày", week: "Tuần", month: "Tháng", year: "Năm" })[mode]}</button>)}</div><button className="secondary" onClick={() => go(-1)} aria-label="Lùi lịch">←</button><button className="secondary" onClick={() => setCurrentDate(toIso(new Date()))}>Hôm nay</button><button className="secondary" onClick={() => go(1)} aria-label="Tiến lịch">→</button></div></div>
      <CalendarLegend visibleTypes={visibleTypes} visibleStatuses={visibleStatuses} onToggleType={toggleType} onToggleStatus={toggleStatus}/>
      {actionError && <p className="calendar-action-error" role="alert">{actionError}</p>}
      {view === "year" ? <YearView date={currentDate} events={filteredEvents} onPickDate={(nextDate) => { setCurrentDate(nextDate); setView("day"); }} /> : view === "month" ? <MonthView date={currentDate} events={filteredEvents} onSelect={setEditing} onQuickStatus={changeStatus} /> : <TimeGridView days={visibleDays(view, currentDate)} events={filteredEvents} onSelect={setEditing} onQuickStatus={changeStatus} />}
      <p className="calendar-note">Task được nhận diện bằng mã task, không phải tên. Công việc nhiều ngày chỉ hiển thị một block liên tục và chỉ tách tại ranh giới tuần/tháng.</p>
    </WorkspaceState>
    {creating && <TaskFormModal onClose={() => setCreating(false)} onSaved={focusTask} />}
    {editing && <TaskFormModal task={editing} onClose={() => setEditing(null)} onSaved={focusTask} />}
  </WorkspaceShell>;
}

function CalendarLegend({ visibleTypes, visibleStatuses, onToggleType, onToggleStatus }: { visibleTypes: WorkType[]; visibleStatuses: TaskStatus[]; onToggleType: (type: WorkType) => void; onToggleStatus: (status: TaskStatus) => void }) {
  return <div className="calendar-legend" aria-label="Bộ lọc lịch">
    <span className="calendar-legend-label">Loại</span>
    {WORK_TYPES.map((type) => <button type="button" className={`legend-filter type-${type} ${visibleTypes.includes(type) ? "active" : ""}`} onClick={() => onToggleType(type)} aria-pressed={visibleTypes.includes(type)} key={type}><i style={{ background: calendarWorkTypeTokens[type].bar }}/>{workTypeLabels[type]}</button>)}
    <span className="calendar-legend-divider"/>
    <span className="calendar-legend-label">Trạng thái</span>
    {TASK_STATUSES.map((status) => <button type="button" className={`legend-filter status-${status} ${visibleStatuses.includes(status) ? "active" : ""}`} onClick={() => onToggleStatus(status)} aria-pressed={visibleStatuses.includes(status)} key={status}><b>{calendarStatusPresentation[status].icon}</b>{calendarStatusPresentation[status].label}</button>)}
  </div>;
}

function TimeGridView({ days, events, onSelect, onQuickStatus }: { days: string[]; events: CalendarEvent[]; onSelect: (task: Task) => void; onQuickStatus: (task: Task, status: TaskStatus) => void }) {
  const inView = useMemo(() => events.filter((event) => intersects(event, days)), [days, events]);
  const multiDayEvents = useMemo(() => inView.filter((event) => event.startDate !== event.endDate), [inView]);
  const singleDayEvents = useMemo(() => inView.filter((event) => event.startDate === event.endDate), [inView]);
  const byCell = useMemo(() => indexSingleDayEvents(days, singleDayEvents), [days, singleDayEvents]);

  return <div className="calendar-board schedule-board"><div className="schedule-inner" style={{ "--day-count": days.length } as CSSProperties}>
    <div className="schedule-header"><span className="time-header">Giờ</span>{days.map((date, index) => <div className={isToday(date) ? "schedule-day-heading today" : "schedule-day-heading"} key={date}><b>{days.length === 1 ? dayLongName(date) : dayNames[index]}</b><span>{date.slice(8, 10)}</span></div>)}</div>
    <MultiDayLanes days={days} events={multiDayEvents} onSelect={onSelect} onQuickStatus={onQuickStatus} showAxis/>
    <div className="time-grid" role="grid" aria-label="Công việc theo thời gian">
      {timeSlots.map((time, row) => <TimeRow dateDays={days} time={time} row={row} eventsByCell={byCell} onSelect={onSelect} onQuickStatus={onQuickStatus} key={time}/>) }
    </div>
  </div></div>;
}

function TimeRow({ dateDays, time, row, eventsByCell, onSelect, onQuickStatus }: { dateDays: string[]; time: string; row: number; eventsByCell: Map<string, CalendarEvent[]>; onSelect: (task: Task) => void; onQuickStatus: (task: Task, status: TaskStatus) => void }) {
  return <><span className="time-slot-label" style={{ gridRow: row + 1 }}> {time}</span>{dateDays.map((date, dayIndex) => <TimeCell date={date} time={time} events={eventsByCell.get(`${date}|${time}`) ?? []} onSelect={onSelect} onQuickStatus={onQuickStatus} style={{ gridColumn: dayIndex + 2, gridRow: row + 1 }} key={`${date}-${time}`}/>)}</>;
}

function TimeCell({ date, time, events, onSelect, onQuickStatus, style, compact = false }: { date: string; time: string; events: CalendarEvent[]; onSelect: (task: Task) => void; onQuickStatus: (task: Task, status: TaskStatus) => void; style?: CSSProperties; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const visible = events.slice(0, 3);
  const hidden = events.slice(3);
  const nowPosition = currentTimePosition(date, time);
  return <div className={`time-slot-cell ${isToday(date) ? "today" : ""} ${compact ? "compact" : ""}`} style={style} role="gridcell">
    {visible.map((event) => <CalendarEventCard event={event} onSelect={onSelect} onQuickStatus={onQuickStatus} key={event.taskId}/>) }
    {hidden.length > 0 && <div className="calendar-more-wrap"><button className="calendar-more-button" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? "Đóng danh sách" : `+${hidden.length} việc nữa`}</button>{expanded && <div className="calendar-more-popover" role="dialog" aria-label={`Các việc lúc ${time}`}>{hidden.map((event) => <CalendarEventCard event={event} onSelect={onSelect} onQuickStatus={onQuickStatus} key={event.taskId}/>)}</div>}</div>}
    {nowPosition !== null && <span className="calendar-now-line" style={{ top: `${nowPosition}%` }} aria-label="Thời điểm hiện tại"/>}
  </div>;
}

function MultiDayLanes({ days, events, onSelect, onQuickStatus, showAxis = false, className = "" }: { days: string[]; events: CalendarEvent[]; onSelect: (task: Task) => void; onQuickStatus: (task: Task, status: TaskStatus) => void; showAxis?: boolean; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const segments = useMemo(() => placeMultiDaySegments(events, days), [days, events]);
  const hasHiddenLanes = segments.some((segment) => segment.lane >= 3);
  const visibleSegments = expanded ? segments : segments.filter((segment) => segment.lane < 3);
  if (segments.length === 0) return showAxis ? <div className="multi-day-section empty"><span className="multi-day-label">Nhiều ngày</span><div className="multi-day-grid" style={{ "--day-count": days.length } as CSSProperties}/></div> : null;
  const content = <div className={`multi-day-grid ${className}`} style={{ "--day-count": days.length } as CSSProperties}>
    {days.map((day, index) => <span className={isToday(day) ? "multi-day-guide today" : "multi-day-guide"} style={{ gridColumn: index + 1 }} key={day}/>) }
    {visibleSegments.map((segment) => <CalendarEventCard event={segment.event} onSelect={onSelect} onQuickStatus={onQuickStatus} className="multi-day-event" style={{ gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`, gridRow: segment.lane + 1 }} continuesBefore={segment.continuesBefore} continuesAfter={segment.continuesAfter} key={`${segment.event.taskId}-${segment.startColumn}-${segment.endColumn}`}/>) }
    {hasHiddenLanes && <button type="button" className="multi-day-more" style={{ gridRow: expanded ? Math.max(...segments.map((item) => item.lane)) + 2 : 4, gridColumn: "1 / -1" }} onClick={() => setExpanded((value) => !value)}>{expanded ? "Thu gọn công việc nhiều ngày" : `+${segments.filter((segment) => segment.lane >= 3).length} công việc nhiều ngày`}</button>}
  </div>;
  return showAxis ? <div className="multi-day-section"><span className="multi-day-label">Nhiều ngày</span>{content}</div> : content;
}

function CalendarEventCard({ event, onSelect, onQuickStatus, className = "", style, continuesBefore = false, continuesAfter = false }: { event: CalendarEvent; onSelect: (task: Task) => void; onQuickStatus?: (task: Task, status: TaskStatus) => void; className?: string; style?: CSSProperties; continuesBefore?: boolean; continuesAfter?: boolean }) {
  const presentation = getCalendarTaskPresentation(event.task);
  const cardStyle: EventStyle = {
    "--event-bg": presentation.type.background,
    "--event-bar": presentation.type.bar,
    "--event-text": presentation.type.text,
    "--event-completed-bg": presentation.type.completedBackground,
    "--event-alert-border": calendarAlertTokens.border,
    "--event-alert-bg": calendarAlertTokens.background,
    "--event-alert-text": calendarAlertTokens.text,
    ...style
  } as EventStyle;
  const detail = `${event.title}. ${rangeLabel(event)} · ${event.startTime} – ${event.endTime}. ${presentation.typeLabel}. ${presentation.status.label}. ${event.owner || "Chưa phân công"}${presentation.isOverdue ? ". Quá hạn" : ""}`;
  return <div className={`calendar-event-wrapper ${className} ${onQuickStatus ? "has-quick-status" : ""}`} style={cardStyle}>
  <button type="button" className={`calendar-event-card status-${event.status} ${presentation.isOverdue ? "is-overdue" : ""}`} onClick={() => onSelect(event.task)} aria-label={`Mở chi tiết: ${detail}`} title={detail}>
    <span className="event-title"><b className="event-status-icon" aria-hidden="true">{presentation.isOverdue ? "!" : presentation.status.icon}</b><strong>{continuesBefore && <em aria-label="Tiếp tục từ kỳ trước">← </em>}{event.title}{continuesAfter && <em aria-label="Tiếp tục sang kỳ sau"> →</em>}</strong></span>
    <span className="event-time">{rangeLabel(event)} · {event.startTime} – {event.endTime}</span>
    <span className="event-meta"><i className="event-type-chip">{presentation.typeLabel}</i><i className="event-status-chip">{presentation.isOverdue ? "Quá hạn" : presentation.status.label}</i><small>{event.owner || "Chưa phân công"}</small></span>
  </button>
  {onQuickStatus && <select className="event-quick-status" value={event.status} onClick={(clickEvent) => clickEvent.stopPropagation()} onChange={(changeEvent) => void onQuickStatus(event.task, changeEvent.target.value as TaskStatus)} aria-label={`Đổi trạng thái ${event.title}`}>{TASK_STATUSES.map((status) => <option value={status} key={status}>{calendarStatusPresentation[status].label}</option>)}</select>}
  </div>;
}

function MonthView({ date, events, onSelect, onQuickStatus }: { date: string; events: CalendarEvent[]; onSelect: (task: Task) => void; onQuickStatus: (task: Task, status: TaskStatus) => void }) {
  const days = useMemo(() => calendarDays(monthStart(date)), [date]);
  return <div className="month-board"><div className="month-weekdays">{dayNames.map((day) => <span key={day}>{day}</span>)}</div><div className="month-weeks">{Array.from({ length: 6 }, (_, weekIndex) => {
    const week = days.slice(weekIndex * 7, weekIndex * 7 + 7);
    const weekEvents = events.filter((event) => intersects(event, week));
    const multi = weekEvents.filter((event) => event.startDate !== event.endDate);
    const single = weekEvents.filter((event) => event.startDate === event.endDate);
    return <section className="month-week" key={week[0]}><div className="month-day-headings">{week.map((day) => <span className={`${day.slice(0, 7) === date.slice(0, 7) ? "" : "outside"} ${isToday(day) ? "today" : ""}`.trim()} key={day}>{day.slice(8, 10)}</span>)}</div><MultiDayLanes days={week} events={multi} onSelect={onSelect} onQuickStatus={onQuickStatus} className="month-multi-day"/><div className="month-single-grid">{week.map((day) => <TimeCell date={day} time="00:00" events={single.filter((event) => event.startDate === day)} onSelect={onSelect} onQuickStatus={onQuickStatus} compact key={day}/>)}</div></section>;
  })}</div></div>;
}

function YearView({ date, events, onPickDate }: { date: string; events: CalendarEvent[]; onPickDate: (date: string) => void }) {
  const year = date.slice(0, 4);
  return <div className="year-board">{Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}-01`;
    const days = calendarDays(month);
    return <section className="year-month" key={month}><h2>{new Intl.DateTimeFormat("vi-VN", { month: "long", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`))}</h2><div className="year-weekdays">{dayNames.map((name) => <span key={name}>{name.slice(0, 1)}</span>)}</div><div className="year-days">{days.map((day) => {
      const dayEvents = events.filter((event) => event.startDate <= day && day <= event.endDate);
      return <button type="button" className={`${day.slice(0, 7) === month.slice(0, 7) ? "" : "outside"} ${isToday(day) ? "today" : ""} ${dayEvents.length ? "has-events" : ""}`.trim()} onClick={() => onPickDate(day)} title={dayEvents.map((event) => `${event.title} (${event.startTime}–${event.endTime})`).join("\n")} key={day}><span>{day.slice(8, 10)}</span>{dayEvents.length > 0 && <i aria-label={`${dayEvents.length} công việc`}>{dayEvents.slice(0, 3).map((event) => <b style={{ background: calendarWorkTypeTokens[event.task.workType].bar }} key={event.taskId}/>)}</i>}</button>;
    })}</div></section>;
  })}</div>;
}

function normalizeEvents(tasks: Task[]): CalendarEvent[] {
  return tasks.flatMap((task) => {
    const startDate = taskStartDate(task);
    if (!startDate || !task.deadline) return [];
    const endDate = task.deadline < startDate ? startDate : task.deadline;
    return [{ taskId: task.id, task, title: task.title, startDate, endDate, startTime: task.startTime || "09:00", endTime: task.endTime || "11:00", status: task.status, assigneeId: null, owner: task.owner }];
  });
}

/** Same id + matching schedule metadata can join only with no date gap. */
function mergeCalendarEvents(events: CalendarEvent[]) {
  const output: CalendarEvent[] = [];
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = `${event.taskId}|${event.startTime}|${event.status}|${event.assigneeId ?? ""}|${event.owner}`;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  for (const group of groups.values()) {
    let active: CalendarEvent | null = null;
    for (const event of [...group].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
      if (active && event.startDate <= addDays(active.endDate, 1)) {
        if (event.endDate > active.endDate) active.endDate = event.endDate;
      } else {
        active = { ...event };
        output.push(active);
      }
    }
  }
  return output.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title));
}

function placeMultiDaySegments(events: CalendarEvent[], days: string[]): MultiDaySegment[] {
  const candidates = events.flatMap((event) => {
    if (!intersects(event, days)) return [];
    const startColumn = Math.max(0, days.findIndex((day) => day >= event.startDate));
    const finalIndex = [...days].reverse().findIndex((day) => day <= event.endDate);
    if (startColumn < 0 || finalIndex < 0) return [];
    return [{ event, startColumn, endColumn: days.length - finalIndex - 1, continuesBefore: event.startDate < days[0], continuesAfter: event.endDate > days.at(-1)! }];
  }).sort((a, b) => a.startColumn - b.startColumn || b.endColumn - a.endColumn || a.event.startTime.localeCompare(b.event.startTime));
  const laneEnds: number[] = [];
  return candidates.map((candidate) => {
    let lane = laneEnds.findIndex((end) => end < candidate.startColumn);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(-1); }
    laneEnds[lane] = candidate.endColumn;
    return { ...candidate, lane };
  });
}

function indexSingleDayEvents(days: string[], events: CalendarEvent[]) {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    if (!days.includes(event.startDate)) continue;
    const slot = timeSlots[timeSlotIndex(event.startTime)];
    const key = `${event.startDate}|${slot}`;
    map.set(key, [...(map.get(key) ?? []), event]);
  }
  for (const items of map.values()) items.sort((a, b) => a.startTime.localeCompare(b.startTime) || a.task.workType.localeCompare(b.task.workType) || a.title.localeCompare(b.title));
  return map;
}

function timeSlotIndex(time: string) {
  const hour = Number(time.slice(0, 2));
  const index = timeSlots.findLastIndex((slot) => hour >= Number(slot.slice(0, 2)));
  return index < 0 ? 0 : index;
}

function currentTimePosition(date: string, slot: string) {
  if (!isToday(date)) return null;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const start = Number(slot.slice(0, 2)) * 60;
  if (minutes < start || minutes > start + 120) return null;
  return ((minutes - start) / 120) * 100;
}

function visibleDays(view: CalendarView, date: string) { if (view === "day") return [date]; if (view === "week") return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(date), index)); if (view === "month") return calendarDays(monthStart(date)); return Array.from({ length: 366 }, (_, index) => addDays(`${date.slice(0, 4)}-01-01`, index)).filter((item) => item.startsWith(date.slice(0, 4))); }
function intersects(event: CalendarEvent, days: string[]) { return Boolean(days.length && event.startDate <= days.at(-1)! && event.endDate >= days[0]); }
function rangeLabel(event: CalendarEvent) { return event.startDate === event.endDate ? shortDate(event.startDate) : `${shortDate(event.startDate)} – ${shortDate(event.endDate)}`; }
function shortDate(date: string) { return `${date.slice(8, 10)}/${date.slice(5, 7)}`; }
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
