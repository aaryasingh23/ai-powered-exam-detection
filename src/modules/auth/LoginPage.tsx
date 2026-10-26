import { BookOpen, Eye, EyeOff, Fingerprint, KeyRound, Lock, ScanFace, ShieldCheck, Sparkles, User, UserCog } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ErrorState, Field, Input, Logo, Modal, Notice } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from './authStore';

const DEMO = { studentId: 'STU1001', password: 'Demo@123', examCode: 'CN-2026' };

export function AuthShell({ children, side }: { children: React.ReactNode; side?: React.ReactNode }) {
  return (
    <div className="min-h-full lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="bg-grid-dark relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -left-24 top-1/3 size-[420px] rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 -top-20 size-[360px] rounded-full bg-violet-600/25 blur-3xl" />
        <div className="relative">
          <Logo dark />
        </div>
        <div className="relative">{side ?? <DefaultSide />}</div>
        <p className="relative text-xs text-slate-500">
          © {new Date().getFullYear()} LCG Examination Cell · AI flags support examiners — they are never a verdict.
        </p>
      </aside>
      <main className="bg-mesh flex min-h-full flex-col">
        <div className="flex items-center justify-between p-5 lg:hidden">
          <Logo />
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">{children}</div>
      </main>
    </div>
  );
}

function DefaultSide() {
  const items = [
    { icon: <ScanFace className="size-5" />, title: 'Face-verified identity', text: 'A numeric face embedding confirms it is really you — no photo is stored.' },
    { icon: <Sparkles className="size-5" />, title: 'On-device AI monitoring', text: 'Face, gaze and object models run inside your browser.' },
    { icon: <ShieldCheck className="size-5" />, title: 'Human review, always', text: 'Unusual activity is flagged for an examiner. The system never decides on its own.' },
  ];
  return (
    <div className="max-w-md">
      <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-indigo-200">
        <span className="size-1.5 animate-pulse-ring rounded-full bg-emerald-400" /> Secure online examination
      </p>
      <h2 className="text-4xl font-bold leading-tight tracking-tight">
        Fair exams,
        <br />
        <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">transparently proctored.</span>
      </h2>
      <div className="mt-10 space-y-5">
        {items.map((i) => (
          <div key={i.title} className="flex gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-indigo-200 ring-1 ring-white/10">{i.icon}</div>
            <div>
              <p className="font-semibold">{i.title}</p>
              <p className="text-sm text-slate-400">{i.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ForgotPassword({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [studentId, setStudentId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ message: string }>('/auth/forgot-password', { body: { studentId } });
      setMessage(res.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setMessage(null);
    setError(null);
    setStudentId('');
    onClose();
  };

  return (
    <Modal open={open} onClose={close} title="Reset your password">
      {message ? (
        <Notice tone="success">{message}</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4" id="forgot-form">
          <p className="text-sm text-slate-600">
            Enter your Student ID. The examination office will verify your identity and contact you on your registered email.
          </p>
          <Field label="Student ID / Enrollment number">
            <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="e.g. STU1001" icon={<User className="size-4" />} required />
          </Field>
          {error && <ErrorState message={error} />}
        </form>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={close} type="button">
          {message ? 'Done' : 'Cancel'}
        </Button>
        {!message && (
          <Button type="submit" form="forgot-form" loading={loading}>
            Send reset request
          </Button>
        )}
      </div>
    </Modal>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { loginStudent, notice, clearNotice, token, role, student } = useAuth();
  const [form, setForm] = useState({ studentId: '', password: '', examCode: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clearNotice, 15000);
    return () => clearTimeout(t);
  }, [notice, clearNotice]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.studentId.trim() || !form.password || !form.examCode.trim()) {
      setError('Please fill in your Student ID, password and exam code.');
      return;
    }
    setLoading(true);
    try {
      await loginStudent(form);
      navigate('/verify-identity');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthShell>
      <div className="w-full max-w-[440px] animate-fade-in">
        <div className="mb-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">LCG Online Examination</p>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-slate-900">Student Secure Login Portal</h1>
          <p className="mt-1.5 text-sm text-slate-500">Sign in with your enrollment details and the exam code shared by your examiner.</p>
        </div>

        {notice && (
          <Notice tone="warning" className="mb-4">
            {notice}
          </Notice>
        )}
        {token && role === 'student' && student && (
          <Notice className="mb-4">
            You are signed in as <b>{student.name}</b>.{' '}
            <Link to="/verify-identity" className="font-semibold underline">
              Continue your exam flow
            </Link>
          </Notice>
        )}

        <div className="glass rounded-2xl border border-white p-6 shadow-soft sm:p-7">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Student ID / Enrollment Number">
              <Input value={form.studentId} onChange={set('studentId')} placeholder="e.g. STU1001" autoComplete="username" icon={<User className="size-4" />} />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  placeholder="Your password"
                  autoComplete="current-password"
                  icon={<Lock className="size-4" />}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <Field label="Exam Code" hint="Codes are not case-sensitive, e.g. CN-2026">
              <Input value={form.examCode} onChange={set('examCode')} placeholder="e.g. CN-2026" icon={<KeyRound className="size-4" />} />
            </Field>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Problems signing in?</span>
              <button type="button" onClick={() => setForgotOpen(true)} className="font-semibold text-indigo-600 hover:text-indigo-700">
                Forgot password?
              </button>
            </div>
            {error && <ErrorState message={error} />}
            <Button type="submit" size="lg" className="w-full" loading={loading} icon={<Fingerprint className="size-5" />}>
              Secure Login
            </Button>
          </form>

          <div className="mt-5 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-3 text-xs text-indigo-900">
            <div className="flex items-center justify-between gap-2">
              <span>
                <b>Demo account:</b> {DEMO.studentId} · {DEMO.password} · {DEMO.examCode}
              </span>
              <button type="button" onClick={() => setForm(DEMO)} className="shrink-0 font-bold text-indigo-700 hover:underline">
                Fill in
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
          <Link to="/register" className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            <ScanFace className="size-4 text-indigo-500" /> Register
          </Link>
          <Link to="/examiner/login" className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            <UserCog className="size-4 text-violet-500" /> Examiner
          </Link>
          <Link to="/docs" className="flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2.5 font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            <BookOpen className="size-4 text-sky-500" /> Docs
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 text-center text-[11px] text-slate-500">
          <div>
            <Lock className="mx-auto mb-1 size-4 text-slate-400" />
            Passwords hashed (scrypt)
          </div>
          <div>
            <ShieldCheck className="mx-auto mb-1 size-4 text-slate-400" />
            Sessions expire in 3 h
          </div>
          <div>
            <ScanFace className="mx-auto mb-1 size-4 text-slate-400" />
            No face photos stored
          </div>
        </div>
      </div>
      <ForgotPassword open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </AuthShell>
  );
}
