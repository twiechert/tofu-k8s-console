package auth

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
)

// UserFromHeaders extracts a user from trusted proxy headers.
// If JWTHeader is configured, it decodes the JWT (without verification) to extract claims.
func UserFromHeaders(r *http.Request, cfg *HeaderConfig, authCfg *Config) *User {
	email := r.Header.Get(cfg.EmailHeader)
	name := r.Header.Get(cfg.UserHeader)
	groupsRaw := r.Header.Get(cfg.GroupsHeader)

	var groups []string

	// Extract claims from JWT header if configured
	if cfg.JWTHeader != "" {
		jwtToken := r.Header.Get(cfg.JWTHeader)
		if jwtToken != "" {
			claims := decodeJWTClaims(jwtToken)
			if claims != nil {
				if email == "" {
					email = getClaimString(claims, cfg.JWTEmailClaim)
				}
				if name == "" {
					name = getClaimString(claims, cfg.JWTNameClaim)
				}
				groups = append(groups, getClaimStringSlice(claims, cfg.JWTGroupsClaim)...)
			}
		}
	}

	if email == "" && name == "" {
		return nil
	}

	// Also parse groups from plain header
	if groupsRaw != "" {
		for _, g := range strings.Split(groupsRaw, cfg.GroupsSeparator) {
			g = strings.TrimSpace(g)
			if g != "" {
				groups = append(groups, g)
			}
		}
	}

	if name == "" {
		name = email
	}

	role := authCfg.ResolveRole(email, groups)

	return &User{
		Email:  email,
		Name:   name,
		Groups: groups,
		Role:   role,
	}
}

// decodeJWTClaims decodes the payload of a JWT without verification.
// This is safe when the JWT is already validated by an upstream proxy (e.g. Cloudflare Access).
func decodeJWTClaims(token string) map[string]interface{} {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil
	}

	// Decode payload (second part)
	payload := parts[1]
	// Add padding if needed
	switch len(payload) % 4 {
	case 2:
		payload += "=="
	case 3:
		payload += "="
	}

	data, err := base64.URLEncoding.DecodeString(payload)
	if err != nil {
		return nil
	}

	var claims map[string]interface{}
	if err := json.Unmarshal(data, &claims); err != nil {
		return nil
	}
	return claims
}

// getClaimString extracts a string claim by path (supports "." for nesting, e.g. "realm_access.roles").
func getClaimString(claims map[string]interface{}, path string) string {
	val := getClaimValue(claims, path)
	if s, ok := val.(string); ok {
		return s
	}
	return ""
}

// getClaimStringSlice extracts a string slice claim by path.
// Handles both []string and []interface{} (as JSON unmarshals into).
func getClaimStringSlice(claims map[string]interface{}, path string) []string {
	val := getClaimValue(claims, path)
	if val == nil {
		return nil
	}

	switch v := val.(type) {
	case []interface{}:
		result := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				result = append(result, s)
			}
		}
		return result
	case []string:
		return v
	case string:
		// Single value
		return []string{v}
	}
	return nil
}

// getClaimValue traverses nested claims by dot-separated or colon-separated path.
func getClaimValue(claims map[string]interface{}, path string) interface{} {
	// Try direct key first (handles keys with dots/colons like "custom:roles")
	if val, ok := claims[path]; ok {
		return val
	}

	// Try dot-separated nesting
	parts := strings.SplitN(path, ".", 2)
	if len(parts) == 2 {
		if nested, ok := claims[parts[0]].(map[string]interface{}); ok {
			return getClaimValue(nested, parts[1])
		}
	}

	return nil
}
