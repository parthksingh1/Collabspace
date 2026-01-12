import express from 'express';
import cors from 'cors';
import { config } from './config';
import { logger } from './utils/logger';
import { codeRoutes } from './routes/code.routes';

const app = express();

app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '5mb' }));

app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'code-service', timestamp: new Date().toISOString() });
});

app.use('/code', codeRoutes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
});

app.listen(config.port, () => {
  logger.info(`Code service listening on port ${config.port}`);
});

export default app;
