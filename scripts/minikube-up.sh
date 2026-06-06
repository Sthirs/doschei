#!/usr/bin/env bash
set -euo pipefail

minikube start
minikube addons enable ingress
