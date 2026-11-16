import { useEffect, useState } from "react";
import { MessageCircle, Pencil, Search } from "lucide-react";
import { supabase, errMsg } from "../../lib/supabase";
import { fmt, initials, maskPhone, money, whatsappLink } from "../../lib/format";
import { useAuth } from "../../contexts/AuthContext";
import type { Appointment, Profile, Role } from "../../lib/types";
import { PayBadge, StatusBadge } from "../../components/StatusBadges";
import { Badge, Button, Card, Empty, Input, Modal, PageLoader, Select, useToast } from "../../components/ui";

const ROLE_LABEL: Record<Role, string> = { client: "Cliente", barber: "Barbeiro", admin: "Administrador" };

export default function Clients() {
  const { isAdmin, profile: me } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Profile[] | null>(null);
  const [sel, setSel] = useState<Profile | null>(null);
  const [history, setHistory] = useState<Appointment[] | null>(null);
  const [edit, setEdit] = useState<{ name: string; phone: string; email: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function openClient(p: Profile) {
    setEdit(null);
    setSel(p);
  }

  async function saveEdit() {
    if (!sel || !edit) return;
    if (!edit.name.trim()) return toast.error("Informe o nome.");
    const digits = edit.phone.replace(/\D/g, "");
    if (digits && digits.length < 10) return toast.error("Telefone inválido.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(edit.email.trim())) return toast.error("E-mail inválido.");
    const emailChanged = edit.email.trim().toLowerCase() !== (sel.email ?? "").toLowerCase();
    if (emailChanged && !confirm(`O e-mail de login do cliente passará a ser ${edit.email.trim().toLowerCase()}. Continuar?`)) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("admin_update_profile", { p_id: sel.id, p_full_name: edit.name, p_phone: edit.phone, p_email: edit.email });
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    const upd = { ...sel, ...(data as Profile) };
    setSel(upd);
    setList((l) => l?.map((x) => (x.id === upd.id ? upd : x)) ?? null);
    setEdit(null);
    toast.success("Dados do cliente atualizados.");
  }

  useEffect(() => {
    const t = setTimeout(async () => {
      let query = supabase.from("profiles").select("*").order("created_at", { ascending: false }).limit(300);
      const term = q.trim().replace(/[,()%*]/g, " ");
      if (term) query = query.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
      const { data } = await query;
      setList((data ?? []) as Profile[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!sel) return;
    setHistory(null);
    supabase
      .from("appointments")
      .select("*, professional:professionals(name)")
      .eq("client_id", sel.id)
      .order("starts_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setHistory((data ?? []) as Appointment[]));
  }, [sel]);

  async function changeRole(p: Profile, role: Role) {
    if (p.id === me?.id && role !== "admin" && !confirm("Você vai remover seu próprio acesso de administrador. Continuar?")) return;
    const { error } = await supabase.from("profiles").update({ role }).eq("id", p.id);
    if (error) return toast.error(errMsg(error));
    toast.success("Permissão atualizada.");
    setList((l) => l?.map((x) => (x.id === p.id ? { ...x, role } : x)) ?? null);
    setSel({ ...p, role });
  }

  const spent = (history ?? []).filter((a) => a.payment_status === "paid").reduce((s, a) => s + Number(a.price), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Clientes</h1>
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail" className="h-11 w-full rounded-xl border border-line bg-surface pr-3 pl-10 text-sm outline-none focus:border-gold/60" />
      </div>

      {!list ? (
        <PageLoader />
      ) : list.length === 0 ? (
        <Empty title="Nenhum cliente encontrado" />
      ) : (
        <Card className="divide-y divide-line p-0">
          {list.map((p) => (
            <button key={p.id} onClick={() => openClient(p)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gold/15 text-sm font-semibold text-gold">{initials(p.full_name || p.email || "")}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.full_name || "(sem nome)"}</span>
                <span className="block truncate text-xs text-muted">
                  {p.phone} · {p.email}
                </span>
              </span>
              {p.role !== "client" && <Badge color="gold">{ROLE_LABEL[p.role]}</Badge>}
            </button>
          ))}
        </Card>
      )}

      <Modal open={!!sel} onClose={() => { setSel(null); setEdit(null); }} title="Cliente" wide>
        {sel && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="grid size-14 place-items-center rounded-full bg-gold/15 text-lg font-semibold text-gold">{initials(sel.full_name)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{sel.full_name}</p>
                <p className="text-sm text-muted">
                  {sel.phone} · {sel.email}
                </p>
                <p className="text-xs text-muted">Cliente desde {fmt(sel.created_at, "dd/MM/yyyy")}</p>
              </div>
              <div className="flex gap-2">
                {whatsappLink(sel.phone) && (
                  <a href={whatsappLink(sel.phone)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-ok/15 px-3 py-1.5 text-sm font-semibold text-ok">
                    <MessageCircle className="size-4" /> WhatsApp
                  </a>
                )}
                {isAdmin && !edit && (
                  <button
                    onClick={() => setEdit({ name: sel.full_name ?? "", phone: maskPhone(sel.phone ?? ""), email: sel.email ?? "" })}
                    className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1.5 text-sm font-semibold text-gold"
                  >
                    <Pencil className="size-4" /> Editar
                  </button>
                )}
              </div>
            </div>

            {edit && (
              <div className="space-y-3 rounded-2xl border border-gold/30 bg-surface-2 p-4">
                <p className="text-sm font-semibold">Editar dados do cliente</p>
                <Input label="Nome completo" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                <Input label="Telefone / WhatsApp" type="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: maskPhone(e.target.value) })} />
                <Input
                  label="E-mail"
                  type="email"
                  value={edit.email}
                  onChange={(e) => setEdit({ ...edit, email: e.target.value })}
                  hint="É também o e-mail de login. Se mudar, o cliente passa a entrar com o novo e-mail (a senha continua a mesma)."
                />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEdit(null)} disabled={saving}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={saveEdit} loading={saving}>
                    Salvar
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface-2 p-3">
                <p className="text-xs text-muted">Atendimentos</p>
                <p className="text-xl font-bold">{history?.filter((a) => a.status === "completed").length ?? "…"}</p>
              </div>
              <div className="rounded-2xl bg-surface-2 p-3">
                <p className="text-xs text-muted">Total pago</p>
                <p className="text-xl font-bold text-ok">{money(spent)}</p>
              </div>
            </div>

            {isAdmin && (
              <Select label="Permissão de acesso" value={sel.role} onChange={(e) => changeRole(sel, e.target.value as Role)} hint="Barbeiro: vê a agenda e dá baixa. Administrador: acesso total, incluindo financeiro.">
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">Histórico</p>
              {!history ? (
                <PageLoader />
              ) : history.length === 0 ? (
                <p className="text-sm text-muted">Nenhum agendamento.</p>
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {history.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                      <span className="w-28 text-muted">{fmt(a.starts_at, "dd/MM/yy HH:mm")}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{a.service_name}</span>
                      <StatusBadge s={a.status} />
                      <PayBadge s={a.payment_status} sub={!!a.subscription_id} />
                      <span className="w-20 text-right">{a.subscription_id ? "Assinatura" : money(a.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
