"use client";

import type { TaskInput } from "../../lib/types";

type ReminderFields = Pick<TaskInput, "reminderOffsets" | "reminderDate" | "reminderTime" | "reminderRepeat" | "startDate" | "deadline">;
type Props = { value: ReminderFields; onChange: (patch: Partial<ReminderFields>) => void; disabled?: boolean };
const units = [{ value: 1, label: "phút" }, { value: 60, label: "giờ" }, { value: 1440, label: "ngày" }];

function unitFor(minutes: number) {
  return minutes > 0 && minutes % 1440 === 0 ? 1440 : minutes > 0 && minutes % 60 === 0 ? 60 : 1;
}

export function TaskReminderEditor({ value, onChange, disabled = false }: Props) {
  const offsets = value.reminderOffsets ?? [];
  const changeOffset = (index: number, minutes: number) => {
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 10080) return;
    const next = offsets.map((offset, position) => position === index ? minutes : offset);
    if (new Set(next).size === next.length) onChange({ reminderOffsets: next });
  };
  return <details className="task-reminder-accordion">
    <summary><span>🔔 Thông báo — Nhắc trước giờ bắt đầu</span>{offsets.length > 0 && <small>{offsets.length} mốc</small>}</summary>
    <fieldset className="task-reminder-editor field full" disabled={disabled}>
    {offsets.map((offset, index) => {
      const unit = unitFor(offset);
      return <div className="task-reminder-row" key={index}>
        <span className="sr-only">Mốc nhắc {index + 1}</span>
        <input type="number" min="0" max={Math.floor(10080 / unit)} value={offset / unit} aria-label={`Số thời gian nhắc ${index + 1}`} onChange={(event) => changeOffset(index, Number(event.target.value) * unit)}/>
        <select value={unit} aria-label={`Đơn vị thời gian nhắc ${index + 1}`} onChange={(event) => { const nextUnit = Number(event.target.value); changeOffset(index, Math.max(1, Math.round(offset / nextUnit)) * nextUnit); }}>{units.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <span>trước khi bắt đầu</span>
        <button type="button" className="text-button" aria-label={`Bỏ mốc nhắc ${index + 1}`} onClick={() => onChange({ reminderOffsets: offsets.filter((_, position) => position !== index) })}>Bỏ</button>
      </div>;
    })}
    <button type="button" className="task-reminder-add" disabled={offsets.length >= 5} onClick={() => onChange({ reminderOffsets: [...offsets, [10, 30, 60, 1440, 0].find((minutes) => !offsets.includes(minutes)) ?? 5] })}>＋ Thêm thông báo</button>
    <details className="task-reminder-custom" open={Boolean(value.reminderTime)} onToggle={(event) => { if (event.currentTarget.open && !value.reminderTime) onChange({ reminderDate: value.startDate, reminderTime: "09:00", reminderRepeat: "none" }); }}>
      <summary>{value.reminderTime ? "Lịch nhắc cụ thể đã bật" : "Nhắc theo ngày và giờ cụ thể"}</summary>
      {value.reminderTime && <div className="reminder-field-grid"><label>Ngày nhắc<input type="date" value={value.reminderDate ?? value.startDate ?? ""} max={value.deadline ?? undefined} onChange={(event) => onChange({ reminderDate: event.target.value || null })}/></label><label>Giờ nhắc<input type="time" value={value.reminderTime} onChange={(event) => onChange({ reminderTime: event.target.value || null })}/></label><label>Lặp lại<select value={value.reminderRepeat ?? "none"} onChange={(event) => onChange({ reminderRepeat: event.target.value as TaskInput["reminderRepeat"] })}><option value="none">Một lần</option><option value="daily">Mỗi ngày</option><option value="weekly">Mỗi tuần</option></select></label><button type="button" className="task-reminder-disable" onClick={() => onChange({ reminderDate: null, reminderTime: null, reminderRepeat: "none" })}>Tắt lịch riêng</button></div>}
    </details>
    </fieldset>
  </details>;
}
