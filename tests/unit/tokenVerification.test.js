/**
 * Unit tests for JWT token verification middleware.
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-jwt-secret-key';

// Helper to create mock request/response objects
function createMockReqRes() {
  const req = {
    headers: {},
    path: '/test',
    method: 'GET'
  };
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn()
  };
  const next = jest.fn();
  return { req, res, next };
}

// Recreate the verifyToken middleware logic for testing
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // Allow through - let individual services handle auth
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'fitsync-user-service',
      audience: 'fitsync-api'
    });
    req.user = decoded;
  } catch (error) {
    // Don't block - let service handle
  }

  next();
}

describe('Token Verification Middleware', () => {
  describe('Token Extraction', () => {
    it('should call next without user when no Authorization header', () => {
      const { req, res, next } = createMockReqRes();
      
      verifyToken(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should call next without user when Authorization header missing Bearer prefix', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = 'Basic sometoken';
      
      verifyToken(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should call next without user when Authorization header is empty', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = '';
      
      verifyToken(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should call next without user for Bearer only (no token)', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = 'Bearer ';
      
      verifyToken(req, res, next);
      
      // Should still call next even with empty token (verification will fail)
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Valid Token Processing', () => {
    it('should set req.user with decoded payload for valid token', () => {
      const { req, res, next } = createMockReqRes();
      const payload = { id: 'user-123', role: 'client', email: 'test@example.com' };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api',
        expiresIn: '1h'
      });
      req.headers.authorization = `Bearer ${token}`;
      
      verifyToken(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe('user-123');
      expect(req.user.role).toBe('client');
      expect(req.user.email).toBe('test@example.com');
    });

    it('should include all standard JWT claims in req.user', () => {
      const { req, res, next } = createMockReqRes();
      const payload = { id: 'user-456', role: 'trainer', name: 'John Doe' };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api',
        expiresIn: '1h'
      });
      req.headers.authorization = `Bearer ${token}`;
      
      verifyToken(req, res, next);
      
      expect(req.user.iss).toBe('fitsync-user-service');
      expect(req.user.aud).toBe('fitsync-api');
      expect(req.user.iat).toBeDefined();
      expect(req.user.exp).toBeDefined();
    });

    it('should handle admin role token', () => {
      const { req, res, next } = createMockReqRes();
      const payload = { id: 'admin-1', role: 'admin', permissions: ['all'] };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api'
      });
      req.headers.authorization = `Bearer ${token}`;
      
      verifyToken(req, res, next);
      
      expect(req.user.role).toBe('admin');
      expect(req.user.permissions).toEqual(['all']);
    });
  });

  describe('Invalid Token Handling', () => {
    it('should call next without blocking for expired token', () => {
      const { req, res, next } = createMockReqRes();
      const payload = { id: 'user-123', role: 'client' };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api',
        expiresIn: '-1h' // Already expired
      });
      req.headers.authorization = `Bearer ${token}`;
      
      verifyToken(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should call next without blocking for invalid signature', () => {
      const { req, res, next } = createMockReqRes();
      const payload = { id: 'user-123', role: 'client' };
      const token = jwt.sign(payload, 'wrong-secret', {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api'
      });
      req.headers.authorization = `Bearer ${token}`;
      
      verifyToken(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should call next without blocking for wrong issuer', () => {
      const { req, res, next } = createMockReqRes();
      const payload = { id: 'user-123', role: 'client' };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'wrong-issuer',
        audience: 'fitsync-api'
      });
      req.headers.authorization = `Bearer ${token}`;
      
      verifyToken(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should call next without blocking for wrong audience', () => {
      const { req, res, next } = createMockReqRes();
      const payload = { id: 'user-123', role: 'client' };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'wrong-audience'
      });
      req.headers.authorization = `Bearer ${token}`;
      
      verifyToken(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should call next without blocking for malformed token', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = 'Bearer not.a.valid.jwt.token';
      
      verifyToken(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('should call next without blocking for completely invalid token', () => {
      const { req, res, next } = createMockReqRes();
      req.headers.authorization = 'Bearer invalidtoken';
      
      verifyToken(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });
  });

  describe('Token Payload Variations', () => {
    it('should handle token with additional custom claims', () => {
      const { req, res, next } = createMockReqRes();
      const payload = {
        id: 'user-123',
        role: 'trainer',
        specializations: ['yoga', 'pilates'],
        gym_id: 'gym-1'
      };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api'
      });
      req.headers.authorization = `Bearer ${token}`;
      
      verifyToken(req, res, next);
      
      expect(req.user.specializations).toEqual(['yoga', 'pilates']);
      expect(req.user.gym_id).toBe('gym-1');
    });

    it('should handle token with minimal payload', () => {
      const { req, res, next } = createMockReqRes();
      const payload = { id: 'user-minimal' };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api'
      });
      req.headers.authorization = `Bearer ${token}`;
      
      verifyToken(req, res, next);
      
      expect(req.user.id).toBe('user-minimal');
      expect(req.user.role).toBeUndefined();
    });
  });
});

describe('JWT Helper Functions', () => {
  describe('Token Generation', () => {
    it('should generate valid JWT with all required claims', () => {
      const payload = { id: 'user-123', role: 'client' };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api',
        expiresIn: '24h'
      });
      
      expect(typeof token).toBe('string');
      expect(token.split('.').length).toBe(3);
    });

    it('should create token that can be decoded', () => {
      const payload = { id: 'test-user', role: 'admin' };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api'
      });
      
      const decoded = jwt.decode(token);
      expect(decoded.id).toBe('test-user');
      expect(decoded.role).toBe('admin');
    });
  });

  describe('Token Verification Options', () => {
    it('should verify token with correct options', () => {
      const payload = { id: 'user-123' };
      const token = jwt.sign(payload, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api'
      });
      
      const decoded = jwt.verify(token, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api'
      });
      
      expect(decoded.id).toBe('user-123');
    });

    it('should throw for token verified with wrong issuer', () => {
      const token = jwt.sign({ id: 'user-123' }, JWT_SECRET, {
        issuer: 'fitsync-user-service',
        audience: 'fitsync-api'
      });
      
      expect(() => {
        jwt.verify(token, JWT_SECRET, {
          issuer: 'wrong-issuer',
          audience: 'fitsync-api'
        });
      }).toThrow();
    });
  });
});
