import {
  Place,
  PlannerConfig,
  PlannerInputs,
  TravelMatrix,
  Weekday,
  TimeInterval,
} from "./types";
import { timeToMinutes } from "./travel";
import { calculateMinPlaceSpend } from "./cost";

export const FOOD_CATEGORIES = new Set(["cafe", "restaurant", "street_food"]);

export function isFoodPlace(place: Place): boolean {
  return FOOD_CATEGORIES.has(place.category);
}

/**
 * Checks if a place complies with active dietary/weather filters.
 */
export function matchesActiveFilters(
  place: Place,
  inputs: PlannerInputs
): boolean {
  if (inputs.vegOnly) {
    if (isFoodPlace(place) && !place.tags.includes("veg_friendly")) {
      return false;
    }
  }

  if (inputs.rainyOnly) {
    if (!place.indoor && !place.tags.includes("rainy_day_ok")) {
      return false;
    }
  }

  return true;
}

/**
 * Converts an open/close interval into minute values [openMin, closeMin].
 * Supports past-midnight intervals (e.g., 18:00 to 01:00 -> 1080 to 1500).
 */
export function normalizeInterval(interval: TimeInterval): [number, number] {
  const openMin = timeToMinutes(interval.open);
  let closeMin = timeToMinutes(interval.close);
  if (closeMin <= openMin) {
    closeMin += 1440;
  }
  return [openMin, closeMin];
}

/**
 * Checks if a proposed stay [arrivalMin, departureMin] fits inside any open interval.
 * Returns { fits: boolean, idleWaitMin: number, adjustedArrivalMin: number }
 */
export function checkIntervalFit(
  arrivalMin: number,
  dwellMin: number,
  intervals: TimeInterval[],
  fixedStarts?: string[]
): { fits: boolean; idleWaitMin: number; actualStartMin: number } {
  if (!intervals || intervals.length === 0) {
    return { fits: false, idleWaitMin: 0, actualStartMin: arrivalMin };
  }

  // Handle fixedStart if specified (e.g. cinema showtimes or ferry slots)
  if (fixedStarts && fixedStarts.length > 0) {
    for (const fs of fixedStarts) {
      const slotMin = timeToMinutes(fs);
      // Can arrive up to 30 mins early or right at slot time
      if (arrivalMin <= slotMin && slotMin - arrivalMin <= 30) {
        const depMin = slotMin + dwellMin;
        // Verify slot falls inside open intervals
        for (const interval of intervals) {
          const [openMin, closeMin] = normalizeInterval(interval);
          if (slotMin >= openMin && depMin <= closeMin) {
            return {
              fits: true,
              idleWaitMin: Math.max(0, slotMin - arrivalMin),
              actualStartMin: slotMin,
            };
          }
        }
      }
    }
    // If fixed starts exist and none matched
    return { fits: false, idleWaitMin: 0, actualStartMin: arrivalMin };
  }

  // Standard intervals: arrival >= open and departure <= close
  for (const interval of intervals) {
    const [openMin, closeMin] = normalizeInterval(interval);

    // Hard constraint 1: arrival >= open and departure <= close
    if (arrivalMin >= openMin && arrivalMin + dwellMin <= closeMin) {
      return {
        fits: true,
        idleWaitMin: 0,
        actualStartMin: arrivalMin,
      };
    }
  }

  return { fits: false, idleWaitMin: 0, actualStartMin: arrivalMin };
}

/**
 * Checks if a meal window falling inside the itinerary is satisfied by food stops.
 */
export function satisfiesMealWindows(
  stops: { place: Place; arrivalTime: string; departureTime: string }[],
  planStartMin: number,
  planEndMin: number,
  config: PlannerConfig
): boolean {
  const windows = [config.mealWindows.lunch, config.mealWindows.dinner];

  for (const win of windows) {
    const winStart = timeToMinutes(win.start);
    const winEnd = timeToMinutes(win.end);

    // Does this meal window overlap significantly with the plan?
    const overlapStart = Math.max(planStartMin, winStart);
    const overlapEnd = Math.min(planEndMin, winEnd);
    const overlapDuration = overlapEnd - overlapStart;

    // If plan overlaps with the meal window by at least 45 minutes, must include a food stop in it
    if (overlapDuration >= 45) {
      const hasFoodStopInWindow = stops.some((s) => {
        if (!isFoodPlace(s.place)) return false;
        const arr = timeToMinutes(s.arrivalTime);
        const dep = timeToMinutes(s.departureTime);
        // Stop overlaps with meal window
        return Math.max(arr, winStart) < Math.min(dep, winEnd);
      });

      if (!hasFoodStopInWindow) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Pre-filters candidate places before running the search algorithm.
 */
export function filterCandidates(
  places: Place[],
  inputs: PlannerInputs,
  matrix: TravelMatrix,
  config: PlannerConfig
): Place[] {
  const startMin = timeToMinutes(inputs.startTime);
  const totalAvailableMin = inputs.durationHours * 60;
  const endMin = startMin + totalAvailableMin;
  const startNodeId = inputs.startLocation.areaId || "ernakulam";

  return places.filter((place) => {
    // 1. Must match active filters (vegetarian, rainy day)
    if (!matchesActiveFilters(place, inputs)) {
      return false;
    }

    // 2. Must be open on the selected day
    const dayHours = place.hours[inputs.dayOfWeek];
    if (!dayHours || dayHours.length === 0) {
      return false;
    }

    // 3. Minimum spend must not exceed total budget
    const minSpend = calculateMinPlaceSpend(place, inputs.groupSize);
    if (inputs.includesTravel) {
      if (minSpend > inputs.budget) return false;
    } else {
      if (minSpend > inputs.budget) return false;
    }

    // 4. Travel from start + min dwell must fit within total available time
    const initialTravel = matrix[startNodeId]?.[place.id]?.minutes ?? 15;
    if (initialTravel + place.durationMin.min > totalAvailableMin) {
      return false;
    }

    // 5. Must have some open hours overlapping with the trip window
    const hasOverlap = dayHours.some((interval) => {
      const [openMin, closeMin] = normalizeInterval(interval);
      return Math.max(startMin, openMin) < Math.min(endMin, closeMin);
    });

    return hasOverlap;
  });
}
