import {
  Place,
  PlannerConfig,
  PlannerInputs,
  TravelMatrix,
  Track,
  TrackStop,
  TrackLeg,
  PaceProfile,
} from "./types";
import { SeededRNG } from "../lib/rng";
import { timeToMinutes, minutesToTime, calculateLeg } from "./travel";
import { checkIntervalFit, satisfiesMealWindows, isFoodPlace } from "./filter";
import { calculatePlaceSpend, evaluatePlanCost } from "./cost";
import { scorePlan, matchesInterest } from "./score";
import { generateTrackLabel } from "./labels";

/**
 * Determines the active pace profile based on vibeEnergy input.
 */
export function getPaceProfile(
  vibeEnergy: number,
  config: PlannerConfig
): PaceProfile {
  if (vibeEnergy <= config.paceProfiles.relaxed.energyRange[1]) {
    return config.paceProfiles.relaxed;
  }
  if (vibeEnergy >= config.paceProfiles.energetic.energyRange[0]) {
    return config.paceProfiles.energetic;
  }
  return config.paceProfiles.balanced;
}

/**
 * Resolves the start node ID from the start location inputs.
 */
export function resolveStartNodeId(
  inputs: PlannerInputs,
  config: PlannerConfig
): string {
  if (inputs.startLocation.areaId) {
    return inputs.startLocation.areaId;
  }
  // Fall back to ernakulam if none specified
  return config.supportedStartAreas[2]?.id || "ernakulam";
}

export interface CandidateExtension {
  place: Place;
  leg: TrackLeg;
  stop: TrackStop;
  idleWaitMin: number;
}

/**
 * Attempts to extend an existing partial path with a new place stop.
 * Returns null if hard constraints are violated.
 */
function tryExtend(
  currentStops: TrackStop[],
  currentLegs: TrackLeg[],
  currentDepartureMin: number,
  lastNodeId: string,
  candidatePlace: Place,
  inputs: PlannerInputs,
  config: PlannerConfig,
  paceProfile: PaceProfile,
  maxAllowedElapsedMin: number,
  startMin: number
): CandidateExtension | null {
  // Hard Constraint: No two consecutive stops of the same category
  if (currentStops.length > 0) {
    const lastCategory = currentStops[currentStops.length - 1].place.category;
    if (lastCategory === candidatePlace.category) {
      return null;
    }
  }

  // Hard Constraint: Cap per category (max 2 stops per category)
  const categoryCount = currentStops.filter(
    (s) => s.place.category === candidatePlace.category
  ).length;
  if (categoryCount >= 2) {
    return null;
  }

  // Calculate leg from previous stop
  const leg = calculateLeg(
    lastNodeId,
    candidatePlace.id,
    currentDepartureMin,
    inputs.transport,
    config as unknown as TravelMatrix, // handled by caller passing actual matrix
    config,
    inputs.groupSize
  );

  const arrivalMin = currentDepartureMin + leg.durationMin;

  // Dwell time adjusted by pace multiplier
  const dwellMin = Math.max(
    candidatePlace.durationMin.min,
    Math.round(candidatePlace.durationMin.typical * paceProfile.dwellMultiplier)
  );

  // Hard Constraint 1: Opening hours & interval fit
  const dayHours = candidatePlace.hours[inputs.dayOfWeek];
  const intervalCheck = checkIntervalFit(
    arrivalMin,
    dwellMin,
    dayHours,
    candidatePlace.fixedStart
  );

  if (!intervalCheck.fits) {
    return null;
  }

  const effectiveStartMin = intervalCheck.actualStartMin;
  const departureMin = effectiveStartMin + dwellMin;
  const elapsedFromStart = departureMin - startMin;

  // Hard Constraint 2: 10% buffer (elapsed <= 0.9 * available)
  if (elapsedFromStart > maxAllowedElapsedMin) {
    return null;
  }

  // Stop spend
  const spend = calculatePlaceSpend(candidatePlace, inputs.groupSize);

  const stop: TrackStop = {
    place: candidatePlace,
    arrivalTime: minutesToTime(arrivalMin),
    departureTime: minutesToTime(departureMin),
    dwellMin,
    spend,
  };

  // Hard Constraint 3: Budget check
  const proposedStops = [...currentStops, stop];
  const proposedLegs = [...currentLegs, leg];
  const cost = evaluatePlanCost(proposedStops, proposedLegs, inputs, config);

  if (cost.countedCostTotal > inputs.budget) {
    return null;
  }

  return {
    place: candidatePlace,
    leg,
    stop,
    idleWaitMin: intervalCheck.idleWaitMin,
  };
}

