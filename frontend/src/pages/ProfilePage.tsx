import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import type { TravelerProfile, TravelerDocument, Trip } from "../lib/types";

// ── Constants ──────────────────────────────────────────────────

const DOC_TYPES = [
  { value: "passport", label: "Passport", icon: "\u{1F6C2}", fields: ["number", "country", "expiry", "nameAsOnPassport"] },
  { value: "visa", label: "Visa", icon: "\u{1F4CB}", fields: ["country", "visaType", "number", "expiry", "status"] },
  { value: "frequent_flyer", label: "Frequent Flyer", icon: "\u2708\uFE0F", fields: ["airline", "program", "number"] },
  { value: "insurance", label: "Travel Insurance", icon: "\u{1F6E1}\uFE0F", fields: ["provider", "policyNumber", "emergencyPhone"] },
  { value: "ticket", label: "Ticket / Booking", icon: "\u{1F3AB}", fields: ["carrier", "referenceNumber", "route", "date"] },
  { value: "custom", label: "Other", icon: "\u{1F4CE}", fields: ["label", "value"] },
] as const;

const FIELD_LABELS: Record<string, string> = {
  number: "Number",
  country: "Country",
  expiry: "Expiry date",
  nameAsOnPassport: "Name (as printed)",
  visaType: "Visa type",
  status: "Status",
  airline: "Airline",
  program: "Program",
  provider: "Provider",
  policyNumber: "Policy number",
  emergencyPhone: "Emergency phone",
  carrier: "Carrier",
  referenceNumber: "Reference number",
  route: "Route",
  date: "Date",
  label: "Label",
  value: "Value",
};

const INTEREST_TAGS = [
  { key: "food", label: "Food", emoji: "\u{1F35C}" },
  { key: "nature", label: "Nature", emoji: "\u{1F33F}" },
  { key: "art", label: "Art", emoji: "\u{1F3A8}" },
  { key: "history", label: "History", emoji: "\u{1F3DB}\uFE0F" },
  { key: "nightlife", label: "Nightlife", emoji: "\u{1F319}" },
  { key: "shopping", label: "Shopping", emoji: "\u{1F6CD}\uFE0F" },
  { key: "ceramics", label: "Ceramics", emoji: "\u{1F3FA}" },
  { key: "temples", label: "Temples", emoji: "\u26E9\uFE0F" },
  { key: "architecture", label: "Architecture", emoji: "\u{1F3D7}\uFE0F" },
];

interface TravelerData {
  id: string;
  displayName: string;
  preferences: Record<string, unknown> | null;
}

interface Learning {
  id: string;
  content: string;
  scope: string;
  source: string;
  createdAt: string;
  traveler?: { displayName: string };
}

