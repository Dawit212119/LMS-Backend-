const { Queue, Worker } = require('bullmq');
const redisClient = require('../cache/redis-client');

// Queue configuration
const queueConfig = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: process.env.REDIS_DB || 0,
  },
  defaultJobOptions: {
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
    attempts: 3,           // Default retry attempts
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
};

// Queue names
const QUEUE_NAMES = {
  EMAIL: 'email-queue',
  CONTENT_PROCESSING: 'content-processing-queue',
  ANALYTICS: 'analytics-queue',
  CLEANUP: 'cleanup-queue',
  NOTIFICATION: 'notification-queue',
  WEBHOOK: 'webhook-queue',
  REPORT_GENERATION: 'report-generation-queue',
};

// Create queues
const queues = {};

Object.values(QUEUE_NAMES).forEach(queueName => {
  queues[queueName] = new Queue(queueName, queueConfig);
});

// Email queue jobs
const EMAIL_JOBS = {
  WELCOME_EMAIL: 'welcome-email',
  ENROLLMENT_CONFIRMATION: 'enrollment-confirmation',
  COURSE_COMPLETION: 'course-completion',
  PASSWORD_RESET: 'password-reset',
  EMAIL_VERIFICATION: 'email-verification',
  COURSE_ANNOUNCEMENT: 'course-announcement',
  PAYMENT_CONFIRMATION: 'payment-confirmation',
  INSTRUCTOR_DIGEST: 'instructor-digest',
};

// Content processing jobs
const CONTENT_JOBS = {
  VIDEO_TRANSCODE: 'video-transcode',
  VIDEO_THUMBNAIL: 'video-thumbnail',
  IMAGE_OPTIMIZE: 'image-optimize',
  DOCUMENT_PROCESS: 'document-process',
  AUDIO_TRANSCRIBE: 'audio-transcribe',
  CONTENT_BACKUP: 'content-backup',
};

// Analytics jobs
const ANALYTICS_JOBS = {
  UPDATE_DASHBOARD: 'update-dashboard',
  GENERATE_REPORT: 'generate-report',
  CALCULATE_RATINGS: 'calculate-ratings',
  UPDATE_SEARCH_INDEX: 'update-search-index',
  USER_BEHAVIOR_ANALYSIS: 'user-behavior-analysis',
};

// Cleanup jobs
const CLEANUP_JOBS = {
  CLEAN_OLD_SESSIONS: 'clean-old-sessions',
  CLEAN_EXPIRED_TOKENS: 'clean-expired-tokens',
  CLEAN_TEMP_FILES: 'clean-temp-files',
  CLEAN_OLD_LOGS: 'clean-old-logs',
  CLEAN_FAILED_UPLOADS: 'clean-failed-uploads',
};

// Notification jobs
const NOTIFICATION_JOBS = {
  PUSH_NOTIFICATION: 'push-notification',
  SMS_NOTIFICATION: 'sms-notification',
  IN_APP_NOTIFICATION: 'in-app-notification',
  BROWSER_NOTIFICATION: 'browser-notification',
};

// Webhook jobs
const WEBHOOK_JOBS = {
  PAYMENT_WEBHOOK: 'payment-webhook',
  ENROLLMENT_WEBHOOK: 'enrollment-webhook',
  COMPLETION_WEBHOOK: 'completion-webhook',
  USER_UPDATE_WEBHOOK: 'user-update-webhook',
};

// Report generation jobs
const REPORT_JOBS = {
  ENROLLMENT_REPORT: 'enrollment-report',
  REVENUE_REPORT: 'revenue-report',
  ENGAGEMENT_REPORT: 'engagement-report',
  COMPLETION_REPORT: 'completion-report',
  INSTRUCTOR_PERFORMANCE: 'instructor-performance',
};

// Priority levels
const PRIORITY = {
  LOW: 1,
  NORMAL: 5,
  HIGH: 10,
  CRITICAL: 20,
};

