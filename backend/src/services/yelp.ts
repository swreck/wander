import prisma from "./db.js";
import { stringSimilarity } from "./geocoding.js";

const YELP_API_KEY = process.env.YELP_API_KEY;

interface YelpRatingResult {
  rating: number;
  reviewCount: number;
  businessName: string;
}

export async function fetchYelpRating(
  name: string,
  city: string,
  country: string
): Promise<YelpRatingResult | null> {
  if (!YELP_API_KEY) return null;

  try {
    const url = new URL("https://api.yelp.com/v3/businesses/search");
    url.searchParams.set("term", name);
    url.searchParams.set("location", `${city}, ${country}`);
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${YELP_API_KEY}` },
    });

    if (!res.ok) {
      console.error("Yelp API error:", res.status, await res.text());
      return null;
    }

    const data = await res.json();

    if (!data.businesses?.length) return null;

    const biz = data.businesses[0];
    const confidence = stringSimilarity(
      name.toLowerCase(),
      biz.name.toLowerCase()
    );

    if (confidence <= 0.5) return null;

    return {
      rating: biz.rating,
      reviewCount: biz.review_count || 0,
      businessName: biz.name,
    };
  } catch (err) {
    console.error("Yelp fetch error:", err);
    return null;
  }
}

export async function storeYelpRating(
  experienceId: string,
  result: YelpRatingResult
): Promise<void> {
  await prisma.experienceRating.upsert({
    where: {
      experienceId_platform: { experienceId, platform: "yelp" },
    },
    create: {
      experienceId,
      platform: "yelp",
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
