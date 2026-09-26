"use client";

const formats = ["Chưa xác định", "Hình ảnh", "Carousel", "Video", "Video ngắn (Reels / TikTok / Shorts)", "Story", "Infographic", "Banner / Poster", "Caption", "Bài viết", "Email marketing", "Landing page", "Bộ thiết kế", "Khác"];

type Props = { value: string; onChange: (value: string) => void; disabled?: boolean; className?: string; ariaLabel?: string };

export function TaskFormatSelect({ value, onChange, disabled, className, ariaLabel = "Định dạng / bàn giao" }: Props) {
  const hasLegacyValue = Boolean(value && !formats.includes(value));
  return <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={className} aria-label={ariaLabel}>
    <option value="">Chọn định dạng</option>
    {hasLegacyValue && <option value={value}>{value}</option>}
    {formats.map((format) => <option key={format} value={format}>{format}</option>)}
  </select>;
}
