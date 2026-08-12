/**
 * Selection logic for the departure board. Pure functions, no DOM, no fetch.
 *
 * Input is the object exported by scripts/export_route.py (see
 * frontend/public/mock.json for the shape). Output is exactly the props
 * DeparturePill already takes: { state, departure, following }.
 *
 * IMPLEMENTATION NOTES — the two things that make this non-trivial:
 *
 * 1. SERVICE DAY != CALENDAR DAY.
 *    GTFS encodes after-midnight trips as times past 24:00:00, so a "24:16:00"
 *    departure on Monday's service actually leaves at 00:16 Tuesday. Before you
 *    can ask "which service is running", you must decide whether the current
 *    instant still belongs to yesterday's service day. Anything before roughly
 *    03:00 does. Get this wrong and the last bus of the night either vanishes
 *    or reports as ~23 hours away.
 *
 * 2. NEVER COMPARE TIME STRINGS, AND NEVER BUILD A DATE VIA setHours().
 *    docs/ARCHITECTURE.md is explicit: parse as seconds since midnight.
 *    "24:16:00" sorts before "05:02:00" as a string, and setHours(24, ...)
 *    silently rolls into the next calendar day, which is how the current
 *    DeparturePill implementation happens to work by accident.
 *
 * Everything runs in America/Chicago (ARCHITECTURE.md), including DST.
 */

/** Weekday index used by the `days` array in the feed's calendar. 0 = Monday. */
export const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/**
 * "24:16:00" -> 87360. Mirrors to_secs() in scripts/export_route.py.
 * Must handle hours >= 24 without normalizing them away.
 *
 * @param {string} hms
 * @returns {number} seconds since midnight of the service day
 */
export function toSeconds(hms) {
  throw new Error("not implemented");
}

/**
 * Which service IDs are running on a given calendar date.
 *
 * calendar gives the weekday pattern plus a valid-from/valid-to window;
 * exceptions (from calendar_dates.txt) override it, adding or removing
 * services for specific dates. Removals win over the weekday pattern.
 *
 * @param {object} feed  parsed route208.json
 * @param {string} ymd   calendar date as "YYYYMMDD"
 * @returns {Set<string>} active service IDs
 */
export function activeServiceIds(feed, ymd) {
  throw new Error("not implemented");
}

/**
 * The state of the board, and the next one or two departures for a stop.
 *
 * Returns:
 *   state      "OK"       two or more buses left in this service day
 *              "LAST_BUS" exactly one left; it is `departure`
 *              "CLOSED"   none left. `departure` is the first bus of the next
 *                         service day that runs, or null if the feed has none.
 *                         Note this covers both "Sunday, nothing runs" and
 *                         "00:30 and tonight's last bus already went".
 *   departure  { time, route, headsign, serviceId } | null
 *   following  the departure after `departure`, or null (always null unless
 *              state is "OK")
 *
 * @param {object} feed    parsed route208.json
 * @param {string} stopId  e.g. "220s0345"
 * @param {Date}   now
 * @returns {{state: string, departure: object|null, following: object|null}}
 */
export function nextDeparture(feed, stopId, now) {
  throw new Error("not implemented");
}
