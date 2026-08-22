#!/usr/bin/env bash
set -euo pipefail

telepresence helm install || telepresence helm upgrade || true
telepresence connect --namespace doschei
