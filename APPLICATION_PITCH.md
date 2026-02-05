# Gym SaaS — Application Pitch Document

**Multi-tenant Gym Management Platform with AI-Powered Nutrition**

Suitable for: Startup pitch • Investor/demo • Gym owner onboarding

---

## 1. Product Overview

**Gym SaaS** is a **multi-tenant B2B SaaS** for gym owners and operators in India. It provides:

- **Single codebase, multiple gyms**: Each gym (tenant) gets isolated data, branded login (subdomain or custom domain), and role-based access.
- **Core operations**: Member management, attendance (check-in), fees tracking, follow-ups, and enquiry-to-member conversion.
- **AI differentiation**: **Nutrition AI** — calorie logging via natural language (e.g. “ate 2 idlis and sambar”) and full-day nutrition analysis with Indian diet context (ICMR-style), RDI percentages, deficiencies, and improvement suggestions.
- **Member self-service**: Members can log in (after staff onboarding), track calories, and view nutrition reports; staff can view member progress.

**Tech in one line**: NestJS backend, React (Vite) frontend, MongoDB, JWT + RBAC, OpenAI for nutrition. Deployable on Render (API) + Vercel (frontend).

---

## 2. Problem Statement (Gym Owners in India)

- **Fragmented tools**: Many gyms use WhatsApp + Excel or single-gym desktop software; no unified, affordable cloud stack.
- **Member engagement**: Hard to keep members engaged beyond attendance; no value-add like nutrition that increases stickiness.
- **Enquiry leakage**: Walk-ins and phone enquiries are lost without a structured pipeline (status, follow-ups, conversion).
- **Fees & defaults**: Tracking due dates and defaulters manually; no simple finance summary or PDF reports.
- **Multi-branch / white-label**: No low-cost way to run multiple gyms or give each gym its own login URL and branding.

**Our solution**: One subscription per gym (tenant); staff and members use one app with tenant isolation, plus AI nutrition to differentiate and retain members.

---

## 3. Key Features (Derived from Codebase)

### 3.1 Main Modules (Backend)

| Module | Purpose |
|--------|---------|
| **Auth** | Login, register, JWT, tenant resolution by host (subdomain/custom domain), member onboarding (link login to Reg No), reset password, deactivate member user. |
| **Tenants** | Tenant CRUD, public config (name, theme, logo, primary color) for login/app, subdomain & custom domain lookup. |
| **Members** | Upsert/delete members (legacy field mapping), list, finance summary, monthly collections/growth, findByPhone, findByGymIdOrRegNo, RDI profile (age, gender, height, weight, goal). |
| **Attendance** | Check-in list, check-in by Reg No. |
| **Calories** | Chat (free-text → calories), set entry, today/last-7-days/history, accept default (fill missing day), **analyze** (full nutrition report), get/save RDI profile, reference foods; staff can view member progress. |
| **Enquiries** | CRUD, follow-ups (Call/WhatsApp/Visit), mark lost, convert to member. |
| **Follow-ups** | Create, batch get/post, by member. |
| **Legacy** | Backward-compatible API: upsert member, list, lookup, checkinlist, checkin, finance, followups, next-receipt-id, backup (defaulters). |
| **Platform** | SUPER_ADMIN only: create/list/get/update tenants, reset tenant admin password. |
| **Profile-users** | Create/list profile users (tenant-scoped). |
| **Atlas-members** | List (Atlas-specific). |
| **Counters** | Sequence generation (e.g. receipt IDs). |

### 3.2 Frontend Pages & Flows

| Route | Who | Features |
|-------|-----|----------|
| `/login` | All | Tenant ID + email/password; tenant can be resolved from host. |
| `/` (Dashboard) | Staff/Admin | People (members) list, search, filters; check-in; fees/pay; finance summary; monthly collection report (PDF); follow-ups; defaulters; guided tour. |
| `/enquiries` | Staff/Admin | Enquiry list, add/edit, follow-ups, mark lost, convert to member. |
| `/onboarding` | Admin/Manager | Lookup member by Gym ID/Reg No, create member login (email + password), link to Reg No; user management table (reset password, deactivate). |
| `/nutrition-ai` | Members + Staff | Calorie chat, day editor, accept default, copy day, history; **Nutrition Analysis** (food dropdown, qty, unit, RDI profile modal); staff view member progress & saved reports. |
| `/platform` | SUPER_ADMIN | Create/edit tenants, reset tenant admin. |

### 3.3 API Endpoints (Summary)

**Auth** (`/api/auth`)  
- `POST /login`, `POST /register`, `POST /onboard-user`, `POST /onboard-member`  
- `GET /me`, `GET /ai-members`, `POST /reset-member-password`, `DELETE /member-users/:userId`

