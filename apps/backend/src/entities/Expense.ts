import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Group } from './Group';
import { User } from './User';

@Entity({ name: 'expenses' })
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  description!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'paid_by_id' })
  paidBy!: User;

  @ManyToOne(() => Group, (group) => group.expenses)
  @JoinColumn({ name: 'group_id' })
  group!: Group;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
