import { Track, PlaceCategory } from "./types";

const CATEGORY_NAMES: Record<PlaceCategory, string> = {
  cafe: "Cafe",
  restaurant: "Dining",
  street_food: "Street Bites",
  mall: "Mall",
  shopping: "Bazaar",
  cinema: "Cinema",
  heritage: "Heritage",
  museum: "Museums",
  nature: "Waterfront",
  beach: "Beach",
  nightlife: "Nightlife",
  activity: "Experiences",
};

/**
 * Generates an evocative, concise title for a track based on its stops and categories.
 */
export function generateTrackLabel(track: Track): string {
  if (track.stops.length === 0) return "Custom Kochi Trail";

  const categories = track.stops.map((s) => s.place.category);
  const counts = new Map<PlaceCategory, number>();
  categories.forEach((c) => counts.set(c, (counts.get(c) || 0) + 1));

  // Sort categories by frequency
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const primaryCat = sorted[0][0];
  const secondaryCat = sorted.length > 1 ? sorted[1][0] : null;

  // Check tags for special themes
  const allTags = track.stops.flatMap((s) => s.place.tags);
  const hasSunset = allTags.includes("sunset");
  const hasArt = allTags.includes("art") || allTags.includes("culture");

  if (primaryCat === "heritage") {
    if (secondaryCat === "cafe") return "Heritage & Courtyard Cafe Walk";
    if (secondaryCat === "street_food") return "Old Kochi Heritage & Street Bites";
    if (secondaryCat === "museum") return "Colonial History & Palace Trail";
    if (hasSunset) return "Historic Port & Sunset Trail";
    return "Old Fort Kochi Heritage Trail";
  }

  if (primaryCat === "museum") {
    if (secondaryCat === "heritage") return "Royal History & Architecture Trail";
    return "Kerala Art & Museum Walk";
  }

  if (primaryCat === "beach" || primaryCat === "nature") {
    if (hasSunset) return "Breezy Harbor & Sunset Stroll";
    if (secondaryCat === "cafe") return "Waterfront Stroll & Coffee";
    if (secondaryCat === "street_food") return "Promenade Walk & Street Bites";
    return "Coastal Views & Nature Walk";
  }

  if (primaryCat === "shopping" || primaryCat === "mall") {
    if (secondaryCat === "street_food" || secondaryCat === "restaurant") {
      return "Jew Town Bazaar & Food Crawl";
    }
    if (primaryCat === "mall") return "LuLu City & Shopping Crawl";
    return "Antique Bazaar & Spice Trail";
  }

  if (primaryCat === "cafe") {
    if (hasArt) return "Bohemian Art Cafe & Stroll";
    if (secondaryCat === "heritage") return "Courtyard Cafes & Heritage";
    return "Kochi Coffee & Sweet Delights";
  }

  if (primaryCat === "restaurant" || primaryCat === "street_food") {
    if (secondaryCat === "heritage") return "Heritage Flavours & Spice Trail";
    if (secondaryCat === "nature") return "Waterfront Dining & Sunset";
    return "Authentic Malabar Food Crawl";
  }

  if (primaryCat === "nightlife") {
    return "Waterfront Deck & Evening Vibe";
  }

  if (primaryCat === "cinema") {
    return "Cinema & Downtown Experience";
  }

  if (secondaryCat) {
    return `${CATEGORY_NAMES[primaryCat]} & ${CATEGORY_NAMES[secondaryCat]} Trail`;
  }

  return `${CATEGORY_NAMES[primaryCat]} Experience`;
}
