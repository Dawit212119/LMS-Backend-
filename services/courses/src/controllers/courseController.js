const { courseService } = require('../services/courseService');
const { enrollmentService } = require('../services/enrollmentService');
const { contentService } = require('../services/contentService');
const { cacheService } = require('../services/cacheService');
const { queueService } = require('../services/queueService');
const { AppError } = require('../utils/errors');
const { logger } = require('../utils/logger');
const { validateRequest } = require('../middleware/validation');

class CourseController {
  async createCourse(request, reply) {
    try {
      const instructorId = request.user.id;
      const courseData = {
        ...request.body,
        instructorId
      };

      // Validate course data
      await courseService.validateCourseData(courseData);

      // Create course
      const course = await courseService.create(courseData);

      // Clear instructor's courses cache
      await cacheService.del(`instructor_courses:${instructorId}`);

      // Log course creation
      logger.info('Course created', { courseId: course.id, instructorId });

      reply.code(201).send({
        success: true,
        message: 'Course created successfully',
        data: { course }
      });
    } catch (error) {
      logger.error('Create course error:', error);
      reply.send(error);
    }
  }

  async updateCourse(request, reply) {
    try {
      const { id } = request.params;
      const instructorId = request.user.id;
      const updates = request.body;

      // Check if course exists and user owns it
      const existingCourse = await courseService.findById(id);
      if (!existingCourse) {
        throw new AppError('Course not found', 404);
      }

      if (existingCourse.instructorId !== instructorId && request.user.role !== 'admin') {
        throw new AppError('Access denied', 403);
      }

      // Update course
      const updatedCourse = await courseService.update(id, updates);

      // Clear caches
      await cacheService.del(`course:${id}`);
      await cacheService.del(`instructor_courses:${instructorId}`);

      logger.info('Course updated', { courseId: id, instructorId });

      reply.send({
        success: true,
        message: 'Course updated successfully',
        data: { course: updatedCourse }
      });
    } catch (error) {
      logger.error('Update course error:', error);
      reply.send(error);
    }
  }

  async getCourse(request, reply) {
    try {
      const { id } = request.params;
      const userId = request.user?.id;

      // Try cache first
      let course = await cacheService.get(`course:${id}`);
      
      if (!course) {
        course = await courseService.findById(id);
        if (!course) {
          throw new AppError('Course not found', 404);
        }

        // Cache course data
        await cacheService.set(`course:${id}`, course, 300); // 5 minutes
      }

      // Check access permissions
      if (course.status !== 'published' && course.instructorId !== userId && request.user?.role !== 'admin') {
        throw new AppError('Course not available', 403);
      }

      // Add enrollment status if user is authenticated
      let enrollmentStatus = null;
      if (userId && course.status === 'published') {
        enrollmentStatus = await enrollmentService.getEnrollmentStatus(userId, id);
      }

      reply.send({
        success: true,
        data: {
          course,
          enrollmentStatus
        }
      });
    } catch (error) {
      logger.error('Get course error:', error);
      reply.send(error);
    }
  }

  async getCourses(request, reply) {
    try {
      const {
        page = 1,
        limit = 20,
        category,
        level,
        language,
        priceMin,
        priceMax,
        rating,
        search,
        sortBy = 'created_at',
        sortOrder = 'desc',
        featured
      } = request.query;

      const userId = request.user?.id;
      const cacheKey = `courses:${JSON.stringify(request.query)}`;

      // Try cache first
      let result = await cacheService.get(cacheKey);
      
      if (!result) {
        result = await courseService.findCourses({
          page: parseInt(page),
          limit: parseInt(limit),
          category,
          level,
          language,
          priceMin: priceMin ? parseFloat(priceMin) : null,
          priceMax: priceMax ? parseFloat(priceMax) : null,
          rating: rating ? parseInt(rating) : null,
          search,
          sortBy,
          sortOrder,
          featured: featured === 'true',
          status: request.user?.role === 'admin' ? undefined : 'published'
        });

        // Cache result
        await cacheService.set(cacheKey, result, 60); // 1 minute
      }

      // Add enrollment status for authenticated users
      if (userId && result.courses.length > 0) {
        const courseIds = result.courses.map(course => course.id);
        const enrollmentStatuses = await enrollmentService.getBatchEnrollmentStatus(userId, courseIds);
        
        result.courses = result.courses.map(course => ({
          ...course,
          enrollmentStatus: enrollmentStatuses[course.id] || null
        }));
      }

      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Get courses error:', error);
      reply.send(error);
    }
  }

