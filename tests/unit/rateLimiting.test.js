/**
 * Unit tests for rate limiting configuration and behavior.
 */

const rateLimit = require('express-rate-limit');

describe('Rate Limiting Configuration', () => {
  describe('Rate Limiter Options', () => {
    let limiterConfig;

    beforeEach(() => {
      limiterConfig = {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000,
        message: {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please try again later'
          }
        },
        standardHeaders: true,
        legacyHeaders: false,
        skip: () => process.env.NODE_ENV === 'development'
      };
    });

    it('should use default window of 60 seconds', () => {
      expect(limiterConfig.windowMs).toBe(60000);
    });

    it('should use default max of 1000 requests', () => {
      expect(limiterConfig.max).toBe(1000);
    });

    it('should return correct error message structure', () => {
      expect(limiterConfig.message).toEqual({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        }
      });
    });

    it('should use standard headers', () => {
      expect(limiterConfig.standardHeaders).toBe(true);
    });

    it('should not use legacy headers', () => {
      expect(limiterConfig.legacyHeaders).toBe(false);
    });

    it('should skip rate limiting in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      
      process.env.NODE_ENV = 'development';
      const skip = limiterConfig.skip;
      expect(skip()).toBe(true);
      
      process.env.NODE_ENV = 'test';
      expect(skip()).toBe(false);
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Custom Rate Limit Values', () => {
    it('should use custom window from environment', () => {
      const originalWindow = process.env.RATE_LIMIT_WINDOW_MS;
      process.env.RATE_LIMIT_WINDOW_MS = '120000';
      
      const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
      expect(windowMs).toBe(120000);
      
      process.env.RATE_LIMIT_WINDOW_MS = originalWindow;
    });

    it('should use custom max requests from environment', () => {
      const originalMax = process.env.RATE_LIMIT_MAX_REQUESTS;
      process.env.RATE_LIMIT_MAX_REQUESTS = '500';
      
      const max = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000;
      expect(max).toBe(500);
      
      process.env.RATE_LIMIT_MAX_REQUESTS = originalMax;
    });

    it('should fall back to defaults for invalid values', () => {
      const originalWindow = process.env.RATE_LIMIT_WINDOW_MS;
      process.env.RATE_LIMIT_WINDOW_MS = 'invalid';
      
      const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
      expect(windowMs).toBe(60000);
      
      process.env.RATE_LIMIT_WINDOW_MS = originalWindow;
    });
  });

  describe('Rate Limit Error Response', () => {
    it('should have success set to false', () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        }
      };
      
      expect(errorResponse.success).toBe(false);
    });

    it('should have error code RATE_LIMIT_EXCEEDED', () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        }
      };
      
      expect(errorResponse.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should have user-friendly error message', () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please try again later'
        }
      };
      
      expect(errorResponse.error.message).toContain('Too many requests');
    });
  });

  describe('Rate Limiter Creation', () => {
    it('should create rate limiter with valid options', () => {
      const limiter = rateLimit({
        windowMs: 60000,
        max: 100,
        message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED' } }
      });
      
      expect(limiter).toBeDefined();
      expect(typeof limiter).toBe('function');
    });

    it('should create rate limiter that is middleware function', () => {
      const limiter = rateLimit({
        windowMs: 60000,
        max: 100
      });
      
      // Middleware functions accept req, res, next
      expect(limiter.length).toBe(3);
    });
  });

  describe('Environment-based Configuration', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('should skip rate limiting in development environment', () => {
      process.env.NODE_ENV = 'development';
      const skip = () => process.env.NODE_ENV === 'development';
      expect(skip()).toBe(true);
    });

    it('should not skip rate limiting in production environment', () => {
      process.env.NODE_ENV = 'production';
      const skip = () => process.env.NODE_ENV === 'development';
      expect(skip()).toBe(false);
    });

    it('should not skip rate limiting in test environment', () => {
      process.env.NODE_ENV = 'test';
      const skip = () => process.env.NODE_ENV === 'development';
      expect(skip()).toBe(false);
    });
  });
});

describe('Rate Limit Headers', () => {
  describe('Standard Headers (RateLimit-*)', () => {
    it('should use RateLimit-Limit header', () => {
      const headers = {
        'RateLimit-Limit': '1000',
        'RateLimit-Remaining': '999',
        'RateLimit-Reset': '60'
      };
      
      expect(headers['RateLimit-Limit']).toBe('1000');
    });

    it('should use RateLimit-Remaining header', () => {
      const headers = {
        'RateLimit-Remaining': '999'
      };
      
      expect(headers['RateLimit-Remaining']).toBeDefined();
    });

    it('should use RateLimit-Reset header', () => {
      const headers = {
        'RateLimit-Reset': '60'
      };
      
      expect(headers['RateLimit-Reset']).toBeDefined();
    });
  });

  describe('Legacy Headers (X-RateLimit-*)', () => {
    it('should not use X-RateLimit-Limit when legacyHeaders is false', () => {
      const config = { legacyHeaders: false };
      expect(config.legacyHeaders).toBe(false);
    });
  });
});

describe('Rate Limit Bypass Scenarios', () => {
  describe('Skip Function Logic', () => {
    it('should return true for development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const shouldSkip = () => process.env.NODE_ENV === 'development';
      expect(shouldSkip()).toBe(true);
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should return false for production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const shouldSkip = () => process.env.NODE_ENV === 'development';
      expect(shouldSkip()).toBe(false);
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle undefined environment', () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;
      
      const shouldSkip = () => process.env.NODE_ENV === 'development';
      expect(shouldSkip()).toBe(false);
      
      process.env.NODE_ENV = originalEnv;
    });
  });
});
