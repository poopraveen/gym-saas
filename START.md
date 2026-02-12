# How to Run Gym SaaS (Step by Step)

## Step 1: Start MongoDB
Make sure MongoDB is running on `localhost:27017`.

## Step 2: Create First User (One-Time Setup)
Open a terminal:

```bash
cd gym-saas
npm run seed
```

**Copy the Tenant ID** from the output (e.g. `674a1b2c3d4e5f6789abcdef`). You need it for login.

## Step 3: Start the Backend API
Open **Terminal 1**:

```bash
cd gym-saas
npm start
```

Wait until you see: `Application is running on: http://localhost:3000/api`

## Step 4: Start the Frontend UI
Open **Terminal 2** (new terminal):

```bash
cd gym-saas\client
npm install
npm run dev
```

Wait until you see: `Local: http://localhost:5173/`

## Step 5: Open the App
In your browser, go to: **http://localhost:5173**

## Step 6: Login
- **Tenant ID**: paste the ID from Step 2
- **Email**: `admin@repsanddips.com`
- **Password**: `Admin123!`

---

**Both servers must be running at the same time** (backend on 3000, frontend on 5173).

## Optional: Medical document uploads (Cloudinary)

To allow members to upload medical documents/photos, add this to the **project root** `.env` (same folder as `package.json`):

```
CLOUDINARY_URL=cloudinary://YOUR_API_KEY:YOUR_API_SECRET@YOUR_CLOUD_NAME
```

Then **restart the backend server**. Without this, the app will show "File storage is not configured" when uploading.
