import { useLocation, useNavigate } from "react-router-dom";

interface Props {
  pendingChanges?: number;
}

const tabs = [
  {
    path: "/",
    label: "Home",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    path: "/plan",
    label: "Plan",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
  },
  {
    path: "/now",
    label: "Now",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
];

export default function BottomNav({ pendingChanges }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  // Hide on login, join pages, and PlanPage (PlanPage has its own action bar)
  if (location.pathname === "/login" || location.pathname.startsWith("/join")) return null;
  if (location.pathname === "/plan") return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#e0d8cc]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const isActive = tab.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(tab.path);

          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-colors relative
                ${isActive ? "text-[#514636]" : "text-[#c8bba8] hover:text-[#8a7a62]"}`}
            >
              {tab.icon}
              <span className="text-[11px] leading-tight font-medium">{tab.label}</span>
              {/* Badge dot for pending sync changes on Home */}
              {tab.path === "/" && pendingChanges && pendingChanges > 0 ? (
                <span className="absolute top-0 right-1 w-2 h-2 rounded-full bg-amber-500" />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
