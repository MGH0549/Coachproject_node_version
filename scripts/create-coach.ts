import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ArgonCrypto } from '../src/infrastructure/auth/crypto';
async function main() {
  const email = process.env.COACH_EMAIL?.toLowerCase();
  const password = process.env.COACH_PASSWORD;
  if (
    !email ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !password ||
    password.length < 12 ||
    password.length > 128 ||
    !/\p{L}/u.test(password) ||
    !/\d/.test(password)
  )
    throw new Error(
      'Set COACH_EMAIL and COACH_PASSWORD (12–128 characters, letters and digits) in your environment',
    );
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  try {
    await db.$transaction(async (tx) => {
      // One coach today. Serialize provisioning without placing credentials in a migration.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(70300601)`;
      if (await tx.user.count({ where: { role: 'Coach' } }))
        throw new Error('A coach already exists');
      await tx.user.create({
        data: {
          email,
          passwordHash: await new ArgonCrypto().hash(password),
          role: 'Coach',
          consentAt: new Date(),
        },
      });
    });
    console.log('Coach created');
  } finally {
    await db.$disconnect();
  }
}
void main().catch(() => {
  console.error(
    'Coach creation failed. Check credentials, database access, and whether a coach already exists.',
  );
  process.exitCode = 1;
});
