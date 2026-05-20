/**
 * Kasparro AI Backend — Global Error Handler
 */

/**
 * 404 handler — catch requests that don't match any route.
 */
const notFoundHandler = (req, res, _next) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    statusCode: 404,
  });
};

/**
 * Global error handler — consistent JSON error responses.
 *
 * In development mode the full stack trace is included.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  const statusCode = err.statusCode || err.status || 500;
  const isDev = process.env.NODE_ENV !== 'production';

  // Log server errors
  if (statusCode >= 500) {
    console.error('💥  Server error:', {
      method: req.method,
      url: req.originalUrl,
      status: statusCode,
      message: err.message,
      stack: err.stack,
    });
  }

  res.status(statusCode).json({
    error: err.code || 'INTERNAL_ERROR',
    message: isDev ? err.message : 'An unexpected error occurred',
    statusCode,
    ...(isDev && { stack: err.stack }),
  });
};

module.exports = { errorHandler, notFoundHandler };
