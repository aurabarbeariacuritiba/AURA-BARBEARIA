import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, CreditCard, MessageCircle, QrCode, Undo2 } from "lucide-react";
import { supabase, errMsg } from "../../lib/supabase";
import { fmt, isoDay, maskPhone, METHOD_LABEL, money, PAY_STATUS_LABEL, whatsappLink, duration } from "../../lib/format";
import { useAuth } from "../../contexts/AuthContext";
import type { Appointment, ApptStatus, Payment, PayMethod, Professional, Profile, Service } from "../../lib/types";
import { PayBadge, StatusBadge } from "../../components/StatusBadges";
import { Button, cx, Input, Modal, Select, Textarea, useToast } from "../../components/ui";

/** select padrão de agendamentos para a equipe */
export const APPT_SELECT = "*, client:profiles!appointments_client_id_fkey(full_name, phone, email), professional:professionals(name)";

export const clientName = (a: Appointment) => a.client?.full_name || a.guest_name || "Cliente";
export const clientPhone = (a: Appointment) => a.client?.phone || a.guest_phone || null;

const METHODS: { k: PayMethod; icon: typeof Banknote }[] = [
  { k: "cash", icon: Banknote },
  { k: "pix", icon: QrCode },
  { k: "debit_card", icon: CreditCard },
  { k: "credit_card", icon: CreditCard },
];

/* =========================================================
   Detalhes do agendamento + ações + dar baixa
   ========================================================= */