/**
 * Randomized greedy search with restarts and beam extension.
 */
export function runPlanSearch(
  candidates: Place[],
  inputs: PlannerInputs,
  matrix: TravelMatrix,
  config: PlannerConfig,
  seed: number = 42
): { feasibleTracks: Track[]; nearFeasibleTracks: Track[] } {
  const rng = new SeededRNG(seed);
  const startMin = timeToMinutes(inputs.startTime);
  const totalAvailableMin = inputs.durationHours * 60;
  const bufferFraction = config.bufferPercent ?? 0.1;
  const maxAllowedElapsedMin = totalAvailableMin * (1 - bufferFraction);

  const paceProfile = getPaceProfile(inputs.vibeEnergy, config);
  const startNodeId = resolveStartNodeId(inputs, config);

  // Scaled target stop range for trip duration
  let scaledMinStops = Math.max(
    1,
    Math.round((paceProfile.stopsTarget[0] * inputs.durationHours) / 5)
  );
  if (paceProfile.name === "energetic" && inputs.durationHours >= 3) {
    scaledMinStops = Math.max(3, scaledMinStops);
  }
  const scaledMaxStops = Math.max(
    scaledMinStops,
    Math.round((paceProfile.stopsTarget[1] * inputs.durationHours) / 5)
  );

  const feasibleTracksMap = new Map<string, Track>();
  const nearFeasibleTracks: Track[] = [];

  const restartCount = config.search.restartCount ?? 2000;
  const maxFeasible = config.search.maxFeasiblePlans ?? 50;

  // Prepare candidate pools: if interest chips are specified, prioritize matching candidates
  const matchingCandidates =
    inputs.interestChips.length > 0
      ? candidates.filter((p) =>
          inputs.interestChips.some((chip) => matchesInterest(p, chip))
        )
      : [];
  const otherCandidates =
    inputs.interestChips.length > 0
      ? candidates.filter(
          (p) => !inputs.interestChips.some((chip) => matchesInterest(p, chip))
        )
      : candidates;

  const prioritizedList =
    matchingCandidates.length > 0
      ? [...matchingCandidates, ...otherCandidates]
      : candidates;

  for (let r = 0; r < restartCount; r++) {
    // Early exit if we have gathered sufficient diverse feasible plans
    if (feasibleTracksMap.size >= maxFeasible && r >= 400) {
      break;
    }

    const currentStops: TrackStop[] = [];
    const currentLegs: TrackLeg[] = [];
    let currentDepartureMin = startMin;
    let lastNodeId = startNodeId;
    let totalIdleMin = 0;
    const visitedPlaceIds = new Set<string>();

    // Step-by-step randomized greedy expansion
    while (currentStops.length < scaledMaxStops) {
      let extended = false;

      // At each step, if interest chips are active, strongly prioritize matching candidates
      const pool =
        matchingCandidates.length > 0 && rng.next() > 0.1
          ? prioritizedList
          : candidates;

      const offset = rng.nextInt(0, pool.length - 1);

      for (let c = 0; c < pool.length; c++) {
        const place = pool[(offset + c) % pool.length];
        if (visitedPlaceIds.has(place.id)) continue;

        // Check category constraints: no two consecutive stops of same category
        if (currentStops.length > 0) {
          if (
            currentStops[currentStops.length - 1].place.category === place.category
          ) {
            continue;
          }
        }
        const catCount = currentStops.filter(
          (s) => s.place.category === place.category
        ).length;
        const maxPerCat =
          inputs.durationHours >= 6 &&
          inputs.interestChips.some((chip) => matchesInterest(place, chip))
            ? 3
            : 2;
        if (catCount >= maxPerCat) {
          continue;
        }

        const leg = calculateLeg(
          lastNodeId,
          place.id,
          currentDepartureMin,
          inputs.transport,
          matrix,
          config,
          inputs.groupSize
        );

        const arrivalMin = currentDepartureMin + leg.durationMin;
        const dwellMin = Math.max(
          place.durationMin.min,
          Math.round(place.durationMin.typical * paceProfile.dwellMultiplier)
        );

        const dayHours = place.hours[inputs.dayOfWeek];
        const intervalCheck = checkIntervalFit(
          arrivalMin,
          dwellMin,
          dayHours,
          place.fixedStart
        );

        if (!intervalCheck.fits) continue;

        const effectiveStartMin = intervalCheck.actualStartMin;
        const departureMin = effectiveStartMin + dwellMin;
        const elapsedMin = departureMin - startMin;

        // Check 10% buffer constraint
        if (elapsedMin > maxAllowedElapsedMin) {
          continue;
        }

        // Check budget
        const spend = calculatePlaceSpend(place, inputs.groupSize);
        const stop: TrackStop = {
          place,
          arrivalTime: minutesToTime(effectiveStartMin),
          departureTime: minutesToTime(departureMin),
          dwellMin,
          spend,
        };

        const testStops = [...currentStops, stop];
        const testLegs = [...currentLegs, leg];
        const cost = evaluatePlanCost(testStops, testLegs, inputs, config);

        if (cost.countedCostTotal > inputs.budget) {
          if (
            currentStops.length >= 1 &&
            cost.countedCostTotal <= inputs.budget * 1.35
          ) {
            nearFeasibleTracks.push(
              buildTrackObject(
                testStops,
                testLegs,
                inputs,
                config,
                startMin,
                totalIdleMin,
                true,
                `Budget exceeded by ₹${cost.countedCostTotal - inputs.budget}`
              )
            );
          }
          continue;
        }

        // Successfully extended with this place
        currentStops.push(stop);
        currentLegs.push(leg);
        visitedPlaceIds.add(place.id);
        currentDepartureMin = departureMin;
        lastNodeId = place.id;
        totalIdleMin += intervalCheck.idleWaitMin;
        extended = true;
        break;
      }

      // If no valid candidate could extend the itinerary, stop expanding
      if (!extended) {
        break;
      }
    }

    // Evaluate complete plan
    if (currentStops.length >= scaledMinStops || (inputs.durationHours <= 2 && currentStops.length >= 1)) {
      const planEndMin = currentDepartureMin;

      // Hard constraint 5: Meal window check
      if (
        !satisfiesMealWindows(currentStops, startMin, planEndMin, config)
      ) {
        continue;
      }

      const cost = evaluatePlanCost(currentStops, currentLegs, inputs, config);
      if (cost.countedCostTotal <= inputs.budget) {
        const track = buildTrackObject(
          currentStops,
          currentLegs,
          inputs,
          config,
          startMin,
          totalIdleMin,
          false
        );

        // Store unique path
        const key = currentStops.map((s) => s.place.id).join("->");
        if (!feasibleTracksMap.has(key)) {
          feasibleTracksMap.set(key, track);
        }
      }
    }
  }

  const feasibleTracks = Array.from(feasibleTracksMap.values()).sort(
    (a, b) => b.score - a.score
  );

  return {
    feasibleTracks: feasibleTracks.slice(0, config.search.maxFeasiblePlans ?? 50),
    nearFeasibleTracks: nearFeasibleTracks.slice(0, 5),
  };
}

