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

	"learning-platform/content/internal/config"
	"learning-platform/content/internal/handlers"
	"learning-platform/content/internal/middleware"
	"learning-platform/content/internal/services"
	"learning-platform/content/pkg/database"
	"learning-platform/content/pkg/logger"
	"learning-platform/content/pkg/storage"

	"github.com/gin-gonic/gin"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Initialize logger
	logger := logger.New(cfg.LogLevel)
	logger.Info("Starting Content Processing Service")

	// Initialize database
	db, err := database.NewConnection(cfg.Database)
	if err != nil {
		logger.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Initialize Redis
	redisClient := services.NewRedisClient(cfg.Redis)
	defer redisClient.Close()

	// Initialize storage
	storageClient, err := storage.NewClient(cfg.Storage)
	if err != nil {
		logger.Fatalf("Failed to initialize storage client: %v", err)
	}

	// Initialize services
	contentService := services.NewContentService(db, redisClient, storageClient, logger)
	videoProcessor := services.NewVideoProcessor(storageClient, logger)
	imageProcessor := services.NewImageProcessor(storageClient, logger)
	documentProcessor := services.NewDocumentProcessor(storageClient, logger)

	// Initialize handlers
	contentHandler := handlers.NewContentHandler(contentService, logger)
	uploadHandler := handlers.NewUploadHandler(contentService, videoProcessor, imageProcessor, documentProcessor, logger)
	healthHandler := handlers.NewHealthHandler(db, redisClient, storageClient, logger)

	// Setup Gin router
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	router := gin.New()

	// Add middleware
	router.Use(middleware.Logger(logger))
	router.Use(middleware.Recovery(logger))
	router.Use(middleware.CORS())
	router.Use(middleware.MaxContentSize(100 * 1024 * 1024)) // 100MB max

	// Health check endpoint
	router.GET("/health", healthHandler.Health)

	// API routes
	api := router.Group("/api/v1")
	{
		// Content management endpoints
		content := api.Group("/content")
		{
			content.Use(middleware.Auth(cfg.JWTSecret))
			content.GET("/:id", contentHandler.GetContent)
			content.PUT("/:id", contentHandler.UpdateContent)
			content.DELETE("/:id", contentHandler.DeleteContent)
			content.GET("/:id/metadata", contentHandler.GetMetadata)
			content.POST("/:id/process", contentHandler.ProcessContent)
		}

		// Upload endpoints
		uploads := api.Group("/upload")
		{
			uploads.Use(middleware.Auth(cfg.JWTSecret))
			uploads.POST("/video", uploadHandler.UploadVideo)
			uploads.POST("/image", uploadHandler.UploadImage)
			uploads.POST("/document", uploadHandler.UploadDocument)
			uploads.POST("/thumbnail", uploadHandler.GenerateThumbnail)
		}

		// Processing status endpoints
		processing := api.Group("/processing")
		{
			processing.Use(middleware.Auth(cfg.JWTSecret))
			processing.GET("/status/:jobId", uploadHandler.GetProcessingStatus)
			processing.GET("/queue", uploadHandler.GetProcessingQueue)
			processing.POST("/retry/:jobId", uploadHandler.RetryProcessing)
		}
	}

	// Background processors
	go contentService.ProcessQueue(context.Background())
	go videoProcessor.ProcessQueue(context.Background())
	go imageProcessor.ProcessQueue(context.Background())
	go documentProcessor.ProcessQueue(context.Background())

	// Start HTTP server
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  30 * time.Second, // Longer timeout for file uploads
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start server in a goroutine
	go func() {
		logger.Infof("Content service listening on port %d", cfg.Port)
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
