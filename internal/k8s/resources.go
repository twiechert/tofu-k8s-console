package k8s

import (
	"regexp"
	"strings"
)

// Resource represents a Terraform/OpenTofu managed resource parsed from plan output.
type Resource struct {
	Address string `json:"address"` // e.g. "aws_s3_bucket.this"
	Type    string `json:"type"`    // e.g. "aws_s3_bucket"
	Name    string `json:"name"`    // e.g. "this"
	Action  string `json:"action"`  // "exists", "create", "update", "destroy", "replace", "read"
	ID      string `json:"id,omitempty"`
}

// eslint-disable-next-line
var ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07`)

// Matches "resource_type.name: Refreshing state... [id=...]"
var refreshRegex = regexp.MustCompile(`^(\S+\.\S+): Refreshing state\.\.\. \[id=([^\]]*)\]`)

// Matches "# resource_type.name will be created/destroyed/updated/replaced/read"
var planActionRegex = regexp.MustCompile(`#\s+(\S+\.\S+)\s+(will be |must be )(created|destroyed|updated|replaced|read)`)

// Matches "# resource_type.name will be updated in-place"
var planUpdateRegex = regexp.MustCompile(`#\s+(\S+\.\S+)\s+will be updated`)

func stripAnsi(s string) string {
	return ansiRegex.ReplaceAllString(s, "")
}

// ParseResources extracts resource information from plan output text.
func ParseResources(planOutput string) []Resource {
	clean := stripAnsi(planOutput)
	lines := strings.Split(clean, "\n")

	resourceMap := make(map[string]*Resource)

	for _, line := range lines {
		line = strings.TrimSpace(line)

		// Parse "Refreshing state" lines — these are existing resources
		if m := refreshRegex.FindStringSubmatch(line); m != nil {
			addr := m[1]
			if _, exists := resourceMap[addr]; !exists {
				rType, rName := splitAddress(addr)
				resourceMap[addr] = &Resource{
					Address: addr,
					Type:    rType,
					Name:    rName,
					Action:  "exists",
					ID:      m[2],
				}
			}
		}

		// Parse plan action lines
		if m := planActionRegex.FindStringSubmatch(line); m != nil {
			addr := m[1]
			action := m[3]
			if action == "destroyed" {
				action = "destroy"
			} else if action == "created" {
				action = "create"
			} else if action == "replaced" {
				action = "replace"
			}
			rType, rName := splitAddress(addr)
			if existing, ok := resourceMap[addr]; ok {
				existing.Action = action
			} else {
				resourceMap[addr] = &Resource{
					Address: addr,
					Type:    rType,
					Name:    rName,
					Action:  action,
				}
			}
		}

		// Parse "will be updated in-place"
		if m := planUpdateRegex.FindStringSubmatch(line); m != nil {
			addr := m[1]
			rType, rName := splitAddress(addr)
			if existing, ok := resourceMap[addr]; ok {
				existing.Action = "update"
			} else {
				resourceMap[addr] = &Resource{
					Address: addr,
					Type:    rType,
					Name:    rName,
					Action:  "update",
				}
			}
		}
	}

	resources := make([]Resource, 0, len(resourceMap))
	for _, r := range resourceMap {
		resources = append(resources, *r)
	}
	return resources
}

func splitAddress(addr string) (string, string) {
	parts := strings.SplitN(addr, ".", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return addr, ""
}
