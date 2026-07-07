create table if not exists public.public_access_settings (
  id text primary key default 'default',
  password_hash text null,
  password_salt text null,
  session_version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text null,
  constraint public_access_settings_singleton check (id = 'default')
);

comment on table public.public_access_settings is 'Stores hashed public app password settings for private tour access.';

notify pgrst, 'reload schema';
