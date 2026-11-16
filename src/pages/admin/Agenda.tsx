import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, differenceInMinutes, endOfDay, endOfMonth, isToday, startOfDay, startOfMonth } from "date-fns";
import { Ban, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, List, Rows3, Trash2 } from "lucide-react";
import { supabase, errMsg } from "../../lib/supabase";
import { fmt, isoDay, money } from "../../lib/format";
import { at } from "../../lib/slots";
import { useShop } from "../../lib/useShop";
import type { Appointment, TimeOff } from "../../lib/types";
import { Calendar } from "../../components/Calendar";
import { PayBadge, StatusBadge } from "../../components/StatusBadges";
import { Button, Card, cx, Empty, Modal, PageLoader, useToast } from "../../components/ui";
import { APPT_SELECT, ApptModal, BlockModal, clientName, NewApptModal } from "./shared";

const PX_PER_MIN = 1.3;

const blockColor = (a: Appointment) => {
  if (a.status === "cancelled") return "border-line bg-surface-2/60 text-muted line-through";
  if (a.status === "no_show") return "border-line bg-surface-2 text-muted";
  if (a.payment_status === "paid") return "border-ok/50 bg-ok/12";
  if (a.status === "completed") return "border-warn/50 bg-warn/12";
  return "border-gold/50 bg-gold/12";
};

