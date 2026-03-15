package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// OIDCProvider handles the OIDC login flow.
type OIDCProvider struct {
	oauth2Config oauth2.Config
	verifier     *oidc.IDTokenVerifier
	config       *Config
}

// NewOIDCProvider creates an OIDC provider from config.
func NewOIDCProvider(ctx context.Context, cfg *Config) (*OIDCProvider, error) {
	provider, err := oidc.NewProvider(ctx, cfg.OIDC.IssuerURL)
	if err != nil {
		return nil, fmt.Errorf("creating OIDC provider: %w", err)
	}

	scopes := cfg.OIDC.Scopes
	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "profile", "email"}
	}

	oauth2Config := oauth2.Config{
		ClientID:     cfg.OIDC.ClientID,
		ClientSecret: cfg.OIDC.ClientSecret,
		RedirectURL:  cfg.OIDC.RedirectURL,
		Endpoint:     provider.Endpoint(),
		Scopes:       scopes,
	}

	verifier := provider.Verifier(&oidc.Config{ClientID: cfg.OIDC.ClientID})

	return &OIDCProvider{
		oauth2Config: oauth2Config,
		verifier:     verifier,
		config:       cfg,
	}, nil
}

// HandleLogin redirects to the OIDC provider.
func (p *OIDCProvider) HandleLogin(w http.ResponseWriter, r *http.Request) {
	state := generateState()
	http.SetCookie(w, &http.Cookie{
		Name:     "oidc_state",
		Value:    state,
		Path:     "/",
		MaxAge:   300,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, p.oauth2Config.AuthCodeURL(state), http.StatusFound)
}

// HandleCallback processes the OIDC callback.
func (p *OIDCProvider) HandleCallback(w http.ResponseWriter, r *http.Request) {
	stateCookie, err := r.Cookie("oidc_state")
	if err != nil || stateCookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "invalid state", http.StatusBadRequest)
		return
	}

	token, err := p.oauth2Config.Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		http.Error(w, "token exchange failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		http.Error(w, "no id_token in response", http.StatusInternalServerError)
		return
	}

	idToken, err := p.verifier.Verify(r.Context(), rawIDToken)
	if err != nil {
		http.Error(w, "token verification failed: "+err.Error(), http.StatusUnauthorized)
		return
	}

	var claims struct {
		Email  string   `json:"email"`
		Name   string   `json:"name"`
		Groups []string `json:"groups"`
	}
	if err := idToken.Claims(&claims); err != nil {
		http.Error(w, "claims extraction failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	role := p.config.ResolveRole(claims.Email, claims.Groups)
	user := User{
		Email:  claims.Email,
		Name:   claims.Name,
		Groups: claims.Groups,
		Role:   role,
	}

	sessionData, _ := json.Marshal(user)
	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    base64.StdEncoding.EncodeToString(sessionData),
		Path:     "/",
		MaxAge:   86400, // 24h
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})

	// Clear state cookie
	http.SetCookie(w, &http.Cookie{Name: "oidc_state", Path: "/", MaxAge: -1})

	http.Redirect(w, r, "/", http.StatusFound)
}

// HandleLogout clears the session.
func HandleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{Name: "session", Path: "/", MaxAge: -1})
	http.Redirect(w, r, "/", http.StatusFound)
}

// UserFromSession extracts the user from the session cookie.
func UserFromSession(r *http.Request) *User {
	cookie, err := r.Cookie("session")
	if err != nil {
		return nil
	}
	data, err := base64.StdEncoding.DecodeString(cookie.Value)
	if err != nil {
		return nil
	}
	var user User
	if err := json.Unmarshal(data, &user); err != nil {
		return nil
	}
	return &user
}

func generateState() string {
	b := make([]byte, 16)
	rand.Read(b)
	_ = time.Now() // avoid unused import
	return base64.URLEncoding.EncodeToString(b)
}
