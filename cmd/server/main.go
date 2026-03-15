package main

import (
	"context"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"

	"github.com/twiechert/tofu-k8s-console/internal/api"
	"github.com/twiechert/tofu-k8s-console/internal/auth"
	"github.com/twiechert/tofu-k8s-console/internal/k8s"
	"github.com/twiechert/tofu-k8s-console/internal/middleware"
	"github.com/twiechert/tofu-k8s-console/web"
)

func main() {
	addr := flag.String("addr", ":8090", "listen address")
	kubeconfig := flag.String("kubeconfig", os.Getenv("KUBECONFIG"), "path to kubeconfig (empty for in-cluster)")
	authConfig := flag.String("auth-config", os.Getenv("AUTH_CONFIG"), "path to auth config JSON (empty for no auth)")
	flag.Parse()

	// Load auth config
	authCfg, err := auth.LoadConfig(*authConfig)
	if err != nil {
		log.Fatalf("failed to load auth config: %v", err)
	}
	log.Printf("auth mode: %s", authCfg.Mode)

	k8sClient, err := k8s.NewClient(*kubeconfig)
	if err != nil {
		log.Fatalf("failed to create k8s client: %v", err)
	}

	mux := http.NewServeMux()

	// OIDC auth routes (before middleware)
	var oidcProvider *auth.OIDCProvider
	if authCfg.Mode == "oidc" {
		oidcProvider, err = auth.NewOIDCProvider(context.Background(), authCfg)
		if err != nil {
			log.Fatalf("failed to create OIDC provider: %v", err)
		}
		mux.HandleFunc("GET /auth/login", oidcProvider.HandleLogin)
		mux.HandleFunc("GET /auth/callback", oidcProvider.HandleCallback)
		mux.HandleFunc("GET /auth/logout", auth.HandleLogout)
	}

	// API routes
	handler := api.NewHandler(k8sClient)
	handler.RegisterRoutes(mux)

	// Serve embedded frontend
	dist, err := fs.Sub(web.Assets, "dist")
	if err != nil {
		log.Fatalf("failed to load embedded frontend: %v", err)
	}
	fileServer := http.FileServer(http.FS(dist))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Try to serve static file; fall back to index.html for SPA routing
		f, err := dist.(fs.ReadFileFS).ReadFile(r.URL.Path[1:])
		if err != nil || r.URL.Path == "/" {
			index, _ := dist.(fs.ReadFileFS).ReadFile("index.html")
			w.Header().Set("Content-Type", "text/html")
			w.Write(index)
			return
		}
		_ = f
		fileServer.ServeHTTP(w, r)
	})

	// Wrap with auth middleware
	var rootHandler http.Handler = mux
	rootHandler = middleware.AuthMiddleware(authCfg)(rootHandler)

	_ = oidcProvider // may be nil

	log.Printf("tofu-k8s-console listening on %s", *addr)
	if err := http.ListenAndServe(*addr, rootHandler); err != nil {
		log.Fatal(err)
	}
}
