import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "../contexts/AuthContext";
import { WEEKDAYS } from "./format";
import type { Plan, Subscription } from "./types";

export const isActive = (s: Subscription | null | undefined) =>
  !!s && s.status === "active" && !!s.current_period_end && new Date(s.current_period_end) > new Date();

export const isExpired = (s: Subscription | null | undefined) =>
  !!s && s.status === "active" && !!s.current_period_end && new Date(s.current_period_end) <= new Date();

/** Texto dos dias permitidos do plano, ex.: "Terça e Quarta" */
export function weekdaysLabel(p: Pick<Plan, "allowed_weekdays">) {
  const d = p.allowed_weekdays;
  if (!d || d.length === 0 || d.length === 7) return "Todos os dias";
  const names = [...d].sort().map((x) => WEEKDAYS[x]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;
}

/** A assinatura cobre este serviço nesta data? (o banco confirma na hora de agendar) */
export function covers(sub: Subscription | null, serviceId: string, date?: Date | null, usesSoFar = 0) {
  if (!isActive(sub) || !sub!.plan) return false;
  const p = sub!.plan;
  if (!p.service_ids.includes(serviceId)) return false;
  if (date) {
    if (date < new Date(sub!.current_period_start!) || date >= new Date(sub!.current_period_end!)) return false;
    if (p.allowed_weekdays?.length && !p.allowed_weekdays.includes(date.getDay())) return false;
  }
  if (p.uses_per_period != null && usesSoFar >= p.uses_per_period) return false;
  return true;
}

/** Assinatura em aberto (pendente ou ativa) do cliente logado + usos no período atual */
export function useMySubscription() {
  const { session } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [uses, setUses] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) {
      setSub(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("subscriptions")
      .select("*, plan:plans(*)")
      .eq("client_id", session.user.id)
      .in("status", ["pending", "active"])
      .maybeSingle();
    const s = data as Subscription | null;
    setSub(s);
    if (s?.current_period_start && s.current_period_end) {
      const { count } = await supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("subscription_id", s.id)
        .in("status", ["pending", "confirmed", "completed"])
        .gte("starts_at", s.current_period_start)
        .lt("starts_at", s.current_period_end);
      setUses(count ?? 0);
    } else setUses(0);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  return { sub, uses, loading, reload: load };
}
