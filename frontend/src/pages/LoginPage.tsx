import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      await login(code.trim());
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Invalid access code");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf8f5] px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-light tracking-tight text-[#3a3128] mb-2">
          Wander
        </h1>
        <p className="text-sm text-[#8a7a62] mb-8">
          Enter your access code to continue
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Access code"
            autoFocus
            autoComplete="off"
            className="w-full px-4 py-3 rounded-lg border border-[#e0d8cc] bg-white
                       text-[#3a3128] placeholder-[#c8bba8] text-lg
                       focus:outline-none focus:ring-2 focus:ring-[#a89880] focus:border-transparent"
          />

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting || !code.trim()}
            className="w-full py-3 rounded-lg bg-[#514636] text-white text-sm font-medium
                       hover:bg-[#3a3128] disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {submitting ? "Signing in..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
