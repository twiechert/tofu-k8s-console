package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/twiechert/tofu-k8s-console/internal/auth"
	gitpkg "github.com/twiechert/tofu-k8s-console/internal/git"
	"github.com/twiechert/tofu-k8s-console/internal/k8s"
	"github.com/twiechert/tofu-k8s-console/internal/middleware"
)

// Handler provides HTTP handlers for the API.
type Handler struct {
	k8s *k8s.Client
	git *gitpkg.Registry
}

// NewHandler creates a new API handler.
func NewHandler(k8sClient *k8s.Client, gitRegistry *gitpkg.Registry) *Handler {
	return &Handler{k8s: k8sClient, git: gitRegistry}
}

// wrap applies role-based middleware to a handler func.
func wrap(role auth.Role, fn http.HandlerFunc) http.Handler {
	return middleware.RequireRole(role)(http.HandlerFunc(fn))
}

// RegisterRoutes registers all API routes on the given mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	// Auth
	mux.HandleFunc("GET /api/v1/auth/me", h.getMe)

	// Read (viewer)
	mux.Handle("GET /api/v1/projects", wrap(auth.RoleViewer, h.listProjects))
	mux.Handle("GET /api/v1/projects/{namespace}/{name}", wrap(auth.RoleViewer, h.getProject))
	mux.Handle("GET /api/v1/programs", wrap(auth.RoleViewer, h.listPrograms))
	mux.Handle("GET /api/v1/programs/{namespace}/{name}", wrap(auth.RoleViewer, h.getProgram))
	mux.Handle("GET /api/v1/projects/{namespace}/{name}/revisions", wrap(auth.RoleViewer, h.listRevisions))
	mux.Handle("GET /api/v1/projects/{namespace}/{name}/resources", wrap(auth.RoleViewer, h.listResources))
	mux.Handle("GET /api/v1/jobs", wrap(auth.RoleViewer, h.listJobs))
	mux.Handle("GET /api/v1/jobs/{namespace}/{name}/logs", wrap(auth.RoleViewer, h.getJobLogs))
	mux.Handle("GET /api/v1/overview", wrap(auth.RoleViewer, h.getOverview))
	mux.Handle("GET /api/v1/drift", wrap(auth.RoleViewer, h.getDrift))
	mux.Handle("GET /api/v1/graph", wrap(auth.RoleViewer, h.getGraph))

	// Git integration
	mux.Handle("GET /api/v1/programs/{namespace}/{name}/commits", wrap(auth.RoleViewer, h.listProgramCommits))
	mux.Handle("GET /api/v1/programs/{namespace}/{name}/commits/{sha}", wrap(auth.RoleViewer, h.getProgramCommit))

	// Operate (operator)
	mux.Handle("POST /api/v1/projects/{namespace}/{name}/approve", wrap(auth.RoleOperator, h.approveProject))
	mux.Handle("POST /api/v1/projects/{namespace}/{name}/rerun", wrap(auth.RoleOperator, h.rerunProject))
	mux.Handle("POST /api/v1/projects/{namespace}/{name}/suspend", wrap(auth.RoleOperator, h.suspendProject))

	// Edit (editor)
	mux.Handle("POST /api/v1/projects", wrap(auth.RoleEditor, h.createProject))
	mux.Handle("PUT /api/v1/projects/{namespace}/{name}", wrap(auth.RoleEditor, h.updateProject))
	mux.Handle("DELETE /api/v1/projects/{namespace}/{name}", wrap(auth.RoleEditor, h.deleteProject))
	mux.Handle("POST /api/v1/programs", wrap(auth.RoleEditor, h.createProgram))
	mux.Handle("PUT /api/v1/programs/{namespace}/{name}", wrap(auth.RoleEditor, h.updateProgram))
	mux.Handle("DELETE /api/v1/programs/{namespace}/{name}", wrap(auth.RoleEditor, h.deleteProgram))
}

func (h *Handler) getMe(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	writeJSON(w, user)
}

func (h *Handler) listProjects(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("namespace")
	projects, err := h.k8s.ListProjects(r.Context(), ns)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, projects)
}

func (h *Handler) getProject(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")
	project, err := h.k8s.GetProject(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, project)
}

