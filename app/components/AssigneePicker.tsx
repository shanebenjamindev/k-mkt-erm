"use client";

import type { TeamMember } from "../../lib/types";

type Props = {
  members: TeamMember[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export function AssigneePicker({ members, value, onChange, disabled = false }: Props) {
  const selected = new Set(value);
  return <fieldset className="assignee-picker" disabled={disabled}>
    <legend>Người phụ trách</legend>
    <p>Chọn một hoặc nhiều nhân viên. Để trống nếu chưa phân công.</p>
    {members.length ? <div className="assignee-options">
      {members.map((member) => <label className={selected.has(member.id) ? "assignee-option selected" : "assignee-option"} key={member.id}>
        <input type="checkbox" checked={selected.has(member.id)} onChange={(event) => onChange(event.target.checked ? [...value, member.id] : value.filter((id) => id !== member.id))}/>
        <span className="assignee-option-avatar" aria-hidden="true">{member.initials}</span>
        <span className="assignee-option-name"><strong>{member.name}</strong><small>{member.role}</small></span>
      </label>)}
    </div> : <div className="assignee-empty">Chưa có nhân viên để phân công.</div>}
  </fieldset>;
}
