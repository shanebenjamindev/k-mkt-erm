"use client";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { TaskStatus } from "../../lib/types";
import { normalizeWorkflow, WORKFLOW_COLORS, workflowTextColor } from "../../lib/project-settings";
import { useProjectSettings } from "./ProjectSettingsProvider";
import { useAuth } from "./AuthProvider";
import { can } from "../../lib/permissions";
export function StatusProgress({ value, onChange, disabled = false, label = "Quy trình công việc" }: { value: TaskStatus; onChange: (value: TaskStatus) => void; disabled?: boolean; label?: string }) {
  const { settings } = useProjectSettings();
  const { user } = useAuth();
  const steps = normalizeWorkflow(settings.workflow);
  return <section className="workflow-panel" aria-label={label}><div className="workflow-heading"><strong>{label}</strong>{can(user, "project.settings.update") && <Link href="/settings#workflow">Chỉnh sửa quy trình</Link>}</div><div className="status-progress" role="group" aria-label={label}>{steps.map((step, index) => <button type="button" key={step.status} style={{ "--step-color": step.color ?? WORKFLOW_COLORS[step.status], "--step-text": workflowTextColor(step.color ?? WORKFLOW_COLORS[step.status]) } as CSSProperties} className={index <= steps.findIndex(step => step.status === value) ? "is-reached" : ""} aria-pressed={value === step.status} disabled={disabled} onClick={() => onChange(step.status)}>{step.label}</button>)}</div></section>;
}
