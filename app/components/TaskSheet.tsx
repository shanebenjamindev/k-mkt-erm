"use client";

import { useEffect, useRef, useState } from "react";
import { TASK_STATUSES, WORK_TYPES, statusLabels, taskStartDate, workTypeLabels, type Task, type TaskInput, type TaskStatus } from "../../lib/types";
import { TaskFormatSelect } from "./TaskFormatSelect";
import { DateRangePicker } from "./DateRangePicker";
import { TaskFormModal } from "./TaskFormModal";
import { useWorkspace } from "./WorkspaceProvider";

type Props = { items: Task[]; openTaskId?: string | null; onTaskOpened?: () => void; onCreate: () => void };

function SheetTextCell({ value, onSave, ariaLabel, required = false }: { value: string; onSave: (value: string) => Promise<boolean>; ariaLabel: string; required?: boolean }) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => setDraft(value), [value]);

  const cancelRef = useRef(false);
  const commit = async () => {
    if (cancelRef.current) { cancelRef.current = false; setDraft(value); return; }
    if (savingRef.current) return;
    const next = draft.trim();
    if ((required && !next) || next === value) { setDraft(value); return; }
    savingRef.current = true;
    setSaving(true);
    try { if (!await onSave(next)) setDraft(value); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return <input className="sheet-input" value={draft} aria-label={ariaLabel} disabled={saving} onChange={(event) => setDraft(event.target.value)} onBlur={() => void commit()} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { cancelRef.current = true; setDraft(value); event.currentTarget.blur(); } }} />;
}

function formatRange(startDate: string, endDate: string) {
  const format = (value: string) => new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  return startDate === endDate ? format(startDate) : `${format(startDate)} – ${format(endDate)}`;
}

