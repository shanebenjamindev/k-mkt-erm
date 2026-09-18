"use client";

import { useMemo, useState } from "react";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { WorkspaceState } from "../components/WorkspaceState";
import { useWorkspace } from "../components/WorkspaceProvider";
import { useAuth } from "../components/AuthProvider";
import { ACTIVE_TASK_CAPACITY, assessWorkload, type WorkloadAssessment } from "../../lib/workload";
import { accessRoleLabels, workTypeLabels, type TeamMember, type TeamMemberInput } from "../../lib/types";

export default function TeamPage() {
  const { user } = useAuth();
  const { members, tasks, removeMember } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const assessments = useMemo(() => assessWorkload(tasks, members), [tasks, members]);
  const memberAssessments = useMemo(() => {
    const byId = new Map(assessments.map((assessment) => [assessment.member.id, assessment]));
    return members.map((member) => byId.get(member.id)).filter((assessment): assessment is WorkloadAssessment => Boolean(assessment));
  }, [members, assessments]);
  const overloaded = memberAssessments.filter((assessment) => assessment.level === "overloaded").length;
  const watch = memberAssessments.filter((assessment) => assessment.level === "watch").length;
  const balanced = memberAssessments.filter((assessment) => assessment.level === "balanced").length;
  const unassigned = tasks.filter((task) => task.owner.trim().toLocaleLowerCase() === "chưa phân công").length;

  const destroy = async (member: TeamMember, activeTasks: number) => {
    const warning = activeTasks ? ` ${activeTasks} task đang mở của ${member.name} sẽ chuyển sang “Chưa phân công”.` : "";
    if (!window.confirm(`Xoá tài khoản ${member.username}?${warning}`)) return;
    setActionError(null);
    setRemovingId(member.id);
    try { await removeMember(member.id); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Không thể xoá nhân viên."); }
    finally { setRemovingId(null); }
  };

  if (user?.accessRole !== "admin") return <WorkspaceShell title="Nhân viên"><div className="access-denied"><small>KHÔNG CÓ QUYỀN</small><h1>Khu vực quản trị nhân viên</h1><p>Chỉ quản trị viên mới được xem và quản lý tài khoản nhân viên.</p></div></WorkspaceShell>;

  return <WorkspaceShell title="Nhân viên"><WorkspaceState><div className="page-heading"><div><small>ADMIN / EMPLOYEES</small><h1>Quản lý nhân viên</h1><p>Tạo tài khoản, phân quyền và theo dõi khối lượng công việc của team.</p></div><button className="primary" onClick={() => setAdding(true)}>＋ Thêm nhân viên</button></div><div className="team-stats performance-stats"><div className="performance-overloaded"><strong>{overloaded}</strong><span>Đang quá tải</span></div><div className="performance-watch"><strong>{watch}</strong><span>Cần theo dõi</span></div><div className="performance-balanced"><strong>{balanced}</strong><span>Khối lượng ổn định</span></div></div><div className="workload-explainer"><b>Cách đo:</b> tối đa {ACTIVE_TASK_CAPACITY} task chưa hoàn thành/người. Từ {ACTIVE_TASK_CAPACITY - 1} task, có deadline gần hoặc trễ hạn sẽ được gắn cảnh báo.{unassigned ? <span className="unassigned-alert"> {unassigned} task chưa được phân công.</span> : null}</div>{actionError && <p className="form-error team-error">{actionError}</p>}<div className="people-grid">{memberAssessments.map((assessment) => <MemberCard key={assessment.member.id} assessment={assessment} removing={removingId === assessment.member.id} onEdit={() => { setActionError(null); setEditing(assessment.member); }} onDelete={() => void destroy(assessment.member, assessment.activeTasks)} />)}</div>{members.length === 0 && <div className="empty-panel">Chưa có nhân viên. Hãy tạo tài khoản đầu tiên.</div>}</WorkspaceState>{adding && <MemberForm onClose={() => setAdding(false)} />}{editing && <MemberForm member={editing} onClose={() => setEditing(null)} />}</WorkspaceShell>;
}

function MemberCard({ assessment, onEdit, onDelete, removing }: { assessment: WorkloadAssessment; onEdit: () => void; onDelete: () => void; removing: boolean }) {
  const person = assessment.member;
  return <div className={`person-card workload-person ${assessment.level}`}><div className="person-top"><span className="member-avatar">{person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : person.initials}</span><b className={`workload-label ${assessment.level}`}>{assessment.label}</b></div><h3>{person.name}</h3><p>@{person.username} · {person.role}</p><div className="member-tags"><label className={person.workType === "inhouse" ? "member-tag inhouse-tag" : "member-tag outsource-tag"}>{workTypeLabels[person.workType]}</label><label className={person.accessRole === "admin" ? "member-tag admin-tag" : "member-tag employee-tag"}>{accessRoleLabels[person.accessRole]}</label></div><div className="person-workload"><div><span>Task đang mở</span><b>{assessment.activeTasks}/{assessment.capacity}</b></div><div className="load-meter" aria-label={`${assessment.utilization}% sức tải`}><span style={{ width: `${Math.min(100, assessment.utilization)}%` }}/></div><div className="workload-metrics"><span>Gần hạn <b>{assessment.dueSoon}</b></span><span>Trễ hạn <b>{assessment.overdue}</b></span><span>Hoàn thành <b>{assessment.completionRate}%</b></span></div><p className="workload-recommendation">{assessment.recommendation}</p></div><div className="person-footer"><span>Tổng công việc <b>{assessment.totalTasks}</b></span><div className="member-actions"><button className="text-button" onClick={onEdit}>Sửa</button><button className="text-button delete-button" disabled={removing} onClick={onDelete}>{removing ? "Đang xoá…" : "Xoá"}</button></div></div></div>;
}

function MemberForm({ member, onClose }: { member?: TeamMember; onClose: () => void }) {
  const { createMember, updateMember } = useWorkspace();
  const [form, setForm] = useState<TeamMemberInput>(member ? { name: member.name, role: member.role, workType: member.workType, username: member.username, accessRole: member.accessRole, avatarUrl: member.avatarUrl, password: "" } : { name: "", role: "", workType: "inhouse", username: "", accessRole: "employee", avatarUrl: undefined, password: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); setError(null); try { if (member) await updateMember(member.id, form); else await createMember(form); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể lưu nhân viên."); } finally { setSaving(false); } };
  const selectAvatar = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Chỉ chấp nhận tệp ảnh cho avatar."); return; }
    if (file.size > 1_500_000) { setError("Avatar phải nhỏ hơn 1.5 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, avatarUrl: typeof reader.result === "string" ? reader.result : current.avatarUrl }));
    reader.readAsDataURL(file);
  };
  return <div className="overlay" role="presentation" onMouseDown={onClose}><form className="modal task-form member-form" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="close" aria-label="Đóng" onClick={onClose}>×</button><small>{member ? "CẬP NHẬT TÀI KHOẢN" : "TÀI KHOẢN NHÂN VIÊN MỚI"}</small><h2>{member ? `Sửa ${member.name}` : "Thêm nhân viên"}</h2><div className="form-grid"><label className="field full">Họ và tên<input required autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ví dụ: An Nguyễn" /></label><label className="field">Username<input required pattern="[A-Za-z0-9._-]{3,64}" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} placeholder="Ví dụ: an.nguyen" /></label><label className="field">{member ? "Mật khẩu mới" : "Mật khẩu"}<input required={!member} minLength={8} type="password" autoComplete="new-password" value={form.password ?? ""} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder={member ? "Để trống nếu không đổi" : "Ít nhất 8 ký tự"} /></label><label className="field">Vai trò công việc<input required value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} placeholder="Ví dụ: Graphic designer" /></label><label className="field">Loại thành viên<select value={form.workType} onChange={(event) => setForm((current) => ({ ...current, workType: event.target.value as TeamMemberInput["workType"] }))}><option value="inhouse">In-house</option><option value="outsource">Outsource</option></select></label><label className="field">Avatar (tuỳ chọn)<input type="file" accept="image/*" onChange={(event) => selectAvatar(event.target.files?.[0])} /></label><label className="field full">Quyền truy cập<select value={form.accessRole} onChange={(event) => setForm((current) => ({ ...current, accessRole: event.target.value as TeamMemberInput["accessRole"] }))}><option value="employee">Nhân viên</option><option value="admin">Quản trị viên</option></select></label></div>{form.avatarUrl && <div className="avatar-preview"><img src={form.avatarUrl} alt="Avatar xem trước" /><button type="button" className="text-button" onClick={() => setForm((current) => ({ ...current, avatarUrl: undefined }))}>Bỏ avatar</button></div>}{member && <p className="form-help">Nếu đổi tên, các task đang giao cho nhân viên này cũng được cập nhật. Không thể xoá hoặc hạ quyền quản trị viên cuối cùng.</p>}{error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={onClose}>Huỷ</button><button className="primary" disabled={saving}>{saving ? "Đang lưu…" : member ? "Lưu thay đổi" : "Tạo tài khoản"}</button></div></form></div>;
}
