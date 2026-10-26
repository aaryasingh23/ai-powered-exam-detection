import { ArrowDown, ArrowLeft, BrainCircuit, CheckCircle2, Cpu, Database, FlaskConical, GraduationCap, Layers, Lightbulb, Rocket, ShieldCheck, Target, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_RISK_CONFIG, WEIGHT_LABELS, type WeightKey } from '@shared/risk-engine';
import { Badge, Card, cx, Logo, SimulatedTag } from '../../components/ui';
import { PROJECT_INFO } from './projectInfo';

const SECTIONS = [
  ['abstract', 'Project abstract'],
  ['objective', 'Objective'],
  ['problem', 'Problem statement'],
  ['solution', 'Proposed solution'],
  ['architecture', 'System architecture'],
  ['ai', 'AI / ML components'],
  ['risk', 'Risk scoring'],
  ['stack', 'Technology stack'],
  ['features', 'Features'],
  ['privacy', 'Privacy & data'],
  ['future', 'Future scope'],
  ['team', 'Team & institution'],
] as const;

function Section({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card className="p-6 sm:p-8">
        <h2 className="mb-4 flex items-center gap-3 text-xl font-bold tracking-tight text-slate-900">
          <span className="grid size-9 place-items-center rounded-xl bg-indigo-50 text-indigo-600">{icon}</span>
          {title}
        </h2>
        <div className="space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
      </Card>
    </section>
  );
}

function Node({ children, tone = 'indigo', small }: { children: ReactNode; tone?: 'indigo' | 'violet' | 'dark' | 'green'; small?: boolean }) {
  const tones = {
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-900',
    violet: 'border-violet-200 bg-violet-50 text-violet-900',
    dark: 'border-slate-800 bg-slate-900 text-white',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return <div className={cx('rounded-xl border px-4 text-center font-semibold shadow-sm', small ? 'py-1.5 text-xs' : 'py-2.5 text-sm', tones[tone])}>{children}</div>;
}

const Arrow = () => (
  <div className="flex justify-center py-1 text-slate-300">
    <ArrowDown className="size-4" />
  </div>
);

function ArchitectureDiagram() {
  const top = ['Student', 'Login', 'Face Registration', 'Exam Interface', 'Camera'];
  const engine: [string, string][] = [
    ['Face Detection', 'MediaPipe Face Landmarker'],
    ['Face Verification', 'face-api.js 128-d embedding'],
    ['Gaze / Head Pose', 'Landmark geometry + blendshapes'],
    ['Object Detection', 'EfficientDet-Lite0 (COCO) · YOLO adapter'],
    ['Multiple Face Detection', 'Face count + person count'],
    ['Camera Monitoring', 'Brightness / contrast heuristics'],
  ];
  const bottom = ['Risk Scoring Engine', 'Live Telemetry', 'Examiner Dashboard', 'Human Review', 'Final Report'];
  return (
    <div className="mx-auto max-w-2xl">
      {top.map((t) => (
        <div key={t}>
          <Node>{t}</Node>
          <Arrow />
        </div>
      ))}
      <div className="rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50/40 p-4">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.16em] text-violet-700">AI Proctoring Engine · runs in the browser</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {engine.map(([name, how]) => (
            <div key={name} className="rounded-xl border border-violet-200 bg-white px-3 py-2">
              <p className="text-sm font-semibold text-violet-900">├── {name}</p>
              <p className="text-[11px] text-violet-700/80">{how}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-violet-700">Condition state machines: threshold → hysteresis → cooldown → event</p>
      </div>
      {bottom.map((t, i) => (
        <div key={t}>
          <Arrow />
          <Node tone={i === 0 ? 'dark' : i === 3 ? 'green' : 'indigo'}>{t}</Node>
        </div>
      ))}
    </div>
  );
}

