import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "../lib/api";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";

interface VaultGateProps {
  children: (vaultToken: string) => React.ReactNode;
  onSetupComplete?: () => void;
}

type VaultState = "checking" | "needs-pin" | "locked" | "unlocking" | "open" | "error" | "offer-biometric";

/**
 * VaultGate wraps content that requires vault access (travel documents).
 *
 * Flow:
 * 1. No PIN set → show PIN setup form
 * 2. PIN set, vault locked → show Face ID prompt (if available) or PIN entry
 * 3. Vault open → render children with vault token
 * 4. Token auto-expires after 5 minutes → re-prompt
 */
export default function VaultGate({ children, onSetupComplete }: VaultGateProps) {
  const [state, setState] = useState<VaultState>("checking");
  const [vaultToken, setVaultToken] = useState<string | null>(null);
  const [hasBiometric, setHasBiometric] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [showPinFallback, setShowPinFallback] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check vault status on mount
  useEffect(() => {
    api.get<{ hasPin: boolean; hasBiometric: boolean }>("/vault/status")
      .then((status) => {
        setHasBiometric(status.hasBiometric);
        if (!status.hasPin) {
          setState("needs-pin");
        } else {
          setState("locked");
        }
      })
      .catch(() => setState("error"));
  }, []);

  // Auto-lock after 5 minutes
  useEffect(() => {
    if (vaultToken) {
      timerRef.current = setTimeout(() => {
        setVaultToken(null);
        setState("locked");
      }, 5 * 60 * 1000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [vaultToken]);

  // Try biometric auth when locked
  useEffect(() => {
    if (state === "locked" && hasBiometric && !showPinFallback) {
      tryBiometric();
    }
  }, [state, hasBiometric, showPinFallback]);

  const tryBiometric = useCallback(async () => {
    try {
      setState("unlocking");
      const options = await api.post<any>("/vault/webauthn/auth-options", {});
      const credential = await startAuthentication({ optionsJSON: options });
      const result = await api.post<{ vaultToken: string }>("/vault/webauthn/auth-verify", credential);
      setVaultToken(result.vaultToken);
      setState("open");
    } catch {
      // Biometric failed or cancelled — fall back to PIN
      setShowPinFallback(true);
      setState("locked");
    }
  }, []);

  const handleSetPin = async () => {
    setError("");
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter exactly 4 digits");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs don't match");
      return;
    }

    try {
      const result = await api.post<{ vaultToken: string }>("/vault/set-pin", { pin });
      setVaultToken(result.vaultToken);
      setState("open");
      onSetupComplete?.();

      // Offer biometric registration if available
      if (window.PublicKeyCredential) {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (available) {
          offerBiometricSetup();
        }
      }
    } catch (err: any) {
      setError(err?.message || "Couldn't set PIN");
    }
  };

  const offerBiometricSetup = async () => {
    // Show in-app prompt instead of browser confirm() — avoids confusing password manager dialogs
    await new Promise((r) => setTimeout(r, 300));
    setState("offer-biometric");
  };

  const acceptBiometric = async () => {
    setState("open");
    try {
      const options = await api.post<any>("/vault/webauthn/register-options", {});
      const credential = await startRegistration({ optionsJSON: options });
      await api.post("/vault/webauthn/register-verify", credential);
      setHasBiometric(true);
    } catch {
      // User cancelled or device doesn't support it — no problem
    }
  };

  const skipBiometric = () => {
    setState("open");
  };

  const handleUnlockWithPin = async () => {
    setError("");
    if (!pin) return;

    try {
      const result = await api.post<{ vaultToken: string }>("/vault/unlock", { pin });
      setVaultToken(result.vaultToken);
      setPin("");
      setState("open");
      setShowPinFallback(false);
    } catch {
      setError("Wrong PIN");
      setPin("");
      inputRef.current?.focus();
    }
  };

  // ── Render states ────────────────────────────────────────────

  if (state === "checking" || state === "unlocking") {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-[#a89880] text-sm">
          {state === "unlocking" ? "Verifying..." : "Checking..."}
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="text-center py-12 text-[#a89880] text-sm">
        Couldn't check vault status. Try refreshing.
      </div>
    );
  }

  if (state === "needs-pin") {
    return (
      <div className="max-w-sm mx-auto py-8 px-4">
        <div className="text-center mb-6">
          <div className="text-2xl mb-2">🔐</div>
          <h3 className="text-lg font-medium text-[#3a3128] mb-1">
            Protect your travel documents
          </h3>
          <p className="text-sm text-[#8a7a62]">
            Set a 4-digit PIN to keep your passport, visa, and other sensitive info safe.
            You'll use this (or Face ID) to view them.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#a89880] mb-1">PIN</label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4 digits"
              className="w-full px-3 py-2 border border-[#e0d8cc] rounded-lg text-center text-lg tracking-[0.5em] focus:outline-none focus:border-[#514636]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-[#a89880] mb-1">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              pattern="[0-9]*"
              autoComplete="one-time-code"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="4 digits again"
              className="w-full px-3 py-2 border border-[#e0d8cc] rounded-lg text-center text-lg tracking-[0.5em] focus:outline-none focus:border-[#514636]"
              onKeyDown={(e) => e.key === "Enter" && handleSetPin()}
            />
          </div>

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          <button
            onClick={handleSetPin}
            disabled={pin.length !== 4 || confirmPin.length !== 4}
            className="w-full py-2.5 bg-[#514636] text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity"
          >
            Set PIN
          </button>
        </div>
      </div>
    );
  }

  if (state === "locked") {
    return (
      <div className="max-w-sm mx-auto py-8 px-4">
        <div className="text-center mb-6">
          <div className="text-2xl mb-2">🔐</div>
          <h3 className="text-lg font-medium text-[#3a3128] mb-1">
            Unlock your documents
          </h3>
          {hasBiometric && !showPinFallback ? (
            <p className="text-sm text-[#8a7a62]">
              Use Face ID or enter your PIN
            </p>
          ) : (
            <p className="text-sm text-[#8a7a62]">Enter your 4-digit PIN</p>
          )}
        </div>

        <div className="space-y-4">
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            maxLength={4}
            pattern="[0-9]*"
            autoComplete="one-time-code"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="PIN"
            className="w-full px-3 py-2 border border-[#e0d8cc] rounded-lg text-center text-lg tracking-[0.5em] focus:outline-none focus:border-[#514636]"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleUnlockWithPin()}
          />

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}

          <button
            onClick={handleUnlockWithPin}
            disabled={pin.length !== 4}
            className="w-full py-2.5 bg-[#514636] text-white rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity"
          >
            Unlock
          </button>

          {hasBiometric && showPinFallback && (
            <button
              onClick={() => { setShowPinFallback(false); tryBiometric(); }}
              className="w-full py-2 text-sm text-[#8a7a62] hover:text-[#514636]"
            >
              Try Face ID instead
            </button>
          )}

          <p className="text-xs text-center text-[#c8bba8]">
            Forgot your PIN? Ask a trip planner to reset it.
          </p>
        </div>
      </div>
    );
  }

  if (state === "offer-biometric") {
    return (
      <div className="max-w-sm mx-auto py-8 px-4">
        <div className="text-center mb-6">
          <div className="text-2xl mb-2">👋</div>
          <h3 className="text-lg font-medium text-[#3a3128] mb-1">
            Skip the PIN next time?
          </h3>
          <p className="text-sm text-[#8a7a62]">
            Use Face ID to open your documents — faster and just as secure.
          </p>
        </div>
        <div className="space-y-3">
          <button
            onClick={acceptBiometric}
            className="w-full py-2.5 bg-[#514636] text-white rounded-lg text-sm font-medium hover:bg-[#3a3128] transition-colors"
          >
            Use Face ID
          </button>
          <button
            onClick={skipBiometric}
            className="w-full py-2 text-sm text-[#8a7a62] hover:text-[#514636]"
          >
            I'll stick with the PIN
          </button>
        </div>
      </div>
    );
  }

  // state === "open"
  return <>{vaultToken && children(vaultToken)}</>;
}
