import type { ExperienceRating } from "../lib/types";

interface Props {
  ratings: ExperienceRating[];
}

export default function RatingsBadge({ ratings }: Props) {
  if (!ratings || ratings.length === 0) return null;

  const lowWarnings = ratings.filter((r) =>
    (r.platform !== "foursquare" && r.ratingValue < 3.8) ||
    (r.platform === "foursquare" && r.ratingValue < 6.5)
  );

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2 text-sm text-[#8a7a62]">
        {ratings.map((r) => (
          <span key={r.platform} className="flex items-center gap-0.5">
            <span className="font-medium">
              {r.platform === "google" ? "G" : r.platform === "yelp" ? "Y" : "4sq"}
            </span>
            <span>★</span>
            <span>{r.ratingValue.toFixed(1)}</span>
            <span className="text-[#c8bba8]">
              ({r.reviewCount >= 1000 ? `${(r.reviewCount / 1000).toFixed(1)}k` : r.reviewCount})
            </span>
          </span>
        ))}
      </div>
      {lowWarnings.map((r) => (
        <div key={r.platform} className="text-sm text-amber-600 mt-0.5">
          Reviews are mixed on {r.platform === "google" ? "Google" : r.platform === "yelp" ? "Yelp" : "Foursquare"}
        </div>
      ))}
    </div>
  );
}
