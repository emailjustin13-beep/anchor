import { NextResponse } from 'next/server'

const requestWindows = new Map()
const transientAIStatuses = new Set([429, 500, 502, 503, 504, 529])
const maxAIAttempts = 3

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

function retryDelay(response, attempt) {
  const retryAfter = response?.headers.get('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 5000)

    const retryDate = Date.parse(retryAfter)
    if (!Number.isNaN(retryDate)) return Math.min(Math.max(retryDate - Date.now(), 0), 5000)
  }

  return Math.min(750 * (2 ** attempt) + Math.floor(Math.random() * 250), 5000)
}

async function requestAnthropic(key, body) {
  const requestBody = JSON.stringify(body)
  let lastNetworkError

  for (let attempt = 0; attempt < maxAIAttempts; attempt += 1) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key':         key,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        body: requestBody,
      })

      const shouldRetry = transientAIStatuses.has(response.status) && attempt < maxAIAttempts - 1
      if (!shouldRetry) return response
      await wait(retryDelay(response, attempt))
    } catch (error) {
      lastNetworkError = error
      if (attempt === maxAIAttempts - 1) throw error
      await wait(retryDelay(null, attempt))
    }
  }

  throw lastNetworkError || new Error('Anchor AI could not be reached.')
}

function messageText(data) {
  return data?.content?.find(block => block.type === 'text')?.text?.trim() || ''
}

function completeMessageText(data) {
  if (['refusal', 'max_tokens', 'model_context_window_exceeded'].includes(data?.stop_reason)) return ''
  return messageText(data)
}

async function readSuccessfulMessage(response) {
  return response.ok ? response.json().catch(() => ({})) : null
}

async function requestAnthropicMessage(key, body) {
  let response = await requestAnthropic(key, body)
  let data = await readSuccessfulMessage(response)
  if (!response.ok) return { response, data, text:'' }

  const completeText = completeMessageText(data)
  if (completeText) {
    return { response, data, text:completeText }
  }

  if (data.stop_reason === 'refusal') {
    const fallbackModel = process.env.ANTHROPIC_FALLBACK_MODEL || 'claude-haiku-4-5-20251001'
    if (fallbackModel !== body.model) {
      response = await requestAnthropic(key, { ...body, model:fallbackModel })
      data = await readSuccessfulMessage(response)
      return { response, data, text:completeMessageText(data) }
    }
  }

  if (data.stop_reason === 'max_tokens' && body.max_tokens < 10000) {
    response = await requestAnthropic(key, { ...body, max_tokens:Math.min(body.max_tokens * 2, 10000) })
    data = await readSuccessfulMessage(response)
    return { response, data, text:completeMessageText(data) }
  }

  if (!completeText && !['refusal', 'model_context_window_exceeded'].includes(data.stop_reason)) {
    await wait(500)
    response = await requestAnthropic(key, body)
    data = await readSuccessfulMessage(response)
    return { response, data, text:completeMessageText(data) }
  }

  return { response, data, text:'' }
}

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

    const message = await requestAnthropicMessage(key, body)
    const { response } = message

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      if (response.status === 529) {
        return NextResponse.json(
          {
            error: 'Anthropic is temporarily overloaded. Your screenplay is safe. Wait a minute and try First Read again.',
            code: 'AI_OVERLOADED',
            retryable: true,
          },
          { status: 529 }
        )
      }

      if (transientAIStatuses.has(response.status)) {
        return NextResponse.json(
          {
            error: 'Anchor AI is temporarily unavailable. Your screenplay is safe. Wait a minute and try again.',
            code: 'AI_TEMPORARY_FAILURE',
            retryable: true,
          },
          { status: response.status }
        )
      }

      return NextResponse.json(
        { error: err.error?.message || 'AI request failed' },
        { status: response.status }
      )
    }

    const { data, text } = message
    if (!text) {
      if (data?.stop_reason === 'refusal') {
        return NextResponse.json(
          {
            error: 'The AI provider declined this scan. Your screenplay is safe. Try again or review a smaller section.',
            code: 'AI_REFUSAL',
            retryable: false,
          },
          { status: 422 }
        )
      }

      if (['max_tokens', 'model_context_window_exceeded'].includes(data?.stop_reason)) {
        return NextResponse.json(
          {
            error: 'The AI response was cut off before the review finished. Your screenplay is safe. Try scanning a smaller draft section.',
            code: 'AI_INCOMPLETE_RESPONSE',
            retryable: true,
          },
          { status: 502 }
        )
      }

      return NextResponse.json(
        {
          error: 'Anchor received a blank AI response twice. Your screenplay is safe. Please try again.',
          code: 'AI_EMPTY_RESPONSE',
          retryable: true,
        },
        { status: 502 }
      )
    }

    if (schema) {
      try {
        return NextResponse.json({ result: JSON.parse(text) })
      } catch {
        return NextResponse.json({ error: 'Anchor received an invalid structured response.' }, { status: 502 })
      }
    }

    return NextResponse.json({ result: text })

  } catch (err) {
    return NextResponse.json(
      {
        error: 'Anchor AI could not be reached. Your screenplay is safe. Wait a moment and try again.',
        code: 'AI_CONNECTION_FAILURE',
        retryable: true,
      },
      { status: 503 }
    )
  }
}
