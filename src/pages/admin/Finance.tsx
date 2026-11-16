import { useCallback, useEffect, useMemo, useState } from "react";
import { eachDayOfInterval, endOfDay, endOfMonth, startOfDay, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { Download, Plus, Trash2 } from "lucide-react";
import { supabase, errMsg } from "../../lib/supabase";
import { fmt, isoDay, METHOD_LABEL, money } from "../../lib/format";
import type { Appointment, Expense, Payment, PayMethod } from "../../lib/types";
import { Button, Card, cx, Empty, Input, Modal, PageLoader, Select, useToast } from "../../components/ui";
import { APPT_SELECT, ApptModal, clientName, Kpi } from "./shared";

type Preset = "today" | "week" | "month" | "last" | "custom";
const PRESETS: [Preset, string][] = [
  ["today", "Hoje"],
  ["week", "Semana"],
  ["month", "Este mês"],
  ["last", "Mês passado"],
  ["custom", "Período"],
];
const CATEGORIES = ["Aluguel", "Produtos", "Comissões / Salários", "Água / Luz / Internet", "Marketing", "Manutenção", "Impostos / Taxas", "Outros"];

type PaymentRow = Payment & {
  appointment: (Pick<Appointment, "service_name" | "starts_at"> & { professional: { name: string } | null }) | null;
  subscription: { plan: { name: string } | null } | null;
};
const payTitle = (p: PaymentRow) => p.appointment?.service_name ?? (p.subscription ? `Mensalidade · ${p.subscription.plan?.name ?? "Assinatura"}` : "—");

function range(p: Preset, custom: { from: string; to: string }) {
  const now = new Date();
  switch (p) {
    case "today":
      return [startOfDay(now), endOfDay(now)];
    case "week":
      return [startOfWeek(now, { weekStartsOn: 1 }), endOfDay(now)];
    case "month":
      return [startOfMonth(now), endOfMonth(now)];
    case "last":
      return [startOfMonth(subMonths(now, 1)), endOfMonth(subMonths(now, 1))];
    default:
      return [startOfDay(new Date(custom.from + "T00:00")), endOfDay(new Date(custom.to + "T00:00"))];
  }
}

export default function Finance() {
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>("month");
  const [custom, setCustom] = useState({ from: isoDay(startOfMonth(new Date())), to: isoDay(new Date()) });
  const [from, to] = useMemo(() => range(preset, custom), [preset, custom]);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [receivable, setReceivable] = useState<Appointment[]>([]);
  const [tab, setTab] = useState<"in" | "out" | "due">("in");
  const [expOpen, setExpOpen] = useState(false);
  const [exp, setExp] = useState({ description: "", category: CATEGORIES[0], amount: "", date: isoDay(new Date()) });
  const [open, setOpen] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    const [p, e, r] = await Promise.all([
      supabase
        .from("payments")
        .select("*, client:profiles!payments_client_id_fkey(full_name), appointment:appointments(service_name, starts_at, professional:professionals(name)), subscription:subscriptions(plan:plans(name))")
        .eq("status", "paid")
        .gte("paid_at", from.toISOString())
        .lte("paid_at", to.toISOString())
        .order("paid_at", { ascending: false }),
      supabase.from("expenses").select("*").gte("expense_date", isoDay(from)).lte("expense_date", isoDay(to)).order("expense_date", { ascending: false }),
      supabase
        .from("appointments")
        .select(APPT_SELECT)
        .in("status", ["confirmed", "completed"])
        .neq("payment_status", "paid")
        .lt("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: false })
        .limit(200),
    ]);
    if (p.error) toast.error(errMsg(p.error));
    setPayments((p.data ?? []) as PaymentRow[]);
    setExpenses((e.data ?? []) as Expense[]);
    setReceivable((r.data ?? []) as Appointment[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const list = payments ?? [];
    const revenue = list.reduce((s, p) => s + Number(p.amount), 0);
    const spent = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const byMethod = new Map<string, number>();
    const byPro = new Map<string, number>();
    const byDay = new Map<string, number>();
    for (const p of list) {
      const m = p.method ? METHOD_LABEL[p.method as PayMethod] : "Outro";
      byMethod.set(m, (byMethod.get(m) ?? 0) + Number(p.amount));
      const pro = p.appointment?.professional?.name ?? (p.subscription ? "Assinaturas (mensalidades)" : "Sem profissional");
      byPro.set(pro, (byPro.get(pro) ?? 0) + Number(p.amount));
      const d = isoDay(new Date(p.paid_at!));
      byDay.set(d, (byDay.get(d) ?? 0) + Number(p.amount));
    }
    const sortDesc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      revenue,
      spent,
      profit: revenue - spent,
      ticket: list.length ? revenue / list.length : 0,
      count: list.length,
      byMethod: sortDesc(byMethod),
      byPro: sortDesc(byPro),
      byDay,
      due: receivable.reduce((s, a) => s + Number(a.price), 0),
    };
  }, [payments, expenses, receivable]);

  if (!payments) return <PageLoader />;

  const days = eachDayOfInterval({ start: from, end: to > new Date() ? endOfDay(new Date()) : to }).slice(-31);
  const maxDay = Math.max(1, ...days.map((d) => stats.byDay.get(isoDay(d)) ?? 0));

  async function addExpense() {
    const amount = Number(exp.amount.replace(/\./g, "").replace(",", "."));
    if (!exp.description.trim() || !Number.isFinite(amount) || amount <= 0) return toast.error("Preencha descrição e valor.");
    const { error } = await supabase.from("expenses").insert({ description: exp.description.trim(), category: exp.category, amount, expense_date: exp.date });
    if (error) return toast.error(errMsg(error));
    toast.success("Despesa registrada.");
    setExpOpen(false);
    setExp({ description: "", category: CATEGORIES[0], amount: "", date: isoDay(new Date()) });
    load();
  }

  async function delExpense(id: string) {
    if (!confirm("Excluir esta despesa?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(errMsg(error));
    load();
  }

  function exportCsv() {
    const rows = [
      ["Tipo", "Data", "Descrição", "Cliente", "Profissional", "Forma", "Origem", "Valor"],
      ...payments!.map((p) => [
        "Entrada",
        fmt(p.paid_at!, "dd/MM/yyyy HH:mm"),
        payTitle(p),
        p.client?.full_name ?? "",
        p.appointment?.professional?.name ?? "",
        p.method ? METHOD_LABEL[p.method] : "",
        p.provider === "manual" ? "Baixa manual" : "Mercado Pago",
        String(p.amount).replace(".", ","),
      ]),
      ...expenses.map((e) => ["Saída", fmt(e.expense_date + "T12:00", "dd/MM/yyyy"), e.description, "", "", e.category, "", "-" + String(e.amount).replace(".", ",")]),
    ];
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `financeiro_${isoDay(from)}_a_${isoDay(to)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Financeiro</h1>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={exportCsv}>
            <Download className="size-4" /> Exportar
          </Button>
          <Button size="sm" onClick={() => setExpOpen(true)}>
            <Plus className="size-4" /> Despesa
          </Button>
        </div>
      </div>

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {PRESETS.map(([k, l]) => (
          <button key={k} onClick={() => setPreset(k)} className={cx("shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium", preset === k ? "bg-gold text-black" : "bg-surface-2 text-muted")}>
            {l}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Input label="De" type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <Input label="Até" type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
        </div>
      )}
      <p className="text-xs text-muted">
        {fmt(from, "dd/MM/yyyy")} a {fmt(to, "dd/MM/yyyy")}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Receitas" value={money(stats.revenue)} hint={`${stats.count} recebimento(s)`} tone="ok" />
        <Kpi label="Despesas" value={money(stats.spent)} tone="bad" />
        <Kpi label="Lucro" value={money(stats.profit)} tone={stats.profit >= 0 ? "gold" : "bad"} />
        <Kpi label="Ticket médio" value={money(stats.ticket)} />
        <Kpi label="A receber (geral)" value={money(stats.due)} hint={`${receivable.length} sem baixa`} tone="warn" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <p className="mb-3 text-sm font-semibold">Receita por dia</p>
          {stats.revenue === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Sem recebimentos no período.</p>
          ) : (
            <div className="flex h-36 items-end gap-1">
              {days.map((d) => {
                const v = stats.byDay.get(isoDay(d)) ?? 0;
                return (
                  <div key={d.toISOString()} className="group relative flex h-full flex-1 flex-col justify-end" title={`${fmt(d, "dd/MM")}: ${money(v)}`}>
                    <div className="min-h-0.5 rounded-t bg-gold/80 transition group-hover:bg-gold" style={{ height: `${(v / maxDay) * 100}%` }} />
                    {days.length <= 14 && <span className="mt-1 text-center text-[10px] text-muted">{fmt(d, "dd")}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Breakdown title="Por forma de pagamento" rows={stats.byMethod} total={stats.revenue} />
        <Breakdown title="Por profissional" rows={stats.byPro} total={stats.revenue} />
        <Breakdown title="Despesas por categoria" rows={groupExpenses(expenses)} total={stats.spent} tone="bad" />
      </div>

      <div className="grid grid-cols-3 rounded-xl bg-surface p-1">
        {(
          [
            ["in", `Recebimentos (${payments.length})`],
            ["out", `Despesas (${expenses.length})`],
            ["due", `A receber (${receivable.length})`],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("rounded-lg px-1 py-2 text-xs font-semibold sm:text-sm", tab === k ? "bg-surface-2 text-ink" : "text-muted")}>
            {l}
          </button>
        ))}
      </div>

      {tab === "in" &&
        (payments.length === 0 ? (
          <Empty title="Nenhum recebimento no período" />
        ) : (
          <Card className="divide-y divide-line p-0">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.client?.full_name || "Cliente"} · {payTitle(p)}
                  </p>
                  <p className="text-xs text-muted">
                    {fmt(p.paid_at!, "dd/MM HH:mm")} · {p.method ? METHOD_LABEL[p.method] : "—"} · {p.provider === "manual" ? "Baixa manual" : "Online"}
                  </p>
                </div>
                <span className="font-semibold text-ok">{money(p.amount)}</span>
              </div>
            ))}
          </Card>
        ))}

      {tab === "out" &&
        (expenses.length === 0 ? (
          <Empty title="Nenhuma despesa no período" action={<Button onClick={() => setExpOpen(true)}>Registrar despesa</Button>} />
        ) : (
          <Card className="divide-y divide-line p-0">
            {expenses.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.description}</p>
                  <p className="text-xs text-muted">
                    {fmt(e.expense_date + "T12:00", "dd/MM/yyyy")} · {e.category}
                  </p>
                </div>
                <span className="font-semibold text-bad">-{money(e.amount)}</span>
                <button onClick={() => delExpense(e.id)} className="rounded-lg p-1.5 text-muted hover:text-bad" aria-label="Excluir">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </Card>
        ))}

      {tab === "due" &&
        (receivable.length === 0 ? (
          <Empty title="Tudo em dia!" text="Nenhum atendimento passado sem baixa." />
        ) : (
          <Card className="divide-y divide-line p-0">
            {receivable.map((a) => (
              <button key={a.id} onClick={() => setOpen(a)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {clientName(a)} · {a.service_name}
                  </p>
                  <p className="text-xs text-muted">
                    {fmt(a.starts_at, "dd/MM HH:mm")} · {a.professional?.name}
                  </p>
                </div>
                <span className="font-semibold text-warn">{money(a.price)}</span>
                <span className="rounded-lg bg-gold/15 px-2 py-1 text-xs font-semibold text-gold">Dar baixa</span>
              </button>
            ))}
          </Card>
        ))}

      <Modal open={expOpen} onClose={() => setExpOpen(false)} title="Nova despesa" footer={<Button className="w-full" onClick={addExpense}>Salvar</Button>}>
        <div className="space-y-4">
          <Input label="Descrição" value={exp.description} onChange={(e) => setExp({ ...exp, description: e.target.value })} placeholder="Ex.: Pomadas, aluguel de novembro" />
          <Select label="Categoria" value={exp.category} onChange={(e) => setExp({ ...exp, category: e.target.value })}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Valor (R$)" inputMode="decimal" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value.replace(/[^\d,.]/g, "") })} />
            <Input label="Data" type="date" value={exp.date} onChange={(e) => setExp({ ...exp, date: e.target.value })} />
          </div>
        </div>
      </Modal>

      <ApptModal appt={open} onClose={() => setOpen(null)} onChanged={load} />
    </div>
  );
}

function groupExpenses(list: Expense[]) {
  const m = new Map<string, number>();
  list.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + Number(e.amount)));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Breakdown({ title, rows, total, tone = "gold" }: { title: string; rows: [string, number][]; total: number; tone?: "gold" | "bad" }) {
  return (
    <Card>
      <p className="mb-3 text-sm font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Sem dados.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map(([k, v]) => (
            <li key={k}>
              <div className="mb-1 flex justify-between text-sm">
                <span>{k}</span>
                <span className="tabular-nums">
                  {money(v)} <span className="text-xs text-muted">({total ? Math.round((v / total) * 100) : 0}%)</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2">
                <div className={cx("h-full rounded-full", tone === "bad" ? "bg-bad/70" : "bg-gold")} style={{ width: `${total ? (v / total) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
