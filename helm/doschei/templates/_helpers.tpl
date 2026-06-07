{{- define "doschei.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "doschei.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "doschei.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "doschei.labels" -}}
app.kubernetes.io/name: {{ include "doschei.name" . }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "doschei.imageRepository" -}}
{{- $root := .root -}}
{{- $image := .image -}}
{{- if $root.Values.devMode.enabled -}}
{{- printf "doschei/%s" .component -}}
{{- else -}}
{{- $image.repository -}}
{{- end -}}
{{- end -}}

{{- define "doschei.imageTag" -}}
{{- $root := .root -}}
{{- $image := .image -}}
{{- if $root.Values.devMode.enabled -}}
dev
{{- else -}}
{{- default $root.Chart.AppVersion $image.tag -}}
{{- end -}}
{{- end -}}

{{- define "doschei.backendEnvValue" -}}
{{- $root := .root -}}
{{- $key := .key -}}
{{- if $root.Values.devMode.enabled -}}
{{- if eq $key "NODE_ENV" -}}development
{{- else if eq $key "DB_SYNC" -}}true
{{- else if eq $key "SEED_ON_STARTUP" -}}true
{{- else -}}{{- index $root.Values.backend.env $key -}}
{{- end -}}
{{- else -}}
{{- index $root.Values.backend.env $key -}}
{{- end -}}
{{- end -}}

{{- define "doschei.databaseHostname" -}}
{{- default (printf "%s-postgres" (include "doschei.fullname" .)) .Values.backend.database.hostname -}}
{{- end -}}

{{- define "doschei.databasePort" -}}
{{- default .Values.postgres.service.port .Values.backend.database.port -}}
{{- end -}}

{{- define "doschei.databaseUsername" -}}
{{- default .Values.postgres.auth.username .Values.backend.database.username -}}
{{- end -}}

{{- define "doschei.databasePassword" -}}
{{- default .Values.postgres.auth.password .Values.backend.database.password -}}
{{- end -}}

{{- define "doschei.databaseName" -}}
{{- default .Values.postgres.auth.database .Values.backend.database.databaseName -}}
{{- end -}}
