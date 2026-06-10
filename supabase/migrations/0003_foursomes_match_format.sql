alter table matches drop constraint if exists matches_format_check;
alter table matches add constraint matches_format_check check (format in ('singles','better_ball','foursomes','scramble','custom'));

alter table player_match_results drop constraint if exists player_match_results_format_check;
alter table player_match_results add constraint player_match_results_format_check check (format in ('singles','better_ball','foursomes','scramble','custom'));
