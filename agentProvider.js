// promptfoo custom provider for the HYPER-AI agent.
// Single turn: POSTs {user_id, text}, accumulates the SSE stream into {text, actions}.
// Multi-turn (memory tests): split the prompt on "|||" — each part is sent in order
// under the SAME generated user_id; the LAST reply is returned. A fresh user_id per
// call keeps each test an isolated conversation.

const DEFAULT_URL = "http://localhost:8000/chat";

class HyperAIProvider {
  constructor(options = {}) {
    this.providerId = options.id || "hyperai-agent";
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt) {
    const url = process.env.AGENT_URL || this.config.url || DEFAULT_URL;
    const prefix = this.config.userId || "eval";
    const userId = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const turns = String(prompt)
      .split("|||")
      .map((s) => s.trim())
      .filter(Boolean);

    let result = { text: "", actions: [] };
    for (const turn of turns) {
      result = await this._send(url, userId, turn);
      if (result.error) return { error: result.error };
    }
    return { output: result };
  }

  async _send(url, userId, text) {
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, text }),
      });
    } catch (e) {
      return { error: `request failed: ${e.message}` };
    }
    if (!res.ok || !res.body) {
      return { error: `agent error: ${res.status} ${res.statusText}` };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let outText = "";
    const actions = [];
    let done = false;

    try {
      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const ev of events) {
          const line = ev.replace(/^data:\s*/, "").trim();
          if (!line) continue;
          if (line === "[DONE]") {
            done = true;
            break;
          }
          try {
            const json = JSON.parse(line);
            // Mirror what the IDE itself renders (see AgentPanel.extractChunkText),
            // so a team is scored on exactly the text a user would have seen.
            if (json.action) actions.push(json);
            else if (typeof json === "string") outText += json;
            else outText += json.response ?? json.content ?? json.text ?? json.message ?? "";
          } catch {
            /* ignore non-JSON keep-alives */
          }
        }
      }
    } catch (e) {
      // The agent closed the connection mid-stream — almost always it crashed
      // inside its own handler. undici surfaces this as a bare "TypeError:
      // terminated", which says nothing; check `docker logs` for the traceback.
      return {
        error:
          `agent closed the stream after ${outText.length} chars (${e.message}). ` +
          `It most likely crashed mid-response — run \`docker logs <container>\` to see why. ` +
          `A common cause is a missing environment variable, e.g. an LLM API key.`,
      };
    } finally {
      // Release the stream/socket. Without this, breaking on [DONE] leaves the
      // connection half-read, and the NEXT turn's fetch reuses a dead socket
      // and stalls ~60s (undici connection timeout).
      try {
        await reader.cancel();
      } catch {
        /* already closed */
      }
    }

    return { text: outText, actions };
  }
}

module.exports = HyperAIProvider;
