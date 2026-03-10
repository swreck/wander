import { useState, useEffect } from "react";

interface Props {
  id: string;
  lines: string[];
}

export default function FirstTimeGuide({ id, lines }: Props) {
  const storageKey = `wander:guide:${id}`;
  const sessionKey = `wander:guide-session:${id}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(storageKey);
    const sessionDismissed = sessionStorage.getItem(sessionKey);
    if (!dismissed && !sessionDismissed) {
      setVisible(true);
    }
  }, [storageKey, sessionKey]);

  if (!visible) return null;

  function handleGotIt() {
    localStorage.setItem(storageKey, "1");
    setVisible(false);
  }

  function handleRemindMe() {
    sessionStorage.setItem(sessionKey, "1");
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 backdrop-blur-[2px]" onClick={handleRemindMe}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm mx-4 p-5 border border-[#e0d8cc]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-medium text-[#3a3128] mb-3">On this screen, you can:</h3>
        <ul className="space-y-2 mb-5">
          {lines.map((line, i) => (
            <li key={i} className="text-sm text-[#6b5d4a] flex items-start gap-2">
              <span className="text-[#a89880] mt-0.5 shrink-0">&bull;</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-3">
          <button
            onClick={handleGotIt}
            className="flex-1 py-2 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] transition-colors"
          >
            Got it
          </button>
          <button
            onClick={handleRemindMe}
            className="flex-1 py-2 rounded-lg border border-[#e0d8cc] text-sm text-[#6b5d4a]
                       hover:bg-[#f0ece5] transition-colors"
          >
            Remind me
          </button>
        </div>
      </div>
    </div>
  );
}
