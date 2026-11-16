-- =====================================================================
-- AURA BARBEARIA — horário de atendimento = primeiro e último INÍCIO de atendimento
-- open_time  = primeiro horário que o cliente pode agendar (ex.: 10:00)
-- close_time = último horário de INÍCIO que o cliente pode agendar (ex.: 19:00)
-- Rode no Supabase: SQL Editor > New query > Run
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

-- Primeiro agendamento 10h, último 19h nos dias em que a barbearia abre
update public.business_hours set open_time = '10:00', close_time = '19:00' where is_open;
