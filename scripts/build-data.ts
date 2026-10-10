import { buildTravelMatrix } from "./build-matrix";
import { validateDataFiles } from "./validate-data";

async function main() {
  console.log("=== [1/2] Generating Travel Matrix ===");
  await buildTravelMatrix();

  console.log("\n=== [2/2] Validating Data Schemas & Records ===");
  const { valid, unverifiedCount } = validateDataFiles();

  if (!valid) {
    console.error("\n❌ [BUILD FAILED] Schema validation failed. Halting build.");
    process.exit(1);
  }

  console.log(
    `\n✅ [BUILD SUCCESS] Data pipeline completed successfully. (${unverifiedCount} unverified records logged)`
  );
}

main().catch((err) => {
  console.error("Fatal error during build:data:", err);
  process.exit(1);
});
