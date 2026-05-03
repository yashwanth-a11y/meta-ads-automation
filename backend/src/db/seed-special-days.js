/**
 * Holiday seeding is now automatic via HolidayFetchService.
 *
 * On server startup the scheduler calls holidayFetchService.ensurePopulated()
 * which fetches from Google Calendar ICS (free, no API key) or Calendarific
 * (set CALENDARIFIC_API_KEY in .env for richer data) and upserts into the
 * special_days table.
 *
 * Manual trigger: POST /api/v1/calendar/sync-holidays?year=2026&country=IN
 *
 * If you want to run a manual one-time sync from the CLI:
 *   node -e "import('./src/services/HolidayFetchService.js').then(m=>m.holidayFetchService.syncForYear('IN',2026).then(console.log))"
 */
