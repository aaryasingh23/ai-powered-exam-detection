import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, RotateCcw } from 'lucide-react';

interface State {
  error: Error | null;
}

/** Last line of defence: a rendering bug shows a recoverable message, not a white screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ui] render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-[60vh] place-items-center p-6">
        <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-soft">
          <AlertOctagon className="mx-auto size-10 text-rose-500" />
          <h2 className="mt-3 text-lg font-semibold text-slate-900">This screen hit an unexpected problem</h2>
          <p className="mt-1 text-sm text-slate-500">
            Your exam progress is saved on the server. Reload the page to continue.
          </p>
          <p className="mt-3 rounded-lg bg-slate-50 p-2 font-mono text-xs text-slate-500">{this.state.error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <RotateCcw className="size-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}
