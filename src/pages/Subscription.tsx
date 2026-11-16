import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Check, Crown, Repeat, Scissors } from "lucide-react";
import { supabase, errMsg } from "../lib/supabase";
import { fmt, money } from "../lib/format";
import { useShop } from "../lib/useShop";
import { isActive, isExpired, useMySubscription, weekdaysLabel } from "../lib/subscription";
import type { Plan, Subscription } from "../lib/types";
import { PageHeader } from "../components/Layouts";
import { PaymentSheet } from "../components/PaymentSheet";
import { Badge, Button, Card, cx, Empty, Modal, PageLoader, useToast } from "../components/ui";

export default function SubscriptionPage() {
  const { sub, uses, loading, reload } = useMySubscription();
  const { services, settings } = useShop();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [paying, setPaying] = useState<Subscription | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => {
    supabase
      .from("plans")
      .select("*")
      .eq("active", true)
      .order("sort_order")
      .then(({ data }) => setPlans((data ?? []) as Plan[]));
  }, []);

  // retorno do Checkout do Mercado Pago
  useEffect(() => {
    const p = params.get("pagamento");
    if (!p) return;
    if (p === "sucesso") toast.success("Pagamento aprovado! Sua assinatura será ativada em instantes.");
    else if (p === "pendente") toast.success("Pagamento em processamento.");
    else toast.error("O pagamento não foi concluído. Tente novamente.");
    setParams({}, { replace: true });
    setTimeout(reload, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !plans) return <PageLoader />;

  const online = settings?.online_payment_enabled;
  const svcNames = (ids: string[]) => ids.map((id) => services.find((s) => s.id === id)?.name).filter(Boolean) as string[];

  async function choose(plan: Plan) {
    setBusy(plan.id);
    const { data, error } = await supabase.rpc("subscribe", { p_plan_id: plan.id });
    setBusy(null);
    if (error) return toast.error(errMsg(error));
    await reload();
    setShowPlans(false);
    if (online) setPaying({ ...(data as Subscription), plan });
    else toast.success("Plano escolhido! Pague a mensalidade na barbearia para ativar.");
  }

  async function cancel() {
    if (!sub) return;
    setBusy("cancel");
    const { error } = await supabase.rpc("cancel_subscription", { p_id: sub.id });
    setBusy(null);
    if (error) return toast.error(errMsg(error));
    toast.success("Assinatura cancelada.");
    setCancelOpen(false);
    reload();
  }

  const active = isActive(sub);
  const expired = isExpired(sub);
  const plan = sub?.plan;
  const daysLeft = sub?.current_period_end ? Math.ceil((new Date(sub.current_period_end).getTime() - Date.now()) / 86_400_000) : 0;

  return (
    <div>
      <PageHeader title="Assinatura" subtitle="Corte e barba em dia, pagando um valor fixo por mês." />
      <div className="space-y-5 px-4">
        {/* Assinatura atual */}
        {sub && plan && (
          <Card className={cx("space-y-4", active ? "border-gold/50 bg-gradient-to-br from-gold/15 to-surface" : "")}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-gold/20 text-gold">
                  <Crown className="size-5" />
                </span>
                <div>
                  <p className="text-xs text-muted">Seu plano</p>
                  <p className="text-lg leading-tight font-bold">{plan.name}</p>
                </div>
              </div>
              {active ? <Badge color="green">Ativa</Badge> : expired ? <Badge color="red">Vencida</Badge> : <Badge color="yellow">Aguardando pagamento</Badge>}
            </div>

            {active && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-black/20 p-3">
                  <p className="text-xs text-muted">Válida até</p>
                  <p className="font-semibold">{fmt(sub.current_period_end!, "dd/MM/yyyy")}</p>
                  <p className="text-[11px] text-muted">{daysLeft <= 1 ? "vence amanhã" : `${daysLeft} dias restantes`}</p>
                </div>
                <div className="rounded-xl bg-black/20 p-3">
                  <p className="text-xs text-muted">Usos neste período</p>
                  <p className="font-semibold">{plan.uses_per_period ? `${uses} de ${plan.uses_per_period}` : `${uses} · ilimitado`}</p>
                </div>
              </div>
            )}

            <ul className="space-y-1.5 text-sm">
              {svcNames(plan.service_ids).map((n) => (
                <li key={n} className="flex items-center gap-2">
                  <Check className="size-4 text-gold" /> {n}
                </li>
              ))}
              <li className="flex items-center gap-2 text-muted">
                <CalendarDays className="size-4" /> {weekdaysLabel(plan)}
              </li>
            </ul>

            {!active && (
              <p className="text-sm text-muted">
                {expired ? "Sua assinatura venceu. Renove para continuar agendando sem pagar por atendimento." : "Pague a primeira mensalidade para ativar."}{" "}
                {settings?.pay_at_shop_enabled !== false && "Você também pode pagar na barbearia."}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {active && (
                <Link to="/agendar" className="flex-1">
                  <Button className="w-full">
                    <Scissors className="size-4" /> Agendar
                  </Button>
                </Link>
              )}
              {online && (!active || daysLeft <= 7) && (
                <Button className="flex-1" variant={active ? "secondary" : "primary"} onClick={() => setPaying(sub)}>
                  <Repeat className="size-4" /> {active ? "Renovar" : `Pagar ${money(plan.price)}`}
                </Button>
              )}
            </div>
            <div className="flex justify-between text-xs">
              {!active && (
                <button className="text-gold" onClick={() => setShowPlans((v) => !v)}>
                  Trocar de plano
                </button>
              )}
              <button className="ml-auto text-muted hover:text-bad" onClick={() => setCancelOpen(true)}>
                Cancelar assinatura
              </button>
            </div>
          </Card>
        )}

        {/* Planos disponíveis */}
        {(!sub || showPlans) && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Planos</h2>
            {plans.length === 0 ? (
              <Empty title="Nenhum plano disponível no momento" />
            ) : (
              plans.map((p) => (
                <Card key={p.id} className={cx("space-y-3", sub?.plan_id === p.id && "border-gold")}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{p.name}</p>
                      {p.description && <p className="text-sm text-muted">{p.description}</p>}
                    </div>
                    <p className="shrink-0 text-right">
                      <span className="text-xl font-bold text-ok">{money(p.price)}</span>
                      <span className="block text-[11px] text-muted">por mês</span>
                    </p>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {svcNames(p.service_ids).map((n) => (
                      <li key={n} className="flex items-center gap-2">
                        <Check className="size-4 text-gold" /> {n}
                      </li>
                    ))}
                    <li className="flex items-center gap-2 text-muted">
                      <CalendarDays className="size-4" /> {weekdaysLabel(p)} · {p.uses_per_period ? `${p.uses_per_period} usos/mês` : "uso ilimitado"}
                    </li>
                  </ul>
                  <Button className="w-full" variant={sub?.plan_id === p.id ? "secondary" : "primary"} loading={busy === p.id} disabled={sub?.plan_id === p.id} onClick={() => choose(p)}>
                    {sub?.plan_id === p.id ? "Plano atual" : "Assinar"}
                  </Button>
                </Card>
              ))
            )}
          </section>
        )}
      </div>

      <PaymentSheet
        kind="subscription"
        appt={paying?.plan ? { id: paying.id, price: paying.plan.price, service_name: `${paying.plan.name} · mensal` } : null}
        open={!!paying}
        onClose={() => (setPaying(null), reload())}
        onPaid={reload}
      />

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar assinatura?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)}>
              Manter
            </Button>
            <Button variant="danger" className="flex-1" loading={busy === "cancel"} onClick={cancel}>
              Cancelar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">Você deixará de ter os atendimentos inclusos. Agendamentos já marcados com a assinatura continuam valendo.</p>
      </Modal>
    </div>
  );
}
