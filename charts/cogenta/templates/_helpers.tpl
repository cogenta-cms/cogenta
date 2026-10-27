{{- define "cogenta.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "cogenta.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 45 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "cogenta.name" .) | trunc 45 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "cogenta.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | quote }}
app.kubernetes.io/name: {{ include "cogenta.name" . | quote }}
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
app.kubernetes.io/part-of: cogenta
{{- end -}}

{{- define "cogenta.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cogenta.name" . | quote }}
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/component: app
{{- end -}}

{{- define "cogenta.postgresqlSelectorLabels" -}}
app.kubernetes.io/name: {{ include "cogenta.name" . | quote }}
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/component: postgresql
{{- end -}}

{{- define "cogenta.secretName" -}}
{{- default (include "cogenta.fullname" .) .Values.existingSecret -}}
{{- end -}}

{{- define "cogenta.postgresqlSecretName" -}}
{{- default (printf "%s-postgresql" (include "cogenta.fullname" .)) .Values.postgresql.existingSecret -}}
{{- end -}}

{{- define "cogenta.dataClaim" -}}
{{- default (include "cogenta.fullname" .) .Values.persistence.existingClaim -}}
{{- end -}}

{{- define "cogenta.containerSecurityContext" -}}
runAsNonRoot: true
runAsUser: {{ . }}
runAsGroup: {{ . }}
readOnlyRootFilesystem: true
allowPrivilegeEscalation: false
capabilities:
  drop: [ALL]
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- define "cogenta.podSecurityContext" -}}
runAsNonRoot: true
runAsUser: {{ . }}
runAsGroup: {{ . }}
fsGroup: {{ . }}
fsGroupChangePolicy: OnRootMismatch
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{/* Cache generated data within this render so Deployment checksums match the Secret. */}}
{{- define "cogenta.secretData" -}}
{{- if not (hasKey . "cogentaSecretData") -}}
{{- $stored := (lookup "v1" "Secret" .Release.Namespace (include "cogenta.secretName" .)) | default dict -}}
{{- $old := get $stored "data" | default dict -}}
{{- $data := dict -}}
{{- range $key, $value := dict "auth-signing-key" .Values.secrets.authSigningKey "preview-signing-key" .Values.secrets.previewSigningKey "admin-password" .Values.secrets.adminPassword -}}
{{- if $value -}}
{{- $_ := set $data $key ($value | b64enc) -}}
{{- else if hasKey $old $key -}}
{{- $_ := set $data $key (get $old $key) -}}
{{- else -}}
{{- $_ := set $data $key (randAlphaNum 64 | b64enc) -}}
{{- end -}}
{{- end -}}
{{- $_ := set . "cogentaSecretData" $data -}}
{{- end -}}
{{- toYaml .cogentaSecretData -}}
{{- end -}}

{{- define "cogenta.postgresqlSecretData" -}}
{{- if not (hasKey . "cogentaPostgresqlSecretData") -}}
{{- $stored := (lookup "v1" "Secret" .Release.Namespace (include "cogenta.postgresqlSecretName" .)) | default dict -}}
{{- $old := get $stored "data" | default dict -}}
{{- $password := .Values.postgresql.password -}}
{{- $encoded := "" -}}
{{- if $password -}}
{{- $encoded = $password | b64enc -}}
{{- else if hasKey $old "postgres-password" -}}
{{- $encoded = get $old "postgres-password" -}}
{{- else -}}
{{- $encoded = randAlphaNum 48 | b64enc -}}
{{- end -}}
{{- if not (regexMatch "^[A-Za-z0-9._~-]+$" ($encoded | b64dec)) -}}
{{- fail "Built-in PostgreSQL passwords must use URI-unreserved characters (A-Z a-z 0-9 . _ ~ -); use an external database URL for other credentials." -}}
{{- end -}}
{{- $_ := set . "cogentaPostgresqlSecretData" (dict "postgres-password" $encoded) -}}
{{- end -}}
{{- toYaml .cogentaPostgresqlSecretData -}}
{{- end -}}

{{- define "cogenta.appEnv" -}}
- name: COGENTA_AUTH_SIGNING_KEY
  valueFrom:
    secretKeyRef:
      name: {{ include "cogenta.secretName" . | quote }}
      key: auth-signing-key
- name: COGENTA_PREVIEW_SIGNING_KEY
  valueFrom:
    secretKeyRef:
      name: {{ include "cogenta.secretName" . | quote }}
      key: preview-signing-key
- name: COGENTA_ADMIN_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "cogenta.secretName" . | quote }}
      key: admin-password
{{- if .Values.postgresql.enabled }}
# Keep this before DATABASE_URL: kubelet expands previously defined env variables.
- name: POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "cogenta.postgresqlSecretName" . | quote }}
      key: postgres-password
- name: COGENTA_DATABASE_URL
  value: {{ printf "postgresql://%s:%s@%s-postgresql:5432/%s" .Values.postgresql.username "$(POSTGRES_PASSWORD)" (include "cogenta.fullname" .) .Values.postgresql.database | quote }}
{{- else }}
- name: COGENTA_DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ default .Values.existingSecret .Values.externalDatabase.existingSecret | quote }}
      key: {{ .Values.externalDatabase.secretKey | quote }}
{{- end }}
{{- with .Values.extraEnv }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "cogenta.appEnvFrom" -}}
- configMapRef:
    name: {{ include "cogenta.fullname" . | quote }}
{{- with .Values.extraEnvFrom }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "cogenta.appVolumeMounts" -}}
- name: data
  mountPath: /data
- name: tmp
  mountPath: /tmp
{{- with .Values.extraVolumeMounts }}
{{ toYaml . }}
{{- end }}
{{- end -}}