export function ApptModal({ appt, onClose, onChanged }: { appt: Appointment | null; onClose: () => void; onChanged: () => void }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [method, setMethod] = useState<PayMethod>("cash");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!appt) return;
    setMethod("cash");
    setAmount(String(appt.price).replace(".", ","));
    setNote("");
    supabase
      .from("payments")
      .select("*")
      .eq("appointment_id", appt.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setPayments((data ?? []) as Payment[]));
  }, [appt]);

  if (!appt) return null;

  async function setStatus(status: ApptStatus) {
    setBusy(status);
    const { error } = status === "cancelled" ? await supabase.rpc("cancel_appointment", { p_id: appt!.id }) : await supabase.from("appointments").update({ status }).eq("id", appt!.id);
    setBusy(null);
    if (error) return toast.error(errMsg(error));
    toast.success("Agendamento atualizado.");
    onChanged();
    onClose();
  }

  async function receive() {
    const value = Number(amount.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return toast.error("Valor inválido.");
    setBusy("pay");
    const { error } = await supabase.rpc("register_manual_payment", { p_appointment_id: appt!.id, p_method: method, p_amount: value, p_notes: note || null });
    setBusy(null);
    if (error) return toast.error(errMsg(error));
    toast.success("Pagamento registrado (baixa efetuada).");
    onChanged();
    onClose();
  }

  async function undo(id: string) {
    if (!confirm("Desfazer esta baixa? O agendamento voltará a ficar 'A pagar'.")) return;
    const { error } = await supabase.rpc("undo_payment", { p_payment_id: id });
    if (error) return toast.error(errMsg(error));
    toast.success("Baixa desfeita.");
    onChanged();
    onClose();
  }

  const phone = clientPhone(appt);
  const wa = whatsappLink(phone, `Olá ${clientName(appt).split(" ")[0]}! Aqui é da Aura Barbearia sobre seu horário de ${fmt(appt.starts_at, "dd/MM 'às' HH:mm")}.`);
  const active = ["pending", "confirmed"].includes(appt.status);
  const paid = appt.payment_status === "paid";

  return (
    <Modal open onClose={onClose} title="Agendamento">
      <div className="space-y-5">
        <div>
          <p className="text-lg font-bold">{clientName(appt)}</p>
          <p className="text-sm text-muted">
            {phone ?? "Sem telefone"} {appt.guest_name && "· cliente avulso"}
          </p>
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ok/15 px-3 py-1 text-sm font-semibold text-ok">
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          )}
        </div>

        <div className="space-y-2 rounded-2xl bg-surface-2 p-4 text-sm">
          <Line l="Serviço" v={appt.service_name} />
          <Line l="Profissional" v={appt.professional?.name ?? "—"} />
          <Line l="Quando" v={`${fmt(appt.starts_at, "EEE, dd/MM · HH:mm")}–${fmt(appt.ends_at, "HH:mm")}`} />
          <Line l="Valor" v={appt.subscription_id ? "Incluso na assinatura" : money(appt.price)} />
          {appt.notes && <Line l="Obs." v={appt.notes} />}
          <div className="flex gap-1.5 pt-1">
            <StatusBadge s={appt.status} />
            <PayBadge s={appt.payment_status} sub={!!appt.subscription_id} />
          </div>
        </div>

        {/* status */}
        {appt.status !== "cancelled" && (
          <div className="grid grid-cols-2 gap-2">
            {appt.status === "pending" && (
              <Button size="sm" variant="secondary" loading={busy === "confirmed"} onClick={() => setStatus("confirmed")}>
                Confirmar
              </Button>
            )}
            {appt.status !== "completed" && (
              <Button size="sm" variant="success" loading={busy === "completed"} onClick={() => setStatus("completed")}>
                Concluído
              </Button>
            )}
            {active && (
              <Button size="sm" variant="secondary" loading={busy === "no_show"} onClick={() => setStatus("no_show")}>
                Não compareceu
              </Button>
            )}
            {appt.status !== "completed" && (
              <Button size="sm" variant="danger" loading={busy === "cancelled"} onClick={() => confirm("Cancelar este agendamento?") && setStatus("cancelled")}>
                Cancelar
              </Button>
            )}
          </div>
        )}

        {/* dar baixa */}
        {!paid && appt.status !== "cancelled" && (
          <div className="space-y-3 rounded-2xl border border-gold/30 bg-gold/5 p-4">
            <p className="font-semibold">Dar baixa (pagamento presencial)</p>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map(({ k, icon: Icon }) => (
                <button key={k} onClick={() => setMethod(k)} className={cx("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition", method === k ? "border-gold bg-gold/15 text-gold" : "border-line bg-surface")}>
                  <Icon className="size-4" /> {METHOD_LABEL[k]}
                </button>
              ))}
            </div>
            <Input label="Valor recebido (R$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ""))} />
            <Input label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: desconto, gorjeta..." />
            <Button className="w-full" loading={busy === "pay"} onClick={receive}>
              <CheckCircle2 className="size-4" /> Confirmar recebimento
            </Button>
          </div>
        )}

        {/* histórico de pagamentos */}
        {payments.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold">Pagamentos</p>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {money(p.amount)} · {p.method ? METHOD_LABEL[p.method] : "—"}
                    </p>
                    <p className="text-xs text-muted">
                      {p.provider === "manual" ? "Baixa manual" : "Mercado Pago"} · {PAY_STATUS_LABEL[p.status]} · {fmt(p.paid_at ?? p.created_at, "dd/MM HH:mm")}
                    </p>
                  </div>
                  {isAdmin && p.status === "paid" && (
                    <button onClick={() => undo(p.id)} className="rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-bad" title="Desfazer / estornar">
                      <Undo2 className="size-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Line({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted">{l}</span>
      <span className="text-right font-medium capitalize">{v}</span>
    </div>
  );
}

/* =========================================================
   Novo agendamento feito pela equipe (balcão / telefone)
   ========================================================= */
export function NewApptModal({ open, onClose, onSaved, services, professionals, defaultDay, defaultTime, defaultProId }: { open: boolean; onClose: () => void; onSaved: () => void; services: Service[]; professionals: Professional[]; defaultDay: Date; defaultTime?: string; defaultProId?: string }) {
  const toast = useToast();
  const [mode, setMode] = useState<"registered" | "guest">("registered");
  const [q, setQ] = useState("");
  const [clients, setClients] = useState<Profile[]>([]);
  const [clientId, setClientId] = useState("");
  const [guest, setGuest] = useState({ name: "", phone: "" });
  const [serviceId, setServiceId] = useState("");
  const [proId, setProId] = useState("");
  const [date, setDate] = useState(isoDay(defaultDay));
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(isoDay(defaultDay));
    setServiceId(services[0]?.id ?? "");
    setProId(defaultProId ?? professionals[0]?.id ?? "");
    setTime(defaultTime ?? "09:00");
    setClientId("");
    setQ("");
    setGuest({ name: "", phone: "" });
    setNotes("");
  }, [open, defaultDay, services, professionals, defaultTime, defaultProId]);

  useEffect(() => {
    if (!open || mode !== "registered") return;
    const t = setTimeout(async () => {
      let query = supabase.from("profiles").select("*").order("full_name").limit(20);
      const t = q.trim().replace(/[,()%*]/g, " ");
      if (t) query = query.or(`full_name.ilike.%${t}%,phone.ilike.%${t}%,email.ilike.%${t}%`);
      const { data } = await query;
      setClients((data ?? []) as Profile[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, mode]);

  async function save() {
    if (mode === "registered" && !clientId) return toast.error("Selecione o cliente.");
    if (mode === "guest" && !guest.name.trim()) return toast.error("Informe o nome do cliente.");
    if (!serviceId || !proId) return toast.error("Selecione serviço e profissional.");
    setSaving(true);
    const starts = new Date(`${date}T${time}:00`);
    const { error } = await supabase.rpc("book_appointment", {
      p_service_id: serviceId,
      p_professional_id: proId,
      p_starts_at: starts.toISOString(),
      p_notes: notes || null,
      p_client_id: mode === "registered" ? clientId : null,
      p_guest_name: mode === "guest" ? guest.name : null,
      p_guest_phone: mode === "guest" ? guest.phone : null,
    });
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Agendamento criado.");
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo agendamento" footer={<Button className="w-full" loading={saving} onClick={save}>Agendar</Button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 rounded-xl bg-surface-2 p-1">
          {(
            [
              ["registered", "Cliente cadastrado"],
              ["guest", "Cliente avulso"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={cx("rounded-lg py-2 text-sm font-semibold", mode === k ? "bg-surface text-ink" : "text-muted")}>
              {l}
            </button>
          ))}
        </div>

        {mode === "registered" ? (
          <div className="space-y-2">
            <Input label="Buscar cliente" placeholder="Nome, telefone ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="max-h-44 overflow-y-auto rounded-xl border border-line">
              {clients.map((c) => (
                <button key={c.id} onClick={() => setClientId(c.id)} className={cx("flex w-full items-center justify-between px-3 py-2 text-left text-sm", clientId === c.id ? "bg-gold/15 text-gold" : "hover:bg-surface-2")}>
                  <span className="font-medium">{c.full_name || c.email}</span>
                  <span className="text-xs text-muted">{c.phone}</span>
                </button>
              ))}
              {clients.length === 0 && <p className="p-3 text-sm text-muted">Nenhum cliente encontrado.</p>}
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nome" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
            <Input label="Telefone" type="tel" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: maskPhone(e.target.value) })} />
          </div>
        )}

        <Select label="Serviço" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {money(s.price)} · {duration(s.duration_min)}
            </option>
          ))}
        </Select>
        <Select label="Profissional" value={proId} onChange={(e) => setProId(e.target.value)}>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Horário" type="time" step={300} value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Textarea label="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

