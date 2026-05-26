create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 2 and 40),
  display_name_normalized text not null unique check (char_length(trim(display_name_normalized)) between 2 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route text not null,
  model text not null,
  input_chars integer not null default 0 check (input_chars >= 0),
  output_chars integer not null default 0 check (output_chars >= 0),
  status text not null check (status in ('success', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_display_name_normalized_idx
  on public.profiles (display_name_normalized);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.ai_usage_events enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read own usage events"
  on public.ai_usage_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own usage events"
  on public.ai_usage_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
