# Deploying ProctorGuard AI to a public HTTPS URL

## What this project is (for deployment)

| | |
|---|---|
| Frontend | React 19 + TypeScript, built by **Vite** into `dist/` (entry: `src/main.tsx`, `index.html`) |
| Backend | **Node.js + Express 5**, run with `tsx` (entry: `server/index.ts`) |
| Database | SQLite via Node’s built-in `node:sqlite` (file `data/proctor.db`, auto-created and auto-seeded) |
| AI models | Served as static files from `public/` (MediaPipe WASM + models, face-api weights) — run in the visitor’s browser |
| Production mode | `npm run build` then `npm start`: **one Node process serves the website, the API and the models on one port** (`PORT`) |
| Node version | 22.13 or newer (tested on 24) |

Camera access in browsers only works on **HTTPS** (or `localhost`), so a public HTTPS URL is required for phones and
other laptops. Both options below give you HTTPS automatically.

---

## Option A — Permanent URL on Render (recommended, free)

Works even when your laptop is off. Takes about 15 minutes the first time.

### 1. Put the code on GitHub

1. Go to **https://github.com/signup** and create an account (skip if you have one).
2. Top-right of GitHub, click the **+** icon → **New repository**.
3. Repository name: `proctorguard-ai`. Choose **Private** (or Public). **Do not** tick “Add a README”. Click **Create repository**.
4. In a terminal in the project folder (`same karhana`), run (replace `YOUR-USERNAME`):

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/proctorguard-ai.git
   ```

   ```bash
   git push -u origin main
   ```

   A browser window will ask you to sign in to GitHub the first time — click **Sign in with your browser** → **Authorize**.

### 2. Deploy on Render

1. Go to **https://dashboard.render.com/register** → click **GitHub** to sign up with your GitHub account → authorise.
2. In the Render dashboard click **+ New** (top right) → **Blueprint**.
3. Under *Connect a repository*, click **Configure account / GitHub**, give Render access to `proctorguard-ai`, then click **Connect** next to it.
4. Render reads `render.yaml` from the repo. Blueprint name: `proctorguard-ai` → click **Deploy Blueprint** (or **Apply**).
5. Wait for the build (3–6 min). The log ends with `ProctorGuard listening on port 10000 (serving built frontend)` and the status turns **Live**.
6. Your public URL is shown at the top of the service page, e.g. **`https://proctorguard-ai.onrender.com`** (Render may add a suffix like `-x7k2` if the name is taken).

If you prefer not to use the Blueprint: **+ New → Web Service** → pick the repo → set
*Language* `Node`, *Build Command* `npm ci --include=dev && npm run build`, *Start Command* `npm start`,
*Instance Type* **Free**, add environment variable `NODE_VERSION` = `24` → **Deploy Web Service**.

### Things to know about the free plan

- It **sleeps after 15 minutes without visitors**; the next visit takes ~50 seconds to wake up. **Open the URL 2–3 minutes before your demo.**
- The SQLite database is reset when the service restarts or redeploys. Demo accounts and the 16 sample students are
  re-created automatically; students you registered yourself would need to register again.
- To update after code changes: `git add -A`, `git commit -m "update"`, `git push` — Render redeploys automatically.

---

## Option B — Instant public URL from your laptop (Cloudflare quick tunnel)

No account needed, ready in 2 minutes, but it only works **while your laptop is on and these two windows stay open**,
and the URL changes every time you restart the tunnel.

1. Install Cloudflare’s tunnel tool once (PowerShell):

   ```powershell
   winget install --id Cloudflare.cloudflared
   ```

   Close and reopen the terminal afterwards.
2. Terminal 1 — build and start the production server on port 5000 (PowerShell):

   ```powershell
   npm run build; $env:PORT=5000; npm start
   ```

3. Terminal 2 — open the tunnel:

   ```powershell
   cloudflared tunnel --url http://localhost:5000
   ```

4. It prints a line like `https://random-words-1234.trycloudflare.com` — that is your public HTTPS URL.

---

## Testing from your phone on mobile data

1. On the phone, **turn Wi-Fi off** and turn **mobile data on** (so you are definitely not on the laptop’s network).
2. Open **Chrome** (Android) or **Safari** (iPhone) and type the public `https://…` URL.
3. Student test: tap **Fill in** on the demo account → **Secure Login**. When asked, tap **Allow** for the camera.
   Complete face registration → guidelines → system check → **Start exam**. Use the Demo control panel
   (scroll down on the exam page) to trigger *Simulate Phone Detection*.
4. Examiner test (another device or a second browser tab): open `https://…/examiner/login` → **Fill in** →
   **Open dashboard**. The student’s session and alerts appear within a few seconds.
5. If the camera was blocked by mistake: Android Chrome → tap the icon left of the address → **Permissions** →
   **Camera → Allow**. iPhone → **Settings → Safari → Camera → Allow**, then reload.

| Account | Credentials |
|---|---|
| Demo student | `STU1001` / `Demo@123`, exam code `CN-2026` |
| Examiner | `examiner` / `Examiner@123` |

Tip: a submitted student can retake via **Start a new demo attempt**; each device/tab keeps its own login.

## Giving the project to your friend

- **Link only:** send the public URL — nothing to install.
- **Source code:** on GitHub open the repo → **Settings → Collaborators → Add people** → enter your friend’s GitHub
  username. They run `git clone …`, `npm install`, `npm run dev` (needs Node 22.13+).