function SheetDateEditor({ task, onSave, onClose }: { task: Task; onSave: (task: Task, patch: Partial<TaskInput>) => Promise<boolean>; onClose: () => void }) {
  const initialStart = taskStartDate(task) ?? task.deadline ?? "";
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(task.deadline ?? initialStart);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const complete = async (start: string, end: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try { if (await onSave(task, { startDate: start, deadline: end })) onClose(); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return <div className="sheet-date-overlay" role="presentation" onMouseDown={onClose}><div className="sheet-date-dialog" role="dialog" aria-modal="true" aria-label={`Chọn thời gian ${task.title}`} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="close" aria-label="Đóng" onClick={onClose}>×</button><small>THỜI GIAN THỰC HIỆN</small><h2>{task.title}</h2><DateRangePicker startDate={startDate} endDate={endDate} onChange={(start, end) => { setStartDate(start); setEndDate(end); }} onComplete={(start, end) => void complete(start, end)} openOnMount label="Chọn ngày bắt đầu và kết thúc"/>{saving && <p>Đang lưu thời gian…</p>}<p className="sheet-date-help">Chọn ngày bắt đầu, sau đó chọn ngày kết thúc như lịch Airbnb.</p></div></div>;
}

export function TaskSheet({ items, openTaskId, onTaskOpened, onCreate }: Props) {
  const { updateTask, removeTask } = useWorkspace();
  const [selected, setSelected] = useState<Task | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const deletingRef = useRef(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateTask, setDateTask] = useState<Task | null>(null);

  useEffect(() => setSelectedIds((current) => current.filter((id) => items.some((task) => task.id === id))), [items]);
  useEffect(() => {
    if (!openTaskId) return;
    const task = items.find((item) => item.id === openTaskId);
    if (!task) return;
    setSelected(task);
    onTaskOpened?.();
  }, [items, onTaskOpened, openTaskId]);

  const save = async (task: Task, patch: Partial<TaskInput>) => {
    setSavingIds((current) => new Set(current).add(task.id));
    setError(null);
    try { await updateTask(task.id, patch); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu ô đã chỉnh sửa."); return false; }
    finally { setSavingIds((current) => { const next = new Set(current); next.delete(task.id); return next; }); }
  };
  const toggle = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const toggleAll = () => setSelectedIds((current) => current.length === items.length ? [] : items.map((task) => task.id));
  const deleteSelected = async () => {
    if (deletingRef.current || !selectedIds.length || !window.confirm(`Xoá ${selectedIds.length} công việc đã chọn? Thao tác này không thể hoàn tác.`)) return;
    deletingRef.current = true; setDeleting(true);
    setError(null);
    try {
      const results = await Promise.allSettled(selectedIds.map((id) => removeTask(id)));
      const failed = results.flatMap((result, index) => result.status === "rejected" ? [selectedIds[index]] : []);
      setSelectedIds(failed);
      if (failed.length) throw new Error(`Không thể xoá ${failed.length} công việc. Vui lòng thử lại.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xoá các dòng đã chọn."); }
    finally { deletingRef.current = false; setDeleting(false); }
  };

  return <>
    <div className="sheet-toolbar"><span>{items.length} dòng đang hiển thị</span><div><button className="secondary" type="button" disabled={deleting || !selectedIds.length} onClick={() => void deleteSelected()}>Xoá {selectedIds.length ? `${selectedIds.length} dòng` : "dòng"}</button><button className="primary" type="button" onClick={onCreate}>＋ Thêm dòng</button></div></div>
    {error && <p className="sheet-error" role="alert">{error}</p>}
    <div className="task-sheet-wrap" tabIndex={0} aria-label="Bảng tính công việc">
      <table className="task-sheet"><thead><tr><th className="sheet-checkbox"><input type="checkbox" aria-label="Chọn tất cả dòng" checked={Boolean(items.length && selectedIds.length === items.length)} onChange={toggleAll}/></th><th>#</th><th>Công việc</th><th>Người phụ trách</th><th>Loại</th><th>Thời gian</th><th>Định dạng</th><th>Trạng thái</th><th aria-label="Thao tác"/></tr></thead><tbody>{items.length ? items.map((task, index) => {
        const startDate = taskStartDate(task) ?? task.deadline ?? "";
        const isSaving = savingIds.has(task.id);
        return <tr className={selectedIds.includes(task.id) ? "selected" : ""} key={task.id}><td className="sheet-checkbox"><input type="checkbox" aria-label={`Chọn ${task.title}`} checked={selectedIds.includes(task.id)} onChange={() => toggle(task.id)}/></td><td className="sheet-row-number">{index + 1}</td><td><SheetTextCell value={task.title} required ariaLabel={`Tên công việc ${task.title}`} onSave={(title) => save(task, { title })}/></td><td><button type="button" className="sheet-assignees" onClick={() => setSelected(task)} aria-label={`Chỉnh người phụ trách ${task.title}`}>{task.owner}</button></td><td><select className="sheet-select" value={task.workType} disabled={isSaving} aria-label={`Loại công việc ${task.title}`} onChange={(event) => void save(task, { workType: event.target.value as TaskInput["workType"] })}>{WORK_TYPES.map((type) => <option value={type} key={type}>{workTypeLabels[type]}</option>)}</select></td><td><button type="button" className="sheet-range-trigger" disabled={isSaving} onClick={() => setDateTask(task)} aria-label={`Chọn khoảng thời gian ${task.title}`}>{startDate && task.deadline ? formatRange(startDate, task.deadline) : "Chọn khoảng ngày"}<span aria-hidden="true">⌄</span></button></td><td><TaskFormatSelect className="sheet-select" value={task.format} ariaLabel={`Định dạng ${task.title}`} disabled={isSaving} onChange={(format) => void save(task, { format })}/></td><td><select className={`sheet-select sheet-status ${task.status}`} value={task.status} disabled={isSaving} aria-label={`Trạng thái ${task.title}`} onChange={(event) => void save(task, { status: event.target.value as TaskStatus })}>{TASK_STATUSES.map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></td><td><button className="sheet-open-task" type="button" onClick={() => setSelected(task)} aria-label={`Mở chi tiết ${task.title}`}>Mở</button></td></tr>;
      }) : <tr><td className="sheet-empty" colSpan={9}>Không có công việc phù hợp. Hãy thay đổi bộ lọc hoặc thêm dòng mới.</td></tr>}</tbody></table>
    </div>
    {selected && <TaskFormModal task={selected} onClose={() => setSelected(null)} />}
    {dateTask && <SheetDateEditor task={dateTask} onSave={save} onClose={() => setDateTask(null)} />}
  </>;
}