**Tenants** (`/api/tenants`)  
- `GET /config` (public), `POST /`, `GET /`

**Members** (`/api/members`)  
- `POST /` (upsert), `GET /list`

**Attendance** (`/api/attendance`)  
- `GET /checkinlist`, `POST /checkin`

**Calories** (`/api/calories`)  
- `POST /chat`, `PATCH /entry`, `GET /today`, `GET /profile`, `POST /profile`, `GET /last-7-days`, `GET /history`, `POST /accept-default`  
- `GET /member/:memberUserId/today` (staff), same for last-7-days, history, analysis  
- `POST /analyze`, `GET /analysis`, `GET /reference-foods`

**Enquiries** (`/api/enquiries`)  
- `POST /`, `PUT /:id`, `GET /` (paginated), `GET /:id`, `POST /:id/follow-ups`, `GET /:id/follow-ups`, `PATCH /:id/lost`, `POST /:id/convert`

**Follow-ups** (`/api/follow-ups`)  
- `POST /`, `GET /batch`, `POST /batch`, `GET /member/:memberId`

**Legacy** (`/api/legacy`)  
- `POST /`, `GET /list`, `GET /lookup`, `GET /checkinlist`, `POST /checkin`, `GET /finance`, `POST /followups`, `GET /followups-batch`, `GET /followups-member/:memberId`, `GET /next-receipt-id`, `GET /backup`

**Platform** (`/api/platform`)  
- `POST /tenants`, `GET /tenants`, `GET /tenants/:id`, `PUT /tenants/:id`, `POST /tenants/:id/reset-admin`

**Profile-users** (`/api/profile-users`)  
- `POST /`, `GET /list`

**Atlas-members** (`/api/atlas-members`)  
- `GET /`

Swagger: `/api/docs`

---

## 4. AI Features and Differentiation

### 4.1 Implemented AI (OpenAI)

- **Calorie chat** (`POST /calories/chat`)  
  - Input: Free-text message (e.g. “ate 2 idlis and sambar”).  
  - Output: Structured JSON (date, items with name/quantity/estimatedCalories, totalCalories).  
  - Uses Indian portions (katori, idlis, chapati) and ICMR-style references.  
  - Can extend an existing day (add more items) or create new.

- **Nutrition analysis** (`POST /calories/analyze`)  
  - Input: Meals (food, quantity, unit), optional **user profile** (age, gender, height, weight, goal).  
  - Output: Per-food breakdown (calories, protein, carbs, fat, fiber, vitamins, minerals), daily totals, **RDI %**, deficiencies (deficient / slightly_low / optimal / excess), suggestions, improvements (foods, portions, swaps).  
  - RDI tuned for Indian adults (e.g. Protein 50–60g, Vitamin C 40mg, Calcium 1000mg).  
  - Profile stored on member and pre-filled in UI for better personalization.

- **Reference data**  
  - In-code reference foods (Dosa, Chicken, Tea, Rice, Guava, Idli, Paneer, Orange, etc.) with per-100g and grams-per-unit; liquid foods support **ml**.  
  - `GET /calories/reference-foods` exposes these for the food dropdown.

### 4.2 Differentiation

- **Indian-first**: Prompts and RDI aligned to Indian diets and ICMR-style guidelines.  
- **Member stickiness**: Nutrition adds ongoing value (log meals, see reports) beyond attendance.  
- **Personalized RDI**: Age, gender, height, weight, goal used when provided.  
- **Staff oversight**: Staff can view any onboarded member’s calorie history and saved nutrition reports.

### 4.3 Assumptions / Not in Code

- **Twilio**: Env vars present for SMS (defaulter/backup); backend has a TODO for Twilio integration — **not implemented**.  
- **Cloudinary**: Env vars for profile images — **optional, not wired in code**.  
- **Model**: Uses OpenAI API; exact model (e.g. gpt-4o-mini) is not hardcoded in the scanned files — **assume configurable via env or code**.

---

## 5. Technical Architecture

### 5.1 Frontend

- **Stack**: React 18, TypeScript, Vite 5, React Router 6.  
- **State**: Local (useState/useRef/useEffect); no Redux.  
- **UI**: CSS with variables (theme, primary, borders); Recharts for charts; jsPDF + jspdf-autotable for PDF report; Driver.js for guided tour.  
- **API**: Single `api` client (fetch), JWT in `Authorization`, tenant in `X-Tenant-ID`; token/tenant/role in localStorage.  
- **Routes**: Login, Dashboard, Enquiries, Onboarding, Nutrition AI, Platform (SUPER_ADMIN).  
- **Build**: `client/dist` (static).  

