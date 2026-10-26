import { ArrowLeft, AtSign, CheckCircle2, Lock, ScanFace, User, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, ErrorState, Field, Input, Notice } from '../../components/ui';
import { api, errorMessage } from '../../lib/api';
import { AuthShell } from './LoginPage';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ studentId: '', name: '', email: '', password: '', confirm: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    if (!consent) return setError('Please accept the privacy notice to register.');
    setLoading(true);
    try {
      const res = await api<{ student: { studentId: string } }>('/auth/register', {
        body: { studentId: form.studentId, name: form.name, email: form.email, password: form.password },
      });
      setDone(res.student.studentId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-[460px] animate-fade-in">
        <Link to="/login" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="size-4" /> Back to login
        </Link>
        <h1 className="text-[26px] font-bold tracking-tight text-slate-900">First-time registration</h1>
        <p className="mt-1.5 text-sm text-slate-500">
          Create your exam account. After your first login you will capture a face reference for identity verification.
        </p>

        <div className="glass mt-6 rounded-2xl border border-white p-6 shadow-soft">
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
              <h2 className="mt-3 text-lg font-semibold text-slate-900">Account created</h2>
              <p className="mt-1 text-sm text-slate-500">
                Sign in as <b>{done}</b> with your exam code. You will be guided through face registration next.
              </p>
              <Button className="mt-5 w-full" onClick={() => navigate('/login')} icon={<ScanFace className="size-4" />}>
                Continue to login
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Student ID" hint="Letters then digits, e.g. STU2045">
                  <Input value={form.studentId} onChange={set('studentId')} placeholder="STU2045" icon={<User className="size-4" />} />
                </Field>
                <Field label="Full name">
                  <Input value={form.name} onChange={set('name')} placeholder="Your full name" autoComplete="name" />
                </Field>
              </div>
              <Field label="College email">
                <Input type="email" value={form.email} onChange={set('email')} placeholder="name@college.edu" icon={<AtSign className="size-4" />} autoComplete="email" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Password" hint="At least 8 characters">
                  <Input type="password" value={form.password} onChange={set('password')} icon={<Lock className="size-4" />} autoComplete="new-password" />
                </Field>
                <Field label="Confirm password">
                  <Input type="password" value={form.confirm} onChange={set('confirm')} icon={<Lock className="size-4" />} autoComplete="new-password" />
                </Field>
              </div>
              <Notice>
                We only ask for what the exam needs: ID, name, email and a password. Your face reference is stored as a list of
                128 numbers (an embedding), not as a photo.
              </Notice>
              <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 rounded accent-indigo-600" />
                <span>
                  I agree that my camera may be used for examination integrity and identity verification, and that proctoring
                  events may be recorded for examiner review.
                </span>
              </label>
              {error && <ErrorState message={error} />}
              <Button type="submit" size="lg" className="w-full" loading={loading} icon={<UserPlus className="size-5" />}>
                Create account
              </Button>
            </form>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
