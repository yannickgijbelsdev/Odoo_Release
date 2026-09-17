from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import logging
import hmac
from datetime import datetime, timezone, date, timedelta

from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, BackgroundTasks
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional

import auth as auth_lib
import odoo_client
import notifications as notif

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Odoo Overdue Reminders API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("odoo_reminders")

get_current_user = auth_lib.get_current_user_factory(db)

SETTINGS_ID = "global"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------------- Models ----------------
class LoginInput(BaseModel):
    email: EmailStr
    password: str


class MfaVerifyInput(BaseModel):
    code: str


class OdooConfig(BaseModel):
    url: str = ""
    db: str = ""
    username: str = ""
    api_key: str = ""


class DiscordConfig(BaseModel):
    webhook_url: str = ""
    channel_name: str = "#odoo"


class Office365Config(BaseModel):
    tenant_id: str = ""
    client_id: str = ""
    client_secret: str = ""
    mail_from: str = ""


class TwilioConfig(BaseModel):
    account_sid: str = ""
    auth_token: str = ""
    whatsapp_from: str = ""


class ScheduleStep(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    day_offset: int = 3
    channel: str = "email"  # email | whatsapp
    label: str = ""


class SettingsInput(BaseModel):
    odoo: OdooConfig = OdooConfig()
    discord: DiscordConfig = DiscordConfig()
    office365: Office365Config = Office365Config()
    twilio: TwilioConfig = TwilioConfig()
    schedule_steps: List[ScheduleStep] = []
    auto_reminders_enabled: bool = True
    company_name: str = "Mijn Bedrijf"


class RemindInput(BaseModel):
    channel: str = "email"  # email | whatsapp


# ---------------- Settings helpers ----------------
DEFAULT_STEPS = [
    {"id": str(uuid.uuid4()), "day_offset": 3, "channel": "email", "label": "1e herinnering"},
    {"id": str(uuid.uuid4()), "day_offset": 7, "channel": "email", "label": "2e herinnering"},
    {"id": str(uuid.uuid4()), "day_offset": 14, "channel": "whatsapp", "label": "Laatste aanmaning"},
]


async def get_settings() -> dict:
    s = await db.settings.find_one({"_id": SETTINGS_ID})
    if not s:
        s = {
            "_id": SETTINGS_ID,
            "odoo": OdooConfig().model_dump(),
            "discord": DiscordConfig().model_dump(),
            "office365": Office365Config().model_dump(),
            "twilio": TwilioConfig().model_dump(),
            "schedule_steps": DEFAULT_STEPS,
            "auto_reminders_enabled": True,
            "company_name": "Mijn Bedrijf",
        }
        await db.settings.insert_one(s)
    s.pop("_id", None)
    return s


def _masked(cfg: dict, keys: list) -> dict:
    out = dict(cfg)
    for k in keys:
        if out.get(k):
            out[k] = "••••••••"
    return out


def settings_public(s: dict) -> dict:
    s = dict(s)
    s["odoo"] = _masked(s.get("odoo", {}), ["api_key"])
    s["office365"] = _masked(s.get("office365", {}), ["client_secret"])
    s["twilio"] = _masked(s.get("twilio", {}), ["auth_token"])
    # flag which integrations are configured
    o = s.get("odoo", {})
    s["_status"] = {
        "odoo": bool(o.get("url") and o.get("db") and o.get("username")),
        "discord": bool(s.get("discord", {}).get("webhook_url")),
        "office365": bool(s.get("office365", {}).get("tenant_id") and s.get("office365", {}).get("mail_from")),
        "twilio": bool(s.get("twilio", {}).get("account_sid") and s.get("twilio", {}).get("whatsapp_from")),
    }
    return s


# ---------------- Auth ----------------
@api_router.post("/auth/login")
async def login(data: LoginInput):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not auth_lib.verify_password(data.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Ongeldige e-mail of wachtwoord")
    mfa_token = auth_lib.create_mfa_token(str(user["_id"]))
    return {
        "mfa_token": mfa_token,
        "requires_setup": not user.get("mfa_enabled", False),
    }


@api_router.get("/auth/mfa/setup")
async def mfa_setup(request: Request):
    user_id = auth_lib.get_mfa_user_id(request)
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(status_code=404, detail="Gebruiker niet gevonden")
    import pyotp
    secret = user.get("totp_secret")
    if not secret or user.get("mfa_enabled"):
        secret = pyotp.random_base32()
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"totp_secret": secret}})
    uri = auth_lib.totp_provisioning_uri(secret, user["email"])
    return {"secret": secret, "qr_code": auth_lib.make_qr_data_url(uri), "otpauth_uri": uri}


