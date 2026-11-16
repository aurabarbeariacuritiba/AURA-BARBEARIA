import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, MessageCircle, Pencil, Plus, QrCode, Search } from "lucide-react";
import { supabase, errMsg } from "../../lib/supabase";
import { fmt, initials, isoDay, METHOD_LABEL, money, WEEKDAYS, whatsappLink } from "../../lib/format";
import { isActive, isExpired, weekdaysLabel } from "../../lib/subscription";
import { useShop } from "../../lib/useShop";
import { useAuth } from "../../contexts/AuthContext";
import type { PayMethod, Plan, Profile, Subscription } from "../../lib/types";
import { Badge, Button, Card, cx, Empty, Input, Modal, PageLoader, Select, Textarea, Toggle, useToast } from "../../components/ui";
import { Kpi } from "./shared";

const METHODS: { k: PayMethod; icon: typeof Banknote }[] = [
  { k: "cash", icon: Banknote },
  { k: "pix", icon: QrCode },
  { k: "debit_card", icon: CreditCard },
  { k: "credit_card", icon: CreditCard },
];

const SUB_SELECT = "*, plan:plans(*), client:profiles(full_name, phone, email)";

function SubBadge({ s }: { s: Subscription }) {
  if (s.status === "cancelled") return <Badge>Cancelada</Badge>;
  if (s.status === "pending") return <Badge color="yellow">Aguardando pagamento</Badge>;
  if (isExpired(s)) return <Badge color="red">Vencida</Badge>;
  const days = Math.ceil((new Date(s.current_period_end!).getTime() - Date.now()) / 86_400_000);
  return <Badge color={days <= 7 ? "yellow" : "green"}>{days <= 7 ? `Vence em ${days}d` : "Ativa"}</Badge>;
}

const parseMoney = (v: string) => Number(v.replace(/\./g, "").replace(",", "."));

export default function Subscriptions() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"subs" | "plans">("subs");
  const [plans, setPlans] = useState<Plan[]>([]);
  const loadPlans = useCallback(async () => {
    const { data } = await supabase.from("plans").select("*").order("sort_order");
    setPlans((data ?? []) as Plan[]);
  }, []);
  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Assinaturas</h1>
      <div className="grid max-w-sm grid-cols-2 rounded-xl bg-surface p-1">
        {(
          [
            ["subs", "Assinantes"],
            ["plans", "Planos"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("rounded-lg py-2 text-sm font-semibold", tab === k ? "bg-surface-2 text-ink" : "text-muted")}>
            {l}
          </button>
        ))}
      </div>
      {tab === "subs" ? <Subscribers plans={plans} /> : <Plans plans={plans} reload={loadPlans} canEdit={isAdmin} />}
    </div>
  );
}

/* =========================================================
   Assinantes
   ========================================================= */
