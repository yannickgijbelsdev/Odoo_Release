import React, { useEffect, useState } from "react";
import { Loader2, Save, Plus, Trash2, Plug, Bell, MessageSquare, Mail, MessageCircle, CheckCircle2, XCircle } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const Section = ({ title, icon: Icon, status, children }) => (
  <div className="glass border border-border rounded-xl p-5 md:p-6 space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /> {title}</h3>
      {status !== undefined && (
        <Badge variant="outline" className={status ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : "bg-slate-500/15 text-slate-400 border-slate-500/30"}>
          {status ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
          {status ? "Geconfigureerd" : "Niet ingesteld"}
        </Badge>
      )}
    </div>
    {children}
  </div>
);

const Field = ({ label, ...props }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    <Input {...props} />
  </div>
);

export default function Settings() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState("");

  useEffect(() => {
    api.get("/settings").then((r) => setS(r.data)).catch((e) => toast.error(apiError(e.response?.data?.detail)));
  }, []);

  const upd = (section, key, val) => setS((p) => ({ ...p, [section]: { ...p[section], [key]: val } }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        odoo: s.odoo, discord: s.discord, office365: s.office365, twilio: s.twilio,
        schedule_steps: s.schedule_steps, auto_reminders_enabled: s.auto_reminders_enabled,
        company_name: s.company_name,
      };
      const r = await api.put("/settings", payload);
      setS(r.data);
      toast.success("Instellingen opgeslagen");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    } finally { setSaving(false); }
  };

  const testOdoo = async () => {
    setTesting("odoo");
    try { const r = await api.post("/odoo/test"); toast.success(`Odoo verbonden · versie ${r.data.server_version}`); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setTesting(""); }
  };
  const testDiscord = async () => {
    setTesting("discord");
    try { await api.post("/discord/test"); toast.success("Testmelding naar #odoo verzonden"); }
    catch (e) { toast.error(apiError(e.response?.data?.detail)); }
    finally { setTesting(""); }
  };

  const addStep = () => setS((p) => ({ ...p, schedule_steps: [...p.schedule_steps, { id: crypto.randomUUID(), day_offset: 1, channel: "email", label: "Nieuwe stap" }] }));
  const updStep = (id, key, val) => setS((p) => ({ ...p, schedule_steps: p.schedule_steps.map((st) => st.id === id ? { ...st, [key]: val } : st) }));
  const delStep = (id) => setS((p) => ({ ...p, schedule_steps: p.schedule_steps.filter((st) => st.id !== id) }));

  if (!s) return <div className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  const st = s._status || {};

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-extrabold tracking-tight">Instellingen</h1>
          <p className="text-sm text-muted-foreground">Koppelingen, kanalen en het herinnering-tijdsschema</p>
        </div>
        <Button onClick={save} disabled={saving} data-testid="settings-save-button">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Opslaan
        </Button>
      </div>

      <Tabs defaultValue="connections">
        <TabsList className="mb-4">
          <TabsTrigger value="connections" data-testid="tab-connections">Koppelingen</TabsTrigger>
          <TabsTrigger value="schedule" data-testid="tab-schedule">Tijdsschema</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="space-y-6">
          <Section title="Odoo Koppeling" icon={Plug} status={st.odoo}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Odoo URL" placeholder="https://mijnbedrijf.odoo.com" value={s.odoo.url} onChange={(e) => upd("odoo", "url", e.target.value)} data-testid="settings-odoo-url-input" />
              <Field label="Database" placeholder="mijnbedrijf" value={s.odoo.db} onChange={(e) => upd("odoo", "db", e.target.value)} data-testid="settings-odoo-db-input" />
              <Field label="Gebruiker (e-mail)" placeholder="admin@mijnbedrijf.nl" value={s.odoo.username} onChange={(e) => upd("odoo", "username", e.target.value)} data-testid="settings-odoo-user-input" />
              <Field label="API-sleutel" type="password" placeholder="••••••••" value={s.odoo.api_key} onChange={(e) => upd("odoo", "api_key", e.target.value)} data-testid="settings-odoo-key-input" />
            </div>
            <Button variant="outline" size="sm" onClick={testOdoo} disabled={testing === "odoo"} data-testid="test-odoo-button">
              {testing === "odoo" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plug className="h-4 w-4 mr-2" />} Verbinding testen
            </Button>
          </Section>

          <Section title="Discord #odoo Webhook" icon={MessageSquare} status={st.discord}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Webhook URL" placeholder="https://discord.com/api/webhooks/..." value={s.discord.webhook_url} onChange={(e) => upd("discord", "webhook_url", e.target.value)} data-testid="settings-discord-webhook-input" />
              <Field label="Kanaalnaam" value={s.discord.channel_name} onChange={(e) => upd("discord", "channel_name", e.target.value)} data-testid="settings-discord-channel-input" />
            </div>
            <Button variant="outline" size="sm" onClick={testDiscord} disabled={testing === "discord"} data-testid="test-discord-button">
              {testing === "discord" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bell className="h-4 w-4 mr-2" />} Testmelding sturen
            </Button>
          </Section>

          <Section title="Office 365 E-mail (Microsoft Graph)" icon={Mail} status={st.office365}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Tenant ID" value={s.office365.tenant_id} onChange={(e) => upd("office365", "tenant_id", e.target.value)} data-testid="settings-o365-tenant-input" />
              <Field label="Client ID" value={s.office365.client_id} onChange={(e) => upd("office365", "client_id", e.target.value)} data-testid="settings-o365-client-input" />
              <Field label="Client Secret" type="password" placeholder="••••••••" value={s.office365.client_secret} onChange={(e) => upd("office365", "client_secret", e.target.value)} data-testid="settings-o365-secret-input" />
              <Field label="Afzender mailbox" placeholder="no-reply@mijnbedrijf.nl" value={s.office365.mail_from} onChange={(e) => upd("office365", "mail_from", e.target.value)} data-testid="settings-o365-from-input" />
            </div>
          </Section>

          <Section title="WhatsApp (Twilio)" icon={MessageCircle} status={st.twilio}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Account SID" value={s.twilio.account_sid} onChange={(e) => upd("twilio", "account_sid", e.target.value)} data-testid="settings-twilio-sid-input" />
              <Field label="Auth Token" type="password" placeholder="••••••••" value={s.twilio.auth_token} onChange={(e) => upd("twilio", "auth_token", e.target.value)} data-testid="settings-twilio-token-input" />
              <Field label="WhatsApp afzender" placeholder="whatsapp:+14155238886" value={s.twilio.whatsapp_from} onChange={(e) => upd("twilio", "whatsapp_from", e.target.value)} data-testid="settings-twilio-from-input" />
              <Field label="Bedrijfsnaam (in berichten)" value={s.company_name} onChange={(e) => setS((p) => ({ ...p, company_name: e.target.value }))} data-testid="settings-company-input" />
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Section title="Automatische herinneringen" icon={Bell}>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Dagelijks automatisch controleren</p>
                <p className="text-sm text-muted-foreground">Elke dag om 08:00 (Europe/Amsterdam) worden vervallen facturen gecontroleerd.</p>
              </div>
              <Switch checked={s.auto_reminders_enabled} onCheckedChange={(v) => setS((p) => ({ ...p, auto_reminders_enabled: v }))} data-testid="auto-reminders-toggle" />
            </div>
          </Section>

          <Section title="Tijdsschema stappen" icon={Bell}>
            <p className="text-sm text-muted-foreground">Definieer wanneer welke herinnering wordt gestuurd op basis van het aantal dagen vervallen.</p>
            <div className="space-y-3">
              {s.schedule_steps.map((step) => (
                <div key={step.id} className="flex flex-col sm:flex-row gap-3 items-start sm:items-end p-3 rounded-lg bg-accent/30" data-testid={`schedule-step-${step.id}`}>
                  <div className="space-y-1.5 w-full sm:w-40">
                    <Label className="text-xs">Label</Label>
                    <Input value={step.label} onChange={(e) => updStep(step.id, "label", e.target.value)} />
                  </div>
                  <div className="space-y-1.5 w-full sm:w-32">
                    <Label className="text-xs">Na (dagen)</Label>
                    <Input type="number" min={0} value={step.day_offset} onChange={(e) => updStep(step.id, "day_offset", parseInt(e.target.value) || 0)} data-testid={`step-days-${step.id}`} />
                  </div>
                  <div className="space-y-1.5 w-full sm:w-40">
                    <Label className="text-xs">Kanaal</Label>
                    <Select value={step.channel} onValueChange={(v) => updStep(step.id, "channel", v)}>
                      <SelectTrigger data-testid={`step-channel-${step.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Office 365 e-mail</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => delStep(step.id)} data-testid={`delete-step-${step.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addStep} data-testid="add-step-button"><Plus className="h-4 w-4 mr-2" /> Stap toevoegen</Button>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
