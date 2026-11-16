import { useEffect, useState } from "react";
import { supabase, errMsg } from "../../lib/supabase";
import { maskPhone, WEEKDAYS } from "../../lib/format";
import { useShop } from "../../lib/useShop";
import type { BusinessHour, ShopSettings } from "../../lib/types";
import { Button, Card, cx, Input, PageLoader, SectionTitle, Textarea, Toggle, useToast } from "../../components/ui";

export default function SettingsPage() {
  const shop = useShop();
  const toast = useToast();
  const [s, setS] = useState<ShopSettings | null>(null);
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (shop.settings) setS({ ...shop.settings, whatsapp: maskPhone(shop.settings.whatsapp ?? "") });
    setHours(shop.hours.map((h) => ({ ...h, open_time: h.open_time.slice(0, 5), close_time: h.close_time.slice(0, 5), break_start: h.break_start?.slice(0, 5) ?? null, break_end: h.break_end?.slice(0, 5) ?? null })));
  }, [shop.settings, shop.hours]);

  if (shop.loading || !s) return <PageLoader />;

  const setH = (wd: number, patch: Partial<BusinessHour>) => setHours((hs) => hs.map((h) => (h.weekday === wd ? { ...h, ...patch } : h)));

  async function save() {
    for (const h of hours) {
      if (h.is_open && h.close_time <= h.open_time) return toast.error(`${WEEKDAYS[h.weekday]}: fechamento deve ser depois da abertura.`);
      if (!!h.break_start !== !!h.break_end) return toast.error(`${WEEKDAYS[h.weekday]}: preencha início e fim do intervalo.`);
    }
    setSaving(true);
    const { id: _id, ...rest } = s!;
    const r1 = await supabase
      .from("shop_settings")
      .update({ ...rest, about: rest.about || null, whatsapp: rest.whatsapp || null, instagram: rest.instagram || null, cover_url: rest.cover_url || null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    const r2 = await supabase.from("business_hours").upsert(hours.map((h) => ({ ...h, break_start: h.break_start || null, break_end: h.break_end || null })));
    setSaving(false);
    const err = r1.error || r2.error;
    if (err) return toast.error(errMsg(err));
    toast.success("Configurações salvas.");
    shop.reload();
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Ajustes</h1>
        <Button onClick={save} loading={saving}>
          Salvar alterações
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4">
          <SectionTitle>Barbearia</SectionTitle>
          <Input label="Nome" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
          <Textarea label="Sobre" value={s.about ?? ""} onChange={(e) => setS({ ...s, about: e.target.value })} placeholder="Conte um pouco sobre a Aura..." />
          <Input label="Endereço" value={s.address ?? ""} onChange={(e) => setS({ ...s, address: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="WhatsApp" type="tel" value={s.whatsapp ?? ""} onChange={(e) => setS({ ...s, whatsapp: maskPhone(e.target.value) })} />
            <Input label="Instagram" placeholder="@aurabarbearia" value={s.instagram ?? ""} onChange={(e) => setS({ ...s, instagram: e.target.value })} />
          </div>
          <Input label="Imagem de capa (URL)" value={s.cover_url ?? ""} onChange={(e) => setS({ ...s, cover_url: e.target.value })} hint="Deixe em branco para usar a capa padrão com a logo AURA." />
        </Card>

        <div className="space-y-5">
          <Card>
            <SectionTitle>Pagamentos</SectionTitle>
            <Toggle label="Pagamento online (PIX e cartão)" hint="Via Mercado Pago — requer o token configurado no Supabase" checked={s.online_payment_enabled} onChange={(v) => setS({ ...s, online_payment_enabled: v })} />
            <Toggle label="Permitir pagar na barbearia" checked={s.pay_at_shop_enabled} onChange={(v) => setS({ ...s, pay_at_shop_enabled: v })} />
          </Card>

          <Card className="space-y-4">
            <SectionTitle>Regras de agendamento</SectionTitle>
            <div className="grid grid-cols-3 gap-3">
              <Input label="Intervalo (min)" type="number" min={5} step={5} value={s.slot_interval_min} onChange={(e) => setS({ ...s, slot_interval_min: Number(e.target.value) })} />
              <Input label="Antecedência máx. (dias)" type="number" min={1} value={s.booking_window_days} onChange={(e) => setS({ ...s, booking_window_days: Number(e.target.value) })} />
              <Input label="Cancelar até (h antes)" type="number" min={0} value={s.min_cancel_hours} onChange={(e) => setS({ ...s, min_cancel_hours: Number(e.target.value) })} />
            </div>
          </Card>

          <Card>
            <SectionTitle>Comodidades</SectionTitle>
            {(
              [
                ["wifi", "Wi-Fi"],
                ["accessibility", "Acessibilidade"],
                ["parking", "Estacionamento"],
                ["kids", "Atende crianças"],
              ] as const
            ).map(([k, l]) => (
              <Toggle key={k} label={l} checked={!!s.amenities?.[k]} onChange={(v) => setS({ ...s, amenities: { ...s.amenities, [k]: v } })} />
            ))}
          </Card>
        </div>
      </div>

      <Card>
        <SectionTitle>Horário de funcionamento</SectionTitle>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => {
            const h = hours.find((x) => x.weekday === wd);
            if (!h) return null;
            return (
              <div key={wd} className="grid grid-cols-[92px_1fr] items-center gap-3 border-b border-line pb-3 last:border-0 sm:grid-cols-[110px_80px_1fr]">
                <span className="font-medium">{WEEKDAYS[wd]}</span>
                <button onClick={() => setH(wd, { is_open: !h.is_open })} className={cx("w-fit rounded-full px-3 py-1 text-xs font-semibold", h.is_open ? "bg-ok/15 text-ok" : "bg-surface-2 text-muted")}>
                  {h.is_open ? "Aberto" : "Fechado"}
                </button>
                {h.is_open && (
                  <div className="col-span-2 grid grid-cols-2 gap-2 sm:col-span-1 sm:grid-cols-4">
                    <TimeIn label="Abre" v={h.open_time} on={(v) => setH(wd, { open_time: v })} />
                    <TimeIn label="Fecha" v={h.close_time} on={(v) => setH(wd, { close_time: v })} />
                    <TimeIn label="Intervalo de" v={h.break_start ?? ""} on={(v) => setH(wd, { break_start: v || null })} />
                    <TimeIn label="até" v={h.break_end ?? ""} on={(v) => setH(wd, { break_end: v || null })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function TimeIn({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <input type="time" value={v} onChange={(e) => on(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-surface-2 px-2 text-sm outline-none focus:border-gold/60" />
    </label>
  );
}
