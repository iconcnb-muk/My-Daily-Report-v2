-- Run in Supabase SQL Editor. This schema keeps each user's reports private by default.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin','developer')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.is_privileged()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','developer')) $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles(id,email,role) values(new.id,new.email,'user')
  on conflict (id) do update set email = excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.app_data enable row level security;

-- Users can read their own profile; privileged staff can view profiles for administration.
drop policy if exists "profile read own or privileged" on public.profiles;
create policy "profile read own or privileged" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_privileged());
-- A user cannot change their own role. Only privileged operators can update role fields.
drop policy if exists "profile update privileged only" on public.profiles;
create policy "profile update privileged only" on public.profiles for update to authenticated
using (public.is_privileged()) with check (public.is_privileged());
drop policy if exists "profile insert self" on public.profiles;
create policy "profile insert self" on public.profiles for insert to authenticated with check (id = auth.uid() and role = 'user');

drop policy if exists "app data owner access" on public.app_data;
create policy "app data owner access" on public.app_data for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Admin directory exposes only safe account metadata, never auth credentials or report contents.
create or replace view public.admin_user_directory with (security_invoker = true) as
select p.id, coalesce(p.email, '') as email, p.role, p.created_at
from public.profiles p
where public.is_privileged();

grant select, insert, update on public.app_data to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.admin_user_directory to authenticated;
