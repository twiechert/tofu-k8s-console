package git

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// GitHubProvider implements Provider for GitHub.
type GitHubProvider struct {
	Token      string
	BaseURL    string // default: https://api.github.com
	HTTPClient *http.Client
}

// NewGitHubProvider creates a GitHub provider with the given token.
func NewGitHubProvider(token, baseURL string) *GitHubProvider {
	if baseURL == "" {
		baseURL = "https://api.github.com"
	}
	return &GitHubProvider{
		Token:      token,
		BaseURL:    baseURL,
		HTTPClient: &http.Client{Timeout: 15 * time.Second},
	}
}

func (g *GitHubProvider) do(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, g.BaseURL+path, nil)
	if err != nil {
		return nil, err
	}
	if g.Token != "" {
		req.Header.Set("Authorization", "Bearer "+g.Token)
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := g.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("GitHub API %s returned %d: %s", path, resp.StatusCode, string(body[:min(len(body), 200)]))
	}
	return body, nil
}

func (g *GitHubProvider) ListCommits(ctx context.Context, owner, repo, ref, path string, limit int) ([]Commit, error) {
	if limit <= 0 {
		limit = 20
	}
	q := url.Values{}
	if ref != "" {
		q.Set("sha", ref)
	}
	if path != "" {
		q.Set("path", path)
	}
	q.Set("per_page", fmt.Sprintf("%d", limit))

	body, err := g.do(ctx, fmt.Sprintf("/repos/%s/%s/commits?%s", owner, repo, q.Encode()))
	if err != nil {
		return nil, err
	}

	var ghCommits []struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message string `json:"message"`
			Author  struct {
				Name string `json:"name"`
				Date string `json:"date"`
			} `json:"author"`
		} `json:"commit"`
		HTMLURL string `json:"html_url"`
	}
	if err := json.Unmarshal(body, &ghCommits); err != nil {
		return nil, fmt.Errorf("parsing commits: %w", err)
	}

	commits := make([]Commit, len(ghCommits))
	for i, c := range ghCommits {
		commits[i] = Commit{
			SHA:     c.SHA,
			Message: c.Commit.Message,
			Author:  c.Commit.Author.Name,
			Date:    c.Commit.Author.Date,
			URL:     c.HTMLURL,
		}
	}
	return commits, nil
}

func (g *GitHubProvider) GetCommit(ctx context.Context, owner, repo, sha string) (*CommitDetail, error) {
	body, err := g.do(ctx, fmt.Sprintf("/repos/%s/%s/commits/%s", owner, repo, sha))
	if err != nil {
		return nil, err
	}

	var ghCommit struct {
		SHA    string `json:"sha"`
		Commit struct {
			Message string `json:"message"`
			Author  struct {
				Name string `json:"name"`
				Date string `json:"date"`
			} `json:"author"`
		} `json:"commit"`
		HTMLURL string `json:"html_url"`
		Files   []struct {
			Filename  string `json:"filename"`
			Status    string `json:"status"`
			Additions int    `json:"additions"`
			Deletions int    `json:"deletions"`
			Patch     string `json:"patch"`
		} `json:"files"`
	}
	if err := json.Unmarshal(body, &ghCommit); err != nil {
		return nil, fmt.Errorf("parsing commit: %w", err)
	}

	files := make([]FileDiff, len(ghCommit.Files))
	for i, f := range ghCommit.Files {
		files[i] = FileDiff{
			Filename:  f.Filename,
			Status:    f.Status,
			Additions: f.Additions,
			Deletions: f.Deletions,
			Patch:     f.Patch,
		}
	}

	return &CommitDetail{
		Commit: Commit{
			SHA:     ghCommit.SHA,
			Message: ghCommit.Commit.Message,
			Author:  ghCommit.Commit.Author.Name,
			Date:    ghCommit.Commit.Author.Date,
			URL:     ghCommit.HTMLURL,
		},
		Files: files,
	}, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
