import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from './User';

/**
 * A single Web Push subscription (ADR-0025). `endpoint` is the natural key:
 * the browser reissues the same endpoint on re-subscribe, so upserts key on
 * it rather than on `(userId, endpoint)`.
 *
 * `@JoinColumn` binds the relation to the `user_id` column below — see the
 * comment on the equivalent pairing in `RefreshToken.ts` for why this is
 * required to get a working `ON DELETE CASCADE` instead of a dead FK.
 */
@Entity({ name: 'push_subscriptions' })
@Index(['endpoint'], { unique: true })
@Index(['userId'])
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'text' })
  endpoint!: string;

  @Column({ type: 'varchar' })
  p256dh!: string;

  @Column({ type: 'varchar' })
  auth!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
