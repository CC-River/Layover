import { describe, it, expect } from "vitest";
import {
  generateTracks,
  PlannerInputs,
  isFoodPlace,
  timeToMinutes,
  categoryJaccardDistance,
} from "../src/planner";
import { loadTestData } from "./fixtures";

describe("Scenario Tests (T1 - T6)", () => {
  const { places, config, matrix } = loadTestData();

  // T1: 5h, Rs3000, includes travel, no vehicle, relaxed, start 2pm
  // -> 3 distinct tracks of 2-3 stops, cost <= 3000 including legs, one food stop, >= 30 min buffer
  it("T1: 5h, Rs3000, includes travel, no vehicle, relaxed, start 2pm", () => {
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
      budget: 3000,
      includesTravel: true,
      transport: "none",
      vibeEnergy: 0.2, // Relaxed
      interestChips: [],
      groupSize: 1,
      vegOnly: false,
      rainyOnly: false,
    };

    const result = generateTracks(inputs, places, matrix, config, 100);

    expect(result.tracks.length).toEqual(3);

    result.tracks.forEach((track) => {
      // 2-3 stops
      expect(track.stops.length).toBeGreaterThanOrEqual(2);
      expect(track.stops.length).toBeLessThanOrEqual(3);

      // cost <= 3000 including legs
      expect(track.totalCountedCost).toBeLessThanOrEqual(3000);

      // one food stop
      const hasFoodStop = track.stops.some((s) => isFoodPlace(s.place));
      expect(hasFoodStop).toBe(true);

      // >= 30 min buffer
      expect(track.bufferMin).toBeGreaterThanOrEqual(30);
    });

    // The three tracks must differ in category sets
    const d01 = categoryJaccardDistance(result.tracks[0], result.tracks[1]);
    const d02 = categoryJaccardDistance(result.tracks[0], result.tracks[2]);
    const d12 = categoryJaccardDistance(result.tracks[1], result.tracks[2]);
    expect(d01).toBeGreaterThan(0);
    expect(d02).toBeGreaterThan(0);
    expect(d12).toBeGreaterThan(0);
  });

  // T2: 3h, Rs500, excludes travel, two-wheeler, energetic
  // -> stops sum <= 500, travel shown separately, 3+ stops, fuel and parking shown
  it("T2: 3h, Rs500, excludes travel, two-wheeler, energetic", () => {
    const inputs: PlannerInputs = {
      startLocation: {
        type: "area",
        areaId: "ernakulam",
        lat: 9.975,
        lon: 76.28,
        label: "Ernakulam Central",
      },
      startTime: "15:00",
      dayOfWeek: "saturday",
      durationHours: 3,
      budget: 500,
      includesTravel: false, // excludes travel
      transport: "two_wheeler",
      vibeEnergy: 0.85, // energetic
      interestChips: [],
      groupSize: 1,
      vegOnly: false,
      rainyOnly: false,
    };

    const result = generateTracks(inputs, places, matrix, config, 200);

    expect(result.tracks.length).toBeGreaterThan(0);
    const track = result.tracks[0];

    // stops sum <= 500
    expect(track.totalStopSpend).toBeLessThanOrEqual(500);

    // 3+ stops
    expect(track.stops.length).toBeGreaterThanOrEqual(3);

    // Travel shown separately
    expect(track.totalTravelCost).toBeGreaterThan(0);

    // Fuel and parking accounted for
    expect(track.legs.some((l) => l.cost > 0) || track.totalTravelCost > 0).toBe(true);
  });

  // T3: 8h, Rs1500, heritage only
  // -> majority heritage/museum, includes lunch, Fort Kochi crossing handled
  it("T3: 8h, Rs1500, heritage only", () => {
    const inputs: PlannerInputs = {
      startLocation: {
        type: "area",
        areaId: "ernakulam",
        lat: 9.975,
        lon: 76.28,
        label: "Ernakulam Central",
      },
      startTime: "10:00",
      dayOfWeek: "saturday",
      durationHours: 8,
      budget: 1500,
      includesTravel: true,
      transport: "none",
      vibeEnergy: 0.5,
      interestChips: ["heritage"],
      groupSize: 1,
      vegOnly: false,
      rainyOnly: false,
    };

    const result = generateTracks(inputs, places, matrix, config, 300);

    expect(result.tracks.length).toBeGreaterThan(0);
    const track = result.tracks[0];

    // Majority heritage or museum
    const heritageCount = track.stops.filter(
      (s) => s.place.category === "heritage" || s.place.category === "museum"
    ).length;
    expect(heritageCount / track.stops.length).toBeGreaterThanOrEqual(0.5);

    // Includes lunch (12:00 to 15:00)
    const hasLunchStop = track.stops.some((s) => {
      const arr = timeToMinutes(s.arrivalTime);
      const dep = timeToMinutes(s.departureTime);
      return isFoodPlace(s.place) && Math.max(arr, 720) < Math.min(dep, 900);
    });
    expect(hasLunchStop).toBe(true);

    // Fort Kochi crossing handled
    const hasCrossing =
      track.stops.some(
        (s) => s.place.area === "Fort Kochi" || s.place.area === "Mattancherry"
      ) ||
      track.legs.some((l) => l.durationMin >= 20);
    expect(hasCrossing).toBe(true);
  });

  // T4: 4h, Rs2000, start 6pm, nightlife + food
  // -> no closing-time violation, at least one nightlife or dinner stop, no daytime-only place
  it("T4: 4h, Rs2000, start 6pm, nightlife + food", () => {
    const inputs: PlannerInputs = {
      startLocation: {
        type: "area",
        areaId: "ernakulam",
        lat: 9.975,
        lon: 76.28,
        label: "Ernakulam Central",
      },
      startTime: "18:00",
      dayOfWeek: "saturday",
      durationHours: 4,
      budget: 2000,
      includesTravel: true,
      transport: "none",
      vibeEnergy: 0.7,
      interestChips: ["nightlife", "food"],
      groupSize: 1,
      vegOnly: false,
      rainyOnly: false,
    };

    const result = generateTracks(inputs, places, matrix, config, 400);

    expect(result.tracks.length).toBeGreaterThan(0);
    result.tracks.forEach((track) => {
      // At least one nightlife or dinner food stop
      const hasNightlifeOrDinner = track.stops.some(
        (s) =>
          s.place.category === "nightlife" ||
          (isFoodPlace(s.place) && timeToMinutes(s.departureTime) >= 1140)
      );
      expect(hasNightlifeOrDinner).toBe(true);

      // No daytime-only places (must be open after 18:00)
      track.stops.forEach((s) => {
        const arr = timeToMinutes(s.arrivalTime);
        const dep = timeToMinutes(s.departureTime);
        expect(arr).toBeGreaterThanOrEqual(timeToMinutes("18:00"));
        expect(dep).toBeLessThanOrEqual(timeToMinutes("22:30"));
      });
    });
  });

  // T5: rainy, 4h, Rs1200 -> all stops indoor or covered
  it("T5: rainy, 4h, Rs1200", () => {
    const inputs: PlannerInputs = {
      startLocation: {
        type: "area",
        areaId: "ernakulam",
        lat: 9.975,
        lon: 76.28,
        label: "Ernakulam Central",
      },
      startTime: "13:00",
      dayOfWeek: "saturday",
      durationHours: 4,
      budget: 1200,
      includesTravel: true,
      transport: "none",
      vibeEnergy: 0.4,
      interestChips: [],
      groupSize: 1,
      vegOnly: false,
      rainyOnly: true, // Active rainy filter
    };

    const result = generateTracks(inputs, places, matrix, config, 500);

    expect(result.tracks.length).toBeGreaterThan(0);
    result.tracks.forEach((track) => {
      track.stops.forEach((s) => {
        const isCovered = s.place.indoor || s.place.tags.includes("rainy_day_ok");
        expect(isCovered).toBe(true);
      });
    });
  });

  // T6: 2h, Rs100 -> graceful result: free/cheap places, or a clear message naming the binding constraint
  it("T6: 2h, Rs100", () => {
    const inputs: PlannerInputs = {
      startLocation: {
        type: "area",
        areaId: "ernakulam",
        lat: 9.975,
        lon: 76.28,
        label: "Ernakulam Central",
      },
      startTime: "15:00",
      dayOfWeek: "saturday",
      durationHours: 2,
      budget: 100,
      includesTravel: true,
      transport: "none",
      vibeEnergy: 0.5,
      interestChips: [],
      groupSize: 1,
      vegOnly: false,
      rainyOnly: false,
    };

    const result = generateTracks(inputs, places, matrix, config, 600);

    if (result.tracks.length > 0) {
      // If a track was found, counted cost must be <= 100 or marked near-feasible
      const track = result.tracks[0];
      if (!track.isNearFeasible) {
        expect(track.totalCountedCost).toBeLessThanOrEqual(100);
      } else {
        expect(track.bindingConstraint).toBeDefined();
      }
    } else {
      // Must return a clear explanatory message naming the binding constraint
      const msg = result.messages.join(" ").toLowerCase();
      expect(msg.includes("budget") || msg.includes("100")).toBe(true);
    }
  });
});
