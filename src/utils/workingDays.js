// =============================================================================
// WORKING-DAY DEADLINE SYSTEM — single backend-authoritative calculation util
// =============================================================================
// DAY-1 CONVENTION (documented, one consistent rule everywhere):
//   The task's start date counts as Working Day 1 when it is a working day
//   (Monday–Friday, not a configured holiday). When the start falls on a
//   weekend/holiday, Day 1 is the next working day after it. The deadline is
//   18:00 (6:00 PM) business time on the Nth working day.
//   Example: 2 working days, start Friday -> Friday=Day 1, Monday=Day 2 ->
//   deadline Monday 18:00.
//
// BUSINESS TIMEZONE: fixed IST (UTC+05:30). The server may run in any TZ;
// all calendar-day reasoning here uses a fixed +330 minute offset so results
// never depend on the server or browser timezone.
// =============================================================================

// Fixed business timezone offset in minutes (IST = UTC+05:30)
const BUSINESS_TZ_OFFSET_MIN = 330;

// Default deadline time of day in business timezone (18:00 = 6:00 PM)
const DEADLINE_HOUR = 18;
const DEADLINE_MINUTE = 0;

// Safety cap so an invalid duration can never loop forever
const MAX_SCAN_DAYS = 2000;

/**
 * Convert a Date into its business-timezone (IST) calendar parts.
 * Works regardless of the server's local timezone.
 */
function toBusinessDayParts(date) {
  const shifted = new Date(date.getTime() + BUSINESS_TZ_OFFSET_MIN * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(), // 0-based
    day: shifted.getUTCDate(),
    dow: shifted.getUTCDay(), // 0=Sun ... 6=Sat
  };
}

/**
 * Build a Set of holiday calendar dates ('YYYY-MM-DD') from the OfficeConfig
 * holidays array for O(1) lookups.
 */
function toHolidaySet(holidays) {
  const set = new Set();
  for (const h of holidays || []) {
    const dateStr = typeof h?.date === 'string' ? h.date.trim() : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) set.add(dateStr);
  }
  return set;
}

/** Business day = Monday–Friday and not a configured holiday. */
function isWorkingDay(parts, holidaySet) {
  if (parts.dow === 0 || parts.dow === 6) return false;
  const key = `${parts.year}-${String(parts.month + 1).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  return !holidaySet.has(key);
}

/** Advance IST calendar parts to the next calendar day. */
function nextDay(parts) {
  const shifted = new Date(Date.UTC(parts.year, parts.month, parts.day + 1));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    dow: shifted.getUTCDay(),
  };
}

/**
 * Compute the working-day deadline for a task.
 *
 * @param {Date|string|number} start  Task start (startDate or approval time)
 * @param {number} workingDays        Positive whole number of working days
 * @param {Array} holidays            OfficeConfig holidays ([{ date: 'YYYY-MM-DD', name }])
 * @returns {Date|null} Deadline instant (Nth working day at 18:00 IST) or
 *                      null when inputs are invalid (caller keeps legacy
 *                      behavior — no invented deadline).
 */
function calcWorkingDayDeadline(start, workingDays, holidays) {
  const startDate = start instanceof Date ? start : new Date(start);
  if (!startDate || isNaN(startDate.getTime())) return null;

  const duration = Number(workingDays);
  if (!Number.isInteger(duration) || duration < 1) return null;

  const holidaySet = toHolidaySet(holidays);

  // Find Day 1: the start date itself when it is a working day, otherwise
  // the next working day after it (documented DAY-1 convention).
  let parts = toBusinessDayParts(startDate);
  let scanned = 0;
  while (!isWorkingDay(parts, holidaySet)) {
    parts = nextDay(parts);
    if (++scanned > MAX_SCAN_DAYS) return null;
  }

  // Count the remaining working days after Day 1
  let counted = 1;
  while (counted < duration) {
    parts = nextDay(parts);
    if (++scanned > MAX_SCAN_DAYS) return null;
    if (isWorkingDay(parts, holidaySet)) counted += 1;
  }

  // Deadline instant: that working day at 18:00 business time (IST)
  const utcMs = Date.UTC(parts.year, parts.month, parts.day, DEADLINE_HOUR, DEADLINE_MINUTE, 0);
  return new Date(utcMs - BUSINESS_TZ_OFFSET_MIN * 60 * 1000);
}

module.exports = {
  BUSINESS_TZ_OFFSET_MIN,
  calcWorkingDayDeadline,
};
