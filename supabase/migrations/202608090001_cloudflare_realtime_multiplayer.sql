-- Nexus Arena: Render-to-Supabase migration.
-- This migration is additive and preserves every existing player, pack, card and match row.

alter table public.players add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
alter table public.players add column if not exists avatar_url text;
alter table public.players add column if not exists last_seen_at timestamptz;
create unique index if not exists players_auth_user_id_idx
  on public.players(auth_user_id)
  where auth_user_id is not null;

-- Older production databases were created before match metadata was expanded.
alter table public.matches add column if not exists player0_name text;
alter table public.matches add column if not exists player1_name text;
alter table public.matches add column if not exists winner_player_id text;
alter table public.matches add column if not exists onchain_tx_hash text;
alter table public.matches add column if not exists completed_at timestamptz;

create table if not exists public.game_rooms (
  id text primary key,
  mode text not null check (mode in ('matchmaking', 'private')),
  status text not null default 'waiting' check (status in ('waiting', 'starting', 'playing', 'finished', 'canceled')),
  player0_auth_user_id uuid not null references auth.users(id) on delete cascade,
  player1_auth_user_id uuid references auth.users(id) on delete set null,
  player0_wallet text not null references public.players(wallet_address) on delete cascade,
  player1_wallet text references public.players(wallet_address) on delete set null,
  player0_name text not null,
  player1_name text,
  current_player text not null default '0' check (current_player in ('0', '1')),
  winner_player_id text check (winner_player_id in ('0', '1', 'draw')),
  version bigint not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists game_rooms_waiting_idx
  on public.game_rooms(mode, status, created_at);
create index if not exists game_rooms_player0_idx on public.game_rooms(player0_auth_user_id, updated_at desc);
create index if not exists game_rooms_player1_idx on public.game_rooms(player1_auth_user_id, updated_at desc);

-- Full state is service-role only. It contains both hands and the real deck order.
create table if not exists public.game_room_states (
  room_id text primary key references public.game_rooms(id) on delete cascade,
  state jsonb not null,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Each player subscribes only to their own redacted state.
create table if not exists public.game_room_views (
  room_id text not null references public.game_rooms(id) on delete cascade,
  player_id text not null check (player_id in ('0', '1')),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  state jsonb not null,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_id, player_id)
);

create index if not exists game_room_views_owner_idx
  on public.game_room_views(auth_user_id, room_id);

alter table public.game_rooms enable row level security;
alter table public.game_room_states enable row level security;
alter table public.game_room_views enable row level security;

grant select on public.game_rooms to authenticated;
grant select on public.game_room_views to authenticated;
revoke all on public.game_room_states from anon, authenticated;

drop policy if exists "Participants can read rooms" on public.game_rooms;
create policy "Participants can read rooms"
  on public.game_rooms for select to authenticated
  using (auth.uid() = player0_auth_user_id or auth.uid() = player1_auth_user_id);

drop policy if exists "Players can read own game view" on public.game_room_views;
create policy "Players can read own game view"
  on public.game_room_views for select to authenticated
  using (auth.uid() = auth_user_id);

-- No client policies are created on game_room_states. Only the service role can access it.

create or replace function public.nexus_claim_matchmaking(
  p_room_id text,
  p_auth_user_id uuid,
  p_wallet text,
  p_name text
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_room public.game_rooms;
begin
  perform pg_advisory_xact_lock(hashtext('nexus-ranked-matchmaking'));

  select * into selected_room
  from public.game_rooms
  where mode = 'matchmaking'
    and status = 'waiting'
    and player0_auth_user_id <> p_auth_user_id
    and created_at > now() - interval '15 minutes'
  order by created_at asc
  limit 1
  for update skip locked;

  if selected_room.id is not null then
    update public.game_rooms
    set player1_auth_user_id = p_auth_user_id,
        player1_wallet = p_wallet,
        player1_name = p_name,
        status = 'starting',
        updated_at = now()
    where id = selected_room.id
    returning * into selected_room;
    return selected_room;
  end if;

  insert into public.game_rooms (
    id, mode, status, player0_auth_user_id, player0_wallet, player0_name
  ) values (
    p_room_id, 'matchmaking', 'waiting', p_auth_user_id, p_wallet, p_name
  )
  returning * into selected_room;
  return selected_room;
end;
$$;

create or replace function public.nexus_join_private_room(
  p_room_id text,
  p_auth_user_id uuid,
  p_wallet text,
  p_name text
)
returns public.game_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_room public.game_rooms;
begin
  select * into selected_room
  from public.game_rooms
  where id = p_room_id and mode = 'private'
  for update;

  if selected_room.id is null then
    raise exception 'Room not found';
  end if;
  if selected_room.status <> 'waiting' or selected_room.player1_auth_user_id is not null then
    raise exception 'Room is no longer available';
  end if;
  if selected_room.player0_auth_user_id = p_auth_user_id then
    raise exception 'A second wallet is required';
  end if;

  update public.game_rooms
  set player1_auth_user_id = p_auth_user_id,
      player1_wallet = p_wallet,
      player1_name = p_name,
      status = 'starting',
      updated_at = now()
  where id = p_room_id
  returning * into selected_room;
  return selected_room;
end;
$$;

revoke all on function public.nexus_claim_matchmaking(text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.nexus_join_private_room(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.nexus_claim_matchmaking(text, uuid, text, text) to service_role;
grant execute on function public.nexus_join_private_room(text, uuid, text, text) to service_role;

create or replace function public.nexus_register_pack_open(
  p_wallet text,
  p_token_id bigint,
  p_tx_hash text,
  p_seed text,
  p_card_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_pack public.player_packs;
begin
  if coalesce(array_length(p_card_ids, 1), 0) <> 20 then
    raise exception 'A Genesis Pack must reveal exactly 20 cards';
  end if;

  select * into selected_pack
  from public.player_packs
  where token_id = p_token_id and wallet_address = p_wallet
  for update;

  if selected_pack.token_id is null then
    raise exception 'Genesis Pack not found';
  end if;
  if selected_pack.status <> 'minted' then
    raise exception 'Genesis Pack is already opened';
  end if;
  if exists (select 1 from public.player_cards where wallet_address = p_wallet) then
    raise exception 'This wallet already owns a command deck';
  end if;

  insert into public.pack_openings (
    wallet_address, pack_token_id, opened_tx_hash, seed, card_ids
  ) values (
    p_wallet, p_token_id, p_tx_hash, p_seed, p_card_ids
  );

  insert into public.player_cards (wallet_address, card_id, pack_token_id, copy_number)
  select p_wallet, card_id, p_token_id, 1
  from unnest(p_card_ids) as card_id;

  update public.player_packs
  set status = 'opened', opened_tx_hash = p_tx_hash, opened_at = now(), updated_at = now()
  where token_id = p_token_id;
end;
$$;

revoke all on function public.nexus_register_pack_open(text, bigint, text, text, text[]) from public, anon, authenticated;
grant execute on function public.nexus_register_pack_open(text, bigint, text, text, text[]) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_rooms'
  ) then
    alter publication supabase_realtime add table public.game_rooms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game_room_views'
  ) then
    alter publication supabase_realtime add table public.game_room_views;
  end if;
end $$;
