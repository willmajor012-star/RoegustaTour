-- Persistent Bet Punto stake and indicative payout tracking.
-- This keeps Bet Punto as a private tour stake log only: no wallets, accounts, bank details or payment processing.

alter table bet_markets
  add column if not exists market_scope text not null default 'general_pot';

alter table bet_markets drop constraint if exists bet_markets_market_scope_check;
alter table bet_markets add constraint bet_markets_market_scope_check
  check (market_scope in ('general_pot', 'special'));

alter table bet_options
  add column if not exists odds_decimal numeric;

alter table bets
  add column if not exists stake_amount_pence integer,
  add column if not exists payout_amount_pence integer,
  add column if not exists outcome_status text not null default 'pending',
  add column if not exists payout_status text not null default 'not_applicable',
  add column if not exists payout_notes text;

alter table bets drop constraint if exists bets_stake_amount_pence_check;
alter table bets add constraint bets_stake_amount_pence_check
  check (stake_amount_pence is null or stake_amount_pence > 0);

alter table bets drop constraint if exists bets_payout_amount_pence_check;
alter table bets add constraint bets_payout_amount_pence_check
  check (payout_amount_pence is null or payout_amount_pence >= 0);

alter table bets drop constraint if exists bets_outcome_status_check;
alter table bets add constraint bets_outcome_status_check
  check (outcome_status in ('pending', 'won', 'lost', 'void', 'push'));

alter table bets drop constraint if exists bets_payout_status_check;
alter table bets add constraint bets_payout_status_check
  check (payout_status in ('unpaid', 'paid', 'not_applicable'));
