import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { query, transaction } from '../utils/db.js';
import { ConflictError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  avatar_url: string | null;
  role: string;
  org_id: string | null;
  email_verified: boolean;
  preferences: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export type PublicUser = Omit<User, 'password_hash'>;

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role?: string;
  org_id?: string;
}

export interface UpdateUserInput {
  name?: string;
  avatar_url?: string;
  role?: string;
  org_id?: string;
  email_verified?: boolean;
  preferences?: Record<string, unknown>;
  password_hash?: string;
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function createUser(data: CreateUserInput): Promise<PublicUser> {
  // Check for existing user
  const existing = await query<User>(
    'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
    [data.email.toLowerCase()],
  );

  if (existing.rowCount && existing.rowCount > 0) {
    throw new ConflictError('A user with this email already exists');
  }

  const passwordHash = await bcrypt.hash(data.password, config.bcryptRounds);

  const result = await query<User>(
    `INSERT INTO users (email, name, password_hash, role, org_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, name, avatar_url, role, org_id, email_verified, preferences, created_at, updated_at, deleted_at`,
    [
      data.email.toLowerCase(),
      data.name,
      passwordHash,
      data.role ?? 'member',
      data.org_id ?? null,
    ],
  );

  const user = result.rows[0];
  logger.info('User created', { userId: user.id, email: user.email });

  return user;
}

export async function findByEmail(email: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
    [email.toLowerCase()],
  );

  return result.rows[0] ?? null;
}

export async function findById(id: string): Promise<User | null> {
  const result = await query<User>(
    'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  return result.rows[0] ?? null;
}

export async function findPublicById(id: string): Promise<PublicUser | null> {
  const result = await query<PublicUser>(
    `SELECT id, email, name, avatar_url, role, org_id, email_verified, preferences, created_at, updated_at, deleted_at
     FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function updateUser(id: string, data: UpdateUserInput): Promise<PublicUser> {
  // Build dynamic SET clause
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const fields: (keyof UpdateUserInput)[] = [
    'name',
    'avatar_url',
    'role',
    'org_id',
    'email_verified',
    'preferences',
    'password_hash',
  ];

  for (const field of fields) {
    if (data[field] !== undefined) {
      setClauses.push(`${field} = $${paramIndex}`);
      values.push(field === 'preferences' ? JSON.stringify(data[field]) : data[field]);
      paramIndex++;
    }
  }

  if (setClauses.length === 0) {
    const existing = await findPublicById(id);
    if (!existing) throw new NotFoundError('User not found');
    return existing;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query<PublicUser>(
    `UPDATE users SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex} AND deleted_at IS NULL
     RETURNING id, email, name, avatar_url, role, org_id, email_verified, preferences, created_at, updated_at, deleted_at`,
    values,
  );

  if (!result.rowCount || result.rowCount === 0) {
    throw new NotFoundError('User not found');
  }

  logger.info('User updated', { userId: id });
  return result.rows[0];
}

export async function deleteUser(id: string): Promise<void> {
  const result = await query(
    'UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );

  if (!result.rowCount || result.rowCount === 0) {
    throw new NotFoundError('User not found');
  }

  logger.info('User soft-deleted', { userId: id });
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, config.bcryptRounds);
  await updateUser(userId, { password_hash: passwordHash });
  logger.info('Password updated', { userId });
}

export async function getUserPermissions(
  userId: string,
): Promise<{ role: string; permissions: string[] }> {
  const user = await findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Get base permissions from role
  const { getRolePermissions } = await import('./rbac.service.js');
  const permissions = getRolePermissions(user.role);

  // Get custom permissions from org membership
  const membershipResult = await query<{ role: string }>(
    'SELECT role FROM org_memberships WHERE user_id = $1 AND org_id = $2',
    [userId, user.org_id],
  );

  const orgRole = membershipResult.rows[0]?.role;
  if (orgRole) {
    const orgPermissions = getRolePermissions(orgRole);
    const merged = new Set([...permissions, ...orgPermissions]);
    return { role: user.role, permissions: Array.from(merged) };
  }

  return { role: user.role, permissions };
}

export async function createAuditLog(data: {
  actorId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, metadata, ip)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      data.actorId,
      data.action,
      data.resourceType,
      data.resourceId ?? null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      data.ip ?? null,
    ],
  );
}
