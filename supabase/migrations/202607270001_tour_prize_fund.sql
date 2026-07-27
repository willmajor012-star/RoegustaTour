-- Lightweight, read-only tour prize-fund reference.
-- Winners and scores remain in round_prize_results; this stores only the
-- contribution, rules and fixed payout schedule.

alter table public.tours
  add column if not exists prize_fund jsonb;

update public.tours
set prize_fund = jsonb_build_object(
      'contributionPence', 3750,
      'totalPence', 90000,
      'rules', jsonb_build_array(
        'Countback: number of nett birdies, then back-nine points.',
        'A gimme in matchplay is also a gimme in the secondary format (except Niels must hole everything).'
      ),
      'rounds', jsonb_build_array(
        jsonb_build_object('roundNumber', 1, 'paidPer', 'pair', 'payoutsPence', jsonb_build_array(5000, 4000, 3000, 2000, 1000)),
        jsonb_build_object('roundNumber', 2, 'paidPer', 'pair', 'payoutsPence', jsonb_build_array(10000, 8000, 6000, 4000, 2000)),
        jsonb_build_object('roundNumber', 3, 'paidPer', 'player', 'payoutsPence', jsonb_build_array(10000, 8000, 6000, 4000, 2000)),
        jsonb_build_object('roundNumber', 4, 'paidPer', 'pair', 'payoutsPence', jsonb_build_array(5000, 4000, 3000, 2000, 1000))
      )
    ),
    updated_at = now()
where year = 2026
  and upper(btrim(name)) = 'ROEGUSTA TOUR 2026'
  and prize_fund is null;

notify pgrst, 'reload schema';
