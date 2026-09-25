"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  startDate: string | null;
  endDate: string | null;
  onChange: (startDate: string, endDate: string) => void;
  onComplete?: (startDate: string, endDate: string) => void;
  label?: string;
  openOnMount?: boolean;
};

const weekdays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function DateRangePicker({ startDate, endDate, onChange, onComplete, label = "Từ ngày – đến ngày", openOnMount = false }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(openOnMount);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [month, setMonth] = useState(() => monthStart(startDate ?? endDate ?? toIso(new Date())));

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => { if (openOnMount) setOpen(true); }, [openOnMount]);

  const days = useMemo(() => calendarDays(month), [month]);
  const rangeEnd = selectingEnd ? hoveredDate ?? endDate : endDate;
  const chooseDate = (date: string) => {
    if (!selectingEnd) {
      onChange(date, date);
      setSelectingEnd(true);
      setHoveredDate(date);
      return;
    }
    const start = startDate && date >= startDate ? startDate : date;
    const end = startDate && date >= startDate ? date : startDate ?? date;
    onChange(start, end);
    onComplete?.(start, end);
    setSelectingEnd(false);
    setHoveredDate(null);
    setOpen(false);
  };
  const showPicker = () => {
    setMonth(monthStart(startDate ?? endDate ?? toIso(new Date())));
    setSelectingEnd(false);
    setHoveredDate(null);
    setOpen(true);
  };

  return <div className="date-range-picker" ref={root}>
    <button type="button" className="date-range-trigger" aria-expanded={open} onClick={() => open ? setOpen(false) : showPicker()}>
      <span className="date-range-calendar" aria-hidden="true">□</span><span>{formatRange(startDate, endDate)}</span><span className="date-range-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div className="date-range-popover" role="dialog" aria-label={label}>
      <div className="date-range-popover-head"><div><b>{formatMonth(month)}</b><small>{selectingEnd ? "Chọn ngày kết thúc" : "Chọn ngày bắt đầu"}</small></div><div><button type="button" aria-label="Tháng trước" onClick={() => setMonth((current) => shiftMonth(current, -1))}>‹</button><button type="button" aria-label="Tháng sau" onClick={() => setMonth((current) => shiftMonth(current, 1))}>›</button></div></div>
      <div className="date-range-weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="date-range-days">{days.map((date) => {
        const inCurrentMonth = date.slice(0, 7) === month.slice(0, 7);
        const inRange = Boolean(startDate && rangeEnd && startDate <= date && date <= rangeEnd);
        const isStart = date === startDate;
        const isEnd = date === rangeEnd;
        return <button type="button" key={date} onClick={() => chooseDate(date)} onMouseEnter={() => selectingEnd && setHoveredDate(date)} className={`${inCurrentMonth ? "" : "outside"} ${inRange ? "in-range" : ""} ${isStart ? "range-start" : ""} ${isEnd ? "range-end" : ""}`.trim()}><span>{date.slice(8, 10)}</span></button>;
      })}</div>
      <div className="date-range-footer"><button type="button" onClick={() => { const today = toIso(new Date()); onChange(today, today); setMonth(monthStart(today)); setSelectingEnd(true); }}>Hôm nay</button><button type="button" onClick={() => { if (startDate && endDate) onComplete?.(startDate, endDate); setSelectingEnd(false); setHoveredDate(null); setOpen(false); }}>Xong</button></div>
    </div>}
  </div>;
}

function toIso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function monthStart(date: string) { return `${date.slice(0, 7)}-01`; }
function shiftMonth(month: string, amount: number) { const value = new Date(`${month}T00:00:00`); value.setMonth(value.getMonth() + amount); return monthStart(toIso(value)); }
function formatMonth(month: string) { return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`)); }
function formatDate(date: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)); }
function formatRange(startDate: string | null, endDate: string | null) { if (!startDate || !endDate) return "Chọn khoảng ngày"; return startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} – ${formatDate(endDate)}`; }
function calendarDays(month: string) {
  const first = new Date(`${month}T00:00:00`);
  const offset = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(first); date.setDate(first.getDate() + index); return toIso(date); });
}
