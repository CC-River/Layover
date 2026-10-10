import fs from "fs";
import path from "path";
import { PlacesListSchema, ConfigSchema, TravelMatrixSchema } from "../src/planner/schema";

export function validateDataFiles(): { valid: boolean; unverifiedCount: number } {
  const root = process.cwd();
  const placesPath = path.join(root, "data", "places.json");
  const configPath = path.join(root, "data", "config.json");
  const matrixPath = path.join(root, "data", "matrix.json");

  let valid = true;

  // 1. Validate Config
  if (!fs.existsSync(configPath)) {
    console.error(`[ERROR] Missing config file at ${configPath}`);
    return { valid: false, unverifiedCount: 0 };
  }
  const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const configResult = ConfigSchema.safeParse(rawConfig);
  if (!configResult.success) {
    console.error("[ERROR] config.json schema validation failed:");
    console.error(configResult.error.format());
    valid = false;
  } else {
    console.log("[OK] config.json is valid.");
  }

  // 2. Validate Places
  if (!fs.existsSync(placesPath)) {
    console.error(`[ERROR] Missing places file at ${placesPath}`);
    return { valid: false, unverifiedCount: 0 };
  }
  const rawPlaces = JSON.parse(fs.readFileSync(placesPath, "utf-8"));
  const placesResult = PlacesListSchema.safeParse(rawPlaces);
  if (!placesResult.success) {
    console.error("[ERROR] places.json schema validation failed:");
    console.error(placesResult.error.format());
    valid = false;
  } else {
    console.log(`[OK] places.json is valid. Loaded ${rawPlaces.length} places.`);
  }

  // Check unverified places
  let unverifiedCount = 0;
  if (placesResult.success) {
    const unverified = rawPlaces.filter(
      (p: { verifiedOn: string | null; source: string }) => p.verifiedOn === null
    );
    unverifiedCount = unverified.length;
    if (unverifiedCount > 0) {
      console.warn(
        `\n⚠️  [DATA WARNING] ${unverifiedCount} unverified records found (source: 'seed-estimate', verifiedOn: null):`
      );
      unverified.forEach((p: { id: string; name: string }) => {
        console.warn(`  - [${p.id}] ${p.name}`);
      });
      console.warn(
        "⚠️  Notice: Coordinates, prices, and hours are estimated placeholders. A human curator must verify these before launch.\n"
      );
    }
  }

  // 3. Validate Matrix if present
  if (fs.existsSync(matrixPath)) {
    const rawMatrix = JSON.parse(fs.readFileSync(matrixPath, "utf-8"));
    const matrixResult = TravelMatrixSchema.safeParse(rawMatrix);
    if (!matrixResult.success) {
      console.error("[ERROR] matrix.json schema validation failed:");
      console.error(matrixResult.error.format());
      valid = false;
    } else {
      console.log(`[OK] matrix.json is valid. Nodes: ${Object.keys(rawMatrix).length}`);
    }
  } else {
    console.log("[INFO] matrix.json not yet generated.");
  }

  return { valid, unverifiedCount };
}

// If run directly
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  const result = validateDataFiles();
  if (!result.valid) {
    process.exit(1);
  }
}
