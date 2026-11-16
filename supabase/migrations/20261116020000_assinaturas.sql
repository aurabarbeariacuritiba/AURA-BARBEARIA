-- =====================================================================
-- AURA BARBEARIA — Assinaturas (planos mensais)
-- Rode no Supabase: SQL Editor > New query > Run
-- =====================================================================

-- ---------- Planos ----------
create table public.plans (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  price            numeric(10,2) not null check (price >= 0),          -- valor mensal
  service_ids      uuid[] not null default '{}',                        -- serviços incluídos
  allowed_weekdays smallint[],                                          -- null = todos os dias (0=dom ... 6=sáb)
  uses_per_period  int check (uses_per_period is null or uses_per_period > 0), -- null = ilimitado
  active           boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

-- ---------- Assinaturas dos clientes ----------
create type public.sub_status as enum ('pending', 'active', 'cancelled');

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.profiles on delete cascade,
  plan_id              uuid not null references public.plans,
  status               public.sub_status not null default 'pending',
  current_period_start timestamptz,
  current_period_end   timestamptz,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
-- no máximo uma assinatura em aberto por cliente
create unique index subscriptions_one_open_per_client on public.subscriptions (client_id) where status in ('pending', 'active');
create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.appointments add column subscription_id uuid references public.subscriptions on delete set null;
alter table public.payments     add column subscription_id uuid references public.subscriptions on delete set null;
create index payments_subscription_idx on public.payments (subscription_id);

-- =====================================================================
-- Funções
-- =====================================================================

-- Assinatura ativa do cliente que cobre o serviço na data (respeita dias e limite de usos)
create or replace function public.covering_subscription(p_client uuid, p_service uuid, p_starts timestamptz)
returns uuid language sql stable security definer set search_path = public as $$
  select s.id
    from subscriptions s
    join plans p on p.id = s.plan_id
   where s.client_id = p_client
     and s.status = 'active'
     and p_starts >= s.current_period_start
     and p_starts <  s.current_period_end
     and p_service = any (p.service_ids)
     and (p.allowed_weekdays is null
          or extract(dow from p_starts at time zone 'America/Sao_Paulo')::smallint = any (p.allowed_weekdays))
     and (p.uses_per_period is null
          or (select count(*) from appointments a
               where a.subscription_id = s.id
                 and a.status in ('pending', 'confirmed', 'completed')
                 and a.starts_at >= s.current_period_start
                 and a.starts_at <  s.current_period_end) < p.uses_per_period)
   limit 1;
$$;

-- Aplica um pagamento pago a uma assinatura: ativa ou renova por +1 mês
create or replace function public.apply_subscription_payment(p_payment_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare
  v_pay payments;
  v_sub subscriptions;
begin
  select * into v_pay from payments where id = p_payment_id;
  if not found or v_pay.subscription_id is null or v_pay.status <> 'paid' then
    raise exception 'Pagamento inválido para assinatura';
  end if;
  select * into v_sub from subscriptions where id = v_pay.subscription_id for update;

  if v_sub.status = 'active' and v_sub.current_period_end > now() then
    -- renovação antecipada: soma 1 mês ao fim atual
    update subscriptions set current_period_end = current_period_end + interval '1 month'
     where id = v_sub.id returning * into v_sub;
  else
    -- nova assinatura ou vencida: começa agora
    update subscriptions set status = 'active', current_period_start = now(), current_period_end = now() + interval '1 month'
     where id = v_sub.id returning * into v_sub;
  end if;
  return v_sub;
end $$;

-- Cliente escolhe um plano (fica pendente até o pagamento)
create or replace function public.subscribe(p_plan_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare
  v_sub subscriptions;
begin
  if auth.uid() is null then raise exception 'Faça login'; end if;
  perform 1 from plans where id = p_plan_id and active;
  if not found then raise exception 'Plano indisponível'; end if;

  select * into v_sub from subscriptions where client_id = auth.uid() and status in ('pending', 'active');
  if found then
    if v_sub.status = 'active' and v_sub.current_period_end > now() and v_sub.plan_id <> p_plan_id then
      raise exception 'Você já tem uma assinatura ativa. Fale com a barbearia para trocar de plano.';
    end if;
    update subscriptions set plan_id = p_plan_id where id = v_sub.id returning * into v_sub;
    return v_sub;
  end if;

  insert into subscriptions (client_id, plan_id) values (auth.uid(), p_plan_id) returning * into v_sub;
  return v_sub;
end $$;

-- Equipe: cadastrar/alterar assinatura de um cliente (ex.: assinantes que já pagam fora do app)
create or replace function public.staff_set_subscription(p_client_id uuid, p_plan_id uuid, p_valid_until date default null)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare
  v_sub subscriptions;
  v_end timestamptz := case when p_valid_until is null then null
                            else ((p_valid_until + 1)::timestamp at time zone 'America/Sao_Paulo') end;
begin
  if not is_staff() then raise exception 'Apenas a equipe'; end if;
  select * into v_sub from subscriptions where client_id = p_client_id and status in ('pending', 'active') for update;
  if found then
    update subscriptions
       set plan_id = p_plan_id,
           status = case when v_end is not null then 'active'::sub_status else status end,
           current_period_start = case when v_end is not null then coalesce(current_period_start, v_end - interval '1 month') else current_period_start end,
           current_period_end = coalesce(v_end, current_period_end)
     where id = v_sub.id returning * into v_sub;
  else
    insert into subscriptions (client_id, plan_id, status, current_period_start, current_period_end)
    values (p_client_id, p_plan_id,
            case when v_end is not null then 'active'::sub_status else 'pending'::sub_status end,
            v_end - interval '1 month', v_end)
    returning * into v_sub;
  end if;
  return v_sub;
end $$;

-- Equipe: receber mensalidade na barbearia (dar baixa) => ativa/renova
create or replace function public.register_subscription_payment(
  p_subscription_id uuid, p_method public.pay_method, p_amount numeric default null, p_notes text default null)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare
  v_sub subscriptions;
  v_pay payments;
  v_price numeric;
begin
  if not is_staff() then raise exception 'Apenas a equipe pode dar baixa'; end if;
  select * into v_sub from subscriptions where id = p_subscription_id;
  if not found or v_sub.status = 'cancelled' then raise exception 'Assinatura não encontrada ou cancelada'; end if;
  select price into v_price from plans where id = v_sub.plan_id;

  insert into payments (subscription_id, client_id, amount, method, status, provider, received_by, paid_at, notes)
  values (v_sub.id, v_sub.client_id, coalesce(p_amount, v_price), p_method, 'paid', 'manual', auth.uid(), now(), nullif(trim(p_notes), ''))
  returning * into v_pay;
  update payments set status = 'failed' where subscription_id = v_sub.id and status = 'pending';

  return apply_subscription_payment(v_pay.id);
end $$;

-- Cancelar assinatura (cliente: a própria; equipe: qualquer)
create or replace function public.cancel_subscription(p_id uuid)
returns public.subscriptions language plpgsql security definer set search_path = public as $$
declare v_sub subscriptions;
begin
  select * into v_sub from subscriptions where id = p_id for update;
  if not found then raise exception 'Assinatura não encontrada'; end if;
  if not is_staff() and v_sub.client_id is distinct from auth.uid() then raise exception 'Sem permissão'; end if;
  update subscriptions set status = 'cancelled' where id = p_id returning * into v_sub;
  update payments set status = 'failed' where subscription_id = p_id and status = 'pending';
  return v_sub;
end $$;

-- Agendamento agora considera assinatura (atendimento coberto = R$ 0, já "pago")
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
  v_sub      uuid;
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
    if v_ls::date <> v_le::date or v_ls::time < v_bh.open_time or v_ls::time > v_bh.close_time then
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

  -- assinatura ativa que cobre este serviço/dia => sem cobrança
  if v_client is not null then
    v_sub := covering_subscription(v_client, v_svc.id, p_starts_at);
  end if;

  begin
    insert into appointments (client_id, guest_name, guest_phone, professional_id, service_id, service_name,
                              starts_at, ends_at, price, status, payment_status, subscription_id, notes, created_by)
    values (v_client, nullif(trim(p_guest_name), ''), nullif(trim(p_guest_phone), ''), p_professional_id, v_svc.id, v_svc.name,
            p_starts_at, v_end,
            case when v_sub is not null then 0 else v_svc.price end, 'confirmed',
            case when v_sub is not null then 'paid'::pay_status else 'unpaid'::pay_status end, v_sub,
            nullif(trim(p_notes), ''), auth.uid())
    returning * into v_appt;
  exception when exclusion_violation then
    raise exception 'Este horário acabou de ser reservado. Escolha outro.';
  end;

  return v_appt;
end $$;

-- Permissões
revoke execute on function public.covering_subscription, public.apply_subscription_payment from public, anon, authenticated;
grant  execute on function public.apply_subscription_payment to service_role;
revoke execute on function public.subscribe, public.staff_set_subscription,
  public.register_subscription_payment, public.cancel_subscription from public, anon;
grant  execute on function public.subscribe, public.staff_set_subscription,
  public.register_subscription_payment, public.cancel_subscription to authenticated;

grant select on public.plans to anon;
grant select, insert, update, delete on public.plans, public.subscriptions to authenticated;

alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;

create policy "público: ler planos" on public.plans for select to anon, authenticated using (true);
create policy "admin: planos" on public.plans for all to authenticated using ((select is_admin())) with check ((select is_admin()));

create policy "assinatura: cliente vê a sua, equipe vê todas" on public.subscriptions for select
  to authenticated using (client_id = (select auth.uid()) or (select is_staff()));
create policy "assinatura: admin gerencia" on public.subscriptions for all
  to authenticated using ((select is_admin())) with check ((select is_admin()));

-- =====================================================================
-- Dados: os serviços "Assinatura ..." viram planos
-- =====================================================================
insert into public.plans (name, price, service_ids, allowed_weekdays, sort_order) values
  ('Assinatura Corte',              169.90, array(select id from public.services where name = 'Corte'), null, 1),
  ('Assinatura Barba',              179.90, array(select id from public.services where name = 'Barba'), null, 2),
  ('Assinatura Corte e Barba',      279.90, array(select id from public.services where name in ('Corte', 'Barba', 'Corte e Barba')), null, 3),
  ('Assinatura Corte terça/quarta', 139.90, array(select id from public.services where name = 'Corte'), '{2,3}', 4);

update public.services set active = false where name ilike 'Assinatura%';
