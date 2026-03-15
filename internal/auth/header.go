package auth

import (
	"net/http"
	"strings"
)

// UserFromHeaders extracts a user from trusted proxy headers.
func UserFromHeaders(r *http.Request, cfg *HeaderConfig, authCfg *Config) *User {
	email := r.Header.Get(cfg.EmailHeader)
	name := r.Header.Get(cfg.UserHeader)
	groupsRaw := r.Header.Get(cfg.GroupsHeader)

	if email == "" && name == "" {
		return nil
	}

	var groups []string
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