  async deleteCourse(request, reply) {
    try {
      const { id } = request.params;
      const instructorId = request.user.id;

      // Check if course exists and user owns it
      const course = await courseService.findById(id);
      if (!course) {
        throw new AppError('Course not found', 404);
      }

      if (course.instructorId !== instructorId && request.user.role !== 'admin') {
        throw new AppError('Access denied', 403);
      }

      // Check if course has enrollments
      const enrollmentCount = await enrollmentService.getEnrollmentCount(id);
      if (enrollmentCount > 0) {
        throw new AppError('Cannot delete course with active enrollments', 400);
      }

      // Delete course
      await courseService.delete(id);

      // Clear caches
      await cacheService.del(`course:${id}`);
      await cacheService.del(`instructor_courses:${instructorId}`);

      logger.info('Course deleted', { courseId: id, instructorId });

      reply.send({
        success: true,
        message: 'Course deleted successfully'
      });
    } catch (error) {
      logger.error('Delete course error:', error);
      reply.send(error);
    }
  }

  async publishCourse(request, reply) {
    try {
      const { id } = request.params;
      const instructorId = request.user.id;

      // Validate course before publishing
      const course = await courseService.validateForPublishing(id, instructorId);

      // Publish course
      const publishedCourse = await courseService.publish(id);

      // Clear caches
      await cacheService.del(`course:${id}`);
      await cacheService.del(`instructor_courses:${instructorId}`);

      // Notify enrolled students if any
      if (course.enrolledCount > 0) {
        await queueService.createJob('notification-queue', 'course-published', {
          courseId: id,
          instructorId
        });
      }

      logger.info('Course published', { courseId: id, instructorId });

      reply.send({
        success: true,
        message: 'Course published successfully',
        data: { course: publishedCourse }
      });
    } catch (error) {
      logger.error('Publish course error:', error);
      reply.send(error);
    }
  }

  async enrollInCourse(request, reply) {
    try {
      const { id } = request.params;
      const userId = request.user.id;

      // Check if course exists and is published
      const course = await courseService.findById(id);
      if (!course) {
        throw new AppError('Course not found', 404);
      }

      if (course.status !== 'published') {
        throw new AppError('Course is not available for enrollment', 400);
      }

      // Check if already enrolled
      const existingEnrollment = await enrollmentService.findByUserAndCourse(userId, id);
      if (existingEnrollment) {
        throw new AppError('Already enrolled in this course', 409);
      }

      // Create enrollment
      const enrollment = await enrollmentService.create({
        userId,
        courseId: id,
        status: 'active'
      });

      // Clear caches
      await cacheService.del(`course:${id}`);
      await cacheService.del(`user_enrollments:${userId}`);

      // Send enrollment confirmation email
      await queueService.createJob('email-queue', 'enrollment-confirmation', {
        userId,
        courseId: id,
        enrollmentId: enrollment.id
      });

      // Track analytics event
      await queueService.createJob('analytics-queue', 'course_enrolled', {
        userId,
        courseId: id,
        timestamp: new Date().toISOString()
      });

      logger.info('User enrolled in course', { userId, courseId: id, enrollmentId: enrollment.id });

      reply.code(201).send({
        success: true,
        message: 'Enrolled in course successfully',
        data: { enrollment }
      });
    } catch (error) {
      logger.error('Enroll in course error:', error);
      reply.send(error);
    }
  }

  async getCourseContent(request, reply) {
    try {
      const { id } = request.params;
      const userId = request.user.id;

      // Check if user is enrolled or is the instructor
      const hasAccess = await enrollmentService.hasAccess(userId, id);
      if (!hasAccess) {
        throw new AppError('Access denied', 403);
      }

      // Try cache first
      const cacheKey = `course_content:${id}`;
      let content = await cacheService.get(cacheKey);
      
      if (!content) {
        content = await courseService.getCourseContent(id);
        
        // Cache content
        await cacheService.set(cacheKey, content, 300); // 5 minutes
      }

      reply.send({
        success: true,
        data: { content }
      });
    } catch (error) {
      logger.error('Get course content error:', error);
      reply.send(error);
    }
  }

