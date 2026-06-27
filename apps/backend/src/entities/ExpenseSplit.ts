import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Expense } from './Expense';
import { User } from './User';

export type ShareType = 'PERCENT' | 'FIXED';

@Entity({ name: 'expense_splits' })
export class ExpenseSplit {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Expense, (expense) => expense.splits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'expense_id' })
  expense!: Expense;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'share_type', type: 'varchar' })
  shareType!: ShareType;

  @Column({ name: 'share_value', type: 'decimal', precision: 10, scale: 2 })
  shareValue!: number;

  @Column({ name: 'computed_amount', type: 'decimal', precision: 10, scale: 2 })
  computedAmount!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
