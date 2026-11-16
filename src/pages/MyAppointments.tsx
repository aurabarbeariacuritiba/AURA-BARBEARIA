import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarX2, Clock, User } from "lucide-react";
import { supabase, errMsg } from "../lib/supabase";
import { fmt, money } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import type { Appointment, ShopSettings } from "../lib/types";
import { PageHeader } from "../components/Layouts";
import { PaymentSheet } from "../components/PaymentSheet";
import { PayBadge, StatusBadge } from "../components/StatusBadges";
import { Button, Card, cx, Empty, Modal, PageLoader, useToast } from "../components/ui";

export default function MyAppointments() {
  const { session } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState<Appointment[] | null>(null);
  const [settings, setSettings] = useState<Pick<ShopSettings, "online_payment_enabled" | "min_cancel_hours"> | null>(null);
  const [tab, setTab] = useState<"next" | "past">("next");
  const [paying, setPaying] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, s] = await Promise.all([
      supabase.from("appointments").select("*, professional:professionals(name)").eq("client_id", session!.user.id).order("starts_at", { ascending: false }).limit(200),
      supabase.from("shop_settings").select("online_payment_enabled, min_cancel_hours").eq("id", 1).single(),
    ]);
    setItems((a.data ?? []) as Appointment[]);
    setSettings(s.data);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  // retorno do Checkout do Mercado Pago
  useEffect(() => {
    const p = params.get("pagamento");
    if (!p) return;
    if (p === "sucesso") toast.success("Pagamento aprovado! Obrigado.");
    else if (p === "pendente") toast.success("Pagamento em processamento. Avisaremos quando for confirmado.");
    else toast.error("O pagamento não foi concluído. Tente novamente.");
    setParams({}, { replace: true });
    setTimeout(load, 2500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!items) return <PageLoader />;

  const now = Date.now();
  const upcoming = items.filter((a) => new Date(a.ends_at).getTime() >= now && ["pending", "confirmed"].includes(a.status)).reverse();
  const past = items.filter((a) => !upcoming.includes(a));
  const list = tab === "next" ? upcoming : past;

  async function doCancel() {
    if (!cancelling) return;
    setBusy(true);
    const { error } = await supabase.rpc("cancel_appointment", { p_id: cancelling.id });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Agendamento cancelado.");
    setCancelling(null);
    load();
  }

  return (
    <div>
      <PageHeader title="Meus agendamentos" />
      <div className="mx-4 mb-4 grid grid-cols-2 rounded-xl bg-surface p-1">
        {(
          [
            ["next", `Próximos (${upcoming.length})`],
            ["past", "Histórico"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cx("rounded-lg py-2 text-sm font-semibold transition", tab === k ? "bg-surface-2 text-ink" : "text-muted")}>
            {l}
          </button>
        ))}
      </div>

      <div className="space-y-3 px-4">
        {list.length === 0 ? (
          <Empty
            icon={<CalendarX2 className="size-8" />}
            title={tab === "next" ? "Nenhum horário marcado" : "Sem histórico ainda"}
            action={
              tab === "next" && (
                <Link to="/agendar">
                  <Button>Agendar agora</Button>
                </Link>
              )
            }
          />
        ) : (
          list.map((a) => {
            const canPay = settings?.online_payment_enabled && ["pending", "confirmed"].includes(a.status) && ["unpaid", "pending", "failed"].includes(a.payment_status);
            const canCancel = tab === "next" && new Date(a.starts_at).getTime() - now >= (settings?.min_cancel_hours ?? 0) * 3600_000;
            return (
              <Card key={a.id}>
                <div className="flex items-start gap-3">
                  <div className="w-14 shrink-0 rounded-xl bg-surface-2 py-2 text-center">
                    <p className="text-[11px] font-semibold text-muted uppercase">{fmt(a.starts_at, "MMM")}</p>
                    <p className="text-xl leading-tight font-bold">{fmt(a.starts_at, "dd")}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{a.service_name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted">
                      <span className="flex items-center gap-1 capitalize">
                        <Clock className="size-3.5" />
                        {fmt(a.starts_at, "EEE, HH:mm")}
                      </span>
                      {a.professional && (
                        <span className="flex items-center gap-1">
                          <User className="size-3.5" />
                          {a.professional.name}
                        </span>
                      )}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StatusBadge s={a.status} />
                      <PayBadge s={a.payment_status} />
                      <span className="ml-auto text-sm font-semibold text-ok">{money(a.price)}</span>
                    </div>
                  </div>
                </div>
                {(canPay || canCancel) && (
                  <div className="mt-3 flex gap-2 border-t border-line pt-3">
                    {canCancel && (
                      <Button size="sm" variant="ghost" className="flex-1 text-bad" onClick={() => setCancelling(a)}>
                        Cancelar
                      </Button>
                    )}
                    {canPay && (
                      <Button size="sm" className="flex-1" onClick={() => setPaying(a)}>
                        Pagar pelo app
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>

      <PaymentSheet appt={paying} open={!!paying} onClose={() => (setPaying(null), load())} onPaid={load} />

      <Modal
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        title="Cancelar agendamento?"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setCancelling(null)}>
              Manter
            </Button>
            <Button variant="danger" className="flex-1" loading={busy} onClick={doCancel}>
              Cancelar horário
            </Button>
          </div>
        }
      >
        {cancelling && (
          <p className="text-sm text-muted">
            {cancelling.service_name} em <span className="text-ink capitalize">{fmt(cancelling.starts_at, "EEEE, dd/MM 'às' HH:mm")}</span>.
            {cancelling.payment_status === "paid" && " Como você já pagou, a barbearia entrará em contato para o reembolso ou crédito."}
          </p>
        )}
      </Modal>
    </div>
  );
}
