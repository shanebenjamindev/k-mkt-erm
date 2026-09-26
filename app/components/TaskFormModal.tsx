"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Task, TaskInput } from "../../lib/types";
import { statusLabels, workTypeLabels } from "../../lib/types";
import { AssigneePicker } from "./AssigneePicker";
import { TaskReminderEditor } from "./TaskReminderEditor";
import { DateRangePicker } from "./DateRangePicker";
import { useWorkspace } from "./WorkspaceProvider";
import { TaskFormatSelect } from "./TaskFormatSelect";
import { BriefLinkPicker } from "./BriefLinkPicker";

type Props = { task?: Task | null; onClose: () => void; onSaved?: (task: Task) => void };
function todayIso() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function newTask(): TaskInput { const today = todayIso(); return { title: "", owner: "Chưa phân công", assigneeIds: [], linkedBriefIds: [], workType: "inhouse", status: "todo", startDate: today, deadline: today, startTime: "09:00", endTime: "11:00", reminderDate: null, reminderTime: null, reminderRepeat: "none", reminderOffsets: [], format: "", brief: "", briefUrl: null }; }

export function TaskFormModal({ task, onClose, onSaved }: Props) {
  const router = useRouter();
  const { members, tasks, createTask, updateTask } = useWorkspace();
  const [form, setForm] = useState<TaskInput>(newTask);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(task ? { title: task.title, owner: task.owner, assigneeIds: task.assigneeIds, linkedBriefIds: task.linkedBriefIds ?? [], workType: task.workType, status: task.status, startDate: task.startDate ?? task.deadline ?? todayIso(), deadline: task.deadline ?? task.startDate ?? todayIso(), startTime: task.startTime, endTime: task.endTime ?? "11:00", reminderDate: task.reminderDate, reminderTime: task.reminderTime, reminderRepeat: task.reminderRepeat, reminderOffsets: task.reminderOffsets, format: task.format, brief: task.brief, briefUrl: task.briefUrl } : newTask());
    setError(null);
  }, [task]);

  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setForm((current) => ({ ...current, [key]: value }));
  const createLinkedBrief = async (suggestedTitle: string) => {
    const date = form.startDate ?? todayIso();
    const title = suggestedTitle.trim() || form.title.trim();
    if (!title) throw new Error("Vui lòng nhập tên brief trước khi tạo.");
    return createTask({ title, owner: "Chưa phân công", assigneeIds: [], linkedBriefIds: [], workType: form.workType, status: "todo", startDate: date, deadline: date, startTime: form.startTime, endTime: form.endTime, reminderDate: null, reminderTime: null, reminderRepeat: "none", reminderOffsets: [], format: form.format, brief: "", briefUrl: null });
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (savingRef.current) return; savingRef.current = true;
    setSaving(true); setError(null);
    try {
      const saved = task ? await updateTask(task.id, form) : await createTask(form);
      onSaved?.(saved);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu công việc.");
    } finally { savingRef.current = false; setSaving(false); }
  };

  return <div className="overlay" role="presentation" onMouseDown={onClose}>
    <form className="modal task-form" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
      <button type="button" className="close" aria-label="Đóng" onClick={onClose}>×</button>
      <small>{task ? "CHỈNH SỬA CÔNG VIỆC" : "CÔNG VIỆC MỚI"}</small>
      <h2>{task ? "Chỉnh sửa công việc" : "Tạo công việc"}</h2>
      <div className="task-form-sections">
        <section className="task-form-section">
          <header><span>01</span><div><h3>Thông tin cơ bản</h3></div></header>
          <div className="task-form-section-fields">
            <label className="field full">Tên công việc<input autoFocus required value={form.title} onChange={(event) => set("title", event.target.value)} placeholder="Ví dụ: Thiết kế carousel tháng 9" /></label>
            <div className="field full"><span>Brief nội dung <small>(Tuỳ chọn)</small></span><BriefLinkPicker tasks={tasks} value={form.linkedBriefIds ?? []} excludeId={task?.id} disabled={saving} onChange={(linkedBriefIds) => set("linkedBriefIds", linkedBriefIds)} onCreate={createLinkedBrief}/></div>
            <AssigneePicker members={members} value={form.assigneeIds ?? []} onChange={(assigneeIds) => set("assigneeIds", assigneeIds)} disabled={saving}/>
          </div>
        </section>
        <section className="task-form-section">
          <header><span>02</span><div><h3>Thời gian & trạng thái</h3></div></header>
          <div className="task-form-section-fields">
            <div className="field full task-date-field"><span>Thời gian thực hiện</span><DateRangePicker startDate={form.startDate} endDate={form.deadline} onChange={(startDate, deadline) => setForm((current) => ({ ...current, startDate, deadline, reminderDate: current.reminderDate && current.reminderDate > deadline ? deadline : current.reminderDate }))} label="Chọn khoảng ngày thực hiện"/></div>
            <label className="field">Loại công việc<select value={form.workType} onChange={(event) => set("workType", event.target.value as TaskInput["workType"])}>{Object.entries(workTypeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label className="field">Trạng thái<select value={form.status} onChange={(event) => set("status", event.target.value as TaskInput["status"])}>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          </div>
        </section>
        <section className="task-form-section">
          <header><span>03</span><div><h3>Cấu hình thêm</h3></div></header>
          <div className="task-form-section-fields">
            <TaskReminderEditor value={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} disabled={saving}/>
            <label className="field full">Định dạng / bàn giao<TaskFormatSelect value={form.format} onChange={(format) => set("format", format)} disabled={saving}/></label>
            {task && <div className="field full"><span>Brief nội dung</span><button type="button" className="secondary brief-form-open" onClick={() => { if (window.confirm("Đóng form chỉnh sửa công việc và mở brief? Thay đổi chưa lưu trong form sẽ bị loại bỏ.")) router.push(`/briefs?id=${encodeURIComponent(task.id)}`); }}>Mở brief ↗</button></div>}
          </div>
        </section>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Huỷ</button><button className="primary" disabled={saving}>{saving ? "Đang lưu…" : task ? "Lưu thay đổi" : "Tạo công việc"}</button></div>
    </form>
  </div>;
}
