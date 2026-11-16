-- =====================================================================
-- Admin altera nome, telefone e e-mail de um cliente.
-- O e-mail também é trocado no login (auth.users), sem precisar de confirmação.
-- =====================================================================
create or replace function public.admin_update_profile(
  p_id uuid, p_full_name text, p_phone text, p_email text
) returns public.profiles
language plpgsql security definer set search_path = public, auth as $$
declare
  v_name  text := trim(coalesce(p_full_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_old   text;
  v_row   public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem alterar os dados do cliente';
  end if;
  if v_name = '' then raise exception 'Informe o nome'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-mail inválido';
  end if;

  select email into v_old from auth.users where id = p_id;
  if not found then raise exception 'Cliente não encontrado'; end if;

  if lower(coalesce(v_old, '')) <> v_email then
    if exists (select 1 from auth.users where lower(email) = v_email and id <> p_id) then
      raise exception 'Este e-mail já está em uso por outra conta';
    end if;
    update auth.users set email = v_email, updated_at = now() where id = p_id;
    update auth.identities
       set identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
     where user_id = p_id and provider = 'email';
  end if;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('full_name', v_name, 'phone', v_phone)
   where id = p_id;

  update public.profiles
     set full_name = v_name, phone = v_phone, email = v_email
   where id = p_id
  returning * into v_row;
  return v_row;
end $$;

revoke execute on function public.admin_update_profile from public, anon;
grant  execute on function public.admin_update_profile to authenticated;
