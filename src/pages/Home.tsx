import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Accessibility, Baby, Car, ChevronRight, Camera, Clock, Crown, MapPin, MessageCircle, Search, Settings2, Wifi } from "lucide-react";
import { useShop } from "../lib/useShop";
import { duration, money, WEEKDAYS, whatsappLink, initials } from "../lib/format";
import { useAuth } from "../contexts/AuthContext";
import { Button, cx, Empty, PageLoader } from "../components/ui";

type Tab = "servicos" | "detalhes" | "profissionais";

export default function Home() {
  const { settings, hours, services, professionals, loading } = useShop();
  const { isStaff } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("servicos");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    if (!t) return services;
    return services.filter((s) => s.name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(t));
  }, [q, services]);

  if (loading) return <PageLoader />;

  const mapsUrl = settings?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(settings.address)}` : null;
  const wa = whatsappLink(settings?.whatsapp, "Olá! Vim pelo app da Aura Barbearia.");

  return (
    <div>
      {/* Capa */}
      <header className="relative">
        <div className="relative aspect-[16/9] overflow-hidden">
          <img src={settings?.cover_url || "./logo-aura.jpg"} alt="Aura Barbearia" className="size-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-b from-transparent to-bg" />
        </div>
        {isStaff && (
          <Link to="/admin" className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-4 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold backdrop-blur">
            <Settings2 className="size-3.5" /> Gestão
          </Link>
        )}
        <div className="relative -mt-4 px-5 pb-5">
          <h1 className="text-2xl font-bold">{settings?.name ?? "Aura Barbearia"}</h1>
          {settings?.address && (
            <a href={mapsUrl ?? undefined} target="_blank" rel="noreferrer" className="mt-1 flex items-start gap-1.5 text-sm text-ink/80">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span className="line-clamp-2">{settings.address}</span>
            </a>
          )}
        </div>
      </header>

      {/* Abas */}
      <div className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="flex px-2">
          {(
            [
              ["servicos", "Serviços"],
              ["detalhes", "Detalhes"],
              ["profissionais", "Profissionais"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={cx("relative flex-1 py-3.5 text-sm font-semibold tracking-wide uppercase transition", tab === k ? "text-ink" : "text-muted")}>
              {label}
              {tab === k && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-gold" />}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4">
        {tab === "servicos" && (
          <>
            <Link to="/assinatura" className="mb-3 flex items-center gap-3 rounded-2xl border border-gold/40 bg-gradient-to-r from-gold/15 to-surface p-4">
              <Crown className="size-6 shrink-0 text-gold" />
              <span className="flex-1">
                <span className="block font-semibold">Assinatura Aura</span>
                <span className="block text-sm text-muted">Corte e barba o mês todo por um valor fixo</span>
              </span>
              <ChevronRight className="size-5 text-gold" />
            </Link>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pesquisar serviço..." className="h-12 w-full rounded-2xl border border-line bg-surface pr-4 pl-10 text-[15px] outline-none focus:border-gold/60" />
            </div>
            {filtered.length === 0 ? (
              <Empty title="Nenhum serviço encontrado" />
            ) : (
              <ul className="divide-y divide-line">
                {filtered.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-4">
                    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-2">
                      {s.image_url ? <img src={s.image_url} alt="" className="size-full object-cover" /> : <span className="font-display text-sm text-gold">{initials(s.name)}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{s.name}</p>
                      {s.description && <p className="line-clamp-1 text-xs text-muted">{s.description}</p>}
                      <div className="mt-1 flex items-center gap-4 text-sm">
                        <span className="font-semibold text-ok">{money(s.price)}</span>
                        <span className="flex items-center gap-1 text-muted">
                          <Clock className="size-3.5" /> {duration(s.duration_min)}
                        </span>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => navigate(`/agendar?servico=${s.id}`)}>
                      Agendar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {tab === "detalhes" && (
          <div className="divide-y divide-line">
            <section className="pb-5">
              <h2 className="mb-2 text-lg font-bold">Sobre</h2>
              <p className="text-sm whitespace-pre-line text-muted">{settings?.about || "Cortes clássicos e modernos, barba e cuidados masculinos em um ambiente pensado para você."}</p>
            </section>

            <section className="py-5">
              <h2 className="mb-3 text-lg font-bold">Comodidades</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["wifi", "Wi-Fi", Wifi],
                    ["accessibility", "Acessibilidade", Accessibility],
                    ["parking", "Estacionamento", Car],
                    ["kids", "Atende crianças", Baby],
                  ] as const
                ).map(([k, label, Icon]) => {
                  const on = settings?.amenities?.[k];
                  return (
                    <div key={k} className={cx("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm", on ? "border-gold/30 bg-gold/10 text-ink" : "border-line text-muted/60 line-through")}>
                      <Icon className="size-4 shrink-0" /> {label}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="py-5">
              <h2 className="mb-3 text-lg font-bold">Horário de atendimento</h2>
              <ul className="space-y-1.5 text-sm">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                  const h = hours.find((x) => x.weekday === d);
                  const today = new Date().getDay() === d;
                  return (
                    <li key={d} className={cx("flex justify-between", today ? "font-semibold text-ink" : "text-muted")}>
                      <span>{WEEKDAYS[d]}</span>
                      <span>
                        {h?.is_open
                          ? `${h.open_time.slice(0, 5)} – ${h.close_time.slice(0, 5)}${h.break_start ? ` (intervalo ${h.break_start.slice(0, 5)}–${h.break_end?.slice(0, 5)})` : ""}`
                          : "Fechado"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {settings?.address && (
              <section className="py-5">
                <h2 className="mb-2 text-lg font-bold">Endereço</h2>
                <p className="text-sm text-muted">{settings.address}</p>
                {mapsUrl && (
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-gold">
                    Abrir no mapa <ChevronRight className="size-4" />
                  </a>
                )}
              </section>
            )}

            <section className="py-5">
              <h2 className="mb-3 text-lg font-bold">Formas de pagamento</h2>
              <div className="flex flex-wrap gap-2">
                {["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "PIX"].map((m) => (
                  <span key={m} className="rounded-full bg-surface-2 px-3.5 py-1.5 text-sm">
                    {m}
                  </span>
                ))}
              </div>
              {settings?.online_payment_enabled && <p className="mt-2 text-xs text-muted">Pague pelo app com PIX ou cartão, ou na barbearia.</p>}
            </section>

            {(wa || settings?.instagram) && (
              <section className="pt-5">
                <h2 className="mb-2 text-lg font-bold">Redes sociais</h2>
                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer" className="flex items-center gap-4 py-3">
                    <MessageCircle className="size-5" /> <span className="flex-1">WhatsApp</span> <ChevronRight className="size-4 text-muted" />
                  </a>
                )}
                {settings?.instagram && (
                  <a href={`https://instagram.com/${settings.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="flex items-center gap-4 py-3">
                    <Camera className="size-5" /> <span className="flex-1">Instagram</span> <ChevronRight className="size-4 text-muted" />
                  </a>
                )}
              </section>
            )}
          </div>
        )}

        {tab === "profissionais" &&
          (professionals.length === 0 ? (
            <Empty title="Nenhum profissional cadastrado" />
          ) : (
            <ul className="divide-y divide-line">
              {professionals.map((p) => (
                <li key={p.id} className="flex items-center gap-4 py-4">
                  <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface-2">
                    {p.photo_url ? <img src={p.photo_url} alt={p.name} className="size-full object-cover" /> : <span className="font-display text-lg text-gold">{initials(p.name)}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.name}</p>
                    {p.bio && <p className="line-clamp-2 text-sm text-muted">{p.bio}</p>}
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/agendar?profissional=${p.id}`)}>
                    Agendar
                  </Button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
