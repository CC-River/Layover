import {
  Place,
  PlannerConfig,
  PlannerInputs,
  PlannerResult,
  Track,
  TravelMatrix,
} from "./types";
import { filterCandidates } from "./filter";
import { runPlanSearch } from "./search";
import { clusterTopTracks } from "./cluster";

/**
 * Pure Planner Entry Point:
 * Takes inputs, places, matrix, config, and seed, and generates up to 3 distinct tracks.
 * Returns { tracks, messages, meta }.
 */
export function generateTracks(
  inputs: PlannerInputs,
  places: Place[],
  matrix: TravelMatrix,
  config: PlannerConfig,
  seed: number = 42
): PlannerResult {
  const startTimeMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  const messages: string[] = [];

  // 1. Candidate pre-filtering
  const candidates = filterCandidates(places, inputs, matrix, config);

  if (candidates.length < 2) {
    let reason = "Active filters or time/budget constraints eliminated available stops.";
    if (inputs.budget < 150) {
      reason = `Budget of ₹${inputs.budget} is too restrictive for multi-stop visits. Consider increasing budget.`;
    } else if (inputs.rainyOnly && candidates.length === 0) {
      reason = "Rainy day filter restricted outdoor locations. Few indoor venues match your window.";
    }
    messages.push(reason);

    return {
      tracks: [],
      messages,
      meta: {
        evaluatedCount: places.length,
        feasibleCount: 0,
        seed,
        executionTimeMs: Math.round(
          (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTimeMs
        ),
      },
    };
  }

  // 2. Search
  const { feasibleTracks, nearFeasibleTracks } = runPlanSearch(
    candidates,
    inputs,
    matrix,
    config,
    seed
  );

  // 3. Cluster into up to 3 distinct tracks
  const { selected, clusterCount } = clusterTopTracks(feasibleTracks, 3);

  if (clusterCount === 0) {
    if (nearFeasibleTracks.length > 0) {
      const near = nearFeasibleTracks[0];
      messages.push(
        near.bindingConstraint
          ? `No plan met all strict constraints (${near.bindingConstraint}). Showing closest near-feasible route.`
          : "No plan met all strict constraints. Showing closest near-feasible route."
      );
      return {
        tracks: [near],
        messages,
        meta: {
          evaluatedCount: candidates.length,
          feasibleCount: 0,
          seed,
          executionTimeMs: Math.round(
            (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTimeMs
          ),
        },
      };
    } else {
      messages.push(
        "No feasible itinerary found within the given budget, time buffer, and opening hours. Try expanding time or budget."
      );
    }
  } else if (clusterCount < 3) {
    messages.push(
      `Found ${clusterCount} viable itinerary track(s). The search space was constrained by time (${inputs.durationHours}h) or budget (₹${inputs.budget}).`
    );
  }

  const executionTimeMs = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - startTimeMs
  );

  return {
    tracks: selected,
    messages,
    meta: {
      evaluatedCount: candidates.length,
      feasibleCount: feasibleTracks.length,
      seed,
      executionTimeMs,
    },
  };
}

/**
 * Replaces a specific stop in a track with a feasible alternative, preserving locked stops.
 */
export function swapStop(
  currentTrack: Track,
  stopIdToSwap: string,
  lockedStopIds: string[],
  inputs: PlannerInputs,
  places: Place[],
  matrix: TravelMatrix,
  config: PlannerConfig,
  seed: number = 42
): Track | null {
  // Exclude the stop being swapped out
  const filteredPlaces = places.filter((p) => p.id !== stopIdToSwap);

  // Re-run planner with fresh seed
  const result = generateTracks(
    inputs,
    filteredPlaces,
    matrix,
    config,
    seed + 1001
  );

  if (result.tracks.length === 0) {
    return null;
  }

  // Look for a track containing as many locked stops as possible
  if (lockedStopIds.length > 0) {
    const matchingTrack = result.tracks.find((t) =>
      lockedStopIds.every((lockedId) => t.stops.some((s) => s.place.id === lockedId))
    );
    if (matchingTrack) return matchingTrack;
  }

  return result.tracks[0];
}

// Re-export modules for consumers and testing
export * from "./types";
export * from "./schema";
export * from "./travel";
export * from "./cost";
export * from "./filter";
export * from "./score";
export * from "./cluster";
export * from "./labels";
export * from "./search";
