"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import { calendarAlertTokens, calendarStatusPresentation, calendarWorkTypeTokens, getCalendarTaskPresentation } from "../../lib/calendar-presentation";
import { normalizeWorkflow, WORKFLOW_COLORS, type WorkflowStep } from "../../lib/project-settings";
import { TASK_STATUSES, WORK_TYPES, taskStartDate, workTypeLabels, type Task, type TaskInput, type TaskStatus, type WorkType } from "../../lib/types";
import { TaskFormModal } from "../components/TaskFormModal";
import { useProjectSettings } from "../components/ProjectSettingsProvider";
import { useWorkspace } from "../components/WorkspaceProvider";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { WorkspaceState } from "../components/WorkspaceState";

const dayNames = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const HOUR_HEIGHT = 56;
const hourMarks = Array.from({ length: 25 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
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
type EventStyle = CSSProperties & Record<"--event-bg" | "--event-bar" | "--event-text" | "--event-status-color" | "--event-status-width" | "--event-type-color" | "--event-type-bar" | "--event-type-bg" | "--event-alert-border" | "--event-alert-bg" | "--event-alert-text", string>;
type DraggedCalendarEvent = { event: CalendarEvent; anchorDate: string };
type ResizeEdge = "start-date" | "end-date" | "start-time" | "end-time";
type CalendarDrag = { dragged: DraggedCalendarEvent | null; hoverDate: string | null; busyTaskId: string | null; createAt: (date: string, time?: string) => void; start: (event: DragEvent, task: CalendarEvent, anchorDate?: string) => void; hover: (event: DragEvent, date: string) => void; drop: (event: DragEvent, date: string) => void; end: () => void; resize: (event: CalendarEvent, edge: ResizeEdge, steps: number) => Promise<void> };
const CalendarDragContext = createContext<CalendarDrag | null>(null);
function useCalendarDrag() { const context = useContext(CalendarDragContext); if (!context) throw new Error("Calendar drag context is missing."); return context; }

export default function CalendarPage() {
  const { tasks, updateTask } = useWorkspace();
  const { settings } = useProjectSettings();
  const workflow = normalizeWorkflow(settings.workflow);
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(() => toIso(new Date()));
  const [creating, setCreating] = useState<Partial<Pick<TaskInput, "startDate" | "deadline" | "startTime" | "endTime">> | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<WorkType[]>([...WORK_TYPES]);
  const [visibleStatuses, setVisibleStatuses] = useState<TaskStatus[]>([...TASK_STATUSES]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragged, setDragged] = useState<DraggedCalendarEvent | null>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const events = useMemo(() => mergeCalendarEvents(normalizeEvents(tasks)), [tasks]);
  const filteredEvents = useMemo(() => events.filter((event) => visibleTypes.includes(event.task.workType) && visibleStatuses.includes(event.status)), [events, visibleStatuses, visibleTypes]);
  const unscheduledCount = tasks.filter((task) => !task.deadline).length;

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
  const toggleType = (type: WorkType) => setVisibleTypes((current) => current.length === 1 && current[0] === type ? [...WORK_TYPES] : [type]);
  const toggleStatus = (status: TaskStatus) => setVisibleStatuses((current) => current.length === 1 && current[0] === status ? [...TASK_STATUSES] : [status]);
  const moveTask = async ({ event, anchorDate }: DraggedCalendarEvent, date: string) => {
    const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${anchorDate}T00:00:00Z`)) / 86_400_000);
    if (!offset || movingTaskId) return;
    setMovingTaskId(event.taskId);
    setActionError(null);
    try {
      await updateTask(event.taskId, {
        startDate: addDays(event.startDate, offset),
        deadline: addDays(event.endDate, offset),
        ...(event.task.reminderDate ? { reminderDate: addDays(event.task.reminderDate, offset) } : {})
      });
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Không thể chuyển ngày công việc."); }
    finally { setMovingTaskId(null); }
  };
  const resizeTask = async (event: CalendarEvent, edge: ResizeEdge, steps: number) => {
    const patch = resizeCalendarEvent(event, edge, steps);
    if (!patch || movingTaskId) return;
    setMovingTaskId(event.taskId);
    setActionError(null);
    try { await updateTask(event.taskId, patch); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : "Không thể chỉnh thời gian công việc."); }
    finally { setMovingTaskId(null); }
  };
  const calendarDrag: CalendarDrag = {
    dragged, hoverDate, busyTaskId: movingTaskId,
    createAt: (date, time) => {
      const startMinutes = Math.min(23 * 60 + 45, time ? timeMinutes(time) : 9 * 60);
      const endMinutes = Math.min(23 * 60 + 59, startMinutes + 60);
      setCreating({ startDate: date, deadline: date, startTime: formatClock(startMinutes), endTime: formatClock(endMinutes) });
    },
    start: (event, task, anchorDate = task.startDate) => { if (movingTaskId) { event.preventDefault(); return; } event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.taskId); setDragged({ event: task, anchorDate }); },
    hover: (event, date) => { if (!dragged) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (hoverDate !== date) setHoverDate(date); },
    drop: (event, date) => { if (!dragged) return; event.preventDefault(); void moveTask(dragged, date); setDragged(null); setHoverDate(null); },
    end: () => { setDragged(null); setHoverDate(null); },
    resize: (event, edge, steps) => resizeTask(event, edge, steps)
  };

  return <WorkspaceShell title="Lịch sản xuất">
    <WorkspaceState>
      <div className="page-heading"><div><small>WORKSPACE / CALENDAR</small><h1>Lịch sản xuất</h1><p>Xem tiến độ theo ngày, tuần, tháng hoặc toàn năm.</p></div><button className="primary" onClick={() => setCreating({})}>＋ Thêm lịch</button></div>
      {unscheduledCount > 0 && <div className="calendar-missing-deadline"><span><b>{unscheduledCount} công việc</b> cũ chưa có deadline nên chưa thể đặt lên lịch.</span><Link href="/tasks">Bổ sung deadline</Link></div>}
      <div className="calendar-summary"><div><strong>{viewLabel(view, currentDate)}</strong><span>{filteredEvents.filter((event) => intersects(event, visibleDays(view, currentDate))).length} công việc trong phạm vi đang xem</span></div><div className="calendar-controls"><div className="calendar-view-toggle" aria-label="Chế độ xem lịch">{(["day", "week", "month", "year"] as CalendarView[]).map((mode) => <button type="button" className={view === mode ? "active" : ""} onClick={() => setView(mode)} key={mode}>{({ day: "Ngày", week: "Tuần", month: "Tháng", year: "Năm" })[mode]}</button>)}</div><button className="secondary" onClick={() => go(-1)} aria-label="Lùi lịch">←</button><button className="secondary" onClick={() => setCurrentDate(toIso(new Date()))}>Hôm nay</button><button className="secondary" onClick={() => go(1)} aria-label="Tiến lịch">→</button></div></div>
      <CalendarLegend visibleTypes={visibleTypes} visibleStatuses={visibleStatuses} onToggleType={toggleType} onToggleStatus={toggleStatus} workflow={workflow}/>
      {actionError && <p className="calendar-action-error" role="alert">{actionError}</p>}
      <CalendarDragContext.Provider value={calendarDrag}>{view === "year" ? <YearView date={currentDate} events={filteredEvents} onPickDate={(nextDate) => { setCurrentDate(nextDate); setView("day"); }} /> : view === "month" ? <MonthView date={currentDate} events={filteredEvents} onSelect={setEditing} /> : <TimeGridView days={visibleDays(view, currentDate)} events={filteredEvents} onSelect={setEditing} />}</CalendarDragContext.Provider>
      <p className="calendar-note">Bấm vào ô trống để tạo công việc. Cuộn bảng để xem đủ 24 giờ; kéo thẻ để dời lịch hoặc kéo cạnh để chỉnh ngày, giờ.</p>
    </WorkspaceState>
    {creating && <TaskFormModal initialSchedule={creating} onClose={() => setCreating(null)} onSaved={focusTask} />}
    {editing && <TaskFormModal task={editing} onClose={() => setEditing(null)} onSaved={focusTask} />}
  </WorkspaceShell>;
}

function CalendarLegend({ visibleTypes, visibleStatuses, onToggleType, onToggleStatus, workflow }: { visibleTypes: WorkType[]; visibleStatuses: TaskStatus[]; onToggleType: (type: WorkType) => void; onToggleStatus: (status: TaskStatus) => void; workflow: WorkflowStep[] }) {
  return <div className="calendar-legend" aria-label="Bộ lọc lịch">
    <span className="calendar-legend-label">Loại</span>
    {WORK_TYPES.map((type) => <button type="button" className={`legend-filter type-${type} ${visibleTypes.includes(type) ? "active" : ""}`} onClick={() => onToggleType(type)} aria-pressed={visibleTypes.includes(type)} key={type}><i style={{ background: calendarWorkTypeTokens[type].bar }}/>{workTypeLabels[type]}</button>)}
    <span className="calendar-legend-divider"/>
    <span className="calendar-legend-label">Trạng thái</span>
    {workflow.map((step) => <button type="button" className={`legend-filter status-${step.status} ${visibleStatuses.includes(step.status) ? "active" : ""}`} onClick={() => onToggleStatus(step.status)} aria-pressed={visibleStatuses.includes(step.status)} key={step.status}><b style={{ color: step.status === "completed" ? "#526071" : step.color ?? WORKFLOW_COLORS[step.status] }}>{calendarStatusPresentation[step.status].icon}</b>{step.label}</button>)}
  </div>;
}

function TimeGridView({ days, events, onSelect }: { days: string[]; events: CalendarEvent[]; onSelect: (task: Task) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const inView = useMemo(() => events.filter((event) => intersects(event, days)), [days, events]);
  const multiDayEvents = useMemo(() => inView.filter((event) => event.startDate !== event.endDate), [inView]);
  const singleDayEvents = useMemo(() => inView.filter((event) => event.startDate === event.endDate), [inView]);
  useEffect(() => { if (viewportRef.current) viewportRef.current.scrollTop = 8 * HOUR_HEIGHT; }, []);

  return <div className="calendar-board schedule-board"><div className="schedule-inner" style={{ "--day-count": days.length } as CSSProperties}>
    <div className="schedule-header"><span className="time-header">Giờ</span>{days.map((date, index) => <div className={isToday(date) ? "schedule-day-heading today" : "schedule-day-heading"} key={date}><b>{days.length === 1 ? dayLongName(date) : dayNames[index]}</b><span>{date.slice(8, 10)}</span></div>)}</div>
    <MultiDayLanes days={days} events={multiDayEvents} onSelect={onSelect} showAxis/>
    <div className="time-viewport" ref={viewportRef}><div className="time-grid" role="grid" aria-label="Công việc theo thời gian" style={{ "--hour-height": `${HOUR_HEIGHT}px`, "--half-hour-height": `${HOUR_HEIGHT / 2}px` } as CSSProperties}>
      <div className="time-axis">{hourMarks.map((time, hour) => <span className={hour === 0 ? "first" : hour === 24 ? "last" : ""} style={{ top: `${hour * HOUR_HEIGHT}px` }} key={time}>{time}</span>)}</div>
      {days.map((date) => <TimeDayColumn date={date} events={singleDayEvents.filter((event) => event.startDate === date)} onSelect={onSelect} key={date}/>) }
    </div></div>
  </div></div>;
}

function TimeDayColumn({ date, events, onSelect }: { date: string; events: CalendarEvent[]; onSelect: (task: Task) => void }) {
  const drag = useCalendarDrag();
  const positioned = useMemo(() => layoutDayEvents(events), [events]);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return <div className={`time-day-column ${isToday(date) ? "today" : ""} ${drag.dragged && drag.hoverDate === date ? "calendar-drop-target" : ""}`} role="gridcell" onClick={(click) => { const bounds = click.currentTarget.getBoundingClientRect(); const minutes = Math.max(0, Math.min(1425, Math.floor((click.clientY - bounds.top) / (HOUR_HEIGHT / 4)) * 15)); drag.createAt(date, formatClock(minutes)); }} onDragOver={(event) => drag.hover(event, date)} onDrop={(event) => drag.drop(event, date)}>
    {positioned.map(({ event, lane, laneCount }) => <CalendarEventCard event={event} onSelect={onSelect} className={`timed-event ${timeMinutes(event.endTime) - timeMinutes(event.startTime) < 45 ? "short" : ""}`} style={{ top: `${timePixels(event.startTime)}px`, height: `${timePixels(event.endTime) - timePixels(event.startTime)}px`, left: `${lane / laneCount * 100}%`, width: `${100 / laneCount}%` }} key={event.taskId}/>) }
    {isToday(date) && <span className="calendar-now-line" style={{ top: `${nowMinutes / 60 * HOUR_HEIGHT}px` }} aria-label="Thời điểm hiện tại"/>}
  </div>;
}

function TimeCell({ date, time, events, onSelect, style, compact = false }: { date: string; time: string; events: CalendarEvent[]; onSelect: (task: Task) => void; style?: CSSProperties; compact?: boolean }) {
  const drag = useCalendarDrag();
  const [expanded, setExpanded] = useState(false);
  const visible = events.slice(0, 3);
  const hidden = events.slice(3);
  const nowPosition = currentTimePosition(date, time);
  return <div className={`time-slot-cell ${isToday(date) ? "today" : ""} ${compact ? "compact" : ""} ${drag.dragged && drag.hoverDate === date ? "calendar-drop-target" : ""}`} style={style} role="gridcell" onClick={() => drag.createAt(date)} onDragOver={(event) => drag.hover(event, date)} onDrop={(event) => drag.drop(event, date)}>
    {visible.map((event) => <CalendarEventCard event={event} onSelect={onSelect} key={event.taskId}/>) }
    {hidden.length > 0 && <div className="calendar-more-wrap"><button className="calendar-more-button" type="button" onClick={(click) => { click.stopPropagation(); setExpanded((value) => !value); }} aria-expanded={expanded}>{expanded ? "Đóng danh sách" : `+${hidden.length} việc nữa`}</button>{expanded && <div className="calendar-more-popover" role="dialog" aria-label={`Các việc lúc ${time}`}>{hidden.map((event) => <CalendarEventCard event={event} onSelect={onSelect} key={event.taskId}/>)}</div>}</div>}
    {nowPosition !== null && <span className="calendar-now-line" style={{ top: `${nowPosition}%` }} aria-label="Thời điểm hiện tại"/>}
  </div>;
}

function MultiDayLanes({ days, events, onSelect, showAxis = false, className = "" }: { days: string[]; events: CalendarEvent[]; onSelect: (task: Task) => void; showAxis?: boolean; className?: string }) {
  const drag = useCalendarDrag();
  const [expanded, setExpanded] = useState(false);
  const segments = useMemo(() => placeMultiDaySegments(events, days), [days, events]);
  const hasHiddenLanes = segments.some((segment) => segment.lane >= 3);
  const visibleSegments = expanded ? segments : segments.filter((segment) => segment.lane < 3);
  const targetDate = (event: { currentTarget: HTMLDivElement; clientX: number }) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const index = Math.max(0, Math.min(days.length - 1, Math.floor((event.clientX - bounds.left) / bounds.width * days.length)));
    return days[index];
  };
  if (segments.length === 0) return showAxis ? <div className="multi-day-section empty"><span className="multi-day-label">Nhiều ngày</span><div className="multi-day-grid" style={{ "--day-count": days.length } as CSSProperties} onClick={(click) => drag.createAt(targetDate(click))} onDragOver={(event) => drag.hover(event, targetDate(event))} onDrop={(event) => drag.drop(event, targetDate(event))}>{days.map((day, index) => <span className={`multi-day-guide ${isToday(day) ? "today" : ""} ${drag.dragged && drag.hoverDate === day ? "calendar-drop-target" : ""}`} style={{ gridColumn: index + 1 }} key={day}/>)}</div></div> : null;
  const content = <div className={`multi-day-grid ${className}`} style={{ "--day-count": days.length } as CSSProperties} onClick={(click) => drag.createAt(targetDate(click))} onDragOver={(event) => drag.hover(event, targetDate(event))} onDrop={(event) => drag.drop(event, targetDate(event))}>
    {days.map((day, index) => <span className={`multi-day-guide ${isToday(day) ? "today" : ""} ${drag.dragged && drag.hoverDate === day ? "calendar-drop-target" : ""}`} style={{ gridColumn: index + 1 }} key={day}/>) }
    {visibleSegments.map((segment) => <CalendarEventCard event={segment.event} onSelect={onSelect} className="multi-day-event" style={{ gridColumn: `${segment.startColumn + 1} / ${segment.endColumn + 2}`, gridRow: segment.lane + 1 }} dragDays={days.slice(segment.startColumn, segment.endColumn + 1)} continuesBefore={segment.continuesBefore} continuesAfter={segment.continuesAfter} key={`${segment.event.taskId}-${segment.startColumn}-${segment.endColumn}`}/>) }
    {hasHiddenLanes && <button type="button" className="multi-day-more" style={{ gridRow: expanded ? Math.max(...segments.map((item) => item.lane)) + 2 : 4, gridColumn: "1 / -1" }} onClick={(click) => { click.stopPropagation(); setExpanded((value) => !value); }}>{expanded ? "Thu gọn công việc nhiều ngày" : `+${segments.filter((segment) => segment.lane >= 3).length} công việc nhiều ngày`}</button>}
  </div>;
  return showAxis ? <div className="multi-day-section"><span className="multi-day-label">Nhiều ngày</span>{content}</div> : content;
}

function CalendarEventCard({ event, onSelect, className = "", style, continuesBefore = false, continuesAfter = false, dragDays }: { event: CalendarEvent; onSelect: (task: Task) => void; className?: string; style?: CSSProperties; continuesBefore?: boolean; continuesAfter?: boolean; dragDays?: string[] }) {
  const drag = useCalendarDrag();
  const { updateTask } = useWorkspace();
  const { settings } = useProjectSettings();
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{ edge: ResizeEdge; steps: number } | null>(null);
  const step = normalizeWorkflow(settings.workflow).find((item) => item.status === event.status)!;
  const statusColor = event.status === "completed" ? "#526071" : step.color ?? WORKFLOW_COLORS[event.status];
  const presentation = getCalendarTaskPresentation(event.task);
  const cardStyle: EventStyle = {
    "--event-bg": event.status === "completed" ? "#EDF0F3" : `color-mix(in srgb, ${statusColor} 15%, white)`,
    "--event-bar": event.status === "completed" ? "#8793A3" : statusColor,
    "--event-text": event.status === "completed" ? "#526071" : "#263445",
    "--event-status-color": statusColor,
    "--event-status-width": `min(34%, ${Math.max(34, Math.min(86, Math.ceil(step.label.length * 5 + 12)))}px)`,
    "--event-type-color": event.status === "completed" ? "#526071" : presentation.type.text,
    "--event-type-bar": event.status === "completed" ? "#8793A3" : presentation.type.bar,
    "--event-type-bg": event.status === "completed" ? "#EDF0F3" : presentation.type.background,
    "--event-alert-border": calendarAlertTokens.border,
    "--event-alert-bg": calendarAlertTokens.background,
    "--event-alert-text": calendarAlertTokens.text,
    ...style
  } as EventStyle;
  const previewPatch = resizePreview ? resizeCalendarEvent(event, resizePreview.edge, resizePreview.steps) : null;
  const displayStartTime = previewPatch?.startTime ?? event.startTime;
  const displayEndTime = previewPatch?.endTime ?? event.endTime;
  if (className.includes("timed-event")) {
    cardStyle.top = `${timePixels(displayStartTime)}px`;
    cardStyle.height = `${timePixels(displayEndTime) - timePixels(displayStartTime)}px`;
  }
  const detail = `${event.title}. ${scheduleLabel(event)}. ${presentation.typeLabel}. ${step.label}. ${event.owner || "Chưa phân công"}${presentation.isOverdue ? ". Quá hạn" : ""}`;
  const changeStatus = async (status: TaskStatus) => {
    if (savingStatus || status === event.status) return;
    setSavingStatus(true);
    setStatusError(null);
    try { await updateTask(event.taskId, { status }); }
    catch (cause) { setStatusError(cause instanceof Error ? cause.message : "Không thể đổi trạng thái công việc."); }
    finally { setSavingStatus(false); }
  };
  return <div className={`calendar-event-wrapper ${className}`} style={cardStyle}>
  <button type="button" draggable onDragStart={(dragEvent) => { const bounds = dragEvent.currentTarget.getBoundingClientRect(); const index = dragDays ? Math.max(0, Math.min(dragDays.length - 1, Math.floor((dragEvent.clientX - bounds.left) / bounds.width * dragDays.length))) : 0; drag.start(dragEvent, event, dragDays?.[index]); }} onDragEnd={drag.end} className={`calendar-event-card status-${event.status} ${presentation.isOverdue ? "is-overdue" : ""} ${drag.dragged?.event.taskId === event.taskId ? "is-dragging" : ""}`} onClick={(click) => { click.stopPropagation(); onSelect(event.task); }} aria-label={`Mở chi tiết: ${detail}. Có thể kéo sang ngày khác.`} title={`${detail}. Kéo sang ngày khác để đổi lịch.`}>
    <span className="event-title"><strong>{event.title}</strong></span>
    <span className={`event-summary ${event.status === "completed" ? "completed" : ""}`}>{event.status !== "completed" && <span className="event-time">{scheduleLabel({ ...event, startTime: displayStartTime, endTime: displayEndTime })}</span>}</span>
    {event.status !== "completed" && <span className="event-extra"><i className="event-type-chip">{presentation.typeLabel}</i><small>{event.owner || "Chưa phân công"}</small></span>}
  </button>
  <select className="event-quick-status" value={event.status} disabled={savingStatus || Boolean(drag.busyTaskId)} onClick={(click) => click.stopPropagation()} onChange={(change) => void changeStatus(change.target.value as TaskStatus)} aria-label={`Đổi trạng thái ${event.title}`} title={`Trạng thái: ${step.label}`}>{normalizeWorkflow(settings.workflow).map((item) => <option value={item.status} key={item.status}>{item.label}</option>)}</select>
  {statusError && <span className="calendar-event-action-error" role="alert">{statusError}</span>}
  {!continuesBefore && <CalendarResizeHandle event={event} edge="start-date" dayCount={dragDays?.length ?? 1} onPreview={setResizePreview}/>}
  {!continuesAfter && <CalendarResizeHandle event={event} edge="end-date" dayCount={dragDays?.length ?? 1} onPreview={setResizePreview}/>}
  <CalendarResizeHandle event={event} edge="start-time" dayCount={dragDays?.length ?? 1} onPreview={setResizePreview}/>
  <CalendarResizeHandle event={event} edge="end-time" dayCount={dragDays?.length ?? 1} onPreview={setResizePreview}/>
  </div>;
}

function CalendarResizeHandle({ event, edge, dayCount, onPreview }: { event: CalendarEvent; edge: ResizeEdge; dayCount: number; onPreview: (value: { edge: ResizeEdge; steps: number } | null) => void }) {
  const drag = useCalendarDrag();
  const pointer = useRef<{ id: number; x: number; y: number; unit: number } | null>(null);
  const [steps, setSteps] = useState(0);
  const horizontal = edge === "start-date" || edge === "end-date";
  const label = ({ "start-date": "ngày bắt đầu", "end-date": "ngày kết thúc", "start-time": "giờ bắt đầu", "end-time": "giờ kết thúc" } as const)[edge];
  const getSteps = (move: PointerEvent<HTMLButtonElement>) => {
    if (!pointer.current) return 0;
    const distance = horizontal ? move.clientX - pointer.current.x : move.clientY - pointer.current.y;
    return Math.round(distance / pointer.current.unit);
  };
  const preview = steps ? resizeCalendarEvent(event, edge, steps) : null;
  const previewValue = preview ? edge === "start-date" ? preview.startDate : edge === "end-date" ? preview.deadline : edge === "start-time" ? preview.startTime : preview.endTime : null;
  return <button type="button" className={`calendar-resize-handle ${edge} ${pointer.current ? "active" : ""}`} disabled={Boolean(drag.busyTaskId)} aria-label={`Kéo để chỉnh ${label} của ${event.title}`} title={`Kéo để chỉnh ${label}`} onClick={(click) => click.stopPropagation()} onDragStart={(dragEvent) => dragEvent.preventDefault()} onPointerDown={(down) => { if (down.button !== 0) return; down.preventDefault(); down.stopPropagation(); const card = down.currentTarget.parentElement?.querySelector(".calendar-event-card"); const width = card?.getBoundingClientRect().width ?? 100; pointer.current = { id: down.pointerId, x: down.clientX, y: down.clientY, unit: horizontal ? Math.max(12, width / dayCount) : HOUR_HEIGHT / 4 }; down.currentTarget.setPointerCapture(down.pointerId); }} onPointerMove={(move) => { if (pointer.current?.id === move.pointerId) { const next = getSteps(move); setSteps(next); onPreview(next ? { edge, steps: next } : null); } }} onPointerUp={(up) => { if (pointer.current?.id !== up.pointerId) return; const finalSteps = getSteps(up); pointer.current = null; setSteps(0); if (finalSteps) void drag.resize(event, edge, finalSteps).finally(() => onPreview(null)); else onPreview(null); }} onPointerCancel={() => { pointer.current = null; setSteps(0); onPreview(null); }} onKeyDown={(key) => { const amount = horizontal ? key.key === "ArrowRight" ? 1 : key.key === "ArrowLeft" ? -1 : 0 : key.key === "ArrowDown" ? 1 : key.key === "ArrowUp" ? -1 : 0; if (amount) { key.preventDefault(); void drag.resize(event, edge, amount); } }}>{previewValue && <span className="calendar-resize-preview">{previewValue}</span>}</button>;
}

function MonthView({ date, events, onSelect }: { date: string; events: CalendarEvent[]; onSelect: (task: Task) => void }) {
  const days = useMemo(() => calendarDays(monthStart(date)), [date]);
  return <div className="month-board"><div className="month-weekdays">{dayNames.map((day) => <span key={day}>{day}</span>)}</div><div className="month-weeks">{Array.from({ length: 6 }, (_, weekIndex) => {
    const week = days.slice(weekIndex * 7, weekIndex * 7 + 7);
    const weekEvents = events.filter((event) => intersects(event, week));
    const multi = weekEvents.filter((event) => event.startDate !== event.endDate);
    const single = weekEvents.filter((event) => event.startDate === event.endDate);
    return <section className="month-week" key={week[0]}><div className="month-day-headings">{week.map((day) => <span className={`${day.slice(0, 7) === date.slice(0, 7) ? "" : "outside"} ${isToday(day) ? "today" : ""}`.trim()} key={day}>{day.slice(8, 10)}</span>)}</div><MultiDayLanes days={week} events={multi} onSelect={onSelect} className="month-multi-day"/><div className="month-single-grid">{week.map((day) => <TimeCell date={day} time="00:00" events={single.filter((event) => event.startDate === day)} onSelect={onSelect} compact key={day}/>)}</div></section>;
  })}</div></div>;
}

function YearView({ date, events, onPickDate }: { date: string; events: CalendarEvent[]; onPickDate: (date: string) => void }) {
  const { settings } = useProjectSettings();
  const workflow = normalizeWorkflow(settings.workflow);
  const year = date.slice(0, 4);
  return <div className="year-board">{Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}-01`;
    const days = calendarDays(month);
    return <section className="year-month" key={month}><h2>{new Intl.DateTimeFormat("vi-VN", { month: "long", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`))}</h2><div className="year-weekdays">{dayNames.map((name) => <span key={name}>{name}</span>)}</div><div className="year-days">{days.map((day) => {
      const dayEvents = events.filter((event) => event.startDate <= day && day <= event.endDate);
      return <button type="button" className={`${day.slice(0, 7) === month.slice(0, 7) ? "" : "outside"} ${isToday(day) ? "today" : ""} ${dayEvents.length ? "has-events" : ""}`.trim()} onClick={() => onPickDate(day)} title={dayEvents.map((event) => event.title).join("\n")} key={day}><span>{day.slice(8, 10)}</span>{dayEvents.length > 0 && <i aria-label={`${dayEvents.length} công việc`}>{dayEvents.slice(0, 3).map((event) => <b style={{ background: event.status === "completed" ? "#8793A3" : workflow.find((step) => step.status === event.status)?.color ?? WORKFLOW_COLORS[event.status] }} key={event.taskId}/>)}</i>}</button>;
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

function timeMinutes(time: string) { return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)); }
function formatClock(minutes: number) { return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`; }
function timePixels(time: string) { return timeMinutes(time) / 60 * HOUR_HEIGHT; }
function layoutDayEvents(events: CalendarEvent[]) {
  const sorted = [...events].sort((a, b) => timeMinutes(a.startTime) - timeMinutes(b.startTime) || timeMinutes(a.endTime) - timeMinutes(b.endTime));
  const groups: CalendarEvent[][] = [];
  let groupEnd = -1;
  for (const event of sorted) {
    if (!groups.length || timeMinutes(event.startTime) >= groupEnd) { groups.push([]); groupEnd = -1; }
    groups.at(-1)!.push(event);
    groupEnd = Math.max(groupEnd, timeMinutes(event.endTime));
  }
  return groups.flatMap((group) => {
    const laneEnds: number[] = [];
    const placed = group.map((event) => {
      const start = timeMinutes(event.startTime);
      let lane = laneEnds.findIndex((end) => end <= start);
      if (lane < 0) { lane = laneEnds.length; laneEnds.push(-1); }
      laneEnds[lane] = timeMinutes(event.endTime);
      return { event, lane };
    });
    return placed.map((item) => ({ ...item, laneCount: laneEnds.length }));
  });
}

function resizeCalendarEvent(event: CalendarEvent, edge: ResizeEdge, steps: number): Partial<TaskInput> | null {
  if (!steps) return null;
  if (edge === "start-date") {
    const startDate = addDays(event.startDate, steps);
    return startDate <= event.endDate && startDate !== event.startDate && (startDate !== event.endDate || event.endTime > event.startTime) ? { startDate } : null;
  }
  if (edge === "end-date") {
    const deadline = addDays(event.endDate, steps);
    return deadline >= event.startDate && deadline !== event.endDate && (deadline !== event.startDate || event.endTime > event.startTime) ? { deadline, ...(event.task.reminderDate && event.task.reminderDate > deadline ? { reminderDate: deadline } : {}) } : null;
  }
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const format = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const start = minutes(event.startTime);
  const end = minutes(event.endTime);
  const sameDay = event.startDate === event.endDate;
  if (edge === "start-time") {
    const next = Math.max(0, Math.min(sameDay ? end - 1 : 1439, start + steps * 15));
    return next !== start ? { startTime: format(next) } : null;
  }
  const next = Math.max(sameDay ? start + 1 : 0, Math.min(1439, end + steps * 15));
  return next !== end ? { endTime: format(next) } : null;
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
function scheduleLabel(event: CalendarEvent) { return event.startDate === event.endDate ? `${event.startTime}–${event.endTime}` : `${shortDate(event.startDate)} ${event.startTime} → ${shortDate(event.endDate)} ${event.endTime}`; }
function shortDate(date: string) { return `${date.slice(8, 10)}/${date.slice(5, 7)}`; }
function dayLongName(date: string) { return dayNames[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]; }
function viewLabel(view: CalendarView, date: string) { if (view === "day") return `${dayLongName(date)}, ${formatDate(date)}`; if (view === "week") { const week = visibleDays("week", date); return `${formatDate(week[0])} – ${formatDate(week[6])}`; } if (view === "month") return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${monthStart(date)}T00:00:00Z`)); return date.slice(0, 4); }
function addDays(date: string, amount: number) { const value = new Date(`${date}T00:00:00`); value.setDate(value.getDate() + amount); return toIso(value); }
function toIso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function startOfWeek(date: string | Date) { const value = typeof date === "string" ? new Date(`${date}T00:00:00`) : new Date(date); value.setDate(value.getDate() - ((value.getDay() + 6) % 7)); return toIso(value); }
function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }
function shiftMonth(date: string, amount: number) { const value = new Date(`${monthStart(date)}T00:00:00`); value.setMonth(value.getMonth() + amount); return toIso(value); }
function shiftYear(date: string, amount: number) { return `${Number(date.slice(0, 4)) + amount}${date.slice(4)}`; }
function calendarDays(month: string) { const first = new Date(`${month}T00:00:00`); first.setDate(first.getDate() - ((first.getDay() + 6) % 7)); return Array.from({ length: 42 }, (_, index) => addDays(toIso(first), index)); }
function isToday(date: string) { return toIso(new Date()) === date; }
function formatDate(date: string) { return new Intl.DateTimeFormat("vi-VN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); }
