#!/usr/bin/env bash
# Local development only: drops and recreates the dev + test databases.
set -euo pipefail
for db in baglik baglik_test; do
  PGPASSWORD=${PGPASSWORD:-baglik-dev} psql -h localhost -U baglik -d postgres -v ON_ERROR_STOP=1 \
    -c "drop database if exists $db with (force)" -c "create database $db"
done
