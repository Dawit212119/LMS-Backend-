const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { userService } = require('../services/userService');
const { emailService } = require('../services/emailService');
const { cacheService } = require('../services/cacheService');
const { AppError } = require('../utils/errors');
const { logger } = require('../utils/logger');

class AuthController {
  async register(request, reply) {
    try {
      const { email, username, password, firstName, lastName, role = 'student' } = request.body;

      // Check if user already exists
      const existingUser = await userService.findByEmailOrUsername(email, username);
      if (existingUser) {
        throw new AppError('User with this email or username already exists', 409);
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Create user
      const user = await userService.create({
        email,
        username,
        passwordHash,
        firstName,
        lastName,
        role,
        emailVerified: false
      });

      // Generate email verification token
      const verificationToken = uuidv4();
      await cacheService.set(`email_verification:${verificationToken}`, user.id, 24 * 60 * 60); // 24 hours

      // Send verification email
      await emailService.sendVerificationEmail(email, verificationToken);

      // Generate tokens
      const tokens = await this.generateTokens(user);

      // Log user registration
      logger.info('User registered', { userId: user.id, email, role });

      reply.code(201).send({
        success: true,
        message: 'User registered successfully. Please check your email for verification.',
        data: {
          user: userService.sanitizeUser(user),
          tokens
        }
      });
    } catch (error) {
      logger.error('Registration error:', error);
      reply.send(error);
    }
  }

  async login(request, reply) {
    try {
      const { email, password, rememberMe = false } = request.body;

      // Find user
      const user = await userService.findByEmail(email);
      if (!user) {
        throw new AppError('Invalid credentials', 401);
      }

      // Check if user is active
      if (!user.isActive) {
        throw new AppError('Account has been deactivated', 401);
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        throw new AppError('Invalid credentials', 401);
      }

      // Update last login
      await userService.updateLastLogin(user.id);

      // Generate tokens
      const tokens = await this.generateTokens(user, rememberMe);

      // Log successful login
      logger.info('User logged in', { userId: user.id, email });

      reply.send({
        success: true,
        message: 'Login successful',
        data: {
          user: userService.sanitizeUser(user),
          tokens
        }
      });
    } catch (error) {
      logger.error('Login error:', error);
      reply.send(error);
    }
  }

  async refreshToken(request, reply) {
    try {
      const { refreshToken } = request.body;

      if (!refreshToken) {
        throw new AppError('Refresh token is required', 400);
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      
      // Check if refresh token exists in database
      const tokenRecord = await userService.getRefreshToken(decoded.tokenId);
      if (!tokenRecord || tokenRecord.revokedAt) {
        throw new AppError('Invalid or expired refresh token', 401);
      }

      // Get user
      const user = await userService.findById(tokenRecord.userId);
      if (!user || !user.isActive) {
        throw new AppError('User not found or inactive', 401);
      }

      // Revoke old refresh token
      await userService.revokeRefreshToken(decoded.tokenId);

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      reply.send({
        success: true,
        message: 'Token refreshed successfully',
        data: { tokens }
      });
    } catch (error) {
      logger.error('Token refresh error:', error);
      reply.send(error);
    }
  }

  async logout(request, reply) {
    try {
      const userId = request.user.id;
      const tokenId = request.user.tokenId;

      // Revoke refresh token
      if (tokenId) {
        await userService.revokeRefreshToken(tokenId);
      }

      // Clear user cache
      await cacheService.del(`user:${userId}`);

      logger.info('User logged out', { userId });

      reply.send({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      logger.error('Logout error:', error);
      reply.send(error);
    }
  }

  async forgotPassword(request, reply) {
    try {
      const { email } = request.body;

      const user = await userService.findByEmail(email);
      if (!user) {
        // Don't reveal if user exists or not
        reply.send({
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent'
        });
        return;
      }

      // Generate reset token
      const resetToken = uuidv4();
      await cacheService.set(`password_reset:${resetToken}`, user.id, 60 * 60); // 1 hour

      // Send reset email
      await emailService.sendPasswordResetEmail(email, resetToken);

      logger.info('Password reset requested', { userId: user.id, email });

      reply.send({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    } catch (error) {
      logger.error('Forgot password error:', error);
      reply.send(error);
    }
  }

  async resetPassword(request, reply) {
    try {
      const { token, newPassword } = request.body;

      // Verify token
      const userId = await cacheService.get(`password_reset:${token}`);
      if (!userId) {
        throw new AppError('Invalid or expired reset token', 400);
      }

      // Get user
      const user = await userService.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await userService.updatePassword(userId, passwordHash);

      // Revoke all refresh tokens for this user
      await userService.revokeAllRefreshTokens(userId);

      // Clear reset token
      await cacheService.del(`password_reset:${token}`);

      // Clear user cache
      await cacheService.del(`user:${userId}`);

      logger.info('Password reset completed', { userId });

      reply.send({
        success: true,
        message: 'Password reset successful. Please login with your new password.'
      });
    } catch (error) {
      logger.error('Reset password error:', error);
      reply.send(error);
    }
  }

  async verifyEmail(request, reply) {
    try {
      const { token } = request.body;

      // Verify token
      const userId = await cacheService.get(`email_verification:${token}`);
      if (!userId) {
        throw new AppError('Invalid or expired verification token', 400);
      }

      // Update user email verification status
      await userService.verifyEmail(userId);

      // Clear verification token
      await cacheService.del(`email_verification:${token}`);

      // Clear user cache
      await cacheService.del(`user:${userId}`);

      logger.info('Email verified', { userId });

      reply.send({
        success: true,
        message: 'Email verified successfully'
      });
    } catch (error) {
      logger.error('Email verification error:', error);
      reply.send(error);
    }
  }

  async resendVerification(request, reply) {
    try {
      const { email } = request.body;

      const user = await userService.findByEmail(email);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      if (user.emailVerified) {
        throw new AppError('Email already verified', 400);
      }

      // Generate new verification token
      const verificationToken = uuidv4();
      await cacheService.set(`email_verification:${verificationToken}`, user.id, 24 * 60 * 60);

      // Send verification email
      await emailService.sendVerificationEmail(email, verificationToken);

      logger.info('Verification email resent', { userId: user.id, email });

      reply.send({
        success: true,
        message: 'Verification email sent'
      });
    } catch (error) {
      logger.error('Resend verification error:', error);
      reply.send(error);
    }
  }

  async changePassword(request, reply) {
    try {
      const userId = request.user.id;
      const { currentPassword, newPassword } = request.body;

      // Get user with password
      const user = await userService.findByIdWithPassword(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isCurrentPasswordValid) {
        throw new AppError('Current password is incorrect', 400);
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 12);

      // Update password
      await userService.updatePassword(userId, passwordHash);

      // Revoke all refresh tokens for this user
      await userService.revokeAllRefreshTokens(userId);

      // Clear user cache
      await cacheService.del(`user:${userId}`);

      logger.info('Password changed', { userId });

      reply.send({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      logger.error('Change password error:', error);
      reply.send(error);
    }
  }

  async getCurrentUser(request, reply) {
    try {
      const userId = request.user.id;

      // Try to get from cache first
      let user = await cacheService.get(`user:${userId}`);
      
      if (!user) {
        user = await userService.findById(userId);
        if (!user) {
          throw new AppError('User not found', 404);
        }
        
        // Cache user data
        await cacheService.set(`user:${userId}`, user, 300); // 5 minutes
      }

      reply.send({
        success: true,
        data: {
          user: userService.sanitizeUser(user)
        }
      });
    } catch (error) {
      logger.error('Get current user error:', error);
      reply.send(error);
    }
  }

  async updateProfile(request, reply) {
    try {
      const userId = request.user.id;
      const updates = request.body;

      // Update user profile
      const updatedUser = await userService.updateProfile(userId, updates);

      // Clear user cache
      await cacheService.del(`user:${userId}`);

      logger.info('Profile updated', { userId });

      reply.send({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: userService.sanitizeUser(updatedUser)
        }
      });
    } catch (error) {
      logger.error('Update profile error:', error);
      reply.send(error);
    }
  }

  async uploadAvatar(request, reply) {
    try {
      const userId = request.user.id;
      const file = await request.file();

      if (!file) {
        throw new AppError('No file uploaded', 400);
      }

      // Validate file type and size
      if (!file.mimetype.startsWith('image/')) {
        throw new AppError('Only image files are allowed', 400);
      }

      if (file.file.bytesRead > 5 * 1024 * 1024) { // 5MB
        throw new AppError('File size must be less than 5MB', 400);
      }

      // Upload avatar to cloud storage
      const avatarUrl = await userService.uploadAvatar(userId, file);

      // Update user avatar URL
      await userService.updateAvatar(userId, avatarUrl);

      // Clear user cache
      await cacheService.del(`user:${userId}`);

      logger.info('Avatar uploaded', { userId, avatarUrl });

      reply.send({
        success: true,
        message: 'Avatar uploaded successfully',
        data: {
          avatarUrl
        }
      });
    } catch (error) {
      logger.error('Upload avatar error:', error);
      reply.send(error);
    }
  }

  async generateTokens(user, rememberMe = false) {
    const tokenId = uuidv4();
    
    // JWT payload
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenId
    };

    // Generate access token
    const accessToken = this.fastify.jwt.sign(payload);

    // Generate refresh token with extended expiry if remember me is checked
    const refreshExpiry = rememberMe ? '30d' : '7d';
    const refreshToken = jwt.sign(
      { tokenId, userId: user.id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: refreshExpiry }
    );

    // Store refresh token in database
    await userService.createRefreshToken(user.id, tokenId, refreshToken, refreshExpiry);

    return {
      accessToken,
      refreshToken,
      expiresIn: process.env.JWT_EXPIRES_IN || '15m',
      tokenType: 'Bearer'
    };
  }
}

module.exports = { authController: new AuthController() };
