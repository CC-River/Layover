import { describe, it, expect } from "vitest";
import { generateTracks, PlannerInputs } from "../src/planner";
import { loadTestData } from "./fixtures";

describe("Determinism Tests", () => {
  const { places, config, matrix } = loadTestData();

  it("same inputs + seed produces strictly identical tracks", () => {
    const inputs: PlannerInputs = {
      startLocation: {
        type: "area",
        areaId: "ernakulam",
        lat: 9.975,
        lon: 76.28,
        label: "Ernakulam Central",
      },
      startTime: "14:00",
      dayOfWeek: "saturday",
      durationHours: 5,
      budget: 2500,
      includesTravel: true,
      transport: "none",
      vibeEnergy: 0.5,
      interestChips: ["heritage", "food"],
      groupSize: 1,
      vegOnly: false,
      rainyOnly: false,
    };

    const seed = 987654321;
    const run1 = generateTracks(inputs, places, matrix, config, seed);
    const run2 = generateTracks(inputs, places, matrix, config, seed);

    expect(run1.tracks.length).toBeGreaterThan(0);
    expect(run1.tracks.length).toEqual(run2.tracks.length);

    // Deep structural comparison
    expect(run1.tracks.map((t) => t.id)).toEqual(run2.tracks.map((t) => t.id));
    expect(run1.tracks.map((t) => t.score)).toEqual(run2.tracks.map((t) => t.score));
    expect(run1.tracks.map((t) => t.totalCountedCost)).toEqual(
      run2.tracks.map((t) => t.totalCountedCost)
    );
    expect(run1.tracks.map((t) => t.stops.map((s) => s.place.id))).toEqual(
      run2.tracks.map((t) => t.stops.map((s) => s.place.id))
    );
  });
});
