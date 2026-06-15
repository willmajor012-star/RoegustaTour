-- Protect Bet Punto against duplicate active picks if two clients submit at the same time.
-- The app already validates this before insert; these partial indexes make the rule authoritative in Supabase too.
create unique index if not exists bets_one_active_bettor_per_market_idx
  on bets (market_id, lower(btrim(bettor_name)))
  where status = 'active';

create unique index if not exists bets_one_active_device_per_market_idx
  on bets (market_id, device_id)
  where status = 'active' and device_id is not null;
