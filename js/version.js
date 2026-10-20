// The app's version and release history (shown in the footer and the Admin
// Control Centre). Update this when you release a new version.
export const VERSION = "2.0.0";
export const RELEASE_DATE = "2026-10-20";

export const RELEASES = [
  { version: "2.0.0", date: "2026-10-20", title: "Admin Control Centre and AI advice",
    notes: ["Admin Control Centre: users, live log, system health, API monitor, security and backend status",
      "AI cash-flow advice through the Google Gemini API, with built-in rules as a backup",
      "Database event log written by triggers (sign-ups, logins, invoices, uploads, AI requests)"] },
  { version: "1.3.0", date: "2026-10-20", title: "How It Works",
    notes: ["Four-step \"How It Works\" section on the home page, matching the website"] },
  { version: "1.2.0", date: "2026-10-17", title: "SST and guided onboarding",
    notes: ["8% SST shown on paid plans", "Optional RM49 guided onboarding at sign-up"] },
  { version: "1.1.0", date: "2026-10-15", title: "Bahasa Melayu",
    notes: ["English / Bahasa Melayu switch on every page"] },
  { version: "1.0.0", date: "2026-10-13", title: "First release",
    notes: ["Cash-flow forecast (7, 30, 90 days)", "Invoices, expenses and CSV import with review",
      "Free, Basic and Premium plans with a 1-month Premium free trial"] },
];

// Libraries loaded from the jsDelivr CDN, each pinned to an exact version.
export const LIBRARIES = [
  { name: "supabase-js", version: "2.105.4", use: "Login and database calls" },
  { name: "Bootstrap", version: "5.3.3", use: "Layout and components" },
  { name: "Bootstrap Icons", version: "1.11.3", use: "Icons" },
  { name: "Chart.js", version: "4.4.1", use: "Forecast chart" },
];
