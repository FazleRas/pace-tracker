// Spec for lib/nextDeparture.mjs. Run with `npm test` from frontend/.
//
// These tests are the contract, written before the implementation. Every case
// here is one we already know the schedule throws at us — after-midnight
// service, holiday overrides, the last bus of the night. If they all pass, the
// board is correct; there is no separate "looks right" check to do by hand.
//
// Chicago is pinned here rather than in the npm script so this behaves the same
// on someone's laptop, on Vercel, and in CI regardless of the host clock.
process.env.TZ = "America/Chicago";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { toSeconds, activeServiceIds, nextDeparture } from "./nextDeparture.mjs";

const WK = "2026-06-NW-Weekday-01";
const SA = "2026-06-NW-Saturday-01";
const HOL = "2026-11-NW-Holiday-01";

// Aug 2026 is CDT (-05:00), Nov 2026 is CST (-06:00). Offsets are written out
// so the instant under test never depends on the machine's timezone.
const CDT = "-05:00";
const CST = "-06:00";

const feed = {
  route: "208",
  calendar: {
    [WK]: { days: [1, 1, 1, 1, 1, 0, 0], startDate: "20260601", endDate: "20261231" },
    [SA]: { days: [0, 0, 0, 0, 0, 1, 0], startDate: "20260601", endDate: "20261231" },
  },
  exceptions: {
    "20261126": { added: [HOL], removed: [WK] },
  },
  stops: [
    {
      stopId: "220s0345",
      stop: "Oakton Community College",
      departures: [
        { time: "05:02:00", route: "208", headsign: "Golf Mill", serviceId: WK },
        { time: "09:30:00", route: "208", headsign: "Golf Mill", serviceId: SA },
        { time: "11:00:00", route: "208", headsign: "Golf Mill", serviceId: HOL },
        { time: "22:10:00", route: "208", headsign: "Golf Mill", serviceId: WK },
        { time: "22:40:00", route: "208", headsign: "Golf Mill", serviceId: WK },
        { time: "24:16:00", route: "208", headsign: "Golf Mill", serviceId: WK },
      ],
    },
    {
      stopId: "220n0248",
      stop: "Golf Rd & Greenwood Ave",
      departures: [
        { time: "06:47:00", route: "208", headsign: "Davis St", serviceId: WK },
        { time: "24:31:00", route: "208", headsign: "Davis St", serviceId: WK },
      ],
    },
  ],
};

const at = (iso) => new Date(iso);

// ---------------------------------------------------------------- toSeconds

test("toSeconds converts wall clock to seconds since midnight", () => {
  assert.equal(toSeconds("05:02:00"), 18120);
  assert.equal(toSeconds("22:10:00"), 79800);
});

test("toSeconds keeps hours past 24 instead of wrapping them to zero", () => {
  assert.equal(toSeconds("24:16:00"), 87360);
  assert.equal(toSeconds("25:00:00"), 90000);
});

test("toSeconds orders the after-midnight bus last, not first", () => {
  // The string comparison "24:16:00" < "05:02:00" is why this matters.
  assert.ok(toSeconds("24:16:00") > toSeconds("05:02:00"));
});

// --------------------------------------------------------- activeServiceIds

test("weekday date selects only the weekday service", () => {
  const ids = activeServiceIds(feed, "20260811"); // Tuesday
  assert.ok(ids.has(WK));
  assert.ok(!ids.has(SA));
});

test("saturday date selects only the saturday service", () => {
  const ids = activeServiceIds(feed, "20260815"); // Saturday
  assert.ok(ids.has(SA));
  assert.ok(!ids.has(WK));
});

test("sunday has no service at all", () => {
  assert.equal(activeServiceIds(feed, "20260816").size, 0); // Sunday
});

test("a date outside the feed's validity window has no service", () => {
  assert.equal(activeServiceIds(feed, "20260501").size, 0); // before startDate
});

test("calendar_dates overrides the weekday pattern on a holiday", () => {
  // Thanksgiving falls on a Thursday, but weekday service is explicitly
  // removed and a holiday service added in its place.
  const ids = activeServiceIds(feed, "20261126");
  assert.ok(ids.has(HOL));
  assert.ok(!ids.has(WK));
});

// ------------------------------------------------------------ nextDeparture

