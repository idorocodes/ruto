#!/usr/bin/env bash
# End-to-end smoke flow against a RUNNING server (npm run dev / npm start).
# Costs a little devnet SOL: 2 profiles + 1 card + 1 response.
# Note: profile creation is limited to 5 per hour per IP.
set -euo pipefail

BASE="${BASE_URL:-http://localhost:8787}"
N=$(( $(date +%s) % 100000000 ))
A="smoke_a_${N}"
B="smoke_b_${N}"

# json_get <path> reads JSON from stdin, e.g. `echo "$json" | json_get verified`
json_get() {
  node -e '
    let s = "";
    process.stdin.on("data", d => (s += d)).on("end", () => {
      const v = JSON.parse(s);
      const r = process.argv[1].split(".").reduce((a, k) => (a == null ? a : a[k]), v);
      console.log(r === undefined ? "" : typeof r === "object" ? JSON.stringify(r) : r);
    });
  ' "$1"
}

# call <METHOD> <PATH> [JSON_BODY]  -> sets $CODE and $BODY
call() {
  local method=$1 path=$2 data=${3:-} out
  if [ -n "$data" ]; then
    out=$(curl -sS -X "$method" "$BASE$path" -H 'content-type: application/json' -d "$data" -w $'\n%{http_code}')
  else
    out=$(curl -sS -X "$method" "$BASE$path" -w $'\n%{http_code}')
  fi
  CODE="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
}

expect() { # expect <status> <label>
  if [ "$CODE" != "$1" ]; then
    echo "FAIL: $2 -> HTTP $CODE (expected $1)"
    echo "$BODY"
    exit 1
  fi
  echo "ok   $2 (HTTP $CODE)"
}

echo "== Ruto smoke test against $BASE =="

call GET /health
expect 200 "GET /health"
echo "     $BODY"

call POST /profiles "{\"handle\":\"$A\",\"avatarId\":1}"
expect 201 "create profile $A"
echo "     tx: $(echo "$BODY" | json_get txSignature)"

call POST /profiles "{\"handle\":\"$B\",\"avatarId\":2}"
expect 201 "create profile $B"

call POST /profiles "{\"handle\":\"$B\",\"avatarId\":2}"
expect 409 "duplicate handle is rejected"

ROUTE='{"title":"Ikeja to Lekki","mode":"walk","points":[
  {"lat":6.5244,"lng":3.3792,"label":"Ikeja Bus Stop","note":"Take the left gate"},
  {"lat":6.4474,"lng":3.3903,"label":"Lekki Market","note":""}]}'
call POST /cards "{\"from\":\"$A\",\"to\":\"$B\",\"route\":$ROUTE,\"directions\":\"Walk straight, then turn right.\",\"language\":\"en\"}"
expect 201 "send card $A -> $B"
CARD_ID=$(echo "$BODY" | json_get id)
echo "     card: $CARD_ID"
echo "     hash: $(echo "$BODY" | json_get hash)"

call GET "/inbox/$B"
expect 200 "read inbox of $B"
echo "     $BODY"

call GET "/cards/$CARD_ID/verify"
expect 200 "verify before responding"
[ "$(echo "$BODY" | json_get verified)" = "true" ] || { echo "FAIL: expected verified=true"; echo "$BODY"; exit 1; }

call POST "/cards/$CARD_ID/respond" '{"accept":true}'
expect 200 "respond (accept)"
echo "     status: $(echo "$BODY" | json_get status)  tx: $(echo "$BODY" | json_get txSignature)"

call GET "/cards/$CARD_ID/verify"
expect 200 "verify after responding"
[ "$(echo "$BODY" | json_get verified)" = "true" ] || { echo "FAIL: expected verified=true"; echo "$BODY"; exit 1; }

call POST "/cards/$CARD_ID/respond" '{"accept":false}'
expect 409 "second response is rejected (already_resolved)"

call GET "/inbox/$B"
expect 200 "inbox shows final status"
echo "     $BODY"

echo "== all steps passed =="
