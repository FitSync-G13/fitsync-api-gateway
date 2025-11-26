require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const jwt = require('jsonwebtoken');
const logger = require('./config/logger');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 4000;

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Service URLs
const services = {
  user: process.env.USER_SERVICE_URL || 'http://localhost:3001',
  training: process.env.TRAINING_SERVICE_URL || 'http://localhost:3002',
  schedule: process.env.SCHEDULE_SERVICE_URL || 'http://localhost:8003',
  progress: process.env.PROGRESS_SERVICE_URL || 'http://localhost:8004',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005'
};

// Middleware
app.use(helmet());
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Correlation ID middleware
app.use((req, res, next) => {
  req.correlationId = uuidv4();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
});

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    correlationId: req.correlationId,
    ip: req.ip
  });
  next();
});

// Rate limiting - Relaxed for development
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // 1000 requests per minute
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'development' // Disable in development
});

app.use('/api/', limiter);

// JWT verification middleware (optional - services also verify)
const verifyToken = (req, res, next) => {
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
    logger.debug('Token verified', { userId: decoded.id, role: decoded.role });
  } catch (error) {
    logger.warn('Token verification failed', { error: error.message });
    // Don't block - let service handle
  }

  next();
};

app.use('/api/', verifyToken);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    services: {
      user: services.user,
      training: services.training,
      schedule: services.schedule,
      progress: services.progress,
      notification: services.notification
    }
  });
});

// Proxy configuration
const proxyOptions = (target) => ({
  target,
  changeOrigin: true,
  onProxyReq: (proxyReq, req) => {
    // Add correlation ID
    proxyReq.setHeader('X-Correlation-ID', req.correlationId);

    // Forward auth header
    if (req.headers.authorization) {
      proxyReq.setHeader('Authorization', req.headers.authorization);
    }

    // Fix for handling body data in POST/PUT/PATCH requests
    if (req.body && Object.keys(req.body).length > 0 && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }

    logger.debug(`Proxying ${req.method} ${req.path} to ${target}`);
  },
  onProxyRes: (proxyRes, req) => {
    logger.debug(`Received response from ${target}`, {
      status: proxyRes.statusCode,
      correlationId: req.correlationId
    });
  },
  onError: (err, req, res) => {
    logger.error(`Proxy error for ${req.path}:`, err);
    res.status(502).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The requested service is temporarily unavailable',
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Composite endpoints (multi-service orchestration)
const axios = require('axios');

// Client Dashboard - aggregates data from multiple services
app.get('/api/dashboard/client/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization;

    // Verify user has permission (clients can only see their own dashboard)
    if (req.user && req.user.role === 'client' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot access other client dashboards' }
      });
    }

    // Parallel requests to multiple services
    const [profile, programs, bookings, analytics] = await Promise.allSettled([
      axios.get(`${services.user}/api/users/${id}`, { headers: { Authorization: token } }),
      axios.get(`${services.training}/api/programs?client_id=${id}&limit=5`, { headers: { Authorization: token } }),
      axios.get(`${services.schedule}/api/bookings?client_id=${id}&status=scheduled&limit=5`, { headers: { Authorization: token } }),
      axios.get(`${services.progress}/api/analytics/client/${id}`, { headers: { Authorization: token } })
    ]);

    res.json({
      success: true,
      data: {
        profile: profile.status === 'fulfilled' ? profile.value.data.data : null,
        active_programs: programs.status === 'fulfilled' ? programs.value.data.data : [],
        upcoming_bookings: bookings.status === 'fulfilled' ? bookings.value.data.data : [],
        progress_summary: analytics.status === 'fulfilled' ? analytics.value.data.data : null
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Client dashboard error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DASHBOARD_ERROR', message: 'Failed to load dashboard' }
    });
  }
});

// Trainer Dashboard - aggregates trainer-specific data
app.get('/api/dashboard/trainer/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const token = req.headers.authorization;

    // Verify user has permission
    if (req.user && req.user.role === 'trainer' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot access other trainer dashboards' }
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Parallel requests
    const [profile, programs, todayBookings, clients] = await Promise.allSettled([
      axios.get(`${services.user}/api/users/${id}`, { headers: { Authorization: token } }),
      axios.get(`${services.training}/api/programs?trainer_id=${id}&status=active&limit=10`, { headers: { Authorization: token } }),
      axios.get(`${services.schedule}/api/bookings?trainer_id=${id}&limit=20`, { headers: { Authorization: token } }),
      axios.get(`${services.user}/api/users?role=client&limit=50`, { headers: { Authorization: token } })
    ]);

    // Filter today's bookings
    let todaySchedule = [];
    if (todayBookings.status === 'fulfilled') {
      todaySchedule = todayBookings.value.data.data.filter(b =>
        b.booking_date === today || new Date(b.booking_date).toISOString().split('T')[0] === today
      );
    }

    res.json({
      success: true,
      data: {
        profile: profile.status === 'fulfilled' ? profile.value.data.data : null,
        active_clients: programs.status === 'fulfilled' ? programs.value.data.data.length : 0,
        today_schedule: todaySchedule,
        recent_programs: programs.status === 'fulfilled' ? programs.value.data.data : []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Trainer dashboard error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DASHBOARD_ERROR', message: 'Failed to load dashboard' }
    });
  }
});

