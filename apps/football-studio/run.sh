#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/python -m football_studio serve "$@"