function Subscribers({ plans }: { plans: Plan[] }) {
  const toast = useToast();
  const [list, setList] = useState<Subscription[] | null>(null);
  const [filter, setFilter] = useState<"open" | "expiring" | "expired" | "cancelled">("open");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Subscription | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("subscriptions").select(SUB_SELECT).order("created_at", { ascending: false }).limit(500);
    if (error) toast.error(errMsg(error));
    setList((data ?? []) as Subscription[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const l = list ?? [];
    const active = l.filter(isActive);
    return {
      active: active.length,
      mrr: active.reduce((s, x) => s + Number(x.plan?.price ?? 0), 0),
      expiring: active.filter((x) => new Date(x.current_period_end!).getTime() - Date.now() <= 7 * 86_400_000).length,
      expired: l.filter(isExpired).length,
      pending: l.filter((x) => x.status === "pending").length,
    };
  }, [list]);

  if (!list) return <PageLoader />;

  const term = q.trim().toLowerCase();
  const shown = list
    .filter((s) => {
      if (filter === "cancelled") return s.status === "cancelled";
      if (s.status === "cancelled") return false;
      if (filter === "expiring") return isActive(s) && new Date(s.current_period_end!).getTime() - Date.now() <= 7 * 86_400_000;
      if (filter === "expired") return isExpired(s) || s.status === "pending";
      return true;
    })
    .filter((s) => !term || `${s.client?.full_name} ${s.client?.phone} ${s.client?.email}`.toLowerCase().includes(term))
    .sort((a, b) => (a.current_period_end ?? "9").localeCompare(b.current_period_end ?? "9"));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Assinantes ativos" value={String(stats.active)} tone="gold" />
        <Kpi label="Receita mensal recorrente" value={money(stats.mrr)} tone="ok" />
        <Kpi label="Vencem em 7 dias" value={String(stats.expiring)} tone="warn" />
        <Kpi label="Vencidas / pendentes" value={String(stats.expired + stats.pending)} tone="bad" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar assinante" className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm outline-none focus:border-gold/60" />
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="size-4" /> Novo assinante
        </Button>
      </div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {(
          [
            ["open", "Todas"],
            ["expiring", "Vencendo"],
            ["expired", "Vencidas / pendentes"],
            ["cancelled", "Canceladas"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={cx("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium", filter === k ? "bg-gold text-black" : "bg-surface-2 text-muted")}>
            {l}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Empty title="Nenhuma assinatura aqui" />
      ) : (
        <Card className="divide-y divide-line p-0">
          {shown.map((s) => (
            <button key={s.id} onClick={() => setSel(s)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold/15 text-sm font-semibold text-gold">{initials(s.client?.full_name ?? "")}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.client?.full_name}</span>
                <span className="block truncate text-xs text-muted">
                  {s.plan?.name} · {s.current_period_end ? `até ${fmt(s.current_period_end, "dd/MM/yyyy")}` : "sem validade"}
                </span>
              </span>
              <SubBadge s={s} />
            </button>
          ))}
        </Card>
      )}

      <SubModal sub={sel} plans={plans} onClose={() => setSel(null)} onChanged={load} />
      <NewSubModal open={newOpen} plans={plans} onClose={() => setNewOpen(false)} onSaved={load} />
    </div>
  );
}

function SubModal({ sub, plans, onClose, onChanged }: { sub: Subscription | null; plans: Plan[]; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [method, setMethod] = useState<PayMethod>("pix");
  const [amount, setAmount] = useState("");
  const [planId, setPlanId] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!sub) return;
    setMethod("pix");
    setAmount(String(sub.plan?.price ?? "").replace(".", ","));
    setPlanId(sub.plan_id);
    setUntil(sub.current_period_end ? isoDay(new Date(new Date(sub.current_period_end).getTime() - 1)) : "");
  }, [sub]);

  if (!sub) return null;

  async function receive() {
    const v = parseMoney(amount);
    if (!Number.isFinite(v) || v < 0) return toast.error("Valor inválido.");
    setBusy("pay");
    const { data, error } = await supabase.rpc("register_subscription_payment", { p_subscription_id: sub!.id, p_method: method, p_amount: v });
    setBusy(null);
    if (error) return toast.error(errMsg(error));
    toast.success(`Mensalidade recebida. Válida até ${fmt((data as Subscription).current_period_end!, "dd/MM/yyyy")}.`);
    onChanged();
    onClose();
  }

  async function saveEdit() {
    setBusy("edit");
    const { error } = await supabase.rpc("staff_set_subscription", { p_client_id: sub!.client_id, p_plan_id: planId, p_valid_until: until || null });
    setBusy(null);
    if (error) return toast.error(errMsg(error));
    toast.success("Assinatura atualizada.");
    onChanged();
    onClose();
  }

  async function cancel() {
    if (!confirm("Cancelar esta assinatura?")) return;
    const { error } = await supabase.rpc("cancel_subscription", { p_id: sub!.id });
    if (error) return toast.error(errMsg(error));
    toast.success("Assinatura cancelada.");
    onChanged();
    onClose();
  }

  const wa = whatsappLink(sub.client?.phone, `Olá ${sub.client?.full_name?.split(" ")[0] ?? ""}! Aqui é da Aura Barbearia sobre sua assinatura ${sub.plan?.name}.`);

  return (
    <Modal open onClose={onClose} title="Assinatura">
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-bold">{sub.client?.full_name}</p>
            <p className="text-sm text-muted">{sub.client?.phone}</p>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ok/15 px-3 py-1 text-sm font-semibold text-ok">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            )}
          </div>
          <SubBadge s={sub} />
        </div>
        <div className="space-y-1 rounded-2xl bg-surface-2 p-4 text-sm">
          <p className="font-semibold">
            {sub.plan?.name} · {money(sub.plan?.price)}/mês
          </p>
          <p className="text-muted">
            {sub.current_period_start && sub.current_period_end
              ? `Período: ${fmt(sub.current_period_start, "dd/MM/yyyy")} a ${fmt(new Date(new Date(sub.current_period_end).getTime() - 1), "dd/MM/yyyy")}`
              : "Ainda não ativada"}
          </p>
        </div>

        {sub.status !== "cancelled" && (
          <>
            <div className="space-y-3 rounded-2xl border border-gold/30 bg-gold/5 p-4">
              <p className="font-semibold">Receber mensalidade</p>
              <p className="-mt-2 text-xs text-muted">{isActive(sub) ? "Soma +1 mês à validade atual." : "Ativa a assinatura por 1 mês a partir de hoje."}</p>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map(({ k, icon: Icon }) => (
                  <button key={k} onClick={() => setMethod(k)} className={cx("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium", method === k ? "border-gold bg-gold/15 text-gold" : "border-line bg-surface")}>
                    <Icon className="size-4" /> {METHOD_LABEL[k]}
                  </button>
                ))}
              </div>
              <Input label="Valor (R$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ""))} />
              <Button className="w-full" loading={busy === "pay"} onClick={receive}>
                Confirmar recebimento
              </Button>
            </div>

            <div className="space-y-3">
              <p className="font-semibold">Ajustar plano / validade</p>
              <Select label="Plano" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {money(p.price)}
                  </option>
                ))}
              </Select>
              <Input label="Válida até (inclusive)" type="date" value={until} onChange={(e) => setUntil(e.target.value)} hint="Use para corrigir a validade sem registrar pagamento." />
              <div className="flex gap-2">
                <Button variant="danger" onClick={cancel}>
                  Cancelar assinatura
                </Button>
                <Button variant="secondary" className="flex-1" loading={busy === "edit"} onClick={saveEdit}>
                  Salvar ajuste
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function NewSubModal({ open, plans, onClose, onSaved }: { open: boolean; plans: Plan[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [clients, setClients] = useState<Profile[]>([]);
  const [clientId, setClientId] = useState("");
  const [planId, setPlanId] = useState("");
  const [mode, setMode] = useState<"receive" | "paid_until" | "pending">("receive");
  const [method, setMethod] = useState<PayMethod>("pix");
  const [until, setUntil] = useState("");
  const { isAdmin, profile } = useAuth();
  const [launch, setLaunch] = useState(true);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setClientId("");
    setPlanId(plans.find((p) => p.active)?.id ?? "");
    setMode("receive");
    setUntil(isoDay(new Date(Date.now() + 30 * 86_400_000)));
    setLaunch(true);
    setPaidOn(isoDay(new Date()));
    setMethod("pix");
  }, [open, plans]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      let query = supabase.from("profiles").select("*").order("full_name").limit(20);
      const term = q.trim().replace(/[,()%*]/g, " ");
      if (term) query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
      const { data } = await query;
      setClients((data ?? []) as Profile[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    const p = plans.find((x) => x.id === planId);
    if (p) setAmount(String(p.price).replace(".", ","));
  }, [planId, plans]);

  async function save() {
    if (!clientId || !planId) return toast.error("Selecione o cliente e o plano.");
    setSaving(true);
    const { data, error } = await supabase.rpc("staff_set_subscription", { p_client_id: clientId, p_plan_id: planId, p_valid_until: mode === "paid_until" ? until : null });
    // "Já é assinante": opcionalmente lança o valor no Financeiro (sem mexer na validade)
    if (!error && mode === "paid_until" && isAdmin && launch) {
      const v = parseMoney(amount);
      if (!Number.isFinite(v) || v <= 0) {
        setSaving(false);
        return toast.error("Assinatura salva, mas o valor a lançar é inválido.");
      }
      const sub = data as Subscription;
      const r = await supabase.from("payments").insert({
        subscription_id: sub.id,
        client_id: sub.client_id,
        amount: v,
        method,
        status: "paid",
        provider: "manual",
        received_by: profile?.id,
        paid_at: new Date(`${paidOn}T12:00:00`).toISOString(),
        notes: "Mensalidade paga fora do app",
      });
      if (r.error) {
        setSaving(false);
        return toast.error(errMsg(r.error));
      }
    }
    if (!error && mode === "receive") {
      const r = await supabase.rpc("register_subscription_payment", { p_subscription_id: (data as Subscription).id, p_method: method });
      if (r.error) {
        setSaving(false);
        return toast.error(errMsg(r.error));
      }
    }
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Assinante cadastrado.");
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo assinante" footer={<Button className="w-full" loading={saving} onClick={save}>Salvar</Button>}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Input label="Cliente" placeholder="Buscar por nome, telefone ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="max-h-40 overflow-y-auto rounded-xl border border-line">
            {clients.map((c) => (
              <button key={c.id} onClick={() => setClientId(c.id)} className={cx("flex w-full items-center justify-between px-3 py-2 text-left text-sm", clientId === c.id ? "bg-gold/15 text-gold" : "hover:bg-surface-2")}>
                <span className="font-medium">{c.full_name || c.email}</span>
                <span className="text-xs text-muted">{c.phone}</span>
              </button>
            ))}
            {clients.length === 0 && <p className="p-3 text-sm text-muted">Nenhum cliente. O cliente precisa ter conta no app.</p>}
          </div>
        </div>
        <Select label="Plano" value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {plans
            .filter((p) => p.active)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {money(p.price)}/mês
              </option>
            ))}
        </Select>
        <div className="space-y-2">
          <p className="text-sm font-medium">Pagamento</p>
          {(
            [
              ["receive", "Receber a 1ª mensalidade agora", "Ativa por 1 mês a partir de hoje"],
              ["paid_until", "Já é assinante (pago fora do app)", "Informe até quando está pago"],
              ["pending", "Deixar aguardando pagamento", "O cliente paga pelo app ou na barbearia"],
            ] as const
          ).map(([k, t, d]) => (
            <button key={k} onClick={() => setMode(k)} className={cx("w-full rounded-xl border p-3 text-left", mode === k ? "border-gold bg-gold/10" : "border-line")}>
              <span className="block text-sm font-semibold">{t}</span>
              <span className="block text-xs text-muted">{d}</span>
            </button>
          ))}
        </div>
        {mode === "receive" && (
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map(({ k, icon: Icon }) => (
              <button key={k} onClick={() => setMethod(k)} className={cx("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium", method === k ? "border-gold bg-gold/15 text-gold" : "border-line bg-surface")}>
                <Icon className="size-4" /> {METHOD_LABEL[k]}
              </button>
            ))}
          </div>
        )}
        {mode === "paid_until" && (
          <div className="space-y-3">
            <Input label="Pago até (inclusive)" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            {isAdmin && (
              <div className="space-y-3 rounded-2xl border border-line p-3">
                <Toggle label="Lançar este valor no Financeiro" hint="Registra a mensalidade como recebida, sem alterar a validade acima" checked={launch} onChange={setLaunch} />
                {launch && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Valor (R$)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,.]/g, ""))} />
                      <Input label="Pago em" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {METHODS.map(({ k, icon: Icon }) => (
                        <button key={k} onClick={() => setMethod(k)} className={cx("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium", method === k ? "border-gold bg-gold/15 text-gold" : "border-line bg-surface")}>
                          <Icon className="size-4" /> {METHOD_LABEL[k]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* =========================================================
   Planos
   ========================================================= */
type Draft = { id?: string; name: string; description: string; price: string; service_ids: string[]; allowed_weekdays: number[]; uses: string; active: boolean; sort_order: string };

function Plans({ plans, reload, canEdit }: { plans: Plan[]; reload: () => void; canEdit: boolean }) {
  const { services } = useShop(true);
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const svcName = (id: string) => services.find((s) => s.id === id)?.name ?? "?";
  const bookable = services.filter((s) => s.active);

  async function save() {
    if (!draft) return;
    const price = parseMoney(draft.price);
    if (!draft.name.trim() || !Number.isFinite(price) || price < 0) return toast.error("Preencha nome e valor.");
    if (draft.service_ids.length === 0) return toast.error("Selecione ao menos um serviço incluso.");
    setSaving(true);
    const row = {
      name: draft.name.trim(),
      description: draft.description.trim() || null,
      price,
      service_ids: draft.service_ids,
      allowed_weekdays: draft.allowed_weekdays.length && draft.allowed_weekdays.length < 7 ? draft.allowed_weekdays : null,
      uses_per_period: draft.uses ? parseInt(draft.uses) : null,
      active: draft.active,
      sort_order: parseInt(draft.sort_order) || 0,
    };
    const { error } = draft.id ? await supabase.from("plans").update(row).eq("id", draft.id) : await supabase.from("plans").insert(row);
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Plano salvo.");
    setDraft(null);
    reload();
  }

  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="space-y-4">
      {canEdit && (
        <Button size="sm" onClick={() => setDraft({ name: "", description: "", price: "", service_ids: [], allowed_weekdays: [], uses: "", active: true, sort_order: String(plans.length + 1) })}>
          <Plus className="size-4" /> Novo plano
        </Button>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => (
          <Card
            key={p.id}
            className={p.active ? "" : "opacity-55"}
            onClick={
              canEdit
                ? () =>
                    setDraft({
                      id: p.id,
                      name: p.name,
                      description: p.description ?? "",
                      price: String(p.price).replace(".", ","),
                      service_ids: p.service_ids,
                      allowed_weekdays: p.allowed_weekdays ?? [],
                      uses: p.uses_per_period ? String(p.uses_per_period) : "",
                      active: p.active,
                      sort_order: String(p.sort_order),
                    })
                : undefined
            }
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{p.name}</p>
              {canEdit && <Pencil className="size-4 text-muted" />}
            </div>
            <p className="font-bold text-ok">
              {money(p.price)}
              <span className="text-xs font-normal text-muted"> /mês</span>
            </p>
            <p className="mt-1 text-sm text-muted">{p.service_ids.map(svcName).join(", ")}</p>
            <p className="text-xs text-muted">
              {weekdaysLabel(p)} · {p.uses_per_period ? `${p.uses_per_period} usos/mês` : "ilimitado"}
              {!p.active && " · inativo"}
            </p>
          </Card>
        ))}
      </div>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Editar plano" : "Novo plano"} footer={<Button className="w-full" loading={saving} onClick={save}>Salvar</Button>}>
        {draft && (
          <div className="space-y-4">
            <Input label="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Textarea label="Descrição (opcional)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Valor mensal (R$)" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^\d,.]/g, "") })} />
              <Input label="Usos por mês" type="number" min={1} placeholder="Ilimitado" value={draft.uses} onChange={(e) => setDraft({ ...draft, uses: e.target.value })} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Serviços inclusos</p>
              <div className="flex flex-wrap gap-2">
                {bookable.map((s) => (
                  <button key={s.id} onClick={() => setDraft({ ...draft, service_ids: toggle(draft.service_ids, s.id) })} className={cx("rounded-full border px-3 py-1.5 text-sm", draft.service_ids.includes(s.id) ? "border-gold bg-gold/15 text-gold" : "border-line text-muted")}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Dias válidos <span className="font-normal text-muted">(nenhum marcado = todos)</span></p>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <button key={d} onClick={() => setDraft({ ...draft, allowed_weekdays: toggle(draft.allowed_weekdays, d) })} className={cx("rounded-full border px-3 py-1.5 text-sm", draft.allowed_weekdays.includes(d) ? "border-gold bg-gold/15 text-gold" : "border-line text-muted")}>
                    {WEEKDAYS[d].slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
            <Input label="Ordem de exibição" type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
            <Toggle label="Disponível para novos assinantes" checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
