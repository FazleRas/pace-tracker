# pace-tracker

Bus departure board for Oakton Community College, built on Pace's public GTFS feed.
**Schedule data only — not real-time.**

## Setup

1. Download the Pace GTFS feed, unzip it
2. Copy the `.txt` files into `data/raw/`
3. `python3 scripts/load_gtfs.py`  (expect ~733k rows in stop_times)
4. `python3 scripts/next_departures.py 220s0345`

## Campus stops

| stop_id | name |
|---|---|
| 220s0345 | Oakton Community College |
| 220s0350 | Golf Rd & College Dr (southbound) |
| 220n0248 | Golf Rd & College Dr (northbound) |

All served by **Route 208 (Golf Road)**, east + west. Service runs 06:35–21:44 weekdays.

See `docs/ARCHITECTURE.md` for the data model and known constraints.

## License :D

This project is under the MIT License.
