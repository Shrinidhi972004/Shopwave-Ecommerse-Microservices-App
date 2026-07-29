'use strict';

const { ApiError } = require('../utils/ApiError');
const config = require('../config/env');

/** 404 for anything no route matched. */
function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

/**
 * Central error handler. Must be registered last and must keep all four
 * arguments — Express identifies error middleware by arity.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  // Translate Postgres errors into something a client can act on, without
  // leaking table names or SQL text.
  switch (err.code) {
    case '23505': // unique_violation
      status = 409;
      message = 'That record already exists';
      break;
    case '23503': // foreign_key_violation
      status = 400;
      message = 'Referenced record does not exist';
      break;
    case '23514': // check_violation
      status = 400;
      message = 'A field failed a database constraint';
      break;
    case '22P02': // invalid_text_representation (e.g. bad UUID)
      status = 400;
      message = 'Malformed identifier in request';
      break;
    case 'ECONNREFUSED':
      status = 503;
      message = 'Database unavailable';
      break;
    default:
      break;
  }

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  }

  if (status >= 500) {
    console.error(`[${config.serviceName}] ${req.method} ${req.originalUrl} ->`, err);
  }

  const body = {
    error: {
      status,
      message: status >= 500 && config.env === 'production' ? 'Internal server error' : message,
    },
  };
  if (details) body.error.details = details;
  if (config.env === 'development' && status >= 500) body.error.stack = err.stack;

  res.status(status).json(body);
}

module.exports = { notFoundHandler, errorHandler };
