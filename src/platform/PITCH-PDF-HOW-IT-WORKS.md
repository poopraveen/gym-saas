# How the Pitch PDF is generated

## URL and who can call it

- **URL:** `GET /api/platform/tenants/:id/pitch-pdf`
  - Example: `https://your-api.com/api/platform/tenants/507f1f77bcf86cd799439011/pitch-pdf`
- **Auth:** Super Admin only (JWT with role `SUPER_ADMIN`). No tenant header for this call.
- **Response:** Binary PDF file (attachment). Filename: `pitch-{tenant-slug}.pdf`.

## Flow (end to end)

1. **User:** In Platform Admin, clicks “Pitch PDF” (or “Download Pitch PDF”) for a tenant.
2. **Client:** Calls `api.platform.downloadTenantPitchPdf(tenantId)` which does:
   - `fetch(API_BASE + '/platform/tenants/' + tenantId + '/pitch-pdf', { headers: { Authorization: 'Bearer ...' } })`
   - Reads response as blob, creates a temporary download link, triggers download, revokes the URL.
3. **Backend:** `GET /platform/tenants/:id/pitch-pdf` is handled by `PlatformController.getTenantPitchPdf(id)`:
   - Calls `PlatformService.getTenantPitchPdf(tenantId)`.
   - Returns the PDF buffer as a `StreamableFile` with `Content-Disposition: attachment`.
4. **PDF generation (PlatformService.getTenantPitchPdf):**
   - Loads tenant details (name, slug, subdomain, admin, etc.).
   - Creates a PDF with PDFKit:
     - **First page:** Background (gradient or optional image), header (“Gym SaaS — Application Pitch” + tenant name), then content.
     - **Content:** Title, tenant block, “Application screens” section with 6 screenshot placeholders (or real PNGs from `src/platform/assets/pitch-screenshots/`), then sections 1–10 (Product Overview, Problem Statement, etc.).
     - **Page breaks:** When content would go past the bottom of the content area, a new page is added with the same background and header, and a footer (Confidential, Page N, tenant name) is drawn on the previous page.
   - Returns the buffer and suggested filename.

## Where screenshots come from

- Screenshots are **not** fetched from any URL. They are **files on the server** in:
  - `src/platform/assets/pitch-screenshots/`
  - Or `pitch-screenshots/` at project root.
- Allowed names: `login`, `dashboard`, `enquiries`, `onboarding`, `nutrition-ai`, `platform-admin` (with `.png` / `.jpg` / `.jpeg`).
- To refresh them, run: `npm run capture-pitch-screenshots` (Playwright script that opens the app, logs in, and saves PNGs into the assets folder). The PDF then embeds whatever files are present at generation time.

## Summary

| Step | What happens |
|------|----------------|
| 1 | User clicks “Pitch PDF” in Platform Admin (frontend). |
| 2 | Frontend calls `GET /api/platform/tenants/:id/pitch-pdf` with JWT. |
| 3 | Backend loads tenant, builds PDF with PDFKit (header, footer, background, tenant text, screenshots from disk, sections 1–10). |
| 4 | Backend returns PDF as attachment. |
| 5 | Browser downloads the file. |

No external URL is used to “generate” the PDF; the backend generates it from tenant data and local assets.
