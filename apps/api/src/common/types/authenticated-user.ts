/** Shape attached to request.user by JwtStrategy. */
export interface AuthenticatedUser {
  id: string;
  email: string;
}
