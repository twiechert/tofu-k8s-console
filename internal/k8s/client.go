package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

var (
	projectGVR = schema.GroupVersionResource{
		Group:    "tofu.example.com",
		Version:  "v1alpha1",
		Resource: "tofuprojects",
	}
	programGVR = schema.GroupVersionResource{
		Group:    "tofu.example.com",
		Version:  "v1alpha1",
		Resource: "tofuprograms",
	}
)

// Client wraps Kubernetes clients for tofu CRDs and core resources.
type Client struct {
	dyn       dynamic.Interface
	clientset kubernetes.Interface
}

// NewClient creates a Client using in-cluster config or kubeconfig fallback.
func NewClient(kubeconfig string) (*Client, error) {
	var cfg *rest.Config
	var err error

	if kubeconfig != "" {
		cfg, err = clientcmd.BuildConfigFromFlags("", kubeconfig)
	} else {
		cfg, err = rest.InClusterConfig()
		if err != nil {
			// Fallback to default kubeconfig location
			loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
			cfg, err = clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, nil).ClientConfig()
		}
	}
	if err != nil {
		return nil, fmt.Errorf("building kube config: %w", err)
	}

	dyn, err := dynamic.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("creating dynamic client: %w", err)
	}

	clientset, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("creating clientset: %w", err)
	}

	return &Client{dyn: dyn, clientset: clientset}, nil
}

// TofuProject represents a TofuProject resource.
type TofuProject struct {
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Spec      json.RawMessage   `json:"spec"`
	Status    json.RawMessage   `json:"status"`
	Labels    map[string]string `json:"labels,omitempty"`
	CreatedAt string            `json:"createdAt"`
}

// TofuProgram represents a TofuProgram resource.
type TofuProgram struct {
	Name      string          `json:"name"`
	Namespace string          `json:"namespace"`
	Spec      json.RawMessage `json:"spec"`
	CreatedAt string          `json:"createdAt"`
}

