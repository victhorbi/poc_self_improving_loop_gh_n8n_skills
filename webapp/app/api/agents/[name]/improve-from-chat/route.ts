import { NextResponse } from 'next/server'

interface ChatMsg { role: 'user' | 'agent'; text: string }

export async function POST(
  req: Request,
  { params }: { params: { name: string } },
) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENROUTER_API_KEY not set in .env.local' },
      { status: 503 },
    )
  }

  const { messages, currentPrompt } = await req.json() as {
    messages: ChatMsg[]
    currentPrompt: string
  }

  const transcript = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Agent'}: ${m.text}`)
    .join('\n\n')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek/deepseek-r1-0528',
      messages: [
        {
          role: 'system',
          content: `You are an expert AI prompt engineer. Given an agent's system prompt and a real conversation, produce an improved version of the system prompt that addresses gaps, ambiguities, or areas where the agent's responses could be better.

Rules:
- Return ONLY the improved system prompt text. No explanations, no markdown wrapper, no preamble.
- Preserve the original structure and intent. Only add, clarify, or fix — do not rewrite from scratch.
- If the conversation shows the agent handled everything perfectly, return the original prompt unchanged.`,
        },
        {
          role: 'user',
          content: `## Current system prompt\n${currentPrompt}\n\n## Conversation transcript\n${transcript}\n\nProduce the improved system prompt:`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ error: `OpenRouter ${res.status}: ${err.slice(0, 200)}` }, { status: 502 })
  }

  const data = await res.json()
  const prompt: string = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!prompt) return NextResponse.json({ error: 'Empty response from model' }, { status: 502 })

  return NextResponse.json({ prompt })
}
