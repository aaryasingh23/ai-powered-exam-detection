# ProctorGuard AI — AI-Powered Online Exam Proctoring & Cheating Detection System

A complete web application that monitors students during an online exam with in-browser computer vision, turns
detections into explainable **flags + risk score + evidence timeline**, and gives examiners a live telemetry dashboard to
review them. **The system never declares a student guilty** — a human examiner makes every decision.

---

## 1. Project overview

| Side | What it does |
|---|---|
| **Student** | Secure login with exam code → face registration (first time) → identity verification → guidelines & consent → camera / mic / model check → timed MCQ exam with continuous AI proctoring → submission |
| **Examiner** | Live Telemetry Analytics dashboard, live monitoring grid, students, alerts, risk analytics, per-student detail (live preview, timeline, evidence, review actions), printable reports, configurable settings |
| **Docs** | `/docs` — Project & Team Documentation page with abstract, architecture diagram, AI components, stack, team |

## 2. Features

- Student Secure Login Portal (Student ID, password, exam code, forgot password, registration)
- Face capture with live guidance (no face / multiple faces / too far / off-centre / too dark / look straight)
- Identity verification with confidence (“Identity verification completed”)
- Student Examination Guidelines with consent checkbox and privacy notice
- Camera + microphone permission check and AI model status
- **AI Exam Proctor Guard** exam page: question, timer, palette, mark for review, autosave, large camera panel, live
  status, red-border warning with live duration, risk gauge with “why this score”
- Detection of: prolonged / repeated look-away (left, right, up, down), excessive head movement, mobile phone, book /
  notes, multiple faces, face missing, identity mismatch, blocked / unavailable camera
- Debouncing: thresholds, hysteresis and cooldowns — a momentary glance never becomes an alert
- Transparent, configurable, **decaying** risk score (Low / Medium / High / Critical)
- **Demo Mode** control panel — every simulated event is labelled `DEMO / SIMULATED`
- Examiner: live table, filters, search, alerts with severity (INFO → CRITICAL), toast notifications, risk-over-time
  charts, timeline with confidence & risk contribution, evidence snapshots, **Mark reviewed / False positive / Notes**,
  session review status, final report (print / PDF, CSV, JSON)
- 16 seeded students across low / medium / high / critical risk, with a server simulator keeping 12 of them “live”
- Friendly handling of: camera denied, no camera, camera in use, network loss (queued + retried), model load failure,
  face not detected, multiple faces, exam timeout (auto-submit), invalid login, invalid exam code, session expired

## 3. Architecture

```
Student → Login → Face Registration → Exam Interface → Camera
                                                         ↓
                         AI Proctoring Engine (runs in the browser)
                         ├── Face Detection          MediaPipe Face Landmarker
                         ├── Face Verification       face-api.js 128-d embedding
                         ├── Gaze / Head Pose        landmark geometry + blendshapes
                         ├── Object Detection        MediaPipe EfficientDet-Lite0 (COCO) | YOLO adapter
                         ├── Multiple Face Detection face count + person count
                         └── Camera Monitoring       brightness / contrast heuristics
                                                         ↓  debounced events (TelemetryClient, queued + retried)
                         Risk Scoring Engine (shared/risk-engine.ts — same code in browser & server)
                                                         ↓
                         Live Telemetry (Express + SQLite) → Examiner Dashboard → Human Review → Final Report
```

### Project structure

```
shared/                 types.ts, risk-engine.ts            ← used by client AND server
server/                 index.ts, db.ts, auth.ts, repo.ts, seed.ts, simulator.ts, frames.ts
  routes/               auth.ts, student.ts, examiner.ts
  data/exams.ts         question bank (answer keys never leave the server)
src/
  lib/                  api client, polling hook, formatting
  components/           UI kit, error boundary, 404
  modules/
    auth/               login portal, registration, examiner login, store, route guards
    face-verification/  FaceVerificationService (face-api | demo adapter), IdentityPage
    gaze-detection/     GazeDetectionService (MediaPipe), headPose.ts
    object-detection/   ObjectDetectionService (MediaPipe | YOLO HTTP adapter)
    proctoring/         ProctoringEngine, camera, frame heuristics, panels, session hook
    risk-engine/        gauge + breakdown widgets
    telemetry/          TelemetryClient (student), examinerApi (dashboard)
    exam/               guidelines, system check, ExamPage (AI Exam Proctor Guard), submitted
    dashboard/          examiner layout + Dashboard, Live, Students, Detail, Alerts, Analytics, Settings
    reports/            reports list, printable report
    docs/               documentation page, projectInfo.ts (edit team names here)
yolo-service/           optional YOLOv8 FastAPI service
```

