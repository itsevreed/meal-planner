import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { mealInput, mealType, person, remainingCals, targetProtein, dinnerMacros, exactBudget, dislikes, lockedMealsCals, scannedFoods } = await req.json()

  const dislikeWarning = dislikes?.length > 0
    ? `\n\nFOODS TO ABSOLUTELY AVOID — do NOT include any of these: ${dislikes.join(', ')}. If the user mentions a disliked food, suggest a substitute.`
    : ''

  let scannedFoodsRef = ''
  if (scannedFoods?.length > 0) {
    const list = scannedFoods.map((f: any) => `- "${f.name}" (${f.brand}): ${f.cal} cal, ${f.protein}g P, ${f.carbs}g C, ${f.fat}g F per ${f.servingSize}`).join('\n')
    scannedFoodsRef = `\n\nSCANNED FOODS DATABASE — use THESE EXACT values if any ingredient matches:\n${list}`
  }

  let prompt = ''

  if (mealType === 'dinner') {
    prompt = `You are a precise nutritionist. The user is having this for dinner: "${mealInput}"
${dislikeWarning}${scannedFoodsRef}

CRITICAL: Use ONLY the ingredients the user mentioned. Do NOT add extra ingredients, sauces, oils, sides, or garnishes unless explicitly listed.

Calculate realistic macros. Aim for HIGH PROTEIN (40-55g). Target ~550-700 calories.

Respond ONLY with valid JSON, no markdown:
{"name":"Meal name","description":"Brief description","cal":625,"protein":52,"carbs":45,"fat":22,"portions":[{"ingredient":"Sirloin steak","amount":"8 oz","cal":450,"protein":46,"carbs":0,"fat":22}]}`
  } else {
    const isHim = person === 'his'
    const weightNote = isHim ? "He is 5'9\", 215 lbs, target ~1820 cal/day." : "She is 5'7\", 175 lbs, target ~1490 cal/day."

    let mealBudget: number
    if (exactBudget) {
      mealBudget = exactBudget
    } else if (lockedMealsCals > 0) {
      mealBudget = remainingCals - lockedMealsCals
    } else if (mealType === 'snack') {
      mealBudget = Math.round(remainingCals * 0.15)
    } else {
      mealBudget = mealType === 'breakfast' ? Math.round(remainingCals * 0.37) : Math.round(remainingCals * 0.48)
    }
    mealBudget = Math.max(mealBudget, 100)

    prompt = `You are a precise nutritionist helping plan a ${mealType}. ${weightNote}
${dislikeWarning}${scannedFoodsRef}

CRITICAL: Use ONLY the ingredients the user mentioned. Do NOT add extras.

Budget: exactly ~${mealBudget} calories for this ${mealType}. Do NOT exceed.
The meal: "${mealInput}"

Calculate exact portions. Prioritize HIGH PROTEIN. Be specific with amounts.
The sum of portion calories MUST equal the total cal.

Respond ONLY with valid JSON, no markdown:
{"name":"Meal name","description":"Brief description","cal":${mealBudget},"protein":38,"carbs":30,"fat":12,"portions":[{"ingredient":"Ground beef (93%)","amount":"5 oz","cal":195,"protein":30,"carbs":0,"fat":8}]}`
  }

  try {
    const msg = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, messages: [{ role: 'user', content: prompt }] })
    const text = msg.content.map(b => b.type === 'text' ? b.text : '').join('').replace(/```json|```/g, '').trim()
    return NextResponse.json({ meal: JSON.parse(text) })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to calculate meal' }, { status: 500 })
  }
}
