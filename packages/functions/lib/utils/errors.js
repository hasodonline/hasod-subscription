"use strict";
/**
 * Custom Error Classes
 * Provides type-safe error handling with HTTP status codes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleGroupsError = exports.PayPalError = exports.ConfigurationError = exports.ForbiddenError = exports.UnauthorizedError = exports.NotFoundError = exports.ValidationError = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, statusCode = 500, code) {
        super(message);
        this.message = message;
        this.statusCode = statusCode;
        this.code = code;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.AppError = AppError;
class ValidationError extends AppError {
    constructor(message) {
        super(message, 400, 'VALIDATION_ERROR');
    }
}
exports.ValidationError = ValidationError;
class NotFoundError extends AppError {
    constructor(resource) {
        super(`${resource} not found`, 404, 'NOT_FOUND');
    }
}
exports.NotFoundError = NotFoundError;
class UnauthorizedError extends AppError {
    constructor(message = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED');
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403, 'FORBIDDEN');
    }
}
exports.ForbiddenError = ForbiddenError;
class ConfigurationError extends AppError {
    constructor(message) {
        super(message, 500, 'CONFIGURATION_ERROR');
    }
}
exports.ConfigurationError = ConfigurationError;
class PayPalError extends AppError {
    constructor(message, paypalError) {
        super(`PayPal Error: ${message}`, 500, 'PAYPAL_ERROR');
        this.paypalError = paypalError;
    }
}
exports.PayPalError = PayPalError;
class GoogleGroupsError extends AppError {
    constructor(message, originalError) {
        super(`Google Groups Error: ${message}`, 500, 'GOOGLE_GROUPS_ERROR');
        this.originalError = originalError;
    }
}
exports.GoogleGroupsError = GoogleGroupsError;
