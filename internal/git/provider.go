package git

import (
	"context"
	"fmt"
	"strings"
)

// Commit represents a git commit.
type Commit struct {
	SHA       string   `json:"sha"`
	Message   string   `json:"message"`
	Author    string   `json:"author"`
	Date      string   `json:"date"`
	URL       string   `json:"url,omitempty"`
	FilesChanged []string `json:"filesChanged,omitempty"`
}

// CommitDetail includes the full diff of a commit.
type CommitDetail struct {
	Commit
	Files []FileDiff `json:"files"`
}

// FileDiff represents a changed file in a commit.
type FileDiff struct {
	Filename  string `json:"filename"`
	Status    string `json:"status"` // added, modified, removed, renamed
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
	Patch     string `json:"patch,omitempty"`
}

// Provider is the interface for git hosting backends.
type Provider interface {
	// ListCommits returns recent commits for a repo/ref/path.
	ListCommits(ctx context.Context, owner, repo, ref, path string, limit int) ([]Commit, error)
	// GetCommit returns full commit details including file diffs.
	GetCommit(ctx context.Context, owner, repo, sha string) (*CommitDetail, error)
}

// SourceInfo holds parsed git source information.
type SourceInfo struct {
	Host  string // e.g. "github.com"
	Owner string // e.g. "twiechert"
	Repo  string // e.g. "vps-infra"
	Ref   string // e.g. "main"
	Path  string // e.g. "modules/vpc"
}

// ParseSourceURL extracts owner/repo from a git URL.
// Supports: https://github.com/owner/repo.git, git@github.com:owner/repo.git
func ParseSourceURL(url string) (*SourceInfo, error) {
	// HTTPS format
	if strings.HasPrefix(url, "https://") || strings.HasPrefix(url, "http://") {
		url = strings.TrimSuffix(url, ".git")
		parts := strings.Split(strings.TrimPrefix(strings.TrimPrefix(url, "https://"), "http://"), "/")
		if len(parts) < 3 {
			return nil, fmt.Errorf("invalid git URL: %s", url)
		}
		return &SourceInfo{
			Host:  parts[0],
			Owner: parts[1],
			Repo:  parts[2],
		}, nil
	}

	// SSH format: git@host:owner/repo.git
	if strings.HasPrefix(url, "git@") {
		url = strings.TrimPrefix(url, "git@")
		url = strings.TrimSuffix(url, ".git")
		hostAndPath := strings.SplitN(url, ":", 2)
		if len(hostAndPath) != 2 {
			return nil, fmt.Errorf("invalid SSH git URL: %s", url)
		}
		parts := strings.Split(hostAndPath[1], "/")
		if len(parts) < 2 {
			return nil, fmt.Errorf("invalid SSH git URL path: %s", url)
		}
		return &SourceInfo{
			Host:  hostAndPath[0],
			Owner: parts[0],
			Repo:  parts[1],
		}, nil
	}

	return nil, fmt.Errorf("unsupported git URL format: %s", url)
}
