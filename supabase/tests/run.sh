#!/usr/bin/env bash
# Runs the database behaviour checks against a throwaway local Postgres (16 or newer):
# a stand-in for what Supabase provides (roles, auth.users, auth.uid()), then every migration,
# then the checks in 10_behaviour.sql and 30_invitations.sql. Nothing touches the real Supabase project.
#
#   PGHOST=/path/to/socket PGPORT=5432 PGUSER=postgres supabase/tests/run.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
db="${TEST_DATABASE:-takatax_test}"
psql_cmd=(psql -v ON_ERROR_STOP=1 -q)

"${psql_cmd[@]}" -d postgres -c "drop database if exists $db" -c "create database $db"
"${psql_cmd[@]}" -d "$db" -f "$here/00_supabase_stub.sql" 2>/dev/null
for migration in "$root"/supabase/migrations/*.sql; do
  "${psql_cmd[@]}" -d "$db" -f "$migration"
done
for checks in 10_behaviour.sql 30_invitations.sql; do
  "${psql_cmd[@]}" -d "$db" -f "$here/$checks" | grep -E "PASSED" || {
    echo "Database checks failed in $checks" >&2
    exit 1
  }
done
