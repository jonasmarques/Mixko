package main

import (
	"embed"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// After a failed startup the services are nil, and Wails aborts on a nil
	// binding before the error dialog in startup can be shown.
	bind := []interface{}{app}
	if app.startupErr == nil {
		bind = append(bind,
			app.Auth,
			app.Feed,
			app.PostBuilder,
			app.Notifications,
			app.Social,
			app.Search,
			app.Chat,
			app.Moderation,
			app.Updater,
		)
	}

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "Mixko",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
		Bind:             bind,
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
