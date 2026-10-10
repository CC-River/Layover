import fs from "fs";
import path from "path";
import { Place, PlannerConfig, TravelMatrix } from "../src/planner/types";

const root = process.cwd();

export function loadTestData(): {
  places: Place[];
  config: PlannerConfig;
  matrix: TravelMatrix;
} {
  const places: Place[] = JSON.parse(
    fs.readFileSync(path.join(root, "data", "places.json"), "utf-8")
  );
  const config: PlannerConfig = JSON.parse(
    fs.readFileSync(path.join(root, "data", "config.json"), "utf-8")
  );
  const matrix: TravelMatrix = JSON.parse(
    fs.readFileSync(path.join(root, "data", "matrix.json"), "utf-8")
  );

  return { places, config, matrix };
}
