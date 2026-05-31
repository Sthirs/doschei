#!/usr/bin/env bash
set -euo pipefail

telepresence intercept doschei-frontend --port 5173:80 --mount false
