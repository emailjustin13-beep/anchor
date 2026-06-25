import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const { prompt, systemPrompt, apiKey } = await request.json()

    // Use server-side env key first, fall back to client-provided key
    const key = process.env.ANTHROPIC_API_KEY || apiKey

    if (!key) {
      return NextResponse.json(
        { error: 'No API key. Add your Anthropic key in Settings or set ANTHROPIC_API_KEY in Vercel.' },
        { status: 401 }
      )
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 1500,
        system:     systemPrompt || 'You are a helpful creative writing assistant.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    })

    if (!response.ok) {
      const err = await response.json()
      return NextResponse.json(
        { error: err.error?.message || 'AI request failed' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json({ result: data.content[0].text })

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
