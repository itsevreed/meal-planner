import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { mealInput, mealType, person, remainingCals, targetProtein, dinnerMacros } = await req.json()

  // person: 'his' | 'her' | 'shared'
  // mealType: 'breakfast' | 'lunch' | 'dinner'
  // remainingCals: calories left after dinner for this person
  // targetProtein: daily protein target in grams
  // dinnerMacros: { cal, protein } for context
  // mealInput: free text description of the meal

  let prompt = ''

  if (mealType === 'dinner') {
    prompt = `You are a precise nutritionist. The user is having this for dinner: "${mealInput}"

Calculate realistic macros for a satisfying dinner portion of this meal. 
Aim for HIGH PROTEIN — at least 40-55g protein for a shared dinner.
Target roughly 550-700 calories total.

Respond ONLY with valid JSON, no markdown:
{
  "name": "Meal name",
  "description": "Brief description",
  "cal": 625,
  "protein": 52,
  "carbs": 45,
  "fat": 22,
  "portions": [
    { "ingredient": "Sirloin steak", "amount": "8 oz", "cal": 450, "protein": 46, "carbs": 0, "fat": 22 },
    { "ingredient": "Baked potato", "amount": "1 medium (6oz)", "cal": 160, "protein": 4, "carbs": 37, "fat": 0 }
  ]
}`
  } else {
    const calTarget = remainingCals
    const isHim = person === 'his'
    const weightNote = isHim ? "He is 5'9\", 215 lbs, target ~1820 cal/day." : "She is 5'7\", 175 lbs, target ~1490 cal/day."

    prompt = `You are a precise nutritionist helping plan a ${mealType} meal. ${weightNote}

After dinner (${dinnerMacros?.cal || 0} cal, ${dinnerMacros?.protein || 0}g protein), this person has ~${calTarget} calories remaining for ${mealType === 'breakfast' ? 'breakfast and lunch combined — allocate appropriately for ' + mealType : mealType}.

The meal they want: "${mealInput}"

Calculate exact portions of each ingredient so the total hits close to the calorie target for this meal. Prioritize HIGH PROTEIN — maximize protein within the calorie budget. Be specific with amounts (e.g. "6 oz", "1 cup", "2 large eggs").

Respond ONLY with valid JSON, no markdown:
{
  "name": "Meal name",
  "description": "Brief description with key amounts",
  "cal": ${mealType === 'breakfast' ? Math.round(calTarget * 0.42) : Math.round(calTarget * 0.58)},
  "protein": 38,
  "carbs": 30,
  "fat": 12,
  "portions": [
    { "ingredient": "Ground beef (93% lean)", "amount": "5 oz", "cal": 195, "protein": 30, "carbs": 0, "fat": 8 },
    { "ingredient": "Romaine lettuce", "amount": "2 cups", "cal": 16, "protein": 1, "carbs": 3, "fat": 0 }
  ]
}`
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
    return NextResponse.json({ error: 'Failed to calculate meal' }, { status: 500 })
  }
}
