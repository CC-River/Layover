export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export const PLACE_CATEGORIES = [
  "cafe",
  "restaurant",
  "street_food",
  "mall",
  "shopping",
  "cinema",
  "heritage",
  "museum",
  "nature",
  "beach",
  "nightlife",
  "activity",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export interface TimeInterval {
  open: string; // "HH:MM" 24h
  close: string; // "HH:MM" 24h, supports past-midnight e.g. "01:30"
}

export type WeekdayHours = Record<Weekday, TimeInterval[]>;

export interface PlaceVibe {
  energy: number; // 0 - 1
  social: number; // 0 - 1
}

export interface SpendRange {
  min: number;
  typical: number;
}

export interface DurationRange {
  min: number;
  typical: number;
}

export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  area: string;
  category: PlaceCategory;
  vibe: PlaceVibe;
  tags: string[];
  spendPerPerson: SpendRange;
  spendIsPerGroup: boolean;
  durationMin: DurationRange;
  hours: WeekdayHours;
  fixedStart?: string[]; // e.g. ["10:30", "14:30"]
  parkingCost?: number;
  indoor: boolean;
  rating?: number; // 0 - 5
  blurb: string;
  source: string;
  verifiedOn: string | null; // ISO Date string or null
}

export type TransportMode = "none" | "two_wheeler" | "car";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface StartLocation {
  type: "area" | "coords";
  areaId?: string;
  lat: number;
  lon: number;
  label: string;
}

export interface PlannerInputs {
  startLocation: StartLocation;
  startTime: string; // "HH:MM"
  dayOfWeek: Weekday;
  durationHours: number; // 1 to 12
  budget: number; // Positive integer in INR
  includesTravel: boolean; // REQUIRED: counts transit in budget if true
  transport: TransportMode;
  vibeEnergy: number; // 0 (chill) to 1 (energetic)
  interestChips: string[]; // e.g. ["food", "heritage", "shopping"]
  groupSize: number; // default 1
  vegOnly: boolean; // default false
  rainyOnly: boolean; // default false
}

export interface CongestionRule {
  start: string;
  end: string;
  factor: number;
}

export interface MealWindow {
  start: string;
  end: string;
}

export interface PaceProfile {
  name: "relaxed" | "balanced" | "energetic";
  energyRange: [number, number];
  stopsTarget: [number, number];
  dwellMultiplier: number;
  maxTravelShare: number;
}

export interface ScoringWeights {
  w1_interestMatch: number;
  w2_energyFit: number;
  w3_ratingNorm: number;
  w4_diversity: number;
  w5_timeOfDayFit: number;
  w6_travelShare: number;
  w7_idleTime: number;
}

export interface AreaNode {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isMainland: boolean;
}

export interface PlannerConfig {
  fares: {
    auto: { baseFare: number; baseKm: number; perKm: number };
    taxi: { baseFare: number; baseKm: number; perKm: number };
    walkingMaxDistanceKm: number;
    walkingSpeedKmh: number;
    fuelCostPerKm: {
      two_wheeler: number;
      car: number;
    };
    defaultParkingCost: {
      two_wheeler: number;
      car: number;
    };
  };
  congestion: CongestionRule[];
  channelCrossing: {
    fortKochiToMainlandPenaltyMin: number;
    ferryOption: {
      available: boolean;
      durationMin: number;
      costPerPerson: number;
    };
  };
  mealWindows: {
    lunch: MealWindow;
    dinner: MealWindow;
    snacks: MealWindow;
  };
  paceProfiles: Record<"relaxed" | "balanced" | "energetic", PaceProfile>;
  scoringWeights: ScoringWeights;
  bufferPercent: number; // 0.10
  search: {
    beamWidth: number;
    restartCount: number;
    maxFeasiblePlans: number;
  };
  supportedStartAreas: AreaNode[];
  categoryIcons: Record<PlaceCategory, string>;
}

export interface MatrixEntry {
  minutes: number;
  distanceKm: number;
}

// Keyed by `${fromId}->${toId}` or nested matrix[fromId][toId]
export type TravelMatrix = Record<string, Record<string, MatrixEntry>>;

export type LegTransitMode = "walk" | "auto" | "taxi" | "two_wheeler" | "car" | "ferry";

export interface TrackLeg {
  fromId: string;
  toId: string;
  mode: LegTransitMode;
  durationMin: number;
  distanceKm: number;
  cost: number;
}

export interface TrackStop {
  place: Place;
  arrivalTime: string;
  departureTime: string;
  dwellMin: number;
  spend: number;
  isLocked?: boolean;
}

export interface Track {
  id: string;
  label: string;
  clusterId: number;
  stops: TrackStop[];
  legs: TrackLeg[];
  totalDurationMin: number;
  totalCountedCost: number;
  totalTravelCost: number;
  totalStopSpend: number;
  remainingBudget: number;
  bufferMin: number;
  score: number;
  isNearFeasible?: boolean;
  bindingConstraint?: string;
  narrative?: {
    title: string;
    intro: string;
    tips: Record<string, string>; // placeId -> tip
  };
}

export interface PlannerResult {
  tracks: Track[];
  messages: string[];
  meta: {
    evaluatedCount: number;
    feasibleCount: number;
    seed: number;
    executionTimeMs: number;
  };
}
