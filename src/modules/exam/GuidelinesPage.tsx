import { ArrowRight, BookX, Camera, CheckSquare, Clock, DoorOpen, Eye, EyeOff, ScanFace, Smartphone, Users, Wifi } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Notice } from '../../components/ui';
import { useAuth } from '../auth/authStore';
import { StudentShell } from './StudentShell';

const RULES = [
  { icon: ScanFace, text: 'Keep your face clearly visible' },
  { icon: Camera, text: 'Keep the camera ON throughout the examination' },
  { icon: Smartphone, text: 'Do not use mobile phones' },
  { icon: BookX, text: 'Do not use books, notes or unauthorized material' },
  { icon: Users, text: 'Do not allow another person to enter the camera frame' },
  { icon: Eye, text: 'Avoid repeatedly looking away from the screen' },
  { icon: DoorOpen, text: 'Do not leave the examination area' },
  { icon: Wifi, text: 'Maintain a stable internet connection' },
  { icon: EyeOff, text: 'Do not cover the camera' },
  { icon: CheckSquare, text: 'Follow all examination instructions' },
];

export default function GuidelinesPage() {
  const navigate = useNavigate();
  const { exam, acceptGuidelines, guidelinesAccepted, identity } = useAuth();
  const [agreed, setAgreed] = useState(guidelinesAccepted);
  const [consent, setConsent] = useState(guidelinesAccepted);

  const proceed = () => {
    acceptGuidelines();
    navigate('/system-check');
  };

  return (
    <StudentShell step={2}>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Before you begin</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Student Examination Guidelines</h1>
          <p className="mt-1.5 text-sm text-slate-500">Please read each guideline. They help keep the exam fair for everyone.</p>

          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {RULES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-3 text-sm text-slate-700">
                <span className="grid size-5 shrink-0 place-items-center rounded-md bg-emerald-500 text-[11px] font-bold text-white">✓</span>
                <Icon className="size-4 shrink-0 text-indigo-500" />
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <Notice className="mt-6">
            <b>AI proctoring may detect and flag unusual activities for examiner review.</b> A flag is not a judgement — every
            flag is reviewed by a human examiner, who makes the final decision.
          </Notice>

          <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 p-4">
            <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 accent-indigo-600" />
              <span>
                <b>Privacy notice:</b> Your camera may be used for examination integrity and identity verification. Proctoring events
                may be recorded for examiner review.
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-indigo-600" />
              <span className="font-semibold">I have read and understood the guidelines</span>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Both boxes must be ticked to continue.</p>
            <Button size="lg" disabled={!agreed || !consent} onClick={proceed} icon={<ArrowRight className="size-5" />}>
              Continue to Exam
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Your exam</p>
            <p className="mt-2 text-lg font-semibold text-slate-900">{exam?.name}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Duration</p>
                <p className="flex items-center gap-1.5 font-semibold text-slate-800">
                  <Clock className="size-4 text-indigo-500" /> {exam?.durationMinutes} min
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">Questions</p>
                <p className="font-semibold text-slate-800">{exam?.questions.length} MCQ</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">The timer starts when the exam opens and continues if you reload the page.</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Identity</p>
            <p className="mt-2 text-sm text-slate-700">
              {identity?.passed
                ? 'Verified before the exam.'
                : identity?.model === 'none'
                  ? 'Not verified (camera unavailable — demo mode).'
                  : 'Could not be verified — flagged for examiner review.'}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">What examiners see</p>
            <ul className="mt-2 space-y-1.5 text-sm text-slate-600">
              <li>• Flags with time, type, duration and confidence</li>
              <li>• A risk score that explains which flags contributed</li>
              <li>• Small evidence snapshots for high-severity flags</li>
              <li>• A low-resolution live preview (not recorded)</li>
            </ul>
          </Card>
        </div>
      </div>
    </StudentShell>
  );
}
