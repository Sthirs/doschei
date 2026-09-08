import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from './User';

/**
 * A single link in a refresh-token rotation chain (ADR-0023).
 *
 * The raw secret handed to the browser is NEVER stored — only its SHA-256
 * digest, in `tokenHash`. Lookup is therefore an indexed read on that
 * digest; a database leak yields no usable credential.
 *
 * A row is VALID when `revokedAt IS NULL AND rotatedAt IS NULL AND
 * expiresAt > now()`. Rotation consumes the presented row (`rotatedAt`,
 * `replacedById`) and inserts a successor sharing the same `familyId` with a
 * freshly computed `expiresAt` — which is what makes the refresh window
 * slide forward on every use instead of counting down from first login.
 *
 * Presenting a row that is already rotated or revoked is a reuse signal: the
 * whole family is revoked, except within the grace window that absorbs the
 * benign multi-tab race (see refreshTokenRotation.ts).
 */
@Entity({ name: 'refresh_tokens' })
@Index(['tokenHash'], { unique: true })
@Index(['familyId'])
@Index(['userId'])
@Index(['expiresAt'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * `@JoinColumn` binds the relation to the `user_id` column below, so the
   * foreign key and the ON DELETE CASCADE actually apply to the column the code
   * writes. Without it TypeORM adds a second, always-null `userId` column and
   * hangs the FK off that — which is the shape `user_identities` ended up with,
   * where the cascade is therefore inert. This is a new table with no legacy
   * rows, so it is worth getting right here rather than copying the quirk.
   */
  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  /**
   * Rotation lineage. Every successor inherits this value unchanged, so
   * revoking a compromised chain is a single UPDATE keyed on `family_id`.
   */
  @Column({ type: 'uuid', name: 'family_id' })
  familyId!: string;

  /** SHA-256 hex digest of the raw secret (64 chars). */
  @Column({ type: 'varchar', name: 'token_hash' })
  tokenHash!: string;

  /** Recomputed on every rotation — this is the sliding window. */
  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  /** Non-null means this token was already exchanged for a successor. */
  @Column({ type: 'timestamptz', name: 'rotated_at', nullable: true })
  rotatedAt!: Date | null;

  /**
   * Audit chain pointer, deliberately a plain column rather than a
   * self-referencing @ManyToOne: a self-FK would add a cycle under TypeORM
   * `synchronize` (ADR-0004) and buys nothing, since nothing traverses the
   * chain as a relation.
   */
  @Column({ type: 'uuid', name: 'replaced_by_id', nullable: true })
  replacedById!: string | null;

  @Column({ type: 'timestamptz', name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;

  /** `'logout' | 'reuse'` — kept as varchar so a new reason needs no migration. */
  @Column({ type: 'varchar', name: 'revoked_reason', nullable: true })
  revokedReason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
