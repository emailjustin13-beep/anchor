import { NextResponse } from 'next/server'

const requestWindows = new Map()

async function getUser(request) {
  const authorization = request.headers.get('authorization') || ''
  if (!authorization.startsWith('Bearer ')) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: { Authorization: authorization, apikey: anonKey },
    cache: 'no-store',
  })
  return response.ok ? response.json() : null
}

function withinRateLimit(userId) {
  const now = Date.now()
  const recent = (requestWindows.get(userId) || []).filter(timestamp => now - timestamp < 60_000)
  if (recent.length >= 20) return false
  recent.push(now)
  requestWindows.set(userId, recent)
  return true
}

export async function POST(request) {
  try {
    const user = await getUser(request)
    if (!user?.id) return NextResponse.json({ error: 'Sign in to use Anchor AI.' }, { status: 401 })
    if (!withinRateLimit(user.id)) return NextResponse.json({ error: 'Too many scans. Wait a moment and try again.' }, { status: 429 })

    const { prompt, systemPrompt, schema, maxTokens } = await request.json()
    const key = process.env.ANTHROPIC_API_KEY

    if (!key) {
      return NextResponse.json(
        { error: 'Anchor AI is not configured.' },
        { status: 503 }
      )
    }

    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 750000) {
      return NextResponse.json({ error: 'Invalid or oversized AI request.' }, { status: 400 })
    }

    if (typeof systemPrompt !== 'string' || systemPrompt.length > 12000) {
      return NextResponse.json({ error: 'Invalid AI instructions.' }, { status: 400 })
    }

    const tokenBudget = Math.min(Math.max(Number(maxTokens) || 2000, 256), 10000)
    const body = {
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: tokenBudget,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    }

    if (schema) {
      body.output_config = {
        format: { type: 'json_schema', schema },
      }
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const err = await response.json()
      return NextResponse.json(
        { error: err.error?.message || 'AI request failed' },
        { status: response.status }
      )
    }

    const data = await response.json()
    const text = data.content?.find(block => block.type === 'text')?.text
    if (!text) return NextResponse.json({ error: 'Anchor received an empty AI response.' }, { status: 502 })

    if (schema) {
      try {
        return NextResponse.json({ result: JSON.parse(text) })
      } catch {
        return NextResponse.json({ error: 'Anchor received an invalid structured response.' }, { status: 502 })
      }
    }

    return NextResponse.json({ result: text })

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
