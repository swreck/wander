import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

const TRAVELERS = [
  { name: "Ken", code: "Ken" },
  { name: "Julie", code: "Julie" },
  { name: "Andy", code: "Andy" },
  { name: "Larisa", code: "Larisa" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [signing, setSigning] = useState<string | null>(null);

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
    <div className="min-h-screen flex items-center justify-center bg-[#faf8f5] px-4">
      <div className="w-full max-w-xs text-center">
        <h1 className="text-3xl font-light tracking-tight text-[#3a3128] mb-1">
          Wander
        </h1>
        <p className="text-sm text-[#8a7a62] mb-10">
          Who's exploring?
        </p>

        <div className="grid grid-cols-2 gap-3">
          {TRAVELERS.map((t) => (
            <button
              key={t.name}
              onClick={() => handleSelect(t)}
              disabled={signing !== null}
              className={`py-4 px-3 rounded-xl border-2 text-base font-medium transition-all
                ${signing === t.name
                  ? "border-[#514636] bg-[#514636] text-white scale-95"
                  : "border-[#e0d8cc] bg-white text-[#3a3128] hover:border-[#a89880] hover:bg-[#faf8f5] active:scale-95"
                }
                disabled:opacity-60`}
            >
              {signing === t.name ? "..." : t.name}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 mt-4">{error}</p>
        )}
      </div>
    </div>
  );
}
