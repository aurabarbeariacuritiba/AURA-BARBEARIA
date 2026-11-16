import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { BarChart3, CalendarDays, CalendarPlus, Home, LayoutDashboard, LogOut, Scissors, Settings, User, Users, UserSquare2, Wallet, ArrowLeft } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { cx, PageLoader } from "./ui";

/* ---------- Guardas de rota ---------- */
export function RequireAuth({ staff, admin }: { staff?: boolean; admin?: boolean }) {
  const { session, profile, loading, isStaff, isAdmin } = useAuth();
  const loc = useLocation();
  if (loading || (session && !profile)) return <PageLoader />;
  if (!session) return <Navigate to={`/login?voltar=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  if (staff && !isStaff) return <Navigate to="/" replace />;
  return <Outlet />;
}

/* ---------- Área do cliente (barra inferior) ---------- */
export function ClientLayout() {
  const { session, isStaff } = useAuth();
  const items = [
    { to: "/", label: "Início", icon: Home, end: true },
    { to: "/agendar", label: "Agendar", icon: CalendarPlus },
    { to: "/meus-agendamentos", label: "Agenda", icon: CalendarDays },
    ...(isStaff ? [{ to: "/admin", label: "Gestão", icon: LayoutDashboard, end: false }] : []),
    { to: session ? "/perfil" : "/login", label: session ? "Perfil" : "Entrar", icon: User },
  ];
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-24">
      <Outlet />
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur-lg">
        <div className={cx("mx-auto grid max-w-xl", items.length === 5 ? "grid-cols-5" : "grid-cols-4")}>
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={label} to={to} end={end} className={({ isActive }) => cx("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition", isActive ? "text-gold" : "text-muted hover:text-ink")}>
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

/* ---------- Painel administrativo ---------- */
export function AdminLayout() {
  const { profile, isAdmin, signOut } = useAuth();
  const items = [
    { to: "/admin", label: "Painel", icon: LayoutDashboard, end: true, show: true },
    { to: "/admin/agenda", label: "Agenda", icon: CalendarDays, show: true },
    { to: "/admin/financeiro", label: "Financeiro", icon: Wallet, show: isAdmin },
    { to: "/admin/clientes", label: "Clientes", icon: Users, show: true },
    { to: "/admin/servicos", label: "Serviços", icon: Scissors, show: isAdmin },
    { to: "/admin/equipe", label: "Equipe", icon: UserSquare2, show: isAdmin },
    { to: "/admin/ajustes", label: "Ajustes", icon: Settings, show: isAdmin },
  ].filter((i) => i.show);

  return (
    <div className="min-h-dvh md:flex">
      {/* lateral (desktop) */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
        <div className="mb-6 px-2">
          <p className="font-display text-[10px] tracking-[0.35em] text-muted">BARBEARIA</p>
          <p className="aura-word font-display text-3xl leading-none font-bold">AURA</p>
          <p className="mt-1 text-xs text-muted">Painel de gestão</p>
        </div>
        <nav className="flex-1 space-y-1">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", isActive ? "bg-gold/15 text-gold" : "text-muted hover:bg-surface-2 hover:text-ink")}>
              <Icon className="size-4.5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="space-y-1 border-t border-line pt-3">
          <NavLink to="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink">
            <ArrowLeft className="size-4" /> Ver app do cliente
          </NavLink>
          <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink">
            <LogOut className="size-4" /> Sair
          </button>
          <p className="truncate px-3 pt-2 text-xs text-muted">{profile?.full_name}</p>
        </div>
      </aside>

      {/* topo (celular) */}
      <div className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-lg md:hidden">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-gold" />
            <span className="font-display text-lg font-semibold tracking-wide">AURA · Gestão</span>
          </div>
          <NavLink to="/" className="text-xs text-muted">
            App do cliente
          </NavLink>
        </div>
        <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2">
          {items.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx("flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium", isActive ? "bg-gold text-black" : "bg-surface-2 text-muted")}>
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** Cabeçalho simples para páginas internas do cliente */
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="px-4 pt-6 pb-4">
      <h1 className="text-2xl font-bold">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </header>
  );
}
