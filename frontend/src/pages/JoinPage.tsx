import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface TripInfo {
  tripId: string;
  tripName: string;
  personalInvite: boolean;
  expectedName?: string;
  alreadyClaimed?: boolean;
  expectedNames: string[];
  currentMembers: string[];
  cityCount?: number;
  experienceCount?: number;
  dateRange?: string;
  firstCityName?: string;
}

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const { loginWithToken, user } = useAuth();
  const navigate = useNavigate();

  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [customName, setCustomName] = useState("");
  const [cityPhoto, setCityPhoto] = useState<string | null>(null);

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
        // Fetch a city photo if we have a city name
        if (data.firstCityName) {
          fetch(`/api/geocoding/city-photo?query=${encodeURIComponent(data.firstCityName)}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.photoUrl) setCityPhoto(d.photoUrl); })
            .catch(() => {});
        }
      })
      .catch(() => {
        setError("This invite link isn't working. Ask your trip planner to send a new one.");
        setLoading(false);
      });
  }, [token]);

  async function handleJoin(name?: string) {
    if (!token) return;
    setJoining(true);
    setError("");

    try {
      const body: any = {};
      if (name) body.name = name.trim();

      const res = await fetch(`/api/auth/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't join");
      }

      const data = await res.json();

      // Use the new loginWithToken to set auth state
      loginWithToken(data.token, data.displayName);

      // Show guide on first join
      if (!localStorage.getItem("wander:seen-guide")) {
        localStorage.setItem("wander:seen-guide", "1");
        navigate("/guide");
      } else {
        navigate("/");
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong. Try again?");
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#faf8f5]">
        <p className="text-[#8a7a62]">Opening your invite...</p>
      </div>
    );
  }

  if (!tripInfo) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#faf8f5] p-6">
        <h1 className="text-xl font-medium text-[#3a3128] mb-2">Hmm, that didn't work</h1>
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

  // Personal invite — auto-identify, one-tap join
  if (tripInfo.personalInvite && tripInfo.expectedName) {
    if (tripInfo.alreadyClaimed) {
      return (
        <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#faf8f5] p-6">
          <div className="max-w-sm w-full text-center">
            <h1 className="text-2xl font-light text-[#3a3128] mb-1">
              Welcome back, {tripInfo.expectedName}
            </h1>
            <p className="text-sm text-[#8a7a62] mb-6">
              You're already part of {tripInfo.tripName}.
            </p>
            <button
              onClick={() => handleJoin()}
              disabled={joining}
              className="px-6 py-3 rounded-xl bg-[#514636] text-white text-base w-full disabled:opacity-60"
            >
              {joining ? "Opening..." : "Let's go"}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#faf8f5] p-6">
        <div className="max-w-sm w-full text-center">
          {/* City destination photo */}
          {cityPhoto && (
            <div className="mb-4 rounded-xl overflow-hidden h-32">
              <img src={cityPhoto} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          <p className="text-sm text-[#8a7a62] mb-2">You're invited to</p>
          <h1 className="text-2xl font-light text-[#3a3128] mb-1">
            {tripInfo.tripName}
          </h1>
          <p className="text-lg text-[#514636] mb-4">
            Welcome, {tripInfo.expectedName}!
          </p>

          {/* Trip snapshot */}
          {(tripInfo.cityCount || tripInfo.experienceCount || tripInfo.dateRange) && (
            <div className="mb-6 px-4 py-3 bg-white rounded-lg border border-[#f0ece5] text-sm text-[#6b5d4a]">
              {tripInfo.dateRange && <p>{tripInfo.dateRange}</p>}
              {tripInfo.cityCount && tripInfo.cityCount > 0 && (
                <p className="mt-0.5">
                  {tripInfo.cityCount} {tripInfo.cityCount === 1 ? "city" : "cities"}
                  {tripInfo.experienceCount && tripInfo.experienceCount > 0
                    ? ` · ${tripInfo.experienceCount} ideas saved so far`
                    : ""}
                </p>
              )}
            </div>
          )}

          {tripInfo.currentMembers.length > 0 && (
            <p className="text-xs text-[#8a7a62] mb-6">
              {tripInfo.currentMembers.join(", ")} {tripInfo.currentMembers.length === 1 ? "is" : "are"} already here
            </p>
          )}

          <button
            onClick={() => handleJoin()}
            disabled={joining}
            className="px-6 py-3.5 rounded-xl bg-[#514636] text-white text-base font-medium w-full disabled:opacity-60 active:scale-95 transition-transform"
          >
            {joining ? "Joining..." : "Let's go"}
          </button>

          <p className="text-xs text-[#c8bba8] mt-4">
            Scout is your travel companion — ask questions, add ideas, or just explore
          </p>

          {error && <p className="text-sm text-red-500 mt-4">{error}</p>}
        </div>
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
              <p className="text-sm text-[#8a7a62] mb-4">You're already part of this trip.</p>
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

        <p className="text-xs text-[#8a7a62] mt-8">
          Lost access?{" "}
          Ask your trip planner to send you a new link.
        </p>
      </div>
    </div>
  );
}
