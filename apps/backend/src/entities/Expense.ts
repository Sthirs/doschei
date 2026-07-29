import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { ExpenseSplit } from './ExpenseSplit';
import { Group } from './Group';
import { User } from './User';

export type ExpenseKind = 'EXPENSE' | 'SETTLEMENT';

@Entity({ name: 'expenses' })
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  description!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', default: 'general' })
  category!: string;

  @Column({ type: 'varchar', default: 'EXPENSE' })
  kind!: ExpenseKind;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  date!: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'paid_by_id' })
  paidBy!: User;

  @ManyToOne(() => Group, (group) => group.expenses)
  @JoinColumn({ name: 'group_id' })
  group!: Group;

  @OneToMany(() => ExpenseSplit, (split) => split.expense, { eager: true, cascade: true })
  splits!: ExpenseSplit[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
