import { Component, type ReactNode } from "react";
import { isModuleLoadError, reloadForNewVersion } from "@/lib/newVersionReload";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary] Caught:", error.message);
    // Code of an older version of the site: reload to get the new one.
    if (isModuleLoadError(error.message || "")) reloadForNewVersion();
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center">
          <p className="text-lg font-medium">Something went wrong</p>
          <p className="text-sm text-muted-foreground max-w-md">{this.state.error?.message}</p>
          <button
            onClick={() => {
              window.location.reload();
            }}
            className="px-4 py-2 rounded-[2px] bg-primary text-primary-foreground text-sm"
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
