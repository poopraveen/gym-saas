# Pitch PDF screenshots

Screenshots in this folder are embedded in the **pitch PDF** generated per tenant from Platform Admin.  
**If this folder is empty (or only has README), run the capture script below.**

## Automated capture (Playwright)

With the **app and API running** (e.g. frontend on 5173, backend on 3000), run:

```bash
# Windows (PowerShell)
$env:TENANT_ID="your-tenant-id"; $env:ADMIN_EMAIL="admin@example.com"; $env:ADMIN_PASSWORD="yourpassword"; npm run capture-pitch-screenshots

# Windows (cmd)
set TENANT_ID=your-tenant-id
set ADMIN_EMAIL=admin@example.com
set ADMIN_PASSWORD=yourpassword
npm run capture-pitch-screenshots

# Linux / macOS
TENANT_ID=xxx ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=secret npm run capture-pitch-screenshots
```

Optional (for Platform Admin screenshot):

- `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD`
- `BASE_URL` (default `http://localhost:5173`)

The script uses **Playwright** to open the app, log in, visit each page, and save PNGs here. Regenerate the pitch PDF from Platform Admin to include them.

## File names

| File name            | Page              |
|----------------------|-------------------|
| `login.png`          | Login             |
| `dashboard.png`      | Dashboard         |
| `enquiries.png`      | Enquiries         |
| `onboarding.png`     | Member onboarding |
| `nutrition-ai.png`   | Nutrition AI      |
| `platform-admin.png` | Platform Admin    |

## Manual capture

You can also add PNG/JPEG files with the names above (e.g. from browser DevTools or a screenshot tool). If a file is missing, the PDF shows a grey placeholder and “Run: npm run capture-pitch-screenshots”.
