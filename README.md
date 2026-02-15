# Gym SaaS - Multi-tenant Gym Management

A unified NestJS multi-tenant SaaS with tenant isolation and RBAC, combining the original gym_server_project and RepsandDips projects.

## Architecture

- **Multi-tenant**: All data isolated by `tenant_id`
- **RBAC**: `SUPER_ADMIN`, `TENANT_ADMIN`, `MANAGER`, `STAFF`, `MEMBER`
- **Modular**: Auth, Tenants, Members, Attendance, Profile Users, Legacy API

## Project Structure

```
gym-saas/
├── src/
│   ├── auth/           # JWT auth, users, roles
│   ├── tenants/        # Tenant management
│   ├── members/        # Gym members (tenant-scoped)
│   ├── attendance/     # Check-in
│   ├── profile-users/  # Neelam-style profile users
│   ├── legacy/         # Backward-compatible API
│   └── common/         # Guards, decorators, roles
├── client/             # React frontend (Vite)
└── package.json
```

## Setup

### 1. Backend

```bash
cd gym-saas
cp .env.example .env
# Edit .env - set MONGODB_URI, JWT_SECRET

npm install
npm run build
npm run start:dev
```

### 2. Seed (first run)

```bash
npm run build
npx ts-node src/scripts/seed.ts
```

This creates:
- Tenant: "Reps & Dips" (slug: reps-and-dips)
- User: admin@repsanddips.com / Admin123!

**Important**: Copy the printed Tenant ID for login.

### 3. Frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173. Login with:
- **Tenant ID**: (from seed output)
- **Email**: admin@repsanddips.com
- **Password**: Admin123!

## API

Base URL: `http://localhost:3000/api`

### Auth (no JWT required)

| Method | Path | Headers | Body |
|--------|------|---------|------|
| POST | /auth/login | X-Tenant-ID | { email, password } |
| POST | /auth/register | X-Tenant-ID | { email, password, name, role? } |

### Protected (Bearer token + X-Tenant-ID)

| Method | Path | Description |
|--------|------|-------------|
| GET | /legacy/list | Member list |
| POST | /legacy | Upsert/delete member |
| GET | /legacy/checkinlist | Check-in list |
| POST | /legacy/checkin | Check-in |
| GET | /legacy/backup | Defaulters list |

Swagger docs: http://localhost:3000/api/docs

## Migrating Existing Data

### From gym_users.json (mongoimport or direct import)

**Option A – Import from JSON file directly (recommended)**

```bash
npm run seed
npm run import:gym-users gym_users.json <YOUR_TENANT_ID>
```

**Option B – Use mongoimport first, then migrate from MongoDB**

```bash
mongoimport --db="rpesanddips" --collection="gym_users" --file="gym_users.json"
npm run seed
npm run import:gym-users -- --from-db rpesanddips --from-collection gym_users <YOUR_TENANT_ID>
```

### From gym_server_project (MongoDB)

Your existing MongoDB (`Gym_user`, `user_list`) uses different schemas. Options:

1. **Fresh start**: Use the new API and add members via the UI.
2. **Migration script**: Write a script to map `Gym_user` → `Member` and add `tenantId` to each document, then insert into the `members` collection.

### From RepsandDips (JSON files)

The JSON files (`file.json`, `attendance.json`) are not MongoDB. You’d need a one-time import script that:
- Reads the JSON
- Uses the Members API (or direct DB insert) with a `tenantId` to load members.

## Roles

| Role | Scope |
|------|-------|
| SUPER_ADMIN | Platform-level, manages tenants |
| TENANT_ADMIN | Full access within a tenant |
| MANAGER | Members, attendance |
| STAFF | Check-in, limited access |
| MEMBER | Self-service only |

## If the API fails with "EADDRINUSE: address already in use :::3000"

Port 3000 is already in use (often a previous API instance). Free it and restart:

```bash
npm run free-port
npm run start:dev
```

Or stop the other process (e.g. Ctrl+C in the terminal where the API is running).

## Test Telegram webhook locally (ngrok)

Telegram can only send webhooks to a public HTTPS URL. To test from your machine:

1. **Terminal 1 – start the tunnel**
   ```bash
   npm run tunnel
   ```
   This runs `ngrok http 3000`. Leave it running. (If your API uses another port, run `ngrok http <port>` instead.)

2. **Terminal 2 – start the API with the tunnel URL**
   ```bash
   npm run dev:telegram
   ```
   This reads the ngrok URL from ngrok’s local API and starts the backend with `PUBLIC_API_URL` set to that URL.

3. Open the app (e.g. http://localhost:5173), go to **Telegram**, click **Re-register webhook**, then message your bot (e.g. `/start` in private chat). Click **Refresh attempts** to see the attempt.

## Environment

See `.env.example` for variables. Never commit real secrets.
