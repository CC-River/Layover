import { Track } from "./types";

/**
 * Computes Jaccard distance between category sets of two plans.
 * 0 = identical categories, 1 = completely disjoint.
 */
export function categoryJaccardDistance(trackA: Track, trackB: Track): number {
  const setA = new Set(trackA.stops.map((s) => s.place.category));
  const setB = new Set(trackB.stops.map((s) => s.place.category));

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const cat of setA) {
    if (setB.has(cat)) {
      intersectionSize++;
    }
  }

  const unionSize = new Set([...setA, ...setB]).size;
  if (unionSize === 0) return 0;

  const similarity = intersectionSize / unionSize;
  return 1 - similarity;
}

/**
 * Selects up to 3 distinct tracks from feasible plans using farthest-point clustering on category Jaccard distance.
 */
export function clusterTopTracks(
  feasibleTracks: Track[],
  targetClusters: number = 3
): { selected: Track[]; clusterCount: number } {
  if (feasibleTracks.length === 0) {
    return { selected: [], clusterCount: 0 };
  }

  if (feasibleTracks.length <= targetClusters) {
    return {
      selected: feasibleTracks.map((t, idx) => ({ ...t, clusterId: idx + 1 })),
      clusterCount: feasibleTracks.length,
    };
  }

  // Track 1: Highest scoring plan
  const selected: Track[] = [{ ...feasibleTracks[0], clusterId: 1 }];

  // Find remaining tracks maximizing distance to existing selected set
  while (selected.length < targetClusters) {
    let bestCandidate: Track | null = null;
    let maxMinDist = -1;

    for (const candidate of feasibleTracks) {
      // Don't select the same plan
      if (selected.some((s) => s.id === candidate.id)) continue;

      // Distance to nearest already selected cluster representative
      const minDistToSelected = Math.min(
        ...selected.map((s) => categoryJaccardDistance(candidate, s))
      );

      // We want candidates that have noticeable category differences (distance > 0.2)
      // Combined with plan score
      const combinedScore = minDistToSelected * 100 + candidate.score * 0.1;

      if (combinedScore > maxMinDist) {
        maxMinDist = combinedScore;
        bestCandidate = candidate;
      }
    }

    if (bestCandidate && maxMinDist > 0) {
      selected.push({ ...bestCandidate, clusterId: selected.length + 1 });
    } else {
      // No more distinct plans available
      break;
    }
  }

  return { selected, clusterCount: selected.length };
}
