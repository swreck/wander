import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

interface TravelerOption {
  id: string;
  displayName: string;
}

// Curated travel photos — gorgeous, identifiable but not cliche
const PHOTOS = [
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1200&q=80", // Fushimi Inari torii gates
  "https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80", // Japanese garden path
  "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=1200&q=80", // Cherry blossom temple
  "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=1200&q=80", // Bamboo grove
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [signing, setSigning] = useState<string | null>(null);
  const [photoIdx] = useState(() => Math.floor(Math.random() * PHOTOS.length));
  const [imageLoaded, setImageLoaded] = useState(false);
  const [travelers, setTravelers] = useState<TravelerOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.src = PHOTOS[photoIdx];
  }, [photoIdx]);

  // Fetch travelers from API
  useEffect(() => {
    fetch("/api/auth/travelers")
      .then((r) => r.json())
      .then((data: TravelerOption[]) => {
        setTravelers(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
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
    <div className="min-h-[100dvh] relative flex flex-col items-center justify-end overflow-hidden bg-[#3a3128]">
      {/* Background photo — shown only after loaded, no transition to avoid bright flash */}
      {imageLoaded && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${PHOTOS[photoIdx]})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      )}
      {/* Gradient overlay — always visible so text is legible against dark bg */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Content — title always visible, buttons appear once loaded (no "Loading..." flash) */}
      <div
        className="relative z-10 w-full max-w-xs text-center px-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)" }}
      >
        <h1 className="text-4xl font-light tracking-tight text-white mb-1 drop-shadow-lg">
          Wander
        </h1>
        <p className="text-sm text-white/70 mb-8">
          Who's wandering?
        </p>

        {!loading && travelers.length === 0 ? (
          <div className="text-white/50 text-sm">No travelers configured yet.</div>
        ) : travelers.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {travelers.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSelect(t)}
                disabled={signing !== null}
                className={`py-4 px-3 rounded-xl text-base font-medium transition-all backdrop-blur-md
                  ${signing === t.displayName
                    ? "bg-white text-[#3a3128] scale-95"
                    : "bg-white/15 text-white border border-white/30 hover:bg-white/25 active:scale-95"
                  }
                  disabled:opacity-60`}
              >
                {signing === t.displayName ? "..." : t.displayName}
              </button>
            ))}
          </div>
        ) : null /* loading — show nothing, no "Loading..." text to flash */}

        {error && (
          <p className="text-sm text-red-300 mt-4">{error}</p>
        )}
      </div>
    </div>
  );
}
