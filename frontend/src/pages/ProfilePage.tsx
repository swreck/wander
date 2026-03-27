import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import type { TravelerProfile, TravelerDocument, Trip } from "../lib/types";

const DOC_TYPES = [
  { value: "passport", label: "Passport", icon: "🛂", fields: ["number", "country", "expiry", "nameAsOnPassport"] },
  { value: "visa", label: "Visa", icon: "📋", fields: ["country", "visaType", "number", "expiry", "status"] },
  { value: "frequent_flyer", label: "Frequent Flyer", icon: "✈️", fields: ["airline", "program", "number"] },
  { value: "insurance", label: "Travel Insurance", icon: "🛡️", fields: ["provider", "policyNumber", "emergencyPhone"] },
  { value: "ticket", label: "Ticket / Booking", icon: "🎫", fields: ["carrier", "referenceNumber", "route", "date"] },
  { value: "custom", label: "Other", icon: "📎", fields: ["label", "value"] },
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

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<TravelerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tripId, setTripId] = useState<string | null>(null);
  const [addingType, setAddingType] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [formPrivate, setFormPrivate] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const trip = await api.get<Trip>("/trips/active");
        if (!trip) { setLoading(false); return; }
        setTripId(trip.id);
        const p = await api.get<TravelerProfile | { documents: [] }>(`/traveler-documents/trip/${trip.id}`);
        setProfile(p && "id" in p ? p : null);
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave() {
    if (!tripId || !addingType) return;
    try {
      await api.post("/traveler-documents", {
        tripId,
        type: addingType,
        data: formData,
        isPrivate: formPrivate,
      });
      showToast("Document saved");
      setAddingType(null);
      setFormData({});
      setFormPrivate(false);
      // Reload
      const p = await api.get<TravelerProfile | { documents: [] }>(`/traveler-documents/trip/${tripId}`);
      setProfile(p && "id" in p ? p : null);
    } catch {
      showToast("Couldn't save — check your connection and try again", "error");
    }
  }

  async function handleUpdate(docId: string) {
    try {
      await api.patch(`/traveler-documents/${docId}`, {
        data: formData,
        isPrivate: formPrivate,
      });
      showToast("Document updated");
      setEditingId(null);
      setFormData({});
      // Reload
      const p = await api.get<TravelerProfile | { documents: [] }>(`/traveler-documents/trip/${tripId}`);
      setProfile(p && "id" in p ? p : null);
    } catch {
      showToast("Couldn't update — check your connection and try again", "error");
    }
  }

  async function handleDelete(docId: string) {
    if (!window.confirm("Delete this document? This can't be undone.")) return;
    try {
      await api.delete(`/traveler-documents/${docId}`);
      showToast("Document deleted");
      const p = await api.get<TravelerProfile | { documents: [] }>(`/traveler-documents/trip/${tripId}`);
      setProfile(p && "id" in p ? p : null);
    } catch {
      showToast("Couldn't delete — check your connection and try again", "error");
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

  const docs = profile?.documents || [];
  const docsByType = DOC_TYPES.map((t) => ({
    ...t,
    docs: docs.filter((d) => d.type === t.value),
  }));

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#faf8f5] flex items-center justify-center text-[#8a7a62]">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#faf8f5]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#faf8f5]/95 backdrop-blur-sm border-b border-[#e0d8cc] px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-[#8a7a62] hover:text-[#3a3128]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-lg font-medium text-[#3a3128]">{user?.displayName}'s Travel Info</h1>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Hint */}
        <p className="text-xs text-[#8a7a62] leading-relaxed">
          Store your travel documents here or tell the chat assistant — "my passport number is..." works too.
          Documents are shared with your travel group by default. Tap the lock to make any item private.
        </p>

        {/* Document sections */}
        {docsByType.map((section) => (
          <section key={section.value}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-[#3a3128]">
                {section.icon} {section.label}
              </h2>
              <button
                onClick={() => startAdd(section.value)}
                className="text-xs text-[#8a7a62] hover:text-[#514636]"
              >
                + Add
              </button>
            </div>

            {/* Existing documents */}
            {section.docs.map((doc) => (
              <div key={doc.id} className="mb-2 bg-white rounded-lg border border-[#e0d8cc] p-3">
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
                            <span className="text-[#8a7a62]">{FIELD_LABELS[k] || k}: </span>
                            <span className="text-[#3a3128]">{v}</span>
                          </div>
                        ))}
                        {doc.label && (
                          <div className="text-xs text-[#c8bba8]">{doc.label}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {doc.isPrivate && (
                          <span className="text-xs text-[#c8bba8]" title="Private — only you can see this">🔒</span>
                        )}
                        <button
                          onClick={() => startEdit(doc)}
                          className="text-xs text-[#8a7a62] hover:text-[#514636]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add new form */}
            {addingType === section.value && (
              <div className="mb-2 bg-white rounded-lg border border-[#514636] p-3">
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
          </section>
        ))}
      </div>
    </div>
  );
}

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
          <label className="text-xs text-[#8a7a62]">{FIELD_LABELS[field] || field}</label>
          <input
            type={field === "expiry" || field === "date" ? "date" : "text"}
            value={data[field] || ""}
            onChange={(e) => onChange({ ...data, [field]: e.target.value })}
            className="w-full mt-0.5 px-2.5 py-1.5 rounded border border-[#e0d8cc] text-sm text-[#3a3128]
                       focus:outline-none focus:ring-1 focus:ring-[#a89880]"
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
              : "border-[#e0d8cc] text-[#8a7a62] hover:bg-[#f0ece5]"
          }`}
        >
          {isPrivate ? "🔒 Only me" : "👥 Everyone in this trip"}
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
          className="py-2 px-4 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a] hover:bg-[#f0ece5] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
