package main

import (
	"context"
	"os"
	"path/filepath"
	"mixko/database"
	"mixko/services"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx          context.Context
	db           *database.DB
	bskyClient   *services.BSkyClient
	Auth          *services.AuthService
	Feed          *services.FeedService
	PostBuilder   *services.PostBuilderService
	Notifications *services.NotificationsService
	Social        *services.SocialService
	Search        *services.SearchService
	Chat          *services.ChatService
	Moderation    *services.ModerationService
	Sync          *services.SyncService
}

// NewApp creates a new App application struct
func NewApp() *App {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	appDir := filepath.Join(configDir, "mixko")
	os.MkdirAll(appDir, 0755)
	dbPath := filepath.Join(appDir, "mixko_data.sqlite")

	db, err := database.InitDB(dbPath)
	if err != nil {
		panic("Failed to initialize database: " + err.Error())
	}
	
	bskyClient := services.NewBSkyClient(db)
	
	app := &App{
		db:          db,
		bskyClient:  bskyClient,
		Auth:          services.NewAuthService(bskyClient),
		Feed:          services.NewFeedService(bskyClient),
		PostBuilder:   services.NewPostBuilderService(bskyClient),
		Notifications: services.NewNotificationsService(bskyClient),
		Social:        services.NewSocialService(bskyClient),
		Search:        services.NewSearchService(bskyClient),
		Chat:          services.NewChatService(bskyClient),
		Moderation:    services.NewModerationService(bskyClient),
	}
	app.Sync = services.NewSyncService(bskyClient, app.Feed, app.Notifications, app.Chat)
	return app
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Force window to foreground
	runtime.WindowShow(ctx)

	// Attempt to restore session
	_, _ = a.Auth.CheckSession(ctx)
	
	// Start background sync
	a.Sync.Start(ctx)
}

func (a *App) shutdown(ctx context.Context) {
	if a.Sync != nil {
		a.Sync.Stop()
	}
	if a.db != nil {
		a.db.Close()
	}
}
