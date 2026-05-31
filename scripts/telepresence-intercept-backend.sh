#!/usr/bin/env bash
set -euo pipefail

telepresence intercept doschei-backend --port 3000:3000 --mount false
