import httpx
import msal


async def send_discord(webhook_url: str, title: str, description: str, color: int = 5793266, fields: list | None = None):
    if not webhook_url:
        raise ValueError("Discord webhook not configured")
    embed = {"title": title, "description": description, "color": color}
    if fields:
        embed["fields"] = fields
    payload = {"username": "Odoo Reminders", "embeds": [embed]}
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(webhook_url, json=payload)
        if resp.status_code not in (200, 204):
            raise ValueError(f"Discord error: {resp.status_code} {resp.text[:200]}")
    return True


def _get_graph_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    authority = f"https://login.microsoftonline.com/{tenant_id}"
    appc = msal.ConfidentialClientApplication(
        client_id, authority=authority, client_credential=client_secret
    )
    result = appc.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    if "access_token" not in result:
        raise ValueError(f"Office 365 token error: {result.get('error_description', result.get('error'))}")
    return result["access_token"]


async def send_office365_email(cfg: dict, to_email: str, subject: str, html_body: str):
    tenant_id = cfg.get("tenant_id")
    client_id = cfg.get("client_id")
    client_secret = cfg.get("client_secret")
    mail_from = cfg.get("mail_from")
    if not all([tenant_id, client_id, client_secret, mail_from]):
        raise ValueError("Office 365 is not fully configured")
    if not to_email:
        raise ValueError("No email address on file for this customer")

    import asyncio
    token = await asyncio.to_thread(_get_graph_token, tenant_id, client_id, client_secret)
    url = f"https://graph.microsoft.com/v1.0/users/{mail_from}/sendMail"
    message = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": html_body},
            "toRecipients": [{"emailAddress": {"address": to_email}}],
        },
        "saveToSentItems": True,
    }
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(url, headers=headers, json=message)
        if resp.status_code != 202:
            raise ValueError(f"Office 365 error: {resp.status_code} {resp.text[:200]}")
    return True


async def send_whatsapp(cfg: dict, to_phone: str, body: str):
    account_sid = cfg.get("account_sid")
    auth_token = cfg.get("auth_token")
    from_number = cfg.get("whatsapp_from")
    if not all([account_sid, auth_token, from_number]):
        raise ValueError("Twilio WhatsApp is not fully configured")
    if not to_phone:
        raise ValueError("No phone number on file for this customer")

    to_wa = to_phone if to_phone.startswith("whatsapp:") else f"whatsapp:{to_phone.strip()}"
    from_wa = from_number if from_number.startswith("whatsapp:") else f"whatsapp:{from_number.strip()}"
    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    data = {"From": from_wa, "To": to_wa, "Body": body}
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(url, data=data, auth=(account_sid, auth_token))
        if resp.status_code not in (200, 201):
            raise ValueError(f"WhatsApp error: {resp.status_code} {resp.text[:200]}")
    return True
