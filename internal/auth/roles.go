package auth

// Role represents a user's access level.
type Role string

const (
	RoleViewer   Role = "viewer"
	RoleOperator Role = "operator"
	RoleEditor   Role = "editor"
	RoleAdmin    Role = "admin"
)

// Level returns the numeric privilege level for comparison.
func (r Role) Level() int {
	switch r {
	case RoleViewer:
		return 1
	case RoleOperator:
		return 2
	case RoleEditor:
		return 3
	case RoleAdmin:
		return 4
	default:
		return 0
	}
}

// AtLeast returns true if this role has at least the given privilege level.
func (r Role) AtLeast(required Role) bool {
	return r.Level() >= required.Level()
}

// User represents an authenticated user.
type User struct {
	Email  string   `json:"email"`
	Name   string   `json:"name"`
	Groups []string `json:"groups,omitempty"`
	Role   Role     `json:"role"`
}
