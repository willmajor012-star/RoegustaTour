alter table matches drop constraint if exists matches_format_check;
alter table matches add constraint matches_format_check check (format in ('singles','better_ball','foursomes','scramble','custom'));
