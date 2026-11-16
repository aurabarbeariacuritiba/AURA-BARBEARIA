import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && key);

export const supabase = createClient(url ?? "https://placeholder.supabase.co", key ?? "placeholder", {
  // PKCE: os links de e-mail voltam com ?code=..., compatível com o HashRouter
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
});

/** URL base do app (para links de e-mail) — sem o hash */
export const appUrl = () => window.location.origin + window.location.pathname;

/** Extrai uma mensagem amigável de erros do Supabase/Postgres. */
export function errMsg(e: unknown): string {
  if (!e) return "Erro desconhecido";
  const m = (e as { message?: string }).message ?? String(e);
  const map: Record<string, string> = {
    "Invalid login credentials": "E-mail ou senha incorretos.",
    "Email not confirmed": "Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).",
    "User already registered": "Este e-mail já está cadastrado.",
    "Password should be at least 6 characters.": "A senha deve ter pelo menos 6 caracteres.",
    "Failed to fetch": "Sem conexão com o servidor. Verifique sua internet.",
  };
  return map[m] ?? m;
}
