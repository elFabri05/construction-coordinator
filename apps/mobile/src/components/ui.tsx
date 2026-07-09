import { ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import type { TaskStatus } from '@construct/shared';
import { TASK_STATUSES } from '@construct/shared';

export const colors = {
  primary: '#1d6ef5',
  danger: '#d33',
  text: '#1a1a2e',
  muted: '#667',
  border: '#ccd',
  background: '#fff',
  badge: '#eef2ff',
};

interface FieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

export function Field({ label, error, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={colors.muted}
        {...inputProps}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ title, onPress, loading, disabled, variant = 'primary' }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      style={[
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        isDisabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      disabled={isDisabled}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? colors.primary : '#fff'} />
      ) : (
        <Text
          style={[styles.buttonText, variant === 'secondary' && styles.buttonTextSecondary]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) {
    return null;
  }
  return <Text style={styles.error}>{children}</Text>;
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{role}</Text>
    </View>
  );
}

export const statusColors: Record<TaskStatus, { bg: string; fg: string }> = {
  pending: { bg: '#eef1f5', fg: '#556' },
  in_progress: { bg: '#e6f0ff', fg: '#1d6ef5' },
  blocked: { bg: '#fdeaea', fg: '#c22' },
  done: { bg: '#e6f7ec', fg: '#1a7f4b' },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const palette = statusColors[status];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>
        {status.replace('_', ' ')}
      </Text>
    </View>
  );
}

/** Tappable row of the four statuses — the member "quick action" control. */
export function StatusPicker({
  value,
  onChange,
  disabled,
}: {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.statusRow}>
      {TASK_STATUSES.map((status) => {
        const palette = statusColors[status];
        const active = status === value;
        return (
          <TouchableOpacity
            key={status}
            disabled={disabled || active}
            onPress={() => onChange(status)}
            style={[
              styles.statusChip,
              { backgroundColor: active ? palette.bg : 'transparent' },
              active && { borderColor: palette.fg },
            ]}
          >
            <Text
              style={[styles.statusChipText, { color: active ? palette.fg : colors.muted }]}
            >
              {status.replace('_', ' ')}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { marginBottom: 6, color: colors.text, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputError: { borderColor: colors.danger },
  fieldError: { color: colors.danger, marginTop: 4, fontSize: 13 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonDanger: { backgroundColor: colors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonTextSecondary: { color: colors.primary },
  error: { color: colors.danger, marginBottom: 12, textAlign: 'center' },
  badge: {
    backgroundColor: colors.badge,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusChipText: { fontSize: 12, fontWeight: '600' },
});
