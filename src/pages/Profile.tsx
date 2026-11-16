import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, KeyRound, LogOut, Settings2 } from "lucide-react";
import { supabase, errMsg } from "../lib/supabase";
import { initials, maskPhone } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { PageHeader } from "../components/Layouts";
import { Button, Card, Input, Modal, useToast } from "../components/ui";

export default function Profile() {
  const { profile, isStaff, refreshProfile, signOut } = useAuth();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");

  useEffect(() => {
    setName(profile?.full_name ?? "");
    setPhone(maskPhone(profile?.phone ?? ""));
  }, [profile]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    if (phone.replace(/\D/g, "").length < 10) return toast.error("Telefone inválido.");
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: name.trim(), phone }).eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    await refreshProfile();
    toast.success("Dados atualizados.");
  }

  async function changePw() {
    if (pw.length < 6) return toast.error("Mínimo de 6 caracteres.");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(errMsg(error));
    toast.success("Senha alterada.");
    setPw("");
    setPwOpen(false);
  }

  return (
    <div>
      <PageHeader title="Meu perfil" />
      <div className="space-y-4 px-4">
        <div className="flex items-center gap-4">
          <div className="grid size-16 place-items-center rounded-full bg-gold/15 font-display text-2xl text-gold">{initials(profile?.full_name ?? "")}</div>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{profile?.full_name}</p>
            <p className="truncate text-sm text-muted">{profile?.email}</p>
          </div>
        </div>

        {isStaff && (
          <Link to="/admin">
            <Card className="flex items-center gap-3 border-gold/40 bg-gold/10">
              <Settings2 className="size-5 text-gold" />
              <span className="flex-1 font-semibold">Painel de gestão</span>
              <ChevronRight className="size-4 text-muted" />
            </Card>
          </Link>
        )}

        <Card>
          <form onSubmit={save} className="space-y-4">
            <Input label="Nome completo" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Telefone / WhatsApp" type="tel" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} required />
            <Input label="E-mail" value={profile?.email ?? ""} disabled />
            <Button type="submit" className="w-full" loading={saving}>
              Salvar
            </Button>
          </form>
        </Card>

        <Card className="divide-y divide-line p-0">
          <button onClick={() => setPwOpen(true)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <KeyRound className="size-4.5 text-muted" /> <span className="flex-1">Alterar senha</span> <ChevronRight className="size-4 text-muted" />
          </button>
          <button onClick={signOut} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-bad">
            <LogOut className="size-4.5" /> <span className="flex-1">Sair</span>
          </button>
        </Card>
      </div>

      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Alterar senha" footer={<Button className="w-full" onClick={changePw}>Salvar nova senha</Button>}>
        <Input label="Nova senha" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Modal>
    </div>
  );
}
