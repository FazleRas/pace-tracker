"use client";

import { useState, useEffect } from "react";

// Turns a time string like "14:32:00" into a real JS Date for today.
function timeStringToDate(timeString) {
  const [hours, minutes, seconds] = timeString.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, seconds, 0);
  return date;
}

// ADD WHOLE MIN CALC AND HOW FREQUENT STOPS UPDATE (next commit)

export default function DeparturePill({ state, departure, following }) {
  const [minutesLeft, setMinutesLeft] = useState(() =>
    departure ? getMinutesUntil(departure.time) : 0
  );

  useEffect(() => {
    if (!departure || state === "CLOSED") return;

    // Schedule the next check. Because this effect re-runs every time
    // minutesLeft changes, the delay automatically gets shorter as the
    // bus gets closer. Implementing on next commit *
    const delay = getRefreshDelay(minutesLeft);
    const timer = setTimeout(() => {
      setMinutesLeft(getMinutesUntil(departure.time));
    }, delay);

    return () => clearTimeout(timer);
  }, [minutesLeft, departure, state]);

  if (state === "CLOSED") {
    return (
      <div style={styles.pill}>
        Campus stop closed — first bus {departure?.time}
      </div>
    );
  }

  let minutesLabel;
  if (minutesLeft > 0) {
    minutesLabel = `${minutesLeft} min`;
  } else if (minutesLeft === 0) {
    minutesLabel = "arriving now";
  } else {
    minutesLabel = "departed";
  }

  return (
    <div style={styles.pill}>
      <div>
        <span style={styles.route}>{departure?.route}</span>{" "}
        <span>to {departure?.headsign}</span>
      </div>
      <div style={styles.scheduled}>
        {departure?.time} <span>scheduled</span>
      </div>
      <div style={styles.minutes}>{minutesLabel}</div>
      {state === "LAST_BUS" && <div style={styles.note}>last bus today</div>}
      {following && <div style={styles.note}>then {following.time}</div>}
    </div>
  );
}

const styles = {
  pill: {
    display: "inline-block",
    padding: "12px 18px",
    borderRadius: "20px",
    backgroundColor: "#1d4ed8",
    color: "white",
    fontFamily: "sans-serif",
    fontSize: "14px",
  },
  route: {
    fontWeight: "bold",
  },
  scheduled: {
    marginTop: "2px",
    opacity: 0.85,
  },
  minutes: {
    marginTop: "4px",
    fontSize: "18px",
    fontWeight: "bold",
  },
  note: {
    marginTop: "4px",
    fontSize: "12px",
    opacity: 0.85,
  },
};
