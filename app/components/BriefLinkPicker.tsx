"use client";

import { useMemo, useState } from "react";
import type { Task } from "../../lib/types";
import { statusLabels } from "../../lib/types";
import { Icon } from "./Icon";

type Props = {
  tasks: Task[];
  value: string[];
  onChange: (ids: string[]) => void;
  excludeId?: string;
  disabled?: boolean;
  onCreate: (title: string) => Promise<Task | void>;
};

function dot(status: Task["status"]) {
  return status === "completed" ? "green" : status === "pending_review" ? "yellow" : status === "in_progress" ? "blue" : "gray";
}

export function BriefLinkPicker({ tasks, value, onChange, excludeId, disabled = false, onCreate }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const selected = value.map((id) => tasks.find((task) => task.id === id)).filter((task): task is Task => Boolean(task));
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return tasks.filter((task) => task.id !== excludeId && !value.includes(task.id) && (!normalized || `${task.title} ${task.format}`.toLocaleLowerCase("vi").includes(normalized))).slice(0, 30);
  }, [tasks, excludeId, value, query]);

  const select = (task: Task) => { onChange([...value, task.id]); setQuery(""); setOpen(true); };
  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const created = await onCreate(query.trim());
      if (created) onChange([...value, created.id]);
      setQuery("");
      setOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể tạo brief.");
    } finally { setCreating(false); }
  };

  return <div className="brief-link-picker">
    <div className={`brief-link-control${open ? " open" : ""}`}>
      <div className="brief-link-chips">
        {selected.map((task) => <span className="brief-link-chip" key={task.id}>
          <a href={`/briefs?id=${encodeURIComponent(task.id)}`} target="_blank" rel="noreferrer noopener" title="Mở brief trong tab mới"><Icon name="briefs" size={14}/>{task.title}</a>
          <button type="button" aria-label={`Bỏ liên kết ${task.title}`} disabled={disabled} onClick={() => onChange(value.filter((id) => id !== task.id))}>×</button>
        </span>)}
        <input value={query} disabled={disabled} role="combobox" aria-expanded={open} aria-controls="brief-link-options" aria-autocomplete="list" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter" && matches[0]) { event.preventDefault(); select(matches[0]); } if (event.key === "Backspace" && !query && value.length) onChange(value.slice(0, -1)); }} placeholder={selected.length ? "Thêm brief liên kết…" : "Tìm brief theo tên hoặc mã…"} aria-label="Tìm và liên kết brief"/>
        <span className="brief-link-count">Đã chọn {selected.length}</span>
      </div>
      {open && <>
        <button className="brief-picker-dismiss" type="button" aria-label="Đóng danh sách brief" onClick={() => setOpen(false)}/>
        <div id="brief-link-options" className="brief-link-options" role="listbox" aria-label="Brief có thể liên kết">
          {matches.map((task) => <button type="button" role="option" aria-selected="false" key={task.id} className="brief-link-option" onMouseDown={(event) => event.preventDefault()} onClick={() => select(task)}>
            <span className={`brief-link-status ${dot(task.status)}`} aria-hidden="true"/><span className="brief-link-option-copy"><strong>{task.title}</strong><small>{task.format || "Chưa xác định"}</small></span><span className="brief-link-option-status">{statusLabels[task.status]}</span>
          </button>)}
          {!matches.length && <p className="brief-link-no-results">Không tìm thấy brief phù hợp.</p>}
          <button type="button" className="brief-link-create" disabled={creating || disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => void create()}>{creating ? "Đang tạo brief…" : `＋ Tạo brief mới${query.trim() ? `: ${query.trim()}` : ""}`}</button>
          {error && <p className="brief-link-error" role="alert">{error}</p>}
        </div>
      </>}
    </div>
  </div>;
}
