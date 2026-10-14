#!/bin/bash
# usage: run-version.sh <label> <bindir> <port>
L=$1; B=$2; P=$3; D=/tmp/supa-eval/data-$L; O=/tmp/supa-eval/out/$L; mkdir -p $O
rm -rf $D; $B/initdb -D $D -U postgres --auth=trust -E UTF8 > $O/initdb.log 2>&1 || { echo "initdb FAILED"; exit 1; }
$B/pg_ctl -D $D -o "-p $P -k /tmp/supa-eval -c listen_addresses=127.0.0.1" -l $O/server.log -w start > /dev/null || { echo "start FAILED"; exit 1; }
export NODE_OPTIONS=--max-old-space-size=1024 PGPORT_TEST=$P
ADMIN=postgres://postgres@127.0.0.1:$P/postgres
echo "[$L] server $($B/postgres --version)"
cd /tmp/supa-eval/merged && npx tsx .probe/supa-emul.mts > $O/supa-emul.txt 2>&1; echo "[$L] supa-emul (fresh cluster, first) exit=$?"
cd /tmp/supa-eval/g7 && NILE_TEST_PG_ADMIN_URL=$ADMIN npx vitest run --reporter=json --outputFile=$O/vitest-g7-pg.json > $O/vitest-g7-pg.log 2>&1; echo "[$L] vitest g7+PG exit=$?"
cd /tmp/supa-eval/merged && NILE_TEST_PG_ADMIN_URL=$ADMIN npx vitest run --reporter=json --outputFile=$O/vitest-merged-pg.json > $O/vitest-merged-pg.log 2>&1; echo "[$L] vitest merged+PG exit=$?"
cd /tmp/supa-eval/g7 && npx tsx .probe/matrix.mts > $O/matrix.txt 2>&1; echo "[$L] matrix exit=$?"
$B/pg_ctl -D $D -m fast -w stop > /dev/null && rm -rf $D && echo "[$L] cluster stopped and removed"
