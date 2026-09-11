"use client";

import { useEffect, useState } from "react";
import DeparturePill from "./components/DeparturePill";
import Footer from "./components/Footer";
import { nextDeparture } from "../lib/nextDeparture.mjs";
import feed from "../public/route208.json";
import styles from "./page.module.css";

// Imported, not fetched: the JSON ships with the build, so there's no
// loading state, no network failure mode, and no basePath to get wrong on
// a static host. Swapping the schedule means re-running the export and
// redeploying, which is true either way since it's committed.

// The board only needs to notice that a bus has left and promote the next
// one. DeparturePill owns the per-minute countdown, so this can be coarse.
const TICK_MS = 30000;

// Two board results are the same if they'd render the same pill. Used to
// skip setState when nothing changed, so DeparturePill's props keep their
// identity and its self-scheduling timer isn't reset every tick (which,
// with a 30s tick and a 60s minimum pill refresh, would freeze the countdown).
function sameResult(a, b) {
  const key = (r) =>
    [r.state, r.departure?.time, r.departure?.serviceId, r.following?.time].join("|");
  return key(a) === key(b);
}

export default function Home() {
  // null until mounted: `now` differs between prerender and browser, so
  // computing during SSR would only produce a hydration mismatch.
  const [boards, setBoards] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const update = () => {
      try {
        const now = new Date();
        const next = feed.stops.map((stop) => ({
          stop,
          ...nextDeparture(feed, stop.stopId, now),
        }));
        setBoards((prev) =>
          prev && prev.every((p, i) => sameResult(p, next[i])) ? prev : next
        );
        setError(null);
      } catch (e) {
        setError(e);
      }
    };

    update();
    const timer = setInterval(update, TICK_MS);

    // Background tabs throttle timers; recompute the moment we're visible.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const generated = new Date(feed.generatedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.title}>Oakton Bus Departures</h1>
          <p className={styles.subtitle}>
            Pace Route {feed.route} &middot; scheduled times, not real-time
          </p>
        </header>

        {error && (
          <div className={styles.error} role="alert">
            Board unavailable: {error.message}
          </div>
        )}

        <section className={styles.stops}>
          {(boards ?? feed.stops.map((stop) => ({ stop }))).map(
            ({ stop, state, departure, following }) => (
              <article key={stop.stopId} className={styles.stop}>
                <h2 className={styles.stopName}>{stop.stop}</h2>
                {state ? (
                  <DeparturePill
                    // Remount when the departure changes so the pill's
                    // countdown re-seeds from the new time.
                    key={`${state}|${departure?.serviceId}|${departure?.time}`}
                    state={state}
                    departure={departure}
                    following={following}
                  />
                ) : (
                  !error && <p className={styles.loading}>Loading&hellip;</p>
                )}
              </article>
            )
          )}
        </section>

        <p className={styles.meta}>Schedule exported {generated}</p>
      </main>
      <Footer />
    </div>
  );
}
