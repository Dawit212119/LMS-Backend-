package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/sirupsen/logrus"
	"learning-platform/analytics/pkg/database"
)

type AnalyticsService struct {
	db           *database.DB
	redis        *redis.Client
	logger       *logrus.Logger
	eventQueue   chan AnalyticsEvent
	metricsCache map[string]interface{}
	cacheMutex   sync.RWMutex
}

type AnalyticsEvent struct {
	ID          string                 `json:"id"`
	UserID      string                 `json:"user_id,omitempty"`
	SessionID   string                 `json:"session_id"`
	EventType   string                 `json:"event_type"`
	Properties  map[string]interface{} `json:"properties"`
	Timestamp   time.Time              `json:"timestamp"`
	IPAddress   string                 `json:"ip_address,omitempty"`
	UserAgent   string                 `json:"user_agent,omitempty"`
	CourseID    string                 `json:"course_id,omitempty"`
	LessonID    string                 `json:"lesson_id,omitempty"`
}

type CourseStats struct {
	CourseID          string    `json:"course_id"`
	Title             string    `json:"title"`
	EnrolledCount     int       `json:"enrolled_count"`
	CompletedCount    int       `json:"completed_count"`
	ActiveStudents    int       `json:"active_students"`
	AverageProgress   float64   `json:"average_progress"`
	CompletionRate    float64   `json:"completion_rate"`
	TotalWatchTime    int64     `json:"total_watch_time"`
	AverageRating     float64   `json:"average_rating"`
	Revenue           float64   `json:"revenue"`
	LastUpdated       time.Time `json:"last_updated"`
}

type UserProgress struct {
	UserID          string    `json:"user_id"`
	Username        string    `json:"username"`
	EnrolledCourses int       `json:"enrolled_courses"`
	CompletedCourses int      `json:"completed_courses"`
	TotalWatchTime  int64     `json:"total_watch_time"`
	AverageProgress float64   `json:"average_progress"`
	LastActive      time.Time `json:"last_active"`
	Streak          int       `json:"streak"`
	Achievements    []string  `json:"achievements"`
}

type EngagementMetrics struct {
	Date              time.Time `json:"date"`
	ActiveUsers       int       `json:"active_users"`
	NewUsers          int       `json:"new_users"`
	SessionsCount     int       `json:"sessions_count"`
	AverageSessionTime float64  `json:"average_session_time"`
	PageViews         int       `json:"page_views"`
	VideoViews        int       `json:"video_views"`
	QuizAttempts      int       `json:"quiz_attempts"`
	Completions       int       `json:"completions"`
}

func NewAnalyticsService(db *database.DB, redis *redis.Client, logger *logrus.Logger) *AnalyticsService {
	return &AnalyticsService{
		db:           db,
		redis:        redis,
		logger:       logger,
		eventQueue:   make(chan AnalyticsEvent, 1000),
		metricsCache: make(map[string]interface{}),
	}
}

func (s *AnalyticsService) ProcessAnalyticsEvents(ctx context.Context) {
	for {
		select {
		case event := <-s.eventQueue:
			if err := s.processEvent(ctx, event); err != nil {
				s.logger.Errorf("Failed to process analytics event: %v", err)
			}
		case <-ctx.Done():
			s.logger.Info("Stopping analytics event processor")
			return
		}
	}
}

func (s *AnalyticsService) processEvent(ctx context.Context, event AnalyticsEvent) error {
	// Store event in database
	query := `
		INSERT INTO analytics_events (id, user_id, session_id, event_type, properties, timestamp, ip_address, user_agent)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO NOTHING
	`

	propertiesJSON, err := json.Marshal(event.Properties)
	if err != nil {
		return fmt.Errorf("failed to marshal event properties: %w", err)
	}

	_, err = s.db.ExecContext(ctx, query,
		event.ID,
		event.UserID,
		event.SessionID,
		event.EventType,
		propertiesJSON,
		event.Timestamp,
		event.IPAddress,
		event.UserAgent,
	)
	if err != nil {
		return fmt.Errorf("failed to store analytics event: %w", err)
	}

	// Update real-time metrics
	s.updateRealTimeMetrics(ctx, event)

	// Cache event for recent activity
	s.cacheRecentEvent(ctx, event)

	return nil
}