// ── Main Component ─────────────────────────────────────────────

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  // Preferences state
  const [traveler, setTraveler] = useState<TravelerData | null>(null);
  const [interests, setInterests] = useState<Record<string, boolean>>({});
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Document state (preserved from original)
  const [profile, setProfile] = useState<TravelerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tripId, setTripId] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formPrivate, setFormPrivate] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Learnings state
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [learningsLoading, setLearningsLoading] = useState(false);

  const isPlanner = user?.role === "planner";

  // ── Load all data ──────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        // Load trip + documents (existing logic)
        const trip = await api.get<Trip>("/trips/active");
        if (trip) {
          setTripId(trip.id);
          const p = await api.get<TravelerProfile | { documents: [] }>(`/traveler-documents/trip/${trip.id}`);
          setProfile(p && "id" in p ? p : null);
        }

        // Load traveler preferences
        if (user?.travelerId) {
          const t = await api.get<TravelerData>(`/auth/travelers/${user.travelerId}`);
          setTraveler(t);
          if (t.preferences && typeof t.preferences === "object") {
            const prefs = t.preferences as Record<string, unknown>;
            const interestMap: Record<string, boolean> = {};
            const savedInterests = (prefs.interests as string[]) || [];
            for (const tag of INTEREST_TAGS) {
              interestMap[tag.key] = savedInterests.includes(tag.key);
            }
            setInterests(interestMap);
          }
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    }
    load();
  }, [user?.travelerId]);

  // Load learnings for planners
  useEffect(() => {
    if (!isPlanner) return;
    async function loadLearnings() {
      setLearningsLoading(true);
      try {
        const data = await api.get<Learning[]>("/learnings");
        // Filter to this user's learnings
        const mine = data.filter((l) => l.traveler?.displayName === user?.displayName);
        setLearnings(mine);
      } catch {
        /* ignore */
      }
      setLearningsLoading(false);
    }
    loadLearnings();
  }, [isPlanner, user?.displayName]);

  // ── Preference handlers ────────────────────────────────────

  const toggleInterest = useCallback((key: string) => {
    setInterests((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  async function savePreferences() {
    if (!user?.travelerId) return;
    setSavingPrefs(true);
    try {
      const selectedInterests = Object.entries(interests)
        .filter(([, on]) => on)
        .map(([key]) => key);
      const prefs = {
        ...(traveler?.preferences && typeof traveler.preferences === "object" ? traveler.preferences : {}),
        interests: selectedInterests,
      };
      const updated = await api.patch<TravelerData>(`/auth/travelers/${user.travelerId}`, { preferences: prefs });
      setTraveler(updated);
      showToast("Got it");
    } catch {
      showToast("That didn't stick \u2014 give it another try", "error");
    }
    setSavingPrefs(false);
  }

  // ── Document handlers (preserved from original) ────────────

  async function handleSave() {
    if (!tripId || !addingType) return;
    try {
      await api.post("/traveler-documents", {
        tripId,
        type: addingType,
        data: formData,
        isPrivate: formPrivate,
      });
      showToast("Got it");
      setAddingType(null);
      setFormData({});
      setFormPrivate(false);
      const p = await api.get<TravelerProfile | { documents: [] }>(`/traveler-documents/trip/${tripId}`);
      setProfile(p && "id" in p ? p : null);
    } catch {
      showToast("Couldn't save \u2014 check your connection and try again", "error");
    }
  }

  async function handleUpdate(docId: string) {
    try {
      await api.patch(`/traveler-documents/${docId}`, {
        data: formData,
        isPrivate: formPrivate,
      });
      showToast("Updated");
      setEditingId(null);
      setFormData({});
      const p = await api.get<TravelerProfile | { documents: [] }>(`/traveler-documents/trip/${tripId}`);
      setProfile(p && "id" in p ? p : null);
    } catch {
      showToast("Couldn't update \u2014 check your connection and try again", "error");
    }
  }

  async function handleDelete(docId: string) {
    try {
      await api.delete(`/traveler-documents/${docId}`);
      setConfirmingDeleteId(null);
      showToast("Removed");
      const p = await api.get<TravelerProfile | { documents: [] }>(`/traveler-documents/trip/${tripId}`);
      setProfile(p && "id" in p ? p : null);
    } catch {
      showToast("Couldn't delete \u2014 check your connection and try again", "error");
    }
  }

  function startEdit(doc: TravelerDocument) {
    setEditingId(doc.id);
    setFormData(doc.data || {});
    setFormPrivate(doc.isPrivate);
    setAddingType(null);
  }

  function startAdd(type: string) {
    setAddingType(type);
    setFormData({});
    setFormPrivate(false);
    setEditingId(null);
  }

  // ── Derived data ───────────────────────────────────────────

  const docs = profile?.documents || [];
  const docsByType = DOC_TYPES.map((t) => ({
    ...t,
    docs: docs.filter((d) => d.type === t.value),
  }));

  // ── Loading state ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#faf8f5] flex items-center justify-center text-[#a89880]">
        Finding your profile...
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur-sm border-b border-[#e5ddd0] px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-[#a89880] hover:text-[#3a3128] transition-colors"
          >
            &larr; Back
          </button>
          <h1 className="text-lg font-medium text-[#3a3128]">{user?.displayName}</h1>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 pb-16 space-y-6">
        {/* Intro */}
        <p className="text-sm text-[#a89880] leading-relaxed">
          Here's what Scout knows about you &mdash; to help make every trip better.
        </p>

        {/* ── Section 1: About You ────────────────────────────── */}
        <section className="rounded-xl border border-[#e5ddd0] bg-white p-5">
          <h2 className="text-sm font-medium text-[#a89880] mb-3">About You</h2>

          <p className="text-sm text-[#6b5d4a] mb-4">
            What draws you to a place? Tap the ones that feel right.
          </p>

          <div className="flex flex-wrap gap-2 mb-4">
            {INTEREST_TAGS.map((tag) => (
              <button
                key={tag.key}
                onClick={() => toggleInterest(tag.key)}
                className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                  interests[tag.key]
                    ? "bg-[#514636] text-white"
                    : "bg-[#f5f0ea] text-[#6b5d4a] hover:bg-[#ece5db]"
                }`}
              >
                {tag.emoji} {tag.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-[#c8bba8]">
              You can also update this by telling Scout in chat
            </p>
            <button
              onClick={savePreferences}
              disabled={savingPrefs}
              className="px-4 py-1.5 rounded-lg bg-[#514636] text-white text-sm font-medium hover:bg-[#3a3128] transition-colors disabled:opacity-50"
            >
              {savingPrefs ? "Saving..." : "Save"}
            </button>
          </div>
        </section>

        {/* ── Section 2: Your Documents ───────────────────────── */}
        <section className="rounded-xl border border-[#e5ddd0] bg-white p-5">
          <h2 className="text-sm font-medium text-[#a89880] mb-1">Your Documents</h2>
          <p className="text-xs text-[#c8bba8] mb-4 leading-relaxed">
            Passport, insurance, frequent flyer &mdash; anything useful during the trip.
            Documents are shared with your travel group by default. Tap the lock to make any item private.
          </p>

          <div className="space-y-4">
            {docsByType.map((section) => (
              <div key={section.value}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-[#3a3128]">
                    {section.icon} {section.label}
                  </h3>
                  <button
                    onClick={() => startAdd(section.value)}
                    className="text-xs text-[#a89880] hover:text-[#514636] transition-colors"
                  >
                    + Add
                  </button>
                </div>

                {/* Existing documents */}
                {section.docs.map((doc) => (
                  <div key={doc.id} className="mb-2 bg-[#faf8f5] rounded-lg border border-[#e5ddd0] p-3">
                    {editingId === doc.id ? (
                      <DocumentForm
                        fields={section.fields as unknown as string[]}
                        data={formData}
                        isPrivate={formPrivate}
                        onChange={setFormData}
                        onPrivacyChange={setFormPrivate}
                        onSave={() => handleUpdate(doc.id)}
                        onCancel={() => { setEditingId(null); setFormData({}); }}
                        saveLabel="Update"
                      />
                    ) : (
                      <div>
                        <div className="flex items-start justify-between">
                          <div className="space-y-0.5">
                            {Object.entries(doc.data || {}).filter(([, v]) => v).map(([k, v]) => (
                              <div key={k} className="text-sm">
                                <span className="text-[#a89880]">{FIELD_LABELS[k] || k}: </span>
                                <span className="text-[#3a3128]">{v}</span>
                              </div>
                            ))}
                            {doc.label && (
                              <div className="text-xs text-[#c8bba8]">{doc.label}</div>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {doc.isPrivate && (
                              <span className="text-xs text-[#c8bba8]" title="Only you can see this">{"\u{1F512}"}</span>
                            )}
                            {confirmingDeleteId === doc.id ? (
                              <>
                                <span className="text-xs text-[#6b5d4a]">Remove this from your trip?</span>
                                <button
                                  onClick={() => handleDelete(doc.id)}
                                  className="text-xs text-red-500 font-medium hover:text-red-700 transition-colors"
                                >
                                  Remove
                                </button>
                                <button
                                  onClick={() => setConfirmingDeleteId(null)}
                                  className="text-xs text-[#a89880] hover:text-[#514636] transition-colors"
                                >
                                  Keep
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEdit(doc)}
                                  className="text-xs text-[#a89880] hover:text-[#514636] transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => setConfirmingDeleteId(doc.id)}
                                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                                >
                                  Remove
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add new form */}
                {addingType === section.value && (
                  <div className="mb-2 bg-[#faf8f5] rounded-lg border border-[#514636] p-3">
                    <DocumentForm
                      fields={section.fields as unknown as string[]}
                      data={formData}
                      isPrivate={formPrivate}
                      onChange={setFormData}
                      onPrivacyChange={setFormPrivate}
                      onSave={handleSave}
                      onCancel={() => { setAddingType(null); setFormData({}); }}
                      saveLabel="Save"
                    />
                  </div>
                )}

                {section.docs.length === 0 && addingType !== section.value && (
                  <p className="text-xs text-[#c8bba8] mb-2">Nothing here yet</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── Section 3: Your Learnings (Planners only) ───────── */}
        {isPlanner && (
          <section className="rounded-xl border border-[#e5ddd0] bg-white p-5">
            <h2 className="text-sm font-medium text-[#a89880] mb-1">Your Learnings</h2>
            <p className="text-xs text-[#c8bba8] mb-4">
              Things you've picked up along the way &mdash; from conversations, research, and experience.
            </p>

            {learningsLoading ? (
              <p className="text-sm text-[#a89880]">Finding your learnings...</p>
            ) : learnings.length === 0 ? (
              <p className="text-sm text-[#c8bba8]">
                No learnings yet. As you use Scout, insights will show up here.
              </p>
            ) : (
              <div className="space-y-3">
                {learnings.slice(0, 10).map((learning) => (
                  <div key={learning.id} className="bg-[#faf8f5] rounded-lg border border-[#e5ddd0] p-3">
                    <p className="text-sm text-[#3a3128] leading-relaxed">{learning.content}</p>
                    <p className="text-xs text-[#c8bba8] mt-1">
                      {new Date(learning.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {learning.scope === "trip_specific" && " \u00B7 This trip"}
                    </p>
                  </div>
                ))}
                {learnings.length > 10 && (
                  <p className="text-xs text-[#a89880] text-center">
                    Showing 10 of {learnings.length}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

// ── Document Form (preserved from original) ────────────────────

function DocumentForm({
  fields, data, isPrivate, onChange, onPrivacyChange, onSave, onCancel, saveLabel,
}: {
  fields: string[];
  data: Record<string, string>;
  isPrivate: boolean;
  onChange: (d: Record<string, string>) => void;
  onPrivacyChange: (p: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <div key={field}>
          <label className="text-xs text-[#a89880]">{FIELD_LABELS[field] || field}</label>
          <input
            type={field === "expiry" || field === "date" ? "date" : "text"}
            value={data[field] || ""}
            onChange={(e) => onChange({ ...data, [field]: e.target.value })}
            className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#e5ddd0] text-sm text-[#3a3128]
                       bg-white focus:outline-none focus:ring-1 focus:ring-[#a89880]"
            placeholder={FIELD_LABELS[field] || field}
          />
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => onPrivacyChange(!isPrivate)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            isPrivate
              ? "border-[#514636] bg-[#514636] text-white"
              : "border-[#e5ddd0] text-[#a89880] hover:bg-[#f5f0ea]"
          }`}
        >
          {isPrivate ? "\u{1F512} Only me" : "\u{1F465} Everyone in this trip"}
        </button>
        <span className="text-xs text-[#c8bba8] flex-1">
          {isPrivate ? "Only you can see this" : "Visible to everyone in the trip"}
        </span>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSave}
          className="flex-1 py-2 rounded-lg bg-[#514636] text-white text-sm font-medium hover:bg-[#3a3128] transition-colors"
        >
          {saveLabel}
        </button>
        <button
          onClick={onCancel}
          className="py-2 px-4 rounded-lg border border-[#e5ddd0] text-sm text-[#6b5d4a] hover:bg-[#f5f0ea] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
