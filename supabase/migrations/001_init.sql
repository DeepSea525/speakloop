create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  source_type text not null check (source_type in ('paste', 'chat')),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.extraction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  model text not null,
  input_summary text,
  status text not null check (status in ('pending', 'success', 'error')) default 'pending',
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  kind text not null check (kind in ('word', 'phrase', 'sentence', 'issue')),
  prompt_cn text not null,
  answer_en text not null,
  explanation text not null default '',
  tags text[] not null default '{}',
  difficulty integer not null default 2 check (difficulty between 1 and 5),
  due_at timestamptz not null default now(),
  mastered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  review_item_id uuid not null references public.review_items(id) on delete cascade,
  rating text not null check (rating in ('hard', 'easy', 'mastered')),
  correct boolean not null default true,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists conversations_user_created_idx
  on public.conversations (user_id, created_at desc);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create index if not exists review_items_user_due_idx
  on public.review_items (user_id, due_at)
  where mastered_at is null;

create index if not exists review_events_user_created_idx
  on public.review_events (user_id, created_at desc);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.extraction_runs enable row level security;
alter table public.review_items enable row level security;
alter table public.review_events enable row level security;

create policy "Users can read own conversations"
  on public.conversations for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own conversations"
  on public.conversations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own conversations"
  on public.conversations for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read own messages"
  on public.messages for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own messages"
  on public.messages for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can read own extraction runs"
  on public.extraction_runs for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own extraction runs"
  on public.extraction_runs for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own extraction runs"
  on public.extraction_runs for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read own review items"
  on public.review_items for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own review items"
  on public.review_items for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own review items"
  on public.review_items for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can read own review events"
  on public.review_events for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own review events"
  on public.review_events for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
