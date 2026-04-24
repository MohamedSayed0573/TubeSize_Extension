import { Component } from "react";
import type { ReactNode } from "react";

interface Props {
    children: ReactNode;
    errorComponent: (err: Error) => ReactNode;
}

interface State {
    error: Error | undefined;
}

class ErrorBoundary extends Component<Props, State> {
    state: State = { error: undefined };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error("[ErrorBoundary]:", error, info.componentStack);
    }

    render() {
        const { error } = this.state;
        if (error) {
            return this.props.errorComponent(error);
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