func (s *AnalyticsService) TrackEvent(ctx context.Context, event AnalyticsEvent) error {
	select {
	case s.eventQueue <- event:
		return nil
	default:
		// Queue is full, process immediately
		return s.processEvent(ctx, event)
	}
}

func (s *AnalyticsService) GetCourseStats(ctx context.Context, courseID string) (*CourseStats, error) {
	// Try cache first
	cacheKey := fmt.Sprintf("course_stats:%s", courseID)
	cached, err := s.redis.Get(ctx, cacheKey).Result()
	if err == nil {
		var stats CourseStats
		if json.Unmarshal([]byte(cached), &stats) == nil {
			return &stats, nil
		}
	}

	// Query database
	query := `
		WITH course_enrollments AS (
			SELECT 
				c.id as course_id,
				c.title,
				COUNT(e.id) as enrolled_count,
				COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as completed_count,
				COUNT(CASE WHEN e.status = 'active' AND e.last_accessed_at > NOW() - INTERVAL '30 days' THEN 1 END) as active_students,
				COALESCE(AVG(e.progress_percentage), 0) as average_progress,
				COALESCE(c.rating, 0) as average_rating,
				COALESCE(SUM(p.amount), 0) as revenue
			FROM courses c
			LEFT JOIN enrollments e ON c.id = e.course_id
			LEFT JOIN payments p ON c.id = p.course_id AND p.status = 'completed'
			WHERE c.id = $1
			GROUP BY c.id, c.title, c.rating
		),
		watch_time_stats AS (
			SELECT 
				COALESCE(SUM(lp.completion_time), 0) as total_watch_time
			FROM enrollments e
			JOIN lesson_progress lp ON e.id = lp.enrollment_id
			WHERE e.course_id = $1
		)
		SELECT 
			ce.*,
			wt.total_watch_time,
			ce.completed_count::float / NULLIF(ce.enrolled_count, 0) * 100 as completion_rate,
			NOW() as last_updated
		FROM course_enrollments ce
		CROSS JOIN watch_time_stats wt
	`

	var stats CourseStats
	err = s.db.QueryRowContext(ctx, query, courseID).Scan(
		&stats.CourseID,
		&stats.Title,
		&stats.EnrolledCount,
		&stats.CompletedCount,
		&stats.ActiveStudents,
		&stats.AverageProgress,
		&stats.AverageRating,
		&stats.Revenue,
		&stats.TotalWatchTime,
		&stats.CompletionRate,
		&stats.LastUpdated,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("course not found: %s", courseID)
		}
		return nil, fmt.Errorf("failed to get course stats: %w", err)
	}

	// Cache result
	statsJSON, _ := json.Marshal(stats)
	s.redis.Set(ctx, cacheKey, statsJSON, 5*time.Minute)

	return &stats, nil
}

