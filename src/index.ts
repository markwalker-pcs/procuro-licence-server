import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { errorHandler } from './middleware/errorHandler';
import { checkInRateLimiter } from './middleware/rateLimiter';
import { BUILD_ID } from './buildInfo';
import { initialiseKeys } from './services/cryptoService';
import { requireAdminAuth, authRouter } from './middleware/adminAuth';

// Route imports
import checkInRoutes from './routes/checkIn';
import customerRoutes from './routes/admin/customers';
import licenceRoutes from './routes/admin/licences';
import instanceRoutes from './routes/admin/instances';
import dashboardRoutes from './routes/admin/dashboard';
import deploymentRoutes from './routes/admin/deployments';
import tenantConfigRoutes from './routes/admin/tenantConfig';

const app = express();

// ─────────────────────────────────────────────
// Global middleware
// ─────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// ─────────────────────────────────────────────
// Health check (no auth required)
// ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pro-curo-licence-server', build: BUILD_ID });
});

// ─────────────────────────────────────────────
// Instance-facing API (used by Pro-curo V5)
// Reference: Architecture Doc, Section 7.1
// ─────────────────────────────────────────────
app.use('/api/v1', checkInRateLimiter, checkInRoutes);

// ─────────────────────────────────────────────
// Auth API (dev login — replaced by Azure AD SSO in production)
// ─────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ─────────────────────────────────────────────
// Admin API (used by Admin Portal)
// Reference: Architecture Doc, Section 7.2
// Protected by JWT auth (dev) / Azure AD SSO (production)
// ─────────────────────────────────────────────
app.use('/api/admin/customers', requireAdminAuth, customerRoutes);
app.use('/api/admin/licences', requireAdminAuth, licenceRoutes);
app.use('/api/admin/instances', requireAdminAuth, instanceRoutes);
app.use('/api/admin/dashboard', requireAdminAuth, dashboardRoutes);
app.use('/api/admin/deployments', requireAdminAuth, deploymentRoutes);
app.use('/api/admin/tenant-config', requireAdminAuth, tenantConfigRoutes);

// ─────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────
app.use(errorHandler);

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
async function main() {
  try {
    // Test database connection
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Initialise Ed25519 keys (generates dev keypair if not found)
    initialiseKeys();

    app.listen(config.port, () => {
      logger.info(`Pro-curo Licence Server running on port ${config.port}`, {
        environment: config.nodeEnv,
        port: config.port,
        build: BUILD_ID,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

main();
