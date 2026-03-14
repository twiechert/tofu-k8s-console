package api

import (
	"encoding/json"
	"net/http"

	"github.com/twiechert/tofu-k8s-console/internal/k8s"
)

// Handler provides HTTP handlers for the API.
type Handler struct {
	k8s *k8s.Client
}

// NewHandler creates a new API handler.
func NewHandler(k8sClient *k8s.Client) *Handler {
	return &Handler{k8s: k8sClient}
}

// RegisterRoutes registers all API routes on the given mux.
func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/projects", h.listProjects)
	mux.HandleFunc("GET /api/v1/projects/{namespace}/{name}", h.getProject)
	mux.HandleFunc("GET /api/v1/programs", h.listPrograms)
	mux.HandleFunc("GET /api/v1/programs/{namespace}/{name}", h.getProgram)
	mux.HandleFunc("GET /api/v1/projects/{namespace}/{name}/revisions", h.listRevisions)
	mux.HandleFunc("POST /api/v1/projects/{namespace}/{name}/approve", h.approveProject)
	mux.HandleFunc("GET /api/v1/overview", h.getOverview)
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

func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
