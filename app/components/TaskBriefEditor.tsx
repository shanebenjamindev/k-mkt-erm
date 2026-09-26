"use client";

import { useEffect, useRef, useState } from "react";
import { briefToHtml, sanitizeBriefHtml } from "../../lib/brief-html";
import { requestJson } from "../../lib/client-request";

type Props = { value: string; docUrl?: string | null; onChange: (brief: string, docUrl: string | null) => void; disabled?: boolean; toolbarVariant?: "standard" | "docs"; fontSize?: number };
type Tool = { command: string; label: string; title: string; value?: string };
const tools: Tool[] = [
  { command: "bold", label: "B", title: "Đậm" }, { command: "italic", label: "I", title: "Nghiêng" }, { command: "underline", label: "U", title: "Gạch chân" },
  { command: "formatBlock", label: "H", title: "Tiêu đề", value: "h2" }, { command: "insertUnorderedList", label: "•", title: "Danh sách" },
  { command: "insertOrderedList", label: "1.", title: "Danh sách đánh số" }, { command: "formatBlock", label: "❝", title: "Trích dẫn", value: "blockquote" }
];

export function TaskBriefEditor({ value, docUrl, onChange, disabled = false, toolbarVariant = "standard", fontSize = 11 }: Props) {
  const editor = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const [url, setUrl] = useState(docUrl ?? "");
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setUrl(docUrl ?? ""); }, [docUrl]);
  useEffect(() => {
    if (!editor.current || focused.current) return;
    const html = briefToHtml(value);
    if (editor.current.innerHTML !== html) editor.current.innerHTML = html;
  }, [value]);

  const commit = () => onChange(sanitizeBriefHtml(editor.current?.innerHTML ?? ""), url.trim() || null);
  const exec = (command: string, commandValue?: string) => {
    if (!editor.current || disabled) return;
    editor.current.focus();
    document.execCommand(command, false, commandValue);
    commit();
  };
  const runTool = (tool: Tool) => exec(tool.command, tool.command === "formatBlock" ? `<${tool.value}>` : undefined);
  const promptLink = () => {
    const href = window.prompt("Dán liên kết https:// hoặc mailto:");
    if (href && /^(https?:\/\/|mailto:)/i.test(href.trim())) exec("createLink", href.trim());
  };
  const importDoc = async () => {
    if (!url.trim() || importing) return;
    setImporting(true); setError(""); setMessage("");
    try {
      const result = await requestJson<{ brief: string; url: string }>("/api/briefs/import", { method: "POST", body: JSON.stringify({ url: url.trim() }) });
      focused.current = false;
      setUrl(result.url);
      onChange(result.brief, result.url);
      setMessage("Đã nhập nội dung từ Google Docs / Drive vào brief.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể tải nội dung tài liệu."); }
    finally { setImporting(false); }
  };

  return <div className="task-brief-editor field full">
    <div className="brief-editor-controls">
      <div className={`brief-editor-toolbar ${toolbarVariant === "docs" ? "brief-editor-toolbar-docs" : ""}`} role="toolbar" aria-label="Định dạng brief">
        {toolbarVariant === "standard" ? <>{tools.map((tool) => <button type="button" key={tool.title} title={tool.title} aria-label={tool.title} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => runTool(tool)}>{tool.label}</button>)}<button type="button" title="Chèn liên kết" aria-label="Chèn liên kết" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={promptLink}>↗</button></> : <>
          <span className="brief-toolbar-group" aria-label="Hoàn tác và làm lại"><button type="button" title="Hoàn tác" aria-label="Hoàn tác" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("undo")}>↶</button><button type="button" title="Làm lại" aria-label="Làm lại" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("redo")}>↷</button></span>
          <span className="brief-toolbar-group" aria-label="Định dạng chữ">{tools.slice(0, 3).map((tool) => <button type="button" key={tool.title} title={tool.title} aria-label={tool.title} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => runTool(tool)}>{tool.label}</button>)}<button type="button" title="Gạch ngang" aria-label="Gạch ngang" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("strikeThrough")}>S̶</button><button type="button" title="Màu chữ" aria-label="Màu chữ" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => { const color = window.prompt("Mã màu chữ, ví dụ #7A1F1F", "#202124"); if (color && /^#[0-9a-f]{6}$/i.test(color)) exec("foreColor", color); }}>A</button><button type="button" title="Tô sáng" aria-label="Tô sáng" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("hiliteColor", "#fff475")}>▰</button><button type="button" title="Xoá định dạng" aria-label="Xoá định dạng" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("removeFormat")}>Tx</button></span>
          <span className="brief-toolbar-group" aria-label="Đoạn văn và danh sách"><button type="button" title="Tiêu đề 2" aria-label="Tiêu đề 2" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("formatBlock", "<h2>")}>H</button><button type="button" title="Trích dẫn" aria-label="Trích dẫn" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("formatBlock", "<blockquote>")}>❝</button><button type="button" title="Căn trái" aria-label="Căn trái" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("justifyLeft")}>☰</button><button type="button" title="Căn giữa" aria-label="Căn giữa" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("justifyCenter")}>≡</button><button type="button" title="Căn phải" aria-label="Căn phải" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("justifyRight")}>☷</button><button type="button" title="Danh sách dấu đầu dòng" aria-label="Danh sách dấu đầu dòng" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("insertUnorderedList")}>•</button><button type="button" title="Danh sách đánh số" aria-label="Danh sách đánh số" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => exec("insertOrderedList")}>1.</button></span>
          <span className="brief-toolbar-group" aria-label="Chèn nội dung"><button type="button" title="Chèn liên kết" aria-label="Chèn liên kết" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={promptLink}>↗</button></span>
        </>}
      </div>
      <details className="brief-doc-panel"><summary><span>Nhập nội dung từ Google Docs / Drive</span><small>{docUrl ? "Đã liên kết tài liệu" : "Tuỳ chọn"}</small></summary><div className="brief-doc-import"><input id="task-brief-doc-link" type="url" value={url} disabled={disabled || importing} onChange={(event) => { setUrl(event.target.value); onChange(value, event.target.value || null); }} placeholder="Dán link Google Docs hoặc ảnh Drive"/><button type="button" className="secondary" disabled={disabled || importing || !url.trim()} onClick={() => void importDoc()}>{importing ? "Đang tải…" : "Nhập nội dung"}</button></div></details>
      {message && <p className="brief-import-message" role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <div ref={editor} className="brief-editor-content" style={{ fontSize: toolbarVariant === "docs" ? `${fontSize}pt` : undefined }} contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Nội dung brief" data-placeholder="Viết nội dung brief…" onFocus={() => { focused.current = true; }} onInput={commit} onBlur={() => { focused.current = false; commit(); }}/>
    {docUrl && <a className="brief-source-link" href={docUrl} target="_blank" rel="noreferrer noopener">Mở tài liệu gốc ↗</a>}
  </div>;
}
