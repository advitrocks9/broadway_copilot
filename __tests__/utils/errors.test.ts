import { describe, expect, it } from 'vitest';
import {
  BadRequestError,
  createErrorResponse,
  ForbiddenError,
  GatewayTimeoutError,
  HttpError,
  InternalServerError,
  normalizeError,
  NotFoundError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../src/utils/errors';

describe('HttpError', () => {
  it('sets the correct status code and message', () => {
    const error = new HttpError('something went wrong', 418);
    expect(error.message).toBe('something went wrong');
    expect(error.statusCode).toBe(418);
    expect(error.name).toBe('HttpError');
    expect(error).toBeInstanceOf(Error);
  });

  it('defaults to status 500', () => {
    const error = new HttpError('server error');
    expect(error.statusCode).toBe(500);
  });

  it('preserves the cause option', () => {
    const cause = new Error('root cause');
    const error = new HttpError('wrapper', 500, { cause });
    expect(error.cause).toBe(cause);
  });
});

describe('specific error classes', () => {
  const cases: [string, new (msg: string) => HttpError, number][] = [
    ['BadRequestError', BadRequestError, 400],
    ['UnauthorizedError', UnauthorizedError, 401],
    ['ForbiddenError', ForbiddenError, 403],
    ['NotFoundError', NotFoundError, 404],
    ['TooManyRequestsError', TooManyRequestsError, 429],
    ['InternalServerError', InternalServerError, 500],
    ['ServiceUnavailableError', ServiceUnavailableError, 503],
    ['GatewayTimeoutError', GatewayTimeoutError, 504],
  ];

  it.each(cases)('%s sets status code %i', (name, ErrorClass, expectedCode) => {
    const error = new ErrorClass('test message');
    expect(error.statusCode).toBe(expectedCode);
    expect(error.name).toBe(name);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('normalizeError', () => {
  it('returns an HttpError unchanged', () => {
    const original = new BadRequestError('bad input');
    const result = normalizeError(original);
    expect(result).toBe(original);
  });

  it('wraps a plain Error into an InternalServerError', () => {
    const original = new Error('plain error');
    const result = normalizeError(original);
    expect(result).toBeInstanceOf(InternalServerError);
    expect(result.statusCode).toBe(500);
    expect(result.message).toBe('plain error');
    expect(result.cause).toBe(original);
  });

  it('wraps a non-Error value into an InternalServerError', () => {
    const result = normalizeError('string error');
    expect(result).toBeInstanceOf(InternalServerError);
    expect(result.statusCode).toBe(500);
    expect(result.message).toBe('An unknown error occurred');
  });
});

describe('createErrorResponse', () => {
  it('returns the expected shape', () => {
    const error = new NotFoundError('not found');
    const response = createErrorResponse(error);
    expect(response).toEqual({
      error: {
        message: 'not found',
        statusCode: 404,
      },
    });
  });
});