// Admin Dashboard - system overview
app.get('/api/dashboard/admin', verifyToken, async (req, res) => {
  try {
    const token = req.headers.authorization;

    // Verify admin role
    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' }
      });
    }

    // Parallel requests for system stats
    const [users, trainers, clients, programs] = await Promise.allSettled([
      axios.get(`${services.user}/api/users?limit=1`, { headers: { Authorization: token } }),
      axios.get(`${services.user}/api/users?role=trainer&limit=1`, { headers: { Authorization: token } }),
      axios.get(`${services.user}/api/users?role=client&limit=1`, { headers: { Authorization: token } }),
      axios.get(`${services.training}/api/programs?limit=1`, { headers: { Authorization: token } })
    ]);

    res.json({
      success: true,
      data: {
        total_users: users.status === 'fulfilled' ? users.value.data.pagination?.total_count || 0 : 0,
        total_trainers: trainers.status === 'fulfilled' ? trainers.value.data.pagination?.total_count || 0 : 0,
        total_clients: clients.status === 'fulfilled' ? clients.value.data.pagination?.total_count || 0 : 0,
        total_programs: programs.status === 'fulfilled' ? programs.value.data.pagination?.total_count || 0 : 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Admin dashboard error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'DASHBOARD_ERROR', message: 'Failed to load dashboard' }
    });
  }
});

// Booking creation with validation - orchestrates multiple services
app.post('/api/bookings/validated', verifyToken, async (req, res) => {
  try {
    const token = req.headers.authorization;
    const { trainer_id, client_id, booking_date, start_time, end_time, type, gym_id, notes } = req.body;

    // Validate trainer exists
    const trainerCheck = await axios.get(`${services.user}/api/users/${trainer_id}`, {
      headers: { Authorization: token }
    }).catch(() => null);

    if (!trainerCheck || trainerCheck.data.data.role !== 'trainer') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TRAINER', message: 'Invalid trainer ID' }
      });
    }

    // Create booking
    const booking = await axios.post(`${services.schedule}/api/bookings`, {
      trainer_id,
      booking_date,
      start_time,
      end_time,
      type,
      gym_id,
      notes
    }, { headers: { Authorization: token } });

    res.status(201).json(booking.data);
  } catch (error) {
    logger.error('Validated booking creation error:', error);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({
      success: false,
      error: { code: 'BOOKING_FAILED', message: 'Failed to create booking' }
    });
  }
});

// Route definitions
const routes = [
  // User Service
  { path: '/api/auth', target: services.user },
  { path: '/api/users', target: services.user },

  // Training Service
  { path: '/api/exercises', target: services.training },
  { path: '/api/workouts', target: services.training },
  { path: '/api/diets', target: services.training },
  { path: '/api/programs', target: services.training },

  // Schedule Service
  { path: '/api/availability', target: services.schedule },
  { path: '/api/bookings', target: services.schedule },
  { path: '/api/sessions', target: services.schedule },

  // Progress Service
  { path: '/api/metrics', target: services.progress },
  { path: '/api/workout-logs', target: services.progress },
  { path: '/api/health-records', target: services.progress },
  { path: '/api/analytics', target: services.progress },
  { path: '/api/achievements', target: services.progress },

  // Notification Service
  { path: '/api/notifications', target: services.notification }
];

// Apply proxies
routes.forEach(({ path, target }) => {
  app.use(path, createProxyMiddleware(proxyOptions(target)));
  logger.info(`Route registered: ${path} -> ${target}`);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
      path: req.path,
      timestamp: new Date().toISOString()
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    correlationId: req.correlationId
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    }
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('Service routes configured:');
  routes.forEach(({ path, target }) => {
    logger.info(`  ${path} -> ${target}`);
  });
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing server');
  process.exit(0);
});

module.exports = app;
