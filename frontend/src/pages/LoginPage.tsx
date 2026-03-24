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
      className="min-h-[100dvh] flex flex-col items-center justify-end bg-[#3a3128]"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 64px)" }}
    >
      <div className="w-full max-w-xs text-center px-4">
        <h1 className="text-4xl font-light tracking-tight text-white mb-1">
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
              className={`py-4 px-3 rounded-xl text-base font-medium
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
