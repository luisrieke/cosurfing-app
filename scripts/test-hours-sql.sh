#!/usr/bin/env bash
# Runs the opening hours migration (after the one before it that touches the same functions) and its tests against a scratch database on a local Postgres 16+.
# Usage: scripts/test-hours-sql.sh   (PSQL defaults to "psql"; set PGHOST/PGUSER etc. as needed)
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="${PSQL:-psql}"
DB="cosurfing_hours_test_$$"
"$PSQL" -q -d postgres -c "create database $DB" >/dev/null
trap '"$PSQL" -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
"$PSQL" -q -v ON_ERROR_STOP=1 -d "$DB" -f scripts/sql-tests/hours_stub_schema.sql >/dev/null
"$PSQL" -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/20261110180000_has_reviews_filter.sql >/dev/null
"$PSQL" -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/migrations/20261110200000_structured_opening_hours.sql >/dev/null
"$PSQL" -q -v ON_ERROR_STOP=1 -d "$DB" -At -f scripts/sql-tests/opening_hours_test.sql | grep -v "^$"
