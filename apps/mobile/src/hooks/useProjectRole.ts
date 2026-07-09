import type { MembershipRole } from '@construct/shared';
import { useAuthStore } from '../store/useAuthStore';
import { useProjectsStore } from '../store/useProjectsStore';

/**
 * The current user's role in a project, derived from state already fetched
 * (members list if loaded, otherwise the project list's `myRole`).
 *
 * UI convenience ONLY — used to hide/show buttons. Never trust it for
 * security: the backend ProjectRoleGuard is the real enforcement.
 */
export function useProjectRole(projectId: string): MembershipRole | null {
  const userId = useAuthStore((s) => s.user?.id);
  const members = useProjectsStore((s) => s.membersByProject[projectId]);
  const project = useProjectsStore((s) => s.projects.find((p) => p.id === projectId));

  if (userId && members) {
    return members.find((m) => m.userId === userId)?.role ?? null;
  }
  return project?.myRole ?? null;
}
