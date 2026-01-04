/**
 * Custom Error Classes
 * Provides type-safe error handling with HTTP status codes
 */

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string) {
    super(message, 500, 'CONFIGURATION_ERROR');
  }
}

export class PayPalError extends AppError {
  constructor(message: string, public paypalError?: any) {
    super(`PayPal Error: ${message}`, 500, 'PAYPAL_ERROR');
  }
}

export class GoogleGroupsError extends AppError {
  constructor(message: string, public originalError?: any) {
    super(`Google Groups Error: ${message}`, 500, 'GOOGLE_GROUPS_ERROR');
  }
}
