"use client";

import type { TeamMember } from "../../lib/types";
import { useMemo, useState } from "react";

type Props = { members: TeamMember[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean };

export function AssigneePicker({ members, value, onChange, disabled = false }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = value.map((id) => members.find((member) => member.id === id)).filter((member): member is TeamMember => Boolean(member));
  const visibleMembers = useMemo(() => members.filter((member) => `${member.name} ${member.role}`.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"))), [members, query]);
  const toggle = (member: TeamMember) => {
    onChange(value.includes(member.id) ? value.filter((id) => id !== member.id) : [...value, member.id]);
    setQuery("");
    setOpen(true);
  };

  return <div className="assignee-picker field full">
    <div className="assignee-picker-label"><span>Người phụ trách</span></div>
    <div className={`assignee-combobox${open ? " open" : ""}`}>
      <div className="assignee-chips">
        {selected.map((member) => <span className="assignee-chip" key={member.id}><span className="assignee-chip-avatar" aria-hidden="true">{member.initials}</span><span className="assignee-chip-name">{member.name}</span><button type="button" aria-label={`Bỏ ${member.name}`} disabled={disabled} onClick={() => onChange(value.filter((id) => id !== member.id))}>×</button></span>)}
        <input value={query} disabled={disabled} role="combobox" aria-expanded={open} aria-autocomplete="list" aria-label="Tìm và chọn người phụ trách" onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); if (event.key === "Enter" && visibleMembers[0]) { event.preventDefault(); toggle(visibleMembers[0]); } if (event.key === "Backspace" && !query && value.length) onChange(value.slice(0, -1)); }} placeholder={selected.length ? "Thêm nhân viên…" : "Tìm tên hoặc vai trò…"}/>
        <span className="assignee-selected-count">Đã chọn {selected.length}</span>
        {open && <>
          <button className="assignee-picker-dismiss" type="button" aria-label="Đóng danh sách nhân viên" onClick={() => setOpen(false)}/>
          <div className="assignee-dropdown" role="listbox" aria-label="Nhân viên">
            {visibleMembers.map((member) => <button type="button" role="option" aria-selected={value.includes(member.id)} className={`assignee-dropdown-option${value.includes(member.id) ? " selected" : ""}`} key={member.id} onMouseDown={(event) => event.preventDefault()} onClick={() => toggle(member)}><span className="assignee-option-avatar">{member.initials}</span><span className="assignee-option-name"><strong>{member.name}</strong><small>{member.role}</small></span>{value.includes(member.id) && <span className="assignee-check" aria-hidden="true">✓</span>}</button>)}
            {!visibleMembers.length && <p className="assignee-empty">Không tìm thấy nhân viên phù hợp.</p>}
            {!members.length && <p className="assignee-empty">Chưa có nhân viên để phân công.</p>}
          </div>
        </>}
      </div>
    </div>
  </div>;
}
