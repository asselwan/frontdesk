/* NOMOI Front Desk — runtime configuration.
 *
 * The anon key below is a PUBLIC, non-secret token by design. It is safe to
 * ship in client code. What protects the data is Row Level Security: the
 * migration grants anon INSERT only, never read/update/delete.
 *
 * SETUP COMPLETE (2026-05-21): the migration is applied. The intake table
 * lives at public.frontdesk_intakes (the public schema is exposed by
 * default, so no exposed-schema change is needed). RLS limits the anon key
 * to INSERT only. The card-photo bucket is frontdesk-cards.
 *
 * The service-role key is NEVER placed here. It is server-only.
 */
window.__FRONTDESK_CONFIG = {
  SUPABASE_URL: 'https://umodapwphcxtiijizqll.supabase.co',

  // Supabase anon (public) key — safe in client code by design; Row Level
  // Security on frontdesk.intakes restricts it to INSERT only. The form
  // stays in safe demo mode until the migration above is applied.
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVtb2RhcHdwaGN4dGlpaml6cWxsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NDY4NTksImV4cCI6MjA5MTQyMjg1OX0.n-78X7umWxX-0N3Ssl8LRKhORaVIPe1SgkXf0MpG5sM',

  SCHEMA: 'public',
  TABLE: 'frontdesk_intakes',
  BUCKET: 'frontdesk-cards',

  // Shared passcode that gates the read-only /clinic view for v1.
  // Change this before sharing the clinic link.
  CLINIC_PASSCODE: 'frontdesk2026',

  // NOMOI document-extraction backend. The clinic view asks this service
  // to read an uploaded card photo and fill the matching intake columns.
  // No secret is stored here: the call is authorised with the read key the
  // clinic operator already entered at runtime.
  EXTRACT_API_BASE: 'https://docextract.nomoi.ai'
};
