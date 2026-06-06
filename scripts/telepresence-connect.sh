#!/usr/bin/env bash
set -euo pipefail

telepresence helm install || true
telepresence connect --namespace doschei
