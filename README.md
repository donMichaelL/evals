# HYPER-AI Agent Evals

Scores a delivered agent with [promptfoo](https://promptfoo.dev). Each assertion's
`weight` is its points; [`score.mjs`](score.mjs) sums the weight of every assertion
that passes, so a question can land on any level of its ladder.

## Steps

```bash
cd evals

just score donmichael/hyperion:latest        # 1. start the stack and score the agent
just serve                                   # 2. report at http://localhost:8080/results.html
just down                                    # 3. stop the stack
```

The gateway key lives in `.env`, which is **not in this repository** — copy
`.env.example` to `.env` and fill it in. Nothing needs exporting. It is read twice:
`docker compose` passes it into the agent container under four names, because
teams spell it differently, and promptfoo reads it for the `llm-rubric` grader.
Delivered images carry no key of their own, so without this file every agent
crashes on its first call.

1. **`just score <image>`** starts `ide-backend` + the agent, waits until `/chat`
   answers, runs every case and prints the points per question.
2. **`just serve`** serves the report — open it, screenshot it, keep it as the
   record for that team. It is written to `results.html` on every run.
3. **`just down`** stops both containers. `score` leaves them up on purpose, so
   you can look around the IDE first.

Copy the report before scoring the next team — every run overwrites it:

```bash
cp results.html results-team7.html
```


| Part | | Points |
|---|---|---|
| A + B + C | What it knows | **50** |
| D | What it refuses | **16** |
| E | How it writes | **12** |
| F | What it remembers | **10** |
| G | What it does | **18** |
