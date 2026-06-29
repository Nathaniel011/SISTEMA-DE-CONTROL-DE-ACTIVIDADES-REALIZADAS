export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface AuthenticatedUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  roles: string[];
  active: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
  organizationSlug?: string;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}
