const winston = require('winston');
const path = require('path');

class Logger {
  constructor() {
    this.logDir = process.env.LOG_DIR || 'logs';
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.environment = process.env.NODE_ENV || 'development';
    
    this.createLogger();
  }

  createLogger() {
    // Define log format
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
        
        // Add stack trace if available
        if (stack) {
          log += `\n${stack}`;
        }
        
        // Add metadata if available
        if (Object.keys(meta).length > 0) {
          log += `\n${JSON.stringify(meta, null, 2)}`;
        }
        
        return log;
      })
    );

    // Define console format for development
    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'HH:mm:ss'
      }),
      winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} ${level}: ${message}`;
        
        if (stack) {
          log += `\n${stack}`;
        }
        
        if (Object.keys(meta).length > 0) {
          log += `\n${JSON.stringify(meta, null, 2)}`;
        }
        
        return log;
      })
    );

    // Create transports
    const transports = [];

    // Console transport
    if (this.environment === 'development') {
      transports.push(
        new winston.transports.Console({
          format: consoleFormat,
          level: this.logLevel
        })
      );
    }

    // File transports for production
    if (this.environment === 'production') {
      // Error log file
      transports.push(
        new winston.transports.File({
          filename: path.join(this.logDir, 'error.log'),
          level: 'error',
          format: logFormat,
          maxsize: 10485760, // 10MB
          maxFiles: 5,
          tailable: true
        })
      );

      // Combined log file
      transports.push(
        new winston.transports.File({
          filename: path.join(this.logDir, 'combined.log'),
          format: logFormat,
          maxsize: 10485760, // 10MB
          maxFiles: 10,
          tailable: true
        })
      );

      // Access log file
      transports.push(
        new winston.transports.File({
          filename: path.join(this.logDir, 'access.log'),
          level: 'info',
          format: logFormat,
          maxsize: 10485760, // 10MB
          maxFiles: 5,
          tailable: true
        })
      );
    }

    // Create logger instance
    this.logger = winston.createLogger({
      level: this.logLevel,
      format: logFormat,
      transports,
      exitOnError: false
    });

    // Handle uncaught exceptions and rejections
    this.logger.exceptions.handle(
      new winston.transports.File({
        filename: path.join(this.logDir, 'exceptions.log'),
        format: logFormat
      })
    );

    this.logger.rejections.handle(
      new winston.transports.File({
        filename: path.join(this.logDir, 'rejections.log'),
        format: logFormat
      })
    );
  }

  // Log methods
  error(message, meta = {}) {
    this.logger.error(message, meta);
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta);
  }

  info(message, meta = {}) {
    this.logger.info(message, meta);
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta);
  }

  verbose(message, meta = {}) {
    this.logger.verbose(message, meta);
  }

  // HTTP request logging
  logRequest(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress,
      userId: req.user?.id || null,
      requestId: req.id || null
    };

    if (res.statusCode >= 400) {
      this.warn('HTTP Request', logData);
    } else {
      this.info('HTTP Request', logData);
    }
  }

  // Database query logging
  logQuery(query, duration, params = []) {
    const logData = {
      query: query.substring(0, 200) + (query.length > 200 ? '...' : ''),
      duration: `${duration}ms`,
      paramsCount: params.length
    };

    if (duration > 1000) {
      this.warn('Slow Database Query', logData);
    } else {
      this.debug('Database Query', logData);
    }
  }

  // Cache operation logging
  logCache(operation, key, hit = null) {
    const logData = {
      operation,
      key: key.substring(0, 100) + (key.length > 100 ? '...' : ''),
      hit
    };

    this.debug('Cache Operation', logData);
  }

  // Queue operation logging
  logQueue(operation, queueName, jobId, data = {}) {
    const logData = {
      operation,
      queueName,
      jobId,
      data: Object.keys(data)
    };

    this.info('Queue Operation', logData);
  }

  // Security event logging
  logSecurity(event, userId, ip, details = {}) {
    const logData = {
      event,
      userId,
      ip,
      timestamp: new Date().toISOString(),
      ...details
    };

    this.warn('Security Event', logData);
  }

  // Performance logging
  logPerformance(operation, duration, metadata = {}) {
    const logData = {
      operation,
      duration: `${duration}ms`,
      ...metadata
    };

    if (duration > 5000) {
      this.warn('Performance Issue', logData);
    } else if (duration > 1000) {
      this.info('Performance Warning', logData);
    } else {
      this.debug('Performance Metric', logData);
    }
  }

  // Business event logging
  logBusiness(event, userId, data = {}) {
    const logData = {
      event,
      userId,
      timestamp: new Date().toISOString(),
      ...data
    };

    this.info('Business Event', logData);
  }

  // External service logging
  logExternal(service, operation, status, duration, error = null) {
    const logData = {
      service,
      operation,
      status,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    };

    if (error) {
      logData.error = error.message;
      this.error('External Service Error', logData);
    } else if (status !== 'success') {
      this.warn('External Service Warning', logData);
    } else {
      this.info('External Service Call', logData);
    }
  }

  // Create child logger with additional context
  child(context) {
    const childLogger = this.logger.child(context);
    
    return {
      error: (message, meta = {}) => childLogger.error(message, meta),
      warn: (message, meta = {}) => childLogger.warn(message, meta),
      info: (message, meta = {}) => childLogger.info(message, meta),
      debug: (message, meta = {}) => childLogger.debug(message, meta),
      verbose: (message, meta = {}) => childLogger.verbose(message, meta)
    };
  }

  // Get logger instance
  getInstance() {
    return this.logger;
  }

  // Stream for Morgan HTTP logger
  stream() {
    return {
      write: (message) => {
        this.info(message.trim());
      }
    };
  }

  // Health check for logging system
  healthCheck() {
    try {
      this.info('Logger health check');
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        level: this.logLevel,
        environment: this.environment,
        transports: this.logger.transports.length
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

// Export singleton instance
const logger = new Logger();

module.exports = logger;
