import prisma from "./db.js";

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  userRatingsTotal?: number;
  confidence: "high" | "low";
}

export async function geocodeExperience(experienceId: string): Promise<PlaceResult | null> {
  if (!API_KEY) return null;

  const exp = await prisma.experience.findUnique({
    where: { id: experienceId },
    include: { city: true },
  });
  if (!exp) return null;

  const query = `${exp.name} ${exp.city.name} ${exp.city.country || ""}`.trim();

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
    url.searchParams.set("input", query);
    url.searchParams.set("inputtype", "textquery");
    url.searchParams.set("fields", "place_id,name,formatted_address,geometry,rating,user_ratings_total");
    url.searchParams.set("key", API_KEY);

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== "OK" || !data.candidates?.length) return null;

    const candidate = data.candidates[0];
    const nameSimilarity = stringSimilarity(exp.name.toLowerCase(), candidate.name.toLowerCase());
    const confidence = nameSimilarity > 0.5 ? "high" : "low";

    const result: PlaceResult = {
      placeId: candidate.place_id,
      name: candidate.name,
      address: candidate.formatted_address || "",
      latitude: candidate.geometry.location.lat,
      longitude: candidate.geometry.location.lng,
      rating: candidate.rating,
      userRatingsTotal: candidate.user_ratings_total,
      confidence,
    };

    // Auto-confirm high confidence, set pending for low
    if (confidence === "high") {
      await prisma.experience.update({
        where: { id: experienceId },
        data: {
          latitude: result.latitude,
          longitude: result.longitude,
          placeIdGoogle: result.placeId,
          locationStatus: "confirmed",
        },
      });

      // Store Google rating if available
      if (result.rating) {
        await prisma.experienceRating.upsert({
          where: {
            experienceId_platform: { experienceId, platform: "google" },
          },
          create: {
            experienceId,
            platform: "google",
            ratingValue: result.rating,
            reviewCount: result.userRatingsTotal || 0,
          },
          update: {
            ratingValue: result.rating,
            reviewCount: result.userRatingsTotal || 0,
            lastRefreshedAt: new Date(),
          },
        });
      }
    } else {
      await prisma.experience.update({
        where: { id: experienceId },
        data: { locationStatus: "pending" },
      });
    }

    return result;
  } catch (err) {
    console.error("Geocoding error:", err);
    return null;
  }
}

export async function confirmLocation(
  experienceId: string,
  latitude: number,
  longitude: number,
  placeIdGoogle?: string
) {
  return prisma.experience.update({
    where: { id: experienceId },
    data: {
      latitude,
      longitude,
      placeIdGoogle: placeIdGoogle || null,
      locationStatus: "confirmed",
    },
  });
}

export async function searchPlace(query: string, city: string): Promise<PlaceResult[]> {
  if (!API_KEY) return [];

  const searchQuery = `${query} ${city}`.trim();
  const url = new URL("https://maps.googleapis.com/maps/api/place/findplacefromtext/json");
  url.searchParams.set("input", searchQuery);
  url.searchParams.set("inputtype", "textquery");
  url.searchParams.set("fields", "place_id,name,formatted_address,geometry,rating,user_ratings_total");
  url.searchParams.set("key", API_KEY);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== "OK" || !data.candidates?.length) return [];

    return data.candidates.map((c: any) => ({
      placeId: c.place_id,
      name: c.name,
      address: c.formatted_address || "",
      latitude: c.geometry.location.lat,
      longitude: c.geometry.location.lng,
      rating: c.rating,
      userRatingsTotal: c.user_ratings_total,
      confidence: "high" as const,
    }));
  } catch {
    return [];
  }
}

// Fetch nearby high-rated places for Tier 3 markers
export async function nearbyPlaces(lat: number, lng: number, radius: number = 1000): Promise<any[]> {
  if (!API_KEY) return [];

  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("type", "restaurant|museum|tourist_attraction|hindu_temple|church|park");
  url.searchParams.set("key", API_KEY);

  try {
    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status !== "OK") return [];

    // Filter to high-rated only (4.4+)
    return data.results
      .filter((p: any) => p.rating >= 4.4 && p.user_ratings_total >= 50)
      .map((p: any) => ({
        placeId: p.place_id,
        name: p.name,
        address: p.vicinity || "",
        latitude: p.geometry.location.lat,
        longitude: p.geometry.location.lng,
        rating: p.rating,
        userRatingsTotal: p.user_ratings_total,
        types: p.types,
      }));
  } catch {
    return [];
  }
}

// Simple string similarity (Jaro-Winkler inspired)
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;

  const maxLen = Math.max(a.length, b.length);
  const matchWindow = Math.floor(maxLen / 2) - 1;
  const aMatches = new Array(a.length).fill(false);
  const bMatches = new Array(b.length).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  return (
    (matches / a.length + matches / b.length + (matches - transpositions / 2) / matches) / 3
  );
}
