import { Place, PlannerConfig, PlannerInputs, TrackStop } from "./types";
import { timeToMinutes } from "./travel";

// Chip to category/tag mapping
export function matchesInterest(place: Place, chip: string): boolean {
  const c = chip.toLowerCase();
  const cat = place.category.toLowerCase();
  const tags = place.tags.map((t) => t.toLowerCase());

  if (c === "food") {
    return ["cafe", "restaurant", "street_food"].includes(cat) || tags.some((t) => t.includes("food"));
  }
  if (c === "heritage") {
    return ["heritage", "museum"].includes(cat) || tags.some((t) => t.includes("history") || t.includes("culture") || t.includes("architecture"));
  }
  if (c === "shopping") {
    return ["shopping", "mall"].includes(cat) || tags.some((t) => t.includes("antique") || t.includes("craft"));
  }
  if (c === "nature") {
    return ["nature", "beach"].includes(cat) || tags.some((t) => t.includes("greenery") || t.includes("walk"));
  }
  if (c === "movies") {
    return cat === "cinema";
  }
  if (c === "nightlife") {
    return cat === "nightlife" || tags.some((t) => t.includes("drink") || t.includes("bar"));
  }

  return cat.includes(c) || tags.some((t) => t.includes(c));
}

/**
 * Calculates score for a plan based on config weights.
 */
export function scorePlan(
  stops: TrackStop[],
  travelMinutes: number,
  idleMinutes: number,
  inputs: PlannerInputs,
  config: PlannerConfig
): number {
  if (stops.length === 0) return -1000;

  const weights = config.scoringWeights;
  const totalMinutes = stops.reduce((sum, s) => sum + s.dwellMin, 0) + travelMinutes + idleMinutes;

  // 1. Interest Match (0 to 1)
  let interestMatch = 0.5;
  let interestBonus = 0;
  if (inputs.interestChips.length > 0) {
    const matchedCount = stops.filter((s) =>
      inputs.interestChips.some((chip) => matchesInterest(s.place, chip))
    ).length;
    interestMatch = matchedCount / stops.length;
    if (interestMatch >= 0.5) {
      interestBonus = 25;
    } else {
      interestBonus = -25;
    }
  }

  // 2. Energy Fit (0 to 1)
  const meanEnergyDiff =
    stops.reduce(
      (sum, s) => sum + Math.abs(s.place.vibe.energy - inputs.vibeEnergy),
      0
    ) / stops.length;
  const energyFit = Math.max(0, 1 - meanEnergyDiff);

  // 3. Rating Norm (0 to 1)
  const meanRating =
    stops.reduce((sum, s) => sum + (s.place.rating ?? 3.75), 0) / stops.length;
  const ratingNorm = Math.min(1, Math.max(0, meanRating / 5.0));

  // 4. Diversity (0 to 1)
  const uniqueCats = new Set(stops.map((s) => s.place.category));
  const diversity = uniqueCats.size / stops.length;

  // 5. Time of Day Fit (0 to 1)
  let todMatches = 0;
  stops.forEach((s) => {
    const arrMin = timeToMinutes(s.arrivalTime);
    const isSunsetPlace =
      s.place.tags.includes("sunset") ||
      s.place.category === "beach" ||
      s.place.category === "nature";
    const isNightlifePlace = s.place.category === "nightlife";

    // Sunset in Kochi is roughly 17:30 - 18:45 (1050 to 1125 mins)
    if (isSunsetPlace && arrMin >= 1020 && arrMin <= 1140) {
      todMatches += 1;
    } else if (isNightlifePlace && arrMin >= 1140) {
      // 19:00 onwards
      todMatches += 1;
    } else if (!isSunsetPlace && !isNightlifePlace) {
      todMatches += 0.5; // neutral
    }
  });
  const timeOfDayFit = todMatches / stops.length;

  // 6. Travel Share (0 to 1)
  const travelShare = totalMinutes > 0 ? travelMinutes / totalMinutes : 0;

  // 7. Idle Time Share (0 to 1)
  const idleShare = totalMinutes > 0 ? idleMinutes / totalMinutes : 0;

  const score =
    weights.w1_interestMatch * interestMatch +
    weights.w2_energyFit * energyFit +
    weights.w3_ratingNorm * ratingNorm +
    weights.w4_diversity * diversity +
    weights.w5_timeOfDayFit * timeOfDayFit -
    weights.w6_travelShare * travelShare -
    weights.w7_idleTime * idleShare +
    interestBonus;

  return Math.round(score * 100) / 100;
}
