package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"learning-platform/analytics/internal/config"
	"learning-platform/analytics/internal/handlers"
	"learning-platform/analytics/internal/middleware"
	"learning-platform/analytics/internal/services"
	"learning-platform/analytics/pkg/database"
	"learning-platform/analytics/pkg/logger"
	"learning-platform/analytics/pkg/metrics"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize logger
	logger := logger.New(cfg.LogLevel)
	logger.Info("Starting Analytics Service")

	// Initialize database
	db, err := database.NewConnection(cfg.Database)
	if err != nil {
		logger.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Initialize Redis
	redisClient := services.NewRedisClient(cfg.Redis)
	defer redisClient.Close()

	// Initialize services
	analyticsService := services.NewAnalyticsService(db, redisClient, logger)
	reportService := services.NewReportService(db, redisClient, logger)
	websocketService := services.NewWebSocketService(logger)

	// Initialize metrics
	metricsCollector := metrics.NewCollector()
	metricsCollector.RegisterMetrics()

	// Initialize handlers
	analyticsHandler := handlers.NewAnalyticsHandler(analyticsService, logger)
	reportHandler := handlers.NewReportHandler(reportService, logger)
	websocketHandler := handlers.NewWebSocketHandler(websocketService, logger)
	healthHandler := handlers.NewHealthHandler(db, redisClient, logger)

	// Setup Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Add middleware
	router.Use(middleware.Logger(logger))
	router.Use(middleware.Recovery(logger))
	router.Use(middleware.CORS())
	router.Use(middleware.Metrics(metricsCollector))
	router.Use(middleware.RateLimit(redisClient, cfg.RateLimit))

	// Health check endpoint
	router.GET("/health", healthHandler.Health)

	// Metrics endpoint for Prometheus
	router.GET("/metrics", gin.WrapH(promhttp.Handler()))

	// API routes
	api := router.Group("/api/v1")
	{
		// Analytics endpoints
		analytics := api.Group("/analytics")
		{
			analytics.Use(middleware.Auth(cfg.JWTSecret))
			analytics.GET("/dashboard", analyticsHandler.GetDashboard)
			analytics.GET("/courses/:courseId/stats", analyticsHandler.GetCourseStats)
			analytics.GET("/users/:userId/progress", analyticsHandler.GetUserProgress)
			analytics.GET("/revenue", analyticsHandler.GetRevenueAnalytics)
			analytics.GET("/engagement", analyticsHandler.GetEngagementMetrics)
			analytics.GET("/popular-courses", analyticsHandler.GetPopularCourses)
			analytics.GET("/completion-rates", analyticsHandler.GetCompletionRates)
			analytics.POST("/events", analyticsHandler.TrackEvent)
		}

		// Report endpoints
		reports := api.Group("/reports")
		{
			reports.Use(middleware.Auth(cfg.JWTSecret))
			reports.GET("/generate", reportHandler.GenerateReport)
			reports.GET("/list", reportHandler.ListReports)
			reports.GET("/:reportId/download", reportHandler.DownloadReport)
			reports.POST("/schedule", reportHandler.ScheduleReport)
		}

		// WebSocket endpoint
		api.GET("/ws", middleware.WebSocketAuth(cfg.JWTSecret), websocketHandler.HandleWebSocket)
	}

	// Background tasks
	go analyticsService.ProcessAnalyticsEvents(context.Background())
	go analyticsService.UpdateMetrics(context.Background())
	go websocketService.BroadcastUpdates(context.Background())

	// Start HTTP server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		logger.Infof("Analytics service listening on port %d", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shutdown the server
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	// Create a deadline for shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Attempt graceful shutdown
	if err := srv.Shutdown(ctx); err != nil {
		logger.Errorf("Server forced to shutdown: %v", err)
	}

	logger.Info("Server exited")
}
