-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

-- 1) Manual reclassification overrides, saved per month ----------------------
create table if not exists public.reclass_overrides (
  id          bigserial primary key,
  year        int  not null check (year between 2000 and 2100),
  month       int  not null check (month between 1 and 12),
  emp_code    text not null,
  segment     text,
  department  text not null,
  updated_by  text,
  updated_at  timestamptz not null default now(),
  unique (year, month, emp_code)
);

-- Only the server (service-role key) touches this table. With RLS on and no policies,
-- the public/anon key can read and write nothing.
alter table public.reclass_overrides enable row level security;

-- 2) Private bucket for uploaded salary sheets (optional upload fallback) ------
insert into storage.buckets (id, name, public)
values ('salary-sheets', 'salary-sheets', false)
on conflict (id) do nothing;
