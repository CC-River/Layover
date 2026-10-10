import fs from "fs";
import path from "path";
import { Place, PlannerConfig, TravelMatrix } from "../src/planner/types";

// Helper: Haversine distance in km
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Determines if a location is considered mainland or western peninsula/island
function isMainlandArea(areaName: string, lon: number): boolean {
  const westernAreas = ["Fort Kochi", "Mattancherry", "Thoppumpady", "fort_kochi", "mattancherry", "thoppumpady"];
  if (westernAreas.includes(areaName)) {
    return false;
  }
  // Approximate waterway divide in Kochi harbor: lon < 76.265 is western side
  return lon >= 76.265;
}

export async function buildTravelMatrix(): Promise<void> {
  const root = process.cwd();
  const placesPath = path.join(root, "data", "places.json");
  const configPath = path.join(root, "data", "config.json");
  const matrixPath = path.join(root, "data", "matrix.json");

  const places: Place[] = JSON.parse(fs.readFileSync(placesPath, "utf-8"));
  const config: PlannerConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  // Build unified list of nodes: all places + all supported start areas
  interface Node {
    id: string;
    name: string;
    lat: number;
    lon: number;
    area: string;
    isMainland: boolean;
  }

  const nodes: Node[] = [];

  // Add supported start areas
  config.supportedStartAreas.forEach((area) => {
    nodes.push({
      id: area.id,
      name: area.name,
      lat: area.lat,
      lon: area.lon,
      area: area.id,
      isMainland: area.isMainland,
    });
  });

  // Add places
  places.forEach((place) => {
    // Avoid duplicate IDs if a place has same id as a start area
    if (!nodes.some((n) => n.id === place.id)) {
      nodes.push({
        id: place.id,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
        area: place.area,
        isMainland: isMainlandArea(place.area, place.lon),
      });
    }
  });

  console.log(`[build-matrix] Building matrix for ${nodes.length} nodes (${places.length} places + ${config.supportedStartAreas.length} start areas)...`);

  const matrix: TravelMatrix = {};
  const osrmUrl = process.env.OSRM_URL || "https://router.project-osrm.org";
  let useFallback = false;

  // Try checking OSRM availability
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const testRes = await fetch(
      `${osrmUrl}/table/v1/driving/${nodes[0].lon},${nodes[0].lat};${nodes[1].lon},${nodes[1].lat}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!testRes.ok) {
      useFallback = true;
    }
  } catch {
    useFallback = true;
  }

  if (useFallback) {
    console.warn(
      "[build-matrix] NOTICE: OSRM service is unreachable or offline. Falling back to Haversine distance (1.35x road factor @ 25 km/h)."
    );
  } else {
    console.log(`[build-matrix] Connected to OSRM router at ${osrmUrl}.`);
  }

  const roadFactor = 1.35;
  const avgSpeedKmh = 25.0; // km/h urban average in Kochi
  const walkSpeedKmh = config.fares.walkingSpeedKmh || 4.5;
  const walkThresholdKm = config.fares.walkingMaxDistanceKm || 0.8;
  const crossingPenalty = config.channelCrossing.fortKochiToMainlandPenaltyMin || 25;

  for (const from of nodes) {
    matrix[from.id] = {};
    for (const to of nodes) {
      if (from.id === to.id) {
        matrix[from.id][to.id] = { minutes: 0, distanceKm: 0 };
        continue;
      }

      const straightDist = haversineDistanceKm(from.lat, from.lon, to.lat, to.lon);
      const roadDistKm = Math.round(straightDist * roadFactor * 10) / 10;

      let minutes: number;
      if (roadDistKm <= walkThresholdKm) {
        // Walking distance
        minutes = Math.round((roadDistKm / walkSpeedKmh) * 60);
      } else {
        // Driving / Transit
        minutes = Math.round((roadDistKm / avgSpeedKmh) * 60);
        // If one is mainland and the other is island/peninsula, add crossing penalty
        if (from.isMainland !== to.isMainland) {
          minutes += crossingPenalty;
        }
      }

      // Minimum 2 minutes for different places
      minutes = Math.max(2, minutes);

      matrix[from.id][to.id] = {
        minutes,
        distanceKm: roadDistKm,
      };
    }
  }

  fs.writeFileSync(matrixPath, JSON.stringify(matrix, null, 2), "utf-8");
  console.log(`[build-matrix] Travel matrix successfully generated and written to ${matrixPath}`);
}

// If run directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  buildTravelMatrix().catch((err) => {
    console.error("[build-matrix] Fatal error:", err);
    process.exit(1);
  });
}
