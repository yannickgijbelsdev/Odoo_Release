# PRD — Odoo Vervallen Facturen & Automatische Herinneringen

## Original Problem Statement
Applicatie met login + MFA. Toont via de Odoo API een lijst met vervallen facturen en stuurt herinneringen op een tijdsschema. Herinneringen gaan via Office 365 e-mail of WhatsApp, en tegelijkertijd wordt een melding naar het Discord-kanaal #odoo gestuurd.

## User Choices
- Auth: eigen e-mail/wachtwoord (JWT) + MFA via authenticator-app (TOTP)
- Odoo: Odoo Online (SaaS) via XML-RPC
- Herinneringskanaal: Beide (Office 365 e-mail + WhatsApp via Twilio)
- Discord: via webhook naar #odoo
- Schema: dagelijkse automatische controle + instelbaar per stap/per factuur

## Architecture
- Backend: FastAPI (`/app/backend/server.py`, `auth.py`, `odoo_client.py`, `notifications.py`), MongoDB (motor)
- Frontend: React (`src/pages/Login.js`, `Dashboard.js`, `Settings.js`, `Activity.js`, `components/AppShell.js`), Tailwind + shadcn, dark-first "Swiss Fintech" theme
- Scheduling: platform cron `.emergent/crons.yml` → `POST /api/cron/reminders` (daily 08:00 Europe/Amsterdam), Bearer WEBHOOK_CRON_SECRET, work runs in background task

## Personas
- Debiteurenbeheerder / boekhouder die openstaande facturen opvolgt.

## Core Requirements (static)
- Veilige login met verplichte TOTP MFA
- Odoo XML-RPC ophalen van vervallen out_invoice facturen (not_paid/partial, due < vandaag)
- Handmatige + automatische herinneringen via e-mail/WhatsApp
- Discord #odoo notificatie bij elke herinnering
- Instelbaar tijdsschema (stappen op X dagen vervallen, kanaal per stap) + auto aan/uit per factuur
- Activiteitenlog met verzend- en Discord-status

## Implemented (2026-09-17)
- JWT + TOTP MFA (login → setup/QR → verify), admin geseed met echte owner-e-mail
- Odoo XML-RPC client + `/api/invoices/sync`, demo-data loader voor directe AHA
- Dashboard met stats, tabel, severity-badges, per-rij auto-toggle, herinner-dropdown (e-mail/WhatsApp)
- Office 365 (Microsoft Graph client credentials), Twilio WhatsApp, Discord webhook dispatch — allemaal graceful bij ontbrekende config
- Settings-pagina (Odoo/Discord/O365/Twilio + schema-stappen) met test-knoppen en gemaskeerde secrets
- Activiteitenlog + dagelijkse cron
- Verified: 15/15 backend pytest, frontend e2e, cron auth, 400-foutdetail bereikt client

## Backlog / Remaining
- P1: Echte credentials invullen (Odoo, O365 Azure app, Twilio WhatsApp, Discord webhook) om live verzending te activeren — nu MOCKED/niet geconfigureerd
- P2: WhatsApp goedgekeurde templates (buiten 24u-venster), Odoo XML-RPC socket timeout, e-mailbijlage PDF-factuur
- P2: per-klant schema-overrides, betaal-link in herinnering
- P2: strak CORS-origin voor productie

## Next Tasks
- Gebruiker vragen om credentials en integraties end-to-end live testen
