import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { BusinessHour, Professional, Service, ShopSettings } from "./types";

export interface ShopData {
  settings: ShopSettings | null;
  hours: BusinessHour[];
  services: Service[];
  professionals: Professional[];
}

/** Dados públicos da barbearia (config, horários, serviços, profissionais). */
export function useShop(includeInactive = false) {
  const [data, setData] = useState<ShopData>({ settings: null, hours: [], services: [], professionals: [] });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      const svc = supabase.from("services").select("*").order("sort_order").order("name");
      const pro = supabase.from("professionals").select("*").order("sort_order").order("name");
      const [s, h, sv, p] = await Promise.all([
        supabase.from("shop_settings").select("*").eq("id", 1).maybeSingle(),
        supabase.from("business_hours").select("*").order("weekday"),
        includeInactive ? svc : svc.eq("active", true),
        includeInactive ? pro : pro.eq("active", true),
      ]);
      if (!alive) return;
      setData({
        settings: s.data as ShopSettings | null,
        hours: (h.data ?? []) as BusinessHour[],
        services: (sv.data ?? []) as Service[],
        professionals: (p.data ?? []) as Professional[],
      });
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [includeInactive, tick]);

  return { ...data, loading, reload: () => setTick((t) => t + 1) };
}
