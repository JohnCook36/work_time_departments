import { PrismaClient } from '@prisma/client';

import {
  assertDemoSeedEnvironment,
  seedOwnerDemo,
} from './owner-demo-seed';

async function main() {
  assertDemoSeedEnvironment({
    databaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    confirmation: process.env.DEMO_SEED_CONFIRM,
  });

  const timeZone = process.env.BUSINESS_TIME_ZONE?.trim();
  if (!timeZone) {
    throw new Error('BUSINESS_TIME_ZONE is required');
  }

  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(tx =>
      seedOwnerDemo(tx, { timeZone }),
    );

    console.log('Synthetic owner demo seed: PASS');
    console.log('Date: ' + result.date);
    console.log('Department: ' + result.departmentName);
    console.log('Publication version: ' + result.publicationVersion);
    console.log('Manager demo phone: ' + result.managerPhone);
    console.log('Employee demo phones: ' + result.employeePhones.join(', '));
    console.log('No real employee data was created by this seed.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch(error => {
  console.error(
    error instanceof Error ? error.message : 'Owner demo seed failed',
  );
  process.exitCode = 1;
});
