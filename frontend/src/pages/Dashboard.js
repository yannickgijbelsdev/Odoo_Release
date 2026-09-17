import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Loader2, Mail, MessageCircle, Database, Euro, FileWarning, Send, AlertTriangle } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

function severity(days) {
  if (days >= 30) return { label: "Critical", cls: "bg-red-500/15 text-red-400 border-red-500/30" };
  if (days >= 14) return { label: "Severe", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" };
  if (days >= 7) return { label: "Warning", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  return { label: "Recent", cls: "bg-slate-500/15 text-slate-400 border-slate-500/30" };
}

function euro(n, cur = "EUR") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: cur }).format(n || 0);
}

const Stat = ({ icon: Icon, label, value, accent }) => (
  <div className="glass border border-border rounded-xl p-5 flex items-center gap-4" data-testid={`stat-${label}`}>
    <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${accent}`}>
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <p className="text-xs uppercase tracking-widest text-muted-foreground font-mono">{label}</p>
      <p className="text-2xl font-extrabold tabular">{value}</p>
    </div>
  </div>
);

export default function Dashboard() {
  const [data, setData] = useState({ invoices: [], count: 0, total_outstanding: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get("/invoices");
      setData(res.data);
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const sync = async () => {
    setBusy("sync");
    try {
      const res = await api.post("/invoices/sync");
      toast.success(`${res.data.synced} invoices synced from Odoo`);
      load();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally { setBusy(""); }
  };

  const loadDemo = async () => {
    setBusy("demo");
    try {
      const res = await api.post("/invoices/load-demo");
      toast.success(`${res.data.loaded} demo invoices loaded`);
      load();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally { setBusy(""); }
  };

  const sendReminder = async (inv, channel) => {
    setBusy(`remind-${inv.id}`);
    try {
      await api.post(`/invoices/${inv.id}/remind`, { channel });
      toast.success(`Reminder sent via ${channel === "email" ? "email" : "WhatsApp"} + #odoo notification`);
      load();
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    } finally { setBusy(""); }
  };

  const toggleAuto = async (inv) => {
    try {
      await api.patch(`/invoices/${inv.id}/auto`, { auto_enabled: !inv.auto_enabled });
      setData((d) => ({ ...d, invoices: d.invoices.map((i) => i.id === inv.id ? { ...i, auto_enabled: !i.auto_enabled } : i) }));
    } catch (err) {
      toast.error(apiError(err.response?.data?.detail));
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Overdue Invoices</h1>
          <p className="text-sm text-muted-foreground">Outstanding receivables from Odoo with automated reminders</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadDemo} disabled={busy === "demo"} data-testid="load-demo-button">
            {busy === "demo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileWarning className="h-4 w-4 mr-2" />} Demo data
          </Button>
          <Button onClick={sync} disabled={busy === "sync"} data-testid="sync-odoo-button">
            {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />} Sync Odoo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 mb-6">
        <Stat icon={FileWarning} label="Overdue invoices" value={data.count} accent="bg-red-500/15 text-red-400" />
        <Stat icon={Euro} label="Outstanding amount" value={euro(data.total_outstanding)} accent="bg-primary/15 text-primary" />
        <Stat icon={Database} label="Source" value={data.invoices[0]?.source === "odoo" ? "Odoo" : data.invoices.length ? "Demo" : "—"} accent="bg-emerald-500/15 text-emerald-400" />
      </div>

      <div className="glass border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : data.invoices.length === 0 ? (
          <div className="p-12 text-center" data-testid="empty-state">
            <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-semibold">No overdue invoices</p>
            <p className="text-sm text-muted-foreground mt-1">Sync with Odoo or load demo data to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground font-mono border-b border-border">
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Due date</th>
                  <th className="px-4 py-3 text-center">Days</th>
                  <th className="px-4 py-3 text-center">Auto</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((inv, idx) => {
                  const sev = severity(inv.days_overdue);
                  return (
                    <motion.tr key={inv.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.03 }}
                      className="border-b border-border/50 hover:bg-accent/30 transition-colors"
                      data-testid={`invoice-row-${inv.id}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium">{inv.partner_name}</p>
                        <p className="text-xs text-muted-foreground">{inv.email || inv.phone || "no contact"}</p>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{inv.name}</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">{euro(inv.amount_residual, inv.currency)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{inv.invoice_date_due}</td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant="outline" className={`${sev.cls} font-mono`}>{inv.days_overdue}d · {sev.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Switch checked={inv.auto_enabled} onCheckedChange={() => toggleAuto(inv)}
                                data-testid={`auto-toggle-${inv.id}`} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" disabled={busy === `remind-${inv.id}`} data-testid={`send-reminder-button-${inv.id}`}>
                              {busy === `remind-${inv.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1.5" /> Remind</>}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => sendReminder(inv, "email")} data-testid={`remind-email-${inv.id}`}>
                              <Mail className="h-4 w-4 mr-2 text-[#0078D4]" /> Via Office 365 email
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => sendReminder(inv, "whatsapp")} data-testid={`remind-whatsapp-${inv.id}`}>
                              <MessageCircle className="h-4 w-4 mr-2 text-[#25D366]" /> Via WhatsApp
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
