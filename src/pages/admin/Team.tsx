import { useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { supabase, errMsg } from "../../lib/supabase";
import { initials } from "../../lib/format";
import { useShop } from "../../lib/useShop";
import type { Professional, Profile } from "../../lib/types";
import { Badge, Button, Card, Input, Modal, PageLoader, Select, Textarea, Toggle, useToast } from "../../components/ui";

type Draft = Omit<Professional, "id" | "sort_order"> & { id?: string; sort_order: string };
const empty: Draft = { name: "", bio: "", photo_url: "", profile_id: null, active: true, sort_order: "0" };

export default function Team() {
  const { professionals, loading, reload } = useShop(true);
  const toast = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [staff, setStaff] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .in("role", ["barber", "admin"])
      .order("full_name")
      .then(({ data }) => setStaff((data ?? []) as Profile[]));
  }, []);

  if (loading) return <PageLoader />;

  async function save() {
    if (!draft || !draft.name.trim()) return toast.error("Informe o nome.");
    setSaving(true);
    const row = {
      name: draft.name.trim(),
      bio: draft.bio?.trim() || null,
      photo_url: draft.photo_url?.trim() || null,
      profile_id: draft.profile_id || null,
      active: draft.active,
      sort_order: parseInt(draft.sort_order) || 0,
    };
    const { error } = draft.id ? await supabase.from("professionals").update(row).eq("id", draft.id) : await supabase.from("professionals").insert(row);
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Profissional salvo.");
    setDraft(null);
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Equipe</h1>
        <Button size="sm" onClick={() => setDraft({ ...empty, sort_order: String(professionals.length + 1) })}>
          <Plus className="size-4" /> Novo profissional
        </Button>
      </div>
      <p className="text-sm text-muted">Para um barbeiro acessar a agenda pelo app, peça que ele crie uma conta e mude a permissão dele para “Barbeiro” em Clientes.</p>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {professionals.map((p) => (
          <Card
            key={p.id}
            onClick={() => setDraft({ ...p, bio: p.bio ?? "", photo_url: p.photo_url ?? "", sort_order: String(p.sort_order) })}
            className={`flex items-center gap-3 ${p.active ? "" : "opacity-55"}`}
          >
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-gold/15 font-display text-gold">
              {p.photo_url ? <img src={p.photo_url} alt="" className="size-full object-cover" /> : initials(p.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.name}</span>
              <span className="block truncate text-xs text-muted">{p.bio || "—"}</span>
            </span>
            {!p.active ? <Badge>Inativo</Badge> : <Pencil className="size-4 text-muted" />}
          </Card>
        ))}
      </div>

      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.id ? "Editar profissional" : "Novo profissional"} footer={<Button className="w-full" loading={saving} onClick={save}>Salvar</Button>}>
        {draft && (
          <div className="space-y-4">
            <Input label="Nome" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Textarea label="Bio / especialidades" value={draft.bio ?? ""} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
            <Input label="Foto (URL)" value={draft.photo_url ?? ""} onChange={(e) => setDraft({ ...draft, photo_url: e.target.value })} />
            <Select label="Conta vinculada (opcional)" value={draft.profile_id ?? ""} onChange={(e) => setDraft({ ...draft, profile_id: e.target.value || null })}>
              <option value="">Nenhuma</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.email})
                </option>
              ))}
            </Select>
            <Input label="Ordem de exibição" type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })} />
            <Toggle label="Ativo (aparece para agendamento)" checked={draft.active} onChange={(v) => setDraft({ ...draft, active: v })} />
          </div>
        )}
      </Modal>
    </div>
  );
}
