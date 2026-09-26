"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import { TASK_STATUSES, statusLabels, type Task } from "../../lib/types";
import { TaskFormatSelect } from "../components/TaskFormatSelect";
import { TaskBriefEditor } from "../components/TaskBriefEditor";
import { BriefImageGallery } from "../components/BriefImageGallery";
import { TaskFormModal } from "../components/TaskFormModal";
import { useWorkspace } from "../components/WorkspaceProvider";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { WorkspaceState } from "../components/WorkspaceState";
import { Icon } from "../components/Icon";

type BriefFilter = "all" | "missing" | "review" | "delivered";
type BriefDraft = { html: string; url: string | null; title: string };
const MIN_LIST_WIDTH = 480;
const MAX_LIST_WIDTH = 700;
const LIST_WIDTH_KEY = "k-mkt-brief-list-width";

export default function BriefsWorkspace() {
  const { tasks, updateTask, createTask, removeTask } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("id") ?? "";
  const selectedTask = tasks.find((task) => task.id === selectedId);
  const [filter, setFilter] = useState<BriefFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [listWidth, setListWidth] = useState(580);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [tabMenuId, setTabMenuId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, BriefDraft>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [metadataSaving, setMetadataSaving] = useState(false);
  const metadataSavingRef = useRef(false);
  const [savedAt, setSavedAt] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const draftRef = useRef(drafts);
  const dirtyRef = useRef(dirty);
  const savingRef = useRef(false);
  const renameRef = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(false);

  useEffect(() => { draftRef.current = drafts; }, [drafts]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => {
    try {
      const stored = Number(localStorage.getItem(LIST_WIDTH_KEY));
      if (Number.isFinite(stored) && stored >= MIN_LIST_WIDTH && stored <= MAX_LIST_WIDTH) setListWidth(stored);
    } catch { /* Use the default width when storage is unavailable. */ }
  }, []);
  useEffect(() => {
    if (!selectedTask) return;
    setDrafts((current) => current[selectedTask.id] ? current : ({ ...current, [selectedTask.id]: { html: selectedTask.brief, url: selectedTask.briefUrl, title: selectedTask.title } }));
  }, [selectedTask]);
  useEffect(() => {
    if (selectedId && !selectedTask && tasks.length) router.replace("/briefs", { scroll: false });
  }, [selectedId, selectedTask, tasks.length, router]);
  useEffect(() => {
    if (!selectedId) setMobileEditorOpen(false);
    else setMobileEditorOpen(true);
  }, [selectedId]);

  const counts: Record<BriefFilter, number> = {
    all: tasks.length,
    missing: tasks.filter((task) => !task.brief.trim() && !task.briefUrl && !task.briefFinalUrl && !task.briefImages?.length).length,
    review: tasks.filter((task) => task.status === "pending_review").length,
    delivered: tasks.filter((task) => task.status === "completed").length
  };
  const visibleTasks = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("vi");
    return tasks.filter((task) => {
      const passesFilter = filter === "all" || (filter === "missing" && !task.brief.trim() && !task.briefUrl && !task.briefFinalUrl && !task.briefImages?.length) || (filter === "review" && task.status === "pending_review") || (filter === "delivered" && task.status === "completed");
      const passesSearch = !normalized || `${task.title} ${task.format}`.toLocaleLowerCase("vi").includes(normalized);
      return passesFilter && passesSearch;
    }).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "vi", { numeric: true }) : b.updatedAt.localeCompare(a.updatedAt));
  }, [tasks, filter, search, sort]);
  const draft = selectedTask ? drafts[selectedTask.id] ?? { html: selectedTask.brief, url: selectedTask.briefUrl, title: selectedTask.title } : null;
  const isDirty = selectedTask ? Boolean(dirty[selectedTask.id]) : false;
  const saveTask = useCallback(async (id: string) => {
    if (savingRef.current || metadataSavingRef.current || !dirtyRef.current[id]) return;
    const value = draftRef.current[id];
    if (!value) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const saved = await updateTask(id, { brief: value.html, briefUrl: value.url, title: value.title.trim() || tasks.find((task) => task.id === id)?.title || "Brief mới" });
      setDrafts((current) => ({ ...current, [id]: { html: saved.brief, url: saved.briefUrl, title: saved.title } }));
      setDirty((current) => ({ ...current, [id]: false }));
      setSavedAt(new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể lưu brief.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [tasks, updateTask]);

  const openTask = useCallback((id: string) => {
    if (selectedId && selectedId !== id && dirtyRef.current[selectedId]) void saveTask(selectedId);
    router.replace(`/briefs?id=${encodeURIComponent(id)}`, { scroll: false });
  }, [router, saveTask, selectedId]);

  useEffect(() => {
    const dirtyIds = Object.keys(dirty).filter((id) => dirty[id]);
    if (!dirtyIds.length || saving || metadataSaving) return;
    const timer = window.setTimeout(() => { dirtyIds.forEach((id) => { void saveTask(id); }); }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, drafts, saving, metadataSaving, saveTask]);

  const updateDraft = (html: string, url: string | null) => {
    if (!selectedTask) return;
    const id = selectedTask.id;
    setDrafts((current) => {
      const next = { ...current, [id]: { ...(current[id] ?? { title: selectedTask.title }), html, url } };
      draftRef.current = next;
      return next;
    });
    setDirty((current) => {
      const next = { ...current, [id]: true };
      dirtyRef.current = next;
      return next;
    });
  };
  const updateTitle = (value: string) => {
    if (!selectedTask) return;
    const id = selectedTask.id;
    setDrafts((current) => {
      const next = { ...current, [id]: { ...(current[id] ?? { html: selectedTask.brief, url: selectedTask.briefUrl }), title: value } };
      draftRef.current = next;
      return next;
    });
    setDirty((current) => {
      const next = { ...current, [id]: true };
      dirtyRef.current = next;
      return next;
    });
  };

  const resizeStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const originX = event.clientX;
    const originWidth = listWidth;
    const move = (moveEvent: PointerEvent) => {
      const width = Math.max(MIN_LIST_WIDTH, Math.min(MAX_LIST_WIDTH, originWidth + moveEvent.clientX - originX));
      setListWidth(width);
      try { localStorage.setItem(LIST_WIDTH_KEY, String(width)); } catch { /* Resizing still works until reload. */ }
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  };

  const createBrief = async (source?: Task, duplicate = false) => {
    const date = source?.startDate ?? source?.deadline ?? new Date().toISOString().slice(0, 10);
    try {
      const created = await createTask({ title: duplicate && source ? `${source.title} (bản sao)` : source ? `Brief mới - ${source.title}` : "Brief mới", owner: source?.owner ?? "Chưa phân công", assigneeIds: source?.assigneeIds ?? [], linkedBriefIds: duplicate && source ? source.linkedBriefIds : [], workType: source?.workType ?? "inhouse", status: "todo", startDate: date, deadline: source?.deadline ?? date, startTime: source?.startTime ?? "09:00", endTime: source?.endTime ?? "11:00", reminderDate: null, reminderTime: null, reminderRepeat: "none", reminderOffsets: [], format: source?.format ?? "", brief: duplicate && source ? source.brief : "", briefUrl: duplicate && source ? source.briefUrl : null, briefFinalUrl: duplicate && source ? source.briefFinalUrl : null, briefImages: duplicate && source ? source.briefImages : [] });
      setCreateOpen(false);
      setTabMenuId(null);
      if (duplicate && source) setDrafts((current) => ({ ...current, [created.id]: { html: source.brief, url: source.briefUrl, title: created.title } }));
      openTask(created.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tạo brief mới."); }
  };
  const renameBrief = async (task: Task) => {
    const name = window.prompt("Tên brief", task.title);
    if (!name?.trim()) return;
    try { await updateTask(task.id, { title: name.trim() }); setTabMenuId(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đổi tên brief."); }
  };
  const deleteBrief = async (task: Task) => {
    if (!window.confirm(`Xoá brief “${task.title}”? Thao tác này không thể hoàn tác.`)) return;
    try {
      await removeTask(task.id);
      setTabMenuId(null);
      setDrafts((current) => { const next = { ...current }; delete next[task.id]; draftRef.current = next; return next; });
      setDirty((current) => { const next = { ...current }; delete next[task.id]; dirtyRef.current = next; return next; });
      if (task.id === selectedId) {
        const next = visibleTasks.find((candidate) => candidate.id !== task.id);
        if (next) openTask(next.id); else router.replace("/briefs", { scroll: false });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể xoá brief."); }
  };

  const changeMetadata = async (patch: Partial<Pick<Task, "status" | "format">>) => {
    if (!selectedTask || savingRef.current || metadataSavingRef.current) return;
    metadataSavingRef.current = true;
    setMetadataSaving(true);
    setError("");
    try { await updateTask(selectedTask.id, patch); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể cập nhật thông tin brief."); }
    finally { metadataSavingRef.current = false; setMetadataSaving(false); }
  };

  const filters: [BriefFilter, string][] = [["all", "Tất cả"], ["missing", "Thiếu nội dung"], ["review", "Chờ duyệt"], ["delivered", "Đã xong"]];
  const shellTitle = selectedTask ? `Brief nội dung${selectedTask.format ? ` · ${selectedTask.format}` : ""}` : "Brief & tài liệu";
  return <WorkspaceShell title={shellTitle}>
    <WorkspaceState>
      <main className={`brief-workspace${listCollapsed ? " list-collapsed" : ""}${mobileEditorOpen ? " mobile-editor-open" : ""}`} style={{ "--brief-list-width": `${listWidth}px` } as CSSProperties}>
        <aside className="brief-list-pane" aria-label="Danh sách brief">
          <header className="brief-list-header">
            <div className="brief-list-title-row"><div><small>WORKSPACE</small><h1>Tất cả brief</h1><p>{tasks.length} tài liệu trong workspace</p></div><button className="brief-add-button" type="button" title="Tạo brief mới" aria-label="Tạo brief mới" onClick={() => setCreateOpen(true)}>＋</button></div>
            <label className="brief-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm tên hoặc định dạng" aria-label="Tìm brief"/>{search && <button type="button" onClick={() => setSearch("")} aria-label="Xoá tìm kiếm">×</button>}</label>
            <div className="brief-list-controls"><div className="brief-filter-row" role="tablist" aria-label="Lọc brief">{filters.map(([value, label]) => <button type="button" key={value} role="tab" aria-selected={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}<span>{counts[value]}</span></button>)}</div><label className="brief-sort"><span>Sắp xếp</span><select value={sort} onChange={(event) => setSort(event.target.value as "recent" | "title")} aria-label="Sắp xếp brief"><option value="recent">Cập nhật gần đây</option><option value="title">Tên brief</option></select></label></div>
          </header>
          <div className="brief-list-scroll">
            {visibleTasks.length ? visibleTasks.map((task) => {
              const hasContent = Boolean(task.brief.trim() || task.briefUrl || task.briefFinalUrl || task.briefImages?.length);
              const statusClass = task.status === "in_progress" ? "working" : hasContent ? "has-content" : "missing-content";
              const statusText = task.status === "in_progress" ? "Đang làm" : hasContent ? "Có nội dung brief" : "Chưa có nội dung";
              return <article key={task.id} className={`brief-list-item${selectedId === task.id ? " selected" : ""}`}>
              <button className="brief-item-open" type="button" onClick={() => openTask(task.id)} aria-current={selectedId === task.id ? "true" : undefined}>
                <span className="brief-item-doc-icon" aria-hidden="true"><Icon name="briefs" size={20} strokeWidth={1.9}/></span><span className="brief-item-copy"><span className="brief-item-titleline"><span className="brief-item-name">{task.title}</span><span className="brief-item-format">{task.format || "Chưa xác định"}</span></span><span className="brief-item-preview">{hasContent ? "Brief đã sẵn sàng để xem và chỉnh sửa" : "Brief chưa có nội dung"}{task.briefUrl ? " · Có Google Docs" : task.briefImages?.length ? ` · ${task.briefImages.length} ảnh` : ""}</span></span><span className={`brief-item-status ${statusClass}`}>{statusText}</span>
              </button>
              <button className="brief-item-menu-trigger" type="button" aria-label={`Tùy chọn ${task.title}`} aria-expanded={tabMenuId === task.id} onClick={() => setTabMenuId((current) => current === task.id ? null : task.id)}>⋮</button>
              {tabMenuId === task.id && <><button className="brief-menu-dismiss" aria-label="Đóng menu" onClick={() => setTabMenuId(null)}/><div className="brief-item-menu"><button type="button" onClick={() => void renameBrief(task)}>Đổi tên</button><button type="button" onClick={() => void createBrief(task, true)}>Nhân bản</button><button className="destructive" type="button" onClick={() => void deleteBrief(task)}>Xoá brief</button></div></>}
            </article>; }) : <div className="brief-list-empty"><span><Icon name="briefs" size={22}/></span><strong>Không tìm thấy brief</strong><p>Thử đổi từ khoá hoặc bộ lọc.</p></div>}
          </div>
          <footer className="brief-list-footer"><button type="button" onClick={() => setListCollapsed(true)} aria-label="Thu gọn danh sách brief" title="Thu gọn danh sách brief">‹ Thu gọn danh sách</button><span>{visibleTasks.length} / {tasks.length}</span></footer>
        </aside>
        {!listCollapsed && <button className="brief-resize-handle" onPointerDown={resizeStart} aria-label="Kéo để đổi độ rộng danh sách brief" title="Kéo để đổi độ rộng danh sách brief"/>}
        {listCollapsed && <button className="brief-list-expand" type="button" onClick={() => setListCollapsed(false)} aria-label="Mở danh sách brief" title="Mở danh sách brief">›</button>}
        <section className="brief-editor-pane" aria-label="Trình soạn brief">
          {selectedTask && draft ? <>
            <header className="brief-editor-header">
              <button className="brief-mobile-back" type="button" onClick={() => { router.replace("/briefs", { scroll: false }); setMobileEditorOpen(false); }}>← <span>Danh sách</span></button>
              <div className="brief-editor-heading"><span className="brief-doc-icon" aria-hidden="true"><Icon name="briefs" size={20} strokeWidth={1.9}/></span><div className="brief-editor-name-wrap">{renaming ? <input ref={renameRef} autoFocus value={draft.title} onChange={(event) => updateTitle(event.target.value)} onBlur={() => setRenaming(false)} onKeyDown={(event) => { if (event.key === "Enter") setRenaming(false); if (event.key === "Escape") { updateTitle(selectedTask.title); setRenaming(false); } }} aria-label="Tên brief"/> : <button className="brief-editor-name" type="button" title="Đổi tên brief" onClick={() => { setRenaming(true); window.setTimeout(() => renameRef.current?.select(), 0); }}>{draft.title || selectedTask.title}</button>}<TaskFormatSelect className="brief-editor-format" value={selectedTask.format} onChange={(format) => void changeMetadata({ format })} disabled={saving || metadataSaving} ariaLabel="Định dạng brief"/>{selectedTask.briefFinalUrl?.startsWith("https://") && <a className="brief-final-link-trigger" href={selectedTask.briefFinalUrl} target="_blank" rel="noopener noreferrer" title="Mở liên kết ảnh final"><Icon name="external" size={14}/> <span>Ảnh final</span></a>}</div><button className="brief-star-button" type="button" title="Đánh dấu sao" aria-label="Đánh dấu sao">☆</button><span className="brief-save-indicator" role="status">{saving ? "Đang lưu…" : isDirty ? "Chưa lưu thay đổi" : savedAt ? `Đã lưu lúc ${savedAt}` : "Đã lưu"}</span></div>
              <div className="brief-editor-actions"><BriefImageGallery key={selectedTask.id} taskId={selectedTask.id} initialImages={selectedTask.briefImages ?? []} initialFinalUrl={selectedTask.briefFinalUrl}/><label className="brief-status-control"><span className="sr-only">{metadataSaving ? "Đang cập nhật…" : "Trạng thái"}</span><select className={`brief-status-select ${selectedTask.status}`} value={selectedTask.status} disabled={saving || metadataSaving} aria-label="Trạng thái brief" onChange={(event) => void changeMetadata({ status: event.target.value as Task["status"] })}>{TASK_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><button type="button" className="brief-expand-button" title={listCollapsed ? "Mở rộng danh sách" : "Mở rộng editor"} aria-label={listCollapsed ? "Mở danh sách brief" : "Mở rộng editor"} onClick={() => setListCollapsed((current) => !current)}>{listCollapsed ? "⤡" : "⤢"}</button><button className="brief-save-button" type="button" disabled={!isDirty || saving || metadataSaving} onClick={() => void saveTask(selectedTask.id)}>{saving ? "Đang lưu…" : "Lưu brief"}</button></div>
            </header>
            <div className="brief-editor-scroll"><div className="brief-editor-page" style={{ zoom }}><TaskBriefEditor value={draft.html} docUrl={draft.url} onChange={updateDraft} disabled={saving} toolbarVariant="docs"/></div></div>
            <footer className="brief-editor-footer"><span>{isDirty ? "Đang đồng bộ thay đổi…" : "Tất cả thay đổi đã lưu"}</span><span><button type="button" aria-label="Thu nhỏ nội dung" onClick={() => setZoom((value) => Math.max(0.7, Math.round((value - 0.1) * 10) / 10))}>−</button>{Math.round(zoom * 100)}%<button type="button" aria-label="Phóng to nội dung" onClick={() => setZoom((value) => Math.min(1.3, Math.round((value + 0.1) * 10) / 10))}>＋</button></span></footer>
          </> : <div className="brief-editor-empty"><span className="brief-empty-icon"><Icon name="briefs" size={27} strokeWidth={1.8}/></span><h2>{tasks.length ? "Chọn một brief để bắt đầu" : "Chưa có brief nào"}</h2><p>{tasks.length ? "Chọn tài liệu ở danh sách bên trái để đọc hoặc chỉnh sửa." : "Tạo một brief để bắt đầu soạn nội dung cho workspace."}</p>{!tasks.length && <button className="brief-save-button" type="button" onClick={() => setCreateOpen(true)}>＋ Tạo brief</button>}</div>}
        </section>
        {error && <div className="brief-workspace-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>Đóng</button></div>}
        {createOpen && <TaskFormModal onClose={() => setCreateOpen(false)} onSaved={(task) => openTask(task.id)}/>}
      </main>
    </WorkspaceState>
  </WorkspaceShell>;
}
