"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { statusLabels, taskStartDate, workTypeLabels, type Task, type TaskInput } from "../../lib/types";
import { TaskFormatSelect } from "./TaskFormatSelect";
import { AssigneePicker } from "./AssigneePicker";
import { DateRangePicker } from "./DateRangePicker";
import { TaskReminderEditor } from "./TaskReminderEditor";
import { BriefContent } from "./BriefContent";
import { LinkifiedText } from "./LinkifiedText";
import { useWorkspace } from "./WorkspaceProvider";


export function formatDate(date: string | null | undefined) {
  if (!date) return "Chưa đặt";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function formatDateRange(startDate: string | null | undefined, deadline: string | null | undefined) {
  if (!deadline) return "Chưa đặt";
  const start = startDate ?? deadline;
  return start === deadline ? formatDate(deadline) : `${formatDate(start)} – ${formatDate(deadline)}`;
}

function formatReminderOffset(minutes: number) {
  if (!minutes) return "Đúng giờ";
  if (minutes % 1440 === 0) return `${minutes / 1440} ngày trước`;
  if (minutes % 60 === 0) return `${minutes / 60} giờ trước`;
  return `${minutes} phút trước`;
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function taskInput(task: Task): TaskInput {
  const date = task.deadline ?? task.startDate ?? todayIso();
  return {
    title: task.title,
    owner: task.owner,
    assigneeIds: task.assigneeIds,
    workType: task.workType,
    status: task.status,
    startDate: task.startDate ?? date,
    deadline: date,
    startTime: task.startTime,
    endTime: task.endTime,
    reminderDate: task.reminderDate,
    reminderTime: task.reminderTime,
    reminderRepeat: task.reminderRepeat,
    reminderOffsets: task.reminderOffsets,
    format: task.format,
    brief: task.brief,
    briefUrl: task.briefUrl,
    linkedBriefIds: task.linkedBriefIds
  };
}

export function TaskTable({ items, openTaskId, onTaskOpened }: { items: Task[]; openTaskId?: string | null; onTaskOpened?: () => void }) {
  const router = useRouter();
  const { updateTask, removeTask, members } = useWorkspace();
  const [selected, setSelected] = useState<Task | null>(null);
  const [draft, setDraft] = useState<TaskInput | null>(null);
  const [inlineEditing, setInlineEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!openTaskId) return;
    const task = items.find((item) => item.id === openTaskId);
    if (!task) return;
    setSelected(task);
    setInlineEditing(false);
    setDraft(null);
    setActionError(null);
    onTaskOpened?.();
  }, [items, onTaskOpened, openTaskId]);

  const updateDraft = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const destroy = async () => {
    if (savingRef.current || !selected || !window.confirm(`Xoá “${selected.title}”? Thao tác này không thể hoàn tác.`)) return;
    savingRef.current = true; setSaving(true); setActionError(null);
    try {
      await removeTask(selected.id);
      setSelected(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể xoá công việc.");
    } finally { savingRef.current = false; setSaving(false); }
  };

  const saveInline = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (savingRef.current || !selected || !draft) return;
    savingRef.current = true;
    setSaving(true);
    setActionError(null);
    try {
      const saved = await updateTask(selected.id, draft);
      setSelected(saved);
      setInlineEditing(false);
      setDraft(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể lưu thay đổi.");
    } finally {
      savingRef.current = false; setSaving(false);
    }
  };

  return <>
    <div className="table">
      <div className="table-head"><span>CÔNG VIỆC</span><span>NGƯỜI PHỤ TRÁCH</span><span>LOẠI</span><span>THỜI GIAN</span><span>TRẠNG THÁI</span></div>
      {items.length === 0
        ? <div className="empty-row">Chưa có công việc phù hợp.</div>
        : items.map((task) => <button className="row" key={task.id} onClick={() => { setSelected(task); setInlineEditing(false); setDraft(null); setActionError(null); }}>
          <span><strong>{task.title}<span className="task-name-format"> · {task.format || "Chưa xác định"}</span></strong><small>{task.brief.trim() || task.briefUrl ? "Có brief" : "Chưa có brief"}</small></span>
          <span data-label="Người phụ trách">{task.owner}</span>
          <span data-label="Loại" className={task.workType === "inhouse" ? "pill green" : "pill purple"}>{workTypeLabels[task.workType]}</span>
          <span data-label="Thời gian">{formatDateRange(taskStartDate(task), task.deadline)}</span>
          <span data-label="Trạng thái" className={`status ${task.status}`}>{statusLabels[task.status]}</span>
        </button>)}
    </div>

    {selected && <div className="overlay" role="presentation" onMouseDown={() => setSelected(null)}>
      <div className="modal task-detail" role="dialog" aria-modal="true" aria-label="Chi tiết công việc" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" aria-label="Đóng" onClick={() => setSelected(null)}>×</button>
        <small>{inlineEditing ? "CHỈNH SỬA CÔNG VIỆC" : "CHI TIẾT CÔNG VIỆC"}</small>
        {inlineEditing && draft ? <form onSubmit={saveInline}>
          <h2><input className="inline-title" required value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} /></h2>
          <div className="form-grid inline-detail-form">
            <AssigneePicker members={members} value={draft.assigneeIds ?? []} onChange={(assigneeIds) => updateDraft("assigneeIds", assigneeIds)} disabled={saving}/>
            <div className="field full"><span>Thời gian thực hiện</span><DateRangePicker startDate={draft.startDate} endDate={draft.deadline} onChange={(startDate, deadline) => setDraft((current) => current ? { ...current, startDate, deadline } : current)} /></div>
            <label className="field">Loại công việc<select value={draft.workType} onChange={(event) => updateDraft("workType", event.target.value as TaskInput["workType"])}>{Object.entries(workTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field">Trạng thái<select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as TaskInput["status"])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <TaskReminderEditor value={draft} onChange={(patch) => setDraft((current) => current ? { ...current, ...patch } : current)} disabled={saving}/>
            <label className="field">Định dạng / bàn giao<TaskFormatSelect value={draft.format} onChange={(format) => updateDraft("format", format)} disabled={saving}/></label>
          </div>
          {actionError && <p className="form-error">{actionError}</p>}
          <div className="form-actions"><button type="button" className="secondary" onClick={() => { setInlineEditing(false); setDraft(null); setActionError(null); }}>Huỷ</button><button className="primary" disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button></div>
        </form> : <>
          <h2>{selected.title}</h2>
          <div className="details">
            <span>Người phụ trách<strong>{selected.owner}</strong></span>
            <span>Loại<strong>{workTypeLabels[selected.workType]}</strong></span>
            <span>Thời gian<strong>{formatDateRange(taskStartDate(selected), selected.deadline)}</strong></span>
            <span>Định dạng<strong>{selected.format || "Chưa xác định"}</strong></span>
            <span>Trạng thái<strong>{statusLabels[selected.status]}</strong></span>
            <span>Nhắc công việc<strong>{selected.reminderDate && selected.reminderTime ? `${formatDate(selected.reminderDate)} · ${selected.reminderTime}${selected.reminderRepeat === "daily" ? " · Mỗi ngày" : selected.reminderRepeat === "weekly" ? " · Mỗi tuần" : ""}` : "Chưa đặt"}</strong></span>
            <span>Nhắc trước giờ bắt đầu<strong>{selected.reminderOffsets.length ? selected.reminderOffsets.map(formatReminderOffset).join(", ") : "Chưa đặt"}</strong></span>
          </div>
          <div className="brief"><b>BRIEF NỘI DUNG</b>{selected.brief ? <BriefContent html={selected.brief}/> : <p>Chưa có brief. Hãy bổ sung yêu cầu và thông điệp chính cho công việc này.</p>}{selected.briefUrl && <a className="brief-source-link" href={selected.briefUrl} target="_blank" rel="noreferrer noopener">Mở Google Docs ↗</a>}<button type="button" className="secondary brief-open-editor" onClick={() => router.push(`/briefs/${encodeURIComponent(selected.id)}`)}>Mở trang brief ↗</button></div>
          {actionError && <p className="form-error">{actionError}</p>}
          <div className="form-actions"><button className="danger" disabled={saving} onClick={() => void destroy()}>Xoá</button><span/><button className="secondary" disabled={saving} onClick={() => { setDraft(taskInput(selected)); setInlineEditing(true); setActionError(null); }}>Chỉnh sửa</button><button className="primary" onClick={() => setSelected(null)}>Xong</button></div>
        </>}
      </div>
    </div>}
  </>;
}
