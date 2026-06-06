import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export const hashPassword = async (password: string): Promise<string> => bcrypt.hash(password, SALT_ROUNDS);

export const verifyPassword = async (password: string, passwordHash: string): Promise<boolean> =>
  bcrypt.compare(password, passwordHash);
