import { useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmt } from "../lib/format";
import { cx } from "./ui";

/** Calendário mensal. `isDisabled` bloqueia dias; `marks` mostra um ponto (ex.: dias com agendamentos). */
export function Calendar({
  value,
  onChange,
  isDisabled,
  marks,
  minMonth,
  maxMonth,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
  isDisabled?: (d: Date) => boolean;
  marks?: Record<string, number>;
  minMonth?: Date;
  maxMonth?: Date;
}) {
  const [month, setMonth] = useState(() => startOfMonth(value ?? new Date()));
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) });
  const canPrev = !minMonth || month > startOfMonth(minMonth);
  const canNext = !maxMonth || month < startOfMonth(maxMonth);

  return (
    <div className="select-none">
      <div className="mb-3 flex items-center justify-between">
        <button disabled={!canPrev} onClick={() => setMonth(addMonths(month, -1))} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label="Mês anterior">
          <ChevronLeft className="size-5" />
        </button>
        <span className="font-semibold capitalize">{fmt(month, "MMMM yyyy")}</span>
        <button disabled={!canNext} onClick={() => setMonth(addMonths(month, 1))} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-30" aria-label="Próximo mês">
          <ChevronRight className="size-5" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-muted">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => (
          <span key={i} className="py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const out = !isSameMonth(d, month);
          const disabled = out || isDisabled?.(d);
          const selected = value && isSameDay(d, value);
          const mark = marks?.[fmt(d, "yyyy-MM-dd")];
          return (
            <button
              key={d.toISOString()}
              disabled={!!disabled}
              onClick={() => onChange(d)}
              className={cx(
                "relative aspect-square rounded-xl text-sm font-medium transition",
                out && "invisible",
                selected ? "bg-gold text-black" : "hover:bg-surface-2",
                !selected && isToday(d) && "ring-1 ring-gold/60",
                disabled && !out && "text-muted/40 line-through decoration-muted/30 hover:bg-transparent",
              )}
            >
              {fmt(d, "d")}
              {!!mark && <span className={cx("absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full", selected ? "bg-black" : "bg-gold")} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
