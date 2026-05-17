# Automated Mailing API

This small Node.js + Express service converts incoming HTML into an A4 PDF (print-ready) and emails it as a secure attachment. It is configured to use Resend over HTTPS.

It also includes a website inbox workflow:
- Receive inbound email through a webhook endpoint
- View messages from a secure admin inbox page
- Reply to received messages from the website

Installation

1. Clone or place the project locally and cd into the folder:

```bash
cd /path/to/automated-mailing-api
```

2. Install dependencies:

```bash
npm install
```

Dependencies installed by the above command:
- `express`
- `puppeteer` (for HTML -> PDF rendering)
- `resend` (for sending email)
- `dotenv` (for environment variables)
- `helmet` (basic security headers)

Environment

Create a `.env` from `.env.example` and fill in email API credentials. Required env vars:
- `PORT` (optional)
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `ADMIN_TOKEN` (required for admin inbox access)
- `CUSTOM_DOMAIN`
- `ORGANIZATION_NAME`

Optional env vars:
- `INBOUND_WEBHOOK_SECRET` (recommended to protect inbound webhook calls)

Example `.env` values:

```text
PORT=3000
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FROM_EMAIL="Border Force <customs@ukborderforce.site>"
ADMIN_TOKEN=change-this-long-random-token
INBOUND_WEBHOOK_SECRET=optional-webhook-secret
CUSTOM_DOMAIN=ukborderforce.site
ORGANIZATION_NAME=Border Force
```

Run

```bash
npm start
```

API

POST /send

Body (JSON):

```json
{
  "recipient_email": "recipient@example.com",
  "html_content": "<html>...official letter html...</html>"
}
```

Response on success:

```json
{ "success": true, "messageId": "<provider message id>" }
```

POST /inbound/email

Accepts inbound email webhook payloads and stores them to the inbox store.
If `INBOUND_WEBHOOK_SECRET` is configured, include header `x-webhook-secret`.

Example payload:

```json
{
  "from": "sender@example.com",
  "to": "customs@ukborderforce.site",
  "subject": "Question about notice",
  "text": "Hello, can you confirm this case?",
  "message_id": "<abc123@example.com>"
}
```

Admin inbox endpoints (token-protected)
- `GET /admin`
- `GET /admin/api/messages`
- `GET /admin/api/messages/:id`
- `POST /admin/api/messages/:id/reply`

Use either of these headers for admin auth:
- `x-admin-token: <ADMIN_TOKEN>`
- `Authorization: Bearer <ADMIN_TOKEN>`

Test with curl (replace values and ensure `.env` is configured):

```bash
curl -X POST http://localhost:3000/send \
  -H 'Content-Type: application/json' \
  -d '{"recipient_email":"you@example.com","html_content":"<h1>Test</h1><p>Letter body</p>"}'
```

Notes and security
- Keep API credentials out of source control.
- Set a strong `ADMIN_TOKEN` in production.
- Protect `/inbound/email` with `INBOUND_WEBHOOK_SECRET`.
- Inbox data is stored in `data/inbox.json` and should not be committed.
- For production, run behind TLS (HTTPS) and lock down origins.
- Puppeteer can be resource-heavy; consider a headless Chrome service or rendering queue for high throughput.
- On Render's free plan, the web service can spin down after inactivity. Use an external uptime monitor to ping `GET /health` every few minutes if you want to reduce cold starts.
# customs