export default function Agenda() {
  const { services, professionals, hours, loading } = useShop();
  const toast = useToast();
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [appts, setAppts] = useState<Appointment[] | null>(null);
  const [offs, setOffs] = useState<TimeOff[]>([]);
  const [view, setView] = useState<"grid" | "list">(() => (window.innerWidth < 640 ? "list" : "grid"));
  const [showCancelled, setShowCancelled] = useState(false);
  const [open, setOpen] = useState<Appointment | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [marks, setMarks] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const from = startOfDay(day).toISOString();
    const to = endOfDay(day).toISOString();
    const [a, t] = await Promise.all([
      supabase.from("appointments").select(APPT_SELECT).gte("starts_at", from).lte("starts_at", to).order("starts_at"),
      supabase.from("time_off").select("*").lt("starts_at", to).gt("ends_at", from),
    ]);
    setAppts((a.data ?? []) as Appointment[]);
    setOffs((t.data ?? []) as TimeOff[]);
  }, [day]);

  useEffect(() => {
    load();
  }, [load]);

  // pontos no calendário mensal
  useEffect(() => {
    if (!calOpen) return;
    supabase
      .from("appointments")
      .select("starts_at")
      .neq("status", "cancelled")
      .gte("starts_at", startOfMonth(addDays(day, -40)).toISOString())
      .lte("starts_at", endOfMonth(addDays(day, 40)).toISOString())
      .then(({ data }) => {
        const m: Record<string, number> = {};
        (data ?? []).forEach((r) => {
          const k = isoDay(new Date(r.starts_at));
          m[k] = (m[k] ?? 0) + 1;
        });
        setMarks(m);
      });
  }, [calOpen, day]);

  const visible = useMemo(() => (appts ?? []).filter((a) => showCancelled || a.status !== "cancelled"), [appts, showCancelled]);

  // janela da grade: expediente do dia (ou 08–20), ampliada para caber todos os agendamentos
  const { gridStart, gridEnd } = useMemo(() => {
    const h = hours.find((x) => x.weekday === day.getDay());
    let s = at(day, h?.is_open ? h.open_time : "08:00");
    let e = at(day, h?.is_open ? h.close_time : "20:00");
    for (const a of visible) {
      if (new Date(a.starts_at) < s) s = new Date(a.starts_at);
      if (new Date(a.ends_at) > e) e = new Date(a.ends_at);
    }
    s.setMinutes(0);
    return { gridStart: s, gridEnd: e };
  }, [hours, day, visible]);

  if (loading || !appts) return <PageLoader />;

  const totalMin = differenceInMinutes(gridEnd, gridStart);
  const hourMarks = Array.from({ length: Math.ceil(totalMin / 60) + 1 }, (_, i) => new Date(gridStart.getTime() + i * 3600_000));
  const dayTotal = visible.filter((a) => a.status !== "cancelled").reduce((s, a) => s + Number(a.price), 0);
  const closed = !hours.find((x) => x.weekday === day.getDay())?.is_open;

  async function removeOff(id: string) {
    if (!confirm("Remover este bloqueio?")) return;
    const { error } = await supabase.from("time_off").delete().eq("id", id);
    if (error) return toast.error(errMsg(error));
    load();
  }

  const top = (d: string | Date) => Math.max(0, differenceInMinutes(new Date(d), gridStart)) * PX_PER_MIN;
  const height = (s: string, e: string) => Math.max(22, differenceInMinutes(new Date(e), new Date(s)) * PX_PER_MIN - 2);

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setDay(addDays(day, -1))} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Dia anterior">
            <ChevronLeft className="size-5" />
          </button>
          <button onClick={() => setCalOpen(true)} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-surface-2">
            <CalendarDays className="size-5 text-gold" />
            <span className="text-left">
              <span className="block text-lg leading-tight font-bold capitalize">{isToday(day) ? "Hoje" : fmt(day, "EEEE")}</span>
              <span className="block text-xs text-muted">{fmt(day, "dd 'de' MMMM yyyy")}</span>
            </span>
          </button>
          <button onClick={() => setDay(addDays(day, 1))} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Próximo dia">
            <ChevronRight className="size-5" />
          </button>
          {!isToday(day) && (
            <Button size="sm" variant="ghost" onClick={() => setDay(startOfDay(new Date()))}>
              Hoje
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-xl border border-line p-0.5">
            <button onClick={() => setView("grid")} className={cx("rounded-lg p-2", view === "grid" ? "bg-surface-2 text-ink" : "text-muted")} aria-label="Grade">
              <Rows3 className="size-4" />
            </button>
            <button onClick={() => setView("list")} className={cx("rounded-lg p-2", view === "list" ? "bg-surface-2 text-ink" : "text-muted")} aria-label="Lista">
              <List className="size-4" />
            </button>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setBlockOpen(true)}>
            <Ban className="size-4" /> Bloquear
          </Button>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <CalendarPlus className="size-4" /> Agendar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span>
          <b className="text-ink">{visible.filter((a) => a.status !== "cancelled").length}</b> agendamentos · <b className="text-ok">{money(dayTotal)}</b> previstos
        </span>
        {closed && <span className="text-warn">Barbearia fechada neste dia</span>}
        <span className="flex items-center gap-1.5">
          <i className="size-2.5 rounded-sm bg-gold/60" /> A pagar
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2.5 rounded-sm bg-warn/60" /> Concluído sem baixa
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2.5 rounded-sm bg-ok/60" /> Pago
        </span>
        <label className="ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="accent-[var(--color-gold)]" /> Mostrar cancelados
        </label>
      </div>

      {offs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {offs.map((o) => (
            <span key={o.id} className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs">
              <Ban className="size-3.5 text-bad" />
              {o.professional_id ? professionals.find((p) => p.id === o.professional_id)?.name : "Todos"} · {fmt(o.starts_at, "HH:mm")}–{fmt(o.ends_at, "HH:mm")}
              {o.reason && ` · ${o.reason}`}
              <button onClick={() => removeOff(o.id)} className="text-muted hover:text-bad" aria-label="Remover bloqueio">
                <Trash2 className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Lista */}
      {view === "list" &&
        (visible.length === 0 ? (
          <Empty title="Nenhum agendamento neste dia" />
        ) : (
          <div className="space-y-2">
            {visible.map((a) => (
              <Card key={a.id} onClick={() => setOpen(a)} className={cx("flex items-center gap-3 border-l-4 py-3", blockColor(a))}>
                <div className="w-12 shrink-0">
                  <p className="font-bold tabular-nums">{fmt(a.starts_at, "HH:mm")}</p>
                  <p className="text-[11px] text-muted">{fmt(a.ends_at, "HH:mm")}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{clientName(a)}</p>
                  <p className="truncate text-xs text-muted">
                    {a.service_name} · {a.professional?.name}
                  </p>
                  <div className="mt-1 flex gap-1">
                    <StatusBadge s={a.status} />
                    <PayBadge s={a.payment_status} />
                  </div>
                </div>
                <span className="text-sm font-semibold">{money(a.price)}</span>
              </Card>
            ))}
          </div>
        ))}

      {/* Grade por profissional */}
      {view === "grid" && (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <div className="flex min-w-fit">
            <div className="sticky left-0 z-10 w-14 shrink-0 border-r border-line bg-surface">
              <div className="h-11 border-b border-line" />
              <div className="relative" style={{ height: totalMin * PX_PER_MIN }}>
                {hourMarks.map((h) => (
                  <span key={h.getTime()} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted tabular-nums" style={{ top: top(h) }}>
                    {fmt(h, "HH:mm")}
                  </span>
                ))}
              </div>
            </div>
            {professionals.map((p) => (
              <div key={p.id} className="w-48 shrink-0 border-r border-line last:border-r-0 sm:flex-1">
                <div className="flex h-11 items-center justify-center border-b border-line px-2 text-sm font-semibold">
                  <span className="truncate">{p.name}</span>
                </div>
                <div className="relative" style={{ height: totalMin * PX_PER_MIN }}>
                  {hourMarks.map((h) => (
                    <div key={h.getTime()} className="absolute inset-x-0 border-t border-line/60" style={{ top: top(h) }} />
                  ))}
                  {offs
                    .filter((o) => !o.professional_id || o.professional_id === p.id)
                    .map((o) => (
                      <div
                        key={o.id}
                        className="absolute inset-x-1 rounded-lg border border-bad/30 bg-[repeating-linear-gradient(135deg,rgba(248,113,113,.12)_0_6px,transparent_6px_12px)] px-2 py-1 text-[11px] text-bad"
                        style={{ top: top(o.starts_at), height: height(new Date(Math.max(new Date(o.starts_at).getTime(), gridStart.getTime())).toISOString(), new Date(Math.min(new Date(o.ends_at).getTime(), gridEnd.getTime())).toISOString()) }}
                      >
                        {o.reason || "Bloqueado"}
                      </div>
                    ))}
                  {visible
                    .filter((a) => a.professional_id === p.id)
                    .map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setOpen(a)}
                        className={cx("absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1 text-left text-xs transition hover:brightness-125", blockColor(a))}
                        style={{ top: top(a.starts_at) + 1, height: height(a.starts_at, a.ends_at) }}
                      >
                        <p className="truncate font-semibold">
                          {fmt(a.starts_at, "HH:mm")} {clientName(a)}
                        </p>
                        <p className="truncate text-muted">{a.service_name}</p>
                      </button>
                    ))}
                  {isToday(day) && new Date() > gridStart && new Date() < gridEnd && <div className="absolute inset-x-0 z-[5] h-0.5 bg-bad" style={{ top: top(new Date()) }} />}
                </div>
              </div>
            ))}
            {professionals.length === 0 && <p className="p-6 text-sm text-muted">Cadastre profissionais em “Equipe”.</p>}
          </div>
        </div>
      )}

      <Modal open={calOpen} onClose={() => setCalOpen(false)} title="Escolher data">
        <Calendar
          value={day}
          marks={marks}
          onChange={(d) => {
            setDay(startOfDay(d));
            setCalOpen(false);
          }}
        />
      </Modal>

      <ApptModal appt={open} onClose={() => setOpen(null)} onChanged={load} />
      <NewApptModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={load} services={services} professionals={professionals} defaultDay={day} />
      <BlockModal open={blockOpen} onClose={() => setBlockOpen(false)} onSaved={load} professionals={professionals} defaultDay={day} />
    </div>
  );
}
