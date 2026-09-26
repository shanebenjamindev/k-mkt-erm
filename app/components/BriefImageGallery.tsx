"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import type { BriefImage } from "../../lib/types";
import { driveImagePreviewUrl } from "../../lib/drive-links";
import { useWorkspace } from "./WorkspaceProvider";
import { Icon } from "./Icon";
import { BriefImageAsset } from "./BriefImageAsset";

type Props = { taskId: string; initialImages: BriefImage[]; initialFinalUrl: string | null };

function imageSource(image: BriefImage) {
  if (image.src) {
    // Older briefs may still contain a raw Drive URL. Fetch it through the
    // authenticated image proxy so Google serves the file bytes, not its HTML viewer.
    const proxiedDriveUrl = driveImagePreviewUrl(image.src);
    return proxiedDriveUrl;
  }
  // Keep previously imported Drive images readable; new uploads use app storage.
  return image.driveFileId ? driveImagePreviewUrl(`https://drive.google.com/file/d/${image.driveFileId}/view`) : "";
}

export function BriefImageGallery({ taskId, initialImages, initialFinalUrl }: Props) {
  const { updateTask } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState(initialImages);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [finalUrlBusy, setFinalUrlBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [message, setMessage] = useState("");
  const [finalUrl, setFinalUrl] = useState(initialFinalUrl ?? "");
  const [savedFinalUrl, setSavedFinalUrl] = useState(initialFinalUrl ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef(images);
  const queueRef = useRef<BriefImage[] | null>(null);
  const savingRef = useRef(false);
  const dragDepthRef = useRef(0);

  useEffect(() => { imagesRef.current = images; }, [images]);
  useEffect(() => {
    imagesRef.current = initialImages;
    setImages(initialImages);
  }, [initialImages]);
  const persist = useCallback(async (next: BriefImage[]) => {
    imagesRef.current = next;
    setImages(next);
    queueRef.current = next;
    if (savingRef.current) return true;
    savingRef.current = true;
    setBusy(true);
    try {
      while (queueRef.current) {
        const value = queueRef.current;
        queueRef.current = null;
        let saved: Awaited<ReturnType<typeof updateTask>> | null = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          try { saved = await updateTask(taskId, { briefImages: value }); break; }
          catch (error) {
            if (!(error instanceof Error) || !error.message.includes("đang được lưu") || attempt === 4) throw error;
            await new Promise((resolve) => window.setTimeout(resolve, 180 + attempt * 120));
          }
        }
        if (!saved) throw new Error("Không thể lưu thư viện ảnh.");
        imagesRef.current = saved.briefImages;
        setImages(saved.briefImages);
      }
      setMessage("Đã lưu");
      window.setTimeout(() => setMessage(""), 1800);
      return true;
    } catch (error) {
      queueRef.current = null;
      setMessage(error instanceof Error ? error.message : "Không thể lưu thư viện ảnh.");
      return false;
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }, [taskId, updateTask]);

  const uploadFiles = async (files: File[]) => {
    if (!files.length || busy || imagesRef.current.length >= 1000) return;
    const allowed = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp"]);
    const remaining = 1000 - imagesRef.current.length;
    const valid = files.filter((file) => allowed.has(file.type) && file.size > 0 && file.size <= 8 * 1024 * 1024).slice(0, remaining);
    const invalidCount = files.length - valid.length;
    if (!valid.length) {
      setMessage(invalidCount ? "Chọn ảnh PNG, JPG, WebP, GIF, AVIF hoặc BMP dưới 8 MB mỗi ảnh." : "Thư viện đã đạt giới hạn 1.000 ảnh.");
      return;
    }
    setBusy(true);
    setMessage("");
    const uploaded: BriefImage[] = [];
    let failed = 0;
    let firstUploadError = "";
    try {
      for (let index = 0; index < valid.length; index += 1) {
        setMessage(`Đang tải ảnh ${index + 1}/${valid.length}…`);
        const form = new FormData();
        form.set("file", valid[index]);
        try {
          const response = await fetch(`/api/briefs/${encodeURIComponent(taskId)}/images`, { method: "POST", body: form });
          const result = await response.json().catch(() => ({})) as { image?: BriefImage; error?: string };
          if (!response.ok || !result.image) {
            const fallback = response.status === 413 ? "Ảnh vượt giới hạn dung lượng máy chủ. Hãy chọn ảnh nhỏ hơn." : response.status >= 500 ? `Máy chủ không lưu được ảnh (lỗi ${response.status}).` : `Không thể tải ảnh lên (lỗi ${response.status}).`;
            throw new Error(result.error || fallback);
          }
          uploaded.push(result.image);
        } catch (error) {
          failed += 1;
          if (!firstUploadError) firstUploadError = error instanceof Error ? error.message : "Không thể tải ảnh lên.";
        }
      }
      if (!uploaded.length) throw new Error(firstUploadError || "Không tải lên được ảnh nào. Hãy thử lại sau.");
      const saved = await persist([...imagesRef.current, ...uploaded]);
      if (saved) setMessage(`Đã thêm ${uploaded.length} ảnh.${invalidCount ? ` Bỏ qua ${invalidCount} tệp không hợp lệ.` : ""}${failed ? ` ${failed} ảnh không tải lên được: ${firstUploadError}` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải ảnh lên.");
      setBusy(false);
    }
  };

  const saveFinalUrl = async () => {
    if (busy || finalUrlBusy) return;
    setFinalUrlBusy(true);
    setMessage("");
    try {
      const saved = await updateTask(taskId, { briefFinalUrl: finalUrl.trim() || null });
      setFinalUrl(saved.briefFinalUrl ?? "");
      setSavedFinalUrl(saved.briefFinalUrl ?? "");
      setMessage("Đã lưu URL ảnh final.");
      window.setTimeout(() => setMessage(""), 1800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu URL ảnh final.");
    } finally { setFinalUrlBusy(false); }
  };

  const changeImage = (id: string, patch: Partial<Pick<BriefImage, "title" | "content">>) => {
    const next = imagesRef.current.map((image) => image.id === id ? { ...image, ...patch } : image);
    imagesRef.current = next;
    setImages(next);
  };
  const removeImage = (id: string) => { void persist(imagesRef.current.filter((image) => image.id !== id)); };
  const showImage = useCallback((direction: number) => setViewerIndex((current) => current === null ? null : (current + direction + imagesRef.current.length) % imagesRef.current.length), []);
  const hasFiles = (event: DragEvent<HTMLElement>) => event.dataTransfer.types.includes("Files");
  const handleDragEnter = (event: DragEvent<HTMLElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setDragActive(true);
  };
  const handleDragLeave = (event: DragEvent<HTMLElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (!dragDepthRef.current) setDragActive(false);
  };

  useEffect(() => {
    if (viewerIndex === null) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerIndex(null);
      if (event.key === "ArrowRight") showImage(1);
      if (event.key === "ArrowLeft") showImage(-1);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [viewerIndex, showImage]);

  return <>
    <button type="button" className="brief-gallery-trigger" aria-expanded={open} aria-label={`Mở thư viện ảnh${images.length ? `, ${images.length} ảnh` : ""}`} onClick={() => setOpen((value) => !value)} title="Mở thư viện ảnh của brief"><Icon name="image" size={16}/><span>Ảnh</span>{images.length > 0 && <span className="brief-gallery-count-badge">{images.length > 99 ? "99+" : images.length}</span>}</button>
    {open && <>
      <button className="brief-gallery-dismiss" aria-label="Đóng thư viện ảnh" onClick={() => setOpen(false)}/>
      <section className={`brief-gallery-popup${dragActive ? " is-dragging" : ""}`} role="dialog" aria-modal="false" aria-label="Ảnh trong brief" onDragEnter={handleDragEnter} onDragOver={(event) => { if (hasFiles(event)) event.preventDefault(); }} onDragLeave={handleDragLeave} onDrop={(event) => { if (!hasFiles(event)) return; event.preventDefault(); dragDepthRef.current = 0; setDragActive(false); void uploadFiles(Array.from(event.dataTransfer.files)); }}>
        <header className="brief-gallery-header"><div><strong>Ảnh trong brief</strong><small>{images.length} ảnh · Tự động lưu</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Đóng">×</button></header>
        <div className="brief-gallery-content">
          <button type="button" className="brief-gallery-dropzone" disabled={busy || images.length >= 1000} onClick={() => inputRef.current?.click()}><span aria-hidden="true">⇧</span><strong>{dragActive ? "Thả ảnh vào đây" : "Kéo ảnh hoặc nhóm ảnh từ máy vào đây"}</strong><small>hoặc bấm để chọn nhiều tệp · tối đa 8 MB/ảnh</small></button>
          {!images.length && <div className="brief-gallery-empty"><span><Icon name="image" size={28}/></span><strong>Chưa có ảnh</strong><p>Tải hình ảnh lên để sắp xếp nội dung brief.</p></div>}
          <details className="brief-gallery-drive-import"><summary>URL ảnh final (tuỳ chọn)</summary><label>Link Drive ảnh final<input type="url" value={finalUrl} maxLength={2048} onChange={(event) => setFinalUrl(event.target.value)} placeholder="https://drive.google.com/file/d/.../view"/><button type="button" disabled={busy || finalUrlBusy || finalUrl.trim() === savedFinalUrl} onClick={() => void saveFinalUrl()}>{finalUrlBusy ? "Đang lưu…" : "Lưu URL ảnh final"}</button></label><small>Link đã lưu sẽ xuất hiện cạnh tên brief; ảnh tải lên được lưu trực tiếp trong brief.</small></details>
          {images.map((image, index) => <article className="brief-gallery-card" key={image.id}>
            <button type="button" className="brief-gallery-image" onClick={() => setViewerIndex(index)} aria-label={`Xem ảnh ${image.title || index + 1} trong gallery`}><BriefImageAsset src={imageSource(image)} alt={image.title || "Ảnh brief"}/><span>Mở gallery ↗</span></button>
            <label>Tiêu đề<input value={image.title} maxLength={200} onChange={(event) => changeImage(image.id, { title: event.target.value })} onBlur={() => void persist(imagesRef.current)} placeholder="Nhập tiêu đề ảnh"/></label>
            <label>Nội dung<textarea value={image.content} maxLength={2000} rows={3} onChange={(event) => changeImage(image.id, { content: event.target.value })} onBlur={() => void persist(imagesRef.current)} placeholder="Mô tả hoặc nội dung đi kèm ảnh"/></label>
            <button type="button" className="brief-gallery-remove" disabled={busy} onClick={() => removeImage(image.id)}>Gỡ khỏi brief</button>
          </article>)}
        </div>
        <footer className="brief-gallery-footer"><input ref={inputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp" hidden onChange={(event) => { void uploadFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }}/><button type="button" className="brief-gallery-upload" disabled={busy || finalUrlBusy || images.length >= 1000} onClick={() => inputRef.current?.click()}>{busy ? "Đang tải/lưu…" : "＋ Tải ảnh lên"}</button><span role="status">{message}</span></footer>
      </section>
    </>}
    {viewerIndex !== null && images[viewerIndex] && <div className="brief-gallery-viewer" role="dialog" aria-modal="true" aria-label="Xem ảnh toàn màn hình" onClick={() => setViewerIndex(null)}><button type="button" className="brief-gallery-viewer-close" aria-label="Đóng gallery" onClick={() => setViewerIndex(null)}>×</button><button type="button" className="brief-gallery-prev" aria-label="Ảnh trước" onClick={(event) => { event.stopPropagation(); showImage(-1); }}>‹</button><figure onClick={(event) => event.stopPropagation()}><BriefImageAsset src={imageSource(images[viewerIndex])} alt={images[viewerIndex].title || "Ảnh brief"} mode="viewer"/><figcaption><strong>{images[viewerIndex].title || "Ảnh brief"}</strong>{images[viewerIndex].content && <p>{images[viewerIndex].content}</p>}<small>{viewerIndex + 1} / {images.length}</small></figcaption></figure><button type="button" className="brief-gallery-next" aria-label="Ảnh tiếp theo" onClick={(event) => { event.stopPropagation(); showImage(1); }}>›</button></div>}
  </>;
}
