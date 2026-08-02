import { Component, type ReactNode } from "react";
import { ErrorOverlay } from "./ErrorOverlay";

interface ApplicationErrorBoundaryProps {
  children: ReactNode;
}

interface ApplicationErrorBoundaryState {
  message: string | null;
}

const UNSUPPORTED_MESSAGE = "Your browser does not support WebGL/WebGPU. Try updating your browser.";

/**
 * Catches render-time failures from the PlayCanvas <Application> tree — most
 * notably unsupported WebGL/WebGPU — so the screen never freezes on a blank
 * canvas. React error boundaries must be class components; there's no hook form.
 */
export class ApplicationErrorBoundary extends Component<ApplicationErrorBoundaryProps, ApplicationErrorBoundaryState> {
  state: ApplicationErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): ApplicationErrorBoundaryState {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = /webgl|webgpu|graphics device/i.test(rawMessage) ? UNSUPPORTED_MESSAGE : rawMessage;
    return { message };
  }

  private handleRetry = (): void => {
    this.setState({ message: null });
    window.location.reload();
  };

  render() {
    if (this.state.message) {
      return <ErrorOverlay message={this.state.message} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
