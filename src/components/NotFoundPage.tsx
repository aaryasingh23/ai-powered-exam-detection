import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from './ui';

export function NotFoundPage() {
  return (
    <div className="bg-mesh grid min-h-full place-items-center p-6">
      <div className="text-center">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Compass className="mx-auto size-12 text-indigo-400" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-1 text-sm text-slate-500">The page you are looking for does not exist or has moved.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/login" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Student login
          </Link>
          <Link to="/examiner" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
            Examiner dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
