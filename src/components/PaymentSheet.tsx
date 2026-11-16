import { useEffect, useState } from "react";
import { CheckCircle2, Copy, CreditCard, QrCode } from "lucide-react";
import { supabase, errMsg } from "../lib/supabase";
import { money } from "../lib/format";
import type { Appointment } from "../lib/types";
import { Button, Modal, Spinner, useToast } from "./ui";

type Step = "choose" | "pix" | "paid";

/** Pagamento online (agendamento ou mensalidade de assinatura): PIX (QR Code) ou cartão (Checkout Mercado Pago). */
export function PaymentSheet({
  appt,
  open,
  onClose,
  onPaid,
  kind = "appointment",
}: {
  appt: Pick<Appointment, "id" | "price" | "service_name"> | null;
  open: boolean;
  onClose: () => void;
  onPaid?: () => void;
  kind?: "appointment" | "subscription";
}) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("choose");
  const [loading, setLoading] = useState<"pix" | "card" | null>(null);
  const [pix, setPix] = useState<{ qr_code: string; qr_code_base64: string } | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep("choose");
      setPix(null);
    }
  }, [open, appt?.id]);

  // Enquanto o QR estiver na tela, verifica a cada 4s se o pagamento foi confirmado
  useEffect(() => {
    if (step !== "pix" || !paymentId) return;
    const id = setInterval(async () => {
      const { data } = await supabase.from("payments").select("status").eq("id", paymentId).single();
      if (data?.status === "paid") {
        setStep("paid");
        onPaid?.();
      }
    }, 4000);
    return () => clearInterval(id);
  }, [step, paymentId, onPaid]);

  async function start(method: "pix" | "card") {
    if (!appt) return;
    setLoading(method);
    try {
      const { data, error } = await supabase.functions.invoke("create-payment", {
        body: kind === "subscription" ? { subscription_id: appt.id, method } : { appointment_id: appt.id, method },
      });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        const body = ctx ? await ctx.json().catch(() => null) : null;
        throw new Error(body?.error ?? error.message);
      }
      if (method === "pix") {
        setPix(data.pix);
        setPaymentId(data.payment_id);
        setStep("pix");
      } else {
        window.location.href = data.checkout_url;
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={step === "paid" ? "Pagamento confirmado" : "Pagamento"}>
      {appt && step === "choose" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-surface-2 p-4">
            <p className="text-sm text-muted">{appt.service_name}</p>
            <p className="text-2xl font-bold text-ok">{money(appt.price)}</p>
          </div>
          <button onClick={() => start("pix")} disabled={!!loading} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface-2 p-4 text-left transition hover:border-gold/50 disabled:opacity-60">
            <span className="grid size-11 place-items-center rounded-xl bg-ok/15 text-ok">{loading === "pix" ? <Spinner className="size-5 text-ok" /> : <QrCode className="size-5" />}</span>
            <span className="flex-1">
              <span className="block font-semibold">PIX</span>
              <span className="block text-sm text-muted">Aprovação na hora</span>
            </span>
          </button>
          <button onClick={() => start("card")} disabled={!!loading} className="flex w-full items-center gap-4 rounded-2xl border border-line bg-surface-2 p-4 text-left transition hover:border-gold/50 disabled:opacity-60">
            <span className="grid size-11 place-items-center rounded-xl bg-info/15 text-info">{loading === "card" ? <Spinner className="size-5 text-info" /> : <CreditCard className="size-5" />}</span>
            <span className="flex-1">
              <span className="block font-semibold">Cartão de crédito ou débito</span>
              <span className="block text-sm text-muted">Ambiente seguro do Mercado Pago</span>
            </span>
          </button>
          <p className="text-center text-xs text-muted">Você também pode pagar na barbearia (dinheiro, cartão ou PIX).</p>
        </div>
      )}

      {step === "pix" && pix && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted">Abra o app do seu banco e escaneie o QR Code ou use o PIX copia e cola.</p>
          {pix.qr_code_base64 && <img src={`data:image/png;base64,${pix.qr_code_base64}`} alt="QR Code PIX" className="mx-auto size-56 rounded-2xl bg-white p-2" />}
          <div className="rounded-xl border border-line bg-surface-2 p-3 text-left font-mono text-[11px] break-all text-muted">{pix.qr_code}</div>
          <Button
            className="w-full"
            onClick={async () => {
              await navigator.clipboard.writeText(pix.qr_code);
              toast.success("Código PIX copiado!");
            }}
          >
            <Copy className="size-4" /> Copiar código PIX
          </Button>
          <div className="flex items-center justify-center gap-2 text-sm text-muted">
            <Spinner className="size-4" /> Aguardando confirmação do pagamento…
          </div>
          <p className="text-xs text-muted">O código expira em 30 minutos.</p>
        </div>
      )}

      {step === "paid" && (
        <div className="space-y-4 py-4 text-center">
          <CheckCircle2 className="mx-auto size-16 text-ok" />
          <p className="text-lg font-semibold">Pagamento recebido!</p>
          <p className="text-sm text-muted">{kind === "subscription" ? "Sua assinatura está ativa. Aproveite!" : "Seu horário está garantido. Até logo!"}</p>
          <Button className="w-full" onClick={onClose}>
            Fechar
          </Button>
        </div>
      )}
    </Modal>
  );
}
