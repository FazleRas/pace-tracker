"""
Build step: dump the full Route 208 schedule for the campus stops into one
static JSON file the frontend can ship. No backend, no runtime queries.

    python scripts/load_gtfs.py        # feed  -> data/pace.db
    python scripts/export_route.py     # db    -> frontend/public/route208.json

next_departures.py answers "what's next RIGHT NOW" on the server. This answers
"what is the entire schedule", once, at build time. The browser picks today's
service and filters. That's the whole v0 architecture.
"""

import json, sqlite3, pathlib, sys
from datetime import datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Chicago")
DB = pathlib.Path("data/pace.db")
OUT = pathlib.Path("frontend/public/route208.json")

ROUTE = "208"
STOPS = ["220s0345", "220s0350", "220n0248"]
DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def to_secs(hms):
    """GTFS times run past 24:00:00 for after-midnight service. Sort on this,
    never on the string, or 24:16 lands before 05:02."""
    h, m, s = (int(x) for x in hms.split(":"))
    return h * 3600 + m * 60 + s


def stop_names(con):
    rows = con.execute(
        "SELECT stop_id, stop_name FROM stops WHERE stop_id IN (%s)"
        % ",".join("?" * len(STOPS)),
        STOPS,
    )
    return dict(rows)


def departures_for(con, stop_id):
    """One row per scheduled departure, tagged with the service it belongs to.

    Field names are renamed HERE, on purpose: the DB calls them
    route_short_name / direction_text, the frontend reads route / headsign.
    Renaming at the boundary means DeparturePill never has to know GTFS exists.
    """
    q = (
        "SELECT st.departure_time, r.route_short_name, r.route_long_name, "
        "       t.direction_text, t.service_id "
        "FROM stop_times st "
        "JOIN trips t  ON t.trip_id  = st.trip_id "
        "JOIN routes r ON r.route_id = t.route_id "
        "WHERE st.stop_id = ? AND r.route_short_name = ?"
    )
    seen = set()
    out = []
    for dep, short, long, dirtxt, svc in con.execute(q, (stop_id, ROUTE)):
        if not dep or not svc:
            continue
        key = (dep, short, dirtxt, svc)
        if key in seen:  # same time+direction can appear on several trips
            continue
        seen.add(key)
        out.append(
            {
                "time": dep,
                "route": short or long,
                "headsign": dirtxt or "",
                "serviceId": svc,
            }
        )
    out.sort(key=lambda d: to_secs(d["time"]))
    return out


def calendar_for(con, service_ids):
    """Which weekdays each service runs, and the window it's valid for.
    The browser needs this to decide which serviceId is 'today'."""
    if not service_ids:
        return {}
    q = (
        "SELECT service_id, monday, tuesday, wednesday, thursday, friday, "
        "       saturday, sunday, start_date, end_date "
        "FROM calendar WHERE service_id IN (%s)" % ",".join("?" * len(service_ids))
    )
    cal = {}
    for row in con.execute(q, tuple(service_ids)):
        sid, days, start, end = row[0], row[1:8], row[8], row[9]
        cal[sid] = {
            "days": [int(d or 0) for d in days],  # index 0 = Monday
            "startDate": start,
            "endDate": end,
        }
    return cal


def exceptions_for(con, service_ids):
    """calendar_dates.txt overrides calendar.txt. Holidays live here."""
    if not service_ids:
        return {}
    q = (
        "SELECT date, service_id, exception_type FROM calendar_dates "
        "WHERE service_id IN (%s)" % ",".join("?" * len(service_ids))
    )
    ex = {}
    for date, sid, kind in con.execute(q, tuple(service_ids)):
        slot = ex.setdefault(date, {"added": [], "removed": []})
        slot["added" if kind == "1" else "removed"].append(sid)
    return ex


def main():
    if not DB.exists():
        sys.exit("no %s — run scripts/load_gtfs.py first" % DB)

    con = sqlite3.connect(DB)
    names = stop_names(con)

    stops, service_ids = [], set()
    for stop_id in STOPS:
        deps = departures_for(con, stop_id)
        service_ids.update(d["serviceId"] for d in deps)
        stops.append(
            {
                "stopId": stop_id,
                "stop": names.get(stop_id, stop_id),
                "departures": deps,
            }
        )
        print("  %-10s %-34s %4d departures" % (stop_id, names.get(stop_id, "?"), len(deps)))

    calendar = calendar_for(con, service_ids)
    payload = {
        "generatedAt": datetime.now(TZ).isoformat(timespec="seconds"),
        "route": ROUTE,
        "calendar": calendar,
        "exceptions": exceptions_for(con, service_ids),
        "stops": stops,
    }
    con.close()

    # The risk flagged in ARCHITECTURE.md: an expired feed produces a JSON that
    # looks perfectly fine and is silently wrong. Make it loud instead.
    today = datetime.now(TZ).strftime("%Y%m%d")
    expired = [s for s, c in calendar.items() if c["endDate"] and c["endDate"] < today]
    if expired:
        print("\n  WARNING: feed expired for %s (today %s)" % (", ".join(sorted(expired)), today))
        print("  Re-download the GTFS zip before shipping this.")

    total = sum(len(s["departures"]) for s in stops)
    if total == 0:
        sys.exit("\n0 departures exported — check that route_short_name is really '%s'" % ROUTE)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2))
    kb = OUT.stat().st_size / 1024
    print("\n%d departures | %d services | %.1f KB -> %s" % (total, len(calendar), kb, OUT))


if __name__ == "__main__":
    main()
