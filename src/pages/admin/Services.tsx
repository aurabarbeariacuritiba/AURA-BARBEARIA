import { useState } from "react";
import { Clock, Pencil, Plus } from "lucide-react";
import { supabase, errMsg } from "../../lib/supabase";
import { duration, money } from "../../lib/format";
import { useShop } from "../../lib/useShop";
import type { Service } from "../../lib/types";
import { Badge, Button, Card, Input, Modal, PageLoader, Textarea, Toggle, useToast } from "../../components/ui";

type Draft = Omit<Service, "id" | "price" | "duration_min" | "sort_order"> & { id?: string; price: string; duration_min: string; sort_order: string };
const empty: Draft = { name: "", description: "", price: "", duration_min: "30", image_url: "", active: true, sort_order: "0" };

export default function Services() {
  const { services, loading, reload } = useShop(true);
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  if (loading) return <PageLoader />;

  const edit = (s: Service) =>
    setDraft({ ...s, price: String(s.price).replace(".", ","), duration_min: String(s.duration_min), sort_order: String(s.sort_order), description: s.description ?? "", image_url: s.image_url ?? "" });

  async function save() {
    if (!draft) return;
    const price = Number(draft.price.replace(/\./g, "").replace(",", "."));
    const dur = parseInt(draft.duration_min);
    if (!draft.name.trim() || !Number.isFinite(price) || price < 0 || !(dur >= 5)) return toast.error("Preencha nome, preço e duração (mín. 5 min).");
    setSaving(true);
    const row = {
      name: draft.name.trim(),
      description: draft.description?.trim() || null,
      price,
      duration_min: dur,
      image_url: draft.image_url?.trim() || null,
      active: draft.active,
      sort_order: parseInt(draft.sort_order) || 0,
    };
    const { error } = draft.id ? await supabase.from("services").update(row).eq("id", draft.id) : await supabase.from("services").insert(row);
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Serviço salvo.");
    setDraft(null);
    reload();
  }

  async function remove() {
    if (!draft?.id || !confirm("Excluir este serviço? (Prefira desativar para manter o histórico organizado.)")) return;
    const { error } = await supabase.from("services").delete().eq("id", draft.id);
    if (error) return toast.error(errMsg(error));
    setDraft(null);
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Serviços</h1>
        <Button size="sm" onClick={() => setDraft({ ...empty, sort_order: String(services.length + 1) })}>
          <Plus className="size-4" /> Novo serviço
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {services.map((s) => (
          <Card key={s.id} onClick={() => edit(s)} className={s.active ? "" : "opacity-55"}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{s.name}</p>
              <Pencil className="size-4 shrink-0 text-muted" />
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm">
              <span className="font-semibold text-ok">{money(s.price)}</span>
              <span className="flex items-center gap-1 text-muted">
                <Clock className="size-3.5" /> {duration(s.duration_min)}
              </span>
              {!s.active && <Badge>Inativo</Badge>}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? "Editar serviço" : "Novo serviço"}
        footer={
          <div className="flex gap-2">
            {draft?.id && (
              <Button variant="danger" onClick={remove}>
                Excluir
              </Button>
            )}
            <Button className="flex-1" loading={saving} onClick={save}>
              Salvar
            </Button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Input label="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Textarea label="Descrição (opcional)" value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Preço (R$)" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value.replace(/[^\d,.]/g, "") })} />
              <Input label="Duração (min)" type="number" min={5} step={5} value={draft.duration_min} onChange={(e) => setDraft({ ...draft, duration_min: e.target.value })} />
            </div>
            <Input label="Imagem (URL, opcional)" value={draft.image_url ?? ""} onChange={(e) => setDraft({ ...draft, image_url: e.target.value })} />
            <Input label="Ordem de exibição" type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
            <Toggle label="Disponível para agendamento" checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