// ListProjects returns all TofuProjects across all namespaces (or a specific one).
func (c *Client) ListProjects(ctx context.Context, namespace string) ([]TofuProject, error) {
	var list *unstructured.UnstructuredList
	var err error

	if namespace != "" {
		list, err = c.dyn.Resource(projectGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = c.dyn.Resource(projectGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		return nil, fmt.Errorf("listing TofuProjects: %w", err)
	}

	projects := make([]TofuProject, 0, len(list.Items))
	for _, item := range list.Items {
		projects = append(projects, toProject(item))
	}
	return projects, nil
}

// GetProject returns a single TofuProject.
func (c *Client) GetProject(ctx context.Context, namespace, name string) (*TofuProject, error) {
	item, err := c.dyn.Resource(projectGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("getting TofuProject %s/%s: %w", namespace, name, err)
	}
	p := toProject(*item)
	return &p, nil
}

// ListPrograms returns all TofuPrograms across all namespaces (or a specific one).
func (c *Client) ListPrograms(ctx context.Context, namespace string) ([]TofuProgram, error) {
	var list *unstructured.UnstructuredList
	var err error

	if namespace != "" {
		list, err = c.dyn.Resource(programGVR).Namespace(namespace).List(ctx, metav1.ListOptions{})
	} else {
		list, err = c.dyn.Resource(programGVR).List(ctx, metav1.ListOptions{})
	}
	if err != nil {
		return nil, fmt.Errorf("listing TofuPrograms: %w", err)
	}

	programs := make([]TofuProgram, 0, len(list.Items))
	for _, item := range list.Items {
		programs = append(programs, toProgram(item))
	}
	return programs, nil
}

// GetProgram returns a single TofuProgram.
func (c *Client) GetProgram(ctx context.Context, namespace, name string) (*TofuProgram, error) {
	item, err := c.dyn.Resource(programGVR).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("getting TofuProgram %s/%s: %w", namespace, name, err)
	}
	p := toProgram(*item)
	return &p, nil
}

// ApproveProject sets the approved-hash annotation on a TofuProject to trigger apply.
func (c *Client) ApproveProject(ctx context.Context, namespace, name, hash string) error {
	patch := fmt.Sprintf(`{"metadata":{"annotations":{"tofu.example.com/approved-hash":"%s"}}}`, hash)
	_, err := c.dyn.Resource(projectGVR).Namespace(namespace).Patch(ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{})
	if err != nil {
		return fmt.Errorf("approving TofuProject %s/%s: %w", namespace, name, err)
	}
	return nil
}

// RerunProject forces a re-reconcile by adding/updating a rerun annotation with the current timestamp.
func (c *Client) RerunProject(ctx context.Context, namespace, name string) error {
	timestamp := fmt.Sprintf("%d", metav1.Now().Unix())
	patch := fmt.Sprintf(`{"metadata":{"annotations":{"tofu.example.com/rerun":"%s"}}}`, timestamp)
	_, err := c.dyn.Resource(projectGVR).Namespace(namespace).Patch(ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{})
	if err != nil {
		return fmt.Errorf("triggering rerun for TofuProject %s/%s: %w", namespace, name, err)
	}
	return nil
}

// Revision represents a stored revision ConfigMap.
type Revision struct {
	Revision    int               `json:"revision"`
	AppliedHash string            `json:"appliedHash"`
	JobName     string            `json:"jobName"`
	Timestamp   string            `json:"timestamp"`
	Status      string            `json:"status"`
	PlanSummary string            `json:"planSummary"`
	PlanOutput  string            `json:"planOutput,omitempty"`
	Outputs     json.RawMessage   `json:"outputs,omitempty"`
	Snapshot    map[string]string `json:"snapshot,omitempty"`
}

// ListRevisions returns all revision ConfigMaps for a given project, sorted by revision number descending.
func (c *Client) ListRevisions(ctx context.Context, namespace, projectName string) ([]Revision, error) {
	cmList, err := c.clientset.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("tofu.example.com/project=%s,tofu.example.com/resource-type=revision", projectName),
	})
	if err != nil {
		return nil, fmt.Errorf("listing revision ConfigMaps: %w", err)
	}

	revisions := make([]Revision, 0, len(cmList.Items))
	for _, cm := range cmList.Items {
		rev := Revision{
			AppliedHash: cm.Data["appliedHash"],
			JobName:     cm.Data["jobName"],
			Timestamp:   cm.Data["timestamp"],
			Status:      cm.Data["status"],
			PlanSummary: cm.Data["planSummary"],
			PlanOutput:  cm.Data["planOutput"],
			Outputs:     json.RawMessage(cm.Data["outputs"]),
		}
		rev.Revision, _ = strconv.Atoi(cm.Data["revision"])

		// Extract snapshot files (prefixed with "snapshot:")
		snapshot := map[string]string{}
		for k, v := range cm.Data {
			if len(k) > 9 && k[:9] == "snapshot:" {
				snapshot[k[9:]] = v
			}
		}
		if len(snapshot) > 0 {
			rev.Snapshot = snapshot
		}

		revisions = append(revisions, rev)
	}

	sort.Slice(revisions, func(i, j int) bool {
		return revisions[i].Revision > revisions[j].Revision
	})

	return revisions, nil
}

func toProject(u unstructured.Unstructured) TofuProject {
	specRaw, _ := json.Marshal(u.Object["spec"])
	statusRaw, _ := json.Marshal(u.Object["status"])
	return TofuProject{
		Name:      u.GetName(),
		Namespace: u.GetNamespace(),
		Spec:      specRaw,
		Status:    statusRaw,
		Labels:    u.GetLabels(),
		CreatedAt: u.GetCreationTimestamp().Format("2006-01-02T15:04:05Z"),
	}
}

func toProgram(u unstructured.Unstructured) TofuProgram {
	specRaw, _ := json.Marshal(u.Object["spec"])
	return TofuProgram{
		Name:      u.GetName(),
		Namespace: u.GetNamespace(),
		Spec:      specRaw,
		CreatedAt: u.GetCreationTimestamp().Format("2006-01-02T15:04:05Z"),
	}
}
