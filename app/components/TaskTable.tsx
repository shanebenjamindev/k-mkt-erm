"use client";

import { useState } from "react";
import { statusLabels, taskStartDate, workTypeLabels, type Task, type TaskInput } from "../../lib/types";
import { DateRangePicker } from "./DateRangePicker";
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

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function taskInput(task: Task): TaskInput {
  const date = task.deadline ?? task.startDate ?? todayIso();
  return {
    title: task.title,
    owner: task.owner,
    workType: task.workType,
    status: task.status,
    startDate: task.startDate ?? date,
    deadline: date,
    startTime: task.startTime,
    format: task.format,
    brief: task.brief
  };
}

export function TaskTable({ items }: { items: Task[] }) {
  const { updateTask, removeTask, members } = useWorkspace();
  const [selected, setSelected] = useState<Task | null>(null);
  const [draft, setDraft] = useState<TaskInput | null>(null);
  const [inlineEditing, setInlineEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const updateDraft = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const destroy = async () => {
    if (!selected || !window.confirm(`Xoá “${selected.title}”? Thao tác này không thể hoàn tác.`)) return;
    try {
      await removeTask(selected.id);
      setSelected(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Không thể xoá công việc.");
    }
  };

  const saveInline = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !draft) return;
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
      setSaving(false);
    }
  };

  return <>
    <div className="table">
      <div className="table-head"><span>CÔNG VIỆC</span><span>NGƯỜI PHỤ TRÁCH</span><span>LOẠI</span><span>THỜI GIAN</span><span>TRẠNG THÁI</span></div>
      {items.length === 0
        ? <div className="empty-row">Chưa có công việc phù hợp.</div>
        : items.map((task) => <button className="row" key={task.id} onClick={() => { setSelected(task); setInlineEditing(false); setDraft(null); setActionError(null); }}>
          <span><em>{task.code}</em><strong>{task.title}</strong><small>{task.format || "Chưa xác định"}{task.brief ? " · Có brief" : ""}</small></span>
          <span>{task.owner}</span>
          <span className={task.workType === "inhouse" ? "pill green" : "pill purple"}>{workTypeLabels[task.workType]}</span>
          <span>{formatDateRange(taskStartDate(task), task.deadline)}</span>
          <span className={`status ${task.status}`}>{statusLabels[task.status]}</span>
        </button>)}
    </div>

    {selected && <div className="overlay" role="presentation" onMouseDown={() => setSelected(null)}>
      <div className="modal task-detail" role="dialog" aria-modal="true" aria-label="Chi tiết công việc" onMouseDown={(event) => event.stopPropagation()}>
        <button className="close" aria-label="Đóng" onClick={() => setSelected(null)}>×</button>
        <small>{inlineEditing ? "CHỈNH SỬA CÔNG VIỆC" : "CHI TIẾT CÔNG VIỆC"}</small>
        {inlineEditing && draft ? <form onSubmit={saveInline}>
          <h2>{selected.code} · <input className="inline-title" required value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} /></h2>
          <div className="form-grid inline-detail-form">
            <label className="field">Người phụ trách<select value={draft.owner} onChange={(event) => {
              const member = members.find((item) => item.name === event.target.value);
              setDraft((current) => current ? { ...current, owner: event.target.value, workType: member?.workType ?? current.workType } : current);
            }}><option value="Chưa phân công">Chưa phân công</option>{members.map((member) => <option key={member.id} value={member.name}>{member.name} · {member.role}</option>)}</select></label>
            <div className="field full"><span>Thời gian thực hiện</span><DateRangePicker startDate={draft.startDate} endDate={draft.deadline} onChange={(startDate, deadline) => setDraft((current) => current ? { ...current, startDate, deadline } : current)} /></div>
            <label className="field">Loại<select value={draft.workType} disabled={draft.owner !== "Chưa phân công"} onChange={(event) => updateDraft("workType", event.target.value as TaskInput["workType"])}>{Object.entries(workTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field">Trạng thái<select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as TaskInput["status"])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field">Giờ bắt đầu<select value={draft.startTime} onChange={(event) => updateDraft("startTime", event.target.value)}>{["09:00", "11:00", "13:00", "15:00", "17:00"].map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
            <label className="field">Định dạng<input value={draft.format} onChange={(event) => updateDraft("format", event.target.value)} /></label>
            <label className="field full">Brief nội dung<textarea rows={4} value={draft.brief} onChange={(event) => updateDraft("brief", event.target.value)} /></label>
          </div>
          {actionError && <p className="form-error">{actionError}</p>}
          <div className="form-actions"><button type="button" className="secondary" onClick={() => { setInlineEditing(false); setDraft(null); setActionError(null); }}>Huỷ</button><button className="primary" disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button></div>
        </form> : <>
          <h2>{selected.code} · {selected.title}</h2>
          <div className="details">
            <span>Người phụ trách<strong>{selected.owner}</strong></span>
            <span>Loại<strong>{workTypeLabels[selected.workType]}</strong></span>
            <span>Thời gian<strong>{formatDateRange(taskStartDate(selected), selected.deadline)}</strong></span>
            <span>Giờ bắt đầu<strong>{selected.startTime}</strong></span>
            <span>Định dạng<strong>{selected.format || "Chưa xác định"}</strong></span>
            <span>Trạng thái<strong>{statusLabels[selected.status]}</strong></span>
          </div>
          <div className="brief"><b>BRIEF NỘI DUNG</b><p>{selected.brief || "Chưa có brief. Hãy bổ sung yêu cầu và thông điệp chính cho công việc này."}</p></div>
          {actionError && <p className="form-error">{actionError}</p>}
          <div className="form-actions"><button className="danger" onClick={() => void destroy()}>Xoá</button><span/><button className="secondary" onClick={() => { setDraft(taskInput(selected)); setInlineEditing(true); setActionError(null); }}>Chỉnh sửa</button><button className="primary" onClick={() => setSelected(null)}>Xong</button></div>
        </>}
      </div>
    </div>}
  </>;
}
