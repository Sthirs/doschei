import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Group } from './Group';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar', name: 'password_hash', nullable: true })
  passwordHash?: string | null;

  @Column({ type: 'varchar', name: 'display_name' })
  displayName!: string;

  @Column({ type: 'varchar', length: 8, default: 'en' })
  language!: string;

  @ManyToMany(() => Group, (group) => group.members)
  groups!: Group[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
