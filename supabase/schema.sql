create extension if not exists pgcrypto;

create table if not exists public.players (
  wallet_address text primary key,
  display_name text,
  avatar_url text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.players add column if not exists avatar_url text;
alter table public.players add column if not exists last_seen_at timestamptz;

create table if not exists public.cards (
  id text primary key,
  name text not null,
  element text not null,
  tier text not null,
  rarity text not null,
  score integer not null,
  image text not null,
  created_at timestamptz not null default now(),
  constraint cards_element_check check (element in ('fire', 'water', 'earth', 'nature', 'shadow', 'electric')),
  constraint cards_rarity_check check (rarity in ('common', 'rare', 'epic', 'legendary'))
);

create table if not exists public.player_packs (
  token_id bigint primary key,
  wallet_address text not null references public.players(wallet_address) on delete cascade,
  status text not null default 'minted',
  minted_tx_hash text,
  opened_tx_hash text,
  minted_at timestamptz not null default now(),
  opened_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint player_packs_status_check check (status in ('minted', 'opened'))
);

create unique index if not exists player_packs_one_wallet_idx
  on public.player_packs(wallet_address);

create table if not exists public.pack_openings (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.players(wallet_address) on delete cascade,
  pack_token_id bigint not null references public.player_packs(token_id) on delete cascade,
  opened_tx_hash text,
  seed text not null,
  card_ids text[] not null,
  opened_at timestamptz not null default now(),
  unique(pack_token_id)
);

create table if not exists public.player_cards (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references public.players(wallet_address) on delete cascade,
  card_id text not null references public.cards(id),
  pack_token_id bigint references public.player_packs(token_id) on delete set null,
  copy_number integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists player_cards_wallet_idx on public.player_cards(wallet_address);
create index if not exists player_cards_card_idx on public.player_cards(card_id);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  match_id text not null unique,
  player0_wallet text,
  player1_wallet text,
  player0_name text,
  player1_name text,
  winner_wallet text,
  winner_player_id text,
  score jsonb not null default '{}'::jsonb,
  mode text not null default 'matchmaking',
  onchain_tx_hash text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.matches add column if not exists player0_name text;
alter table public.matches add column if not exists player1_name text;
alter table public.matches add column if not exists winner_player_id text;
alter table public.matches add column if not exists onchain_tx_hash text;
alter table public.matches add column if not exists completed_at timestamptz;

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(match_id) on delete cascade,
  event_index integer not null,
  turn integer,
  phase text,
  player_id text,
  player_wallet text,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(match_id, event_index)
);

create index if not exists matches_player0_wallet_idx on public.matches(player0_wallet);
create index if not exists matches_player1_wallet_idx on public.matches(player1_wallet);
create index if not exists match_events_match_idx on public.match_events(match_id, event_index);

create table if not exists public.leaderboard_entries (
  wallet_address text primary key references public.players(wallet_address) on delete cascade,
  display_name text,
  games integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  points integer not null default 0,
  power_for integer not null default 0,
  power_against integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.players enable row level security;
alter table public.cards enable row level security;
alter table public.player_packs enable row level security;
alter table public.pack_openings enable row level security;
alter table public.player_cards enable row level security;
alter table public.matches enable row level security;
alter table public.match_events enable row level security;
alter table public.leaderboard_entries enable row level security;

drop policy if exists "Cards are public read" on public.cards;
create policy "Cards are public read"
  on public.cards for select
  using (true);

drop policy if exists "Leaderboard is public read" on public.leaderboard_entries;
create policy "Leaderboard is public read"
  on public.leaderboard_entries for select
  using (true);

drop policy if exists "Matches are public read" on public.matches;
create policy "Matches are public read"
  on public.matches for select
  using (true);

drop policy if exists "Match events are public read" on public.match_events;
create policy "Match events are public read"
  on public.match_events for select
  using (true);
