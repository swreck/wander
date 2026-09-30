/**
 * InviteSheet — someone's personal Wander link, ready to hand over.
 *
 * A big QR code for the person standing next to you (their iPhone camera opens it), and
 * "Send as a message" for anyone farther away. The link itself is never shown as text.
 * The share sheet opens straight from the tap (the link is made before this sheet appears),
 * because iPhones refuse a share sheet that opens after waiting on the network.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import useBackToClose from "../hooks/useBackToClose";

export default function InviteSheet({ name, tripName, url, isMe, note, onClose }: {
  name: string; tripName: string; url: string; isMe?: boolean; note?: string | null; onClose: () => void;
}) {
  const [svg, setSvg] = useState<string>("");
  const [status, setStatus] = useState<string | null>(null);
  useBackToClose(true, onClose);

  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#3a3128", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url]);

  const message = isMe
    ? `My Wander link for ${tripName}. Open it on the new phone.`
    : `Hi ${name} — here's your link to ${tripName} in Wander. Open it on your phone; it will show you how to put Wander on your Home Screen.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${message}\n${url}`);
      setStatus(`Copied — paste it into a message to ${isMe ? "yourself" : name}.`);
    } catch {
      setStatus("This phone didn't let Wander copy. Show the code instead, or try again.");
    }
  }

  async function send() {
    if (!navigator.share) { await copy(); return; }
    try {
      await navigator.share({ title: "Wander", text: message, url });
      // The phone only says an app was picked, not that the message went — so no "Sent"
      setStatus(`Handed to your messages. Once ${isMe ? "you set" : `${name} sets`} up Face ID, this link stops working.`);
    } catch (err) {
      // Closed without sending: nothing to say. Refused for any other reason: copy instead.
      if ((err as { name?: string }).name === "AbortError") setStatus(null);
      else await copy();
    }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full max-w-md bg-[#faf8f5] rounded-t-2xl sm:rounded-2xl p-5 text-center"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label={`Invite for ${name}`}
      >
        <h2 className="text-lg font-medium text-[#3a3128]">{isMe ? "Your link" : `${name}'s invite`}</h2>
        <p className="text-sm text-[#6b5d4a] mt-1">{tripName}</p>
        {note && <p className="text-sm text-[#514636] mt-2">{note}</p>}
        <div className="mx-auto mt-4 w-60 h-60 bg-white rounded-xl border border-[#e0d8cc] p-2" aria-label="QR code for the invite link">
          {svg ? <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
        </div>
        <p className="text-sm text-[#3a3128] mt-3">
          Point {isMe ? "the new phone's" : `${name}'s`} camera at this code and tap the Wander link that appears.
        </p>
        <p className="text-xs text-[#6b5d4a] mt-1">
          Wander then shows how to put it on the Home Screen. Once {isMe ? "you set" : `${name} sets`} up Face ID, this link stops working.
        </p>
        <div className="flex flex-col gap-2 mt-4">
          <button onClick={send} className="min-h-[48px] rounded-xl bg-[#514636] text-white text-base">Send as a message instead</button>
          <button onClick={copy} className="min-h-[44px] rounded-xl border border-[#d6ccbc] text-[#514636] text-sm">Copy the link</button>
          <button onClick={onClose} className="min-h-[44px] text-sm text-[#514636]">Done</button>
        </div>
        {status && <p className="text-sm text-[#514636] mt-2" role="status">{status}</p>}
      </div>
    </div>
  );
}
