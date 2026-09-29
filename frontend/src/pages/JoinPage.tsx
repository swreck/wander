import { useState, useEffect, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import AddToHomeScreen, { isIPhoneSafari, isHomeScreenApp } from "../components/AddToHomeScreen";

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
  const { loginWithToken, loginWithPasskey, user } = useAuth();
  const navigate = useNavigate();

  const [tripInfo, setTripInfo] = useState<TripInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [customName, setCustomName] = useState("");
  const [cityPhoto] = useState<string | null>(null);
  const [retired, setRetired] = useState(false);
  const [retiredFor, setRetiredFor] = useState<string | null>(null);
  // On an iPhone in Safari, the first step is putting Wander on the Home Screen; the icon then
  // opens this same invite, signed in (see AddToHomeScreen). Inside the Home Screen app: just "Let's go".
  const homeScreenFirst = isIPhoneSafari() && !isHomeScreenApp();
  const [signingIn, setSigningIn] = useState(false);
  const [faceIdError, setFaceIdError] = useState("");

  async function signInWithFaceId() {
    setFaceIdError("");
    setSigningIn(true);
    try {
      await loginWithPasskey();
      window.location.replace("/"); // replace: the phone's Back never lands on the link page again
    } catch {
      setFaceIdError("Face ID didn't sign you in on this phone. If it's a new phone, ask Ken or Larisa to send a new link from People in Wander.");
      setSigningIn(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/join/${token}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) {
          setRetired(!!body.retired);
          if (body.expectedName) setRetiredFor(body.expectedName);
          throw new Error(body.error || "This link isn't working. Ask Ken or Larisa to send it again from People in Wander.");
        }
        return body;
      })
      .then((data: TripInfo) => {
        setTripInfo(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(navigator.onLine === false
          ? "You're offline. Open this link again once you have a signal."
          : e.message);
        setLoading(false);
      });
  }, [token]);

  // The Home Screen icon starts at this invite. Once this phone is signed in as its person, opening
  // the icon (or the link again from a message) goes straight to the trip — nothing to read or tap.
  const linkOwner = retiredFor || tripInfo?.expectedName || null;
  const ownLinkHere = !!(user && linkOwner && user.displayName.toLowerCase() === linkOwner.toLowerCase());
  useEffect(() => {
    if (ownLinkHere) navigate("/", { replace: true });
  }, [ownLinkHere, navigate]);

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

      // A full page load after signing in, so every screen starts fresh as this person —
      // no name, profile or trip left over from whoever was signed in before.
      // Straight to the trip — the help page stays one tap away under "?"
      window.location.replace("/"); // replace: the phone's Back never lands on the link page again
    } catch (e: any) {
      setError(e.message || "Something went wrong. Try again?");
      setJoining(false);
    }
  }

  if (loading || ownLinkHere) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#faf8f5]">
        <p className="text-[#6b5d4a]">Opening…</p>
      </div>
    );
  }

  if (!tripInfo) {
    const screen = (title: string, body: string, actions: ReactNode) => (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#faf8f5] p-6">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-xl font-medium text-[#3a3128] mb-2">{title}</h1>
          <p className="text-sm text-[#6b5d4a] mb-6">{body}</p>
          {actions}
          {faceIdError && <p className="text-sm text-[#8a3a2a] mt-4">{faceIdError}</p>}
        </div>
      </div>
    );
    const primary = "min-h-[48px] px-5 rounded-xl bg-[#514636] text-white text-base w-full disabled:opacity-60";

    if (retired && retiredFor) {
      // Their own link, on a phone already signed in as them: nothing to do
      if (user && user.displayName.toLowerCase() === retiredFor.toLowerCase()) {
        return screen("You're all set on this phone",
          "Face ID opens Wander here now, so this link isn't needed anymore.",
          <button onClick={() => navigate("/")} className={primary}>Open the trip</button>);
      }
      // Someone else's used link on a signed-in phone
      if (user) {
        return user.role === "planner"
          ? screen(`${retiredFor}'s link has done its job`,
              `${retiredFor} uses Face ID now, so this link doesn't open anything. If ${retiredFor} gets a new phone, make a new link from People on this trip.`,
              <button onClick={() => navigate("/people")} className={primary}>Go to People</button>)
          : screen(`This link is ${retiredFor}'s`,
              `This phone is signed in as ${user.displayName}. If you're ${retiredFor} on a new phone, ask Ken or Larisa to send a new link from People in Wander.`,
              <button onClick={() => navigate("/")} className={primary}>Open the trip as {user.displayName}</button>);
      }
      // Signed out: Face ID right here, one tap
      return screen(`Welcome back, ${retiredFor}`,
        "You already use Face ID for Wander. On a phone you've used before, it signs you in. On a new phone, ask Ken or Larisa to send a new link from People in Wander.",
        <button onClick={signInWithFaceId} disabled={signingIn} className={primary}>{signingIn ? "Checking…" : "Sign in with Face ID"}</button>);
    }

    return screen("This link isn't working", error,
      user
        ? <button onClick={() => navigate("/")} className={primary}>Open the trip</button>
        : <button onClick={() => navigate("/login")} className="min-h-[44px] px-5 text-sm text-[#514636] underline underline-offset-2">I already use Face ID on this phone</button>);
  }

  // Someone else's link on a phone already signed in: ask before switching who this phone is
  if (tripInfo.personalInvite && tripInfo.expectedName && user &&
      user.displayName.toLowerCase() !== tripInfo.expectedName.toLowerCase()) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-[#faf8f5] p-6">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-xl font-medium text-[#3a3128] mb-2">This link is for {tripInfo.expectedName}</h1>
          <p className="text-sm text-[#6b5d4a] mb-6">
            This phone is signed in as {user.displayName}. Switching signs this phone in as {tripInfo.expectedName} instead.
          </p>
          <button
            onClick={() => navigate("/")}
            className="min-h-[44px] px-5 rounded-xl bg-[#514636] text-white text-sm w-full mb-2"
          >
            Stay as {user.displayName}
          </button>
          <button
            onClick={() => handleJoin()}
            disabled={joining}
            className="min-h-[44px] px-5 rounded-xl border border-[#d6ccbc] text-[#514636] text-sm w-full disabled:opacity-60"
          >
            {joining ? "Switching…" : `Switch to ${tripInfo.expectedName}`}
          </button>
          {error && <p className="text-sm text-[#8a3a2a] mt-3">{error}</p>}
        </div>
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
              Hi, {tripInfo.expectedName}
            </h1>
            <p className="text-sm text-[#6b5d4a] mb-6">
              This opens {tripInfo.tripName}{tripInfo.dateRange ? ` (${tripInfo.dateRange})` : ""} on this phone.
            </p>
            {homeScreenFirst && <div className="mb-4"><AddToHomeScreen inviteToken={token} variant="invite" /></div>}
            <button
              onClick={() => handleJoin()}
              disabled={joining}
              className={homeScreenFirst
                ? "min-h-[44px] px-6 rounded-xl border border-[#d6ccbc] text-[#514636] text-sm w-full disabled:opacity-60"
                : "px-6 py-3 rounded-xl bg-[#514636] text-white text-base w-full disabled:opacity-60"}
            >
              {joining ? "Opening..." : homeScreenFirst ? "Or just open it here in Safari" : "Let's go"}
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

          <p className="text-sm text-[#6b5d4a] mb-2">You're invited to</p>
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
            <p className="text-xs text-[#6b5d4a] mb-6">
              {tripInfo.currentMembers.join(", ")} {tripInfo.currentMembers.length === 1 ? "is" : "are"} already here
            </p>
          )}

          {homeScreenFirst && <div className="mb-4"><AddToHomeScreen inviteToken={token} variant="invite" /></div>}
          <button
            onClick={() => handleJoin()}
            disabled={joining}
            className={homeScreenFirst
              ? "min-h-[44px] px-6 rounded-xl border border-[#d6ccbc] text-[#514636] text-sm w-full disabled:opacity-60"
              : "px-6 py-3.5 rounded-xl bg-[#514636] text-white text-base font-medium w-full disabled:opacity-60 active:scale-95 transition-transform"}
          >
            {joining ? "Joining..." : homeScreenFirst ? "Or just open it here in Safari" : "Let's go"}
          </button>

          <p className="text-xs text-[#6b5d4a] mt-4">
            Larisa's Guide on your phone: every day of the trip, where you sleep, and Scout for questions
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
              <p className="text-sm text-[#6b5d4a] mb-4">You're already part of this trip.</p>
              <button
                onClick={() => navigate("/")}
                className="px-5 py-2.5 rounded-xl bg-[#514636] text-white text-sm"
              >
                Go to Trip
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-[#6b5d4a] mb-6">
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
          <p className="text-xs text-[#6b5d4a] mb-6">
            {tripInfo.currentMembers.join(", ")} {tripInfo.currentMembers.length === 1 ? "is" : "are"} already here
          </p>
        )}

        {tripInfo.expectedNames.length > 0 && (
          <>
            <p className="text-sm text-[#6b5d4a] mb-3">Tap your name to join:</p>
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
              <span className="text-xs text-[#6b5d4a]">or</span>
              <div className="flex-1 h-px bg-[#e0d8cc]" />
            </div>
          </>
        )}

        <p className="text-sm text-[#6b5d4a] mb-3">
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

        <p className="text-xs text-[#6b5d4a] mt-8">
          Lost access?{" "}
          Ask your trip planner to send you a new link.
        </p>
      </div>
    </div>
  );
}
