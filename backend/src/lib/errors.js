export class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export const badRequest = (message, details) =>
  new AppError(message, { statusCode: 400, code: 'BAD_REQUEST', details });

export const unauthorized = (message = 'Unauthorized') =>
  new AppError(message, { statusCode: 401, code: 'UNAUTHORIZED' });

export const forbidden = (message = 'Forbidden') =>
  new AppError(message, { statusCode: 403, code: 'FORBIDDEN' });

export const notFound = (message = 'Not found') =>
  new AppError(message, { statusCode: 404, code: 'NOT_FOUND' });

export const conflict = (message, details) =>
  new AppError(message, { statusCode: 409, code: 'CONFLICT', details });

export const notImplemented = (feature) =>
  new AppError(`${feature} not implemented`, { statusCode: 501, code: 'NOT_IMPLEMENTED' });
