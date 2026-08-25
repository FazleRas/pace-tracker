import csv, sqlite3, pathlib

RAW = pathlib.Path("data/raw")
DB = pathlib.Path("data/pace.db")
FILES = ["stops", "stop_times", "trips", "routes", "calendar", "calendar_dates"]

DB.parent.mkdir(parents=True, exist_ok=True)
RAW.mkdir(parents=True, exist_ok=True)
con = sqlite3.connect(DB)
for name in FILES:
    path = RAW / (name + ".txt")
    if not path.exists():
        print("missing " + name + ".txt")
        continue
    with open(path, newline="", encoding="utf-8-sig") as f:
        r = csv.reader(f)
        cols = next(r)
        coldefs = ", ".join('"' + c.strip() + '" TEXT' for c in cols)
        con.execute("DROP TABLE IF EXISTS " + name)
        con.execute("CREATE TABLE " + name + " (" + coldefs + ")")
        placeholders = ",".join("?" * len(cols))
        rows = (row for row in r if len(row) == len(cols))
        con.executemany("INSERT INTO " + name + " VALUES (" + placeholders + ")", rows)
    n = con.execute("SELECT COUNT(*) FROM " + name).fetchone()[0]
    print("loaded {:<16} {:>8,} rows".format(name, n))

con.execute("CREATE INDEX IF NOT EXISTS ix_st_stop ON stop_times(stop_id)")
con.execute("CREATE INDEX IF NOT EXISTS ix_tr_trip ON trips(trip_id)")
con.execute("CREATE INDEX IF NOT EXISTS ix_st_trip ON stop_times(trip_id)")
con.commit()
con.close()
print("done -> " + str(DB))
