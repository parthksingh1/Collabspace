import express from 'express';
import cors from 'cors';
import { config } from './config';
import { logger } from './utils/logger';
import { aiRoutes } from './routes/ai.routes';
import { agentRoutes } from './routes/agent.routes';
import { memoryRoutes } from './routes/memory.routes';

const app = express();

app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'ai-service', timestamp: new Date().toISOString() });
});

app.use('/ai', aiRoutes);
app.use('/ai/agents', agentRoutes);
app.use('/ai/memory', memoryRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
});

// Start server first, then try Kafka (non-blocking)
const server = app.listen(config.port, () => {
  logger.info(`AI service listening on port ${config.port}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${config.port} already in use. Kill the existing process or use a different port.`);
    process.exit(1);
  }
  throw err;
});

// Connect Kafka in background — don't block startup
(async () => {
  try {
    const { aiProducer } = await import('./kafka/producer');
    const { aiConsumer } = await import('./kafka/consumer');
    await aiProducer.connect();
    await aiConsumer.start();
    logger.info('Kafka connected');
  } catch (err) {
    logger.warn('Kafka unavailable, running without event streaming', { error: (err as Error).message });
  }
})();

export default app;
