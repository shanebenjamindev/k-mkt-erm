"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, setupRequired, login, setup } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSetup, setIsSetup] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!loading && user) router.replace("/"); }, [loading, user, router]);
  useEffect(() => { if (setupRequired) setIsSetup(true); }, [setupRequired]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSetup) await setup(name, role, username, password);
      else await login(username, password);
      router.replace("/");
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Không thể đăng nhập.";
      setError(message);
      if (message.includes("chưa có tài khoản")) setIsSetup(true);
    }
    finally { setSubmitting(false); }
  };

  return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="login-brand"><span className="brand-mark">K</span><div><strong>K-MKT Workspace</strong><small>TEAM WORKSPACE</small></div></div><div className="login-heading"><small>{isSetup ? "KHỞI TẠO" : "ĐĂNG NHẬP"}</small><h1>{isSetup ? "Tạo quản trị viên đầu tiên" : "Chào mừng trở lại"}</h1><p>{isSetup ? "Tài khoản này có quyền quản trị để tạo thành viên trong workspace. Bạn sẽ được yêu cầu đổi mật khẩu sau lần đăng nhập đầu tiên." : "Đăng nhập để quản lý công việc và tiến độ của team."}</p></div>{isSetup && <><label className="field">Họ và tên<input required autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field">Chức vụ / role<input required value={role} onChange={(event) => setRole(event.target.value)} placeholder="Ví dụ: Marketing Manager" /></label></>}<label className="field">Username<input required autoFocus={!isSetup} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label><label className="field">Mật khẩu<input required minLength={8} type="password" autoComplete={isSetup ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary login-submit" disabled={submitting}>{submitting ? "Đang xử lý…" : isSetup ? "Tạo workspace" : "Đăng nhập"}</button>{!isSetup && <button type="button" className="text-button login-help" onClick={() => { setError(null); setIsSetup(true); }}>Khởi tạo workspace mới</button>}</form></main>;
}
