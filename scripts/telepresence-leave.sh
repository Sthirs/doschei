#!/usr/bin/env bash
set -euo pipefail

telepresence leave doschei-backend || true
telepresence leave doschei-frontend || true
