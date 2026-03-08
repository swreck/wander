import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const TRAVELERS = [
  { name: "Ken", code: "Ken" },
  { name: "Julie", code: "Julie" },
  { name: "Andy", code: "Andy" },
  { name: "Larisa", code: "Larisa" },
];

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

  useEffect(() => {
    const img = new Image();
    img.onload = () => setImageLoaded(true);
    img.src = PHOTOS[photoIdx];
  }, [photoIdx]);

  async function handleSelect(traveler: { name: string; code: string }) {
    setError("");
    setSigning(traveler.name);
    try {
      await login(traveler.code);
      navigate("/");
    } catch {
      setError("Couldn't sign in. Try again.");
    } finally {
      setSigning(null);
    }
  }

  return (
    <div className="min-h-[100dvh] relative flex flex-col items-center justify-end overflow-hidden">
      {/* Background photo */}
      <div
        className="absolute inset-0 bg-[#3a3128] transition-opacity duration-1000"
        style={{
          opacity: imageLoaded ? 1 : 0,
          backgroundImage: `url(${PHOTOS[photoIdx]})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {/* Gradient overlay — darker at bottom for text legibility */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-xs text-center px-4 pb-16"
           style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)" }}>
        <h1 className="text-4xl font-light tracking-tight text-white mb-1 drop-shadow-lg">
          Wander
        </h1>
        <p className="text-sm text-white/70 mb-8">
          Who's wandering?
        </p>

        <div className="grid grid-cols-2 gap-3">
          {TRAVELERS.map((t) => (
            <button
              key={t.name}
              onClick={() => handleSelect(t)}
              disabled={signing !== null}
              className={`py-4 px-3 rounded-xl text-base font-medium transition-all backdrop-blur-md
                ${signing === t.name
                  ? "bg-white text-[#3a3128] scale-95"
                  : "bg-white/15 text-white border border-white/30 hover:bg-white/25 active:scale-95"
                }
                disabled:opacity-60`}
            >
              {signing === t.name ? "..." : t.name}
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
