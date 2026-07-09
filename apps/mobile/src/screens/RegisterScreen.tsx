import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { isValidEmail, PASSWORD_MIN_LENGTH } from '@construct/shared';
import { AuthStackParamList } from '../navigation/RootNavigator';
import { useAuthStore } from '../store/useAuthStore';
import { apiErrorMessage } from '../api/client';
import { Button, ErrorText, Field, colors } from '../components/ui';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export function RegisterScreen(_props: Props) {
  const register = useAuthStore((s) => s.register);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    // Mirrors the backend DTO rules for instant feedback; the server
    // re-validates everything.
    const errors: typeof fieldErrors = {};
    if (!name.trim()) {
      errors.name = 'Name is required';
    }
    if (!isValidEmail(email)) {
      errors.email = 'Enter a valid email address';
    }
    if (password.length < PASSWORD_MIN_LENGTH) {
      errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setLoading(true);
    try {
      await register(name.trim(), email.trim(), password);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.form}>
        <ErrorText>{error}</ErrorText>
        <Field
          label="Name"
          value={name}
          onChangeText={setName}
          error={fieldErrors.name}
          placeholder="Your full name"
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={fieldErrors.email}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          error={fieldErrors.password}
          secureTextEntry
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
        />
        <Button title="Create account" onPress={submit} loading={loading} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  form: { paddingHorizontal: 24 },
});
