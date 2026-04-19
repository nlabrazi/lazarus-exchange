import {
  decodeUtf8Text,
  errorMessageFromUnknown,
  readPositiveIntEnv,
} from './exchange-shared.utils';

describe('exchange-shared.utils', () => {
  afterEach(() => {
    delete process.env.TEST_POSITIVE_INT_ENV;
  });

  it('falls back when numeric env values are empty or invalid', () => {
    process.env.TEST_POSITIVE_INT_ENV = '';
    expect(readPositiveIntEnv('TEST_POSITIVE_INT_ENV', 10)).toBe(10);

    process.env.TEST_POSITIVE_INT_ENV = '0';
    expect(readPositiveIntEnv('TEST_POSITIVE_INT_ENV', 10)).toBe(10);

    process.env.TEST_POSITIVE_INT_ENV = 'abc';
    expect(readPositiveIntEnv('TEST_POSITIVE_INT_ENV', 10)).toBe(10);
  });

  it('decodes utf-8 text with a safe fallback path', () => {
    expect(decodeUtf8Text(Buffer.from('hello', 'utf8'))).toBe('hello');
    expect(decodeUtf8Text(Buffer.from([0xff]))).toContain('\uFFFD');
  });

  it('extracts a readable error message from unknown values', () => {
    expect(errorMessageFromUnknown(new Error('boom'))).toBe('boom');
    expect(errorMessageFromUnknown({ message: 'custom failure' })).toBe(
      'custom failure',
    );
    expect(errorMessageFromUnknown(null)).toBe('Unknown error');
  });
});
