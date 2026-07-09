import { TextStyleContext } from "@/components/ui/text";
import { UIColors } from "@/lib/ui-colors";
import type { LucideIcon, LucideProps } from "lucide-react-native";
import * as React from "react";

type IconProps = LucideProps & {
  as: LucideIcon;
  color?: string;
} & React.RefAttributes<LucideIcon>;

function Icon({ as: IconComponent, color, size = 14, ...props }: IconProps) {
  const contextStyle = React.useContext(TextStyleContext);
  const resolvedColor = color ?? (contextStyle?.color as string | undefined) ?? UIColors.foreground;
  return <IconComponent color={resolvedColor} size={size} {...props} />;
}

export { Icon };
