# Automated Mailing API

This small Node.js + Express service converts incoming HTML into an A4 PDF (print-ready) and emails it as a secure attachment. It is configured to use Zoho Mail with a custom domain.

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
- `nodemailer` (for sending email)
- `dotenv` (for environment variables)
- `helmet` (basic security headers)

Environment

Create a `.env` from `.env.example` and fill in SMTP credentials. Required env vars:
- `PORT` (optional)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- `FROM_EMAIL`
- `CUSTOM_DOMAIN`
- `ORGANIZATION_NAME`

Example `.env` values:

```text
PORT=3000
SMTP_HOST=smtp.zoho.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=customs@ukborderforce.site
SMTP_PASS=your_zoho_app_password
FROM_EMAIL="Border Force <customs@ukborderforce.site>"
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
{ "success": true, "messageId": "<SMTP message id>" }
```

Test with curl (replace values and ensure `.env` is configured):

```bash
curl -X POST http://localhost:3000/send \
  -H 'Content-Type: application/json' \
  -d '{"recipient_email":"you@example.com","html_content":"<h1>Test</h1><p>Letter body</p>"}'
```

Notes and security
- Keep SMTP credentials out of source control.
- For production, run behind TLS (HTTPS) and lock down origins.
- Puppeteer can be resource-heavy; consider a headless Chrome service or rendering queue for high throughput.
- On Render's free plan, the web service can spin down after inactivity. Use an external uptime monitor to ping `GET /health` every few minutes if you want to reduce cold starts.
# customs
