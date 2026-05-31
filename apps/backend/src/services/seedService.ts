import { AppDataSource } from '../db/data-source';
import { Group } from '../entities/Group';
import { User } from '../entities/User';
import { hashPassword } from '../utils/password';

const DEMO_EMAIL = 'demo@doschei.local';

export const seedDatabase = async (): Promise<void> => {
  const userRepository = AppDataSource.getRepository(User);
  const groupRepository = AppDataSource.getRepository(Group);

  let demoUser = await userRepository.findOne({ where: { email: DEMO_EMAIL }, relations: ['groups'] });

  if (!demoUser) {
    demoUser = userRepository.create({
      email: DEMO_EMAIL,
      displayName: 'Demo User',
      passwordHash: await hashPassword('password123'),
    });

    demoUser = await userRepository.save(demoUser);
  }

  const existingGroup = await groupRepository
    .createQueryBuilder('group')
    .leftJoin('group.members', 'member')
    .where('group.name = :name', { name: 'Weekend in Venice' })
    .andWhere('member.id = :memberId', { memberId: demoUser.id })
    .getOne();

  if (!existingGroup) {
    const group = groupRepository.create({
      name: 'Weekend in Venice',
      imageUrl: null,
      members: [demoUser],
    });

    await groupRepository.save(group);
  }
};
