/* NOMOI Front Desk — runtime configuration.
 *
 * The anon key below is a PUBLIC, non-secret token by design. It is safe to
 * ship in client code. What protects the data is Row Level Security: the
 * migration grants anon INSERT only, never read/update/delete.
 *
 * TO FINISH SETUP:
 *   1. Apply migrations/20260521_frontdesk_intake.sql to the Supabase project.
 *   2. Supabase Dashboard > Project Settings > API > Project API keys.
 *      Copy the "anon" / "public" key and paste it into ANON_KEY below.
 *   3. Supabase Dashboard > Project Settings > API > Data API > Exposed
 *      schemas: add "frontdesk" so the JS client can reach the table.
 *
 * The service-role key is NEVER placed here. It is server-only.
 */
window.__FRONTDESK_CONFIG = {
  SUPABASE_URL: 'https://umodapwphcxtiijizqll.supabase.co',

  // PLACEHOLDER — replace with the project anon key before going live.
  // Until this is filled in, the intake form runs in a safe demo mode that
  // shows the confirmation screen without writing to Supabase.
  ANON_KEY: 'REPLACE_WITH_SUPABASE_ANON_KEY',

  SCHEMA: 'frontdesk',
  TABLE: 'intakes',
  BUCKET: 'frontdesk-cards',

  // Shared passcode that gates the read-only /clinic view for v1.
  // Change this before sharing the clinic link.
  CLINIC_PASSCODE: 'frontdesk2026'
};
