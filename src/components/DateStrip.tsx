import { useEffect, useRef } from "react";
import { isSameDay, isToday } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { fmt } from "../lib/format";
import { cx } from "./ui";

/** Datas em uma única linha horizontal; arraste para o lado para ver os próximos dias. */
export function DateStrip({ days, value, onChange, isDisabled }: { days: Date[]; value: Date | null; onChange: (d: Date) => void; isDisabled?: (d: Date) => boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  // mantém o dia selecionado visível
  useEffect(() => {
    if (!value || !ref.current) return;
    const el = ref.current.querySelector<HTMLElement>(`[data-day="${fmt(value, "yyyy-MM-dd")}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [value]);

  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold capitalize">{fmt(value ?? days[0] ?? new Date(), "MMMM 'de' yyyy")}</p>
        <div className="hidden gap-1 sm:flex">
          <button onClick={() => scroll(-1)} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Dias anteriores">
            <ChevronLeft className="size-4" />
          </button>
          <button onClick={() => scroll(1)} className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Próximos dias">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div ref={ref} className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto scroll-px-4 px-4 pb-1">
        {days.map((d, i) => {
          const disabled = isDisabled?.(d);
          const selected = value && isSameDay(d, value);
          const newMonth = i > 0 && d.getDate() === 1;
          return (
            <div key={d.toISOString()} className="flex shrink-0 snap-start items-end gap-2">
              {newMonth && <span className="self-center text-[10px] font-semibold tracking-wider text-gold uppercase [writing-mode:vertical-rl] rotate-180">{fmt(d, "MMM")}</span>}
              <button
                data-day={fmt(d, "yyyy-MM-dd")}
                disabled={disabled}
                onClick={() => onChange(d)}
                className={cx(
                  "flex w-15 flex-col items-center rounded-2xl border py-2.5 transition",
                  selected ? "border-gold bg-gold text-black" : "border-line bg-surface hover:border-gold/50",
                  disabled && "border-transparent bg-surface/40 text-muted/40",
                )}
              >
                <span className={cx("text-[11px] font-semibold uppercase", selected ? "text-black/70" : "text-muted", disabled && "text-muted/40")}>{isToday(d) ? "Hoje" : fmt(d, "EEE").replace(".", "")}</span>
                <span className="text-xl leading-tight font-bold">{fmt(d, "dd")}</span>
                <span className={cx("text-[10px]", selected ? "text-black/70" : "text-muted", disabled && "text-muted/40")}>{disabled ? "Fechado" : fmt(d, "MMM").replace(".", "")}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
