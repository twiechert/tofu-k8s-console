package git

import (
	"context"
	"fmt"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// Registry resolves git providers based on host and manages token lookup.
type Registry struct {
	// ConsoleToken is a fallback token configured at the console level.
	ConsoleToken string
	// Clientset for reading K8s secrets (per-program credentials).
	Clientset kubernetes.Interface
	// providers caches providers by "host:token" key.
	providers map[string]Provider
}

// NewRegistry creates a new provider registry.
func NewRegistry(consoleToken string, clientset kubernetes.Interface) *Registry {
	return &Registry{
		ConsoleToken: consoleToken,
		Clientset:    clientset,
		providers:    make(map[string]Provider),
	}
}

// ForSource returns a Provider and parsed SourceInfo for a git source URL.
// It tries to read credentials from the referenced K8s secret first, falling back to the console token.
func (r *Registry) ForSource(ctx context.Context, sourceURL, namespace string, credSecretName string) (Provider, *SourceInfo, error) {
	info, err := ParseSourceURL(sourceURL)
	if err != nil {
		return nil, nil, err
	}

	// Resolve token: program secret > console token
	token := r.ConsoleToken
	if credSecretName != "" && r.Clientset != nil {
		secretToken, err := r.readTokenFromSecret(ctx, namespace, credSecretName)
		if err == nil && secretToken != "" {
			token = secretToken
		}
	}

	// Get or create provider
	key := info.Host + ":" + token
	if p, ok := r.providers[key]; ok {
		return p, info, nil
	}

	provider, err := r.createProvider(info.Host, token)
	if err != nil {
		return nil, nil, err
	}
	r.providers[key] = provider
	return provider, info, nil
}

func (r *Registry) readTokenFromSecret(ctx context.Context, namespace, name string) (string, error) {
	secret, err := r.Clientset.CoreV1().Secrets(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return "", err
	}
	// Try common key names
	for _, key := range []string{"token", "password", "git-token"} {
		if v, ok := secret.Data[key]; ok {
			return strings.TrimSpace(string(v)), nil
		}
	}
	// Fall back to first key
	for _, v := range secret.Data {
		return strings.TrimSpace(string(v)), nil
	}
	_ = corev1.Secret{} // keep import
	return "", fmt.Errorf("no token found in secret %s/%s", namespace, name)
}

func (r *Registry) createProvider(host, token string) (Provider, error) {
	switch {
	case strings.Contains(host, "github"):
		baseURL := "https://api.github.com"
		if host != "github.com" {
			baseURL = "https://" + host + "/api/v3"
		}
		return NewGitHubProvider(token, baseURL), nil
	default:
		return nil, fmt.Errorf("unsupported git host: %s (only GitHub is supported currently)", host)
	}
}
