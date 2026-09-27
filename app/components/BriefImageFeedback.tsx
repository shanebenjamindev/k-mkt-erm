"use client";

import { useRef, useState, type PointerEvent } from "react";
import type { BriefImage, ImageFeedback } from "../../lib/types";
import { BriefImageAsset } from "./BriefImageAsset";

type Box = Pick<ImageFeedback, "x" | "y" | "width" | "height">;
export function BriefImageFeedback({ image, src, onSave }: { image: BriefImage; src: string; onSave: (feedback: ImageFeedback[]) => Promise<boolean> }) {
  const [box, setBox] = useState<Box | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const feedback = image.feedback ?? [];
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const save = async (next: ImageFeedback[]) => {
    setBusy(true);
    try { if (await onSave(next)) { setBox(null); setText(""); } }
    finally { setBusy(false); }
  };
  return <div className="image-feedback">
    <div className="image-feedback-stage is-drawing" onPointerDown={event => {
      if (busy || box || event.button !== 0 || !(event.currentTarget.querySelector("img"))) return;
      setActiveId(null);
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      origin.current = point(event); setBox({ ...origin.current, width: 0, height: 0 });
    }} onPointerMove={event => {
      if (!origin.current) return;
      const end = point(event), start = origin.current;
      setBox({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) });
    }} onPointerUp={() => { origin.current = null; setBox(current => current && current.width >= .01 && current.height >= .01 ? { ...current } : null); }} onPointerCancel={() => { origin.current = null; setBox(null); }}>
      <BriefImageAsset src={src} alt={image.label || image.title || "Ảnh brief"} mode="viewer"/>
      {feedback.map((item, index) => <button type="button" key={item.id} className="image-feedback-box saved-feedback-box" aria-label={`Xem feedback ${index + 1}`} onPointerDown={event => event.stopPropagation()} onClick={() => { if (!busy) { setBox(null); setText(""); setActiveId(item.id); } }} title={item.text} style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%` }}><b>{index + 1}</b></button>)}
      {box && <span className="image-feedback-box is-draft" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}/>} 
    </div>
    <div className="brief-gallery-side-rail" onClick={event => event.stopPropagation()}>
    {(box && !origin.current || activeId && feedback.some(item => item.id === activeId)) && <aside className="image-feedback-sidebar" aria-label="Feedback ảnh" onClick={event => event.stopPropagation()}>
      <header><strong>Feedback</strong><button type="button" aria-label="Đóng feedback" disabled={busy} onClick={() => { setBox(null); setText(""); setActiveId(null); }}>×</button></header>
      <p className="image-feedback-hint">Kéo trực tiếp trên ảnh để khoanh vùng cần góp ý.</p>
      {box && !origin.current && <form onSubmit={event => { event.preventDefault(); if (text.trim() && feedback.length < 100) { const id = crypto.randomUUID(); setActiveId(id); void save([...feedback, { ...box, id, text: text.trim() }]); } }}>
        <label>Feedback #{feedback.length + 1}<textarea autoFocus aria-label="Nội dung feedback" placeholder="Nhập góp ý cho vùng đã chọn…" maxLength={2000} value={text} onChange={event => setText(event.target.value)}/></label>
        <div><button type="button" disabled={busy} onClick={() => { setBox(null); setText(""); }}>Huỷ</button><button disabled={busy || !text.trim() || feedback.length >= 100}>{busy ? "Đang lưu…" : "Gửi feedback"}</button></div>
      </form>}
      {!!feedback.length ? <ol className="image-feedback-list">{feedback.map((item, index) => item.id === activeId ? <li key={item.id}><strong>#{index + 1}</strong><p>{item.text}</p><button type="button" disabled={busy} aria-label={`Xoá feedback: ${item.text}`} onClick={() => void save(feedback.filter(entry => entry.id !== item.id))}>Xoá</button></li> : null)}</ol> : null}
    </aside>}
    </div>
  </div>;
}
