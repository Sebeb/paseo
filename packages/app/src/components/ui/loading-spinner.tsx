import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";
import { useUnistyles } from "react-native-unistyles";

type LoadingSpinnerProps = Omit<ActivityIndicatorProps, "color">;

export function LoadingSpinner({ size = "small", ...props }: LoadingSpinnerProps) {
  const { theme } = useUnistyles();
  return <ActivityIndicator {...props} size={size} color={theme.colors.palette.blue[500]} />;
}
