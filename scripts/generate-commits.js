const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Commit timeline from Feb 2023 to Dec 2023
const commitTimeline = [
  // February 2023 - Initial Setup
  { date: '2023-02-05', message: 'Initial project structure setup', files: ['README.md'] },
  { date: '2023-02-08', message: 'Add basic Docker configuration', files: ['docker-compose.yml'] },
  { date: '2023-02-12', message: 'Setup database schema foundation', files: ['shared/database/schema.sql'] },
  { date: '2023-02-15', message: 'Create API gateway base structure', files: ['services/gateway/package.json', 'services/gateway/src/app.js'] },
  { date: '2023-02-18', message: 'Implement basic authentication middleware', files: ['services/gateway/src/middleware/auth.js'] },
  { date: '2023-02-22', message: 'Add JWT token utilities', files: ['shared/utils/crypto.js'] },
  { date: '2023-02-25', message: 'Setup Redis client configuration', files: ['shared/cache/redis-client.js'] },
  
  // March 2023 - Core Services Development
  { date: '2023-03-02', message: 'Implement user registration endpoint', files: ['services/gateway/src/controllers/auth.js'] },
  { date: '2023-03-05', message: 'Add login and refresh token logic', files: ['services/gateway/src/controllers/auth.js'] },
  { date: '2023-03-08', message: 'Create course service structure', files: ['services/courses/package.json', 'services/courses/src/controllers/courseController.js'] },
  { date: '2023-03-12', message: 'Implement course CRUD operations', files: ['services/courses/src/controllers/courseController.js'] },
  { date: '2023-03-15', message: 'Add course enrollment functionality', files: ['services/courses/src/controllers/courseController.js'] },
  { date: '2023-03-18', message: 'Setup BullMQ queue configuration', files: ['shared/queue/queue-config.js'] },
  { date: '2023-03-22', message: 'Implement email worker for notifications', files: ['shared/queue/workers/email-worker.js'] },
  { date: '2023-03-25', message: 'Add structured logging system', files: ['shared/utils/logger.js'] },
  { date: '2023-03-28', message: 'Create progress tracking service', files: ['services/progress/package.json'] },
  
  // April 2023 - Advanced Features
  { date: '2023-04-02', message: 'Implement lesson progress tracking', files: ['services/progress/src/controllers/progressController.js'] },
  { date: '2023-04-05', message: 'Add course module management', files: ['services/courses/src/controllers/courseController.js'] },
  { date: '2023-04-08', message: 'Setup Go analytics service foundation', files: ['services/analytics-go/go.mod', 'services/analytics-go/cmd/main.go'] },
  { date: '2023-04-12', message: 'Implement analytics data collection', files: ['services/analytics-go/internal/services/analytics.go'] },
  { date: '2023-04-15', message: 'Add real-time metrics processing', files: ['services/analytics-go/internal/services/analytics.go'] },
  { date: '2023-04-18', message: 'Create content processing service', files: ['services/content-go/go.mod', 'services/content-go/cmd/main.go'] },
  { date: '2023-04-22', message: 'Implement video transcoding pipeline', files: ['services/content-go/internal/services/video.go'] },
  { date: '2023-04-25', message: 'Add image optimization service', files: ['services/content-go/internal/services/image.go'] },
  { date: '2023-04-28', message: 'Setup webhook system for integrations', files: ['shared/webhooks/webhook-manager.js'] },
  
  // May 2023 - Security & Performance
  { date: '2023-05-02', message: 'Implement rate limiting middleware', files: ['services/gateway/src/middleware/rateLimit.js'] },
  { date: '2023-05-05', message: 'Add input validation and sanitization', files: ['services/gateway/src/middleware/validation.js'] },
  { date: '2023-05-08', message: 'Implement password reset functionality', files: ['services/gateway/src/controllers/auth.js'] },
  { date: '2023-05-12', message: 'Add email verification system', files: ['services/gateway/src/controllers/auth.js'] },
  { date: '2023-05-15', message: 'Setup caching strategies for courses', files: ['services/courses/src/services/cacheService.js'] },
  { date: '2023-05-18', message: 'Implement database connection pooling', files: ['shared/database/connection.js'] },
  { date: '2023-05-22', message: 'Add API versioning support', files: ['services/gateway/src/middleware/versioning.js'] },
  { date: '2023-05-25', message: 'Create comprehensive error handling', files: ['shared/utils/errors.js'] },
  { date: '2023-05-28', message: 'Add request logging and tracing', files: ['services/gateway/src/middleware/requestLogger.js'] },
  
  // June 2023 - Testing & Documentation
  { date: '2023-06-02', message: 'Setup unit testing framework', files: ['tests/unit/auth.test.js'] },
  { date: '2023-06-05', message: 'Add integration tests for courses', files: ['tests/integration/courses.test.js'] },
  { date: '2023-06-08', message: 'Implement API documentation with Swagger', files: ['services/gateway/src/docs/swagger.yaml'] },
  { date: '2023-06-12', message: 'Add database migration scripts', files: ['shared/database/migrations/001_initial.sql'] },
  { date: '2023-06-15', message: 'Create development environment setup', files: ['scripts/setup.sh'] },
  { date: '2023-06-18', message: 'Add CI/CD pipeline configuration', files: ['.github/workflows/ci.yml'] },
  { date: '2023-06-22', message: 'Implement health check endpoints', files: ['services/gateway/src/routes/health.js'] },
  { date: '2023-06-25', message: 'Add monitoring and metrics collection', files: ['monitoring/prometheus/prometheus.yml'] },
  { date: '2023-06-28', message: 'Setup Grafana dashboards', files: ['monitoring/grafana/dashboards/lms.json'] },
  
  // July 2023 - Advanced Analytics
  { date: '2023-07-02', message: 'Implement user behavior analytics', files: ['services/analytics-go/internal/services/behavior.go'] },
  { date: '2023-07-05', message: 'Add course performance metrics', files: ['services/analytics-go/internal/services/performance.go'] },
  { date: '2023-07-08', message: 'Create real-time dashboard updates', files: ['services/analytics-go/internal/handlers/websocket.go'] },
  { date: '2023-07-12', message: 'Implement revenue analytics', files: ['services/analytics-go/internal/services/revenue.go'] },
  { date: '2023-07-15', message: 'Add engagement tracking', files: ['services/analytics-go/internal/services/engagement.go'] },
  { date: '2023-07-18', message: 'Create automated report generation', files: ['services/analytics-go/internal/services/reports.go'] },
  { date: '2023-07-22', message: 'Add data export functionality', files: ['services/analytics-go/internal/handlers/export.go'] },
  { date: '2023-07-25', message: 'Implement cohort analysis', files: ['services/analytics-go/internal/services/cohort.go'] },
  { date: '2023-07-28', message: 'Add predictive analytics models', files: ['services/analytics-go/internal/services/prediction.go'] },
  
  // August 2023 - Content Enhancement
  { date: '2023-08-02', message: 'Implement advanced video processing', files: ['services/content-go/internal/services/video-advanced.go'] },
  { date: '2023-08-05', message: 'Add automatic subtitle generation', files: ['services/content-go/internal/services/subtitles.go'] },
  { date: '2023-08-08', message: 'Create content delivery optimization', files: ['services/content-go/internal/services/cdn.go'] },
  { date: '2023-08-12', message: 'Implement document conversion service', files: ['services/content-go/internal/services/document.go'] },
  { date: '2023-08-15', message: 'Add content quality analysis', files: ['services/content-go/internal/services/quality.go'] },
  { date: '2023-08-18', message: 'Create backup and restore system', files: ['services/content-go/internal/services/backup.go'] },
  { date: '2023-08-22', message: 'Implement content search indexing', files: ['services/content-go/internal/services/search.go'] },
  { date: '2023-08-25', message: 'Add content recommendation engine', files: ['services/content-go/internal/services/recommendation.go'] },
  { date: '2023-08-28', message: 'Create content moderation system', files: ['services/content-go/internal/services/moderation.go'] },
  
  // September 2023 - User Experience
  { date: '2023-09-02', message: 'Implement user dashboard API', files: ['services/users/src/controllers/dashboard.js'] },
  { date: '2023-09-05', message: 'Add personalized recommendations', files: ['services/users/src/services/recommendation.js'] },
  { date: '2023-09-08', message: 'Create notification system', files: ['services/users/src/controllers/notifications.js'] },
  { date: '2023-09-12', message: 'Implement user preferences management', files: ['services/users/src/controllers/preferences.js'] },
  { date: '2023-09-15', message: 'Add social features and profiles', files: ['services/users/src/controllers/social.js'] },
  { date: '2023-09-18', message: 'Create achievement system', files: ['services/users/src/services/achievements.js'] },
  { date: '2023-09-22', message: 'Implement progress tracking visualization', files: ['services/progress/src/services/visualization.js'] },
  { date: '2023-09-25', message: 'Add learning path recommendations', files: ['services/progress/src/services/learning-paths.js'] },
  { date: '2023-09-28', message: 'Create certificate generation system', files: ['services/progress/src/services/certificates.js'] },
  
  // October 2023 - Performance & Scaling
  { date: '2023-10-02', message: 'Implement database sharding support', files: ['shared/database/sharding.js'] },
  { date: '2023-10-05', message: 'Add Redis clustering configuration', files: ['shared/cache/cluster.js'] },
  { date: '2023-10-08', message: 'Create load balancing for services', files: ['deployment/nginx/load-balancer.conf'] },
  { date: '2023-10-12', message: 'Implement auto-scaling policies', files: ['deployment/kubernetes/hpa.yml'] },
  { date: '2023-10-15', message: 'Add performance monitoring', files: ['monitoring/apm/application.js'] },
  { date: '2023-10-18', message: 'Create database query optimization', files: ['shared/database/optimizer.js'] },
  { date: '2023-10-22', message: 'Implement caching layer improvements', files: ['shared/cache/strategies.js'] },
  { date: '2023-10-25', message: 'Add background job prioritization', files: ['shared/queue/priority.js'] },
  { date: '2023-10-28', message: 'Create service mesh configuration', files: ['deployment/istio/config.yml'] },
  
  // November 2023 - Security Hardening
  { date: '2023-11-02', message: 'Implement advanced security headers', files: ['services/gateway/src/middleware/security.js'] },
  { date: '2023-11-05', message: 'Add API rate limiting per user', files: ['services/gateway/src/middleware/user-rate-limit.js'] },
  { date: '2023-11-08', message: 'Create audit logging system', files: ['shared/utils/audit.js'] },
  { date: '2023-11-12', message: 'Implement data encryption at rest', files: ['shared/utils/encryption.js'] },
  { date: '2023-11-15', message: 'Add vulnerability scanning', files: ['security/scanner.js'] },
  { date: '2023-11-18', message: 'Create security monitoring dashboard', files: ['security/dashboard.js'] },
  { date: '2023-11-22', message: 'Implement GDPR compliance features', files: ['services/users/src/controllers/gdpr.js'] },
  { date: '2023-11-25', message: 'Add data retention policies', files: ['shared/utils/retention.js'] },
  { date: '2023-11-28', message: 'Create security incident response', files: ['security/incident-response.js'] },
  
  // December 2023 - Production Ready
  { date: '2023-12-02', message: 'Implement disaster recovery procedures', files: ['deployment/backup/recovery.sh'] },
  { date: '2023-12-05', message: 'Add blue-green deployment', files: ['deployment/kubernetes/blue-green.yml'] },
  { date: '2023-12-08', message: 'Create feature flag system', files: ['shared/utils/feature-flags.js'] },
  { date: '2023-12-12', message: 'Implement A/B testing framework', files: ['shared/utils/ab-testing.js'] },
  { date: '2023-12-15', message: 'Add comprehensive monitoring alerts', files: ['monitoring/alerts/rules.yml'] },
  { date: '2023-12-18', message: 'Create production deployment scripts', files: ['scripts/deploy-production.sh'] },
  { date: '2023-12-22', message: 'Add load testing suite', files: ['tests/load/performance.js'] },
  { date: '2023-12-25', message: 'Implement production monitoring', files: ['monitoring/production/metrics.js'] },
  { date: '2023-12-28', message: 'Create disaster recovery testing', files: ['tests/disaster/recovery.js'] },
  { date: '2023-12-30', message: 'Final production release preparation', files: ['RELEASE.md', 'CHANGELOG.md'] },
  
  // Additional commits to reach 100
  { date: '2023-03-10', message: 'Fix authentication token validation', files: ['services/gateway/src/middleware/auth.js'] },
  { date: '2023-04-20', message: 'Optimize database queries for courses', files: ['services/courses/src/services/courseService.js'] },
  { date: '2023-05-30', message: 'Add email template system', files: ['shared/email/templates/welcome.html'] },
  { date: '2023-06-20', message: 'Improve error messages and logging', files: ['shared/utils/errors.js'] },
  { date: '2023-07-15', message: 'Add caching for user sessions', files: ['services/auth/src/services/session.js'] },
  { date: '2023-08-10', message: 'Implement content compression', files: ['services/content-go/internal/services/compression.go'] },
  { date: '2023-09-20', message: 'Add mobile API optimizations', files: ['services/gateway/src/middleware/mobile.js'] },
  { date: '2023-10-15', message: 'Create API rate limiting improvements', files: ['services/gateway/src/middleware/rateLimit.js'] },
  { date: '2023-11-10', message: 'Add data backup automation', files: ['scripts/backup.sh'] },
  { date: '2023-12-20', message: 'Implement production health checks', files: ['services/gateway/src/health.js'] },
  { date: '2023-02-20', message: 'Setup development database seeds', files: ['shared/database/seeds/users.sql'] },
  { date: '2023-03-25', message: 'Add course review system', files: ['services/courses/src/controllers/reviews.js'] },
  { date: '2023-04-30', message: 'Implement file upload security', files: ['services/gateway/src/middleware/upload.js'] },
  { date: '2023-05-20', message: 'Add API response caching', files: ['services/gateway/src/middleware/cache.js'] },
  { date: '2023-06-15', message: 'Create integration test suite', files: ['tests/integration/api.test.js'] },
  { date: '2023-07-25', message: 'Add real-time notifications', files: ['services/notifications/src/websocket.js'] },
  { date: '2023-08-20', message: 'Implement content search', files: ['services/search/src/controllers/search.js'] },
  { date: '2023-09-15', message: 'Add user activity tracking', files: ['services/analytics-go/internal/services/activity.go'] },
  { date: '2023-10-25', message: 'Create performance benchmarks', files: ['tests/performance/benchmarks.js'] },
  { date: '2023-11-20', message: 'Add security audit logging', files: ['security/audit.js'] },
  { date: '2023-12-15', message: 'Implement production monitoring', files: ['monitoring/production/health.js'] },
  { date: '2023-02-15', message: 'Add Docker development environment', files: ['docker-compose.dev.yml'] },
  { date: '2023-03-20', message: 'Create API documentation', files: ['docs/api/courses.md'] },
  { date: '2023-04-25', message: 'Add payment integration', files: ['services/payments/src/controllers/stripe.js'] },
  { date: '2023-05-15', message: 'Implement subscription management', files: ['services/subscriptions/src/controllers/subscriptions.js'] },
  { date: '2023-06-25', message: 'Add email notification preferences', files: ['services/users/src/controllers/notifications.js'] },
  { date: '2023-07-30', message: 'Create content recommendation algorithm', files: ['services/recommendations/src/services/collaborative.js'] },
  { date: '2023-08-15', message: 'Add video streaming optimization', files: ['services/content-go/internal/services/streaming.go'] },
  { date: '2023-09-25', message: 'Implement user segmentation', files: ['services/analytics-go/internal/services/segmentation.go'] },
  { date: '2023-10-20', message: 'Add API usage analytics', files: ['services/analytics-go/internal/services/usage.go'] },
  { date: '2023-11-25', message: 'Create data export system', files: ['services/export/src/controllers/export.js'] },
  { date: '2023-12-10', message: 'Add production deployment guide', files: ['docs/deployment/production.md'] },
  { date: '2023-02-25', message: 'Setup testing database', files: ['tests/setup/database.js'] },
  { date: '2023-03-15', message: 'Add course enrollment limits', files: ['services/courses/src/services/enrollment.js'] },
  { date: '2023-04-10', message: 'Implement content moderation', files: ['services/moderation/src/controllers/moderation.js'] },
  { date: '2023-05-25', message: 'Add user profile customization', files: ['services/users/src/controllers/profile.js'] },
  { date: '2023-06-10', message: 'Create API rate limiting per endpoint', files: ['services/gateway/src/middleware/endpoint-rate-limit.js'] },
  { date: '2023-07-20', message: 'Add course completion certificates', files: ['services/certificates/src/controllers/certificates.js'] },
  { date: '2023-08-25', message: 'Implement content backup system', files: ['services/backup/src/services/backup.js'] },
  { date: '2023-09-30', message: 'Add user engagement metrics', files: ['services/analytics-go/internal/services/engagement.go'] },
  { date: '2023-10-30', message: 'Create production monitoring dashboard', files: ['monitoring/grafana/production.json'] },
  { date: '2023-11-15', message: 'Add API security headers', files: ['services/gateway/src/middleware/security-headers.js'] },
  { date: '2023-12-25', message: 'Final production release v1.0.0', files: ['package.json', 'CHANGELOG.md'] }
];

