import * as bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  hashedPassword: string,
  password: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}
