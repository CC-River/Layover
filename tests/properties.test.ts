import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  generateTracks,
  PlannerInputs,
  Weekday,
  TransportMode,
  isFoodPlace,
  timeToMinutes,
  normalizeInterval,
} from "../src/planner";
import { loadTestData } from "./fixtures";

describe("Property Tests (fast-check 1,000+ randomized inputs)", () => {
  const { places, config, matrix } = loadTestData();
  const propertyConfig = {
    ...config,
    search: {
      ...config.search,
      restartCount: 100,
    },
  };

  const weekdayArb = fc.constantFrom<Weekday>(
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  );

  const transportArb = fc.constantFrom<TransportMode>(
    "none",
    "two_wheeler",
    "car"
  );

  const startAreaArb = fc.constantFrom(
    "ernakulam",
    "fort_kochi",
    "mattancherry",
    "edappally"
  );

  const hourArb = fc.integer({ min: 8, max: 20 });
  const minuteArb = fc.constantFrom(0, 15, 30, 45);

  const plannerInputArb = fc.record({
    startArea: startAreaArb,
    hour: hourArb,
    minute: minuteArb,
    dayOfWeek: weekdayArb,
    durationHours: fc.integer({ min: 2, max: 8 }),
    budget: fc.integer({ min: 300, max: 8000 }),
    includesTravel: fc.boolean(),
    transport: transportArb,
    vibeEnergy: fc.float({ min: 0, max: 1 }),
    groupSize: fc.integer({ min: 1, max: 4 }),
    vegOnly: fc.boolean(),
    rainyOnly: fc.boolean(),
    seed: fc.integer({ min: 1, max: 1000000 }),
  });

  it(
    "satisfies all hard invariant constraints across 1000+ randomized trips",
    { timeout: 30000 },
    () => {
    fc.assert(
      fc.property(plannerInputArb, (spec) => {
        const startTimeStr = `${spec.hour.toString().padStart(2, "0")}:${spec.minute.toString().padStart(2, "0")}`;

        const inputs: PlannerInputs = {
          startLocation: {
            type: "area",
            areaId: spec.startArea,
            lat: 9.975,
            lon: 76.28,
            label: spec.startArea,
          },
          startTime: startTimeStr,
          dayOfWeek: spec.dayOfWeek,
          durationHours: spec.durationHours,
          budget: spec.budget,
          includesTravel: spec.includesTravel,
          transport: spec.transport,
          vibeEnergy: spec.vibeEnergy,
          interestChips: [],
          groupSize: spec.groupSize,
          vegOnly: spec.vegOnly,
          rainyOnly: spec.rainyOnly,
        };

        const result = generateTracks(inputs, places, matrix, propertyConfig, spec.seed);

        for (const track of result.tracks) {
          if (track.isNearFeasible) {
            continue; // Near-feasible fallback plans intentionally flag constraint relaxation
          }

          // Invariant 1: Total duration never exceeds limit
          const maxAvailableMin = inputs.durationHours * 60;
          expect(track.totalDurationMin).toBeLessThanOrEqual(maxAvailableMin);

          // Invariant 2: Counted cost never exceeds budget
          expect(track.totalCountedCost).toBeLessThanOrEqual(inputs.budget);

          // Invariant 3: Active filters always hold
          if (inputs.vegOnly) {
            for (const stop of track.stops) {
              if (isFoodPlace(stop.place)) {
                expect(stop.place.tags).toContain("veg_friendly");
              }
            }
          }

          if (inputs.rainyOnly) {
            for (const stop of track.stops) {
              const isCovered =
                stop.place.indoor || stop.place.tags.includes("rainy_day_ok");
              expect(isCovered).toBe(true);
            }
          }

          // Invariant 4: No stop outside opening hours
          for (const stop of track.stops) {
            const arrMin = timeToMinutes(stop.arrivalTime);
            const depMin = timeToMinutes(stop.departureTime);
            const dayIntervals = stop.place.hours[inputs.dayOfWeek];

            const fitsSomeInterval = dayIntervals.some((interval) => {
              const [openMin, closeMin] = normalizeInterval(interval);
              return arrMin >= openMin && depMin <= closeMin;
            });

            expect(fitsSomeInterval).toBe(true);
          }
        }
      }),
      { numRuns: 1000 }
    );
  });
});
