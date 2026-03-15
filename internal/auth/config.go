package auth

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// Config holds the full auth configuration.
type Config struct {
	// Mode: "none", "oidc", "header"
	Mode string `json:"mode"`

	// OIDC settings (when mode=oidc)
	OIDC *OIDCConfig `json:"oidc,omitempty"`

	// Header settings (when mode=header)
	Header *HeaderConfig `json:"header,omitempty"`

	// Role mappings (shared across modes)
	RoleMappings []RoleMapping `json:"roleMappings,omitempty"`

	// Default role for authenticated users with no matching rule
	DefaultRole Role `json:"defaultRole"`
}

// OIDCConfig holds OIDC provider settings.
type OIDCConfig struct {
	IssuerURL    string   `json:"issuerURL"`
	ClientID     string   `json:"clientID"`
	ClientSecret string   `json:"clientSecret"`
	RedirectURL  string   `json:"redirectURL"`
	Scopes       []string `json:"scopes,omitempty"`
}

// HeaderConfig holds trusted-header auth settings.
type HeaderConfig struct {
	// Header names to extract user info from
	UserHeader   string `json:"userHeader"`   // default: X-Forwarded-User
	EmailHeader  string `json:"emailHeader"`  // default: X-Forwarded-Email
	GroupsHeader string `json:"groupsHeader"` // default: X-Forwarded-Groups
	// GroupsSeparator splits the groups header value. Default: ","
	GroupsSeparator string `json:"groupsSeparator"`
}

// RoleMapping maps a claim/group to a role.
type RoleMapping struct {
	// Match type: "group", "email"
	Match string `json:"match"`
	// Value to match. Supports "*" suffix for wildcard (e.g. "*@example.com")
	Value string `json:"value"`
	// Role to assign
	Role Role `json:"role"`
}

// LoadConfig reads auth config from a JSON file. Returns a no-auth config if path is empty.
func LoadConfig(path string) (*Config, error) {
	if path == "" {
		return &Config{Mode: "none"}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading auth config: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsing auth config: %w", err)
	}

	if cfg.DefaultRole == "" {
		cfg.DefaultRole = RoleViewer
	}
	if cfg.Header != nil {
		if cfg.Header.UserHeader == "" {
			cfg.Header.UserHeader = "X-Forwarded-User"
		}
		if cfg.Header.EmailHeader == "" {
			cfg.Header.EmailHeader = "X-Forwarded-Email"
		}
		if cfg.Header.GroupsHeader == "" {
			cfg.Header.GroupsHeader = "X-Forwarded-Groups"
		}
		if cfg.Header.GroupsSeparator == "" {
			cfg.Header.GroupsSeparator = ","
		}
	}

	return &cfg, nil
}

// ResolveRole determines the role for a user based on role mappings.
func (c *Config) ResolveRole(email string, groups []string) Role {
	bestRole := c.DefaultRole

	for _, m := range c.RoleMappings {
		matched := false
		switch m.Match {
		case "group":
			for _, g := range groups {
				if matchValue(m.Value, g) {
					matched = true
					break
				}
			}
		case "email":
			matched = matchValue(m.Value, email)
		}
		if matched && m.Role.Level() > bestRole.Level() {
			bestRole = m.Role
		}
	}

	return bestRole
}

func matchValue(pattern, value string) bool {
	if strings.HasPrefix(pattern, "*") {
		return strings.HasSuffix(value, pattern[1:])
	}
	return pattern == value
}
