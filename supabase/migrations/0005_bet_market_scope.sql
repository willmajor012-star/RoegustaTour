alter table bet_markets
add column if not exists market_scope text not null default 'general_pot';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'bet_markets_market_scope_check'
  ) then
    alter table bet_markets
    add constraint bet_markets_market_scope_check
    check (market_scope in ('general_pot', 'special'));
  end if;
end $$;

notify pgrst, 'reload schema';
