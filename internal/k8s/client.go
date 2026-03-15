package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"io"

	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
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

// TofuJob represents a Kubernetes Job created by the operator.
type TofuJob struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	Project     string `json:"project"`
	JobType     string `json:"jobType"` // plan, apply, destroy, drift, etc.
	Status      string `json:"status"`  // running, succeeded, failed
	StartTime   string `json:"startTime,omitempty"`
	EndTime     string `json:"endTime,omitempty"`
	DurationSec *int64 `json:"durationSec,omitempty"`
}

// ListJobs returns all tofu-operator Jobs across all namespaces (or a specific one).
func (c *Client) ListJobs(ctx context.Context, namespace string) ([]TofuJob, error) {
	var opts metav1.ListOptions
	opts.LabelSelector = "app.kubernetes.io/managed-by=tofu-k8s-operator"

	var jobList interface{ Items() []interface{} }
	_ = jobList // unused

	// Use the batch/v1 API via clientset
	var jobs []TofuJob

	if namespace != "" {
		list, err := c.clientset.BatchV1().Jobs(namespace).List(ctx, opts)
		if err != nil {
			return nil, fmt.Errorf("listing jobs: %w", err)
		}
		for _, j := range list.Items {
			jobs = append(jobs, toTofuJob(j))
		}
	} else {
		list, err := c.clientset.BatchV1().Jobs("").List(ctx, opts)
		if err != nil {
			return nil, fmt.Errorf("listing jobs: %w", err)
		}
		for _, j := range list.Items {
			jobs = append(jobs, toTofuJob(j))
		}
	}

	return jobs, nil
}

func toTofuJob(j batchv1.Job) TofuJob {
	tj := TofuJob{
		Name:      j.Name,
		Namespace: j.Namespace,
		Project:   j.Labels["tofu.example.com/project"],
		JobType:   j.Labels["tofu.example.com/job-type"],
	}

	if tj.JobType == "" {
		// Infer from name
		if strings.Contains(j.Name, "-plan-") {
			tj.JobType = "plan"
		} else if strings.Contains(j.Name, "-apply-") {
			tj.JobType = "apply"
		} else if strings.Contains(j.Name, "-destroy") {
			tj.JobType = "destroy"
		} else {
			tj.JobType = "unknown"
		}
	}

	// Status
	if j.Status.Succeeded > 0 {
		tj.Status = "succeeded"
	} else if j.Status.Failed > 0 {
		tj.Status = "failed"
	} else if j.Status.Active > 0 {
		tj.Status = "running"
	} else {
		tj.Status = "pending"
	}

	if j.Status.StartTime != nil {
		tj.StartTime = j.Status.StartTime.Format("2006-01-02T15:04:05Z")

		if j.Status.CompletionTime != nil {
			tj.EndTime = j.Status.CompletionTime.Format("2006-01-02T15:04:05Z")
			dur := int64(j.Status.CompletionTime.Sub(j.Status.StartTime.Time).Seconds())
			tj.DurationSec = &dur
		} else if tj.Status == "running" {
			// Running job — compute elapsed so far
			dur := int64(metav1.Now().Sub(j.Status.StartTime.Time).Seconds())
			tj.DurationSec = &dur
		}
	}

	return tj
}

// GetJobLogs returns the logs from the first pod of a Job.
func (c *Client) GetJobLogs(ctx context.Context, namespace, jobName string) (string, error) {
	// Find pods for this job
	pods, err := c.clientset.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{
		LabelSelector: fmt.Sprintf("job-name=%s", jobName),
	})
	if err != nil {
		return "", fmt.Errorf("listing pods for job %s: %w", jobName, err)
	}
	if len(pods.Items) == 0 {
		return "(no pods found for this job)", nil
	}

	pod := pods.Items[0]
	req := c.clientset.CoreV1().Pods(namespace).GetLogs(pod.Name, &corev1.PodLogOptions{})
	stream, err := req.Stream(ctx)
	if err != nil {
		return "", fmt.Errorf("streaming logs for pod %s: %w", pod.Name, err)
	}
	defer stream.Close()

	data, err := io.ReadAll(stream)
	if err != nil {
		return "", fmt.Errorf("reading logs: %w", err)
	}
	return string(data), nil
}

// CreateProject creates a TofuProject from an unstructured spec.
func (c *Client) CreateProject(ctx context.Context, namespace string, obj map[string]interface{}) error {
	u := &unstructured.Unstructured{Object: obj}
	u.SetGroupVersionKind(schema.GroupVersionKind{Group: "tofu.example.com", Version: "v1alpha1", Kind: "TofuProject"})
	_, err := c.dyn.Resource(projectGVR).Namespace(namespace).Create(ctx, u, metav1.CreateOptions{})
	return err
}

// CreateProgram creates a TofuProgram from an unstructured spec.
func (c *Client) CreateProgram(ctx context.Context, namespace string, obj map[string]interface{}) error {
	u := &unstructured.Unstructured{Object: obj}
	u.SetGroupVersionKind(schema.GroupVersionKind{Group: "tofu.example.com", Version: "v1alpha1", Kind: "TofuProgram"})
	_, err := c.dyn.Resource(programGVR).Namespace(namespace).Create(ctx, u, metav1.CreateOptions{})
	return err
}

// DeleteProject deletes a TofuProject.
func (c *Client) DeleteProject(ctx context.Context, namespace, name string) error {
	return c.dyn.Resource(projectGVR).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// DeleteProgram deletes a TofuProgram.
func (c *Client) DeleteProgram(ctx context.Context, namespace, name string) error {
	return c.dyn.Resource(programGVR).Namespace(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// UpdateProject patches a TofuProject spec.
func (c *Client) UpdateProject(ctx context.Context, namespace, name string, spec map[string]interface{}) error {
	patch, err := json.Marshal(map[string]interface{}{"spec": spec})
	if err != nil {
		return err
	}
	_, err = c.dyn.Resource(projectGVR).Namespace(namespace).Patch(ctx, name, types.MergePatchType, patch, metav1.PatchOptions{})
	return err
}

// UpdateProgram patches a TofuProgram spec.
func (c *Client) UpdateProgram(ctx context.Context, namespace, name string, spec map[string]interface{}) error {
	patch, err := json.Marshal(map[string]interface{}{"spec": spec})
	if err != nil {
		return err
	}
	_, err = c.dyn.Resource(programGVR).Namespace(namespace).Patch(ctx, name, types.MergePatchType, patch, metav1.PatchOptions{})
	return err
}

// SetSuspend sets or clears the suspend field on a TofuProject.
func (c *Client) SetSuspend(ctx context.Context, namespace, name string, suspend bool) error {
	patch := fmt.Sprintf(`{"spec":{"suspend":%t}}`, suspend)
	_, err := c.dyn.Resource(projectGVR).Namespace(namespace).Patch(ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{})
	if err != nil {
		return fmt.Errorf("setting suspend on TofuProject %s/%s: %w", namespace, name, err)
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
