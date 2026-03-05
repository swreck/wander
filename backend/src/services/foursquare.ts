import prisma from "./db.js";
import { stringSimilarity } from "./geocoding.js";

const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY;

interface FoursquareRatingResult {
  rating: number;
  reviewCount: number;
  placeName: string;
}

export async function fetchFoursquareRating(
  name: string,
  city: string,
  country: string
): Promise<FoursquareRatingResult | null> {
  if (!FOURSQUARE_API_KEY) return null;

  try {
    // Step 1: Search for the place
    const searchUrl = new URL("https://api.foursquare.com/v3/places/search");
    searchUrl.searchParams.set("query", name);
    searchUrl.searchParams.set("near", `${city}, ${country}`);
    searchUrl.searchParams.set("limit", "1");

    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: FOURSQUARE_API_KEY },
    });

    if (!searchRes.ok) {
      console.error("Foursquare search error:", searchRes.status, await searchRes.text());
      return null;
    }

    const searchData = await searchRes.json();

    if (!searchData.results?.length) return null;

    const place = searchData.results[0];
    const confidence = stringSimilarity(
      name.toLowerCase(),
      place.name.toLowerCase()
    );

    if (confidence <= 0.5) return null;

    // Step 2: Fetch place details for rating
    const detailUrl = `https://api.foursquare.com/v3/places/${place.fsq_id}`;
    const detailRes = await fetch(detailUrl, {
      headers: { Authorization: FOURSQUARE_API_KEY },
    });

    if (!detailRes.ok) {
      console.error("Foursquare detail error:", detailRes.status, await detailRes.text());
      return null;
    }

    const detail = await detailRes.json();

    if (!detail.rating) return null;

    return {
      rating: detail.rating, // 10-point scale, stored as-is
      reviewCount: detail.stats?.total_ratings || 0,
      placeName: detail.name,
    };
  } catch (err) {
    console.error("Foursquare fetch error:", err);
    return null;
  }
}

export async function storeFoursquareRating(
  experienceId: string,
  result: FoursquareRatingResult
): Promise<void> {
  await prisma.experienceRating.upsert({
    where: {
      experienceId_platform: { experienceId, platform: "foursquare" },
    },
    create: {
      experienceId,
      platform: "foursquare",
      ratingValue: result.rating,
      reviewCount: result.reviewCount,
    },
    update: {
      ratingValue: result.rating,
      reviewCount: result.reviewCount,
      lastRefreshedAt: new Date(),
    },
  });
}
