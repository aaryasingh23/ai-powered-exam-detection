import { Activity, ArrowLeft, BellRing, ClipboardCheck, LayoutDashboard, Lock, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ErrorState, Field, Input, Notice } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useAuth } from './authStore';
import { AuthShell } from './LoginPage';

const DEMO = { username: 'examiner', password: 'Examiner@123' };

function Side() {
  const items = [
    { icon: <Activity className="size-5" />, title: 'Live telemetry', text: 'Risk scores and status for every candidate, refreshed every few seconds.' },
    { icon: <BellRing className="size-5" />, title: 'Prioritised alerts', text: 'Severity-ranked flags with confidence, duration and evidence.' },
    { icon: <ClipboardCheck className="size-5" />, title: 'Human decisions', text: 'Mark events reviewed or false positive, add notes, export reports.' },
  ];
  return (
    <div className="max-w-md">
      <h2 className="text-4xl font-bold leading-tight tracking-tight">
        Examiner
        <br />
        <span className="bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent">Control Centre</span>
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

export default function ExaminerLoginPage() {
  const navigate = useNavigate();
  const { loginExaminer, notice } = useAuth();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginExaminer(form);
      navigate('/examiner');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell side={<Side />}>
      <div className="w-full max-w-[420px] animate-fade-in">
        <Link to="/login" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Student login
        </Link>
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900">Examiner sign in</h1>
        <p className="mt-1.5 text-sm text-slate-500">Access the live telemetry dashboard and review proctoring flags.</p>
        {notice && (
          <Notice tone="warning" className="mt-4">
            {notice}
          </Notice>
        )}
        <div className="glass mt-6 rounded-2xl border border-white p-6 shadow-soft">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Username">
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} icon={<User className="size-4" />} autoComplete="username" required />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                icon={<Lock className="size-4" />}
                autoComplete="current-password"
                required
              />
            </Field>
            {error && <ErrorState message={error} />}
            <Button type="submit" size="lg" className="w-full" loading={loading} icon={<LayoutDashboard className="size-5" />}>
              Open dashboard
            </Button>
          </form>
          <div className="mt-5 flex items-center justify-between rounded-xl border border-dashed border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-900">
            <span>
              <b>Demo examiner:</b> {DEMO.username} · {DEMO.password}
            </span>
            <button type="button" onClick={() => setForm(DEMO)} className="font-bold text-violet-700 hover:underline">
              Fill in
            </button>
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
