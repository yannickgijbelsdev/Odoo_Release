import React, { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Loader2, KeyRound, LogIn } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

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
    <div className="min-h-screen flex items-center justify-center px-4 bg-background relative overflow-hidden">
      <div className="absolute inset-0 opacity-40 pointer-events-none"
           style={{ background: "radial-gradient(600px circle at 20% 10%, hsl(239 84% 67% / 0.18), transparent 40%), radial-gradient(500px circle at 90% 90%, hsl(280 65% 60% / 0.12), transparent 40%)" }} />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-md glass border border-border rounded-2xl p-8 shadow-2xl"
        data-testid="login-card"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Odoo Reminders</h1>
            <p className="text-xs text-muted-foreground font-mono uppercase tracking-widest">Vervallen facturen · MFA</p>
          </div>
        </div>

        {step === "credentials" && (
          <form onSubmit={submitCredentials} className="space-y-4" data-testid="login-form">
            <div className="space-y-2">
              <Label htmlFor="email">E-mailadres</Label>
              <Input id="email" type="email" required value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     placeholder="jij@bedrijf.nl" data-testid="login-email-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Wachtwoord</Label>
              <Input id="password" type="password" required value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     placeholder="••••••••" data-testid="login-password-input" />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit-button">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><LogIn className="h-4 w-4 mr-2" /> Inloggen</>}
            </Button>
          </form>
        )}

        {step === "setup" && (
          <div className="space-y-4" data-testid="mfa-setup">
            <p className="text-sm text-muted-foreground">
              Scan de QR-code met Google Authenticator (of een andere authenticator-app) en voer de 6-cijferige code in.
            </p>
            {qr && <img src={qr} alt="MFA QR" className="mx-auto h-44 w-44 rounded-lg bg-white p-2" data-testid="mfa-qr-code" />}
            <div className="text-center">
              <p className="text-xs text-muted-foreground">Handmatige sleutel</p>
              <code className="text-xs font-mono break-all">{secret}</code>
            </div>
            <form onSubmit={verifyCode} className="space-y-3">
              <Input inputMode="numeric" maxLength={6} required value={code}
                     onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                     placeholder="123456" className="text-center tracking-[0.5em] font-mono text-lg"
                     data-testid="mfa-token-input" />
              <Button type="submit" className="w-full" disabled={loading} data-testid="mfa-verify-button">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><KeyRound className="h-4 w-4 mr-2" /> Activeren & inloggen</>}
              </Button>
            </form>
          </div>
        )}

        {step === "verify" && (
          <form onSubmit={verifyCode} className="space-y-4" data-testid="mfa-verify">
            <p className="text-sm text-muted-foreground">
              Voer de 6-cijferige code uit je authenticator-app in.
            </p>
            <Input inputMode="numeric" maxLength={6} required value={code}
                   onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                   placeholder="123456" className="text-center tracking-[0.5em] font-mono text-lg"
                   data-testid="mfa-token-input" />
            <Button type="submit" className="w-full" disabled={loading} data-testid="mfa-verify-button">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verifiëren"}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
