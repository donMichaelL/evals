agent := "donmichael/hyperion:latest"

up agent=agent:
    AGENT_IMAGE={{agent}} docker compose up -d
    @printf "waiting for %s " "{{agent}}"
    @for i in $(seq 1 60); do \
        curl -sf -o /dev/null -X POST http://localhost:8000/chat \
          -H "Content-Type: application/json" \
          -d '{"user_id":"probe","text":"ping"}' && break; \
        printf "."; sleep 1; \
    done; echo
    @curl -sf -o /dev/null http://localhost:3001/api/files \
        && echo "ide-backend ready at http://localhost:3001" \
        || echo "ide-backend NOT reachable"

down:
    docker compose down

eval:
    -npx -y promptfoo@latest eval -j 1 -o results.json -o results.html
    node score.mjs results.json
    @echo "  report: $(pwd)/results.html"

view:
    npx -y promptfoo@latest view

serve port="8080":
    @echo "report at http://localhost:{{port}}/results.html"
    npx -y http-server . -p {{port}} -c-1

score agent=agent: (up agent)
    -just eval
    @echo "  stack still up - run 'just down' when you are finished"