@api_router.post("/auth/mfa/verify")
async def mfa_verify(data: MfaVerifyInput, request: Request):
    user_id = auth_lib.get_mfa_user_id(request)
    from bson import ObjectId
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user or not user.get("totp_secret"):
        raise HTTPException(status_code=400, detail="MFA is niet ingesteld")
    if not auth_lib.verify_totp(user["totp_secret"], data.code.strip()):
        raise HTTPException(status_code=401, detail="Ongeldige verificatiecode")
    if not user.get("mfa_enabled"):
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"mfa_enabled": True}})
    token = auth_lib.create_access_token(user_id, user["email"])
    return {
        "access_token": token,
        "user": {"id": user_id, "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "user")},
    }


@api_router.get("/auth/me")
async def me(current=Depends(get_current_user)):
    return current


# ---------------- Invoices ----------------
def _serialize_invoice(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/invoices")
async def list_invoices(current=Depends(get_current_user)):
    invoices = await db.invoices.find({}).sort("days_overdue", -1).to_list(1000)
    invoices = [_serialize_invoice(i) for i in invoices]
    total = sum(i.get("amount_residual", 0) for i in invoices)
    return {"invoices": invoices, "count": len(invoices), "total_outstanding": round(total, 2)}


@api_router.post("/invoices/sync")
async def sync_invoices(current=Depends(get_current_user)):
    s = await get_settings()
    o = s.get("odoo", {})
    if not (o.get("url") and o.get("db") and o.get("username") and o.get("api_key")):
        raise HTTPException(status_code=400, detail="Configureer eerst de Odoo-koppeling bij Instellingen")
    try:
        records = await odoo_client.fetch_overdue_invoices(o["url"], o["db"], o["username"], o["api_key"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Odoo synchronisatie mislukt: {str(e)}")

    # preserve per-invoice auto settings
    existing = {i["odoo_id"]: i for i in await db.invoices.find({"source": "odoo"}).to_list(1000)}
    await db.invoices.delete_many({"source": "odoo"})
    now = now_iso()
    to_insert = []
    for r in records:
        prev = existing.get(r["odoo_id"], {})
        r.update({
            "id": prev.get("id", str(uuid.uuid4())),
            "source": "odoo",
            "auto_enabled": prev.get("auto_enabled", True),
            "synced_at": now,
        })
        to_insert.append(r)
    if to_insert:
        await db.invoices.insert_many(to_insert)
    return {"synced": len(to_insert), "synced_at": now}


@api_router.post("/invoices/load-demo")
async def load_demo(current=Depends(get_current_user)):
    await db.invoices.delete_many({"source": "demo"})
    samples = [
        ("De Vries Consulting BV", "jan@devriesconsulting.nl", "+31612345678", 2450.00, 18),
        ("Bakker & Zonen", "info@bakkerenzonen.be", "+32470112233", 890.50, 9),
        ("TechFlow Solutions", "finance@techflow.io", "+31687654321", 12750.00, 34),
        ("Groene Tuin Diensten", "contact@groenetuin.nl", "+31611223344", 340.00, 4),
        ("Maritiem Transport NV", "boekhouding@maritiem.be", "+32485667788", 5600.75, 22),
        ("Studio Lumen", "hello@studiolumen.nl", "+31655667788", 1120.00, 6),
    ]
    now = now_iso()
    docs = []
    for i, (name, email, phone, amount, days) in enumerate(samples, 1):
        due = (date.today() - timedelta(days=days)).isoformat()
        inv_date = (date.today() - timedelta(days=days + 30)).isoformat()
        docs.append({
            "id": str(uuid.uuid4()),
            "odoo_id": 90000 + i,
            "name": f"INV/2026/{1000 + i}",
            "partner_name": name,
            "email": email,
            "phone": phone,
            "amount_total": amount,
            "amount_residual": amount,
            "currency": "EUR",
            "invoice_date": inv_date,
            "invoice_date_due": due,
            "days_overdue": days,
            "source": "demo",
            "auto_enabled": True,
            "synced_at": now,
        })
    await db.invoices.insert_many(docs)
    return {"loaded": len(docs)}


@api_router.patch("/invoices/{invoice_id}/auto")
async def toggle_auto(invoice_id: str, body: dict, current=Depends(get_current_user)):
    enabled = bool(body.get("auto_enabled", True))
    res = await db.invoices.update_one({"id": invoice_id}, {"$set": {"auto_enabled": enabled}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    return {"id": invoice_id, "auto_enabled": enabled}


# ---------------- Reminders ----------------
def build_message(invoice: dict, company: str) -> tuple:
    subject = f"Herinnering: openstaande factuur {invoice['name']}"
    amount = f"{invoice.get('currency', 'EUR')} {invoice.get('amount_residual', 0):,.2f}"
    html = f"""
    <div style="font-family:Arial,sans-serif;color:#0F172A">
      <p>Beste {invoice.get('partner_name', 'klant')},</p>
      <p>Onze administratie geeft aan dat factuur <strong>{invoice['name']}</strong>
      met een openstaand bedrag van <strong>{amount}</strong> reeds
      <strong>{invoice.get('days_overdue', 0)} dagen</strong> vervallen is
      (vervaldatum {invoice.get('invoice_date_due', '')}).</p>
      <p>Wij verzoeken u vriendelijk dit bedrag zo spoedig mogelijk te voldoen.</p>
      <p>Met vriendelijke groet,<br/>{company}</p>
    </div>"""
    text = (f"Beste {invoice.get('partner_name', 'klant')}, factuur {invoice['name']} "
            f"({amount}) is {invoice.get('days_overdue', 0)} dagen vervallen. "
            f"Gelieve zo snel mogelijk te betalen. Groet, {company}")
    return subject, html, text


async def _log_reminder(invoice: dict, channel: str, status: str, detail: str, discord_status: str, step_id: str = None):
    entry = {
        "id": str(uuid.uuid4()),
        "invoice_id": invoice.get("id"),
        "invoice_name": invoice.get("name"),
        "partner_name": invoice.get("partner_name"),
        "channel": channel,
        "target": invoice.get("email") if channel == "email" else invoice.get("phone"),
        "status": status,
        "detail": detail,
        "discord_status": discord_status,
        "step_id": step_id,
        "created_at": now_iso(),
    }
    await db.reminder_logs.insert_one(dict(entry))
    entry.pop("_id", None)
    return entry


async def dispatch_reminder(invoice: dict, channel: str, settings: dict, trigger: str, step_id: str = None) -> dict:
    company = settings.get("company_name", "Mijn Bedrijf")
    subject, html, text = build_message(invoice, company)
    status = "sent"
    detail = ""
    try:
        if channel == "email":
            await notif.send_office365_email(settings.get("office365", {}), invoice.get("email"), subject, html)
        elif channel == "whatsapp":
            await notif.send_whatsapp(settings.get("twilio", {}), invoice.get("phone"), text)
        else:
            raise ValueError("Onbekend kanaal")
    except Exception as e:
        status = "failed"
        detail = str(e)

    # Discord notification to #odoo
    discord_status = "skipped"
    webhook = settings.get("discord", {}).get("webhook_url")
    if webhook:
        icon = "✅" if status == "sent" else "❌"
        try:
            await notif.send_discord(
                webhook,
                title=f"{icon} Herinnering {invoice.get('name')}",
                description=(f"**{invoice.get('partner_name')}** · {channel.upper()} · {trigger}\n"
                             f"Bedrag: {invoice.get('currency','EUR')} {invoice.get('amount_residual',0):,.2f} · "
                             f"{invoice.get('days_overdue',0)} dagen vervallen"),
                color=3066993 if status == "sent" else 15158332,
            )
            discord_status = "sent"
        except Exception as e:
            discord_status = f"failed: {str(e)[:80]}"

    return await _log_reminder(invoice, channel, status, detail, discord_status, step_id)


@api_router.post("/invoices/{invoice_id}/remind")
async def remind(invoice_id: str, data: RemindInput, current=Depends(get_current_user)):
    invoice = await db.invoices.find_one({"id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Factuur niet gevonden")
    settings = await get_settings()
    entry = await dispatch_reminder(_serialize_invoice(invoice), data.channel, settings, trigger="handmatig")
    if entry["status"] == "failed":
        raise HTTPException(status_code=502, detail=entry["detail"] or "Verzenden mislukt")
    return entry


@api_router.post("/discord/test")
async def discord_test(current=Depends(get_current_user)):
    settings = await get_settings()
    webhook = settings.get("discord", {}).get("webhook_url")
    if not webhook:
        raise HTTPException(status_code=400, detail="Discord webhook niet geconfigureerd")
    try:
        await notif.send_discord(webhook, title="🔔 Testmelding", description="Verbinding met kanaal #odoo werkt correct.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"ok": True}


@api_router.post("/odoo/test")
async def odoo_test(current=Depends(get_current_user)):
    s = await get_settings()
    o = s.get("odoo", {})
    if not (o.get("url") and o.get("db") and o.get("username") and o.get("api_key")):
        raise HTTPException(status_code=400, detail="Vul alle Odoo-velden in")
    try:
        info = await odoo_client.test_connection(o["url"], o["db"], o["username"], o["api_key"])
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"ok": True, **info}


# ---------------- Logs ----------------
@api_router.get("/logs")
async def get_logs(current=Depends(get_current_user)):
    logs = await db.reminder_logs.find({}).sort("created_at", -1).limit(200).to_list(200)
    for l in logs:
        l.pop("_id", None)
    return {"logs": logs}


# ---------------- Settings endpoints ----------------
@api_router.get("/settings")
async def read_settings(current=Depends(get_current_user)):
    s = await get_settings()
    return settings_public(s)


@api_router.put("/settings")
async def update_settings(data: SettingsInput, current=Depends(get_current_user)):
    existing = await get_settings()
    payload = data.model_dump()

    # Preserve masked secrets (if UI sends masked placeholder or empty, keep old)
    def keep_secret(section, key):
        new_val = payload.get(section, {}).get(key, "")
        if not new_val or set(new_val) <= {"•"}:
            payload[section][key] = existing.get(section, {}).get(key, "")

    keep_secret("odoo", "api_key")
    keep_secret("office365", "client_secret")
    keep_secret("twilio", "auth_token")

    await db.settings.update_one({"_id": SETTINGS_ID}, {"$set": payload}, upsert=True)
    s = await get_settings()
    return settings_public(s)


# ---------------- Cron: automated reminders ----------------
async def _run_scheduled_reminders(run_id: str):
    # idempotency
    if await db.cron_runs.find_one({"run_id": run_id}):
        return
    await db.cron_runs.insert_one({"run_id": run_id, "created_at": now_iso()})

    settings = await get_settings()
    if not settings.get("auto_reminders_enabled", True):
        return
    steps = settings.get("schedule_steps", [])
    if not steps:
        return
    invoices = await db.invoices.find({"auto_enabled": True}).to_list(1000)
    for inv in invoices:
        inv = _serialize_invoice(inv)
        days = inv.get("days_overdue", 0)
        for step in steps:
            if days >= step["day_offset"]:
                # only send the highest matching step that hasn't been sent yet
                already = await db.reminder_logs.find_one({"invoice_id": inv["id"], "step_id": step["id"]})
                if already:
                    continue
                await dispatch_reminder(inv, step.get("channel", "email"), settings,
                                        trigger=f"auto +{step['day_offset']}d", step_id=step["id"])


@api_router.post("/cron/reminders")
async def cron_reminders(request: Request, background_tasks: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else ""
    if not secret or not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = request.headers.get("X-Webhook-Id") or body.get("run_id") or str(uuid.uuid4())
    background_tasks.add_task(_run_scheduled_reminders, run_id)
    return {"accepted": True, "run_id": run_id}


@api_router.get("/")
async def root():
    return {"message": "Odoo Overdue Reminders API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.invoices.create_index("id")
    await db.reminder_logs.create_index("invoice_id")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": auth_lib.hash_password(admin_password),
            "name": "Beheerder",
            "role": "admin",
            "mfa_enabled": False,
            "created_at": now_iso(),
        })
        logger.info("Admin gebruiker aangemaakt: %s", admin_email)
    elif not auth_lib.verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": auth_lib.hash_password(admin_password)}})
    await get_settings()


@app.on_event("shutdown")
async def shutdown():
    client.close()
