const { validateRequest } = require('../middleware/validation');
const { authSchemas } = require('../schemas/auth');
const { authController } = require('../controllers/auth');

async function authRoutes(fastify, options) {
  
  // Register user
  fastify.post('/register', {
    schema: authSchemas.register,
    preHandler: validateRequest
  }, authController.register);

  // Login user
  fastify.post('/login', {
    schema: authSchemas.login,
    preHandler: validateRequest
  }, authController.login);

  // Refresh token
  fastify.post('/refresh', {
    schema: authSchemas.refresh,
    preHandler: validateRequest
  }, authController.refreshToken);

  // Logout user
  fastify.post('/logout', {
    schema: authSchemas.logout,
    preHandler: [validateRequest, fastify.authenticate]
  }, authController.logout);

  // Forgot password
  fastify.post('/forgot-password', {
    schema: authSchemas.forgotPassword,
    preHandler: validateRequest
  }, authController.forgotPassword);

  // Reset password
  fastify.post('/reset-password', {
    schema: authSchemas.resetPassword,
    preHandler: validateRequest
  }, authController.resetPassword);

  // Verify email
  fastify.post('/verify-email', {
    schema: authSchemas.verifyEmail,
    preHandler: validateRequest
  }, authController.verifyEmail);

  // Resend verification email
  fastify.post('/resend-verification', {
    schema: authSchemas.resendVerification,
    preHandler: validateRequest
  }, authController.resendVerification);

  // Change password
  fastify.post('/change-password', {
    schema: authSchemas.changePassword,
    preHandler: [validateRequest, fastify.authenticate]
  }, authController.changePassword);

  // Get current user
  fastify.get('/me', {
    schema: authSchemas.getCurrentUser,
    preHandler: fastify.authenticate
  }, authController.getCurrentUser);

  // Update profile
  fastify.put('/profile', {
    schema: authSchemas.updateProfile,
    preHandler: [validateRequest, fastify.authenticate]
  }, authController.updateProfile);

  // Upload avatar
  fastify.post('/avatar', {
    preHandler: fastify.authenticate
  }, authController.uploadAvatar);
}

module.exports = authRoutes;
