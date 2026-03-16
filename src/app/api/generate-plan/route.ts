import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { preferences, dislikes } = await req.json()

  const hisDislikes = dislikes.his.join(', ') || 'none'
  const herDislikes = dislikes.her.join(', ') || 'none'

  const prompt = `You are a dietitian meal planner. Generate a 7-day meal plan for a couple with these specs:

HIM: 5'9", 215 lbs. Daily calorie target: ~1,820 cal. Breakfast ~350 cal, Lunch ~450 cal.
HER: 5'7", 175 lbs. Daily calorie target: ~1,490 cal. Breakfast ~280 cal, Lunch ~360 cal.
SHARED DINNER each day: ~600 cal (same meal for both).

Day themes:
- Monday: Breakfast-themed (savory breakfast foods, eggs, etc.)
- Tuesday: Taco/Mexican
- Wednesday: Asian cuisine
- Thursday: Steak & potato focus
- Friday: Salmon/seafood
- Saturday: Any
- Sunday: Any

His food dislikes (avoid): ${hisDislikes}
Her food dislikes (avoid): ${herDislikes}
${preferences.proteins ? 'Preferred proteins/ingredients on hand: ' + preferences.proteins : ''}
${preferences.cuisines ? 'Cuisine preferences: ' + preferences.cuisines : ''}
${preferences.notes ? 'Other notes: ' + preferences.notes : ''}

Respond ONLY with valid JSON, no markdown, no preamble. Format:
{
  "days": [
    {
      "day": "Monday",
      "theme": "Breakfast theme",
      "his": {
        "breakfast": { "name": "...", "cal": 350, "protein": 28, "carbs": 35, "fat": 10 },
        "lunch": { "name": "...", "cal": 450, "protein": 35, "carbs": 45, "fat": 14 }
      },
      "her": {
        "breakfast": { "name": "...", "cal": 280, "protein": 22, "carbs": 28, "fat": 8 },
        "lunch": { "name": "...", "cal": 360, "protein": 28, "carbs": 36, "fat": 11 }
      },
      "dinner": { "name": "...", "cal": 600, "protein": 45, "carbs": 55, "fat": 20 }
    }
  ]
}
Include all 7 days. Meal names should be descriptive. Macros in grams.`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .replace(/```json|```/g, '')
      .trim()

    const plan = JSON.parse(text)
    return NextResponse.json({ plan })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to generate plan' }, { status: 500 })
  }
}
