import { AppDataSource } from '../db/data-source';
import { User } from '../entities/User';
import { hashPassword, verifyPassword } from '../utils/password';

type LoginInput = {
  email: string;
  password: string;
};

type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
};

export const sanitizeUser = (user: User) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
});

export class AuthService {
  private userRepository = AppDataSource.getRepository(User);

  async register(input: RegisterInput): Promise<User> {
    const existingUser = await this.userRepository.findOne({ where: { email: input.email.toLowerCase() } });

    if (existingUser) {
      throw new Error('A user with this email already exists.');
    }

    const user = this.userRepository.create({
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      passwordHash: await hashPassword(input.password),
    });

    return this.userRepository.save(user);
  }

  async login(input: LoginInput): Promise<User> {
    const user = await this.userRepository.findOne({ where: { email: input.email.toLowerCase() } });

    if (!user || !user.passwordHash) {
      throw new Error('Invalid email or password.');
    }

    const isValidPassword = await verifyPassword(input.password, user.passwordHash);

    if (!isValidPassword) {
      throw new Error('Invalid email or password.');
    }

    return user;
  }

  async findById(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }
}