func (h *Handler) approveProject(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")

	var body struct {
		Hash string `json:"hash"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Hash == "" {
		writeError(w, http.StatusBadRequest, "missing 'hash' in request body")
		return
	}

	if err := h.k8s.ApproveProject(r.Context(), ns, name, body.Hash); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]string{"status": "approved"})
}

func (h *Handler) listRevisions(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")
	revisions, err := h.k8s.ListRevisions(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, revisions)
}

func (h *Handler) listPrograms(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("namespace")
	programs, err := h.k8s.ListPrograms(r.Context(), ns)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, programs)
}

func (h *Handler) getProgram(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")
	program, err := h.k8s.GetProgram(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}
	writeJSON(w, program)
}

// Overview holds aggregate stats across all projects.
type Overview struct {
	TotalProjects  int            `json:"totalProjects"`
	TotalPrograms  int            `json:"totalPrograms"`
	PhaseBreakdown map[string]int `json:"phaseBreakdown"`
	DriftCount     int            `json:"driftCount"`
	ErrorCount     int            `json:"errorCount"`
	Namespaces     []string       `json:"namespaces"`
}

func (h *Handler) getOverview(w http.ResponseWriter, r *http.Request) {
	projects, err := h.k8s.ListProjects(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	programs, err := h.k8s.ListPrograms(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	phases := map[string]int{}
	nsSet := map[string]bool{}
	driftCount := 0
	errorCount := 0

	for _, p := range projects {
		nsSet[p.Namespace] = true

		var status struct {
			Phase         string `json:"phase"`
			DriftDetected bool   `json:"driftDetected"`
		}
		_ = json.Unmarshal(p.Status, &status)

		phases[status.Phase]++
		if status.DriftDetected {
			driftCount++
		}
		if status.Phase == "Error" || status.Phase == "DestroyFailed" {
			errorCount++
		}
	}

	namespaces := make([]string, 0, len(nsSet))
	for ns := range nsSet {
		namespaces = append(namespaces, ns)
	}

	writeJSON(w, Overview{
		TotalProjects:  len(projects),
		TotalPrograms:  len(programs),
		PhaseBreakdown: phases,
		DriftCount:     driftCount,
		ErrorCount:     errorCount,
		Namespaces:     namespaces,
	})
}

// DriftProject represents a project's drift state with enriched context.
type DriftProject struct {
	Name          string          `json:"name"`
	Namespace     string          `json:"namespace"`
	Phase         string          `json:"phase"`
	DriftDetected bool            `json:"driftDetected"`
	BlastRadius   json.RawMessage `json:"blastRadius,omitempty"`
	PlanSummary   string          `json:"planSummary,omitempty"`
	ProgramRef    string          `json:"programRef"`
	Suspended     bool            `json:"suspended"`
	PendingHash   string          `json:"pendingPlanHash,omitempty"`
}

// DriftOverview is the response for the drift dashboard endpoint.
type DriftOverview struct {
	TotalProjects int             `json:"totalProjects"`
	DriftedCount  int             `json:"driftedCount"`
	ByNamespace   map[string]int  `json:"byNamespace"`
	BySeverity    map[string]int  `json:"bySeverity"` // low, medium, high based on blast radius
	Projects      []DriftProject  `json:"projects"`
	DriftJobs     []k8s.TofuJob   `json:"driftJobs"`
}

func (h *Handler) getDrift(w http.ResponseWriter, r *http.Request) {
	projects, err := h.k8s.ListProjects(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jobs, err := h.k8s.ListJobs(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	// Filter drift jobs only
	var driftJobs []k8s.TofuJob
	for _, j := range jobs {
		if j.JobType == "drift" {
			driftJobs = append(driftJobs, j)
		}
	}

	byNamespace := map[string]int{}
	bySeverity := map[string]int{}
	driftedCount := 0
	var driftProjects []DriftProject

	for _, p := range projects {
		var status struct {
			Phase         string          `json:"phase"`
			DriftDetected bool            `json:"driftDetected"`
			BlastRadius   json.RawMessage `json:"blastRadius"`
			PlanSummary   string          `json:"planSummary"`
			PendingHash   string          `json:"pendingPlanHash"`
		}
		_ = json.Unmarshal(p.Status, &status)

		var spec struct {
			ProgramRef struct {
				Name string `json:"name"`
			} `json:"programRef"`
			Suspend bool `json:"suspend"`
		}
		_ = json.Unmarshal(p.Spec, &spec)

		dp := DriftProject{
			Name:          p.Name,
			Namespace:     p.Namespace,
			Phase:         status.Phase,
			DriftDetected: status.DriftDetected,
			BlastRadius:   status.BlastRadius,
			PlanSummary:   status.PlanSummary,
			ProgramRef:    spec.ProgramRef.Name,
			Suspended:     spec.Suspend,
			PendingHash:   status.PendingHash,
		}
		driftProjects = append(driftProjects, dp)

		if status.DriftDetected {
			driftedCount++
			byNamespace[p.Namespace]++

			// Categorize severity by blast radius total
			var br struct {
				Total int `json:"total"`
			}
			_ = json.Unmarshal(status.BlastRadius, &br)
			switch {
			case br.Total >= 10:
				bySeverity["high"]++
			case br.Total >= 3:
				bySeverity["medium"]++
			default:
				bySeverity["low"]++
			}
		}
	}

	writeJSON(w, DriftOverview{
		TotalProjects: len(projects),
		DriftedCount:  driftedCount,
		ByNamespace:   byNamespace,
		BySeverity:    bySeverity,
		Projects:      driftProjects,
		DriftJobs:     driftJobs,
	})
}

// GraphNode represents a node in the dependency graph.
type GraphNode struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	Type      string `json:"type"` // "project" or "program"
	Namespace string `json:"namespace"`
	Phase     string `json:"phase,omitempty"`
}

// GraphEdge represents an edge between nodes.
type GraphEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label,omitempty"` // e.g. "programRef" or output mapping
}

// Graph holds nodes and edges for visualization.
type Graph struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

func (h *Handler) getGraph(w http.ResponseWriter, r *http.Request) {
	projects, err := h.k8s.ListProjects(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	programs, err := h.k8s.ListPrograms(r.Context(), "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var nodes []GraphNode
	var edges []GraphEdge

	// Add program nodes
	for _, prog := range programs {
		nodes = append(nodes, GraphNode{
			ID:        "program:" + prog.Namespace + "/" + prog.Name,
			Label:     prog.Name,
			Type:      "program",
			Namespace: prog.Namespace,
		})
	}

	// Add project nodes and edges
	for _, proj := range projects {
		var status struct {
			Phase string `json:"phase"`
		}
		_ = json.Unmarshal(proj.Status, &status)

		var spec struct {
			ProgramRef struct {
				Name      string `json:"name"`
				Namespace string `json:"namespace,omitempty"`
			} `json:"programRef"`
			Dependencies []struct {
				ProjectRef struct {
					Name      string `json:"name"`
					Namespace string `json:"namespace,omitempty"`
				} `json:"projectRef"`
				Outputs map[string]string `json:"outputs"`
			} `json:"dependencies"`
		}
		_ = json.Unmarshal(proj.Spec, &spec)

		projID := "project:" + proj.Namespace + "/" + proj.Name
		nodes = append(nodes, GraphNode{
			ID:        projID,
			Label:     proj.Name,
			Type:      "project",
			Namespace: proj.Namespace,
			Phase:     status.Phase,
		})

		// Edge: project -> program
		progNS := spec.ProgramRef.Namespace
		if progNS == "" {
			progNS = proj.Namespace
		}
		edges = append(edges, GraphEdge{
			Source: projID,
			Target: "program:" + progNS + "/" + spec.ProgramRef.Name,
			Label:  "programRef",
		})

		// Edges: project -> dependency projects
		for _, dep := range spec.Dependencies {
			depNS := dep.ProjectRef.Namespace
			if depNS == "" {
				depNS = proj.Namespace
			}
			label := ""
			for k, v := range dep.Outputs {
				if label != "" {
					label += ", "
				}
				label += k + " -> " + v
			}
			edges = append(edges, GraphEdge{
				Source: "project:" + depNS + "/" + dep.ProjectRef.Name,
				Target: projID,
				Label:  label,
			})
		}
	}

	writeJSON(w, Graph{Nodes: nodes, Edges: edges})
}

func (h *Handler) rerunProject(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")

	if err := h.k8s.RerunProject(r.Context(), ns, name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]string{"status": "rerun triggered"})
}

func (h *Handler) listJobs(w http.ResponseWriter, r *http.Request) {
	ns := r.URL.Query().Get("namespace")
	jobs, err := h.k8s.ListJobs(r.Context(), ns)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, jobs)
}

func (h *Handler) createProject(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	metadata, _ := body["metadata"].(map[string]interface{})
	if metadata == nil {
		writeError(w, http.StatusBadRequest, "missing metadata")
		return
	}
	ns, _ := metadata["namespace"].(string)
	if ns == "" {
		ns = "default"
		metadata["namespace"] = ns
	}
	body["apiVersion"] = "tofu.example.com/v1alpha1"
	body["kind"] = "TofuProject"
	if err := h.k8s.CreateProject(r.Context(), ns, body); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, map[string]string{"status": "created"})
}

