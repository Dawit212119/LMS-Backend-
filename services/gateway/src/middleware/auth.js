const { AppError } = require('../utils/errors');
const { cacheService } = require('../services/cacheService');
const { userService } = require('../services/userService');

// Authentication middleware
async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
    
    const userId = request.user.userId;
    
    // Try to get user from cache first
    let user = await cacheService.get(`user:${userId}`);
    
    if (!user) {
      user = await userService.findById(userId);
      if (!user || !user.isActive) {
        throw new AppError('User not found or inactive', 401);
      }
      
      // Cache user data
      await cacheService.set(`user:${userId}`, user, 300); // 5 minutes
    }

    // Attach user to request
    request.user = {
      ...request.user,
      ...user
    };

  } catch (error) {
    if (error.name === 'UnauthorizedError' || error.name === 'JsonWebTokenError') {
      throw new AppError('Invalid or expired token', 401);
    }
    throw error;
  }
}

// Role-based authorization middleware
function authorize(...roles) {
  return async function(request, reply) {
    const user = request.user;
    
    if (!user) {
      throw new AppError('Authentication required', 401);
    }

    if (!roles.includes(user.role)) {
      throw new AppError('Insufficient permissions', 403);
    }
  };
}

// Resource ownership middleware
function authorizeOwnership(resourceType) {
  return async function(request, reply) {
    const user = request.user;
    const resourceId = request.params.id || request.params.courseId || request.params.userId;
    
    if (!user) {
      throw new AppError('Authentication required', 401);
    }

    // Admin can access everything
    if (user.role === 'admin') {
      return;
    }

    // Check ownership based on resource type
    let isOwner = false;
    
    switch (resourceType) {
      case 'user':
        isOwner = user.id === resourceId;
        break;
      case 'course':
        // Check if user owns the course or is enrolled
        isOwner = await userService.isCourseOwner(user.id, resourceId) || 
                  await userService.isEnrolledInCourse(user.id, resourceId);
        break;
      case 'enrollment':
        isOwner = await userService.isEnrollmentOwner(user.id, resourceId);
        break;
      default:
        throw new AppError('Invalid resource type', 400);
    }

    if (!isOwner) {
      throw new AppError('Access denied', 403);
    }
  };
}

// Optional authentication (doesn't throw error if no token)
async function optionalAuth(request, reply) {
  try {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return; // No token, continue without auth
    }

    await request.jwtVerify();
    
    const userId = request.user.userId;
    
    // Get user from cache or database
    let user = await cacheService.get(`user:${userId}`);
    
    if (!user) {
      user = await userService.findById(userId);
      if (user && user.isActive) {
        await cacheService.set(`user:${userId}`, user, 300);
      }
    }

    if (user && user.isActive) {
      request.user = {
        ...request.user,
        ...user
      };
    }
  } catch (error) {
    // Ignore authentication errors for optional auth
    request.log.debug('Optional auth failed:', error.message);
  }
}

// Rate limiting based on user role
function getUserRateLimit(user) {
  const limits = {
    admin: { max: 1000, timeWindow: '1 minute' },
    instructor: { max: 500, timeWindow: '1 minute' },
    student: { max: 100, timeWindow: '1 minute' }
  };

  return limits[user.role] || limits.student;
}

// Service-to-service authentication
async function serviceAuth(request, reply) {
  const serviceToken = request.headers['x-service-token'];
  
  if (!serviceToken) {
    throw new AppError('Service token required', 401);
  }

  const expectedToken = process.env.SERVICE_AUTH_SECRET;
  
  if (serviceToken !== expectedToken) {
    throw new AppError('Invalid service token', 401);
  }

  // Mark as service request
  request.isServiceRequest = true;
}

// API key authentication for external integrations
async function apiKeyAuth(request, reply) {
  const apiKey = request.headers['x-api-key'];
  
  if (!apiKey) {
    throw new AppError('API key required', 401);
  }

  // Validate API key from database
  const keyData = await userService.validateApiKey(apiKey);
  
  if (!keyData || !keyData.isActive) {
    throw new AppError('Invalid or inactive API key', 401);
  }

  // Attach API key info to request
  request.apiKey = keyData;
  request.user = {
    id: keyData.userId,
    email: keyData.userEmail,
    role: keyData.userRole,
    isApiKey: true
  };
}

module.exports = {
  authenticate,
  authorize,
  authorizeOwnership,
  optionalAuth,
  getUserRateLimit,
  serviceAuth,
  apiKeyAuth
};