  async createModule(request, reply) {
    try {
      const { id: courseId } = request.params;
      const instructorId = request.user.id;
      const moduleData = {
        ...request.body,
        courseId
      };

      // Verify instructor access
      await courseService.verifyInstructorAccess(courseId, instructorId);

      // Create module
      const module = await courseService.createModule(moduleData);

      // Clear course content cache
      await cacheService.del(`course_content:${courseId}`);

      logger.info('Module created', { courseId, moduleId: module.id, instructorId });

      reply.code(201).send({
        success: true,
        message: 'Module created successfully',
        data: { module }
      });
    } catch (error) {
      logger.error('Create module error:', error);
      reply.send(error);
    }
  }

  async createLesson(request, reply) {
    try {
      const { id: courseId, moduleId } = request.params;
      const instructorId = request.user.id;
      const lessonData = {
        ...request.body,
        moduleId
      };

      // Verify instructor access
      await courseService.verifyInstructorAccess(courseId, instructorId);

      // Create lesson
      const lesson = await courseService.createLesson(lessonData);

      // Clear course content cache
      await cacheService.del(`course_content:${courseId}`);

      // Queue content processing if needed
      if (lesson.type === 'video' && lesson.contentUrl) {
        await queueService.createJob('content-processing-queue', 'video-process', {
          lessonId: lesson.id,
          contentUrl: lesson.contentUrl
        });
      }

      logger.info('Lesson created', { courseId, moduleId, lessonId: lesson.id, instructorId });

      reply.code(201).send({
        success: true,
        message: 'Lesson created successfully',
        data: { lesson }
      });
    } catch (error) {
      logger.error('Create lesson error:', error);
      reply.send(error);
    }
  }

  async getInstructorCourses(request, reply) {
    try {
      const instructorId = request.user.id;
      const { page = 1, limit = 20, status } = request.query;

      const cacheKey = `instructor_courses:${instructorId}:${JSON.stringify({ page, limit, status })}`;
      let result = await cacheService.get(cacheKey);
      
      if (!result) {
        result = await courseService.getInstructorCourses(instructorId, {
          page: parseInt(page),
          limit: parseInt(limit),
          status
        });

        await cacheService.set(cacheKey, result, 60); // 1 minute
      }

      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Get instructor courses error:', error);
      reply.send(error);
    }
  }

  async getUserEnrollments(request, reply) {
    try {
      const userId = request.user.id;
      const { page = 1, limit = 20, status } = request.query;

      const cacheKey = `user_enrollments:${userId}:${JSON.stringify({ page, limit, status })}`;
      let result = await cacheService.get(cacheKey);
      
      if (!result) {
        result = await enrollmentService.getUserEnrollments(userId, {
          page: parseInt(page),
          limit: parseInt(limit),
          status
        });

        await cacheService.set(cacheKey, result, 60); // 1 minute
      }

      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Get user enrollments error:', error);
      reply.send(error);
    }
  }

  async getCourseReviews(request, reply) {
    try {
      const { id } = request.params;
      const { page = 1, limit = 20, rating } = request.query;

      const cacheKey = `course_reviews:${id}:${JSON.stringify({ page, limit, rating })}`;
      let result = await cacheService.get(cacheKey);
      
      if (!result) {
        result = await courseService.getCourseReviews(id, {
          page: parseInt(page),
          limit: parseInt(limit),
          rating: rating ? parseInt(rating) : null
        });

        await cacheService.set(cacheKey, result, 300); // 5 minutes
      }

      reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Get course reviews error:', error);
      reply.send(error);
    }
  }

  async createReview(request, reply) {
    try {
      const { id: courseId } = request.params;
      const userId = request.user.id;
      const { rating, comment } = request.body;

      // Verify enrollment
      const enrollment = await enrollmentService.findByUserAndCourse(userId, courseId);
      if (!enrollment) {
        throw new AppError('Must be enrolled in course to review', 403);
      }

      // Check if already reviewed
      const existingReview = await courseService.findUserReview(userId, courseId);
      if (existingReview) {
        throw new AppError('Review already exists', 409);
      }

      // Create review
      const review = await courseService.createReview({
        userId,
        courseId,
        rating,
        comment
      });

      // Clear course cache
      await cacheService.del(`course:${courseId}`);
      await cacheService.del(`course_reviews:${courseId}`);

      logger.info('Review created', { courseId, userId, rating });

      reply.code(201).send({
        success: true,
        message: 'Review created successfully',
        data: { review }
      });
    } catch (error) {
      logger.error('Create review error:', error);
      reply.send(error);
    }
  }
}

module.exports = { courseController: new CourseController() };
