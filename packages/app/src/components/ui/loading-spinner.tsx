import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";
import { useUnistyles } from "react-native-unistyles";

export type LoadingSpinnerProps = ActivityIndicatorProps;

export function LoadingSpinner({ size = "small", color, ...props }: LoadingSpinnerProps) {
  const { theme } = useUnistyles();
  return (
    <ActivityIndicator {...props} size={size} color={color ?? theme.colors.palette.blue[500]} />
  );
}
