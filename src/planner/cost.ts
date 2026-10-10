import {
  Place,
  PlannerConfig,
  PlannerInputs,
  TrackLeg,
  TrackStop,
} from "./types";

/**
 * Computes spend for a place given group size.
 * Uses typical spend, checking spendIsPerGroup.
 */
export function calculatePlaceSpend(
  place: Place,
  groupSize: number = 1
): number {
  if (place.spendIsPerGroup) {
    return place.spendPerPerson.typical;
  }
  return place.spendPerPerson.typical * groupSize;
}

/**
 * Computes minimum possible spend for candidate pre-filtering.
 */
export function calculateMinPlaceSpend(
  place: Place,
  groupSize: number = 1
): number {
  if (place.spendIsPerGroup) {
    return place.spendPerPerson.min;
  }
  return place.spendPerPerson.min * groupSize;
}

/**
 * Computes parking fee for a stop based on user vehicle type.
 */
export function getStopParkingCost(
  place: Place,
  transport: PlannerInputs["transport"],
  config: PlannerConfig
): number {
  if (transport === "none") return 0;
  if (place.parkingCost !== undefined) {
    return place.parkingCost;
  }
  return config.fares.defaultParkingCost[transport] || 0;
}

export interface CostBreakdown {
  stopSpendTotal: number;
  legTransitCostTotal: number;
  parkingCostTotal: number;
  travelCostTotal: number;
  countedCostTotal: number;
  remainingBudget: number;
}

/**
 * Evaluates the total cost breakdown of a proposed sequence of stops and legs.
 */
export function evaluatePlanCost(
  stops: TrackStop[],
  legs: TrackLeg[],
  inputs: PlannerInputs,
  config: PlannerConfig
): CostBreakdown {
  const stopSpendTotal = stops.reduce((sum, s) => sum + s.spend, 0);
  const legTransitCostTotal = legs.reduce((sum, l) => sum + l.cost, 0);
  const parkingCostTotal = stops.reduce(
    (sum, s) => sum + getStopParkingCost(s.place, inputs.transport, config),
    0
  );

  const travelCostTotal = legTransitCostTotal + parkingCostTotal;

  const countedCostTotal = inputs.includesTravel
    ? stopSpendTotal + travelCostTotal
    : stopSpendTotal;

  const remainingBudget = inputs.budget - countedCostTotal;

  return {
    stopSpendTotal,
    legTransitCostTotal,
    parkingCostTotal,
    travelCostTotal,
    countedCostTotal,
    remainingBudget,
  };
}
