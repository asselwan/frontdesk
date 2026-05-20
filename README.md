# NOMOI Front Desk

Digital pre-visit patient intake. A clinic sends a patient a link, the patient
completes a structured intake on their phone before arriving, and the front
desk receives it as structured data instead of re-keying a paper form.

Front Desk is one of the three instruments in Clinic Baseline. It pairs with
chart indexing (the same structured-record idea) and Noshight (a completed
intake is a no-show signal).

## What is in here

```
public/
  index.html    Patient intake — multi-step single-page app
  app.js        Intake flow: validation, photo upload, Supabase write
  clinic.html   Clinic view — read-only list of submitted intakes
  clinic.js     Clinic view logic
  config.js     Runtime config (Supabase URL, anon key placeholder, passcode)
migrations/
  20260521_frontdesk_intake.sql   Schema, intakes table, storage bucket, RLS
Dockerfile      Static nginx image
nginx.conf      Routing: / is the intake, /clinic is the clinic view
```

No build step. The patient app loads the Supabase JS client from a CDN and
talks to Supabase directly.

## Setup

### 1. Apply the migration

The migration creates the `frontdesk` schema, the `intakes` table, the
`frontdesk-cards` Storage bucket, and the RLS policies.

```
psql "$DATABASE_URL" < migrations/20260521_frontdesk_intake.sql
```

`DATABASE_URL` is the project's Postgres connection string from
Supabase Dashboard > Project Settings > Database > Connection string (URI).
The service-role JWT alone cannot run DDL — a real Postgres connection is
required.

### 2. Expose the schema to the API

Supabase Dashboard > Project Settings > API > Data API > Exposed schemas:
add `frontdesk`. The JS client cannot reach the table until this is done.

### 3. Fill in the anon key

Supabase Dashboard > Project Settings > API > Project API keys. Copy the
`anon` / `public` key and paste it into `ANON_KEY` in `public/config.js`.

The anon key is a public, non-secret token by design. Row Level Security is
what protects the data: the migration grants `anon` INSERT only — never
read, update, or delete. The service-role key is never placed in client code.

Until the anon key is filled in, the intake form runs in demo mode: it
validates and shows the confirmation screen but does not write to Supabase.

### 4. Change the clinic passcode

Set `CLINIC_PASSCODE` in `public/config.js` before sharing the clinic link.

## Running locally

```
docker build -t frontdesk .
docker run --rm -p 8080:80 frontdesk
```

Patient intake: `http://localhost:8080/`
Clinic view: `http://localhost:8080/clinic`

Or serve `public/` with any static server.

## The clinic view and the read key

Patient records are private. RLS gives `anon` INSERT only, so a static page
cannot safely hold a key that can read patient data.

For v1, the clinic operator enters two things on the gate screen: the shared
passcode and a read key (the project service-role key). The read key lives
only in that browser tab's memory — it is never written into the repo, the
page, or any storage. Card photos open through short-lived signed URLs.

This is a deliberate v1 trade-off. A hosted multi-clinic version replaces it
with a thin authenticated backend route that holds the service key
server-side and serves the clinic a scoped, audited read. See "Future" below.

## NOMOI surface

Both pages carry `data-nomoi-surface="frontdesk.nomoi.ai"`, the inline
Surface emitter, `surface-motion.js`, and the theta NOMΘI wordmark. The
patient page also loads the Clinic Baseline customer-comms widget. The
intake emits step views, blocked steps, photo attachments, and submit
outcomes so the funnel is measurable.

## v1 vs future

v1 ships, working end to end once the migration is applied:

- Four-step patient intake with inline validation and a progress indicator
- Photo capture for insurance card and government ID via `capture` file
  inputs (phones offer the camera)
- Structured persistence to Postgres plus a private Storage bucket
- Confirmation screen with a reference code
- Read-only clinic view with an expandable detail panel and signed-URL
  photo viewing
- RLS that limits the public client to inserts only

Not in v1, deliberately:

- A per-clinic link issuer and clinic accounts (v1 uses one shared deployment
  and an optional `?link=` tag on the URL)
- A backend route for the clinic view (v1 uses an operator-entered read key)
- Editing intake status from the clinic view (the `status` column and CHECK
  constraint exist; the UI is read-only)
- Sending the patient a link by email or SMS (handled by the clinic for now)
- OCR of the card photos into structured insurance fields
- Noshight and chart-indexing wiring inside Clinic Baseline

---

A NOMΘI product. Part of Clinic Baseline.
