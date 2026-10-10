import {
  PlannerConfig,
  TravelMatrix,
  TransportMode,
  TrackLeg,
  LegTransitMode,
} from "./types";

/**
 * Converts "HH:MM" (24h) to minutes from midnight.
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Converts minutes from midnight to "HH:MM" 24h format.
 */
export function minutesToTime(mins: number): string {
  const normalized = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Looks up congestion factor for a given minute of the day.
 */
export function getCongestionFactor(
  minuteOfDay: number,
  config: PlannerConfig
): number {
  const timeStr = minutesToTime(minuteOfDay);
  const matched = config.congestion.find(
    (rule) => timeStr >= rule.start && timeStr <= rule.end
  );
  return matched ? matched.factor : 1.0;
}

/**
 * Calculates a travel leg between two node IDs at a specific departure time.
 */
export function calculateLeg(
  fromId: string,
  toId: string,
  departureMin: number,
  transport: TransportMode,
  matrix: TravelMatrix,
  config: PlannerConfig,
  groupSize: number = 1
): TrackLeg {
  if (fromId === toId) {
    return {
      fromId,
      toId,
      mode: "walk",
      durationMin: 0,
      distanceKm: 0,
      cost: 0,
    };
  }

  const entry = matrix[fromId]?.[toId] ?? { minutes: 15, distanceKm: 5.0 };
  const congestionFactor = getCongestionFactor(departureMin, config);

  const walkingThreshold = config.fares.walkingMaxDistanceKm;
  const isWalking = entry.distanceKm <= walkingThreshold;

  if (isWalking) {
    const walkDuration = Math.max(
      2,
      Math.round((entry.distanceKm / config.fares.walkingSpeedKmh) * 60)
    );
    return {
      fromId,
      toId,
      mode: "walk",
      durationMin: walkDuration,
      distanceKm: entry.distanceKm,
      cost: 0,
    };
  }

  // Adjust duration by congestion
  const adjustedDuration = Math.max(
    3,
    Math.round(entry.minutes * congestionFactor)
  );

  let cost = 0;
  let mode: LegTransitMode = "auto";

  if (transport === "none") {
    // Public transit / auto-rickshaw / taxi
    if (groupSize > 3 || entry.distanceKm > 10) {
      mode = "taxi";
      const { baseFare, baseKm, perKm } = config.fares.taxi;
      cost =
        baseFare +
        Math.max(0, entry.distanceKm - baseKm) * perKm;
    } else {
      mode = "auto";
      const { baseFare, baseKm, perKm } = config.fares.auto;
      cost =
        baseFare +
        Math.max(0, entry.distanceKm - baseKm) * perKm;
    }
    cost = Math.round(cost);
  } else if (transport === "two_wheeler") {
    mode = "two_wheeler";
    cost = Math.round(entry.distanceKm * config.fares.fuelCostPerKm.two_wheeler);
  } else if (transport === "car") {
    mode = "car";
    cost = Math.round(entry.distanceKm * config.fares.fuelCostPerKm.car);
  }

  return {
    fromId,
    toId,
    mode,
    durationMin: adjustedDuration,
    distanceKm: entry.distanceKm,
    cost,
  };
}
