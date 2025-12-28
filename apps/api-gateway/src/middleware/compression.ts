import compression from 'compression';
import { Request, Response } from 'express';

/**
 * Response compression middleware.
 *
 * Compresses responses using gzip/deflate when the client supports it.
 * Skips compression for already-compressed content types (images, etc.)
 * and for small payloads where compression overhead is not worthwhile.
 */
export const compressionMiddleware = compression({
  /**
   * Decide whether to compress the response.
   */
  filter(req: Request, res: Response): boolean {
    // Do not compress if the client explicitly asks not to
    if (req.headers['x-no-compression']) {
      return false;
    }

    // Skip compression for server-sent events
    const contentType = res.getHeader('content-type');
    if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
      return false;
    }

    // Use compression's default filter for everything else
    return compression.filter(req, res);
  },

  /** Minimum response size in bytes before compressing (1 KB) */
  threshold: 1024,

  /** Compression level: 6 is a good balance between speed and ratio */
  level: 6,
});
