import { useState, useEffect } from "react";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";

interface Member {
  id: string;
  travelerId: string;
  displayName: string;
  role: string;
  joinedAt: string;
}

interface Invite {
  id: string;
  expectedName: string;
  inviteToken: string | null;
  claimedAt: string | null;
}

interface Props {
  tripId: string;
  onClose: () => void;
}

export default function TripMembers({ tripId, onClose }: Props) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const isPlanner = user?.role === "planner";

  useEffect(() => {
    loadMembers();
  }, [tripId]);

  async function loadMembers() {
    try {
      const data = await api.get<{ members: Member[]; invites: Invite[] }>(
        `/trips/${tripId}/members`
      );
      setMembers(data.members || []);
      setInvites(data.invites || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  async function addMember() {
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await api.post(`/trips/${tripId}/add-members`, {
        names: [newName.trim()],
      });
      setNewName("");
      setMessage(`Invite created for ${newName.trim()}`);
      await loadMembers();
    } catch (err: any) {
      setMessage(err?.message || "Couldn't add member");
    } finally {
      setAdding(false);
    }
  }

  async function resendInvite(inviteId: string) {
    try {
      const result = await api.post<{ inviteToken: string }>(
        `/trips/${tripId}/resend-invite`,
        { inviteId }
      );
      await loadMembers();
      // Copy the new link
      const link = `${window.location.origin}/join/${result.inviteToken}`;
      await navigator.clipboard.writeText(link);
      setCopiedId(inviteId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err: any) {
      setMessage(err?.message || "Couldn't resend invite");
    }
  }

  async function copyInviteLink(token: string, inviteId: string) {
    const link = `${window.location.origin}/join/${token}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(inviteId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function resetVaultPin(travelerId: string, name: string) {
    try {
      await api.post(`/vault/reset-pin/${travelerId}`, {});
      setMessage(`${name}'s vault PIN has been reset`);
      setResetConfirm(null);
    } catch (err: any) {
      setMessage(err?.message || "Couldn't reset PIN");
    }
  }

  async function shareLink() {
    try {
      const result = await api.post<{ inviteLink: string }>(
        `/trips/${tripId}/invite`,
        { type: "trip" }
      );
      const link = result.inviteLink || `${window.location.origin}/join/${(result as any).inviteToken}`;
      if (navigator.share) {
        await navigator.share({ title: "Join our trip on Wander", url: link });
      } else {
        await navigator.clipboard.writeText(link);
        setMessage("Invite link copied");
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessage(err?.message || "Couldn't create invite");
      }
    }
  }

  const pendingInvites = invites.filter((i) => !i.claimedAt);

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center">
      <div
        className="bg-[#faf8f5] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e0d8cc]">
          <h2 className="text-lg font-medium text-[#3a3128]">Trip members</h2>
          <button onClick={onClose} className="text-[#8a7a62] text-sm">
            Done
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-3">
          {loading ? (
            <p className="text-sm text-[#a89880] text-center py-8">Loading...</p>
          ) : (
            <>
              {/* Current members */}
              <div className="space-y-2 mb-6">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-2"
                  >
                    <div>
                      <span className="text-sm text-[#3a3128] font-medium">
                        {m.displayName}
                      </span>
                      {m.role === "planner" && (
                        <span className="ml-2 text-xs text-[#8a7a62] bg-[#f0ece4] px-1.5 py-0.5 rounded">
                          Planner
                        </span>
                      )}
                    </div>
                    {isPlanner && m.travelerId !== user?.travelerId && (
                      <div className="flex items-center gap-2">
                        {resetConfirm === m.travelerId ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => resetVaultPin(m.travelerId, m.displayName)}
                              className="text-xs text-red-600"
                            >
                              Confirm reset
                            </button>
                            <button
                              onClick={() => setResetConfirm(null)}
                              className="text-xs text-[#a89880]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setResetConfirm(m.travelerId)}
                            className="text-xs text-[#a89880] hover:text-[#8a7a62]"
                            title="Reset vault PIN"
                          >
                            Reset PIN
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pending invites */}
              {pendingInvites.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs text-[#a89880] uppercase tracking-wide mb-2">
                    Waiting to join
                  </h3>
                  <div className="space-y-2">
                    {pendingInvites.map((inv) => (
                      <div
                        key={inv.id}
                        className="flex items-center justify-between py-2"
                      >
                        <span className="text-sm text-[#8a7a62]">
                          {inv.expectedName}
                        </span>
                        <div className="flex items-center gap-2">
                          {inv.inviteToken && (
                            <button
                              onClick={() => copyInviteLink(inv.inviteToken!, inv.id)}
                              className="text-xs text-[#514636]"
                            >
                              {copiedId === inv.id ? "Copied!" : "Copy link"}
                            </button>
                          )}
                          {isPlanner && (
                            <button
                              onClick={() => resendInvite(inv.id)}
                              className="text-xs text-[#8a7a62]"
                            >
                              {copiedId === inv.id ? "Sent!" : "Resend"}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add member (planner only) */}
              {isPlanner && (
                <div className="mb-4">
                  <h3 className="text-xs text-[#a89880] uppercase tracking-wide mb-2">
                    Invite someone new
                  </h3>
                  <div className="flex gap-2">
                    <input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Their name"
                      className="flex-1 px-3 py-2 border border-[#e0d8cc] rounded-lg text-sm focus:outline-none focus:border-[#514636]"
                      onKeyDown={(e) => e.key === "Enter" && addMember()}
                    />
                    <button
                      onClick={addMember}
                      disabled={!newName.trim() || adding}
                      className="px-4 py-2 bg-[#514636] text-white rounded-lg text-sm font-medium disabled:opacity-40"
                    >
                      {adding ? "..." : "Add"}
                    </button>
                  </div>
                </div>
              )}

              {/* Share trip link */}
              {isPlanner && (
                <button
                  onClick={shareLink}
                  className="w-full py-2.5 border border-[#e0d8cc] rounded-lg text-sm text-[#514636] hover:bg-[#f5f0ea] transition-colors"
                >
                  Share trip invite link
                </button>
              )}

              {/* Status message */}
              {message && (
                <p className="text-sm text-[#8a7a62] text-center mt-3">
                  {message}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
