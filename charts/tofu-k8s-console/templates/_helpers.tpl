{{- define "tofu-k8s-console.serviceAccountName" -}}
{{- if .Values.serviceAccount.name -}}
{{- .Values.serviceAccount.name -}}
{{- else -}}
tofu-k8s-console
{{- end -}}
{{- end -}}
