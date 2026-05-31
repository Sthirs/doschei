#!/usr/bin/env bash
set -euo pipefail

telepresence leave doschei-backend --namespace doschei || true
telepresence leave doschei-frontend --namespace doschei || true