test("mid-evening returns the next bus and the one after it", () => {
  const r = nextDeparture(feed, "220s0345", at(`2026-08-11T21:00:00${CDT}`));
  assert.equal(r.state, "OK");
  assert.equal(r.departure.time, "22:10:00");
  assert.equal(r.following.time, "22:40:00");
});

test("departure carries the frontend field names, not the GTFS ones", () => {
  const r = nextDeparture(feed, "220s0345", at(`2026-08-11T21:00:00${CDT}`));
  assert.equal(r.departure.route, "208");
  assert.equal(r.departure.headsign, "Golf Mill");
});

test("early morning returns the first bus of the day", () => {
  const r = nextDeparture(feed, "220s0345", at(`2026-08-11T04:00:00${CDT}`));
  assert.equal(r.departure.time, "05:02:00");
  assert.equal(r.following.time, "22:10:00");
});

test("the final bus of the service day is flagged LAST_BUS with nothing following", () => {
  const r = nextDeparture(feed, "220s0345", at(`2026-08-11T23:00:00${CDT}`));
  assert.equal(r.state, "LAST_BUS");
  assert.equal(r.departure.time, "24:16:00");
  assert.equal(r.following, null);
});

// The regression this whole file exists for.
test("just before midnight-plus, the 24:16 bus is still upcoming", () => {
  // 00:10 Wednesday is 24:10 on Tuesday's service day. The bus leaves at 24:16,
  // six minutes out.
  const r = nextDeparture(feed, "220s0345", at(`2026-08-12T00:10:00${CDT}`));
  assert.equal(r.state, "LAST_BUS");
  assert.equal(r.departure.time, "24:16:00");
});

test("after the 24:16 bus leaves, it is gone rather than a day away", () => {
  // 00:30 Wednesday. The 24:16 bus departed 14 minutes ago. The naive
  // setHours(24, 16) implementation reports it as ~23.7 hours out instead.
  const r = nextDeparture(feed, "220s0345", at(`2026-08-12T00:30:00${CDT}`));
  assert.notEqual(r.departure?.time, "24:16:00");
  // Tuesday's service day is spent, so this is the same situation as a Sunday:
  // closed, showing the next first bus. Not "OK, next bus in 23 hours".
  assert.equal(r.state, "CLOSED");
  assert.equal(r.departure.time, "05:02:00");
});

test("a holiday runs the holiday timetable, not the weekday one", () => {
  const r = nextDeparture(feed, "220s0345", at(`2026-11-26T10:00:00${CST}`));
  assert.equal(r.departure.time, "11:00:00");
  assert.equal(r.departure.serviceId, HOL);
});

test("a day with no service reports CLOSED and points at the next first bus", () => {
  // Sunday. Nothing runs; the board should say so and show Monday's first bus.
  const r = nextDeparture(feed, "220s0345", at(`2026-08-16T12:00:00${CDT}`));
  assert.equal(r.state, "CLOSED");
  assert.equal(r.departure.time, "05:02:00");
  assert.equal(r.departure.serviceId, WK);
});

test("each stop has its own timetable", () => {
  const r = nextDeparture(feed, "220n0248", at(`2026-08-11T07:00:00${CDT}`));
  assert.equal(r.state, "LAST_BUS");
  assert.equal(r.departure.time, "24:31:00");
  assert.equal(r.departure.headsign, "Davis St");
});

test("an unknown stop is CLOSED with nothing to show, not a crash", () => {
  const r = nextDeparture(feed, "not-a-stop", at(`2026-08-11T12:00:00${CDT}`));
  assert.equal(r.state, "CLOSED");
  assert.equal(r.departure, null);
});

// ------------------------------------------------------------------- fixture

test("mock.json matches the shape export_route.py actually emits", () => {
  const path = fileURLToPath(new URL("../public/mock.json", import.meta.url));
  const mock = JSON.parse(readFileSync(path, "utf8"));
  for (const key of ["generatedAt", "route", "calendar", "exceptions", "stops"]) {
    assert.ok(key in mock, `mock.json is missing "${key}"`);
  }
  assert.equal(mock.stops.length, 3);
  for (const stop of mock.stops) {
    assert.ok(stop.stopId && stop.stop && Array.isArray(stop.departures));
    for (const d of stop.departures) {
      assert.deepEqual(Object.keys(d).sort(), ["headsign", "route", "serviceId", "time"]);
    }
  }
});
