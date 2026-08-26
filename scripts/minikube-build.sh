#!/usr/bin/env bash
set -euo pipefail

echo "=== Building backend image ==="
minikube image build -f apps/backend/Dockerfile -t doschei/backend:dev .

echo "=== Building frontend image ==="
minikube image build -f apps/frontend/Dockerfile -t doschei/frontend:dev --build-arg APP_VERSION=dev .
