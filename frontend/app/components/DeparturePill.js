"use client";

import { useState, useEffect } from "react";

// Turns a time string like "14:32:00" into a real JS Date for today.
function timeStringToDate(timeString) {
  const [hours, minutes, seconds] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, seconds, 0);
  return date;
}

// How many whole minutes are left until the bus leaves?
// Uses floor (not round) so anything under 1 full minute counts as 0,
// which shows as "arriving now" below.
function getMinutesUntil(timeString) {
  const departureDate = timeStringToDate(timeString);
  const diffMs = departureDate.getTime() - Date.now();
  return Math.floor(diffMs / 60000);
}

// A bus that's far away doesn't need frequent updates, but one that's
// about to arrive should feel "live". So: the closer the bus, the more
// often we re-check the time.
function getRefreshDelay(minutesLeft) {
  if (minutesLeft <= 5) return 60000; // every 1 minute
  if (minutesLeft <= 10) return 120000; // every 2 minutes
  if (minutesLeft <= 20) return 180000; // every 3 minutes
  return 300000; // every 5 minutes
}

export default function DeparturePill({ state, departure, following }) {
  const [minutesLeft, setMinutesLeft] = useState(() =>
    departure ? getMinutesUntil(departure.time) : 0
  );

  useEffect(() => {
    // A closed stop or a missing departure has nothing to count down to.
    if (!departure || state === "CLOSED") return;

    // Self-scheduling loop, deliberately NOT keyed on `minutesLeft`
    let timer;
    const scheduleNext = (delay) => {
      timer = setTimeout(() => {
        const next = getMinutesUntil(departure.time);
        setMinutesLeft(next);
        scheduleNext(getRefreshDelay(next));
      }, delay);
    };
    scheduleNext(getRefreshDelay(minutesLeft));

    // Background tabs throttle setTimeout, so the countdown can go stale
    // while unfocused. Force a recompute the moment it's visible again.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setMinutesLeft(getMinutesUntil(departure.time));
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- minutesLeft only seeds the first delay; scheduleNext recomputes it on every subsequent tick.
  }, [departure, state]);

  const tone = getPillTone(state, minutesLeft);

  if (state === "CLOSED") {
    return (
      <div style={{ ...styles.pill, ...toneStyles.closed }}>
        {departure
          ? `Campus Stop Closed | First Bus ${departure.time}`
          : "Campus Stop Closed"}
      </div>
    );
  }

  if (!departure) {
    return (
      <div style={{ ...styles.pill, ...toneStyles.departed }}>
        No Upcoming Departures
      </div>
    );
  }

  let minutesLabel;
  if (minutesLeft > 0) {
    minutesLabel = `${minutesLeft} min`;
  } else if (minutesLeft === 0) {
    minutesLabel = "Arriving Now";
  } else {
    minutesLabel = state === "LAST_BUS" ? "No More Buses Today" : "Departed";
  }

  return (
    <div style={{ ...styles.pill, ...toneStyles[tone] }}>
      <div>
        <span style={styles.route}>{departure.route}</span>{" "}
        <span>to {departure.headsign}</span>
      </div>
      <div style={styles.scheduled}>
        {departure.time} <span>scheduled</span>
      </div>
      <div style={styles.minutes} aria-live="polite">
        {minutesLabel}
      </div>
      {state === "LAST_BUS" && minutesLeft >= 0 && (
        <div style={styles.note}>last bus today</div>
      )}
      {following && <div style={styles.note}>then {following.time}</div>}
    </div>
  );
}

// Visual urgency: calm blue while there's time, red once it's imminent,
// muted gray once it's no longer actionable (closed or already departed).
function getPillTone(state, minutesLeft) {
  if (state === "CLOSED") return "closed";
  if (minutesLeft < 0) return "departed";
  if (minutesLeft <= 2) return "urgent";
  return "default";
}

const styles = {
  pill: {
    display: "inline-block",
    padding: "12px 18px",
    borderRadius: "20px",
    color: "white",
    fontFamily: "sans-serif",
    fontSize: "14px",
    transition: "background-color 0.3s ease",
  },
  route: {
    fontWeight: "bold",
  },
  scheduled: {
    marginTop: "2px",
    opacity: 0.92,
  },
  minutes: {
    marginTop: "4px",
    fontSize: "18px",
    fontWeight: "bold",
  },
  note: {
    marginTop: "4px",
    fontSize: "12px",
    opacity: 0.92,
  },
};

const toneStyles = {
  default: { backgroundColor: "#1d4ed8" },
  urgent: { backgroundColor: "#b91c1c" },
  departed: { backgroundColor: "#6b7280" },
  closed: { backgroundColor: "#6b7280" },
};
