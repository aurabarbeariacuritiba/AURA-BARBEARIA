import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { endOfDay, startOfDay, startOfMonth } from "date-fns";
import { CalendarPlus, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { fmt, money } from "../../lib/format";
import { useAuth } from "../../contexts/AuthContext";
import { useShop } from "../../lib/useShop";
import type { Appointment } from "../../lib/types";
import { PayBadge, StatusBadge } from "../../components/StatusBadges";
import { Button, Card, Empty, PageLoader, SectionTitle } from "../../components/ui";
import { APPT_SELECT, ApptModal, clientName, Kpi, NewApptModal } from "./shared";

export default function Dashboard() {
  const { profile, isAdmin } = useAuth();
  const { services, professionals } = useShop();
  const [today, setToday] = useState<Appointment[] | null>(null);
  const [kpi, setKpi] = useState({ todayRevenue: 0, monthRevenue: 0, receivable: 0, receivableCount: 0, newClients: 0 });
  const [open, setOpen] = useState<Appointment | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [todayRef] = useState(() => new Date());

  const load = useCallback(async () => {
    const now = new Date();
    const [a, pToday, pMonth, rec, cli] = await Promise.all([
      supabase.from("appointments").select(APPT_SELECT).gte("starts_at", startOfDay(now).toISOString()).lte("starts_at", endOfDay(now).toISOString()).neq("status", "cancelled").order("starts_at"),
      isAdmin ? supabase.from("payments").select("amount").eq("status", "paid").gte("paid_at", startOfDay(now).toISOString()) : Promise.resolve({ data: [] }),
      isAdmin ? supabase.from("payments").select("amount").eq("status", "paid").gte("paid_at", startOfMonth(now).toISOString()) : Promise.resolve({ data: [] }),
      supabase.from("appointments").select("price").in("status", ["confirmed", "completed"]).neq("payment_status", "paid").lt("starts_at", now.toISOString()),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "client").gte("created_at", startOfMonth(now).toISOString()),
    ]);
    const sum = (rows: { amount?: number; price?: number }[] | null) => (rows ?? []).reduce((s, r) => s + Number(r.amount ?? r.price ?? 0), 0);
    setToday((a.data ?? []) as Appointment[]);
    setKpi({
      todayRevenue: sum(pToday.data as { amount: number }[]),
      monthRevenue: sum(pMonth.data as { amount: number }[]),
      receivable: sum(rec.data as { price: number }[]),
      receivableCount: rec.data?.length ?? 0,
      newClients: cli.count ?? 0,
    });
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  if (!today) return <PageLoader />;

  const next = today.filter((a) => new Date(a.ends_at) > new Date() && a.status !== "completed");
  const greeting = new Date().getHours() < 12 ? "Bom dia" : new Date().getHours() < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted capitalize">{fmt(new Date(), "EEEE, d 'de' MMMM")}</p>
          <h1 className="text-2xl font-bold">
            {greeting}, {profile?.full_name.split(" ")[0]}
          </h1>
        </div>
        <Button onClick={() => setNewOpen(true)}>
          <CalendarPlus className="size-4" /> Novo agendamento
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Atendimentos hoje" value={String(today.length)} hint={`${next.length} restantes`} />
        {isAdmin && <Kpi label="Recebido hoje" value={money(kpi.todayRevenue)} tone="ok" />}
        {isAdmin && <Kpi label="Recebido no mês" value={money(kpi.monthRevenue)} tone="gold" />}
        <Kpi label="A receber" value={money(kpi.receivable)} hint={`${kpi.receivableCount} atendimento(s) sem baixa`} tone="warn" />
        {!isAdmin && <Kpi label="Novos clientes (mês)" value={String(kpi.newClients)} />}
      </div>

      <section>
        <SectionTitle
          action={
            <Link to="/admin/agenda" className="flex items-center gap-1 text-sm font-semibold text-gold">
              Agenda completa <ChevronRight className="size-4" />
            </Link>
          }
        >
          Hoje
        </SectionTitle>
        {today.length === 0 ? (
          <Empty title="Nenhum agendamento para hoje" />
        ) : (
          <div className="space-y-2">
            {today.map((a) => (
              <Card key={a.id} onClick={() => setOpen(a)} className="flex items-center gap-4 py-3">
                <div className="w-14 shrink-0 text-center">
                  <p className="text-lg font-bold tabular-nums">{fmt(a.starts_at, "HH:mm")}</p>
                  <p className="text-[11px] text-muted">{fmt(a.ends_at, "HH:mm")}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{clientName(a)}</p>
                  <p className="truncate text-sm text-muted">
                    {a.service_name} · {a.professional?.name}
                  </p>
                </div>
                <div className="hidden flex-col items-end gap-1 sm:flex">
                  <StatusBadge s={a.status} />
                  <PayBadge s={a.payment_status} sub={!!a.subscription_id} />
                </div>
                <span className="text-sm font-semibold text-ok">{a.subscription_id ? "Assinatura" : money(a.price)}</span>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ApptModal appt={open} onClose={() => setOpen(null)} onChanged={load} />
      <NewApptModal open={newOpen} onClose={() => setNewOpen(false)} onSaved={load} services={services} professionals={professionals} defaultDay={todayRef} />
    </div>
  );
}
