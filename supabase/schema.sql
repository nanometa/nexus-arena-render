create extension if not exists pgcrypto;

create table if not exists public.players (
  wallet_address text primary key,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  winner_wallet text,
  score jsonb not null default '{}'::jsonb,
  mode text not null default 'matchmaking',
  created_at timestamptz not null default now()
);

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
alter table public.leaderboard_entries enable row level security;

drop policy if exists "Cards are public read" on public.cards;
create policy "Cards are public read"
  on public.cards for select
  using (true);

drop policy if exists "Leaderboard is public read" on public.leaderboard_entries;
create policy "Leaderboard is public read"
  on public.leaderboard_entries for select
  using (true);
