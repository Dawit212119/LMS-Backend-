const { Worker } = require('bullmq');
const { QUEUE_NAMES, EMAIL_JOBS } = require('../queue-config');
const redisClient = require('../../cache/redis-client');
const { emailService } = require('../../services/emailService');
const { logger } = require('../../utils/logger');

class EmailWorker {
  constructor() {
    this.worker = new Worker(
      QUEUE_NAMES.EMAIL,
      this.processJob.bind(this),
      {
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD,
          db: process.env.REDIS_DB || 0,
        },
        concurrency: 5, // Process 5 emails concurrently
        limiter: {
          max: 100,    // Max 100 emails per minute
          duration: 60000, // 1 minute
        },
      }
    );

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.worker.on('completed', (job) => {
      logger.info(`Email job completed: ${job.name}`, { jobId: job.id, data: job.data });
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Email job failed: ${job.name}`, { 
        jobId: job.id, 
        data: job.data, 
        error: err.message,
        attempts: job.attemptsMade,
        opts: job.opts
      });
    });

    this.worker.on('error', (err) => {
      logger.error('Email worker error:', err);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.close());
    process.on('SIGINT', () => this.close());
  }

  async processJob(job) {
    const { name, data } = job;
    
    switch (name) {
      case EMAIL_JOBS.WELCOME_EMAIL:
        return await this.sendWelcomeEmail(data);
      
      case EMAIL_JOBS.ENROLLMENT_CONFIRMATION:
        return await this.sendEnrollmentConfirmation(data);
      
      case EMAIL_JOBS.COURSE_COMPLETION:
        return await this.sendCourseCompletion(data);
      
      case EMAIL_JOBS.PASSWORD_RESET:
        return await this.sendPasswordReset(data);
      
      case EMAIL_JOBS.EMAIL_VERIFICATION:
        return await this.sendEmailVerification(data);
      
      case EMAIL_JOBS.COURSE_ANNOUNCEMENT:
        return await this.sendCourseAnnouncement(data);
      
      case EMAIL_JOBS.PAYMENT_CONFIRMATION:
        return await this.sendPaymentConfirmation(data);
      
      case EMAIL_JOBS.INSTRUCTOR_DIGEST:
        return await this.sendInstructorDigest(data);
      
      default:
        throw new Error(`Unknown email job type: ${name}`);
    }
  }

  async sendWelcomeEmail(data) {
    const { userId, email, firstName, lastName } = data;
    
    try {
      // Get user data if not provided
      let userData = { email, firstName, lastName };
      if (!email || !firstName) {
        userData = await this.getUserData(userId);
      }

      // Send welcome email
      await emailService.sendWelcomeEmail(userData);
      
      // Log the event
      await this.logEmailEvent('welcome_sent', userId, userData.email);
      
      return { success: true, message: 'Welcome email sent successfully' };
    } catch (error) {
      logger.error('Failed to send welcome email:', error);
      throw error;
    }
  }

  async sendEnrollmentConfirmation(data) {
    const { userId, courseId, enrollmentId } = data;
    
    try {
      // Get user and course data
      const [user, course, enrollment] = await Promise.all([
        this.getUserData(userId),
        this.getCourseData(courseId),
        this.getEnrollmentData(enrollmentId)
      ]);

      // Send enrollment confirmation
      await emailService.sendEnrollmentConfirmation(user, course, enrollment);
      
      // Log the event
      await this.logEmailEvent('enrollment_confirmation_sent', userId, user.email, { courseId });
      
      return { success: true, message: 'Enrollment confirmation sent successfully' };
    } catch (error) {
      logger.error('Failed to send enrollment confirmation:', error);
      throw error;
    }
  }

  async sendCourseCompletion(data) {
    const { userId, courseId, enrollmentId } = data;
    
    try {
      // Get user, course, and completion data
      const [user, course, enrollment] = await Promise.all([
        this.getUserData(userId),
        this.getCourseData(courseId),
        this.getEnrollmentData(enrollmentId)
      ]);

      // Generate certificate if needed
      let certificateUrl = enrollment.certificate_url;
      if (!certificateUrl) {
        certificateUrl = await this.generateCertificate(userId, courseId);
        await this.updateCertificateUrl(enrollmentId, certificateUrl);
      }

      // Send completion email
      await emailService.sendCourseCompletion(user, course, enrollment, certificateUrl);
      
      // Log the event
      await this.logEmailEvent('course_completion_sent', userId, user.email, { courseId });
      
      return { success: true, message: 'Course completion email sent successfully' };
    } catch (error) {
      logger.error('Failed to send course completion email:', error);
      throw error;
    }
  }

  async sendPasswordReset(data) {
    const { userId, email, resetToken } = data;
    
    try {
      // Get user data if not provided
      let userData = { email };
      if (!email) {
        userData = await this.getUserData(userId);
      }

      // Send password reset email
      await emailService.sendPasswordResetEmail(userData.email, resetToken);
      
      // Log the event
      await this.logEmailEvent('password_reset_sent', userId, userData.email);
      
      return { success: true, message: 'Password reset email sent successfully' };
    } catch (error) {
      logger.error('Failed to send password reset email:', error);
      throw error;
    }
  }

  async sendEmailVerification(data) {
    const { userId, email, verificationToken } = data;
    
    try {
      // Get user data if not provided
      let userData = { email };
      if (!email) {
        userData = await this.getUserData(userId);
      }

      // Send verification email
      await emailService.sendVerificationEmail(userData.email, verificationToken);
      
      // Log the event
      await this.logEmailEvent('email_verification_sent', userId, userData.email);
      
      return { success: true, message: 'Email verification sent successfully' };
    } catch (error) {
      logger.error('Failed to send email verification:', error);
      throw error;
    }
  }

  async sendCourseAnnouncement(data) {
    const { courseId, instructorId, subject, message, attachments } = data;
    
    try {
      // Get course and instructor data
      const [course, instructor] = await Promise.all([
        this.getCourseData(courseId),
        this.getUserData(instructorId)
      ]);

      // Get all enrolled students
      const students = await this.getEnrolledStudents(courseId);

      // Send announcement to all students
      const results = await Promise.allSettled(
        students.map(student => 
          emailService.sendCourseAnnouncement(student, course, instructor, subject, message, attachments)
        )
      );

      // Log results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      await this.logEmailEvent('course_announcement_sent', instructorId, instructor.email, { 
        courseId, 
        studentsCount: students.length,
        successful,
        failed
      });
      
      return { 
        success: true, 
        message: `Course announcement sent to ${successful} students`,
        totalStudents: students.length,
        successful,
        failed
      };
    } catch (error) {
      logger.error('Failed to send course announcement:', error);
      throw error;
    }
  }

  async sendPaymentConfirmation(data) {
    const { userId, paymentId, courseId, amount, currency } = data;
    
    try {
      // Get user, course, and payment data
      const [user, course, payment] = await Promise.all([
        this.getUserData(userId),
        this.getCourseData(courseId),
        this.getPaymentData(paymentId)
      ]);

      // Send payment confirmation
      await emailService.sendPaymentConfirmation(user, course, payment);
      
      // Log the event
      await this.logEmailEvent('payment_confirmation_sent', userId, user.email, { 
        courseId, 
        paymentId,
        amount,
        currency
      });
      
      return { success: true, message: 'Payment confirmation sent successfully' };
    } catch (error) {
      logger.error('Failed to send payment confirmation:', error);
      throw error;
    }
  }

  async sendInstructorDigest(data) {
    const { instructorId, startDate, endDate } = data;
    
    try {
      // Get instructor data
      const instructor = await this.getUserData(instructorId);
      
      // Get digest data
      const digestData = await this.getInstructorDigestData(instructorId, startDate, endDate);
      
      // Send instructor digest
      await emailService.sendInstructorDigest(instructor, digestData);
      
      // Log the event
      await this.logEmailEvent('instructor_digest_sent', instructorId, instructor.email, { 
        startDate,
        endDate
      });
      
      return { success: true, message: 'Instructor digest sent successfully' };
    } catch (error) {
      logger.error('Failed to send instructor digest:', error);
      throw error;
    }
  }

  // Helper methods
  async getUserData(userId) {
    // This would typically call a user service or database
    // For now, return a placeholder
    return {
      id: userId,
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe'
    };
  }

  async getCourseData(courseId) {
    // This would typically call a course service or database
    return {
      id: courseId,
      title: 'Sample Course',
      description: 'Course description'
    };
  }

  async getEnrollmentData(enrollmentId) {
    // This would typically call an enrollment service or database
    return {
      id: enrollmentId,
      progressPercentage: 100,
      completedAt: new Date().toISOString()
    };
  }

  async getPaymentData(paymentId) {
    // This would typically call a payment service or database
    return {
      id: paymentId,
      amount: 99.99,
      currency: 'USD',
      status: 'completed'
    };
  }

  async getEnrolledStudents(courseId) {
    // This would typically get all enrolled students for a course
    return [];
  }

  async generateCertificate(userId, courseId) {
    // This would generate a certificate and return its URL
    return `https://certificates.example.com/${userId}-${courseId}.pdf`;
  }

  async updateCertificateUrl(enrollmentId, certificateUrl) {
    // This would update the enrollment record with the certificate URL
    logger.info(`Updated certificate URL for enrollment ${enrollmentId}`);
  }

  async getInstructorDigestData(instructorId, startDate, endDate) {
    // This would gather digest data for the instructor
    return {
      newEnrollments: 10,
      completedCourses: 5,
      revenue: 999.99,
      averageRating: 4.5
    };
  }

  async logEmailEvent(eventType, userId, email, metadata = {}) {
    try {
      const eventData = {
        eventType,
        userId,
        email,
        metadata,
        timestamp: new Date().toISOString()
      };

      // Store in Redis for analytics
      await redisClient.lpush('email_events', eventData);
      
      // Keep only last 1000 events
      await redisClient.ltrim('email_events', 0, 999);
      
      logger.info('Email event logged', eventData);
    } catch (error) {
      logger.error('Failed to log email event:', error);
    }
  }

  async close() {
    logger.info('Closing email worker...');
    await this.worker.close();
    logger.info('Email worker closed');
  }
}

// Create and export worker instance
const emailWorker = new EmailWorker();

module.exports = emailWorker;
