import { create } from 'zustand';
import type {
  AssignableRole,
  MemberDto,
  ProjectDto,
  ProjectWithRoleDto,
} from '@construct/shared';
import { api } from '../api/client';

interface ProjectsState {
  projects: ProjectWithRoleDto[];
  membersByProject: Record<string, MemberDto[]>;
  loading: boolean;
  fetchProjects: () => Promise<void>;
  fetchMembers: (projectId: string) => Promise<void>;
  createProject: (name: string, goal: string) => Promise<ProjectDto>;
  inviteMember: (projectId: string, email: string, role?: AssignableRole) => Promise<void>;
  changeRole: (projectId: string, userId: string, role: AssignableRole) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  membersByProject: {},
  loading: false,

  async fetchProjects() {
    set({ loading: true });
    try {
      const { data } = await api.get<ProjectWithRoleDto[]>('/projects');
      set({ projects: data });
    } finally {
      set({ loading: false });
    }
  },

  async fetchMembers(projectId) {
    const { data } = await api.get<MemberDto[]>(`/projects/${projectId}/members`);
    set((state) => ({
      membersByProject: { ...state.membersByProject, [projectId]: data },
    }));
  },

  async createProject(name, goal) {
    const { data } = await api.post<ProjectDto>('/projects', { name, goal });
    await get().fetchProjects();
    return data;
  },

  async inviteMember(projectId, email, role) {
    await api.post(`/projects/${projectId}/invite`, { email, role });
    await get().fetchMembers(projectId);
  },

  async changeRole(projectId, userId, role) {
    await api.patch(`/projects/${projectId}/members/${userId}`, { role });
    await get().fetchMembers(projectId);
  },
}));
