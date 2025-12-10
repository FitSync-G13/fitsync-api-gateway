// Test environment setup for API Gateway
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.USER_SERVICE_URL = 'http://localhost:3001';
process.env.TRAINING_SERVICE_URL = 'http://localhost:3002';
process.env.SCHEDULE_SERVICE_URL = 'http://localhost:8003';
process.env.PROGRESS_SERVICE_URL = 'http://localhost:8004';
process.env.NOTIFICATION_SERVICE_URL = 'http://localhost:3005';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.RATE_LIMIT_MAX_REQUESTS = '1000';
process.env.LOG_LEVEL = 'error'; // Reduce logging noise in tests

// Suppress console output during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
};