func (s *AnalyticsService) GetUserProgress(ctx context.Context, userID string) (*UserProgress, error) {
	// Try cache first
	cacheKey := fmt.Sprintf("user_progress:%s", userID)
	cached, err := s.redis.Get(ctx, cacheKey).Result()
	if err == nil {
		var progress UserProgress
		if json.Unmarshal([]byte(cached), &progress) == nil {
			return &progress, nil
		}
	}

	query := `
		WITH user_stats AS (
			SELECT 
				u.id as user_id,
				u.username,
				COUNT(e.id) as enrolled_courses,
				COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as completed_courses,
				COALESCE(AVG(e.progress_percentage), 0) as average_progress,
				COALESCE(e.last_accessed_at, u.created_at) as last_active
			FROM users u
			LEFT JOIN enrollments e ON u.id = e.user_id
			WHERE u.id = $1
			GROUP BY u.id, u.username, e.last_accessed_at
		),
		watch_time_stats AS (
			SELECT 
				COALESCE(SUM(lp.completion_time), 0) as total_watch_time
			FROM enrollments e
			JOIN lesson_progress lp ON e.id = lp.enrollment_id
			WHERE e.user_id = $1
		),
		streak_stats AS (
			SELECT 
				COALESCE(COUNT(DISTINCT DATE(lp.created_at)), 0) as streak
			FROM lesson_progress lp
			WHERE lp.user_id = $1 
			AND lp.created_at >= NOW() - INTERVAL '30 days'
		)
		SELECT 
			us.*,
			wt.total_watch_time,
			ss.streak
		FROM user_stats us
		CROSS JOIN watch_time_stats wt
		CROSS JOIN streak_stats ss
	`

	var progress UserProgress
	err = s.db.QueryRowContext(ctx, query, userID).Scan(
		&progress.UserID,
		&progress.Username,
		&progress.EnrolledCourses,
		&progress.CompletedCourses,
		&progress.AverageProgress,
		&progress.LastActive,
		&progress.TotalWatchTime,
		&progress.Streak,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found: %s", userID)
		}
		return nil, fmt.Errorf("failed to get user progress: %w", err)
	}

	// Get achievements (placeholder)
	progress.Achievements = []string{}

	// Cache result
	progressJSON, _ := json.Marshal(progress)
	s.redis.Set(ctx, cacheKey, progressJSON, 5*time.Minute)

	return &progress, nil
}

func (s *AnalyticsService) GetEngagementMetrics(ctx context.Context, startDate, endDate time.Time) ([]EngagementMetrics, error) {
	query := `
		SELECT 
			DATE(timestamp) as date,
			COUNT(DISTINCT user_id) as active_users,
			COUNT(DISTINCT CASE WHEN event_type = 'user_registered' THEN user_id END) as new_users,
			COUNT(DISTINCT session_id) as sessions_count,
			AVG(
				CASE WHEN event_type = 'session_end' 
				THEN (properties->>'duration')::float 
				ELSE 0 END
			) as average_session_time,
			COUNT(CASE WHEN event_type = 'page_view' THEN 1 END) as page_views,
			COUNT(CASE WHEN event_type = 'video_started' THEN 1 END) as video_views,
			COUNT(CASE WHEN event_type = 'quiz_attempted' THEN 1 END) as quiz_attempts,
			COUNT(CASE WHEN event_type = 'lesson_completed' THEN 1 END) as completions
		FROM analytics_events
		WHERE timestamp BETWEEN $1 AND $2
		GROUP BY DATE(timestamp)
		ORDER BY date
	`

	rows, err := s.db.QueryContext(ctx, query, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get engagement metrics: %w", err)
	}
	defer rows.Close()

	var metrics []EngagementMetrics
	for rows.Next() {
		var metric EngagementMetrics
		err := rows.Scan(
			&metric.Date,
			&metric.ActiveUsers,
			&metric.NewUsers,
			&metric.SessionsCount,
			&metric.AverageSessionTime,
			&metric.PageViews,
			&metric.VideoViews,
			&metric.QuizAttempts,
			&metric.Completions,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan engagement metric: %w", err)
		}
		metrics = append(metrics, metric)
	}

	return metrics, nil
}

