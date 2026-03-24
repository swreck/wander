import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface TripInfo {
  tripId: string;
  tripName: string;
  expectedNames: string[];
  currentMembers: string[];
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const { login, user } = useAuth();
  const navigate = useNavigate();

  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [customName, setCustomName] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/join/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Invalid invite link");
        return r.json();
      })
      .then((data: TripInfo) => {
        setTripInfo(data);
        setLoading(false);
      })
      .catch(() => {
        setError("This invite link is invalid or has expired.");
        setLoading(false);
      });
  }, [token]);

  async function handleJoin(name: string) {
    if (!token || !name.trim()) return;
    setJoining(true);
    setError("");

    try {
      const res = await fetch(`/api/auth/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to join");
      }

      const data = await res.json();

      // Store token and log in
      localStorage.setItem("wander_token", data.token);
      localStorage.setItem("wander_user", data.displayName);

      // Force auth context to pick up the new user
      await login(data.displayName);

      // Show guide on first join
      if (!localStorage.getItem("wander:seen-guide")) {
        localStorage.setItem("wander:seen-guide", "1");
        navigate("/guide");
      } else {
        navigate("/");
      }
    } catch (e: any) {
      setError(e.message || "Couldn't join. Try again.");
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#faf8f5]">
        <p className="text-[#8a7a62]">Loading invite...</p>
      </div>
    );
  }

  if (!tripInfo) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#faf8f5] p-6">
        <h1 className="text-xl font-medium text-[#3a3128] mb-2">Invalid Link</h1>
        <p className="text-sm text-[#8a7a62] mb-6">{error}</p>
        <button
          onClick={() => navigate("/login")}
          className="px-5 py-2.5 rounded-xl bg-[#514636] text-white text-sm"
        >
          Go to Login
        </button>
      </div>
    );
  }

  // If already logged in — offer to join directly
  if (user) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#faf8f5] p-6">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-2xl font-light text-[#3a3128] mb-1">Join Trip</h1>
          <p className="text-lg text-[#514636] mb-6">{tripInfo.tripName}</p>

          {tripInfo.currentMembers.includes(user.displayName) ? (
            <>
              <p className="text-sm text-[#8a7a62] mb-4">You're already a member of this trip.</p>
              <button
                onClick={() => navigate("/")}
                className="px-5 py-2.5 rounded-xl bg-[#514636] text-white text-sm"
              >
                Go to Trip
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[#8a7a62] mb-6">
                Join as <strong>{user.displayName}</strong>?
              </p>
              <button
                onClick={() => handleJoin(user.displayName)}
                disabled={joining}
                className="px-5 py-3 rounded-xl bg-[#514636] text-white text-sm w-full disabled:opacity-60"
              >
                {joining ? "Joining..." : `Join as ${user.displayName}`}
              </button>
            </>
          )}

          {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
        </div>
      </div>
    );
  }

  // Not logged in — show expected names to tap, or enter custom name
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#faf8f5] p-6">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-light text-[#3a3128] mb-1">
          You're Invited
        </h1>
        <p className="text-lg text-[#514636] mb-2">{tripInfo.tripName}</p>

        {tripInfo.currentMembers.length > 0 && (
          <p className="text-xs text-[#8a7a62] mb-6">
            {tripInfo.currentMembers.join(", ")} {tripInfo.currentMembers.length === 1 ? "is" : "are"} already here
          </p>
        )}

        {tripInfo.expectedNames.length > 0 && (
          <>
            <p className="text-sm text-[#8a7a62] mb-3">Tap your name to join:</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {tripInfo.expectedNames.map((name) => (
                <button
                  key={name}
                  onClick={() => handleJoin(name)}
                  disabled={joining}
                  className="py-3 px-3 rounded-xl text-base font-medium bg-white border border-[#e0d8cc] text-[#3a3128] hover:bg-[#f0ece5] active:scale-95 transition-all disabled:opacity-60"
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-[#e0d8cc]" />
              <span className="text-xs text-[#8a7a62]">or</span>
              <div className="flex-1 h-px bg-[#e0d8cc]" />
            </div>
          </>
        )}

        <p className="text-sm text-[#8a7a62] mb-3">
          {tripInfo.expectedNames.length > 0 ? "Enter a different name:" : "Enter your name to join:"}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleJoin(customName);
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Your name"
            className="flex-1 px-4 py-3 rounded-xl border border-[#e0d8cc] bg-white text-[#3a3128] text-sm focus:outline-none focus:ring-2 focus:ring-[#514636]/30"
            disabled={joining}
          />
          <button
            type="submit"
            disabled={joining || !customName.trim()}
            className="px-5 py-3 rounded-xl bg-[#514636] text-white text-sm disabled:opacity-60"
          >
            {joining ? "..." : "Join"}
          </button>
        </form>

        {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

        {tripInfo.currentMembers.length > 0 && (
          <p className="text-xs text-[#8a7a62] mt-6">
            Already a member?{" "}
            <button
              onClick={() => navigate("/login")}
              className="underline text-[#514636] font-medium"
            >
              Log in
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
