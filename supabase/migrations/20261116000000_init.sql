-- =====================================================================
-- AURA BARBEARIA — schema inicial
-- Rode este arquivo inteiro no Supabase: SQL Editor > New query > Run
-- =====================================================================

create extension if not exists btree_gist;

-- ---------- Tipos ----------
create type public.user_role   as enum ('client', 'barber', 'admin');
create type public.appt_status as enum ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
create type public.pay_status  as enum ('unpaid', 'pending', 'paid', 'failed', 'refunded');
create type public.pay_method  as enum ('pix', 'credit_card', 'debit_card', 'cash');

-- ---------- Perfis (1:1 com auth.users) ----------
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  role        public.user_role not null default 'client',
  created_at  timestamptz not null default now()
);

-- ---------- Configurações da barbearia (linha única) ----------
create table public.shop_settings (
  id                     int primary key default 1 check (id = 1),
  name                   text not null default 'Aura Barbearia',
  about                  text,
  address                text,
  whatsapp               text,
  instagram              text,
  cover_url              text,
  slot_interval_min      int  not null default 15 check (slot_interval_min between 5 and 120),
  min_cancel_hours       int  not null default 2  check (min_cancel_hours >= 0),
  booking_window_days    int  not null default 30 check (booking_window_days between 1 and 365),
  online_payment_enabled boolean not null default true,
  pay_at_shop_enabled    boolean not null default true,
  amenities              jsonb not null default '{"wifi":false,"accessibility":false,"parking":false,"kids":false}',
  updated_at             timestamptz not null default now()
);

-- ---------- Horário de funcionamento (0 = domingo ... 6 = sábado) ----------
create table public.business_hours (
  weekday     smallint primary key check (weekday between 0 and 6),
  is_open     boolean not null default true,
  open_time   time not null default '09:00',
  close_time  time not null default '19:00',
  break_start time,
  break_end   time,
  check (close_time > open_time),
  check ((break_start is null) = (break_end is null)),
  check (break_end is null or break_end > break_start)
);

-- ---------- Serviços ----------
create table public.services (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  price         numeric(10,2) not null check (price >= 0),
  duration_min  int not null check (duration_min between 5 and 600),
  image_url     text,
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

-- ---------- Profissionais ----------
create table public.professionals (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  bio         text,
  photo_url   text,
  profile_id  uuid unique references public.profiles on delete set null,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- Bloqueios de agenda (folga, feriado...). professional_id nulo = barbearia toda ----------
create table public.time_off (
  id              uuid primary key default gen_random_uuid(),
  professional_id uuid references public.professionals on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  reason          text,
  created_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- ---------- Agendamentos ----------
create table public.appointments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid references public.profiles on delete cascade,
  guest_name      text,   -- cliente avulso (sem conta), cadastrado pela equipe
  guest_phone     text,
  professional_id uuid not null references public.professionals,
  service_id      uuid references public.services on delete set null,
  service_name    text not null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  price           numeric(10,2) not null check (price >= 0),
  status          public.appt_status not null default 'confirmed',
  payment_status  public.pay_status  not null default 'unpaid',
  notes           text,
  created_by      uuid references public.profiles on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at),
  check (client_id is not null or guest_name is not null),
  -- impede dois agendamentos sobrepostos para o mesmo profissional
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending', 'confirmed', 'completed'))
);
create index appointments_starts_at_idx on public.appointments (starts_at);
create index appointments_client_idx    on public.appointments (client_id);

-- ---------- Pagamentos (online e baixas manuais) ----------
create table public.payments (
  id                     uuid primary key default gen_random_uuid(),
  appointment_id         uuid references public.appointments on delete set null,
  client_id              uuid references public.profiles on delete set null,
  amount                 numeric(10,2) not null check (amount >= 0),
  method                 public.pay_method,
  status                 public.pay_status not null default 'pending',
  provider               text not null default 'manual' check (provider in ('manual', 'mercadopago')),
  provider_payment_id    text,
  provider_preference_id text,
  pix_qr_code            text,
  pix_qr_code_base64     text,
  checkout_url           text,
  received_by            uuid references public.profiles on delete set null,
  paid_at                timestamptz,
  notes                  text,
  created_at             timestamptz not null default now()
);
create unique index payments_provider_payment_id_key on public.payments (provider_payment_id) where provider_payment_id is not null;
create index payments_paid_at_idx on public.payments (paid_at);
create index payments_appointment_idx on public.payments (appointment_id);

-- ---------- Despesas ----------
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  description   text not null,
  category      text not null default 'Outros',
  amount        numeric(10,2) not null check (amount >= 0),
  expense_date  date not null default (now() at time zone 'America/Sao_Paulo')::date,
  created_by    uuid references public.profiles on delete set null,
  created_at    timestamptz not null default now()
);

