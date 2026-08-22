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
{{- else if eq $key "JWT_SECRET" -}}change-me-dev-secret
{{- else if eq $key "FRONTEND_URL" -}}{{ printf "http://%s" $root.Values.ingress.host }}
{{- else if eq $key "RATE_LIMIT_LIMIT" -}}1000000
{{- else -}}{{- index $root.Values.backend.env $key -}}
{{- end -}}
{{- else -}}
{{- index $root.Values.backend.env $key -}}
{{- end -}}
{{- end -}}

{{- define "doschei.backendJwtSecretName" -}}
{{- if .Values.devMode.enabled -}}
{{- printf "%s-backend" (include "doschei.fullname" .) -}}
{{- else -}}
{{- .Values.backend.secrets.jwt.secretName -}}
{{- end -}}
{{- end -}}

{{- define "doschei.backendDatabaseSecretName" -}}
{{- if .Values.devMode.enabled -}}
{{- printf "%s-backend" (include "doschei.fullname" .) -}}
{{- else -}}
{{- .Values.backend.secrets.database.secretName -}}
{{- end -}}
{{- end -}}

{{- define "doschei.backendOauthSecretName" -}}
{{- if .Values.devMode.enabled -}}
{{- printf "%s-backend" (include "doschei.fullname" .) -}}
{{- else -}}
{{- .Values.backend.secrets.oauth.secretName -}}
{{- end -}}
{{- end -}}

{{- define "doschei.backendSecretKey" -}}
{{- $root := .root -}}
{{- $type := .type -}}
{{- if and $root.Values.devMode.enabled (eq $type "jwt") -}}JWT_SECRET
{{- else if and $root.Values.devMode.enabled (eq $type "hostname") -}}DB_HOSTNAME
{{- else if and $root.Values.devMode.enabled (eq $type "port") -}}DB_PORT
{{- else if and $root.Values.devMode.enabled (eq $type "username") -}}DB_USERNAME
{{- else if and $root.Values.devMode.enabled (eq $type "password") -}}DB_PASSWORD
{{- else if and $root.Values.devMode.enabled (eq $type "databaseName") -}}DB_DATABASE_NAME
{{- else if eq $type "jwt" -}}
{{- $root.Values.backend.secrets.jwt.key -}}
{{- else if eq $type "hostname" -}}
{{- $root.Values.backend.secrets.database.keys.hostname -}}
{{- else if eq $type "port" -}}
{{- $root.Values.backend.secrets.database.keys.port -}}
{{- else if eq $type "username" -}}
{{- $root.Values.backend.secrets.database.keys.username -}}
{{- else if eq $type "password" -}}
{{- $root.Values.backend.secrets.database.keys.password -}}
{{- else if and $root.Values.devMode.enabled (eq $type "oauthConfig") -}}OAUTH_CONFIG
{{- else if and $root.Values.devMode.enabled (eq $type "oauthStateSecret") -}}OAUTH_STATE_SECRET
{{- else if eq $type "oauthConfig" -}}
{{- $root.Values.backend.secrets.oauth.keys.config -}}
{{- else if eq $type "oauthStateSecret" -}}
{{- $root.Values.backend.secrets.oauth.keys.stateSecret -}}
{{- else -}}
{{- $root.Values.backend.secrets.database.keys.databaseName -}}
{{- end -}}
{{- end -}}

{{- define "doschei.postgresSecretName" -}}
{{- if .Values.devMode.enabled -}}
{{- printf "%s-postgres" (include "doschei.fullname" .) -}}
{{- else -}}
{{- .Values.postgres.auth.secretName -}}
{{- end -}}
{{- end -}}

{{- define "doschei.postgresSecretKey" -}}
{{- $root := .root -}}
{{- $type := .type -}}
{{- if and $root.Values.devMode.enabled (eq $type "username") -}}POSTGRES_USER
{{- else if and $root.Values.devMode.enabled (eq $type "password") -}}POSTGRES_PASSWORD
{{- else if and $root.Values.devMode.enabled (eq $type "database") -}}POSTGRES_DB
{{- else if eq $type "username" -}}
{{- $root.Values.postgres.auth.keys.username -}}
{{- else if eq $type "password" -}}
{{- $root.Values.postgres.auth.keys.password -}}
{{- else -}}
{{- $root.Values.postgres.auth.keys.database -}}
{{- end -}}
{{- end -}}
