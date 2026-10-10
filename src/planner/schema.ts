import { z } from "zod";
import { PLACE_CATEGORIES } from "./types";

const timeStringRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const TimeIntervalSchema = z
  .object({
    open: z.string().regex(timeStringRegex, "Must be valid 24h time format HH:MM"),
    close: z.string().regex(timeStringRegex, "Must be valid 24h time format HH:MM"),
  })
  .strict();

export const WeekdayHoursSchema = z
  .object({
    monday: z.array(TimeIntervalSchema),
    tuesday: z.array(TimeIntervalSchema),
    wednesday: z.array(TimeIntervalSchema),
    thursday: z.array(TimeIntervalSchema),
    friday: z.array(TimeIntervalSchema),
    saturday: z.array(TimeIntervalSchema),
    sunday: z.array(TimeIntervalSchema),
  })
  .strict();

export const PlaceSchema = z
  .object({
    id: z.string().min(1, "Place ID must not be empty"),
    name: z.string().min(1, "Name must not be empty"),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    area: z.string().min(1),
    category: z.enum(PLACE_CATEGORIES),
    vibe: z
      .object({
        energy: z.number().min(0).max(1),
        social: z.number().min(0).max(1),
      })
      .strict(),
    tags: z.array(z.string()),
    spendPerPerson: z
      .object({
        min: z.number().nonnegative(),
        typical: z.number().nonnegative(),
      })
      .refine((data) => data.typical >= data.min, {
        message: "typical spend must be >= min spend",
      }),
    spendIsPerGroup: z.boolean(),
    durationMin: z
      .object({
        min: z.number().positive(),
        typical: z.number().positive(),
      })
      .refine((data) => data.typical >= data.min, {
        message: "typical duration must be >= min duration",
      }),
    hours: WeekdayHoursSchema,
    fixedStart: z.array(z.string().regex(timeStringRegex)).optional(),
    parkingCost: z.number().nonnegative().optional(),
    indoor: z.boolean(),
    rating: z.number().min(0).max(5).optional(),
    blurb: z.string().min(1),
    source: z.string().min(1),
    verifiedOn: z.string().nullable(),
  })
  .strict();

export const PlacesListSchema = z.array(PlaceSchema);

export const CongestionRuleSchema = z
  .object({
    start: z.string().regex(timeStringRegex),
    end: z.string().regex(timeStringRegex),
    factor: z.number().positive(),
  })
  .strict();

export const MealWindowSchema = z
  .object({
    start: z.string().regex(timeStringRegex),
    end: z.string().regex(timeStringRegex),
  })
  .strict();

export const PaceProfileSchema = z
  .object({
    name: z.enum(["relaxed", "balanced", "energetic"]),
    energyRange: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
    stopsTarget: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    dwellMultiplier: z.number().positive(),
    maxTravelShare: z.number().min(0).max(1),
  })
  .strict();

export const AreaNodeSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    isMainland: z.boolean(),
  })
  .strict();

export const ConfigSchema = z
  .object({
    fares: z
      .object({
        auto: z.object({
          baseFare: z.number().nonnegative(),
          baseKm: z.number().positive(),
          perKm: z.number().positive(),
        }),
        taxi: z.object({
          baseFare: z.number().nonnegative(),
          baseKm: z.number().positive(),
          perKm: z.number().positive(),
        }),
        walkingMaxDistanceKm: z.number().nonnegative(),
        walkingSpeedKmh: z.number().positive(),
        fuelCostPerKm: z.object({
          two_wheeler: z.number().nonnegative(),
          car: z.number().nonnegative(),
        }),
        defaultParkingCost: z.object({
          two_wheeler: z.number().nonnegative(),
          car: z.number().nonnegative(),
        }),
      })
      .strict(),
    congestion: z.array(CongestionRuleSchema),
    channelCrossing: z
      .object({
        fortKochiToMainlandPenaltyMin: z.number().nonnegative(),
        ferryOption: z.object({
          available: z.boolean(),
          durationMin: z.number().positive(),
          costPerPerson: z.number().nonnegative(),
        }),
      })
      .strict(),
    mealWindows: z
      .object({
        lunch: MealWindowSchema,
        dinner: MealWindowSchema,
        snacks: MealWindowSchema,
      })
      .strict(),
    paceProfiles: z
      .object({
        relaxed: PaceProfileSchema,
        balanced: PaceProfileSchema,
        energetic: PaceProfileSchema,
      })
      .strict(),
    scoringWeights: z
      .object({
        w1_interestMatch: z.number().nonnegative(),
        w2_energyFit: z.number().nonnegative(),
        w3_ratingNorm: z.number().nonnegative(),
        w4_diversity: z.number().nonnegative(),
        w5_timeOfDayFit: z.number().nonnegative(),
        w6_travelShare: z.number().nonnegative(),
        w7_idleTime: z.number().nonnegative(),
      })
      .strict(),
    bufferPercent: z.number().min(0).max(0.5),
    search: z
      .object({
        beamWidth: z.number().int().positive(),
        restartCount: z.number().int().positive(),
        maxFeasiblePlans: z.number().int().positive(),
      })
      .strict(),
    supportedStartAreas: z.array(AreaNodeSchema),
    categoryIcons: z.record(z.enum(PLACE_CATEGORIES), z.string()),
  })
  .strict();

export const MatrixEntrySchema = z
  .object({
    minutes: z.number().nonnegative(),
    distanceKm: z.number().nonnegative(),
  })
  .strict();

export const TravelMatrixSchema = z.record(z.string(), z.record(z.string(), MatrixEntrySchema));

export const PlannerInputsSchema = z
  .object({
    startLocation: z.object({
      type: z.enum(["area", "coords"]),
      areaId: z.string().optional(),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      label: z.string().min(1),
    }),
    startTime: z.string().regex(timeStringRegex, "Start time must be HH:MM"),
    dayOfWeek: z.enum([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]),
    durationHours: z.number().min(1).max(12),
    budget: z.number().int().positive("Budget must be a positive integer in INR"),
    includesTravel: z.boolean({
      required_error: "includesTravel is required with no silent default",
    }),
    transport: z.enum(["none", "two_wheeler", "car"]),
    vibeEnergy: z.number().min(0).max(1),
    interestChips: z.array(z.string()),
    groupSize: z.number().int().min(1).default(1),
    vegOnly: z.boolean().default(false),
    rainyOnly: z.boolean().default(false),
  })
  .strict();
