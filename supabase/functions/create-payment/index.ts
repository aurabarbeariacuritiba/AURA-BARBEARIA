// Cria um pagamento no Mercado Pago para um AGENDAMENTO ou MENSALIDADE de assinatura.
//  - method "pix"  -> gera QR Code PIX (copia e cola) via /v1/payments
//  - method "card" -> gera link do Checkout Pro (cartão de crédito ou débito)
// Body: { appointment_id, method } ou { subscription_id, method }
// Secrets necessários: MP_ACCESS_TOKEN, SITE_URL
import { createClient } from "npm:@supabase/supabase-js@2";

const MP_API = "https://api.mercadopago.com";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Formato exigido pelo MP: 2026-11-16T10:30:00.000-03:00
function brtIso(date: Date) {
  const d = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return d.toISOString().replace("Z", "-03:00");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
  const SITE_URL = (Deno.env.get("SITE_URL") ?? req.headers.get("origin") ?? "").replace(/\/$/, "");

  if (!MP_TOKEN) return json({ error: "Pagamento online ainda não configurado (MP_ACCESS_TOKEN)." }, 500);

  try {
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Faça login novamente." }, 401);

    const { appointment_id, subscription_id, method } = await req.json();
    if ((!appointment_id && !subscription_id) || !["pix", "card"].includes(method)) return json({ error: "Dados inválidos" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: settings } = await admin.from("shop_settings").select("online_payment_enabled, name").eq("id", 1).single();
    if (!settings?.online_payment_enabled) return json({ error: "Pagamento online desativado pela barbearia" }, 400);

    // ---- o que está sendo pago ----
    let amount: number;
    let title: string;
    let ref: { appointment_id?: string; subscription_id?: string };
    let backPath: string;

    if (subscription_id) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("id, client_id, status, plan:plans(name, price)")
        .eq("id", subscription_id)
        .maybeSingle();
      if (!sub || sub.client_id !== user.id) return json({ error: "Assinatura não encontrada" }, 404);
      if (sub.status === "cancelled") return json({ error: "Assinatura cancelada" }, 400);
      const plan = sub.plan as unknown as { name: string; price: number };
      amount = Number(plan.price);
      title = `${settings.name} - ${plan.name} (mensal)`;
      ref = { subscription_id: sub.id };
      backPath = "/#/assinatura?pagamento=";
    } else {
      const { data: appt } = await admin
        .from("appointments")
        .select("id, client_id, service_name, price, status, payment_status")
        .eq("id", appointment_id)
        .maybeSingle();
      if (!appt || appt.client_id !== user.id) return json({ error: "Agendamento não encontrado" }, 404);
      if (appt.status === "cancelled") return json({ error: "Agendamento cancelado" }, 400);
      if (appt.payment_status === "paid") return json({ error: "Este agendamento já está pago" }, 400);
      amount = Number(appt.price);
      title = `${settings.name} - ${appt.service_name}`;
      ref = { appointment_id: appt.id };
      backPath = "/#/meus-agendamentos?pagamento=";
    }

    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", user.id).single();
    const [firstName, ...rest] = (profile?.full_name ?? "Cliente").split(" ");

    // Reaproveita um PIX pendente ainda válido (evita gerar vários QR codes)
    if (method === "pix") {
      let q = admin
        .from("payments")
        .select("id, pix_qr_code, pix_qr_code_base64")
        .eq("status", "pending")
        .eq("method", "pix")
        .not("pix_qr_code", "is", null)
        .gte("created_at", new Date(Date.now() - 25 * 60 * 1000).toISOString());
      q = ref.subscription_id ? q.eq("subscription_id", ref.subscription_id) : q.eq("appointment_id", ref.appointment_id!);
      const { data: existing } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing) {
        return json({ payment_id: existing.id, pix: { qr_code: existing.pix_qr_code, qr_code_base64: existing.pix_qr_code_base64 } });
      }
    }

    const { data: pay, error: payErr } = await admin
      .from("payments")
      .insert({
        ...ref,
        client_id: user.id,
        amount,
        method: method === "pix" ? "pix" : null,
        status: "pending",
        provider: "mercadopago",
      })
      .select()
      .single();
    if (payErr) throw payErr;

    const notification_url = `${SUPABASE_URL}/functions/v1/mp-webhook`;

    if (method === "pix") {
      const res = await fetch(`${MP_API}/v1/payments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json", "X-Idempotency-Key": pay.id },
        body: JSON.stringify({
          transaction_amount: amount,
          description: title,
          payment_method_id: "pix",
          external_reference: pay.id,
          notification_url,
          date_of_expiration: brtIso(new Date(Date.now() + 30 * 60 * 1000)),
          payer: { email: user.email, first_name: firstName, last_name: rest.join(" ") || undefined },
        }),
      });
      const mp = await res.json();
      if (!res.ok) {
        await admin.from("payments").update({ status: "failed" }).eq("id", pay.id);
        console.error("MP pix error", mp);
        return json({ error: mp.message ?? "Erro ao gerar PIX" }, 502);
      }
      const td = mp.point_of_interaction?.transaction_data ?? {};
      await admin.from("payments").update({
        provider_payment_id: String(mp.id),
        pix_qr_code: td.qr_code,
        pix_qr_code_base64: td.qr_code_base64,
      }).eq("id", pay.id);
      if (ref.appointment_id) {
        await admin.from("appointments").update({ payment_status: "pending" }).eq("id", ref.appointment_id).eq("payment_status", "unpaid");
      }
      return json({ payment_id: pay.id, pix: { qr_code: td.qr_code, qr_code_base64: td.qr_code_base64 } });
    }

    // Cartão (crédito/débito) via Checkout Pro
    const back = `${SITE_URL}${backPath}`;
    const res = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: { Authorization: `Bearer ${MP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ id: ref.appointment_id ?? ref.subscription_id, title, quantity: 1, unit_price: amount, currency_id: "BRL" }],
        payer: { email: user.email, name: firstName, surname: rest.join(" ") || undefined },
        external_reference: pay.id,
        notification_url,
        back_urls: { success: back + "sucesso", pending: back + "pendente", failure: back + "falhou" },
        auto_return: "approved",
        statement_descriptor: "AURA BARBEARIA",
        payment_methods: {
          excluded_payment_types: [{ id: "ticket" }, { id: "bank_transfer" }, { id: "atm" }],
          installments: 1,
        },
        expires: true,
        expiration_date_to: brtIso(new Date(Date.now() + 2 * 60 * 60 * 1000)),
      }),
    });
    const pref = await res.json();
    if (!res.ok) {
      await admin.from("payments").update({ status: "failed" }).eq("id", pay.id);
      console.error("MP preference error", pref);
      return json({ error: pref.message ?? "Erro ao iniciar pagamento com cartão" }, 502);
    }
    await admin.from("payments").update({ provider_preference_id: pref.id, checkout_url: pref.init_point }).eq("id", pay.id);

    return json({ payment_id: pay.id, checkout_url: pref.init_point });
  } catch (e) {
    console.error(e);
    return json({ error: "Erro inesperado ao criar pagamento" }, 500);
  }
});
