import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { who, dislikes, calBudget, proteinTarget } = await req.json()

  // who: 'his' | 'her'
  // dislikes: string[] for this person
  // calBudget: { breakfast: number, lunch: number, dinner: number }
  // proteinTarget: number (daily grams)

  const dislikeList = dislikes.length > 0 ? dislikes.join(', ') : 'none'

  const prompt = `You are a creative nutritionist. Generate meal ideas for ONE person for ONE day.

STRICT CONSTRAINTS — every meal MUST obey these limits:
- Breakfast: MAXIMUM ${calBudget.breakfast} calories
- Lunch: MAXIMUM ${calBudget.lunch} calories  
- Dinner: MAXIMUM ${calBudget.dinner} calories
- Daily protein target: ${proteinTarget}g — distribute across meals

Foods to EXCLUDE (person dislikes): ${dislikeList}

For each meal type, generate exactly 3 different ideas. Each idea must include:
- A descriptive name
- A brief 1-sentence description
- Exact calorie and macro counts (that DO NOT exceed the limits above)
- A detailed ingredient list with amounts, calories, and protein per ingredient
- The sum of ingredient calories MUST equal the meal's total calories
- The sum of ingredient protein MUST equal the meal's total protein

Prioritize HIGH PROTEIN meals. Be creative — vary cuisines and styles.

Respond ONLY with valid JSON, no markdown:
{
  "breakfast": [
    {
      "name": "Meal name",
      "description": "Brief description",
      "cal": ${calBudget.breakfast},
      "protein": 35,
      "carbs": 30,
      "fat": 12,
      "portions": [
        { "ingredient": "Egg whites", "amount": "6 large", "cal": 102, "protein": 22, "carbs": 2, "fat": 0 }
      ]
    }
  ],
  "lunch": [ ... 3 ideas ... ],
  "dinner": [ ... 3 ideas ... ]
}`

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

    const ideas = JSON.parse(text)
    return NextResponse.json({ ideas })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to generate meal ideas' }, { status: 500 })
  }
}
