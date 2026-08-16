package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"mixko/database"
	"mixko/services"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx      context.Context
	db       *database.DB
	atClient *services.ATClient

	// startupErr holds a fatal initialization failure so it can be shown to the
	// user as a dialog instead of crashing the process.
	startupErr error

	Auth          *services.AuthService
	Feed          *services.FeedService
	PostBuilder   *services.PostBuilderService
	Notifications *services.NotificationsService
	Social        *services.SocialService
	Search        *services.SearchService
	Chat          *services.ChatService
	Moderation    *services.ModerationService
	Sync          *services.SyncService
	Updater       *services.UpdaterService
}

// NewApp creates a new App application struct
func NewApp() *App {
	configDir, err := os.UserConfigDir()
	if err != nil {
		configDir = "."
	}
	appDir := filepath.Join(configDir, "mixko")
	if err := os.MkdirAll(appDir, 0755); err != nil {
		return &App{startupErr: fmt.Errorf("could not create the application folder %s: %w", appDir, err)}
	}
	dbPath := filepath.Join(appDir, "mixko_data.sqlite")

	db, err := database.InitDB(dbPath)
	if err != nil {
		// Reported through a dialog in startup; crashing here would leave the
		// user with no window and no explanation.
		return &App{startupErr: fmt.Errorf("could not open the local database: %w", err)}
	}

	atClient := services.NewATClient(db)

	app := &App{
		db:            db,
		atClient:      atClient,
		Auth:          services.NewAuthService(atClient),
		Feed:          services.NewFeedService(atClient),
		PostBuilder:   services.NewPostBuilderService(atClient),
		Notifications: services.NewNotificationsService(atClient),
		Social:        services.NewSocialService(atClient),
		Search:        services.NewSearchService(atClient),
		Chat:          services.NewChatService(atClient),
		Moderation:    services.NewModerationService(atClient),
		Updater:       services.NewUpdaterService(),
	}
	app.Sync = services.NewSyncService(atClient, app.Feed, app.Notifications, app.Chat)
	return app
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	if a.startupErr != nil {
		_, _ = runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
			Type:    runtime.ErrorDialog,
			Title:   "Mixko",
			Message: a.startupErr.Error(),
		})
		runtime.Quit(ctx)
		return
	}

	// Bind every outgoing request to the application lifetime so in-flight
	// calls are cancelled on shutdown.
	a.atClient.SetAppContext(ctx)

	// Force window to foreground
	runtime.WindowShow(ctx)

	// Attempt to restore session
	_, _ = a.Auth.CheckSession(ctx)

	// Start background sync
	a.Sync.Start(ctx)
}

func (a *App) shutdown(_ context.Context) {
	if a.Sync != nil {
		a.Sync.Stop()
	}
	if a.db != nil {
		a.db.Close()
	}
}
