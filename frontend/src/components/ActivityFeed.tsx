/**
 * ActivityFeed — A lightweight stream of what's been happening.
 *
 * Shows recent activity from the group — additions, reactions, notes.
 * Only positive actions. Never absence.
 */

import { useState, useEffect } from "react";
import { api } from "../lib/api";

interface FeedItem {
  id: string;
  type: "change" | "reaction" | "note";
  userDisplayName: string;
  description: string;
  createdAt: string;
}

export default function ActivityFeed({ tripId }: { tripId: string }) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    api.get<{ feed: FeedItem[] }>(`/activity-feed/trip/${tripId}?limit=20`)
      .then(res => setFeed(res?.feed || []))
      .catch(() => {});
  }, [tripId]);

  useEffect(() => {
    const handler = () => {
      api.get<{ feed: FeedItem[] }>(`/activity-feed/trip/${tripId}?limit=20`)
        .then(res => setFeed(res?.feed || []))
        .catch(() => {});
    };
    window.addEventListener("wander:data-changed", handler);
    return () => window.removeEventListener("wander:data-changed", handler);
  }, [tripId]);

  if (feed.length === 0) return null;

  const typeIcon = (type: string) => {
    switch (type) {
      case "reaction": return "❤️";
      case "note": return "💬";
      default: return "＋";
    }
  };

  function timeAgo(dateStr: string): string {
    const ms = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const visible = expanded ? feed : feed.slice(0, 4);

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <h3 className="text-xs font-medium uppercase tracking-wider text-[#a89880] mb-2">
          Recent activity
          {!expanded && feed.length > 4 && (
            <span className="ml-1 text-[#c8bba8] normal-case tracking-normal">
              · {feed.length} total
            </span>
          )}
        </h3>
      </button>
      <div className="space-y-1.5">
        {visible.map(item => (
          <div key={item.id} className="flex items-start gap-2 text-sm">
            <span className="shrink-0 mt-0.5" style={{ fontSize: 11 }}>
              {typeIcon(item.type)}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-[#3a3128] font-medium">{item.userDisplayName}</span>
              {" "}
              <span className="text-[#8a7a62]">{item.description}</span>
            </div>
            <span className="text-xs text-[#c8bba8] shrink-0 mt-0.5">
              {timeAgo(item.createdAt)}
            </span>
          </div>
        ))}
      </div>
      {feed.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-[#c8bba8] hover:text-[#8a7a62] transition-colors"
        >
          {expanded ? "Show less" : `Show all ${feed.length}`}
        </button>
      )}
    </div>
  );
}
