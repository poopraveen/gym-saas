# Load Gym Members from MongoDB Atlas

Fetches all documents from the `gym_users` collection in MongoDB Atlas.

## Setup

1. **Environment variable** – Add to `.env` (never commit credentials):

```bash
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/rpesanddips?retryWrites=true&w=majority
```

- Replace `<user>`, `<password>`, and `<cluster>` with your Atlas credentials.
- Include the database name in the path (e.g. `/rpesanddips`).
- MongoDB Atlas uses TLS by default for `mongodb+srv`.

2. **Optional** – Use `MONGODB_URI` instead of `MONGO_URI` if you prefer.

## API

### GET /api/members

**Auth**: Bearer token + X-Tenant-ID (same as other protected routes).

**Response**:

```json
{
  "success": true,
  "count": 42,
  "data": [
    {
      "_id": "...",
      "Reg No:": 1,
      "NAME": "John",
      "Gender": "Male",
      "Date of Joining": "2022-11-08T18:29:50.000Z",
      "Phone Number": 7448793957,
      "DUE DATE": 1720031400000,
      "Fees Amount": 1000,
      ...
    }
  ]
}
```

**Error** (502):

```json
{
  "success": false,
  "count": 0,
  "data": [],
  "error": "MONGO_URI or MONGODB_URI must be set in environment"
}
```

## Example

```bash
# Login first to get token
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: <tenant-id>" \
  -d '{"email":"admin@repsanddips.com","password":"Admin123!"}'

# Fetch members
curl http://localhost:3000/api/members \
  -H "Authorization: Bearer <token>" \
  -H "X-Tenant-ID: <tenant-id>"
```

## Import into app members

To move Atlas `gym_users` into the app’s `members` collection:

```bash
# 1. Export from Atlas (optional)
mongoexport --uri="mongodb+srv://user:pass@cluster.mongodb.net/rpesanddips" \
  --collection="gym_users" --out="gym_users.json"

# 2. Import into app
npm run import:gym-users gym_users.json <TENANT_ID>

# Or import directly from Atlas after mongoimport
npm run import:gym-users -- --from-db rpesanddips --from-collection gym_users <TENANT_ID>
```
