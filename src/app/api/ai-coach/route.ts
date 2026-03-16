import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { message, context } = await req.json()

  const prompt = `You are a friendly, knowledgeable nutritionist and meal planning coach for a couple trying to lose weight. You give SHORT, actionable advice (2-4 sentences max unless they ask for detail).

Context about this user:
${context}

User's question: "${message}"

Be encouraging but honest. Reference their actual data when possible. If they ask about substitutions, give specific options with approximate calories. Keep it conversational.`

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content.map(b => b.type === 'text' ? b.text : '').join('')
    return NextResponse.json({ reply: text })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to get response' }, { status: 500 })
  }
}
