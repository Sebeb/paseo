import { Component, type ErrorInfo, type ReactNode } from "react";
import { Text, View } from "react-native";

const fallbackContainerStyle = {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
} as const;

const fallbackTextStyle = {
  color: "#f4f4f5",
  fontSize: 15,
  textAlign: "center",
} as const;

interface AppRenderErrorBoundaryProps {
  children: ReactNode;
}

interface AppRenderErrorBoundaryState {
  error: Error | null;
}

export class AppRenderErrorBoundary extends Component<
  AppRenderErrorBoundaryProps,
  AppRenderErrorBoundaryState
> {
  state: AppRenderErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppRenderErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const crashDetails = {
      message: error.message,
      stack: error.stack ?? null,
      componentStack: info.componentStack,
    };

    console.error(`[AppRenderErrorBoundary] renderer crashed ${JSON.stringify(crashDetails)}`);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={fallbackContainerStyle}>
          <Text style={fallbackTextStyle}>
            Paseo hit a renderer error. Check the desktop logs for the component stack.
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}
