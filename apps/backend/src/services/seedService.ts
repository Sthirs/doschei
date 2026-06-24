import { AppDataSource } from '../db/data-source';
import { Group } from '../entities/Group';
import { User } from '../entities/User';
import { hashPassword } from '../utils/password';

const DEMO_EMAIL = 'demo@doschei.local';

type SeedUser = {
  email: string;
  displayName: string;
};

type SeedGroup = {
  name: string;
  memberEmails: string[];
};

const SEED_USERS: SeedUser[] = [
  { email: 'alice@doschei.local', displayName: 'Alice Rossi' },
  { email: 'bob@doschei.local', displayName: 'Bob Bianchi' },
  { email: 'carol@doschei.local', displayName: 'Carol Colombo' },
];

const SEED_GROUPS: SeedGroup[] = [
  // Existing baseline group, kept for backwards compatibility.
  { name: 'Weekend in Venice', memberEmails: [DEMO_EMAIL] },
  // New groups for exhaustive expense-author testing: shared memberships so
  // some users belong to multiple groups and some belong to only one.
  { name: 'Trip to Rome', memberEmails: [DEMO_EMAIL, 'alice@doschei.local', 'bob@doschei.local'] },
  { name: 'Office Lunch', memberEmails: ['alice@doschei.local', 'carol@doschei.local'] },
];

const COMMON_PASSWORD = 'password123';

export const seedDatabase = async (): Promise<void> => {
  const userRepository = AppDataSource.getRepository(User);
  const groupRepository = AppDataSource.getRepository(Group);

  // Demo user is the canonical seeded credential documented in the README.
  let demoUser = await userRepository.findOne({ where: { email: DEMO_EMAIL }, relations: { groups: true } });

  if (!demoUser) {
    demoUser = userRepository.create({
      email: DEMO_EMAIL,
      displayName: 'Demo User',
      passwordHash: await hashPassword(COMMON_PASSWORD),
    });

    demoUser = await userRepository.save(demoUser);
  }

  // Upsert the additional seed users idempotently.
  const usersByEmail = new Map<string, User>();
  usersByEmail.set(DEMO_EMAIL, demoUser);

  for (const seedUser of SEED_USERS) {
    const existing = await userRepository.findOne({ where: { email: seedUser.email } });

    if (existing) {
      usersByEmail.set(seedUser.email, existing);
      continue;
    }

    const created = userRepository.create({
      email: seedUser.email,
      displayName: seedUser.displayName,
      passwordHash: await hashPassword(COMMON_PASSWORD),
    });

    const saved = await userRepository.save(created);
    usersByEmail.set(seedUser.email, saved);
  }

  // Upsert each seed group idempotently, attaching every declared member.
  for (const seedGroup of SEED_GROUPS) {
    const existingGroup = await groupRepository
      .createQueryBuilder('group')
      .leftJoinAndSelect('group.members', 'member')
      .where('group.name = :name', { name: seedGroup.name })
      .getOne();

    if (existingGroup) {
      // Ensure every declared member is present even if the group already
      // existed from a previous, smaller seed run.
      const missingMembers = seedGroup.memberEmails
        .map((email) => usersByEmail.get(email))
        .filter((user): user is User => user !== undefined)
        .filter((user) => !existingGroup.members.some((m) => m.id === user.id));

      if (missingMembers.length > 0) {
        existingGroup.members.push(...missingMembers);
        await groupRepository.save(existingGroup);
      }

      continue;
    }

    const members = seedGroup.memberEmails
      .map((email) => usersByEmail.get(email))
      .filter((user): user is User => Boolean(user));

    const group = groupRepository.create({
      name: seedGroup.name,
      imageUrl: null,
      members,
    });

    await groupRepository.save(group);
  }
};
