# Setup on a Windows laptop (step by step)

## 1. Install Node.js (one time)

1. Go to **https://nodejs.org** and download the **LTS** version (24.x; anything **22.13 or newer** works).
2. Run the installer with the default options.
3. Open a new **PowerShell** window and check:

   ```powershell
   node -v
   ```

   It must print `v22.13.0` or higher (e.g. `v24.x.x`).

Optional: install **VS Code** from https://code.visualstudio.com.

## 2. Unzip the project

1. Right-click `proctorguard-ai.zip` → **Extract All…** → choose e.g. `C:\Projects` → **Extract**.
2. You now have the folder **`C:\Projects\proctorguard-ai`** — it contains `package.json`, `src`, `server`, `shared`, `public`.
3. **This is the folder to open in VS Code:** VS Code → **File → Open Folder…** → select `proctorguard-ai`.

> Tip: avoid extracting into a OneDrive-synced folder if installs are slow; `C:\Projects` is ideal.

## 3. Install dependencies (one time, needs internet, ~1–3 min)

In VS Code open **Terminal → New Terminal** (it opens in the project folder), then:

```powershell
npm install
```

This downloads `node_modules` and copies the AI model runtime files into `public\`.
Warnings about “allow-scripts” are harmless.

## 4. Run the project on port 5000 (presentation mode)

```powershell
npm run demo
```

This builds the app and starts **one server on http://localhost:5000** (website + API + AI models).
Wait for: `ProctorGuard listening on port 5000 (serving built frontend)` — then open **http://localhost:5000**.

Next time (no code changes) you can skip the build and start faster with:

```powershell
npm run start:5000
```

Stop the server with **Ctrl + C**.

## 5. Development mode (only if you edit code)

```powershell
npm run dev
```

Opens http://localhost:5173 with live reload (API runs on port 4000 behind it).

## 6. Logins

| Who | Login |
|---|---|
| Demo student | `STU1001` / `Demo@123`, exam code `CN-2026` |
| Examiner | `examiner` / `Examiner@123` |
| Sample students | e.g. `STU1021` / `Student@123` |

Use two browser tabs (student + examiner). The camera works on `http://localhost` — allow it when Chrome/Edge asks.

## 7. Database & sample data

- The SQLite database `data\proctor.db` is **created automatically** on first start with 4 exams and 16 sample
  students (live + completed sessions). Schema: `server\db.ts`; sample data: `server\seed.ts`, `server\data\exams.ts`.
- Reset everything to fresh demo data:

  ```powershell
  npm run seed
  ```

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `npm` is not recognised | Reinstall Node.js, then open a **new** terminal |
| `node:sqlite` / `No such built-in module` error | Node is too old — install Node 22.13+ (24 LTS recommended) |
| `EADDRINUSE: port 5000` | Something else uses port 5000. Close it, or run `npx tsx server/index.ts --port 5050` and open http://localhost:5050 |
| PowerShell says “running scripts is disabled” | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use **Command Prompt** instead |
| Camera not working | Use `http://localhost:5000` (not the IP address); click the camera icon in the address bar → Allow; close Zoom/Teams |
| Models show “Unavailable” | Run `npm install` again (it copies model files); the two MediaPipe models are in `public\models` |

To share with phones/other laptops over the internet, see **DEPLOY.md** (Render or Cloudflare tunnel).