### 5.2 Backend

- **Stack**: NestJS 10, Node, TypeScript, Express.  
- **Auth**: JWT (passport-jwt), bcrypt for passwords.  
- **Guards**: JwtAuthGuard, RolesGuard (SUPER_ADMIN, TENANT_ADMIN, MANAGER, STAFF, MEMBER).  
- **Validation**: class-validator + class-transformer, global ValidationPipe (whitelist, forbidNonWhitelisted, transform).  
- **Docs**: Swagger at `/api/docs`.

### 5.3 Database

- **DB**: MongoDB (single database; tenant isolation by `tenantId` on all tenant-scoped collections).  
- **ODM**: Mongoose (NestJS).  

**Collections / Models**:

| Collection | Model | Key fields |
|------------|--------|------------|
| tenants | Tenant | name, slug, subdomain, customDomain, defaultTheme, branding (logo, primaryColor, etc.) |
| users | User | email, passwordHash, name, role, tenantId, isActive, linkedRegNo (for MEMBER) |
| members | Member | tenantId, regNo, name, gender, age, heightCm, weightKg, goal, dateOfJoining, phoneNumber, email, typeofPack, dueDate, feesAmount, monthlyAttendance, etc. |
| calorie_entries | CalorieEntry | tenantId, userId, date, source (user/system), totalCalories, detailsJson (items) |
| nutrition_analyses | NutritionAnalysis | tenantId, userId, date, meals, userProfile, perFood, dailyTotal, rdiPercentage, deficiencies, suggestions, improvements |
| enquiry_members | EnquiryMember | tenantId, name, phoneNumber, source, status, followUpRequired, convertedMemberId, etc. |
| enquiry_followups | EnquiryFollowUp | tenantId, enquiryId, followUpDate, followUpType, notes, nextFollowUpDate |
| follow_ups | FollowUp | tenantId, memberId, regNo, comment, nextFollowUpDate |
| counters | Counter | _id, seq (for sequences e.g. receipt) |
| profile-users | (ProfileUser schema) | tenant-scoped profile users |

Indexes: tenantId + entity identifiers (e.g. tenantId+regNo, tenantId+userId+date) for performance and uniqueness.

### 5.4 AI Integration

- **Provider**: OpenAI (library `openai`).  
- **Usage**: CaloriesService (chat + analyze); API key from `OPENAI_API_KEY`.  
- **No vector DB or fine-tuning** in code — prompt-based only.

### 5.5 Third-Party / Optional Services

- **OpenAI**: Required for Nutrition AI.  
- **Twilio**: Env only; SMS not implemented.  
- **Cloudinary**: Env only; not used in code.  
- **MongoDB Atlas**: Supported via `MONGODB_URI`; optional import from existing Atlas DB for gym_users.

### 5.6 Hosting (from Repo)

- **Backend**: Render (render.yaml) — Node, `npm run build` + `npm run start:prod`, env: MONGODB_URI, JWT_SECRET, JWT_EXPIRES_IN, CORS_ORIGIN.  
- **Frontend**: Vercel (vercel.json) — build from `client`, output `client/dist`, SPA rewrites.  
- **Tenant resolution**: Host header (subdomain or custom domain) → tenant lookup → login without tenant ID in UI when using branded URL.

---

## 6. Security & Scalability Considerations

### 6.1 Security (from implementation)

- **Auth**: JWT (httpOnly not used; token in memory/localStorage), bcrypt for passwords.  
- **Tenant isolation**: All queries filter by `tenantId` from JWT or `X-Tenant-ID`; staff member endpoints validate member belongs to tenant (`assertMemberInTenant`).  
- **Roles**: Route-level guards (RolesGuard + @Roles); MEMBER restricted to own data and Nutrition AI.  
- **Validation**: Whitelist + forbidNonWhitelisted on body; transforms for types.  
- **CORS**: Configurable via `CORS_ORIGIN`.  
- **Secrets**: JWT_SECRET, OPENAI_API_KEY, DB URI from env; no secrets in repo.

**Assumptions / recommendations**: HTTPS in production; consider httpOnly cookies for token; rate limiting and audit logging not present in scanned code — recommend adding for production.

### 6.2 Scalability

- **Stateless API**: Horizontal scaling behind a load balancer.  
- **DB**: Single MongoDB; indexing on tenantId + keys; for very large tenants, consider sharding or read replicas.  
- **AI**: Each analyze/chat call is one OpenAI request; cost and latency scale with usage; no in-repo caching of AI responses.

---

## 7. Pricing Model Suggestions (India-Focused SaaS)