/* =========================================================
   Bloqueio de agenda (folga, almoço, feriado)
   ========================================================= */
export function BlockModal({ open, onClose, onSaved, professionals, defaultDay }: { open: boolean; onClose: () => void; onSaved: () => void; professionals: Professional[]; defaultDay: Date }) {
  const toast = useToast();
  const [proId, setProId] = useState("");
  const [date, setDate] = useState(isoDay(defaultDay));
  const [start, setStart] = useState("12:00");
  const [end, setEnd] = useState("13:00");
  const [allDay, setAllDay] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDate(isoDay(defaultDay));
  }, [open, defaultDay]);

  async function save() {
    const s = new Date(`${date}T${allDay ? "00:00" : start}:00`);
    const e = new Date(`${date}T${allDay ? "23:59" : end}:00`);
    if (e <= s) return toast.error("O fim deve ser depois do início.");
    setSaving(true);
    const { error } = await supabase.from("time_off").insert({ professional_id: proId || null, starts_at: s.toISOString(), ends_at: e.toISOString(), reason: reason || null });
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Horário bloqueado.");
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Bloquear horário" footer={<Button className="w-full" loading={saving} onClick={save}>Bloquear</Button>}>
      <div className="space-y-4">
        <Select label="Profissional" value={proId} onChange={(e) => setProId(e.target.value)}>
          <option value="">Toda a barbearia</option>
          {professionals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Input label="Data" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="size-4 accent-[var(--color-gold)]" /> Dia inteiro
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Início" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input label="Fim" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        )}
        <Input label="Motivo (opcional)" placeholder="Folga, feriado, almoço..." value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

/** Cartão de KPI */
export function Kpi({ label, value, hint, tone = "ink" }: { label: string; value: string; hint?: string; tone?: "ink" | "ok" | "bad" | "gold" | "warn" }) {
  const tones = { ink: "text-ink", ok: "text-ok", bad: "text-bad", gold: "text-gold", warn: "text-warn" };
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface p-3.5 sm:p-4">
      <p className="truncate text-xs font-medium text-muted">{label}</p>
      <p className={cx("mt-1 text-xl font-bold break-words tabular-nums sm:text-2xl", tones[tone])}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
