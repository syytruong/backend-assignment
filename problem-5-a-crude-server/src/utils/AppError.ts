export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    // Preserve prototype chain when extending built-ins under TS
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static notFound(resource: string, id?: string): AppError {
    return new AppError(
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      404,
      'NOT_FOUND',
    );
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }

  static validation(details: unknown): AppError {
    return new AppError('Validation failed', 422, 'VALIDATION_ERROR', details);
  }
}
