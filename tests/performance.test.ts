import { describe, it, expect } from "vitest";
import { generateTracks, Place, PlannerInputs, TravelMatrix } from "../src/planner";
import { loadTestData } from "./fixtures";

describe("Performance Tests", () => {
  const { places, config, matrix } = loadTestData();

  it("generates tracks in under 300 ms for 150 places", () => {
    // Generate 150 realistic places
    const places150: Place[] = [];
    for (let i = 0; i < 150; i++) {
      const base = places[i % places.length];
      places150.push({
        ...base,
        id: `${base.id}_clone_${i}`,
        name: `${base.name} #${i + 1}`,
      });
    }

    // Build dense matrix for the 150 places + start area
    const matrix150: TravelMatrix = {};
    const allIds = ["ernakulam", ...places150.map((p) => p.id)];
    for (const from of allIds) {
      matrix150[from] = {};
      for (const to of allIds) {
        matrix150[from][to] = { minutes: 12, distanceKm: 3.5 };
      }
    }

    const inputs: PlannerInputs = {
      startLocation: {
        type: "area",
        areaId: "ernakulam",
        lat: 9.975,
        lon: 76.28,
        label: "Ernakulam Central",
      },
      startTime: "12:00",
      dayOfWeek: "saturday",
      durationHours: 5,
      budget: 3500,
      includesTravel: true,
      transport: "none",
      vibeEnergy: 0.5,
      interestChips: ["heritage", "food"],
      groupSize: 1,
      vegOnly: false,
      rainyOnly: false,
    };

    const start = performance.now();
    const result = generateTracks(inputs, places150, matrix150, config, 42);
    const elapsedMs = performance.now() - start;

    console.log(`[PERFORMANCE TEST] 150 places generated in ${Math.round(elapsedMs)} ms (meta says: ${result.meta.executionTimeMs} ms)`);

    expect(result.tracks.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(300);
  });
});
