"use client";

import Link from "next/link";
import { ACTIVE_TASK_CAPACITY, assessWorkload } from "../../lib/workload";
import { useWorkspace } from "./WorkspaceProvider";

export function WorkloadCard() {
  const { tasks, members } = useWorkspace();
  const assessments = assessWorkload(tasks, members);
  const overloaded = assessments.filter((assessment) => assessment.level === "overloaded");
  const watch = assessments.filter((assessment) => assessment.level === "watch");
  const highlighted = [...overloaded, ...watch].slice(0, 3);

  return <div className="card workload-card"><div className="card-heading"><div><h2>Sức tải team</h2><p>Ngưỡng: {ACTIVE_TASK_CAPACITY} task đang hoạt động / người</p></div><Link className="view" href="/team">Xem team →</Link></div>{assessments.length === 0 ? <div className="workload-positive"><b>Chưa có dữ liệu đánh giá</b><span>Thêm thành viên và giao công việc để bắt đầu đo sức tải.</span></div> : <><div className="workload-summary"><span className={overloaded.length ? "danger-text" : "success-text"}><b>{overloaded.length}</b> quá tải</span><span className="warning-text"><b>{watch.length}</b> cần theo dõi</span></div>{highlighted.length ? <div className="workload-list">{highlighted.map((assessment) => <div className="workload-row" key={assessment.member.id}><span className="member-avatar">{assessment.member.initials}</span><div><strong>{assessment.member.name}</strong><small>{assessment.activeTasks}/{assessment.capacity} task đang mở{assessment.overdue ? ` · ${assessment.overdue} trễ hạn` : ""}</small></div><b className={`workload-label ${assessment.level}`}>{assessment.label}</b></div>)}</div> : <div className="workload-positive"><b>Team đang cân bằng</b><span>Chưa có ai vượt ngưỡng hoặc có rủi ro deadline.</span></div>}</>}</div>;
}
