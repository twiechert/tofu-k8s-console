package middleware

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/twiechert/tofu-k8s-console/internal/auth"
)

type contextKey string

const userContextKey contextKey = "user"

// UserFromContext returns the authenticated user from the request context.
func UserFromContext(ctx context.Context) *auth.User {
	u, _ := ctx.Value(userContextKey).(*auth.User)
	return u
}

// AuthMiddleware returns middleware that extracts the user based on auth mode.
func AuthMiddleware(cfg *auth.Config) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var user *auth.User

			switch cfg.Mode {
			case "none":
				// No auth — grant admin
				user = &auth.User{
					Email: "local@localhost",
					Name:  "Local User",
					Role:  auth.RoleAdmin,
				}

			case "oidc":
				// Skip auth for login/callback routes
				if r.URL.Path == "/auth/login" || r.URL.Path == "/auth/callback" || r.URL.Path == "/auth/logout" {
					next.ServeHTTP(w, r)
					return
				}
				user = auth.UserFromSession(r)
				if user == nil {
					// API requests get 401, browser requests redirect to login
					if r.URL.Path[:4] == "/api" {
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusUnauthorized)
						json.NewEncoder(w).Encode(map[string]string{"error": "unauthorized"})
						return
					}
					http.Redirect(w, r, "/auth/login", http.StatusFound)
					return
				}

			case "header":
				user = auth.UserFromHeaders(r, cfg.Header, cfg)
				if user == nil {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusUnauthorized)
					json.NewEncoder(w).Encode(map[string]string{"error": "no auth headers"})
					return
				}
			}

			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole returns middleware that checks the user has at least the given role.
func RequireRole(required auth.Role) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromContext(r.Context())
			if user == nil || !user.Role.AtLeast(required) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "forbidden", "required": string(required), "current": string(user.Role)})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