func (s *AnalyticsService) GetPopularCourses(ctx context.Context, limit int) ([]CourseStats, error) {
	query := `
		SELECT 
			c.id as course_id,
			c.title,
			COUNT(e.id) as enrolled_count,
			COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as completed_count,
			COUNT(CASE WHEN e.status = 'active' AND e.last_accessed_at > NOW() - INTERVAL '30 days' THEN 1 END) as active_students,
			COALESCE(AVG(e.progress_percentage), 0) as average_progress,
			COALESCE(c.rating, 0) as average_rating,
			COALESCE(SUM(p.amount), 0) as revenue,
			COUNT(CASE WHEN e.status = 'completed' THEN 1 END)::float / NULLIF(COUNT(e.id), 0) * 100 as completion_rate
		FROM courses c
		LEFT JOIN enrollments e ON c.id = e.course_id
		LEFT JOIN payments p ON c.id = p.course_id AND p.status = 'completed'
		WHERE c.status = 'published'
		GROUP BY c.id, c.title, c.rating
		ORDER BY enrolled_count DESC, average_rating DESC
		LIMIT $1
	`

	rows, err := s.db.QueryContext(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to get popular courses: %w", err)
	}
	defer rows.Close()

	var courses []CourseStats
	for rows.Next() {
		var course CourseStats
		err := rows.Scan(
			&course.CourseID,
			&course.Title,
			&course.EnrolledCount,
			&course.CompletedCount,
			&course.ActiveStudents,
			&course.AverageProgress,
			&course.AverageRating,
			&course.Revenue,
			&course.CompletionRate,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan course stats: %w", err)
		}
		course.LastUpdated = time.Now()
		courses = append(courses, course)
	}

	return courses, nil
}

func (s *AnalyticsService) UpdateMetrics(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := s.updateDashboardMetrics(ctx); err != nil {
				s.logger.Errorf("Failed to update dashboard metrics: %v", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func (s *AnalyticsService) updateDashboardMetrics(ctx context.Context) error {
	// Update various dashboard metrics
	metrics := make(map[string]interface{})

	// Total users
	var totalUsers int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users WHERE is_active = true").Scan(&totalUsers)
	metrics["total_users"] = totalUsers

	// Total courses
	var totalCourses int
	s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM courses WHERE status = 'published'").Scan(&totalCourses)
	metrics["total_courses"] = totalCourses

	// Total revenue
	var totalRevenue sql.NullFloat64
	s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed'").Scan(&totalRevenue)
	metrics["total_revenue"] = totalRevenue.Float64

	// Active users today
	var activeUsersToday int
	s.db.QueryRowContext(ctx, `
		SELECT COUNT(DISTINCT user_id) FROM analytics_events 
		WHERE DATE(timestamp) = CURRENT_DATE
	`).Scan(&activeUsersToday)
	metrics["active_users_today"] = activeUsersToday

	// Cache metrics
	metricsJSON, _ := json.Marshal(metrics)
	s.redis.Set(ctx, "dashboard_metrics", metricsJSON, 5*time.Minute)

	// Update local cache
	s.cacheMutex.Lock()
	s.metricsCache = metrics
	s.cacheMutex.Unlock()

	return nil
}

func (s *AnalyticsService) updateRealTimeMetrics(ctx context.Context, event AnalyticsEvent) {
	// Update real-time counters based on event type
	switch event.EventType {
	case "user_registered":
		s.redis.Incr(ctx, "metrics:new_users_today")
	case "course_enrolled":
		s.redis.Incr(ctx, "metrics:enrollments_today")
	case "lesson_completed":
		s.redis.Incr(ctx, "metrics:lessons_completed_today")
	case "video_started":
		s.redis.Incr(ctx, "metrics:video_views_today")
	}
}

func (s *AnalyticsService) cacheRecentEvent(ctx context.Context, event AnalyticsEvent) {
	// Cache recent events for real-time dashboards
	eventJSON, _ := json.Marshal(event)
	s.redis.LPush(ctx, "recent_events", eventJSON)
	s.redis.LTrim(ctx, "recent_events", 0, 99) // Keep last 100 events
	s.redis.Expire(ctx, "recent_events", time.Hour)
}

func (s *AnalyticsService) GetCachedMetrics() map[string]interface{} {
	s.cacheMutex.RLock()
	defer s.cacheMutex.RUnlock()
	
	metrics := make(map[string]interface{})
	for k, v := range s.metricsCache {
		metrics[k] = v
	}
	return metrics
}
