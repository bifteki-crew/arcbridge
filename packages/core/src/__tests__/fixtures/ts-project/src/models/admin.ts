import { UserEntity, UserRole } from "./user.js";

/** Admin entity with elevated permissions */
export class AdminEntity extends UserEntity {
  readonly permissions: string[];

  constructor(id: string, name: string, email: string, permissions: string[]) {
    super(id, name, email, UserRole.Admin);
    this.permissions = permissions;
  }

  hasPermission(perm: string): boolean {
    return this.permissions.includes(perm);
  }
}

export function createAdmin(
  id: string,
  name: string,
  email: string,
): AdminEntity {
  return new AdminEntity(id, name, email, ["all"]);
}
