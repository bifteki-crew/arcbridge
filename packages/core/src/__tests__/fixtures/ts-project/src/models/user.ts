/** Represents user roles */
export enum UserRole {
  Admin = "admin",
  User = "user",
  Guest = "guest",
}

/** User data shape */
export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/** User entity with methods */
export class UserEntity {
  constructor(
    public readonly id: string,
    public name: string,
    public email: string,
    public role: UserRole,
  ) {}

  /** Check if user is admin */
  isAdmin(): boolean {
    return this.role === UserRole.Admin;
  }

  /** Update the user's name */
  updateName(newName: string): void {
    this.name = newName;
  }
}
