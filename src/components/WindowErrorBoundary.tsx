import { AlertTriangle, RotateCcw } from "lucide-react";
import React from "react";

interface Props {
  readonly appTitle: string;
  readonly children: React.ReactNode;
}

interface State {
  readonly error: Error | null;
  readonly resetKey: number;
}

/**
 * Per-window Error Boundary so a crash inside any individual app or dynamic
 * agent-built app is isolated and recoverable without crashing the OS desktop.
 */
export class WindowErrorBoundary extends React.Component<Props, State> {
  public override state: State = { error: null, resetKey: 0 };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  public override componentDidCatch(error: Error): void {
    console.error(`[unkernelOS] Window crash in ${this.props.appTitle}:`, error);
  }

  private handleReload = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  public override render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-[#090b12]/96 p-6 text-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-400/35 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-rose-400" />
          </div>
          <div className="space-y-1 max-w-sm">
            <h3 className="text-sm font-semibold text-white">{this.props.appTitle} encountered an error</h3>
            <p className="text-xs font-mono text-rose-300/90 break-words">
              {this.state.error.message || "Unexpected rendering exception"}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-violet-600 to-cyan-500 text-white hover:brightness-110 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reload Window
          </button>
        </div>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}
