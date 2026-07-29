'use strict';

const { ApiError } = require('./ApiError');

/**
 * Minimal schema validator — kept dependency-free on purpose.
 *
 * A schema is a map of field -> rule object:
 *   {
 *     email:    { type: 'email',  required: true },
 *     quantity: { type: 'int',    required: true, min: 1, max: 99 },
 *     role:     { type: 'string', enum: ['customer', 'admin'], default: 'customer' },
 *     address:  { type: 'object', required: true, schema: { city: {...} } }
 *   }
 *
 * validate() returns a NEW object containing only the declared fields, coerced
 * to the declared types. Anything the caller sends that is not in the schema is
 * dropped — so a request can never smuggle in `role: "admin"` or `is_active`.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function checkField(name, raw, rule) {
  const errors = [];
  let value = raw;

  // Normalise "absent": undefined, null, and "" all count as not provided.
  const absent = value === undefined || value === null || value === '';

  if (absent) {
    if (rule.required) {
      errors.push({ field: name, message: `${name} is required` });
      return { errors };
    }
    if (rule.default !== undefined) return { value: rule.default, errors };
    return { skip: true, errors };
  }

  switch (rule.type) {
    case 'string':
    case 'email':
    case 'uuid': {
      if (typeof value !== 'string') {
        errors.push({ field: name, message: `${name} must be a string` });
        break;
      }
      value = rule.trim === false ? value : value.trim();

      if (rule.type === 'email') {
        value = value.toLowerCase();
        if (!EMAIL_RE.test(value)) {
          errors.push({ field: name, message: `${name} must be a valid email address` });
        }
      }
      if (rule.type === 'uuid' && !UUID_RE.test(value)) {
        errors.push({ field: name, message: `${name} must be a valid UUID` });
      }
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        errors.push({ field: name, message: `${name} must be at least ${rule.minLength} characters` });
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        errors.push({ field: name, message: `${name} must be at most ${rule.maxLength} characters` });
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push({ field: name, message: rule.patternMessage || `${name} has an invalid format` });
      }
      break;
    }

    case 'int':
    case 'number': {
      const num = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(num)) {
        errors.push({ field: name, message: `${name} must be a number` });
        break;
      }
      if (rule.type === 'int' && !Number.isInteger(num)) {
        errors.push({ field: name, message: `${name} must be a whole number` });
        break;
      }
      if (rule.min !== undefined && num < rule.min) {
        errors.push({ field: name, message: `${name} must be at least ${rule.min}` });
      }
      if (rule.max !== undefined && num > rule.max) {
        errors.push({ field: name, message: `${name} must be at most ${rule.max}` });
      }
      value = num;
      break;
    }

    case 'boolean': {
      if (typeof value === 'boolean') break;
      const s = String(value).toLowerCase();
      if (s === 'true' || s === '1') value = true;
      else if (s === 'false' || s === '0') value = false;
      else errors.push({ field: name, message: `${name} must be true or false` });
      break;
    }

    case 'array': {
      if (!Array.isArray(value)) {
        errors.push({ field: name, message: `${name} must be an array` });
        break;
      }
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        errors.push({ field: name, message: `${name} must contain at least ${rule.minLength} item(s)` });
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        errors.push({ field: name, message: `${name} must contain at most ${rule.maxLength} item(s)` });
      }
      break;
    }

    case 'object': {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push({ field: name, message: `${name} must be an object` });
        break;
      }
      // Recurse into a nested schema, prefixing child field names so the client
      // gets "shippingAddress.postalCode" rather than a bare "postalCode".
      if (rule.schema) {
        const nested = collect(value, rule.schema);
        if (nested.errors.length > 0) {
          errors.push(
            ...nested.errors.map((e) => ({ ...e, field: `${name}.${e.field}` }))
          );
        }
        value = nested.value;
      }
      break;
    }

    default:
      throw new Error(`validate: unknown rule type "${rule.type}" for field "${name}"`);
  }

  if (rule.enum && !errors.length && !rule.enum.includes(value)) {
    errors.push({ field: name, message: `${name} must be one of: ${rule.enum.join(', ')}` });
  }

  return { value, errors };
}

/** Validate without throwing — returns { value, errors }. Used for recursion. */
function collect(source, schema) {
  const value = {};
  const errors = [];
  const input = source && typeof source === 'object' ? source : {};

  for (const [name, rule] of Object.entries(schema)) {
    const result = checkField(name, input[name], rule);
    errors.push(...result.errors);
    if (!result.skip && result.errors.length === 0) value[name] = result.value;
  }
  return { value, errors };
}

/**
 * Validate `source` against `schema`.
 * @throws {ApiError} 422 with a `details` array listing every failed field.
 */
function validate(source, schema) {
  const { value, errors } = collect(source, schema);
  if (errors.length > 0) {
    throw ApiError.unprocessable('Validation failed', errors);
  }
  return value;
}

/**
 * Express middleware factory.
 * Replaces req.body with the validated, whitelisted result.
 */
const validateBody = (schema) => (req, _res, next) => {
  try {
    req.body = validate(req.body, schema);
    next();
  } catch (err) {
    next(err);
  }
};

const validateQuery = (schema) => (req, _res, next) => {
  try {
    // Express 5 makes req.query a getter-only property, so the sanitised copy
    // lives on req.validatedQuery. Handlers must read that, not req.query.
    req.validatedQuery = validate(req.query, schema);
    next();
  } catch (err) {
    next(err);
  }
};

const validateParams = (schema) => (req, _res, next) => {
  try {
    req.params = { ...req.params, ...validate(req.params, schema) };
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  validate,
  collect,
  validateBody,
  validateQuery,
  validateParams,
  UUID_RE,
  EMAIL_RE,
};
