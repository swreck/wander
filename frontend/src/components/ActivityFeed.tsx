/**
 * ActivityFeed — A lightweight stream of what's been happening.
 *
 * Shows recent activity from the group — additions, reactions, notes.
 * Only positive actions. Never absence.
 */

import { useState, useEffect } from "react";
import { changeRest } from "../lib/changeWords";
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

  const shown = netMarks(latestPicksOnly(feed));
  // (nothing left to show — only a tick and its Undo — no heading over nothing; re-audit 2)
  if (shown.length === 0) return null;

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

  const visible = expanded ? shown : shown.slice(0, 4);

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left min-h-[44px] flex items-end"
      >
        <h3 className="text-xs font-medium uppercase tracking-wider text-[#6b5d4a] mb-2">
          Recent activity
          {!expanded && shown.length > 4 && (
            <span className="ml-1 text-[#6b5d4a] normal-case tracking-normal">
              · {shown.length} total
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
              <span className="text-[#6b5d4a]">{changeRest(item.userDisplayName, item.description)}</span>
            </div>
            <span className="text-xs text-[#6b5d4a] shrink-0 mt-0.5">
              {timeAgo(item.createdAt)}
            </span>
          </div>
        ))}
      </div>
      {shown.length > 4 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 min-h-[44px] text-sm text-[#514636] underline underline-offset-2"
        >
          {expanded ? "Show less" : `Show all ${shown.length}`}
        </button>
      )}
    </div>
  );
}

/**
 * A tick and its Undo say nothing changed (Oct 10 re-audit: everyone's Home showed "Julie marked 'Train to Hotel' done"
 * and "…not done yet" as two lines). Same person, same line, within half an hour: ticked then undone — neither shows;
 * marked again — only the latest. The feed arrives newest first.
 */
function netMarks(feed: FeedItem[]): FeedItem[] {
  const markOf = (i: FeedItem) => {
    const m = i.description.match(/^marked "(.+)" (done|not done yet)$/);
    return m ? { key: `${i.userDisplayName}|${m[1]}`, done: m[2] === "done" } : null;
  };
  const dropped = new Set<string>();
  const out: FeedItem[] = [];
  feed.forEach((item, k) => {
    if (dropped.has(item.id)) return;
    const mine = markOf(item);
    if (mine) {
      const before = feed.slice(k + 1).find((o) => !dropped.has(o.id) && markOf(o)?.key === mine.key);
      if (before && new Date(item.createdAt).getTime() - new Date(before.createdAt).getTime() <= 30 * 60_000) {
        dropped.add(before.id);
        if (!mine.done && markOf(before)!.done) return;
      }
    }
    out.push(item);
  });
  return out;
}

/**
 * Quick changes of mind about one line of her plan read as one: the latest ("Ken switched "Lunch" to Omen"),
 * not three entries on everyone's Home (round 7). Only picks and Undos by the same person, for the same
 * line and day, within half an hour of each other are merged; the feed arrives newest first.
 */
function latestPicksOnly(feed: FeedItem[]): FeedItem[] {
  const pickKey = (i: FeedItem) => {
    const m = i.description.match(/^switched "(.+?)" to .+ on (.+)$/) || i.description.match(/^picked .+ for "(.+?)" on (.+)$/)
      // An Undo ("took "Lunch: Omen" off Tue, Oct 27") is part of the same change of mind
      || i.description.match(/^took "(.+?): .+" off (.+)$/);
    return m ? `${i.userDisplayName}|${m[1]}|${m[2]}` : null;
  };
  const kept: FeedItem[] = [];
  const newestAt = new Map<string, number>();
  for (const item of feed) {
    const key = pickKey(item);
    const at = new Date(item.createdAt).getTime();
    if (key) {
      const newer = newestAt.get(key);
      newestAt.set(key, at);
      if (newer !== undefined && newer - at <= 30 * 60_000) continue;
    }
    kept.push(item);
  }
  return kept;
}
