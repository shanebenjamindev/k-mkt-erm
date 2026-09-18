"use client";

import { useEffect, useState } from "react";
import type { Task, TaskInput } from "../../lib/types";
import { statusLabels, workTypeLabels } from "../../lib/types";
import { DateRangePicker } from "./DateRangePicker";
import { useWorkspace } from "./WorkspaceProvider";

type Props = { task?: Task | null; onClose: () => void; onSaved?: (task: Task) => void };
const timeOptions = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"];
function todayIso() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function newTask(): TaskInput { const today = todayIso(); return { title: "", owner: "Chưa phân công", workType: "inhouse", status: "todo", startDate: today, deadline: today, startTime: "09:00", endTime: "11:00", format: "", brief: "" }; }

export function TaskFormModal({ task, onClose, onSaved }: Props) {
  const { members, createTask, updateTask } = useWorkspace();
  const [form, setForm] = useState<TaskInput>(newTask);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(task ? { title: task.title, owner: task.owner, workType: task.workType, status: task.status, startDate: task.startDate ?? task.deadline ?? todayIso(), deadline: task.deadline ?? task.startDate ?? todayIso(), startTime: task.startTime, endTime: task.endTime ?? "11:00", format: task.format, brief: task.brief } : newTask());
    setError(null);
  }, [task]);

  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      const saved = task ? await updateTask(task.id, form) : await createTask(form);
      onSaved?.(saved);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu công việc.");
    } finally { setSaving(false); }
  };

  return <div className="overlay" role="presentation" onMouseDown={onClose}>
    <form className="modal task-form" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="close" aria-label="Đóng" onClick={onClose}>×</button>
      <small>{task ? "CHỈNH SỬA CÔNG VIỆC" : "CÔNG VIỆC MỚI"}</small>
      <h2>{task ? task.code : "Tạo công việc"}</h2>
      <div className="form-grid">
        <label className="field full">Tên công việc<input autoFocus required value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Ví dụ: Thiết kế carousel tháng 9" /></label>
        <label className="field">Người phụ trách<select required value={form.owner} onChange={(event) => { const member = members.find((item) => item.name === event.target.value); setForm((current) => ({ ...current, owner: event.target.value, workType: member?.workType ?? current.workType })); }}><option value="Chưa phân công">Chưa phân công</option>{members.map((member) => <option key={member.id} value={member.name}>{member.name} · {member.role}</option>)}</select></label>
        <div className="field full"><span>Thời gian thực hiện</span><DateRangePicker startDate={form.startDate} endDate={form.deadline} onChange={(startDate, deadline) => setForm((current) => ({ ...current, startDate, deadline }))} /></div>
        <label className="field">Loại<select value={form.workType} disabled={form.owner !== "Chưa phân công"} onChange={(event) => set("workType", event.target.value as TaskInput["workType"])}>{Object.entries(workTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field">Trạng thái<select value={form.status} onChange={(event) => set("status", event.target.value as TaskInput["status"])}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field">Giờ bắt đầu<select value={form.startTime} onChange={(event) => { const startTime = event.target.value; setForm((current) => ({ ...current, startTime, endTime: current.endTime > startTime ? current.endTime : timeOptions[timeOptions.indexOf(startTime) + 1] })); }}>{timeOptions.slice(0, -1).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
        <label className="field">Giờ kết thúc<select value={form.endTime} onChange={(event) => set("endTime", event.target.value)}>{timeOptions.filter((time) => time > form.startTime).map((time) => <option key={time} value={time}>{time}</option>)}</select></label>
        <label className="field full">Định dạng / bàn giao<input value={form.format} onChange={(event) => set("format", event.target.value)} placeholder="Ví dụ: Carousel · 6 slides" /></label>
        <label className="field full">Brief nội dung<textarea value={form.brief} onChange={(event) => set("brief", event.target.value)} placeholder="Mục tiêu, thông điệp, yêu cầu bàn giao..." rows={4} /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Huỷ</button><button className="primary" disabled={saving}>{saving ? "Đang lưu…" : task ? "Lưu thay đổi" : "Tạo công việc"}</button></div>
    </form>
  </div>;
}
