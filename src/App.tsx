import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { supabase, isConfigured } from "./lib/supabase";
import { AdminLayout, ClientLayout, RequireAuth } from "./components/Layouts";
import Home from "./pages/Home";
import { Login, Signup, ForgotPassword, ResetPassword } from "./pages/Auth";
import Book from "./pages/Book";
import MyAppointments from "./pages/MyAppointments";
import Profile from "./pages/Profile";
import SubscriptionPage from "./pages/Subscription";
import Subscriptions from "./pages/admin/Subscriptions";
import Dashboard from "./pages/admin/Dashboard";
import Agenda from "./pages/admin/Agenda";
import Finance from "./pages/admin/Finance";
import Clients from "./pages/admin/Clients";
import Services from "./pages/admin/Services";
import Team from "./pages/admin/Team";
import SettingsPage from "./pages/admin/Settings";

export default function App() {
  const navigate = useNavigate();

  // Link de "esqueci minha senha" volta para o app -> abre a tela de nova senha
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") navigate("/nova-senha");
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-lg p-6 pt-16">
        <h1 className="mb-3 text-2xl font-bold">Configuração pendente</h1>
        <p className="text-muted">
          Crie o arquivo <code className="text-gold">.env</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja o
          README).
        </p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/cadastro" element={<Signup />} />
      <Route path="/esqueci-senha" element={<ForgotPassword />} />
      <Route path="/nova-senha" element={<ResetPassword />} />

      <Route element={<ClientLayout />}>
        <Route index element={<Home />} />
        <Route element={<RequireAuth />}>
          <Route path="/agendar" element={<Book />} />
          <Route path="/meus-agendamentos" element={<MyAppointments />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/assinatura" element={<SubscriptionPage />} />
        </Route>
      </Route>

      <Route path="/admin" element={<RequireAuth staff />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="clientes" element={<Clients />} />
          <Route path="assinaturas" element={<Subscriptions />} />
          <Route element={<RequireAuth admin />}>
            <Route path="financeiro" element={<Finance />} />
            <Route path="servicos" element={<Services />} />
            <Route path="equipe" element={<Team />} />
            <Route path="ajustes" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
