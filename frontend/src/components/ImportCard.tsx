import { useNavigate } from "react-router-dom";

interface Props {
  tripId: string;
}

export default function ImportCard({ tripId }: Props) {
  const navigate = useNavigate();

  return (
    <div className="mb-6 p-4 bg-white rounded-xl border border-[#f0ece5]">
      <p className="text-sm text-[#6b5d4a] mb-3">Have something to add?</p>
      <div className="flex gap-3">
        <button
          onClick={() => {
            // Dispatch universal capture with camera focus
            window.dispatchEvent(new CustomEvent("wander:open-capture", { detail: { mode: "camera" } }));
          }}
          className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg bg-[#faf8f5] border border-[#f0ece5] hover:border-[#e0d8cc] transition-colors"
        >
          <span className="text-lg">📷</span>
          <span className="text-xs text-[#8a7a62]">Camera</span>
        </button>
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("wander:open-capture", { detail: { mode: "paste" } }));
          }}
          className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg bg-[#faf8f5] border border-[#f0ece5] hover:border-[#e0d8cc] transition-colors"
        >
          <span className="text-lg">📋</span>
          <span className="text-xs text-[#8a7a62]">Paste</span>
        </button>
        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("wander-open-chat"));
          }}
          className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg bg-[#faf8f5] border border-[#f0ece5] hover:border-[#e0d8cc] transition-colors"
        >
          <span className="text-lg">💬</span>
          <span className="text-xs text-[#8a7a62]">Ask Scout</span>
        </button>
      </div>
    </div>
  );
}
