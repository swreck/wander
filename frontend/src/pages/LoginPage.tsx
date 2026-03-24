import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface TravelerOption {
  id: string;
  displayName: string;
}

// Hardcoded fallback so buttons render instantly without waiting for API
const DEFAULT_TRAVELERS: TravelerOption[] = [
  { id: "ken", displayName: "Ken" },
  { id: "julie", displayName: "Julie" },
  { id: "andy", displayName: "Andy" },
  { id: "larisa", displayName: "Larisa" },
];

// Pick a stable photo per day (not random per render)
const PHOTOS = [
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1200&q=80",
  "https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80",
  "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=1200&q=80",
  "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=1200&q=80",
];
const PHOTO_URL = PHOTOS[new Date().getDate() % PHOTOS.length];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [signing, setSigning] = useState<string | null>(null);
  const [travelers, setTravelers] = useState<TravelerOption[]>(DEFAULT_TRAVELERS);

  // Refresh from API (adds any new travelers, e.g. Kyler after joining)
  useEffect(() => {
    fetch("/api/auth/travelers")
      .then((r) => r.json())
      .then((data: TravelerOption[]) => {
        if (data.length > 0) setTravelers(data);
      })
      .catch(() => {});
  }, []);

  async function handleSelect(traveler: TravelerOption) {
    setError("");
    setSigning(traveler.displayName);
    try {
      await login(traveler.displayName);
      navigate("/");
    } catch {
      setError("Couldn't sign in. Try again.");
    } finally {
      setSigning(null);
    }
  }

  return (
    <div
      className="min-h-[100dvh] relative flex flex-col items-center justify-end overflow-hidden bg-[#3a3128]"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)" }}
    >
      {/* Background photo — always in DOM, no JS loading, no transitions.
          Browser handles loading natively; dark bg shows until image arrives. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${PHOTO_URL})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {/* Gradient overlay for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      <div className="relative z-10 w-full max-w-xs text-center px-4">
        <h1 className="text-4xl font-light tracking-tight text-white mb-1 drop-shadow-lg">
          Wander
        </h1>
        <p className="text-sm text-white/70 mb-8">
          Who's wandering?
        </p>

        <div className="grid grid-cols-2 gap-3">
          {travelers.map((t) => (
            <button
              key={t.id}
              onClick={() => handleSelect(t)}
              disabled={signing !== null}
              className={`py-4 px-3 rounded-xl text-base font-medium backdrop-blur-md
                ${signing === t.displayName
                  ? "bg-white text-[#3a3128] scale-95"
                  : "bg-white/15 text-white border border-white/30 active:scale-95"
                }
                disabled:opacity-60`}
            >
              {signing === t.displayName ? "..." : t.displayName}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-300 mt-4">{error}</p>
        )}
      </div>
    </div>
  );
}
