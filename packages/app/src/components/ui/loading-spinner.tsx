import { ActivityIndicator, type ActivityIndicatorProps } from "react-native";
import { useUnistyles } from "react-native-unistyles";

type LoadingSpinnerProps = ActivityIndicatorProps;

export function LoadingSpinner({ color, size = "small", ...props }: LoadingSpinnerProps) {
  const { theme } = useUnistyles();
  return (
    <ActivityIndicator {...props} size={size} color={color ?? theme.colors.palette.blue[500]} />
  );
}