## 4. Tech stack

React 19 · TypeScript · Vite · Tailwind CSS 4 · React Router · Zustand · Recharts · Lucide React ·
MediaPipe Tasks Vision · @vladmandic/face-api (TensorFlow.js) · Node.js + Express 5 · SQLite (`node:sqlite`) ·
optional Python + Ultralytics YOLOv8.

## 5. Installation

Requirements: **Node.js 22.13 or newer** (uses the built-in `node:sqlite`; tested on Node 24), a modern Chromium /
Firefox browser, and a webcam for the real-AI demo.

```bash
npm install
```

`npm install` also copies the MediaPipe WASM runtime and face-api model weights into `public/`.
The two MediaPipe model files (`face_landmarker.task`, `efficientdet_lite0.tflite`) are in `public/models/`; if they
are missing run `npm run models:fetch` (otherwise the app downloads them from Google’s CDN at runtime).

## 6. Environment variables

Copy `.env.example` to `.env` (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `API_PORT` | `4000` | Express API port (Vite proxies `/api` to it) |
| `SESSION_TTL_MINUTES` | `180` | Login token lifetime |
| `DEMO_SIMULATOR` | `true` | Keep seeded demo sessions generating simulated activity |
| `DB_FILE` | `data/proctor.db` | SQLite file |
| `VITE_YOLO_ENDPOINT` | *(empty)* | URL of the optional YOLO service; switches object detection to the YOLO adapter |

## 7. Running locally

```bash
npm run dev
```

Opens the API on http://localhost:4000 and the app on **http://localhost:5173**.

| Account | Credentials |
|---|---|
| Demo student | `STU1001` / `Demo@123`, exam code `CN-2026` |
| Seeded students | e.g. `STU1021` / `Student@123` (codes `PHY-2026`, `MATH-2026`, `DSA-2026`, `CN-2026`) |
| Examiner | `examiner` / `Examiner@123` |

Other scripts: `npm run seed` (wipe & reseed the database), `npm run build` (type-check + production build),
`npm start` (serve API + built app on port 4000).

> Use **two browser windows/tabs**: one for the student, one for the examiner. Logins are kept per tab
> (`sessionStorage`), so they don’t interfere.

## 8. Demo Mode & presentation script

The exam page has a **Presenter view** (toggle icon in the header, on by default) with the **Demo control panel**:
Simulate Look Away · Phone Detection · Book Detection · Multiple Faces · Identity Mismatch · Face Missing ·
Paper / Notes · Camera Blocked · **Reset Risk** · Recalibrate gaze.

Simulations inject fake *observations* into the real pipeline, so they pass through the same thresholds, red warning,
risk scoring, telemetry and dashboard as real detections — and every resulting event is stored with
`simulated = true` and shown as **DEMO / SIMULATED**.

Suggested 20-step demo:
1. Open http://localhost:5173 → Student Secure Login Portal
2. Click **Fill in** on the demo account → **Secure Login**
3. Face registration (look at the camera; it auto-captures)
4. “Identity verification completed” → Continue
5. Read guidelines, tick both boxes → Continue to Exam
6. Camera / mic / model check → **Start exam**
7. Camera turns on, overlays show the face box
8. “● AI Proctoring Active”
9. Click **Simulate Look Away** (or really look away for 3 s)
10. Red camera border + “⚠ SUSPICIOUS ACTIVITY — Prolonged look-away — Duration 3.4 sec”
11. Risk score increases (+5) with the reason listed
12. Click **Simulate Phone Detection** (or hold up a real phone)
13. In a second tab log in as examiner → toast + Live alerts receive the flag
14. Click the student row → Student Proctoring Detail
15. Event timeline with confidence and risk contribution
16. Risk-over-time graph
17. **Mark reviewed** / **False positive** on an event, add a note
18. Back in the student tab → **Submit Exam**
19. Examiner → **Generate report** → Print / Save as PDF
20. Open **/docs** for the project documentation

## 9. AI architecture — what is real, what runs in the browser, what is simulated

| Capability | Implementation | Status |
|---|---|---|
| Face detection & count | MediaPipe Face Landmarker, WASM/WebGL, ~10 fps | **Real, in browser** |
| Head pose & gaze | yaw/pitch from landmarks + eye blendshapes, per-student calibration | **Real, in browser** |
| Look-away / repeated look-away | direction away > 2.5 s; ≥3 in 3 min escalates | **Real, in browser** |
| Excessive head movement | yaw std-dev over 10 s | **Real, in browser** |
| Phone / book detection | MediaPipe Object Detector, EfficientDet-Lite0 (COCO), 2 Hz, 2-of-3 vote | **Real, in browser** |
| Multiple people | face count ≥ 2 or COCO person count ≥ 2 | **Real, in browser** |
| Identity verification | face-api.js 128-d embedding, distance → confidence, 3 of last 5 must fail | **Real, in browser** |
| Camera blocked / dark | luminance + contrast of a 32×24 thumbnail; track `ended` | **Real heuristic** |
| Loose paper / handwritten notes | not a COCO class | **Needs custom YOLO model** (yolo-service) — otherwise demo only |
| YOLOv8 | `yolo-service/server.py` + `VITE_YOLO_ENDPOINT` | **Optional; reference code, not exercised in the default setup** |
| Demo panel events | simulated observations | **Simulated, always labelled** |
| Seeded students’ activity | server simulator (`server/simulator.ts`) | **Simulated, always labelled** |

If a model cannot load, its checks pause, a timeline entry records it and the UI shows “Unavailable” / “Demo adapter”.
If face-api cannot load, identity uses `DemoFaceAdapter`, which does **not** compare faces and labels its confidence as demo.

## 10. Risk scoring

Default weights: look-away +5, repeated look-away +10, phone +20, book +15, paper +15, multiple faces +25, face missing
+10, identity mismatch +30, camera issue +5, head movement +5. Bands: 0–19 Low, 20–49 Medium, 50–74 High, 75–100
Critical / review required. While a condition is ongoing its weight stays; 60 s after it clears it halves every 4 min.
False positives are excluded. All values are editable in **Settings**.

## 11. Database schema (SQLite)

- `students(id, student_id, name, email, password_hash, exam_id, face_reference JSON, face_model, verification_status, seeded, created_at)`
- `examiners(id, username, name, password_hash)`
- `auth_tokens(token, user_id, role, exam_id, created_at, expires_at)`
- `exams(id, code, name, subject, duration_minutes, start_time, end_time, questions JSON)`
- `sessions(id, student_id, exam_id, start_time, end_time, status, review_status, examiner_notes, final_risk, risk_reset_at, answers JSON, exam_score, live_status JSON, last_heartbeat, simulated, sim_profile)`
- `events(id, session_id, client_id, timestamp, ended_at, event_type, severity, label, confidence, risk_contribution, details JSON, simulated, source, evidence, review_status, examiner_note, reviewed_at)`
- `settings(key, value JSON)` — risk configuration
- `password_reset_requests(id, student_id, created_at, status)`

Event types: `LOOK_AWAY, PHONE_DETECTED, BOOK_DETECTED, PAPER_DETECTED, MULTIPLE_FACES, FACE_MISSING, IDENTITY_MISMATCH, CAMERA_ISSUE, HEAD_MOVEMENT, NORMAL`.

## 12. API documentation

All responses are JSON; errors are `{ "error": { "code", "message" } }`. Authenticated routes need `Authorization: Bearer <token>`.

| Method & path | Role | Description |
|---|---|---|
| `POST /api/auth/register` | – | Create student account |
| `POST /api/auth/login` | – | `{studentId, password, examCode}` → token, student, exam |
| `POST /api/auth/examiner/login` | – | `{username, password}` → token |
| `POST /api/auth/forgot-password` | – | Log a reset request (generic response) |
| `GET /api/auth/me`, `POST /api/auth/logout` | any | Current user / revoke token |
| `GET, PUT /api/auth/face-reference` | student | Read / store the face embedding |
| `POST /api/auth/identity-verified` | student | Record pre-exam verification result |
| `GET /api/student/exam`, `GET /api/student/config` | student | Exam (no answer keys), risk config |
| `GET /api/student/session`, `POST /api/student/session/start` | student | Current session / start or resume |
| `POST /api/student/session/:id/events` | student | Batch `{events, ends}` ingest → updated risk |
| `POST /api/student/session/:id/heartbeat` | student | Live status + optional preview frame |
| `PUT /api/student/session/:id/answers` | student | Autosave |
| `POST /api/student/session/:id/submit` | student | Submit (`reason: submitted | timeout`) |
| `POST /api/student/session/:id/reset-risk` | student | Demo: restart risk from 0 |
| `GET /api/examiner/overview` | examiner | Totals, sessions, alerts, fleet trend |
| `GET /api/examiner/sessions?risk=&status=&q=` | examiner | Filtered session list |
| `GET, PATCH /api/examiner/sessions/:id` | examiner | Detail / review status & notes |
| `GET /api/examiner/sessions/:id/frame` | examiner | Latest live preview frame |
| `GET /api/examiner/sessions/:id/report` | examiner | Report data |
| `PATCH /api/examiner/events/:id` | examiner | `reviewStatus` (REVIEWED / FALSE_POSITIVE / PENDING), `examinerNote` |
| `GET /api/examiner/alerts?severity=&status=` | examiner | Alerts feed |
| `GET /api/examiner/analytics`, `GET /api/examiner/students` | examiner | Aggregates, registry |
| `GET, PUT /api/examiner/settings`, `POST /api/examiner/settings/reset` | examiner | Risk configuration |
| `GET /api/examiner/reset-requests`, `PATCH /api/examiner/reset-requests/:id` | examiner | Password reset queue |
| `POST /api/examiner/demo/refresh` | examiner | Regenerate seeded demo sessions |

## 13. Privacy considerations — what is actually stored

| Data | Stored? |
|---|---|
| Video / audio | **Never stored.** AI runs on the student’s device; audio only drives a local level meter |
| Face registration | A 128-number embedding (no photo) in `students.face_reference` |
| Evidence | One 240 px JPEG per HIGH / CRITICAL event (toggle in Settings) |
| Live preview | Low-res JPEG every 3 s, **in server memory only**, dropped at submission (toggle in Settings) |
| Personal data | Student ID, name, email, scrypt password hash |
| Logins | Random bearer token in `sessionStorage`, expires after 3 h |

Consent is collected at registration and on the guidelines page. Students see basic proctoring status, not the detailed
detector output.

## 14. Limitations

- Head-pose angles are geometric approximations, not calibrated 3-D pose; glasses, poor lighting and extreme camera
  angles reduce accuracy. Per-student calibration happens in the first ~2 s of the exam.
- COCO-trained detectors can miss phones held edge-on and can mistake a tablet / notebook for a book.
- face-api embeddings are not liveness-aware (a photo could fool them); there is no anti-spoofing.
- Accuracy and bias have not been formally evaluated across demographics — flags must be reviewed by humans.
- The live preview is a periodic snapshot, not a video stream.
- SQLite and in-memory frames suit a single-server demo, not large deployments.
- The YOLO service is reference code and is not part of the default tested setup.

## 15. Future improvements

Custom YOLOv8 model (paper, earphones, smart watch) · audio speech detection with consent · tab-switch & full-screen
detection · WebRTC live video · liveness detection · fairness evaluation · LMS integration · PostgreSQL deployment.

## 16. Team

Edit `src/modules/docs/projectInfo.ts` to put your team members, guide and institution on the documentation page.
