import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { deviceSupportsPasskeys, isUserCancel } from "../lib/passkeys";

interface TravelerOption {
  id: string;
  displayName: string;
}

// Pick a stable photo per day (not random per render)
const PHOTOS = [
  "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=1200&q=80",
  "https://images.unsplash.com/photo-1528164344705-47542687000d?w=1200&q=80",
  "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=1200&q=80",
  "https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=1200&q=80",
];
const PHOTO_URL = PHOTOS[new Date().getDate() % PHOTOS.length];

export default function LoginPage() {
  const { login, loginWithPasskey } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [signing, setSigning] = useState<string | null>(null);
  const [nameLogin, setNameLogin] = useState(false);
  const [travelers, setTravelers] = useState<TravelerOption[]>([]);
  const [canUseFaceId, setCanUseFaceId] = useState(true);

  useEffect(() => {
    deviceSupportsPasskeys().then(setCanUseFaceId);
    // Name sign-in exists only for local development and tests; production uses Face ID.
    fetch("/api/auth/login-methods")
      .then((r) => r.json())
      .then((m: { nameLogin?: boolean }) => {
        if (!m?.nameLogin) return;
        setNameLogin(true);
        return fetch("/api/auth/travelers")
          .then((r) => r.json())
          .then((data: TravelerOption[]) => setTravelers(Array.isArray(data) ? data : []));
      })
      .catch(() => {});
  }, []);

  async function handleFaceId() {
    setError("");
    setSigning("faceid");
    try {
      await loginWithPasskey();
      navigate("/");
    } catch (err) {
      setError(isUserCancel(err)
        ? "No problem — tap Sign in when you're ready."
        : (err as Error).message || "Face ID didn't work. Try again?");
    } finally {
      setSigning(null);
    }
  }

  async function handleName(traveler: TravelerOption) {
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

        {canUseFaceId ? (
          <button
            onClick={handleFaceId}
            disabled={signing !== null}
            className="w-full min-h-[52px] py-4 px-3 rounded-xl text-base font-medium bg-white text-[#3a3128]
                       active:scale-95 transition-transform disabled:opacity-60"
          >
            {signing === "faceid" ? "Checking…" : "Sign in with Face ID"}
          </button>
        ) : (
          <p className="text-sm text-white/85 leading-relaxed">
            This browser can't use Face ID. Open your personal Wander link instead.
          </p>
        )}

        <p className="text-sm text-white/70 mt-4 leading-relaxed">
          First time on this phone? Open your personal Wander link, then set up Face ID.
        </p>

        {nameLogin && travelers.length > 0 && (
          <div className="mt-6">
            <p className="text-xs text-white/60 mb-2">Test sign-in (not available in the live app)</p>
            <div className="grid grid-cols-2 gap-3">
              {travelers.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleName(t)}
                  disabled={signing !== null}
                  className={`min-h-[44px] py-3 px-3 rounded-xl text-base font-medium backdrop-blur-md
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
          </div>
        )}

        {error && (
          <p className="text-sm text-red-200 mt-4" role="alert">{error}</p>
        )}
      </div>
    </div>
  );
}
