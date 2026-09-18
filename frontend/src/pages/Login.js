import React, { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, KeyRound, Activity, ShieldCheck, Box, GitBranch, KeyRound as VaultKey, Lock } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const LOGO = "https://customer-assets-cm19k8pv.emergentagent.net/job_odoo-invoice-hub/artifacts/g9o6vp41_image.png";
const SUBLOGO = "https://customer-assets-cm19k8pv.emergentagent.net/job_odoo-invoice-hub/artifacts/srxqyr8y_image.png";

const FEATURES = [
  { icon: Activity, title: "Overdue tracking", desc: "Live Odoo invoice sync.", color: "text-rose-400", ring: "bg-rose-500/10", pos: "top-[7%] left-[16%]" },
  { icon: ShieldCheck, title: "Secure MFA", desc: "TOTP two-factor login.", color: "text-emerald-400", ring: "bg-emerald-500/10", pos: "top-[25%] right-[7%]" },
  { icon: Box, title: "Odoo connected", desc: "XML-RPC data plane.", color: "text-sky-400", ring: "bg-sky-500/10", pos: "top-[47%] left-[8%]" },
  { icon: GitBranch, title: "Auto reminders", desc: "Scheduled daily runs.", color: "text-amber-400", ring: "bg-amber-500/10", pos: "top-[63%] right-[5%]" },
  { icon: VaultKey, title: "Multi-channel", desc: "Email & WhatsApp.", color: "text-indigo-400", ring: "bg-indigo-500/10", pos: "bottom-[9%] left-[5%]" },
  { icon: Lock, title: "Discord alerts", desc: "Live #odoo notifications.", color: "text-fuchsia-400", ring: "bg-fuchsia-500/10", pos: "bottom-[1%] right-[16%]" },
];

const inputCls = "w-full rounded-lg bg-white/[0.04] border border-white/10 px-4 py-3.5 text-sm outline-none placeholder:text-white/25 focus:border-indigo-500/60 focus:bg-white/[0.06] transition-colors";
const btnCls = "w-full rounded-lg bg-[#1b2236] hover:bg-[#232c47] border border-white/10 py-3.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60";

export default function Login() {
  const { completeLogin } = useAuth();
  const [step, setStep] = useState("credentials"); // credentials | setup | verify
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const submitCredentials = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setMfaToken(data.mfa_token);
      if (data.requires_setup) {
        const setup = await api.get("/auth/mfa/setup", {
          headers: { Authorization: `Bearer ${data.mfa_token}` },
        });
        setQr(setup.data.qr_code);
        setSecret(setup.data.secret);
        setStep("setup");
      } else {
        setStep("verify");
      }
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post(
        "/auth/mfa/verify",
        { code },
        { headers: { Authorization: `Bearer ${mfaToken}` } }
      );
      toast.success("Welkom terug!");
      completeLogin(data.access_token, data.user);
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#08090C] text-white">
      {/* Left: form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 lg:px-20 py-12 relative">
        <div className="relative inline-block self-start mb-16">
          <img src={LOGO} alt="koodh" className="h-8 w-auto brightness-0 invert" data-testid="login-logo" />
          <img src={SUBLOGO} alt="odoo" className="absolute -top-2 right-[2%] h-3 w-auto opacity-90" />
        </div>

        <div className="max-w-sm w-full">
          {step === "credentials" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-2">Welcome back</h1>
              <p className="text-white/50 mb-10">Sign in to access your dashboard</p>
              <form onSubmit={submitCredentials} className="space-y-6" data-testid="login-form">
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-white/40 font-mono">Email</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com" data-testid="login-email-input" className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs uppercase tracking-widest text-white/40 font-mono">Password</label>
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" data-testid="login-password-input" className={inputCls} />
                </div>
                <button type="submit" disabled={loading} data-testid="login-submit-button" className={btnCls}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
                </button>
              </form>
            </motion.div>
          )}

          {step === "setup" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="mfa-setup">
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">Set up two-factor</h1>
              <p className="text-white/50 mb-6 text-sm">Scan the QR code with Google Authenticator, then enter the 6-digit code.</p>
              {qr && <img src={qr} alt="MFA QR" className="h-40 w-40 rounded-xl bg-white p-2 mb-4" data-testid="mfa-qr-code" />}
              <p className="text-xs text-white/40 mb-1">Manual key</p>
              <code className="text-xs font-mono break-all text-white/60 block mb-5" data-testid="mfa-secret">{secret}</code>
              <form onSubmit={verifyCode} className="space-y-4">
                <input inputMode="numeric" maxLength={6} required value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456"
                  data-testid="mfa-token-input" className={`${inputCls} text-center tracking-[0.5em] font-mono text-lg`} />
                <button type="submit" disabled={loading} data-testid="mfa-verify-button" className={btnCls}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><KeyRound className="h-4 w-4" /> Activate & sign in</>}
                </button>
              </form>
            </motion.div>
          )}

          {step === "verify" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-testid="mfa-verify">
              <h1 className="text-3xl font-extrabold tracking-tight mb-2">Two-factor code</h1>
              <p className="text-white/50 mb-6 text-sm">Enter the 6-digit code from your authenticator app.</p>
              <form onSubmit={verifyCode} className="space-y-4">
                <input inputMode="numeric" maxLength={6} required value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456"
                  data-testid="mfa-token-input" className={`${inputCls} text-center tracking-[0.5em] font-mono text-lg`} />
                <button type="submit" disabled={loading} data-testid="mfa-verify-button" className={btnCls}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </button>
              </form>
            </motion.div>
          )}
        </div>
      </div>

      {/* Right: showcase */}
      <div className="hidden lg:block lg:w-1/2 relative overflow-hidden border-l border-white/5">
        <div className="absolute inset-0 bg-[#0B0C10]" />
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: "repeating-linear-gradient(45deg, #ffffff 0, #ffffff 1px, transparent 1px, transparent 26px)" }} />
        <div className="absolute -right-32 top-1/4 h-[560px] w-[560px] rotate-45 rounded-[3rem] border border-white/[0.06]" />
        <div className="absolute right-16 top-24 h-96 w-96 rotate-45 rounded-[3rem] border border-white/[0.05]" />
        <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-600/10 blur-3xl" />
        {FEATURES.map((f, i) => (
          <motion.div key={f.title} className={`absolute ${f.pos} z-10`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: [0, -9, 0] }}
            transition={{ opacity: { duration: 0.5, delay: 0.15 * i }, y: { repeat: Infinity, duration: 5 + i, ease: "easeInOut" } }}>
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md px-4 py-3 shadow-2xl">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${f.ring}`}>
                <f.icon className={`h-4 w-4 ${f.color}`} />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{f.title}</p>
                <p className="text-xs text-white/45">{f.desc}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
