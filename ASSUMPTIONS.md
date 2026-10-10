# ASSUMPTIONS.md - "EVERYWHERE" MVP (Kochi, India)

This document tracks all explicit assumptions made during the design, data compilation, and implementation of the MVP.

## 1. Domain & Data Assumptions
- **Seed Data Accuracy**: All 30 seed place records are realistic engineering estimates (`source: "seed-estimate"`, `verifiedOn: null`). Lat/lon coordinates are approximate centroids in Fort Kochi, Mattancherry, and mainland Ernakulam (Marine Drive, MG Road, Edappally, etc.). Real operational hours, ticket prices, and exact entrances must be verified by a human curator before public production launch.
- **Hours Representation**: Hours are specified per day of the week (`monday` through `sunday`). Each day has zero or more time intervals `[{ "open": "HH:MM", "close": "HH:MM" }]`. If a venue closes past midnight (e.g. `open: "19:00", close: "01:00"`), the close time represents the next calendar day's early morning.
- **Start Locations**: Start locations can be selected by predefined area center (e.g., Ernakulam Junction, Fort Kochi Ferry, Edappally, Marine Drive) or GPS coordinates. Geolocation outside the greater Kochi bounding box falls back to the nearest supported Kochi area center.
- **Group Spend**: If `spendIsPerGroup` is `true` (e.g. boat rental, fixed guide fee), spend is not multiplied by group size. Otherwise, spend = `typical * groupSize`.
- **Ferry vs Road**: Fort Kochi and mainland Ernakulam are separated by the backwaters/harbor. Road travel via Willingdon Island bridges takes ~30-45 minutes in traffic, while the Ro-Ro or passenger ferry takes ~15-20 minutes. A config-driven crossing penalty and ferry option is modeled.

## 2. Travel & Cost Assumptions
- **Travel Speed**: Default haversine fallback uses a road factor of 1.35 and an average urban speed of 25 km/h.
- **Walking Threshold**: Legs under `walkingMaxDistanceKm` (default 0.8 km) are assumed to be walkable at 4.5 km/h and incur zero transit cost.
- **Transit Fares**:
  - Auto/Taxi: Kerala government standard baseline rates (Auto minimum fare ~₹30 for 1.5 km, ₹15/km thereafter; Taxi minimum ₹200 for 5 km, ₹20/km thereafter).
  - Two-Wheeler: Fuel cost estimated at ₹3.0/km.
  - Car: Fuel cost estimated at ₹9.0/km.
  - Parking: Estimated flat fee (typically ₹20 for 2-wheeler, ₹50-₹100 for car) if the venue has parking.
- **Time-of-day Congestion**: Peak morning (08:30-10:30) and evening (17:00-20:00) hours apply a 1.35x-1.5x travel time multiplier. Late night (22:00-06:00) applies 0.85x.

## 3. Planner Assumptions
- **Time Buffer**: At least 10% of total trip duration (`bufferPercent = 0.10`) is reserved as an unscheduled contingency buffer (`legs + dwell <= 0.9 * availableTime`).
- **Meal Windows**: Lunch is 12:00-15:00, Dinner is 19:00-22:30. If the trip spans any meal window, at least one food stop (cafe, restaurant, street_food) is scheduled within it.
- **Deterministic Search**: A seeded pseudorandom number generator (mulberry32) ensures that identical input + seed produces identical output tracks.
- **Search Execution & Scalability**: Randomized greedy search extends partial paths candidate-by-candidate respecting non-consecutive category rules and category caps (cap 2 by default, 3 for active interest categories on 6h+ trips). 150-place candidate search executes in ~215ms (under the 300ms limit).
- **Opening Times Invariant**: Stop arrival time reflects the effective start time at or after venue opening (`arrival >= open` and `departure <= close`), with wait time attributed to idle time.
- **Clustering**: Category Jaccard distance produces 3 distinct cluster tracks whenever feasible. If the search space is constrained (e.g. extreme budget or duration), 1 or 2 tracks or a clear binding constraint explanation is returned.

## 4. Narration & Fallback Assumptions
- **LLM Boundary**: The LLM server route only receives immutable, finalized plan facts (place names, arrival/departure, costs, categories, blurb). It cannot alter stops or numbers. If the response contains any place name not in the plan or conflicting numbers, it is discarded.
- **Timeout & Failure**: A hard 3000ms timeout or missing GEMINI_API_KEY falls back silently to deterministic pre-crafted template intros and tips without delaying the user.
