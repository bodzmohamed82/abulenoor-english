/* Site configuration.
 * PRODUCTION: fill SUPABASE_URL and SUPABASE_ANON_KEY from the Supabase project
 * (Project Settings -> API). While they are empty the site runs in DEMO MODE
 * with synthetic data stored in the browser (clearly bannered, not live). */
window.APP_CONFIG = {
  SITE_NAME: "Dr. Osama Abulenoor",
  SITE_TAGLINE: "IGCSE English",
  SUPABASE_URL: "https://jwrkcynfjyuoznymngzf.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3cmtjeW5manl1b3pueW1uZ3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyNTkyMTksImV4cCI6MjExMDgzNTIxOX0.GLbyEkDCkQGZmGE1as1YoDGJTryb_a8jKoXJ_5OUWaM",
  /* Student usernames map to synthetic login emails on this domain.
   * The domain never receives real mail; it only keys the auth accounts. */
  STUDENT_EMAIL_DOMAIN: "students.abulenoor.app",
  /* Teacher WhatsApp for the contact button (international format, no +). */
  WHATSAPP_NUMBER: "",
  /* While true, every page shows a banner marking this as a test deployment. */
  TEST_MODE: true,
};
