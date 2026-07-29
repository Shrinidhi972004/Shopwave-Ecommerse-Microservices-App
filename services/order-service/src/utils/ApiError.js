'use strict';

/**
 * Error carrying an HTTP status code, so controllers can `throw` and let the
 * central error handler shape the response.
 */
class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (details) this.details = details;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new ApiError(403, message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }
  static conflict(message = 'Resource already exists') {
    return new ApiError(409, message);
  }
  static unprocessable(message = 'Validation failed', details) {
    return new ApiError(422, message, details);
  }
  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}

/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * pipeline instead of hanging the request.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ApiError, asyncHandler };