const AI_ROWS: { feature: string; how: string; status: 'real' | 'heuristic' | 'demo' | 'optional' }[] = [
  { feature: 'Face detection & face count', how: 'MediaPipe Face Landmarker (WASM/WebGL), ~10 fps, up to 4 faces', status: 'real' },
  { feature: 'Head pose & gaze direction', how: 'Yaw/pitch from 478 landmarks + eye blendshapes, auto-calibrated per student', status: 'real' },
  { feature: 'Prolonged / repeated look-away', how: 'Direction must stay away for > 2.5 s (configurable); escalates after 3 in 3 min', status: 'real' },
  { feature: 'Excessive head movement', how: 'Standard deviation of yaw over a 10 s window', status: 'real' },
  { feature: 'Mobile phone / book detection', how: 'MediaPipe Object Detector, EfficientDet-Lite0 trained on COCO ("cell phone", "book"), 2 Hz, 2-of-3 frame vote', status: 'real' },
  { feature: 'Multiple people', how: 'Face count ≥ 2 or COCO "person" count ≥ 2 for > 1.5 s', status: 'real' },
  { feature: 'Identity verification', how: 'face-api.js (TensorFlow.js) 128-d face embedding, Euclidean distance → confidence; 3 of last 5 checks must fail', status: 'real' },
  { feature: 'Camera blocked / dark', how: 'Mean luminance + contrast of a 32×24 thumbnail; track "ended" events', status: 'heuristic' },
  { feature: 'Loose paper / handwritten notes', how: 'Not a COCO class — needs a custom-trained YOLO model behind the YOLO HTTP adapter', status: 'optional' },
  { feature: 'YOLOv8 object detection', how: 'Reference FastAPI service in /yolo-service; enabled by VITE_YOLO_ENDPOINT', status: 'optional' },
  { feature: 'Demo control panel events', how: 'Inject simulated observations into the same pipeline; always stored as simulated', status: 'demo' },
  { feature: 'Seeded students & live activity', how: 'Server-side simulator keeps 12 demo sessions in their risk bands', status: 'demo' },
];

const STATUS_BADGE = {
  real: <Badge tone="green">Real · in browser</Badge>,
  heuristic: <Badge tone="sky">Real · heuristic</Badge>,
  optional: <Badge tone="indigo">Optional service</Badge>,
  demo: <SimulatedTag />,
};