func (h *Handler) createProgram(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	metadata, _ := body["metadata"].(map[string]interface{})
	if metadata == nil {
		writeError(w, http.StatusBadRequest, "missing metadata")
		return
	}
	ns, _ := metadata["namespace"].(string)
	if ns == "" {
		ns = "default"
		metadata["namespace"] = ns
	}
	body["apiVersion"] = "tofu.example.com/v1alpha1"
	body["kind"] = "TofuProgram"
	if err := h.k8s.CreateProgram(r.Context(), ns, body); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, map[string]string{"status": "created"})
}

func (h *Handler) updateProject(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")
	var body struct {
		Spec map[string]interface{} `json:"spec"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if err := h.k8s.UpdateProject(r.Context(), ns, name, body.Spec); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]string{"status": "updated"})
}

func (h *Handler) deleteProject(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")
	if err := h.k8s.DeleteProject(r.Context(), ns, name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]string{"status": "deleted"})
}

func (h *Handler) updateProgram(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")
	var body struct {
		Spec map[string]interface{} `json:"spec"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if err := h.k8s.UpdateProgram(r.Context(), ns, name, body.Spec); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]string{"status": "updated"})
}

func (h *Handler) deleteProgram(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")
	if err := h.k8s.DeleteProgram(r.Context(), ns, name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]string{"status": "deleted"})
}

