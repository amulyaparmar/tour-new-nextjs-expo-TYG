import { UIColors } from "@/lib/ui-colors";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";

const styles = StyleSheet.create({
  input: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: UIColors.input,
    backgroundColor: UIColors.background,
    color: UIColors.foreground,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  disabled: { opacity: 0.5 },
});

function Input({ style, editable = true, placeholderTextColor = UIColors.mutedForeground, ...props }: TextInputProps) {
  return (
    <TextInput
      style={[styles.input, editable === false && styles.disabled, style]}
      editable={editable}
      placeholderTextColor={placeholderTextColor}
      {...props}
    />
  );
}

export { Input };
