const fastify = require('fastify');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const { logger } = require('./utils/logger');
const { connectRedis } = require('./utils/redis');
const { errorHandler } = require('./middleware/errorHandler');
const { authMiddleware } = require('./middleware/auth');
const { rateLimitConfig } = require('./middleware/rateLimit');
const { requestLogger } = require('./middleware/requestLogger');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const courseRoutes = require('./routes/courses');
const progressRoutes = require('./routes/progress');
const analyticsRoutes = require('./routes/analytics');
const healthRoutes = require('./routes/health');

// Create Fastify instance
const app = fastify({
  logger: logger,
  trustProxy: true,
  bodyLimit: 10485760, // 10MB
  querystringParser: { simple: false }
});

// Register plugins
async function registerPlugins() {
  // CORS
  await app.register(require('@fastify/cors'), {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true
  });

  // Security headers
  await app.register(require('@fastify/helmet'), {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  });

  // Compression
  await app.register(require('@fastify/compress'));

  // Rate limiting
  await app.register(require('@fastify/rate-limit'), rateLimitConfig);

  // Redis
  await app.register(require('@fastify/redis'), {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0
  });

  // JWT
  await app.register(require('@fastify/jwt'), {
    secret: process.env.JWT_SECRET,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN || '15m'
    },
    verify: {
      extractToken: (request) => {
        let token = null;
        if (request.headers.authorization) {
          token = request.headers.authorization.replace('Bearer ', '');
        }
        return token;
      }
    }
  });

  // Swagger documentation
  await app.register(require('@fastify/swagger'), {
    swagger: {
      info: {
        title: 'Learning Platform API',
        description: 'API Gateway for Online Learning Platform',
        version: '1.0.0',
        contact: {
          name: 'API Support',
          email: 'api@learningplatform.com'
        }
      },
      host: process.env.API_HOST || 'localhost:3000',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'Users', description: 'User management' },
        { name: 'Courses', description: 'Course management' },
        { name: 'Progress', description: 'Learning progress' },
        { name: 'Analytics', description: 'Analytics and reporting' }
      ],
      securityDefinitions: {
        Bearer: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header'
        }
      },
      security: [{ Bearer: [] }]
    }
  });

  await app.register(require('@fastify/swagger-ui'), {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false
    }
  });

  // Multipart for file uploads
  await app.register(require('@fastify/multipart'), {
    limits: {
      fileSize: 50 * 1024 * 1024 // 50MB
    }
  });
}

// Register middleware
function registerMiddleware() {
  app.addHook('preHandler', requestLogger);
  app.setErrorHandler(errorHandler);
}

// Register routes
function registerRoutes() {
  // API versioning
  app.register(async function (app) {
    // Health check (no auth required)
    app.register(healthRoutes, { prefix: '/health' });

    // Public routes
    app.register(authRoutes, { prefix: '/api/v1/auth' });
    app.register(courseRoutes, { prefix: '/api/v1/courses' }, { public: true });

    // Protected routes
    app.register(userRoutes, { prefix: '/api/v1/users' });
    app.register(progressRoutes, { prefix: '/api/v1/progress' });
    app.register(analyticsRoutes, { prefix: '/api/v1/analytics' });

    // Protected course routes
    app.register(courseRoutes, { prefix: '/api/v1/courses' }, { protected: true });
  });
}

// Service discovery and proxy
async function setupServiceProxy() {
  const serviceUrls = {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    users: process.env.USERS_SERVICE_URL || 'http://localhost:3002',
    courses: process.env.COURSES_SERVICE_URL || 'http://localhost:3003',
    progress: process.env.PROGRESS_SERVICE_URL || 'http://localhost:3004',
    analytics: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3005'
  };

  // Add proxy decorator
  app.decorate('proxy', {
    async call(service, path, options = {}) {
      const url = `${serviceUrls[service]}${path}`;
      try {
        const response = await app.inject({
          url,
          method: options.method || 'GET',
          headers: options.headers || {},
          payload: options.payload || {},
          query: options.query || {}
        });
        return response;
      } catch (error) {
        app.log.error(`Service proxy error: ${service}${path}`, error);
        throw error;
      }
    }
  });
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  app.log.info(`Received ${signal}, starting graceful shutdown`);
  
  try {
    await app.close();
    app.log.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    app.log.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Start server
async function start() {
  try {
    // Register plugins
    await registerPlugins();
    
    // Register middleware
    registerMiddleware();
    
    // Setup service proxy
    await setupServiceProxy();
    
    // Register routes
    registerRoutes();
    
    // Connect to Redis
    await connectRedis(app.redis);
    
    // Start server
    const port = process.env.PORT || 3000;
    const host = process.env.HOST || '0.0.0.0';
    
    await app.listen({ port, host });
    
    app.log.info(`API Gateway started on ${host}:${port}`);
    app.log.info(`Swagger docs available at http://${host}:${port}/docs`);
    
  } catch (error) {
    app.log.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  app.log.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  app.log.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  start();
}

module.exports = app;