// Job priorities mapping
const JOB_PRIORITIES = {
  // Email priorities
  [EMAIL_JOBS.PASSWORD_RESET]: PRIORITY.HIGH,
  [EMAIL_JOBS.EMAIL_VERIFICATION]: PRIORITY.HIGH,
  [EMAIL_JOBS.WELCOME_EMAIL]: PRIORITY.NORMAL,
  [EMAIL_JOBS.ENROLLMENT_CONFIRMATION]: PRIORITY.NORMAL,
  [EMAIL_JOBS.COURSE_COMPLETION]: PRIORITY.NORMAL,
  [EMAIL_JOBS.PAYMENT_CONFIRMATION]: PRIORITY.HIGH,
  
  // Content processing priorities
  [CONTENT_JOBS.VIDEO_THUMBNAIL]: PRIORITY.HIGH,
  [CONTENT_JOBS.VIDEO_TRANSCODE]: PRIORITY.NORMAL,
  [CONTENT_JOBS.IMAGE_OPTIMIZE]: PRIORITY.NORMAL,
  
  // Analytics priorities
  [ANALYTICS_JOBS.UPDATE_DASHBOARD]: PRIORITY.NORMAL,
  [ANALYTICS_JOBS.GENERATE_REPORT]: PRIORITY.LOW,
  
  // Cleanup priorities
  [CLEANUP_JOBS.CLEAN_OLD_SESSIONS]: PRIORITY.LOW,
  [CLEANUP_JOBS.CLEAN_EXPIRED_TOKENS]: PRIORITY.LOW,
  
  // Notification priorities
  [NOTIFICATION_JOBS.PUSH_NOTIFICATION]: PRIORITY.NORMAL,
  [NOTIFICATION_JOBS.IN_APP_NOTIFICATION]: PRIORITY.NORMAL,
  
  // Webhook priorities
  [WEBHOOK_JOBS.PAYMENT_WEBHOOK]: PRIORITY.HIGH,
  [WEBHOOK_JOBS.ENROLLMENT_WEBHOOK]: PRIORITY.NORMAL,
};

// Create job function
async function createJob(queueName, jobName, data, options = {}) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  const jobOptions = {
    priority: JOB_PRIORITIES[jobName] || PRIORITY.NORMAL,
    delay: options.delay || 0,
    attempts: options.attempts || 3,
    backoff: options.backoff || {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: options.removeOnComplete || 100,
    removeOnFail: options.removeOnFail || 50,
    ...options,
  };

  try {
    const job = await queue.add(jobName, data, jobOptions);
    console.log(`Job created: ${jobName} in queue ${queueName} with ID: ${job.id}`);
    return job;
  } catch (error) {
    console.error(`Failed to create job ${jobName}:`, error);
    throw error;
  }
}

// Get job status
async function getJobStatus(queueName, jobId) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  try {
    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress;
    const data = job.data;
    const processedOn = job.processedOn;
    const finishedOn = job.finishedOn;
    const failedReason = job.failedReason;

    return {
      id: job.id,
      name: job.name,
      state,
      progress,
      data,
      processedOn,
      finishedOn,
      failedReason,
    };
  } catch (error) {
    console.error(`Failed to get job status for ${jobId}:`, error);
    throw error;
  }
}

// Cancel job
async function cancelJob(queueName, jobId) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  try {
    const job = await queue.getJob(jobId);
    if (job && (await job.isActive() || await job.isWaiting())) {
      await job.remove();
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to cancel job ${jobId}:`, error);
    throw error;
  }
}

// Retry job
async function retryJob(queueName, jobId) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  try {
    const job = await queue.getJob(jobId);
    if (job && await job.isFailed()) {
      await job.retry();
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to retry job ${jobId}:`, error);
    throw error;
  }
}

// Get queue stats
async function getQueueStats(queueName) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ]);

    return {
      queueName,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length,
    };
  } catch (error) {
    console.error(`Failed to get queue stats for ${queueName}:`, error);
    throw error;
  }
}

// Clean queue
async function cleanQueue(queueName, grace = 0, limit = 100, state = 'completed') {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  try {
    const deleted = await queue.clean(grace, limit, state);
    console.log(`Cleaned ${deleted} jobs from queue ${queueName} with state ${state}`);
    return deleted;
  } catch (error) {
    console.error(`Failed to clean queue ${queueName}:`, error);
    throw error;
  }
}

// Pause queue
async function pauseQueue(queueName) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  try {
    await queue.pause();
    console.log(`Queue ${queueName} paused`);
  } catch (error) {
    console.error(`Failed to pause queue ${queueName}:`, error);
    throw error;
  }
}

// Resume queue
async function resumeQueue(queueName) {
  const queue = queues[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  try {
    await queue.resume();
    console.log(`Queue ${queueName} resumed`);
  } catch (error) {
    console.error(`Failed to resume queue ${queueName}:`, error);
    throw error;
  }
}

// Close all queues
async function closeQueues() {
  try {
    await Promise.all(Object.values(queues).map(queue => queue.close()));
    console.log('All queues closed');
  } catch (error) {
    console.error('Error closing queues:', error);
    throw error;
  }
}

// Health check for queues
async function healthCheck() {
  try {
    const stats = {};
    for (const queueName of Object.values(QUEUE_NAMES)) {
      stats[queueName] = await getQueueStats(queueName);
    }
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      queues: stats,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
    };
  }
}

module.exports = {
  QUEUE_NAMES,
  EMAIL_JOBS,
  CONTENT_JOBS,
  ANALYTICS_JOBS,
  CLEANUP_JOBS,
  NOTIFICATION_JOBS,
  WEBHOOK_JOBS,
  REPORT_JOBS,
  PRIORITY,
  queues,
  createJob,
  getJobStatus,
  cancelJob,
  retryJob,
  getQueueStats,
  cleanQueue,
  pauseQueue,
  resumeQueue,
  closeQueues,
  healthCheck,
};
