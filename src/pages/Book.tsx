import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { addDays, eachDayOfInterval, endOfDay, isBefore, startOfDay } from "date-fns";
import { ArrowLeft, CalendarCheck2, Check, Clock, Store, Smartphone, Users } from "lucide-react";
import { supabase, errMsg } from "../lib/supabase";
import { useShop } from "../lib/useShop";
import { buildSlots } from "../lib/slots";
import { duration, fmt, initials, money } from "../lib/format";
import type { Appointment } from "../lib/types";
import { DateStrip } from "../components/DateStrip";
import { PaymentSheet } from "../components/PaymentSheet";
import { Button, Card, cx, Empty, PageLoader, Spinner, Textarea, useToast } from "../components/ui";

const ANY = "any";
type Busy = { starts_at: string; ends_at: string };

export default function Book() {
  const { settings, hours, services, professionals, loading } = useShop();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [step, setStep] = useState(1);
  const [serviceId, setServiceId] = useState<string | null>(params.get("servico"));
  const [proId, setProId] = useState<string | null>(params.get("profissional"));
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  const [payNow, setPayNow] = useState(true);
  const [busy, setBusy] = useState<Record<string, Busy[]> | null>(null);
  const [saving, setSaving] = useState(false);
  const [booked, setBooked] = useState<Appointment | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const service = services.find((s) => s.id === serviceId) ?? null;
  const multiPro = professionals.length > 1;

  // passo inicial conforme parâmetros e quantidade de profissionais
  useEffect(() => {
    if (loading) return;
    if (!multiPro && professionals[0]) setProId(professionals[0].id);
    if (serviceId && services.some((s) => s.id === serviceId)) setStep(multiPro && !proId ? 2 : 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (settings) setPayNow(settings.online_payment_enabled);
  }, [settings]);

  // ao chegar na etapa de horário, já seleciona o primeiro dia em que a barbearia abre
  useEffect(() => {
    if (step !== 3 || day || loading) return;
    const today = startOfDay(new Date());
    for (let i = 0; i <= (settings?.booking_window_days ?? 30); i++) {
      const d = addDays(today, i);
      if (hours.find((h) => h.weekday === d.getDay())?.is_open) {
        setDay(d);
        break;
      }
    }
  }, [step, day, loading, hours, settings]);

  // busca horários ocupados do dia selecionado
  useEffect(() => {
    if (!day || !proId) return;
    let alive = true;
    setBusy(null);
    setSlot(null);
    const ids = proId === ANY ? professionals.map((p) => p.id) : [proId];
    Promise.all(
      ids.map((id) =>
        supabase.rpc("get_busy_slots", { p_professional_id: id, p_from: startOfDay(day).toISOString(), p_to: endOfDay(day).toISOString() }).then((r) => [id, (r.data ?? []) as Busy[]] as const),
      ),
    ).then((res) => alive && setBusy(Object.fromEntries(res)));
    return () => {
      alive = false;
    };
  }, [day, proId, professionals]);

  // horários livres; com "qualquer profissional" guarda quem está livre em cada horário
  const slots = useMemo(() => {
    if (!day || !service || !busy || !settings) return [] as { at: Date; pro: string }[];
    const h = hours.find((x) => x.weekday === day.getDay());
    const map = new Map<number, string>();
    for (const [pid, b] of Object.entries(busy)) {
      for (const t of buildSlots({ day, hours: h, durationMin: service.duration_min, intervalMin: settings.slot_interval_min, busy: b })) {
        if (!map.has(t.getTime())) map.set(t.getTime(), pid);
      }
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([t, p]) => ({ at: new Date(t), pro: p }));
  }, [day, service, busy, hours, settings]);

  if (loading) return <PageLoader />;

  const maxDay = addDays(new Date(), settings?.booking_window_days ?? 30);
  const dayDisabled = (d: Date) => isBefore(d, startOfDay(new Date())) || d > maxDay || !hours.find((h) => h.weekday === d.getDay())?.is_open;

  const chosenSlot = slots.find((s) => slot && s.at.getTime() === slot.getTime());
  const finalProId = proId === ANY ? chosenSlot?.pro : proId;
  const finalPro = professionals.find((p) => p.id === finalProId);

  async function confirm() {
    if (!service || !finalProId || !slot) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("book_appointment", {
      p_service_id: service.id,
      p_professional_id: finalProId,
      p_starts_at: slot.toISOString(),
      p_notes: notes || null,
    });
    setSaving(false);
    if (error) {
      toast.error(errMsg(error));
      setDay(day ? new Date(day) : null); // recarrega horários
      setStep(3);
      return;
    }
    setBooked(data as Appointment);
    setStep(5);
    if (payNow && settings?.online_payment_enabled) setPayOpen(true);
  }

  const steps = multiPro ? ["Serviço", "Profissional", "Horário", "Confirmar"] : ["Serviço", "Horário", "Confirmar"];
  const stepIdx = multiPro ? step - 1 : step === 1 ? 0 : step - 2;

  return (
    <div className="px-4 pt-5">
      {step < 5 && (
        <>
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={() => (step === 1 ? navigate(-1) : setStep(step === 3 && !multiPro ? 1 : step - 1))}
              className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-ink"
              aria-label="Voltar"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="text-xl font-bold">Agendar horário</h1>
          </div>
          <div className="mb-6 flex gap-1.5">
            {steps.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={cx("h-1 rounded-full", i <= stepIdx ? "bg-gold" : "bg-line")} />
                <p className={cx("mt-1.5 text-[11px] font-medium", i === stepIdx ? "text-ink" : "text-muted")}>{s}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 1. Serviço */}
      {step === 1 && (
        <ul className="space-y-2">
          {services.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => {
                  setServiceId(s.id);
                  setSlot(null);
                  setStep(multiPro && !proId ? 2 : 3);
                }}
                className={cx("flex w-full items-center gap-3 rounded-2xl border bg-surface p-4 text-left transition hover:border-gold/50", serviceId === s.id ? "border-gold" : "border-line")}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name}</p>
                  <p className="mt-0.5 flex items-center gap-3 text-sm">
                    <span className="font-semibold text-ok">{money(s.price)}</span>
                    <span className="flex items-center gap-1 text-muted">
                      <Clock className="size-3.5" />
                      {duration(s.duration_min)}
                    </span>
                  </p>
                </div>
                {serviceId === s.id && <Check className="size-5 text-gold" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 2. Profissional */}
      {step === 2 && (
        <ul className="space-y-2">
          <li>
            <button onClick={() => (setProId(ANY), setStep(3))} className={cx("flex w-full items-center gap-4 rounded-2xl border bg-surface p-4 text-left hover:border-gold/50", proId === ANY ? "border-gold" : "border-line")}>
              <span className="grid size-12 place-items-center rounded-full bg-gold/15 text-gold">
                <Users className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">Qualquer profissional</span>
                <span className="block text-sm text-muted">Mais horários disponíveis</span>
              </span>
            </button>
          </li>
          {professionals.map((p) => (
            <li key={p.id}>
              <button onClick={() => (setProId(p.id), setStep(3))} className={cx("flex w-full items-center gap-4 rounded-2xl border bg-surface p-4 text-left hover:border-gold/50", proId === p.id ? "border-gold" : "border-line")}>
                <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-2">
                  {p.photo_url ? <img src={p.photo_url} alt="" className="size-full object-cover" /> : <span className="font-display text-gold">{initials(p.name)}</span>}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{p.name}</span>
                  {p.bio && <span className="line-clamp-1 block text-sm text-muted">{p.bio}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 3. Data e horário */}
      {step === 3 && service && (
        <div className="space-y-5">
          {professionals.length === 0 ? (
            <Empty title="Nenhum profissional disponível" text="A barbearia ainda não cadastrou profissionais." />
          ) : (
            <>
              <DateStrip days={eachDayOfInterval({ start: startOfDay(new Date()), end: maxDay })} value={day} onChange={setDay} isDisabled={dayDisabled} />
              {day && (
                <div>
                  <h2 className="mb-3 font-semibold capitalize">{fmt(day, "EEEE, d 'de' MMMM")}</h2>
                  {!busy ? (
                    <div className="flex justify-center py-6">
                      <Spinner />
                    </div>
                  ) : slots.length === 0 ? (
                    <Empty title="Sem horários livres" text="Escolha outro dia." />
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {slots.map(({ at }) => (
                        <button
                          key={at.getTime()}
                          onClick={() => setSlot(at)}
                          className={cx("rounded-xl border py-2.5 text-sm font-semibold transition", slot?.getTime() === at.getTime() ? "border-gold bg-gold text-black" : "border-line bg-surface hover:border-gold/50")}
                        >
                          {fmt(at, "HH:mm")}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="pb-safe sticky bottom-20 pt-2">
                <Button size="lg" className="w-full shadow-xl" disabled={!slot} onClick={() => setStep(4)}>
                  Continuar
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 4. Confirmar */}
      {step === 4 && service && slot && (
        <div className="space-y-4">
          <Card className="space-y-3">
            <Row label="Serviço" value={service.name} />
            <Row label="Profissional" value={finalPro?.name ?? "—"} />
            <Row label="Data" value={fmt(slot, "EEEE, dd/MM/yyyy")} />
            <Row label="Horário" value={`${fmt(slot, "HH:mm")} (${duration(service.duration_min)})`} />
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="text-muted">Total</span>
              <span className="text-xl font-bold text-ok">{money(service.price)}</span>
            </div>
          </Card>

          <div className="space-y-2">
            <p className="text-sm font-semibold">Como prefere pagar?</p>
            {settings?.online_payment_enabled && (
              <PayOption active={payNow} onClick={() => setPayNow(true)} icon={<Smartphone className="size-5" />} title="Pagar agora pelo app" text="PIX ou cartão de crédito/débito" />
            )}
            {settings?.pay_at_shop_enabled !== false && (
              <PayOption active={!payNow} onClick={() => setPayNow(false)} icon={<Store className="size-5" />} title="Pagar na barbearia" text="Dinheiro, cartão ou PIX no atendimento" />
            )}
          </div>

          <Textarea label="Observações (opcional)" placeholder="Alguma preferência para o atendimento?" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />

          <Button size="lg" className="w-full" loading={saving} onClick={confirm}>
            Confirmar agendamento
          </Button>
        </div>
      )}

      {/* 5. Sucesso */}
      {step === 5 && booked && (
        <div className="space-y-5 pt-10 text-center">
          <CalendarCheck2 className="mx-auto size-16 text-gold" />
          <div>
            <h1 className="text-2xl font-bold">Horário agendado!</h1>
            <p className="mt-1 text-muted capitalize">
              {fmt(booked.starts_at, "EEEE, d 'de' MMMM 'às' HH:mm")}
              <br />
              {booked.service_name} · {finalPro?.name}
            </p>
          </div>
          {booked.payment_status !== "paid" && settings?.online_payment_enabled && (
            <Button variant="secondary" className="w-full" onClick={() => setPayOpen(true)}>
              Pagar agora pelo app
            </Button>
          )}
          <Button className="w-full" onClick={() => navigate("/meus-agendamentos")}>
            Ver meus agendamentos
          </Button>
        </div>
      )}

      <PaymentSheet
        appt={booked}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        onPaid={() => setBooked((b) => (b ? { ...b, payment_status: "paid" } : b))}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium capitalize">{value}</span>
    </div>
  );
}

function PayOption({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: ReactNode; title: string; text: string }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-3 rounded-2xl border bg-surface p-4 text-left transition", active ? "border-gold" : "border-line")}>
      <span className={cx("grid size-10 place-items-center rounded-xl", active ? "bg-gold/15 text-gold" : "bg-surface-2 text-muted")}>{icon}</span>
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
      <span className={cx("grid size-5 place-items-center rounded-full border-2", active ? "border-gold" : "border-line")}>{active && <span className="size-2.5 rounded-full bg-gold" />}</span>
    </button>
  );
}
