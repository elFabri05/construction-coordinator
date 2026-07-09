import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { isValidEmail } from '@construct/shared';
import { AuthStackParamList } from '../navigation/RootNavigator';
import { useAuthStore } from '../store/useAuthStore';
import { apiErrorMessage } from '../api/client';
import { Button, ErrorText, Field, colors } from '../components/ui';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    // Instant client-side feedback; the backend re-validates everything.
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email address');
      return;
    }
    setEmailError(null);

    setLoading(true);
    try {
      await login(email.trim(), password);
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
          label="Email"
          value={email}
          onChangeText={setEmail}
          error={emailError}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Your password"
        />
        <Button title="Sign in" onPress={submit} loading={loading} disabled={!email || !password} />
        <Text style={styles.switchText} onPress={() => navigation.navigate('Register')}>
          No account yet? <Text style={styles.link}>Create one</Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  form: { paddingHorizontal: 24 },
  switchText: { marginTop: 20, textAlign: 'center', color: colors.muted },
  link: { color: colors.primary, fontWeight: '600' },
});
