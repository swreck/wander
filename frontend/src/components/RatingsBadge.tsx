import type { ExperienceRating } from "../lib/types";

interface Props {
  ratings: ExperienceRating[];
  placeIdGoogle?: string | null;
}

function buildGoogleMapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

export default function RatingsBadge({ ratings, placeIdGoogle }: Props) {
  if (!ratings || ratings.length === 0) return null;

  const lowWarnings = ratings.filter((r) =>
    (r.platform !== "foursquare" && r.ratingValue < 3.8) ||
    (r.platform === "foursquare" && r.ratingValue < 6.5)
  );

  return (
    <div className="mt-1.5">
      <div className="flex items-center gap-2 text-sm text-[#8a7a62]">
        {ratings.map((r) => {
          const content = (
            <>
              <span className="font-medium">
                {r.platform === "google" ? "G" : r.platform === "yelp" ? "Y" : "4sq"}
              </span>
              <span>{"\u2605"}</span>
              <span>{r.ratingValue.toFixed(1)}</span>
              <span className="text-[#c8bba8]">
                ({r.reviewCount >= 1000 ? `${(r.reviewCount / 1000).toFixed(1)}k` : r.reviewCount})
              </span>
            </>
          );

          const canLink = r.platform === "google" && placeIdGoogle;

          return canLink ? (
            <a
              key={r.platform}
              href={buildGoogleMapsUrl(placeIdGoogle)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-0.5 hover:text-[#514636] transition-colors underline decoration-dotted underline-offset-2"
            >
              {content}
            </a>
          ) : (
            <span key={r.platform} className="flex items-center gap-0.5">
              {content}
            </span>
          );
        })}
      </div>
      {lowWarnings.map((r) => (
        <div key={r.platform} className="text-sm text-amber-600 mt-0.5">
          Reviews are mixed on {r.platform === "google" ? "Google" : r.platform === "yelp" ? "Yelp" : "Foursquare"}
        </div>
      ))}
    </div>
  );
}