/**
 * Builds a Track object with cost breakdown, score, buffer, and label.
 */
function buildTrackObject(
  stops: TrackStop[],
  legs: TrackLeg[],
  inputs: PlannerInputs,
  config: PlannerConfig,
  startMin: number,
  idleMin: number,
  isNearFeasible: boolean = false,
  bindingConstraint?: string
): Track {
  const cost = evaluatePlanCost(stops, legs, inputs, config);
  const totalTravelMin = legs.reduce((sum, l) => sum + l.durationMin, 0);
  const totalDwellMin = stops.reduce((sum, s) => sum + s.dwellMin, 0);
  const totalDurationMin = totalTravelMin + totalDwellMin + idleMin;
  const availableMin = inputs.durationHours * 60;
  const bufferMin = Math.max(0, availableMin - totalDurationMin);

  const score = scorePlan(stops, totalTravelMin, idleMin, inputs, config);

  const track: Track = {
    id: `track-${stops.map((s) => s.place.id.slice(0, 4)).join("-")}-${Math.round(score)}`,
    label: "",
    clusterId: 1,
    stops,
    legs,
    totalDurationMin,
    totalCountedCost: cost.countedCostTotal,
    totalTravelCost: cost.travelCostTotal,
    totalStopSpend: cost.stopSpendTotal,
    remainingBudget: cost.remainingBudget,
    bufferMin,
    score,
    isNearFeasible,
    bindingConstraint,
  };

  track.label = generateTrackLabel(track);
  return track;
}