*No pricing logic in code; below are suggestions.*

- **Tiers by member count**:  
  - **Starter**: Up to 50–100 members, 1 branch — ₹999–1,499/month.  
  - **Growth**: 100–300 members or 2 branches — ₹2,499–3,499/month.  
  - **Pro**: 300+ members, multi-branch, priority support — ₹4,999+/month.  

- **Add-ons**:  
  - **Nutrition AI**: Included in Pro; optional add-on for Starter/Growth (e.g. +₹500/month).  
  - **SMS (when implemented)**: Per-SMS or bundle.  
  - **Custom domain**: Higher tier or one-time.  

- **India-specific**: INR pricing; UPI/razorpay/paypal; annual discount (e.g. 2 months free); GST-inclusive options.

---

## 8. Target Customers

- **Primary**: Independent gym owners and small chains (1–5 branches) in India who want an all-in-one, affordable cloud solution.  
- **Secondary**: Fitness studios, PT-run gyms, franchisees needing tenant isolation and branding.  
- **User personas**:  
  - **Gym owner / TENANT_ADMIN**: Full control, finance view, onboarding, enquiries.  
  - **Manager / STAFF**: Daily ops — check-in, members, follow-ups, enquiries.  
  - **Member**: Self-service — Nutrition AI (calorie log + reports), optional future features.

---

## 9. Deployment & Operational Cost Estimate

*Based on repo: Render + Vercel + MongoDB.*

- **Backend (Render)**: Free tier or ~$7–25/month (Web Service).  
- **Frontend (Vercel)**: Free tier for moderate traffic.  
- **MongoDB**: Atlas M0 (free) for early stage; M10+ (~$9+/month) for production.  
- **OpenAI**: Per token (input/output); estimate ₹2–10 per member per month for moderate Nutrition AI usage.  
- **Domain / DNS**: Optional custom domain; subdomain on your app domain is low cost.  
- **Rough total (early stage)**: **$0–30/month** (free tiers + low OpenAI). At scale (e.g. 50 gyms, 5k members): **$100–300/month** (bigger DB, Render, OpenAI).

*Twilio/Cloudinary not implemented; add if adopted.*

---

## 10. Roadmap

### Short-term (0–6 months)

- **Stability**: Harden auth (e.g. httpOnly cookie option), add rate limiting and basic audit log.  
- **Nutrition AI**: Optional model/config (e.g. gpt-4o-mini) and cost controls; cache frequent analyses.  
- **SMS**: Implement Twilio for defaulter/reminder SMS (backend TODO exists).  
- **Payments**: Integrate Indian payment gateway (Razorpay/PhonePe) for gym subscriptions and/or member fees.  
- **Onboarding**: In-app tenant signup flow (trial + payment) instead of only platform-admin-created tenants.  
- **Mobile**: PWA or React Native for staff check-in and member nutrition on phones.

### Long-term (6–18 months)

- **Multi-branch**: Explicit branch/location per tenant; reporting by branch.  
- **App for members**: Dedicated member app (or PWA) with notifications, nutrition reminders, and basic engagement metrics.  
- **Analytics**: Dashboards for retention, revenue, enquiry conversion, nutrition engagement.  
- **Integrations**: WhatsApp Business API for enquiries/follow-ups; accounting (Tally) export.  
- **Localization**: Hindi/regional languages for UI and AI prompts.  
- **Advanced AI**: Meal suggestions, simple workout tips, or integration with wearables (assumptions; not in current code).

---

## Appendix: Repository Summary

- **Main modules**: Auth, Tenants, Members, Attendance, Calories (AI), Enquiries, Follow-ups, Legacy, Platform, Profile-users, Atlas-members, Counters.  
- **API surface**: REST; auth + tenants + members + attendance + calories + enquiries + follow-ups + legacy + platform + profile-users + atlas-members; Swagger at `/api/docs`.  
- **DB models**: Tenant, User, Member, CalorieEntry, NutritionAnalysis, EnquiryMember, EnquiryFollowUp, FollowUp, Counter, ProfileUser.  
- **AI/ML**: OpenAI for calorie chat and full-day nutrition analysis (Indian diet, RDI, deficiencies, suggestions).  
- **Third-party**: OpenAI (used); Twilio, Cloudinary (env only, not implemented).  
- **Deployment**: Render (API), Vercel (frontend), MongoDB (Atlas or self-hosted).  
- **Assumptions**: Pricing, rate limits, audit log, SMS implementation, and payment gateway are not in repo and are suggested or planned.

---

*Document generated from codebase analysis. Implementation details reflect the repository as scanned; any missing or future work is marked as assumption or recommendation.*