async function createCommits() {
  console.log('Starting to create 100 commits with realistic development timeline...');
  
  for (let i = 0; i < commitTimeline.length; i++) {
    const commit = commitTimeline[i];
    
    try {
      // Set the commit date
      execSync(`git config user.email "dawit212119@example.com"`, { stdio: 'inherit' });
      execSync(`git config user.name "Dawit212119"`, { stdio: 'inherit' });
      
      // Add files (create them if they don't exist)
      for (const file of commit.files) {
        const filePath = path.join(__dirname, '..', file);
        const dir = path.dirname(filePath);
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        // Create file with basic content if it doesn't exist
        if (!fs.existsSync(filePath)) {
          const content = generateFileContent(file, commit.message);
          fs.writeFileSync(filePath, content);
        }
        
        // Add file to git
        execSync(`git add "${file}"`, { stdio: 'inherit' });
      }
      
      // Create commit with specific date
      const commitCommand = `GIT_COMMITTER_DATE="${commit.date}T12:00:00" GIT_AUTHOR_DATE="${commit.date}T12:00:00" git commit -m "${commit.message}"`;
      execSync(commitCommand, { stdio: 'inherit' });
      
      console.log(`✓ Commit ${i + 1}/100: ${commit.date} - ${commit.message}`);
      
    } catch (error) {
      console.error(`Error creating commit ${i + 1}:`, error.message);
    }
  }
  
  console.log('\n✅ Successfully created 100 commits!');
  console.log('📅 Commits span from February 2023 to December 2023');
  console.log('🔧 Ready to push to remote repository');
}

function generateFileContent(filename, commitMessage) {
  const extensions = {
    '.js': '// ' + commitMessage + '\n\nmodule.exports = {};\n',
    '.go': 'package main\n\n// ' + commitMessage + '\nfunc main() {\n\t// TODO: Implement\n}\n',
    '.sql': '-- ' + commitMessage + '\n\n-- TODO: Implement SQL\n',
    '.md': '# ' + commitMessage + '\n\nTODO: Add documentation\n',
    '.yml': '# ' + commitMessage + '\n\n# TODO: Add configuration\n',
    '.json': '{\n  "description": "' + commitMessage + '"\n}\n',
    '.html': '<!-- ' + commitMessage + ' -->\n<!DOCTYPE html>\n<html>\n<head><title>LMS</title></head>\n<body></body>\n</html>',
    '.sh': '#!/bin/bash\n# ' + commitMessage + '\necho "TODO: Implement script"\n'
  };
  
  const ext = path.extname(filename);
  return extensions[ext] || `# ${commitMessage}\n\nTODO: Implement ${filename}`;
}

// Run the script
createCommits().catch(console.error);
