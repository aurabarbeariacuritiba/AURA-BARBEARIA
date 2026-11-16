import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ApptStatus, PayMethod, PayStatus } from "./types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const money = (v: number | string | null | undefined) => brl.format(Number(v ?? 0));

export const fmt = (d: Date | string, pattern: string) =>
  format(typeof d === "string" ? new Date(d) : d, pattern, { locale: ptBR });

export const duration = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}min` : ""}`;

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const STATUS_LABEL: Record<ApptStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

export const PAY_STATUS_LABEL: Record<PayStatus, string> = {
  unpaid: "A pagar",
  pending: "Aguardando pagamento",
  paid: "Pago",
  failed: "Falhou",
  refunded: "Estornado",
};

export const METHOD_LABEL: Record<PayMethod, string> = {
  pix: "PIX",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
};

/** (41) 99999-9999 */
export function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function whatsappLink(phone: string | null | undefined, text?: string) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.length <= 11) d = "55" + d;
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

/** "YYYY-MM-DD" no fuso local */
export const isoDay = (d: Date) => format(d, "yyyy-MM-dd");
