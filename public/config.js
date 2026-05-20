/* NOMOI Front Desk — runtime configuration.
 *
 * The anon key below is a PUBLIC, non-secret token by design. It is safe to
 * ship in client code. What protects the data is Row Level Security: the
 * migration grants anon INSERT only, never read/update/delete.
 *
 * TO FINISH SETUP (one step left):
 *   - Apply migrations/20260521_frontdesk_intake.sql to the Supabase project
 *     (SQL editor), then add "frontdesk" under Project Settings > API > Data
 *     API > Exposed schemas. The anon key below is already the live key.
 *
 * The service-role key is NEVER placed here. It is server-only.
 */
window.__FRONTDESK_CONFIG = {
  SUPABASE_URL: 'https://umodapwphcxtiijizqll.supabase.co',

  // Supabase anon (public) key — safe in client code by design; Row Level
  // Security on frontdesk.intakes restricts it to INSERT only. The form
  // stays in safe demo mode until the migration above is applied.
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtb2RhcHdwaGN4dGlpaml6cWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDY4NTksImV4cCI6MjA5MTQyMjg1OX0.n-78X7umWxX-0N3Ssl8LRKhORaVIPe1SgkXf0MpG5sM',

  SCHEMA: 'frontdesk',
  TABLE: 'intakes',
  BUCKET: 'frontdesk-cards',

  // Shared passcode that gates the read-only /clinic view for v1.
  // Change this before sharing the clinic link.
  CLINIC_PASSCODE: 'frontdesk2026'
};
