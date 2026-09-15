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
  const [hours, minutes, seconds] = hms.split(":").map(Number);
  return hours * 3600 + minutes * 60 + seconds;
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
  const weekday = mondayIndexedWeekday(ymd);
  const ids = new Set();

  for (const [serviceId, service] of Object.entries(feed.calendar)) {
    if (
      service.startDate <= ymd &&
      ymd <= service.endDate &&
      service.days[weekday] === 1
    ) {
      ids.add(serviceId);
    }
  }

  const exception = feed.exceptions?.[ymd];
  if (exception) {
    for (const id of exception.removed ?? []) ids.delete(id);
    for (const id of exception.added ?? []) ids.add(id);
  }

  return ids;
}

/** "YYYYMMDD" -> weekday index where 0 = Monday ... 6 = Sunday. */
function mondayIndexedWeekday(ymd) {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  const sundayIndexed = new Date(year, month - 1, day).getDay();
  return (sundayIndexed + 6) % 7;
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
  const stop = feed.stops.find((s) => s.stopId === stopId);
  if (!stop) {
    return { state: "CLOSED", departure: null, following: null };
  }

  const { ymd: serviceDay, nowSeconds } = serviceDayFor(now);
  const upcoming = upcomingDepartures(feed, stop, serviceDay, nowSeconds);

  if (upcoming.length >= 2) {
    return {
      state: "OK",
      departure: toDeparture(upcoming[0]),
      following: toDeparture(upcoming[1]),
    };
  }
  if (upcoming.length === 1) {
    return { state: "LAST_BUS", departure: toDeparture(upcoming[0]), following: null };
  }

  // Nothing left in this service day: walk forward, day by day, until we
  // find one that runs any service at all.
  let searchDay = addDays(serviceDay, 1);
  for (let daysAhead = 0; daysAhead < 14; daysAhead++) {
    const firstBuses = upcomingDepartures(feed, stop, searchDay, 0);
    if (firstBuses.length > 0) {
      return { state: "CLOSED", departure: toDeparture(firstBuses[0]), following: null };
    }
    searchDay = addDays(searchDay, 1);
  }

  return { state: "CLOSED", departure: null, following: null };
}

/**
 * Which service day `now` belongs to, and how many seconds into that
 * service day `now` is. Before ~03:00, `now` still belongs to the previous
 * calendar date's service day (so a 24:16:00 departure is still findable),
 * and its seconds-since-midnight carries the +24h offset to match.
 */
function serviceDayFor(now) {
  const calendarYmd = ymdFromDate(now);
  const secondsToday = secondsOfDay(now);
  if (now.getHours() < 3) {
    return { ymd: addDays(calendarYmd, -1), nowSeconds: 86400 + secondsToday };
  }
  return { ymd: calendarYmd, nowSeconds: secondsToday };
}

function upcomingDepartures(feed, stop, serviceDay, nowSeconds) {
  const activeIds = activeServiceIds(feed, serviceDay);
  return stop.departures
    .filter((d) => activeIds.has(d.serviceId) && toSeconds(d.time) >= nowSeconds)
    .sort((a, b) => toSeconds(a.time) - toSeconds(b.time));
}

function toDeparture(d) {
  return { time: d.time, route: d.route, headsign: d.headsign, serviceId: d.serviceId };
}

function ymdFromDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function addDays(ymd, delta) {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(4, 6));
  const day = Number(ymd.slice(6, 8));
  return ymdFromDate(new Date(year, month - 1, day + delta));
}

function secondsOfDay(date) {
  return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}
