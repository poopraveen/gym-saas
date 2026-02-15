# Push Notifications – What You Need

This doc lists everything required to implement and run web push notifications in the Gym SaaS PWA.

---

## Quick setup: fix "Server has not configured push (VAPID keys)"

1. **Generate keys** (from project root, where `web-push` is installed):
   ```bash
   node -e "const w=require('web-push'); const k=w.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY='+k.publicKey); console.log('VAPID_PRIVATE_KEY='+k.privateKey);"
   ```
2. **Local:** Add the two output lines to your `.env` (do not commit `.env`).
3. **Production (Render):** In your Render service → **Environment** → add:
   - `VAPID_PUBLIC_KEY` = the public key from step 1  
   - `VAPID_PRIVATE_KEY` = the private key from step 1  
   Save and redeploy if the service was already running.
4. Reload the app; the push settings section will show as configured and you can enable notifications.

---

## 1. Overview

- **Web Push** lets the backend send notifications to the user’s device even when the app tab is closed.
- Flow: **Backend** (NestJS) sends a payload to a **push service** (browser-specific); the **browser** delivers it to the **service worker**; the **SW** shows a **notification**.
- You need: **VAPID keys**, a **subscription store**, **backend send logic**, **frontend subscribe + permission**, and a **SW push listener**.

---

## 2. Backend (NestJS)

### 2.1 Dependencies

- **`web-push`** – send push messages using VAPID.

```bash
npm install web-push
```

### 2.2 Environment

Generate VAPID keys once (e.g. with `node -e "const w=require('web-push'); console.log(JSON.stringify(w.generateVAPIDKeys()))"`) and set:

- `VAPID_PUBLIC_KEY` – public key (exposed to frontend).
- `VAPID_PRIVATE_KEY` – private key (server only, never expose).

### 2.3 Data model

- **Push subscription** per user per device:
  - `tenantId`, `userId`
  - `subscription` (object: `endpoint`, `keys.p256dh`, `keys.auth`)
  - Optional: `userAgent` / `endpoint` for dedupe.

Store in MongoDB (e.g. collection `push_subscriptions`).

### 2.4 API

- **GET** `/notifications/vapid-public-key`  
  - Returns `{ publicKey: string }` for the frontend to call `pushManager.subscribe({ applicationServerKey })`.

- **POST** `/notifications/push-subscription`  
  - Body: `{ subscription: PushSubscriptionJSON }`.  
  - Saves/updates subscription for current user + tenant.

- **DELETE** `/notifications/push-subscription`  
  - Removes subscription for current user (e.g. “Disable notifications”).

### 2.5 Sending a push

- In your business logic (e.g. new enquiry, renewal reminder), call something like:
  - `notificationsService.sendPushToUser(tenantId, userId, { title, body, url? })`.
- Use **web-push**: `webPush.sendNotification(subscription, JSON.stringify(payload), options)`.
- Handle expired/invalid subscriptions (remove from DB on 410/404).

---

## 3. Frontend (React / Vite)

### 3.1 Permission

- Call `Notification.requestPermission()` (e.g. after user clicks “Enable notifications”).
- If `granted`, continue; if `denied`, don’t show the enable button again or show “Blocked – enable in browser settings”.

### 3.2 Subscribe

- Wait for **service worker** ready: `navigator.serviceWorker.ready`.
- Get **VAPID public key** from your API (e.g. GET `/notifications/vapid-public-key`).
- Convert base64 public key to `Uint8Array` for `applicationServerKey`.
- Call `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
- Send the returned **subscription** (e.g. `subscription.toJSON()`) to **POST** `/notifications/push-subscription`.

### 3.3 UI

- One place to “Enable notifications” (e.g. Layout footer, Settings, or Dashboard).
- Optional: “Disable notifications” that calls DELETE `/notifications/push-subscription` and optionally unsubscribes locally.

### 3.4 Unsubscribe

- Optional: `subscription.unsubscribe()` then DELETE on backend so the server stops sending to that endpoint.

---

## 4. Service worker (PWA)

- The **service worker** must listen for **`push`** events and show a notification.
- With **vite-plugin-pwa** you have two options:
  - **generateSW** (default): no custom code; you **cannot** add a push listener.
  - **injectManifest**: you provide a **custom SW** (e.g. `src/sw.ts`) and add the push listener there.

So you need to switch to **injectManifest** and in your custom SW:

- Use Workbox for precache/offline as you do now.
- Add:

```ts
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  const title = data.title || 'Gym SaaS'
  const options = { body: data.body, icon: '/icon.svg', data: { url: data.url || '/' } }
  event.waitUntil(self.registration.showNotification(title, options))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(clients.openWindow(url))
})
```

- Expose **VAPID public key** from backend and use it in the frontend when calling `pushManager.subscribe(...)`.

---

## 5. Checklist (implemented in this repo)

- [x] Backend: Install `web-push`, add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` to env.
- [x] Backend: Push subscription schema + MongoDB collection (`push_subscriptions`).
- [x] Backend: GET vapid-public-key, POST push-subscription, DELETE push-subscription.
- [x] Backend: `sendPushToUser(tenantId, userId, { title, body, url? })`; removes invalid subscriptions on 410/404.
- [x] Frontend: Fetch VAPID public key, request permission, subscribe, send subscription to API; **Push notification** section in Layout drawer.
- [x] PWA: **injectManifest** with custom `src/sw.ts` (precache + **push** + **notificationclick**).
- [ ] **You:** Generate VAPID keys and set in `.env` (see below).
- [ ] HTTPS in production (required for push).
- [ ] Optional: Trigger `sendPushToUser` from your logic (e.g. new enquiry, renewal reminder).

---

## 6. When to send push

Examples:

- New **enquiry** (notify staff).
- **Renewal reminder** (e.g. 3 days before expiry).
- **Absence alert** (e.g. member absent 5+ days – notify staff or member).
- **Telegram** sign-up (e.g. “New member signed up for absence alerts”).

You can reuse your existing notification logic (e.g. in `NotificationsService`) and add a call to `sendPushToUser` (or send to all staff of a tenant) when appropriate.

---

## 7. Generate VAPID keys

From the project root (where `web-push` is installed):

```bash
node -e "const w=require('web-push'); const k=w.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY='+k.publicKey); console.log('VAPID_PRIVATE_KEY='+k.privateKey);"
```

Add the two lines to your `.env` (and to your production env, e.g. Render).
