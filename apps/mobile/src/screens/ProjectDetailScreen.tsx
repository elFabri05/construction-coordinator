import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AssignableRole, MemberDto, isValidEmail } from '@construct/shared';
import { AppStackParamList } from '../navigation/RootNavigator';
import { useProjectsStore } from '../store/useProjectsStore';
import { useProjectRole } from '../hooks/useProjectRole';
import { apiErrorMessage } from '../api/client';
import { Button, ErrorText, Field, RoleBadge, colors } from '../components/ui';

type Props = NativeStackScreenProps<AppStackParamList, 'ProjectDetail'>;

export function ProjectDetailScreen({ route, navigation }: Props) {
  const { projectId } = route.params;

  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId));
  const members = useProjectsStore((s) => s.membersByProject[projectId]);
  const fetchMembers = useProjectsStore((s) => s.fetchMembers);
  const inviteMember = useProjectsStore((s) => s.inviteMember);
  const changeRole = useProjectsStore((s) => s.changeRole);

  // UI convenience only — server-side guards are the real enforcement.
  const myRole = useProjectRole(projectId);
  const canInvite = myRole === 'owner' || myRole === 'superuser';
  const isOwner = myRole === 'owner';

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableRole>('member');
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchMembers(projectId).catch((err) => setError(apiErrorMessage(err)));
  }, [projectId, fetchMembers]);

  const invite = async () => {
    setError(null);
    if (!isValidEmail(inviteEmail)) {
      setInviteEmailError('Enter a valid email address');
      return;
    }
    setInviteEmailError(null);

    setBusy(true);
    try {
      await inviteMember(projectId, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleRole = async (member: MemberDto) => {
    setError(null);
    const next: AssignableRole = member.role === 'superuser' ? 'member' : 'superuser';
    try {
      await changeRole(projectId, member.userId, next);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={members ?? []}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={
          <View>
            {project ? <Text style={styles.goal}>{project.goal}</Text> : null}
            <View style={styles.navRow}>
              <View style={styles.navButton}>
                <Button
                  title="Guideline"
                  variant="secondary"
                  onPress={() => navigation.navigate('Guideline', { projectId })}
                />
              </View>
              <View style={styles.navButton}>
                <Button
                  title="Tasks"
                  variant="secondary"
                  onPress={() => navigation.navigate('Tasks', { projectId })}
                />
              </View>
            </View>
            <ErrorText>{error}</ErrorText>
            <Text style={styles.sectionTitle}>Members</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.memberRow}>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>
                {item.user.name}
                {item.status === 'invited' ? '  (invited)' : ''}
              </Text>
              <Text style={styles.memberEmail}>{item.user.email}</Text>
            </View>
            <RoleBadge role={item.role} />
            {isOwner && item.role !== 'owner' ? (
              <Text style={styles.roleAction} onPress={() => void toggleRole(item)}>
                {item.role === 'superuser' ? 'Demote' : 'Promote'}
              </Text>
            ) : null}
          </View>
        )}
        ListFooterComponent={
          canInvite ? (
            <View style={styles.inviteSection}>
              <Text style={styles.sectionTitle}>Invite a member</Text>
              <Field
                label="Email"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                error={inviteEmailError}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="teammate@example.com"
              />
              <View style={styles.roleToggle}>
                {(['member', 'superuser'] as const).map((role) => (
                  <Text
                    key={role}
                    style={[styles.roleOption, inviteRole === role && styles.roleOptionActive]}
                    onPress={() => setInviteRole(role)}
                  >
                    {role}
                  </Text>
                ))}
              </View>
              <Button
                title="Send invite"
                onPress={invite}
                loading={busy}
                disabled={!inviteEmail}
              />
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 16 },
  goal: { color: colors.muted, marginBottom: 16 },
  navRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  navButton: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 8 },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  memberInfo: { flex: 1 },
  memberName: { fontWeight: '600', color: colors.text },
  memberEmail: { color: colors.muted, fontSize: 13 },
  roleAction: { color: colors.primary, fontWeight: '600', paddingLeft: 6 },
  inviteSection: { marginTop: 24 },
  roleToggle: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  roleOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    color: colors.muted,
    overflow: 'hidden',
  },
  roleOptionActive: {
    borderColor: colors.primary,
    color: colors.primary,
    fontWeight: '700',
    backgroundColor: colors.badge,
  },
});