export default function DocsPage() {
  return (
    <div className="bg-mesh min-h-full">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2 text-sm">
            <Link to="/login" className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-semibold text-slate-600 hover:bg-slate-100">
              <ArrowLeft className="size-4" /> Student login
            </Link>
            <Link to="/examiner" className="rounded-xl bg-indigo-600 px-3 py-2 font-semibold text-white hover:bg-indigo-700">
              Examiner dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-10 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">Project & Team Documentation</p>
          <h1 className="mx-auto mt-3 max-w-3xl text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{PROJECT_INFO.name}</h1>
          <p className="mt-3 text-slate-500">
            {PROJECT_INFO.department} · {PROJECT_INFO.institution} · {PROJECT_INFO.academicYear}
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <nav className="hidden lg:block">
            <div className="sticky top-24 space-y-0.5">
              {SECTIONS.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="block rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-white hover:text-indigo-700">
                  {label}
                </a>
              ))}
            </div>
          </nav>

          <div className="space-y-6">
            <Section id="abstract" title="Project abstract" icon={<GraduationCap className="size-5" />}>
              <p>
                The rapid shift to online assessment has created a need for exam supervision that is scalable, fair and respectful
                of student privacy. This project presents <b>{PROJECT_INFO.shortName}</b>, an AI-powered online examination
                proctoring system that monitors candidates through their webcam and highlights unusual behaviour for a human
                examiner. The system combines in-browser computer-vision models — MediaPipe Face Landmarker for face presence,
                head pose and gaze estimation, an EfficientDet-Lite0 object detector for mobile phones and books, and a
                TensorFlow.js face-embedding network for identity verification — with lightweight frame heuristics that detect a
                covered or disconnected camera.
              </p>
              <p>
                Raw per-frame predictions are converted into debounced, explainable events using configurable thresholds,
                hysteresis and cooldowns, so that a momentary glance never becomes an alert. Each event carries a timestamp,
                duration, confidence and risk contribution. A transparent risk-scoring engine aggregates these events into a
                0–100 score that decays once suspicious behaviour stops, and maps it to Low, Medium, High and Critical bands. A
                live telemetry dashboard lets examiners monitor all candidates, receive prioritised alerts, inspect timelines and
                evidence, mark events as reviewed or false positive, add notes and export a final proctoring report.
              </p>
              <p>
                Crucially, the system never declares a student guilty: it produces a risk score, flags and an evidence timeline,
                and the examiner makes the final decision. Biometric data is minimised — only a 128-number face embedding is
                stored — and every simulated or demonstration event is explicitly labelled, keeping the system technically honest.
              </p>
            </Section>

            <Section id="objective" title="Project objective" icon={<Target className="size-5" />}>
              <ul className="space-y-2">
                {[
                  'Verify that the registered student is the person taking the exam.',
                  'Continuously monitor face presence, gaze, head movement and the camera feed during the exam.',
                  'Detect unauthorised objects (phone, book/notes) and additional people in the frame.',
                  'Convert detections into a transparent, explainable risk score — not a verdict.',
                  'Give examiners a real-time dashboard, alerting, review workflow and printable reports.',
                  'Protect privacy: run AI on the student’s device and store the minimum data needed.',
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 className="mt-1 size-4 shrink-0 text-emerald-500" /> {t}
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="problem" title="Problem statement" icon={<Lightbulb className="size-5" />}>
              <p>
                Human invigilation does not scale to hundreds of remote candidates, and recorded-video review is slow and
                inconsistent. Many commercial proctoring tools are opaque: they flag students with little explanation, record
                large amounts of video, and sometimes treat an algorithmic score as proof of cheating. Institutions need a system
                that (1) works in an ordinary browser, (2) explains every flag, (3) avoids over-reacting to normal behaviour such as
                a brief glance, and (4) keeps the final decision with a human examiner.
              </p>
            </Section>

            <Section id="solution" title="Proposed solution" icon={<Rocket className="size-5" />}>
              <p>
                A full-stack web platform with a guided student flow — <b>Login → Face registration → Identity verification →
                Guidelines → Camera & microphone check → Exam</b> — and a separate examiner dashboard. While the student answers
                questions, the AI Proctoring Engine analyses webcam frames locally, raises debounced events and streams them to
                the server. The server applies the same risk engine, stores the event timeline in SQLite and serves live telemetry
                to examiners, who review flags and generate the final report.
              </p>
              <p>
                A <b>Demo Mode</b> control panel can inject simulated observations (look-away, phone, book, multiple faces,
                identity mismatch, face missing) into the real pipeline, so the whole flow can be demonstrated without a trained
                custom model or many real students. Simulated events are always labelled <SimulatedTag className="align-middle" />.
              </p>
            </Section>

            <Section id="architecture" title="System architecture" icon={<Layers className="size-5" />}>
              <ArchitectureDiagram />
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ['Browser (student)', 'React UI, camera, MediaPipe + TF.js models, ProctoringEngine, TelemetryClient (queued, retried).'],
                  ['Server (Node + Express)', 'Auth, sessions, event ingest, authoritative risk engine, simulator, reports API.'],
                  ['Database (SQLite)', 'Students, exams, sessions, events, settings. No images except optional evidence thumbnails.'],
                ].map(([t, d]) => (
                  <div key={t} className="rounded-xl bg-slate-50 p-4">
                    <p className="font-semibold text-slate-900">{t}</p>
                    <p className="mt-1 text-sm text-slate-600">{d}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="ai" title="AI / ML components — what is real and what is simulated" icon={<BrainCircuit className="size-5" />}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-3">Capability</th>
                      <th className="py-2 pr-3">How it works</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {AI_ROWS.map((r) => (
                      <tr key={r.feature} className="border-b border-slate-100 align-top">
                        <td className="py-2.5 pr-3 font-medium text-slate-900">{r.feature}</td>
                        <td className="py-2.5 pr-3 text-slate-600">{r.how}</td>
                        <td className="py-2.5">{STATUS_BADGE[r.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-slate-500">
                If a model fails to load (offline, old browser), the matching checks pause, a timeline entry records it, and the UI
                shows the model as “Unavailable” or “Demo adapter” — it never pretends a model is running.
              </p>
            </Section>

            <Section id="risk" title="Risk scoring engine" icon={<Cpu className="size-5" />}>
              <p>Default weights (configurable in Settings):</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(WEIGHT_LABELS) as WeightKey[]).map((k) => (
                  <div key={k} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span>{WEIGHT_LABELS[k]}</span>
                    <b>+{DEFAULT_RISK_CONFIG.weights[k]}</b>
                  </div>
                ))}
              </div>
              <p>
                Bands: <b>0–19 Low</b>, <b>20–49 Medium</b>, <b>50–74 High</b>, <b>75–100 Critical / review required</b>. A flag’s
                contribution stays at full weight while the condition is ongoing; {DEFAULT_RISK_CONFIG.decay.graceSeconds} s after
                it clears, it halves every {DEFAULT_RISK_CONFIG.decay.halfLifeSeconds / 60} minutes. Events marked false positive are
                removed from the score. The same TypeScript module computes the score in the browser and on the server.
              </p>
            </Section>

            <Section id="stack" title="Technology stack" icon={<Database className="size-5" />}>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ['Frontend', 'React 19, TypeScript, Vite, Tailwind CSS 4, React Router, Zustand'],
                  ['Charts & icons', 'Recharts, Lucide React'],
                  ['Computer vision', 'MediaPipe Tasks Vision (Face Landmarker, Object Detector)'],
                  ['Face recognition', '@vladmandic/face-api (TensorFlow.js)'],
                  ['Backend', 'Node.js 22+, Express 5, TypeScript (tsx)'],
                  ['Database', 'SQLite via the built-in node:sqlite module'],
                  ['Auth', 'scrypt password hashing, random bearer tokens with expiry'],
                  ['Optional', 'YOLOv8 (Ultralytics) FastAPI service for custom object classes'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{k}</p>
                    <p className="text-slate-800">{v}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="features" title="Features" icon={<ShieldCheck className="size-5" />}>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  'Secure student login with exam code',
                  'First-time registration and face reference capture',
                  'Guided face positioning with live feedback',
                  'Pre-exam identity verification with confidence',
                  'Guidelines with consent and privacy notice',
                  'Camera, microphone, network and model checks',
                  'Timed MCQ exam with palette, mark-for-review, autosave',
                  'Continuous AI proctoring with red-border warnings',
                  'Debounced events with duration and confidence',
                  'Transparent, decaying risk score with explanation',
                  'Live telemetry dashboard and monitoring grid',
                  'Prioritised alerts with toast notifications',
                  'Student detail: live preview, timeline, evidence',
                  'Mark reviewed / false positive, examiner notes',
                  'Risk analytics charts',
                  'Printable final report, CSV and JSON export',
                  'Configurable weights, thresholds and privacy toggles',
                  'Demo Mode with clearly labelled simulations',
                ].map((f) => (
                  <p key={f} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    {f}
                  </p>
                ))}
              </div>
            </Section>

            <Section id="privacy" title="Privacy & data handling" icon={<ShieldCheck className="size-5" />}>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>AI inference runs in the student’s browser; raw video never leaves the device.</li>
                <li>Identity uses a 128-number embedding — no face photo is stored for registration or verification.</li>
                <li>Evidence: one 240-pixel snapshot is stored only with HIGH / CRITICAL flags (can be disabled).</li>
                <li>Live preview: a low-resolution frame every 3 s, held in server memory only and discarded at submission.</li>
                <li>Audio is used only for a local level meter — it is never recorded or uploaded.</li>
                <li>Only ID, name, email and a hashed password are collected.</li>
              </ul>
            </Section>

            <Section id="future" title="Future scope" icon={<FlaskConical className="size-5" />}>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>Custom-trained YOLOv8 model for paper, earphones and smart watches.</li>
                <li>Audio analysis (speech detection) with explicit consent.</li>
                <li>Tab-switch, copy-paste and full-screen exit detection.</li>
                <li>WebRTC live video for examiners and two-way chat.</li>
                <li>Liveness detection (blink / head-turn challenge) against photo spoofing.</li>
                <li>Bias and accuracy evaluation across lighting, skin tones and glasses.</li>
                <li>LMS integration (Moodle / Google Classroom) and PostgreSQL deployment.</li>
              </ul>
            </Section>

            <Section id="team" title="Team & institution" icon={<Users className="size-5" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                {PROJECT_INFO.team.map((m) => (
                  <div key={m.name} className="flex items-center gap-3 rounded-xl border border-slate-200 p-4">
                    <div className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-bold text-white">
                      {m.name
                        .split(' ')
                        .map((p) => p[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{m.name}</p>
                      <p className="text-sm text-slate-500">{m.role}</p>
                      <p className="text-xs text-slate-400">{m.id}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl bg-slate-50 p-4 text-sm">
                <p>
                  <b>Institution:</b> {PROJECT_INFO.institution} — {PROJECT_INFO.department}
                </p>
                <p>
                  <b>Guide:</b> {PROJECT_INFO.guide}
                </p>
                <p>
                  <b>Academic year:</b> {PROJECT_INFO.academicYear}
                </p>
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
