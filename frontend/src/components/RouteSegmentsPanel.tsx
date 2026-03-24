import { useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import type { RouteSegment } from "../lib/types";

const MODE_EMOJI: Record<string, string> = {
  flight: "\u2708\uFE0F", train: "\uD83D\uDE83", ferry: "\u26F4\uFE0F", drive: "\uD83D\uDE97", other: "\uD83D\uDE90",
};

const MODES = ["flight", "train", "ferry", "drive", "other"] as const;

interface Props {
  tripId: string;
  segments: RouteSegment[];
  onRefresh: () => void;
}

function SegmentForm({
  initial,
  tripId,
  onSave,
  onCancel,
}: {
  initial?: RouteSegment;
  tripId: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { showToast } = useToast();
  const [originCity, setOriginCity] = useState(initial?.originCity || "");
  const [destinationCity, setDestinationCity] = useState(initial?.destinationCity || "");
  const [mode, setMode] = useState(initial?.transportMode || "train");
  const [depDate, setDepDate] = useState(initial?.departureDate?.split("T")[0] || "");
  const [depTime, setDepTime] = useState(initial?.departureTime || "");
  const [arrTime, setArrTime] = useState(initial?.arrivalTime || "");
  const [depStation, setDepStation] = useState(initial?.departureStation || "");
  const [arrStation, setArrStation] = useState(initial?.arrivalStation || "");
  const [serviceNum, setServiceNum] = useState(initial?.serviceNumber || "");
  const [confNum, setConfNum] = useState(initial?.confirmationNumber || "");
  const [seat, setSeat] = useState(initial?.seatInfo || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!initial && (!originCity.trim() || !destinationCity.trim())) {
      showToast("Origin and destination are required", "error");
      return;
    }
    setSaving(true);
    try {
      const data: any = {
        transportMode: mode,
        departureDate: depDate || null,
        departureTime: depTime || null,
        arrivalTime: arrTime || null,
        departureStation: depStation || null,
        arrivalStation: arrStation || null,
        serviceNumber: serviceNum || null,
        confirmationNumber: confNum || null,
        seatInfo: seat || null,
        notes: notes || null,
      };

      if (initial) {
        await api.patch(`/route-segments/${initial.id}`, data);
      } else {
        await api.post("/route-segments", {
          ...data,
          tripId,
          originCity: originCity.trim(),
          destinationCity: destinationCity.trim(),
        });
      }
      showToast(initial ? "Segment updated" : "Segment added");
      onSave();
    } catch {
      showToast("Couldn't save segment", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
      {/* Origin / Destination — only editable for new segments */}
      {!initial && (
        <div className="flex gap-2">
          <input type="text" value={originCity} onChange={(e) => setOriginCity(e.target.value)}
            placeholder="From city"
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
          <span className="text-amber-400 self-center">&rarr;</span>
          <input type="text" value={destinationCity} onChange={(e) => setDestinationCity(e.target.value)}
            placeholder="To city"
            className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
      )}
      {initial && (
        <div className="text-sm font-medium text-amber-800 mb-1">
          {initial.originCity} &rarr; {initial.destinationCity}
        </div>
      )}

      {/* Mode selector */}
      <div className="flex gap-1.5 flex-wrap">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              mode === m ? "bg-amber-600 text-white" : "bg-white text-amber-700 border border-amber-200"
            }`}
          >
            {MODE_EMOJI[m]} {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Service number + confirmation */}
      <div className="flex gap-2">
        <input type="text" value={serviceNum} onChange={(e) => setServiceNum(e.target.value)}
          placeholder={mode === "flight" ? "Flight # (e.g. NH204)" : "Service # (e.g. Nozomi 42)"}
          className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        <input type="text" value={confNum} onChange={(e) => setConfNum(e.target.value)}
          placeholder="Confirmation #"
          className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
      </div>

      {/* Date + departure/arrival times */}
      <div className="flex gap-2">
        <input type="date" value={depDate} onChange={(e) => setDepDate(e.target.value)}
          className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        <input type="time" value={depTime} onChange={(e) => setDepTime(e.target.value)}
          placeholder="Depart"
          className="w-24 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        <input type="time" value={arrTime} onChange={(e) => setArrTime(e.target.value)}
          placeholder="Arrive"
          className="w-24 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] focus:outline-none focus:ring-1 focus:ring-amber-400" />
      </div>

      {/* Stations */}
      <div className="flex gap-2">
        <input type="text" value={depStation} onChange={(e) => setDepStation(e.target.value)}
          placeholder="From station/airport"
          className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        <input type="text" value={arrStation} onChange={(e) => setArrStation(e.target.value)}
          placeholder="To station/airport"
          className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
      </div>

      {/* Seat + notes */}
      <div className="flex gap-2">
        <input type="text" value={seat} onChange={(e) => setSeat(e.target.value)}
          placeholder="Seat info"
          className="w-28 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes"
          className="flex-1 px-2 py-1.5 rounded border border-amber-200 text-sm text-[#3a3128] placeholder-[#c8bba8] focus:outline-none focus:ring-1 focus:ring-amber-400" />
      </div>

      {/* Save / Cancel */}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-1.5 rounded bg-amber-600 text-white text-xs font-medium hover:bg-amber-700 disabled:opacity-40 transition-colors">
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={onCancel}
          className="px-4 py-1.5 rounded text-xs text-amber-700 hover:bg-amber-100 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

function SegmentCard({
  segment,
  onRefresh,
  tripId,
}: {
  segment: RouteSegment;
  onRefresh: () => void;
  tripId: string;
}) {
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const emoji = MODE_EMOJI[segment.transportMode.toLowerCase()] || "\uD83D\uDE90";

  async function handleDelete() {
    try {
      await api.delete(`/route-segments/${segment.id}`);
      showToast("Segment deleted");
      onRefresh();
    } catch {
      showToast("Couldn't delete segment", "error");
    }
  }

  if (editing) {
    return (
      <SegmentForm
        initial={segment}
        tripId={tripId}
        onSave={() => { setEditing(false); onRefresh(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
      <div
        className="px-3 py-2.5 cursor-pointer hover:bg-amber-100 transition-colors"
        onClick={() => setEditing(true)}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium text-amber-800">
            {emoji} {segment.originCity} &rarr; {segment.destinationCity}
          </div>
          <span className="text-xs text-amber-500">tap to edit</span>
        </div>

        <div className="mt-1 space-y-0.5">
          <div className="text-sm text-amber-700">
            {segment.transportMode.charAt(0).toUpperCase() + segment.transportMode.slice(1)}
            {segment.serviceNumber && ` \u00B7 ${segment.serviceNumber}`}
            {segment.departureDate && ` \u00B7 ${new Date(segment.departureDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`}
          </div>
          {(segment.departureTime || segment.arrivalTime) && (
            <div className="text-sm text-amber-600">
              {segment.departureTime && `Depart ${segment.departureTime}`}
              {segment.departureTime && segment.arrivalTime && " \u2192 "}
              {segment.arrivalTime && `Arrive ${segment.arrivalTime}`}
            </div>
          )}
          {(segment.departureStation || segment.arrivalStation) && (
            <div className="text-sm text-amber-600">
              {segment.departureStation}{segment.departureStation && segment.arrivalStation && " \u2192 "}{segment.arrivalStation}
            </div>
          )}
          {segment.confirmationNumber && (
            <button onClick={() => { navigator.clipboard.writeText(segment.confirmationNumber!); showToast("Copied confirmation number"); }}
              className="text-xs text-amber-500 hover:text-amber-700 transition-colors">Conf: {segment.confirmationNumber} 📋</button>
          )}
          {segment.seatInfo && (
            <div className="text-xs text-amber-500">Seat: {segment.seatInfo}</div>
          )}
          {segment.notes && (
            <div className="text-sm text-amber-600 italic">{segment.notes}</div>
          )}
        </div>
      </div>

      {/* Delete button */}
      <div className="px-3 py-1.5 border-t border-amber-100 flex justify-end">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-amber-600">Delete this segment?</span>
            <button onClick={handleDelete}
              className="text-xs text-red-600 font-medium hover:text-red-800">Yes</button>
            <button onClick={() => setConfirmDelete(false)}
              className="text-xs text-amber-500 hover:text-amber-700">No</button>
          </div>
        ) : (
          <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            className="text-xs text-amber-400 hover:text-red-500 transition-colors">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function RouteSegmentsPanel({ tripId, segments, onRefresh }: Props) {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem("wander:route-segments-expanded") === "true"; } catch { return false; }
  });
  const [adding, setAdding] = useState(false);

  return (
    <section className="mb-6">
      <button
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          try { localStorage.setItem("wander:route-segments-expanded", String(next)); } catch {}
        }}
        className="w-full text-left flex items-center justify-between mb-2"
      >
        <h2 className="text-sm font-medium text-[#3a3128]">
          Travel
          {segments.length > 0 && (
            <span className="ml-2 text-[#a89880] font-normal">{segments.length} segment{segments.length !== 1 ? "s" : ""}</span>
          )}
        </h2>
        <span className="text-sm text-[#a89880]">{expanded ? "\u25B4" : "\u25BE"}</span>
      </button>

      {expanded && (
        <div className="space-y-2">
          {segments.map((seg) => (
            <SegmentCard key={seg.id} segment={seg} tripId={tripId} onRefresh={onRefresh} />
          ))}

          {adding ? (
            <SegmentForm
              tripId={tripId}
              onSave={() => { setAdding(false); onRefresh(); }}
              onCancel={() => setAdding(false)}
            />
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full py-2 rounded-lg border border-dashed border-amber-300 text-sm text-amber-600
                         hover:bg-amber-50 hover:border-amber-400 transition-colors"
            >
              {segments.length === 0 ? "+ Add your first travel segment" : "+ Add segment"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
