// Recebe notificações do Mercado Pago e atualiza pagamento + agendamento.
// Deploy com verify_jwt = false (o MP não envia JWT do Supabase).
// A autenticidade é garantida consultando o pagamento direto na API do MP
// e, opcionalmente, validando a assinatura x-signature (MP_WEBHOOK_SECRET).
import { createClient } from "npm:@supabase/supabase-js@2";

const MP_API = "https://api.mercadopago.com";

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function validSignature(req: Request, dataId: string, secret: string) {
  const header = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
  return (await hmacHex(secret, manifest)) === parts.v1;
}

const METHOD_MAP: Record<string, string> = {
  credit_card: "credit_card",
  debit_card: "debit_card",
  prepaid_card: "debit_card",
  bank_transfer: "pix",
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* MP às vezes envia só query string */ }

  const type = body.type ?? body.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const dataId = String(url.searchParams.get("data.id") ?? body.data?.id ?? url.searchParams.get("id") ?? "");

  if (type !== "payment" || !dataId) return new Response("ignored", { status: 200 });

  const secret = Deno.env.get("MP_WEBHOOK_SECRET");
  if (secret && !(await validSignature(req, dataId, secret))) {
    console.warn("assinatura inválida", dataId);
    return new Response("invalid signature", { status: 401 });
  }

  const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
  const res = await fetch(`${MP_API}/v1/payments/${dataId}`, { headers: { Authorization: `Bearer ${MP_TOKEN}` } });
  if (!res.ok) {
    console.error("falha ao consultar pagamento", dataId, res.status);
    return new Response("lookup failed", { status: 200 });
  }
  const mp = await res.json();
  const paymentRowId = mp.external_reference;
  if (!paymentRowId) return new Response("no reference", { status: 200 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: row } = await admin.from("payments").select("id, appointment_id, subscription_id, amount, status").eq("id", paymentRowId).maybeSingle();
  if (!row) return new Response("unknown reference", { status: 200 });

  let status: "pending" | "paid" | "failed" | "refunded" = "pending";
  if (mp.status === "approved") status = "paid";
  else if (["rejected", "cancelled"].includes(mp.status)) status = "failed";
  else if (["refunded", "charged_back"].includes(mp.status)) status = "refunded";

  // Notificação repetida (mesmo status) ou atrasada (pago -> pendente/falho): ignora
  if (row.status === status || (row.status === "paid" && (status === "pending" || status === "failed"))) {
    return new Response("ok", { status: 200 });
  }

  await admin.from("payments").update({
    status,
    method: METHOD_MAP[mp.payment_type_id] ?? null,
    provider_payment_id: String(mp.id),
    paid_at: status === "paid" ? (mp.date_approved ?? new Date().toISOString()) : null,
    amount: mp.transaction_amount ?? row.amount,
  }).eq("id", row.id);

  if (row.appointment_id) {
    if (status === "paid") {
      await admin.from("appointments").update({ payment_status: "paid" }).eq("id", row.appointment_id);
    } else if (status === "refunded") {
      await admin.from("appointments").update({ payment_status: "refunded" }).eq("id", row.appointment_id);
    } else if (status === "failed") {
      await admin.from("appointments").update({ payment_status: "unpaid" })
        .eq("id", row.appointment_id).eq("payment_status", "pending");
    }
  }

  // Mensalidade de assinatura paga => ativa/renova por +1 mês
  if (row.subscription_id && status === "paid") {
    const { error } = await admin.rpc("apply_subscription_payment", { p_payment_id: row.id });
    if (error) console.error("apply_subscription_payment", error);
  }

  return new Response("ok", { status: 200 });
});
