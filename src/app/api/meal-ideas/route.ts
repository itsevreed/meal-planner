import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { who, dislikes, calBudget, proteinTarget } = await req.json()
  const dislikeList = dislikes?.length > 0 ? dislikes.join(', ') : 'none'

  const prompt = `You are a creative nutritionist. Generate meal ideas for ONE person for ONE day.

STRICT CONSTRAINTS:
- Breakfast: MAX ${calBudget.breakfast} cal
- Lunch: MAX ${calBudget.lunch} cal
- Dinner: MAX ${calBudget.dinner} cal
- Snack: MAX ${calBudget.snack} cal
- Daily protein target: ${proteinTarget}g

Foods to EXCLUDE: ${dislikeList}

Generate exactly 3 ideas per meal type (breakfast, lunch, dinner, snack). Each must include name, description, exact macros, and ingredient list with amounts. Prioritize HIGH PROTEIN.

Respond ONLY with valid JSON, no markdown:
{"breakfast":[{"name":"...","description":"...","cal":${calBudget.breakfast},"protein":35,"carbs":30,"fat":12,"portions":[{"ingredient":"Egg whites","amount":"6 large","cal":102,"protein":22,"carbs":2,"fat":0}]}],"lunch":[...],"dinner":[...],"snack":[...]}`

  try {
    const msg = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 5000, messages: [{ role: 'user', content: prompt }] })
    const text = msg.content.map(b => b.type === 'text' ? b.text : '').join('').replace(/```json|```/g, '').trim()
    return NextResponse.json({ ideas: JSON.parse(text) })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to generate ideas' }, { status: 500 })
  }
}
