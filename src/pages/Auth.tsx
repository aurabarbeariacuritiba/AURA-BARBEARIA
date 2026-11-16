import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, MailCheck } from "lucide-react";
import { supabase, errMsg, appUrl } from "../lib/supabase";
import { maskPhone } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Button, Input, useToast } from "../components/ui";

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-6">
      <Link to="/" className="mb-6 inline-flex w-fit items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Voltar
      </Link>
      <img src="./logo-aura.jpg" alt="Aura Barbearia" className="mb-8 aspect-[16/9] w-full rounded-3xl object-cover" />
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function Login() {
  const { session, profile, isStaff, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // equipe (admin/barbeiro) vai direto para o painel, se não veio de outra tela
  if (!authLoading && session && profile) return <Navigate to={params.get("voltar") || (isStaff ? "/admin" : "/")} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) return toast.error(errMsg(error));
    // o redirecionamento acontece no render, quando sessão e perfil carregarem
  }

  return (
    <AuthShell title="Entrar" subtitle="Acesse para agendar e acompanhar seus horários.">
      <form onSubmit={submit} className="space-y-4">
        <Input label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Senha" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="text-right">
          <Link to="/esqueci-senha" className="text-sm text-gold hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Entrar
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link to={`/cadastro${params.toString() ? `?${params}` : ""}`} className="font-semibold text-gold hover:underline">
          Cadastre-se
        </Link>
      </p>
    </AuthShell>
  );
}

export function Signup() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: k === "phone" ? maskPhone(e.target.value) : e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.name.trim().split(/\s+/).length < 2) return toast.error("Informe nome e sobrenome.");
    if (form.phone.replace(/\D/g, "").length < 10) return toast.error("Informe um telefone válido com DDD.");
    if (form.password.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { full_name: form.name.trim(), phone: form.phone }, emailRedirectTo: appUrl() },
    });
    setLoading(false);
    if (error) return toast.error(errMsg(error));
    if (data.session) {
      toast.success("Conta criada! Bem-vindo(a) à Aura.");
      navigate(params.get("voltar") || "/", { replace: true });
    } else {
      setSent(true);
    }
  }

  if (sent)
    return (
      <AuthShell title="Confirme seu e-mail">
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto size-14 text-gold" />
          <p className="text-muted">
            Enviamos um link de confirmação para <b className="text-ink">{form.email}</b>. Abra o e-mail e toque no link para ativar sua conta.
          </p>
          <Link to="/login">
            <Button variant="secondary" className="w-full">
              Ir para o login
            </Button>
          </Link>
        </div>
      </AuthShell>
    );

  return (
    <AuthShell title="Criar conta" subtitle="Leva menos de um minuto.">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Nome completo" autoComplete="name" required value={form.name} onChange={set("name")} />
        <Input label="E-mail" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        <Input label="Telefone / WhatsApp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(41) 99999-9999" required value={form.phone} onChange={set("phone")} />
        <Input label="Senha" type="password" autoComplete="new-password" required minLength={6} hint="Mínimo de 6 caracteres" value={form.password} onChange={set("password")} />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Criar conta
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link to={`/login${params.toString() ? `?${params}` : ""}`} className="font-semibold text-gold hover:underline">
          Entrar
        </Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
    setLoading(false);
    if (error) return toast.error(errMsg(error));
    setSent(true);
  }

  return (
    <AuthShell title="Recuperar senha" subtitle="Enviaremos um link para você criar uma nova senha.">
      {sent ? (
        <p className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          Se existir uma conta com <b className="text-ink">{email}</b>, você receberá um e-mail em instantes. Abra o link <b>neste mesmo aparelho</b>.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Input label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const navigate = useNavigate();
  const toast = useToast();
  const { session } = useAuth();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha deve ter pelo menos 6 caracteres.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Senha alterada com sucesso!");
    navigate("/", { replace: true });
  }

  return (
    <AuthShell title="Nova senha">
      {!session ? (
        <p className="text-sm text-muted">Link inválido ou expirado. Solicite um novo em “Esqueci minha senha”.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Input label="Nova senha" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" size="lg" className="w-full" loading={loading}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
