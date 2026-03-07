import { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  actions?: string[];
}

interface ChatContext {
  page: string;
  tripId?: string;
  cityId?: string;
  cityName?: string;
  dayId?: string;
  dayDate?: string;
}

interface ChatBubbleProps {
  context: ChatContext;
  onDataChanged?: () => void;
}

function storageKey(tripId?: string) {
  return `wander-chat-${tripId || "global"}`;
}

function loadMessages(tripId?: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(storageKey(tripId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveMessages(msgs: ChatMessage[], tripId?: string) {
  try {
    // Keep last 50 messages to avoid unbounded growth
    const trimmed = msgs.slice(-50);
    localStorage.setItem(storageKey(tripId), JSON.stringify(trimmed));
  } catch { /* quota exceeded — ignore */ }
}

export default function ChatBubble({ context, onDataChanged }: ChatBubbleProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(context.tripId));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Persist messages to localStorage
  useEffect(() => {
    saveMessages(messages, context.tripId);
  }, [messages, context.tripId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;

    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setMessages((prev) => [...prev, { role: "user", text }]);
    setSending(true);

    try {
      // Send recent history so the bot has conversation context
      const history = messages.slice(-10).map((m) => ({ role: m.role, text: m.text }));
      const res = await api.post<{ reply: string; actions: string[]; hasActions: boolean }>(
        "/chat",
        { message: text, context, history },
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: res.reply, actions: res.actions },
      ]);
      if (res.hasActions && onDataChanged) {
        onDataChanged();
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sorry, something went wrong. Try again." },
      ]);
    } finally {
      setSending(false);
    }
  }, [input, sending, context, onDataChanged]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Auto-resize textarea to fit content (up to 40% of chat panel)
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const panel = el.closest("[data-chat-panel]") as HTMLElement | null;
    const maxH = panel ? panel.clientHeight * 0.4 : 200;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, maxH) + "px";
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed z-50 flex items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95
          right-4 w-11 h-11
          sm:right-6 sm:w-12 sm:h-12"
        style={{ backgroundColor: "#514636", color: "#faf8f5", bottom: "calc(env(safe-area-inset-bottom, 0px) + 140px)" }}
        aria-label="Open chat assistant"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop on mobile */}
      <div
        className="fixed inset-0 bg-black/20 z-40 sm:hidden"
        onClick={() => setOpen(false)}
      />

      {/* Chat panel — bottom sheet on mobile, side panel on desktop */}
      <div
        data-chat-panel
        className="fixed z-50 flex flex-col bg-[#faf8f5] shadow-2xl border border-[#e5ddd0]
          inset-x-0 bottom-0 max-h-[75vh] rounded-t-2xl
          sm:inset-auto sm:bottom-6 sm:right-6 sm:w-96 sm:max-h-[500px] sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5ddd0]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm font-medium text-[#3a3128]">Wander Assistant</span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={() => { setMessages([]); localStorage.removeItem(storageKey(context.tripId)); }}
                className="p-1.5 rounded-lg text-[#8a7a62] hover:bg-[#f0ebe3] text-xs"
                title="Clear chat"
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg text-[#8a7a62] hover:bg-[#f0ebe3]"
              aria-label="Close chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="text-center text-[#8a7a62] text-sm py-8">
              <p>Ask me anything about your trip,</p>
              <p>or tell me what to do.</p>
              <div className="mt-4 space-y-1.5 text-sm text-[#a89a82]">
                <p>"What's planned for Tuesday?"</p>
                <p>"Add Fushimi Inari to Kyoto"</p>
                <p>"Move the temple visit to day 3"</p>
                <p>"How many experiences in Osaka?"</p>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-base leading-relaxed ${
                  msg.role === "user"
                    ? "bg-[#514636] text-[#faf8f5]"
                    : "bg-[#f0ebe3] text-[#3a3128]"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-[#d9cfc0]/50 space-y-0.5">
                    {msg.actions.map((a, j) => (
                      <p key={j} className="text-sm opacity-75 flex items-center gap-1">
                        <span>&#10003;</span> {a}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-[#f0ebe3] rounded-2xl px-3.5 py-2 text-sm text-[#8a7a62]">
                <span className="inline-flex gap-1">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-3 py-3 border-t border-[#e5ddd0]">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(); }}
              onPaste={() => setTimeout(autoResize, 0)}
              onKeyDown={handleKeyDown}
              placeholder="Ask or tell me what to do..."
              disabled={sending}
              rows={1}
              className="flex-1 bg-[#f0ebe3] rounded-xl px-3.5 py-2.5 text-sm text-[#3a3128] placeholder:text-[#a89a82] outline-none focus:ring-2 focus:ring-[#514636]/20 disabled:opacity-50 resize-none"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="p-2.5 rounded-xl transition-colors disabled:opacity-30"
              style={{ backgroundColor: "#514636", color: "#faf8f5" }}
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
