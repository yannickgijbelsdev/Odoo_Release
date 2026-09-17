import React, { useEffect, useState } from "react";
import { Loader2, Mail, MessageCircle, MessageSquare, CheckCircle2, XCircle, History } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const channelIcon = (c) => c === "email"
  ? <Mail className="h-4 w-4 text-[#0078D4]" />
  : <MessageCircle className="h-4 w-4 text-[#25D366]" />;

export default function Activity() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/logs").then((r) => setLogs(r.data.logs)).catch((e) => toast.error(apiError(e.response?.data?.detail))).finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Activity Log</h1>
        <p className="text-sm text-muted-foreground">History of sent reminders and Discord notifications</p>
      </div>

      <div className="glass border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center" data-testid="logs-empty">
            <History className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-semibold">No reminders sent yet</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {logs.map((l) => (
              <div key={l.id} className="p-4 flex items-center gap-4" data-testid={`log-row-${l.id}`}>
                <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0">{channelIcon(l.channel)}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{l.partner_name} · <span className="font-mono text-xs">{l.invoice_name}</span></p>
                  <p className="text-xs text-muted-foreground truncate">{l.target || "no contact"} · {new Date(l.created_at).toLocaleString("en-GB")}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline" className={l.status === "sent" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-red-500/15 text-red-400 border-red-500/30"}>
                    {l.status === "sent" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                    {l.status === "sent" ? "Sent" : "Failed"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" /> #odoo: {l.discord_status?.startsWith("sent") ? "ok" : l.discord_status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
