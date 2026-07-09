// Shared types and request/response contracts for the Construct Coordinator
// API and mobile app. Imported by both apps/api and apps/mobile so shapes
// cannot drift out of sync.

// ---------------------------------------------------------------------------
// Roles & statuses
// ---------------------------------------------------------------------------

export const MEMBERSHIP_ROLES = ['owner', 'superuser', 'member'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

/** Roles that can be granted via invite or role change. `owner` is never assignable. */
export const ASSIGNABLE_ROLES = ['superuser', 'member'] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['invited', 'active'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const TASK_STATUSES = ['pending', 'in_progress', 'blocked', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// ---------------------------------------------------------------------------
// Validation rules shared by backend DTOs and mobile form validation
// ---------------------------------------------------------------------------

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MAX_LENGTH = 120;
export const PROJECT_NAME_MAX_LENGTH = 200;
export const TASK_TITLE_MAX_LENGTH = 200;
// Guideline content and task descriptions — keeps payloads sane before the
// AI processing phases start consuming this text.
export const LONG_TEXT_MAX_LENGTH = 10000;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// ---------------------------------------------------------------------------
// Entities (as serialized over the API — dates are ISO strings)
// ---------------------------------------------------------------------------

export interface UserDto {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface ProjectDto {
  id: string;
  name: string;
  goal: string;
  ownerId: string;
  createdAt: string;
}

/** Project as returned by GET /projects — annotated with the caller's role. */
export interface ProjectWithRoleDto extends ProjectDto {
  myRole: MembershipRole;
}

export interface MembershipDto {
  id: string;
  projectId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  invitedById: string | null;
  createdAt: string;
}

/** Membership as returned by GET /projects/:id/members — includes the user. */
export interface MemberDto extends MembershipDto {
  user: Pick<UserDto, 'id' | 'email' | 'name'>;
}

export interface GuidelineDto {
  id: string;
  projectId: string;
  content: string;
  updatedById: string;
  updatedAt: string;
  updatedBy: Pick<UserDto, 'id' | 'email' | 'name'>;
}

export interface TaskDto {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  sequenceOrder: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Request bodies
// ---------------------------------------------------------------------------

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface CreateProjectRequest {
  name: string;
  goal: string;
}

export interface InviteMemberRequest {
  email: string;
  /** Defaults to 'member' on the server. */
  role?: AssignableRole;
}

export interface UpdateMemberRoleRequest {
  role: AssignableRole;
}

export interface UpsertGuidelineRequest {
  content: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
}

/** Owner/superuser only — members must use UpdateTaskStatusRequest. */
export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  sequenceOrder?: number;
}

/** The only task write available to the `member` role. */
export interface UpdateTaskStatusRequest {
  status: TaskStatus;
}

export interface ReorderTasksRequest {
  /** Task ids in their new order (renumbered 1..n atomically). */
  taskIds: string[];
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface AuthResponseDto {
  user: UserDto;
  accessToken: string;
  refreshToken: string;
}

export interface TokensDto {
  accessToken: string;
  refreshToken: string;
}
