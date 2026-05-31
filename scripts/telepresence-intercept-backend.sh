#!/usr/bin/env bash
set -euo pipefail

telepresence intercept doschei-backend --namespace doschei --port 3000:3000 --mount false
