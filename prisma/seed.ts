import { PrismaClient, DeploymentModel, AdminRole, LicenceType } from '@prisma/client';
import bcrypt from 'bcrypt';

/**
 * Prisma seed script — creates test data for local development.
 *
 * Run: npx tsx prisma/seed.ts
 * Or:  npm run db:seed
 *
 * Creates:
 *  - 1 admin user (dev@pro-curo.com)
 *  - 2 test customers
 *  - 2 licences (one active, one expiring soon)
 */

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

// Default admin password for development
const DEFAULT_ADMIN_PASSWORD = 'ProCuro2026!';

// Test licence keys (plaintext — these are hashed before storage)
const TEST_LICENCE_KEYS = {
  active: 'PCV5-TEST-AAAA-BBBB-CCCC',
  expiring: 'PCV5-TEST-DDDD-EEEE-FFFF',
  concurrent: 'PCV5-TEST-GGGG-HHHH-JJJJ',
};

async function main() {
  console.log('Seeding licence server database...\n');

  // ─── Admin User ───
  const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, BCRYPT_ROUNDS);
  const adminUser = await prisma.adminUser.upsert({
    where: { email: 'dev@pro-curo.com' },
    update: { passwordHash: hashedPassword },
    create: {
      email: 'dev@pro-curo.com',
      passwordHash: hashedPassword,
      displayName: 'Dev Admin',
      role: AdminRole.ADMIN,
    },
  });
  console.log(`Admin user: ${adminUser.email} (${adminUser.role})`);

  // ─── Test Customer 1: NHS Trust (SaaS) ───
  const customer1 = await prisma.customer.upsert({
    where: { id: 'seed-customer-nhs' },
    update: {},
    create: {
      id: 'seed-customer-nhs',
      customerNumber: 'PCSCN-20260326-0001',
      name: 'Southport NHS Foundation Trust',
      contactEmail: 'lab.manager@southport-nhs.example.com',
      primaryContact: 'Dr Sarah Mitchell',
      deploymentModel: DeploymentModel.SAAS,
      notes: 'Test customer — NHS SaaS deployment',
    },
  });
  console.log(`Customer: ${customer1.name} (${customer1.deploymentModel})`);

  // ─── Test Customer 2: Biotech (On-Premises) ───
  const customer2 = await prisma.customer.upsert({
    where: { id: 'seed-customer-biotech' },
    update: {},
    create: {
      id: 'seed-customer-biotech',
      customerNumber: 'PCSCN-20260326-0002',
      name: 'Meridian Biotech Ltd',
      contactEmail: 'it@meridian-biotech.example.com',
      primaryContact: 'James Wheeler',
      deploymentModel: DeploymentModel.ON_PREMISES,
      notes: 'Test customer — On-premises air-gapped deployment',
    },
  });
  console.log(`Customer: ${customer2.name} (${customer2.deploymentModel})`);

  // ─── Licence 1: Per-user, active, 25 users, expires in 6 months ───
  const hashedKey1 = await bcrypt.hash(TEST_LICENCE_KEYS.active, BCRYPT_ROUNDS);
  const licence1 = await prisma.licence.upsert({
    where: { id: 'seed-licence-active' },
    update: {},
    create: {
      id: 'seed-licence-active',
      customerId: customer1.id,
      licenceKey: hashedKey1,
      licenceType: LicenceType.PER_USER,
      licensedUsers: 25,
      gracePeriodDays: 30,
      deploymentModel: DeploymentModel.SAAS,
      expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 6 months
      createdBy: adminUser.id,
      notes: 'Test licence — per-user, active, 25 users',
    },
  });
  console.log(`Licence: ${licence1.id} — PER_USER, 25 users, expires ${licence1.expiryDate.toISOString().split('T')[0]}`);

  // ─── Licence 2: Per-user, expiring in 14 days, 10 users ───
  const hashedKey2 = await bcrypt.hash(TEST_LICENCE_KEYS.expiring, BCRYPT_ROUNDS);
  const licence2 = await prisma.licence.upsert({
    where: { id: 'seed-licence-expiring' },
    update: {},
    create: {
      id: 'seed-licence-expiring',
      customerId: customer2.id,
      licenceKey: hashedKey2,
      licenceType: LicenceType.PER_USER,
      licensedUsers: 10,
      gracePeriodDays: 7,
      deploymentModel: DeploymentModel.ON_PREMISES,
      expiryDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
      createdBy: adminUser.id,
      notes: 'Test licence — per-user, expiring soon, 10 users',
    },
  });
  console.log(`Licence: ${licence2.id} — PER_USER, 10 users, expires ${licence2.expiryDate.toISOString().split('T')[0]}`);

  // ─── Licence 3: Concurrent, active, 5 concurrent sessions, expires in 12 months ───
  // Simulates an upgrade customer transitioning from old procuro.lic file
  const hashedKey3 = await bcrypt.hash(TEST_LICENCE_KEYS.concurrent, BCRYPT_ROUNDS);
  const licence3 = await prisma.licence.upsert({
    where: { id: 'seed-licence-concurrent' },
    update: {},
    create: {
      id: 'seed-licence-concurrent',
      customerId: customer2.id,
      licenceKey: hashedKey3,
      licenceType: LicenceType.CONCURRENT,
      licensedUsers: 5, // 5 simultaneous sessions allowed
      gracePeriodDays: 30,
      deploymentModel: DeploymentModel.ON_PREMISES,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 12 months
      createdBy: adminUser.id,
      notes: 'Test licence — concurrent, 5 sessions, upgrade customer from V4',
    },
  });
  console.log(`Licence: ${licence3.id} — CONCURRENT, 5 sessions, expires ${licence3.expiryDate.toISOString().split('T')[0]}`);

  console.log('\n─── Seed complete ───');
  console.log('\nAdmin credentials:');
  console.log(`  Email:    dev@pro-curo.com`);
  console.log(`  Password: ${DEFAULT_ADMIN_PASSWORD}`);
  console.log('\nTest licence keys (plaintext — use these for check-in testing):');
  console.log(`  Active (per-user):     ${TEST_LICENCE_KEYS.active}`);
  console.log(`  Expiring (per-user):   ${TEST_LICENCE_KEYS.expiring}`);
  console.log(`  Concurrent:            ${TEST_LICENCE_KEYS.concurrent}`);
  console.log('\nThese keys are stored as bcrypt hashes in the database.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