-- =====================================================================
-- Funções auxiliares
-- =====================================================================
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'barber'));
$$;

-- Cria o perfil automaticamente no cadastro
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email, phone)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'full_name', ''),
          new.email,
          new.raw_user_meta_data ->> 'phone');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Só admin altera o papel (role). No SQL Editor (sem auth.uid) é permitido.
create or replace function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not is_admin() then
    raise exception 'Sem permissão para alterar o papel do usuário';
  end if;
  return new;
end $$;

create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- RPC: horários ocupados (não expõe dados de outros clientes)
-- =====================================================================
create or replace function public.get_busy_slots(p_professional_id uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.starts_at, a.ends_at from appointments a
   where a.professional_id = p_professional_id
     and a.status in ('pending', 'confirmed', 'completed')
     and a.starts_at < p_to and a.ends_at > p_from
  union all
  select t.starts_at, t.ends_at from time_off t
   where (t.professional_id is null or t.professional_id = p_professional_id)
     and t.starts_at < p_to and t.ends_at > p_from;
$$;

-- =====================================================================
-- RPC: criar agendamento (preço e duração vêm do banco, nunca do cliente)
-- =====================================================================
create or replace function public.book_appointment(
  p_service_id uuid,
  p_professional_id uuid,
  p_starts_at timestamptz,
  p_notes text default null,
  p_client_id uuid default null,
  p_guest_name text default null,
  p_guest_phone text default null
) returns public.appointments
language plpgsql security definer set search_path = public as $$
declare
  v_client   uuid := auth.uid();
  v_staff    boolean := is_staff();
  v_svc      services;
  v_set      shop_settings;
  v_bh       business_hours;
  v_end      timestamptz;
  v_ls       timestamp;
  v_le       timestamp;
  v_appt     appointments;
begin
  if auth.uid() is null then raise exception 'Faça login para agendar'; end if;

  if p_client_id is not null and p_client_id <> auth.uid() then
    if not v_staff then raise exception 'Sem permissão'; end if;
    v_client := p_client_id;
  end if;

  if nullif(trim(p_guest_name), '') is not null then
    if not v_staff then raise exception 'Sem permissão'; end if;
    v_client := null;
  end if;

  select * into v_svc from services where id = p_service_id and active;
  if not found then raise exception 'Serviço indisponível'; end if;

  perform 1 from professionals where id = p_professional_id and active;
  if not found then raise exception 'Profissional indisponível'; end if;

  select * into v_set from shop_settings where id = 1;
  v_end := p_starts_at + make_interval(mins => v_svc.duration_min);

  if not v_staff then
    if p_starts_at < now() then raise exception 'Este horário já passou'; end if;
    if p_starts_at > now() + make_interval(days => v_set.booking_window_days) then
      raise exception 'Agendamentos só podem ser feitos com até % dias de antecedência', v_set.booking_window_days;
    end if;

    v_ls := p_starts_at at time zone 'America/Sao_Paulo';
    v_le := v_end       at time zone 'America/Sao_Paulo';
    select * into v_bh from business_hours where weekday = extract(dow from v_ls);
    if not found or not v_bh.is_open then raise exception 'A barbearia não abre neste dia'; end if;
    if v_ls::date <> v_le::date or v_ls::time < v_bh.open_time or v_le::time > v_bh.close_time then
      raise exception 'Horário fora do expediente';
    end if;
    if v_bh.break_start is not null and v_ls::time < v_bh.break_end and v_le::time > v_bh.break_start then
      raise exception 'Horário coincide com o intervalo';
    end if;
    if exists (select 1 from time_off t
                where (t.professional_id is null or t.professional_id = p_professional_id)
                  and t.starts_at < v_end and t.ends_at > p_starts_at) then
      raise exception 'Profissional indisponível neste horário';
    end if;
  end if;

  begin
    insert into appointments (client_id, guest_name, guest_phone, professional_id, service_id, service_name,
                              starts_at, ends_at, price, status, notes, created_by)
    values (v_client, nullif(trim(p_guest_name), ''), nullif(trim(p_guest_phone), ''), p_professional_id, v_svc.id, v_svc.name,
            p_starts_at, v_end, v_svc.price, 'confirmed', nullif(trim(p_notes), ''), auth.uid())
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'Este horário acabou de ser reservado. Escolha outro.';
  end;

  return v_appt;
end $$;

-- =====================================================================
-- RPC: cancelar agendamento
-- =====================================================================
create or replace function public.cancel_appointment(p_id uuid)
returns public.appointments
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments;
  v_set  shop_settings;
begin
  select * into v_appt from appointments where id = p_id for update;
  if not found then raise exception 'Agendamento não encontrado'; end if;

  if not is_staff() then
    if v_appt.client_id is distinct from auth.uid() then raise exception 'Sem permissão'; end if;
    if v_appt.status not in ('pending', 'confirmed') then raise exception 'Este agendamento não pode ser cancelado'; end if;
    select * into v_set from shop_settings where id = 1;
    if v_appt.starts_at - now() < make_interval(hours => v_set.min_cancel_hours) then
      raise exception 'Cancelamento permitido até % horas antes. Fale com a barbearia.', v_set.min_cancel_hours;
    end if;
  end if;

  update appointments set status = 'cancelled' where id = p_id returning * into v_appt;
  update payments set status = 'failed' where appointment_id = p_id and status = 'pending';
  return v_appt;
end $$;

-- =====================================================================
-- RPC: dar baixa manual (pagamento presencial)
-- =====================================================================
create or replace function public.register_manual_payment(
  p_appointment_id uuid,
  p_method public.pay_method,
  p_amount numeric default null,
  p_notes text default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_appt appointments;
  v_pay  payments;
begin
  if not is_staff() then raise exception 'Apenas a equipe pode dar baixa'; end if;

  select * into v_appt from appointments where id = p_appointment_id for update;
  if not found then raise exception 'Agendamento não encontrado'; end if;
  if v_appt.payment_status = 'paid' then raise exception 'Este agendamento já está pago'; end if;

  insert into payments (appointment_id, client_id, amount, method, status, provider, received_by, paid_at, notes)
  values (v_appt.id, v_appt.client_id, coalesce(p_amount, v_appt.price), p_method, 'paid', 'manual',
          auth.uid(), now(), nullif(trim(p_notes), ''))
  returning * into v_pay;

  update payments set status = 'failed'
   where appointment_id = v_appt.id and status = 'pending' and id <> v_pay.id;

  update appointments
     set payment_status = 'paid',
         status = case when status in ('pending', 'confirmed') and starts_at <= now() then 'completed' else status end
   where id = v_appt.id;

  return v_pay;
end $$;

-- RPC: estornar/desfazer uma baixa (admin)
create or replace function public.undo_payment(p_payment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_pay payments;
begin
  if not is_admin() then raise exception 'Apenas administradores'; end if;
  update payments set status = 'refunded' where id = p_payment_id returning * into v_pay;
  if v_pay.appointment_id is not null then
    update appointments set payment_status = 'unpaid' where id = v_pay.appointment_id
       and not exists (select 1 from payments where appointment_id = v_pay.appointment_id and status = 'paid');
  end if;
end $$;

-- Permissões das funções
revoke execute on function public.book_appointment, public.cancel_appointment,
  public.register_manual_payment, public.undo_payment from public, anon;
grant execute on function public.book_appointment, public.cancel_appointment,
  public.register_manual_payment, public.undo_payment to authenticated;
grant execute on function public.get_busy_slots to anon, authenticated;

-- Permissões de tabela (o RLS abaixo restringe o que cada um vê/edita)
grant usage on schema public to anon, authenticated;
grant select on public.shop_settings, public.business_hours, public.services, public.professionals to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.shop_settings  enable row level security;
alter table public.business_hours enable row level security;
alter table public.services       enable row level security;
alter table public.professionals  enable row level security;
alter table public.time_off       enable row level security;
alter table public.appointments   enable row level security;
alter table public.payments       enable row level security;
alter table public.expenses       enable row level security;

-- profiles
create policy "perfil: ver o próprio ou equipe" on public.profiles for select
  to authenticated using (id = (select auth.uid()) or (select is_staff()));
create policy "perfil: editar o próprio ou admin" on public.profiles for update
  to authenticated using (id = (select auth.uid()) or (select is_admin()))
  with check (id = (select auth.uid()) or (select is_admin()));

-- dados públicos da barbearia
create policy "público: ler config"     on public.shop_settings  for select to anon, authenticated using (true);
create policy "público: ler horários"   on public.business_hours for select to anon, authenticated using (true);
create policy "público: ler serviços"   on public.services       for select to anon, authenticated using (true);
create policy "público: ler profissionais" on public.professionals for select to anon, authenticated using (true);

create policy "admin: config"         on public.shop_settings  for all to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "admin: horários"       on public.business_hours for all to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "admin: serviços"       on public.services       for all to authenticated using ((select is_admin())) with check ((select is_admin()));
create policy "admin: profissionais"  on public.professionals  for all to authenticated using ((select is_admin())) with check ((select is_admin()));

-- bloqueios
create policy "equipe: bloqueios" on public.time_off for all to authenticated
  using ((select is_staff())) with check ((select is_staff()));

-- agendamentos (inserção somente via RPC book_appointment)
create policy "agendamento: cliente vê os seus, equipe vê todos" on public.appointments for select
  to authenticated using (client_id = (select auth.uid()) or (select is_staff()));
create policy "agendamento: equipe edita" on public.appointments for update
  to authenticated using ((select is_staff())) with check ((select is_staff()));
create policy "agendamento: admin exclui" on public.appointments for delete
  to authenticated using ((select is_admin()));

-- pagamentos (online via Edge Function com service role; manual via RPC)
create policy "pagamento: cliente vê os seus, equipe vê todos" on public.payments for select
  to authenticated using (client_id = (select auth.uid()) or (select is_staff()));
create policy "pagamento: admin gerencia" on public.payments for all
  to authenticated using ((select is_admin())) with check ((select is_admin()));

-- despesas
create policy "despesas: admin" on public.expenses for all
  to authenticated using ((select is_admin())) with check ((select is_admin()));

-- =====================================================================
-- Dados iniciais
-- =====================================================================
insert into public.shop_settings (id, name, address, about)
values (1, 'Aura Barbearia',
        'Rua Gabriel Frecceiro de Miranda, 941 (de esquina) - Xaxim, Curitiba/PR - 81810-480',
        null);

insert into public.business_hours (weekday, is_open, open_time, close_time) values
  (0, false, '09:00', '19:00'),
  (1, true,  '09:00', '19:00'),
  (2, true,  '09:00', '19:00'),
  (3, true,  '09:00', '19:00'),
  (4, true,  '09:00', '19:00'),
  (5, true,  '09:00', '19:00'),
  (6, true,  '09:00', '18:00');

insert into public.services (name, price, duration_min, sort_order) values
  ('Corte',                       70.00, 45,  1),
  ('Barba',                       70.00, 45,  2),
  ('Corte e Barba',              130.00, 75,  3),
  ('Acabamento',                  45.00, 15,  4),
  ('Maquina única',               50.00, 30,  5),
  ('Sobrancelha',                 30.00, 15,  6),
  ('Abordagem Visagista',        199.90, 60,  7),
  ('Terapia Facial',             150.00, 30,  8),
  ('Esfoliação',                  40.00, 15,  9),
  ('Selagem',                    100.00, 30, 10),
  ('Luzes',                      200.00, 60, 11),
  ('Platinado',                  400.00, 60, 12),
  ('Depilação Nasal',             35.00, 15, 13),
  ('Depilação Orelha',            35.00, 15, 14),
  ('Combo Depilação',             60.00, 15, 15),
  ('Assinatura Corte',           169.90, 45, 16),
  ('Assinatura Barba',           179.90, 45, 17),
  ('Assinatura Corte e Barba',   279.90, 60, 18),
  ('Assinatura corte terça/qua', 139.90, 45, 19);

insert into public.professionals (name, sort_order) values ('Profissional Aura', 1);
