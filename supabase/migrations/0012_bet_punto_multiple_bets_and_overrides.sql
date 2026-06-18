-- Bet Punto now supports multiple active bets per bettor/device in the same market.
-- This migration is idempotent and also adds admin/public edit metadata.

do $$
begin
  if to_regclass('public.bets') is not null then
    alter table public.bets
      add column if not exists bettor_player_id uuid references public.players(id) on delete set null,
      add column if not exists admin_entered boolean not null default false,
      add column if not exists admin_notes text,
      add column if not exists updated_at timestamptz not null default now(),
      add column if not exists void_reason text,
      add column if not exists public_edit_token_hash text;

    drop index if exists public.bets_one_active_bettor_per_market_idx;
    drop index if exists public.bets_one_active_device_per_market_idx;

    create index if not exists bets_bettor_player_idx on public.bets(bettor_player_id);
    create index if not exists bets_public_edit_token_hash_idx on public.bets(public_edit_token_hash) where public_edit_token_hash is not null;
    create index if not exists bets_market_bettor_idx on public.bets(market_id, lower(btrim(bettor_name)));
  end if;
end $$;

-- Supabase/PostgREST schema cache reload command:
notify pgrst, 'reload schema';
