"use client";

import { useEffect, useState } from "react";
import { TASK_STATUSES, statusLabels, taskStartDate, workTypeLabels, type Task, type TaskStatus } from "../../lib/types";
import { TaskFormModal } from "./TaskFormModal";
import { useWorkspace } from "./WorkspaceProvider";

type Props = { items: Task[]; openTaskId?: string | null; onTaskOpened?: () => void };

function formatRange(task: Task) {
  const start = taskStartDate(task);
  if (!start || !task.deadline) return "Chưa đặt lịch";
  const format = (value: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  return start === task.deadline ? format(start) : `${format(start)} – ${format(task.deadline)}`;
}

export function TaskKanban({ items, openTaskId, onTaskOpened }: Props) {
  const { updateTask } = useWorkspace();
  const [selected, setSelected] = useState<Task | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropStatus, setDropStatus] = useState<TaskStatus | null>(null);

  useEffect(() => {
    if (!openTaskId) return;
    const task = items.find((item) => item.id === openTaskId);
    if (!task) return;
    setSelected(task);
    onTaskOpened?.();
  }, [items, onTaskOpened, openTaskId]);

  const changeStatus = async (task: Task, status: TaskStatus) => {
    if (status === task.status) return;
    setUpdatingIds((current) => new Set(current).add(task.id));
    setError(null);
    try { await updateTask(task.id, { status }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đổi trạng thái công việc."); }
    finally { setUpdatingIds((current) => { const next = new Set(current); next.delete(task.id); return next; }); }
  };
  const dropTask = async (status: TaskStatus) => {
    const task = items.find((item) => item.id === draggedId);
    setDropStatus(null);
    setDraggedId(null);
    if (task) await changeStatus(task, status);
  };

  return <>
    {error && <p className="kanban-error" role="alert">{error}</p>}
    <div className="kanban-board" aria-label="Bảng công việc theo trạng thái">
      {TASK_STATUSES.map((status) => {
        const tasks = items.filter((task) => task.status === status);
        return <section className={`kanban-column ${status} ${dropStatus === status ? "drop-target" : ""}`} key={status} aria-label={statusLabels[status]} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropStatus(status); }} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropStatus(null); }} onDrop={() => void dropTask(status)}>
          <header><span className="kanban-status-dot"/><strong>{statusLabels[status]}</strong><b>{tasks.length}</b></header>
          <div className="kanban-column-body">
            {tasks.length ? tasks.map((task) => <article className={`kanban-card ${draggedId === task.id ? "dragging" : ""}`} key={task.id} draggable={!updatingIds.has(task.id)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); setDraggedId(task.id); }} onDragEnd={() => { setDraggedId(null); setDropStatus(null); }}>
              <button type="button" className="kanban-card-main" onClick={() => setSelected(task)} aria-label={`Mở ${task.title}`}>
                <span className="kanban-card-top"><em>{task.code}</em><i className={task.workType}>{workTypeLabels[task.workType]}</i></span>
                <strong>{task.title}</strong>
                <small>{task.format || "Chưa xác định định dạng"}</small>
                <span className="kanban-card-info"><b>{task.owner}</b><time>{formatRange(task)} · {task.startTime}</time></span>
              </button>
              <label className="kanban-status-select"><span className="sr-only">Đổi trạng thái {task.title}</span><select value={task.status} disabled={updatingIds.has(task.id)} onChange={(event) => void changeStatus(task, event.target.value as TaskStatus)}>{TASK_STATUSES.map((value) => <option value={value} key={value}>{statusLabels[value]}</option>)}</select></label>
            </article>) : <p className="kanban-empty">Chưa có công việc.</p>}
          </div>
        </section>;
      })}
    </div>
    {selected && <TaskFormModal task={selected} onClose={() => setSelected(null)} />}
  </>;
}
