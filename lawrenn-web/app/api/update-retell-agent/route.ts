import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { agent_id, voice_id, greeting } = await request.json();

    if (!agent_id) {
      return NextResponse.json(
        { error: "No Retell agent ID — set retell_agent_id on this business row." },
        { status: 422 }
      );
    }

    const retellKey = process.env.RETELL_API_KEY;
    if (!retellKey) {
      return NextResponse.json({ error: "RETELL_API_KEY not configured" }, { status: 500 });
    }

    const headers = {
      "Authorization": `Bearer ${retellKey}`,
      "Content-Type":  "application/json",
    };

    // Step 1: fetch the agent to find its LLM ID
    const agentRes = await fetch(`https://api.retellai.com/get-agent/${agent_id}`, { headers });
    if (!agentRes.ok) {
      const text = await agentRes.text();
      return NextResponse.json(
        { error: `Failed to fetch agent (${agentRes.status}): ${text}` },
        { status: agentRes.status }
      );
    }

    const agent = await agentRes.json();

    // Retell stores the LLM reference under response_engine.llm_id
    const llmId: string | undefined =
      agent.response_engine?.llm_id ??
      agent.response_engine?.retell_llm_id ??
      agent.llm_id ??
      agent.retell_llm_id;

    // Step 2: patch the agent — voice, response delay, and optionally begin_message
    const agentBody: Record<string, any> = {
      response_delay_ms: 0,       // respond as soon as STT detects end of speech
    };
    if (voice_id) agentBody.voice_id = voice_id;
    // For no-LLM agents, use the dynamic variable template too
    if (!llmId) agentBody.begin_message = "{{begin_message}}";

    if (Object.keys(agentBody).length > 0) {
      const agentPatch = await fetch(`https://api.retellai.com/update-agent/${agent_id}`, {
        method: "PATCH",
        headers,
        body:   JSON.stringify(agentBody),
      });
      if (!agentPatch.ok) {
        const text = await agentPatch.text();
        return NextResponse.json(
          { error: `Agent update failed (${agentPatch.status}): ${text}` },
          { status: agentPatch.status }
        );
      }
    }

    // Step 3: patch the Retell LLM's begin_message to the dynamic variable template.
    // The actual greeting is injected per-call via retell_llm_dynamic_variables.begin_message
    // so the LLM template must always stay as {{begin_message}} — never the literal text.
    if (llmId) {
      const llmPatch = await fetch(`https://api.retellai.com/update-retell-llm/${llmId}`, {
        method: "PATCH",
        headers,
        body:   JSON.stringify({ begin_message: "{{begin_message}}" }),
      });
      if (!llmPatch.ok) {
        const text = await llmPatch.text();
        return NextResponse.json(
          { error: `LLM greeting update failed (${llmPatch.status}): ${text}` },
          { status: llmPatch.status }
        );
      }
    } else if (greeting && !llmId) {
      // No LLM found — we already sent begin_message to the agent above
      // Log so we know which path was taken
      console.warn("[retell] No LLM ID found on agent — begin_message sent to agent directly. agent keys:", Object.keys(agent));
    }

    return NextResponse.json({ ok: true, llmId: llmId ?? null });

  } catch (err: any) {
    console.error("[retell] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
