"""Backend regression tests for Odoo Overdue Reminders API."""
import os
import time
import pyotp
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://odoo-invoice-hub.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "4s5nxkkk67@privaterelay.appleid.com"
ADMIN_PASSWORD = "OdooReminders#2026"
CRON_SECRET = "cron_7f2a9c4e1b8d3f6a5c0e9b2d4f7a1c3e9b2d"


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def access_token(s):
    # Login
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "mfa_token" in data
    mfa_token = data["mfa_token"]

    # MFA setup (idempotent: if already enabled, returns existing secret only if we set request)
    headers = {"Authorization": f"Bearer {mfa_token}"}
    r = s.get(f"{API}/auth/mfa/setup", headers=headers)
    assert r.status_code == 200, r.text
    setup = r.json()
    assert "secret" in setup and "qr_code" in setup
    secret = setup["secret"]

    # Verify
    code = pyotp.TOTP(secret).now()
    r = s.post(f"{API}/auth/mfa/verify", headers=headers, json={"code": code})
    if r.status_code == 401:
        # possible clock drift; wait a step
        time.sleep(2)
        code = pyotp.TOTP(secret).now()
        r = s.post(f"{API}/auth/mfa/verify", headers=headers, json={"code": code})
    assert r.status_code == 200, r.text
    tok = r.json()
    assert "access_token" in tok
    return tok["access_token"]


@pytest.fixture(scope="session")
def auth_headers(access_token):
    return {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_login_invalid(self, s):
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, s, auth_headers):
        r = s.get(f"{API}/auth/me", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert d.get("role") == "admin"


# ---------- Invoices ----------
class TestInvoices:
    def test_load_demo(self, s, auth_headers):
        r = s.post(f"{API}/invoices/load-demo", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["loaded"] == 6

    def test_list_invoices(self, s, auth_headers):
        r = s.get(f"{API}/invoices", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["count"] >= 6
        assert d["total_outstanding"] > 0
        assert isinstance(d["invoices"], list)
        # id fields, no _id
        for inv in d["invoices"]:
            assert "_id" not in inv
            assert "id" in inv

    def test_sync_no_config(self, s, auth_headers):
        r = s.post(f"{API}/invoices/sync", headers=auth_headers)
        assert r.status_code == 400
        assert "Odoo" in r.json().get("detail", "")

    def test_remind_email_fails_gracefully(self, s, auth_headers):
        inv = s.get(f"{API}/invoices", headers=auth_headers).json()["invoices"][0]
        r = s.post(f"{API}/invoices/{inv['id']}/remind", headers=auth_headers, json={"channel": "email"})
        # Backend returns 502 (Cloudflare rewrites the body to an HTML error page,
        # so we cannot read the Dutch detail from the response reliably).
        assert r.status_code == 502
        # Verify failure was logged with a Dutch Office365 detail
        logs = s.get(f"{API}/logs", headers=auth_headers).json()["logs"]
        matching = [l for l in logs if l.get("invoice_id") == inv["id"] and l.get("status") == "failed"]
        assert matching, "Expected a failed reminder_log entry"
        assert "Office 365" in matching[0].get("detail", "") or "geconfigureerd" in matching[0].get("detail", "").lower()

    def test_toggle_auto(self, s, auth_headers):
        inv = s.get(f"{API}/invoices", headers=auth_headers).json()["invoices"][0]
        r = s.patch(f"{API}/invoices/{inv['id']}/auto", headers=auth_headers, json={"auto_enabled": False})
        assert r.status_code == 200
        assert r.json()["auto_enabled"] is False


# ---------- Logs ----------
class TestLogs:
    def test_logs_returned(self, s, auth_headers):
        r = s.get(f"{API}/logs", headers=auth_headers)
        assert r.status_code == 200
        logs = r.json()["logs"]
        assert isinstance(logs, list)
        assert any(l.get("status") == "failed" for l in logs), "Expected a failed reminder log entry"


# ---------- Settings ----------
class TestSettings:
    def test_get_settings_masked(self, s, auth_headers):
        r = s.get(f"{API}/settings", headers=auth_headers)
        assert r.status_code == 200
        d = r.json()
        assert "_status" in d
        assert set(d["_status"].keys()) >= {"odoo", "discord", "office365", "twilio"}

    def test_put_settings_preserve_masked_secret(self, s, auth_headers):
        # 1. set a real secret
        payload = {
            "odoo": {"url": "https://demo.odoo.com", "db": "demo", "username": "admin", "api_key": "SECRET123"},
            "discord": {"webhook_url": "", "channel_name": "#odoo"},
            "office365": {"tenant_id": "", "client_id": "", "client_secret": "", "mail_from": ""},
            "twilio": {"account_sid": "", "auth_token": "", "whatsapp_from": ""},
            "schedule_steps": [],
            "auto_reminders_enabled": True,
            "company_name": "TestCo",
        }
        r = s.put(f"{API}/settings", headers=auth_headers, json=payload)
        assert r.status_code == 200
        d = r.json()
        assert d["odoo"]["api_key"] == "••••••••"
        assert d["company_name"] == "TestCo"

        # 2. send masked -> should preserve existing
        payload["odoo"]["api_key"] = "••••••••"
        payload["company_name"] = "TestCo2"
        r = s.put(f"{API}/settings", headers=auth_headers, json=payload)
        assert r.status_code == 200
        # verify by attempting to sync — should NOT get "configureer eerst" (means secret is preserved)
        r2 = s.post(f"{API}/invoices/sync", headers=auth_headers)
        # It should attempt sync and fail 502 with connection error (not 400 config missing)
        assert r2.status_code == 502, f"Expected 502 sync failure (secret preserved), got {r2.status_code}: {r2.text}"

    def test_reset_settings(self, s, auth_headers):
        # cleanup: reset to empty odoo so other tests won't be affected in order
        payload = {
            "odoo": {"url": "", "db": "", "username": "", "api_key": ""},
            "discord": {"webhook_url": "", "channel_name": "#odoo"},
            "office365": {"tenant_id": "", "client_id": "", "client_secret": "", "mail_from": ""},
            "twilio": {"account_sid": "", "auth_token": "", "whatsapp_from": ""},
            "schedule_steps": [],
            "auto_reminders_enabled": True,
            "company_name": "Mijn Bedrijf",
        }
        r = s.put(f"{API}/settings", headers=auth_headers, json=payload)
        assert r.status_code == 200


# ---------- Discord ----------
class TestDiscord:
    def test_discord_test_no_webhook(self, s, auth_headers):
        r = s.post(f"{API}/discord/test", headers=auth_headers)
        assert r.status_code == 400


# ---------- Cron ----------
class TestCron:
    def test_cron_unauthorized(self, s):
        r = s.post(f"{API}/cron/reminders", json={})
        assert r.status_code == 401

    def test_cron_wrong_token(self, s):
        r = s.post(f"{API}/cron/reminders", json={},
                   headers={"Authorization": "Bearer wrong", "Content-Type": "application/json"})
        assert r.status_code == 401

    def test_cron_valid(self, s):
        r = s.post(f"{API}/cron/reminders", json={},
                   headers={"Authorization": f"Bearer {CRON_SECRET}", "Content-Type": "application/json"})
        assert r.status_code == 200
        assert r.json().get("accepted") is True
