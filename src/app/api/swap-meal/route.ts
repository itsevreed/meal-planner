import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { day, who, mealType, currentMeal, dislikes } = await req.json()

  const hisDislikes = dislikes.his.join(', ') || 'none'
  const herDislikes = dislikes.her.join(', ') || 'none'

  let prompt: string

  if (who === 'shared') {
    prompt = `Suggest ONE different shared dinner for ${day.day} (${day.theme} theme). Target ~600 cal. Must avoid his dislikes: ${hisDislikes} and her dislikes: ${herDislikes}. Current dinner was: "${currentMeal}". Respond ONLY with JSON: {"name":"...","cal":600,"protein":45,"carbs":55,"fat":20}`
  } else {
    const calTarget =
      who === 'his'
        ? mealType === 'breakfast' ? 350 : 450
        : mealType === 'breakfast' ? 280 : 360
    const avoidList = who === 'his' ? hisDislikes : herDislikes
    prompt = `Suggest ONE different ${mealType} for ${who === 'his' ? 'him' : 'her'} on ${day.day} (${day.theme} theme). Target ~${calTarget} cal. Must avoid: ${avoidList}. Current meal was: "${currentMeal}". Respond ONLY with JSON: {"name":"...","cal":${calTarget},"protein":30,"carbs":40,"fat":12}`
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .replace(/```json|```/g, '')
      .trim()

    const meal = JSON.parse(text)
    return NextResponse.json({ meal })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to swap meal' }, { status: 500 })
  }
}
