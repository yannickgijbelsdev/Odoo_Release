import asyncio
import xmlrpc.client
from datetime import datetime, date


def _connect_and_fetch(url: str, db: str, username: str, api_key: str):
    url = url.rstrip("/")
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
    uid = common.authenticate(db, username, api_key, {})
    if not uid:
        raise ValueError("Odoo authentication failed. Check the database, user and API key.")

    models = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/object", allow_none=True)
    today = date.today().isoformat()

    domain = [
        ["move_type", "=", "out_invoice"],
        ["state", "=", "posted"],
        ["payment_state", "in", ["not_paid", "partial"]],
        ["invoice_date_due", "<", today],
    ]
    fields = [
        "name", "partner_id", "amount_total", "amount_residual",
        "invoice_date", "invoice_date_due", "currency_id",
    ]
    records = models.execute_kw(
        db, uid, api_key, "account.move", "search_read",
        [domain], {"fields": fields, "limit": 500, "order": "invoice_date_due asc"},
    )

    # fetch partner emails / phones
    partner_ids = list({r["partner_id"][0] for r in records if r.get("partner_id")})
    partners = {}
    if partner_ids:
        pdata = models.execute_kw(
            db, uid, api_key, "res.partner", "read",
            [partner_ids], {"fields": ["name", "email", "phone", "mobile"]},
        )
        partners = {p["id"]: p for p in pdata}

    result = []
    for r in records:
        pid = r["partner_id"][0] if r.get("partner_id") else None
        partner = partners.get(pid, {}) if pid else {}
        due = r.get("invoice_date_due")
        days_overdue = 0
        if due:
            try:
                days_overdue = (date.today() - datetime.strptime(due, "%Y-%m-%d").date()).days
            except Exception:
                days_overdue = 0
        result.append({
            "odoo_id": r["id"],
            "name": r.get("name") or f"INV/{r['id']}",
            "partner_name": r["partner_id"][1] if r.get("partner_id") else "Unknown",
            "email": partner.get("email") or "",
            "phone": partner.get("mobile") or partner.get("phone") or "",
            "amount_total": r.get("amount_total") or 0.0,
            "amount_residual": r.get("amount_residual") or 0.0,
            "currency": (r.get("currency_id") or [None, "EUR"])[1] if r.get("currency_id") else "EUR",
            "invoice_date": r.get("invoice_date") or "",
            "invoice_date_due": due or "",
            "days_overdue": days_overdue,
        })
    return result


async def fetch_overdue_invoices(url: str, db: str, username: str, api_key: str):
    return await asyncio.to_thread(_connect_and_fetch, url, db, username, api_key)


def _test_connection(url: str, db: str, username: str, api_key: str):
    url = url.rstrip("/")
    common = xmlrpc.client.ServerProxy(f"{url}/xmlrpc/2/common", allow_none=True)
    version = common.version()
    uid = common.authenticate(db, username, api_key, {})
    if not uid:
        raise ValueError("Authentication failed")
    return {"uid": uid, "server_version": version.get("server_version", "onbekend")}


async def test_connection(url: str, db: str, username: str, api_key: str):
    return await asyncio.to_thread(_test_connection, url, db, username, api_key)