func (h *Handler) getJobLogs(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")
	logs, err := h.k8s.GetJobLogs(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, map[string]string{"logs": logs})
}

func (h *Handler) listResources(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")

	// Get plan output from project status
	project, err := h.k8s.GetProject(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusNotFound, err.Error())
		return
	}

	var status struct {
		PlanOutput string `json:"planOutput"`
	}
	_ = json.Unmarshal(project.Status, &status)

	// Also check latest revision for richer data
	planText := status.PlanOutput
	if planText == "" {
		revisions, err := h.k8s.ListRevisions(r.Context(), ns, name)
		if err == nil && len(revisions) > 0 {
			planText = revisions[0].PlanOutput
		}
	}

	resources := k8s.ParseResources(planText)
	writeJSON(w, resources)
}

func (h *Handler) suspendProject(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")

	var body struct {
		Suspend bool `json:"suspend"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "missing 'suspend' in request body")
		return
	}

	if err := h.k8s.SetSuspend(r.Context(), ns, name, body.Suspend); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	action := "resumed"
	if body.Suspend {
		action = "suspended"
	}
	writeJSON(w, map[string]string{"status": action})
}

func (h *Handler) resolveProgramGit(ctx context.Context, namespace, name string) (gitpkg.Provider, *gitpkg.SourceInfo, error) {
	program, err := h.k8s.GetProgram(ctx, namespace, name)
	if err != nil {
		return nil, nil, fmt.Errorf("program not found: %w", err)
	}

	var spec struct {
		Source *struct {
			URL                string `json:"url"`
			Ref                string `json:"ref"`
			Path               string `json:"path"`
			CredentialsSecretRef *struct {
				Name string `json:"name"`
			} `json:"credentialsSecretRef"`
		} `json:"source"`
	}
	if err := json.Unmarshal(program.Spec, &spec); err != nil || spec.Source == nil || spec.Source.URL == "" {
		return nil, nil, fmt.Errorf("program has no git source")
	}

	credSecret := ""
	if spec.Source.CredentialsSecretRef != nil {
		credSecret = spec.Source.CredentialsSecretRef.Name
	}

	provider, info, err := h.git.ForSource(ctx, spec.Source.URL, namespace, credSecret)
	if err != nil {
		return nil, nil, err
	}

	info.Ref = spec.Source.Ref
	info.Path = spec.Source.Path
	if info.Ref == "" {
		info.Ref = "main"
	}

	return provider, info, nil
}

func (h *Handler) listProgramCommits(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")

	provider, info, err := h.resolveProgramGit(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	commits, err := provider.ListCommits(r.Context(), info.Owner, info.Repo, info.Ref, info.Path, 30)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, commits)
}

func (h *Handler) getProgramCommit(w http.ResponseWriter, r *http.Request) {
	ns := r.PathValue("namespace")
	name := r.PathValue("name")
	sha := r.PathValue("sha")

	provider, info, err := h.resolveProgramGit(r.Context(), ns, name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	detail, err := provider.GetCommit(r.Context(), info.Owner, info.Repo, sha)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, detail)
}

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
