"use client";

import { useEffect, useState } from "react";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { useAuth } from "../components/AuthProvider";
import { useWorkspace } from "../components/WorkspaceProvider";

type ProfileForm = { name: string; role: string; username: string; avatarUrl?: string; newPassword: string; confirmPassword: string };

export default function ProfilePage() {
  const { user, refresh: refreshAuth } = useAuth();
  const { refresh: refreshWorkspace } = useWorkspace();
  const forced = Boolean(user?.mustChangePassword);
  const [form, setForm] = useState<ProfileForm>({ name: "", role: "", username: "", avatarUrl: undefined, newPassword: "", confirmPassword: "" });
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) setForm((current) => ({ ...current, name: user.name, role: user.role, username: user.username, avatarUrl: user.avatarUrl }));
  }, [user]);

  const pickAvatar = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setMessage({ type: "error", text: "Chỉ chấp nhận tệp ảnh cho avatar." }); return; }
    if (file.size > 1_500_000) { setMessage({ type: "error", text: "Avatar phải nhỏ hơn 1.5 MB." }); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, avatarUrl: typeof reader.result === "string" ? reader.result : current.avatarUrl }));
    reader.readAsDataURL(file);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (forced && !form.newPassword) { setMessage({ type: "error", text: "Bạn cần tạo mật khẩu mới để tiếp tục." }); return; }
    if (form.newPassword && form.newPassword.length < 8) { setMessage({ type: "error", text: "Mật khẩu mới phải có ít nhất 8 ký tự." }); return; }
    if (form.newPassword !== form.confirmPassword) { setMessage({ type: "error", text: "Xác nhận mật khẩu mới chưa khớp." }); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Không thể cập nhật hồ sơ.");
      await Promise.all([refreshAuth(), refreshWorkspace()]);
      setForm((current) => ({ ...current, newPassword: "", confirmPassword: "" }));
      setMessage({ type: "success", text: form.newPassword ? "Đã cập nhật hồ sơ và mật khẩu mới." : "Đã cập nhật thông tin tài khoản." });
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Không thể cập nhật hồ sơ." });
    } finally { setSaving(false); }
  };

  return <WorkspaceShell title="Tài khoản"><div className="profile-page"><div className="page-heading"><div><small>WORKSPACE / PROFILE</small><h1>Thông tin tài khoản</h1><p>Quản lý hồ sơ, avatar và thông tin đăng nhập của bạn.</p></div></div>{forced && <div className="password-alert"><b>Đổi mật khẩu bắt buộc</b><span>Đây là lần đăng nhập đầu tiên. Hãy tạo mật khẩu mới trước khi dùng workspace.</span></div>}<form className="profile-card" onSubmit={submit}><section className="profile-avatar-panel"><div className="profile-avatar">{form.avatarUrl ? <img src={form.avatarUrl} alt="Avatar hiện tại" /> : user?.initials}</div><label className="secondary avatar-upload">Chọn avatar<input type="file" accept="image/*" onChange={(event) => pickAvatar(event.target.files?.[0])} /></label>{form.avatarUrl && <button type="button" className="text-button" onClick={() => setForm((current) => ({ ...current, avatarUrl: undefined }))}>Xóa avatar</button>}<small>PNG, JPG hoặc WEBP · tối đa 1.5 MB</small></section><section className="profile-form"><div className="form-grid"><label className="field">Họ và tên<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label className="field">Chức vụ<input required value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} /></label><label className="field full">Username<input required pattern="[A-Za-z0-9._-]{3,64}" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} /></label></div><div className="password-fields"><div><h2>Đổi mật khẩu</h2><p>Để trống nếu chưa muốn đổi mật khẩu.</p></div><div className="form-grid"><label className="field">Mật khẩu mới<input type="password" minLength={8} required={forced} autoComplete="new-password" value={form.newPassword} onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))} /></label><label className="field">Xác nhận mật khẩu mới<input type="password" minLength={8} required={forced} autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} /></label></div></div>{message && <p className={message.type === "success" ? "form-success" : "form-error"} role="status">{message.text}</p>}<div className="form-actions"><button className="primary" disabled={saving}>{saving ? "Đang lưu…" : "Lưu thay đổi"}</button></div></section></form></div></WorkspaceShell>;
}
