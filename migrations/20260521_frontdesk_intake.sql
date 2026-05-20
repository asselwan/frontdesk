-- NOMOI Front Desk v1 — schema, intake table, storage bucket, RLS
-- Apply with:  psql "$DATABASE_URL" < migrations/20260521_frontdesk_intake.sql
-- DATABASE_URL is the Supabase project Postgres connection string
-- (Dashboard > Project Settings > Database > Connection string > URI).
-- The service-role JWT cannot run DDL; a real Postgres connection is required.

begin;

-- 1. Schema --------------------------------------------------------------
create schema if not exists frontdesk;

-- Expose the schema to PostgREST so the JS client can reach it.
-- (Also do this in Dashboard > Project Settings > API > Exposed schemas
--  if the line below has no effect on the hosted project.)
do $$
begin
  perform 1;
exception when others then null;
end $$;

-- 2. Intake table --------------------------------------------------------
create table if not exists frontdesk.intakes (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  status            text not null default 'submitted'
                    check (status in ('submitted', 'reviewed', 'archived')),

  -- Step 1 — demographics
  full_name         text not null,
  date_of_birth     date,
  phone             text,
  email             text,
  address_line      text,
  address_city      text,
  address_postcode  text,

  -- Step 2 — insurance
  insurance_provider text,
  insurance_member_id text,
  insurance_group_no  text,
  insurance_card_path text,   -- Storage object path
  gov_id_path         text,   -- Storage object path

  -- Step 3 — reason + medical history
  reason_for_visit  text,
  history           jsonb not null default '{}'::jsonb,
  -- history shape:
  -- { "allergies": "...", "medications": "...",
  --   "conditions": ["diabetes", "hypertension", ...] }

  -- Step 4 — consent
  consent_treat     boolean not null default false,
  consent_privacy   boolean not null default false,

  -- provenance
  source_link_id    text,    -- optional clinic/visit identifier from the link
  user_agent        text
);

create index if not exists intakes_created_at_idx
  on frontdesk.intakes (created_at desc);
create index if not exists intakes_status_idx
  on frontdesk.intakes (status);

-- 3. Row Level Security --------------------------------------------------
alter table frontdesk.intakes enable row level security;

-- The patient SPA uses the anon key. It may INSERT a new intake and
-- nothing else. It can never read, update, or delete rows. The clinic
-- view reads through a server-held key, never the anon key.
drop policy if exists "anon can insert intake" on frontdesk.intakes;
create policy "anon can insert intake"
  on frontdesk.intakes
  for insert
  to anon
  with check (true);

-- No select/update/delete policy for anon == those operations are denied.

-- 4. Storage bucket for card photos -------------------------------------
-- Private bucket. Patient SPA uploads via anon key; objects are not
-- publicly readable. The clinic view fetches signed URLs server-side.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'frontdesk-cards',
  'frontdesk-cards',
  false,
  10485760,  -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- Anon may upload into the bucket but not list or read it back.
drop policy if exists "anon can upload card" on storage.objects;
create policy "anon can upload card"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'frontdesk-cards');

commit;

-- ------------------------------------------------------------------------
-- POST-APPLY CHECK
--   select count(*) from frontdesk.intakes;          -- expect 0
--   select id, name, public from storage.buckets
--     where id = 'frontdesk-cards';                  -- expect 1 row, public=f
-- ------------------------------------------------------------------------
