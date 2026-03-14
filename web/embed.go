package web

import "embed"

// Assets holds the built frontend files from web/dist/.
//
//go:embed all:dist
var Assets embed.FS
