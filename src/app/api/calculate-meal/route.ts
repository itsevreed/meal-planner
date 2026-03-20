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

COOKED vs RAW — THIS IS IMPORTANT:
- If the user says "cooked" (e.g. "cooked chicken breast", "cooked rice", "cooked ground beef"), use COOKED weight nutrition values. Cooked meat has ~30-40% more protein per weight than raw due to water loss. Cooked rice has ~1/3 the calories per weight of dry rice.
- If the user does NOT specify cooked/raw, ASSUME COOKED weights since people typically weigh food as they eat it.
- Always label portions clearly as "cooked" or "raw" in the amount field so the user knows which to measure.
- Common cooked values per oz: chicken breast ~8.8g protein/46 cal, ground beef 93% ~7.5g protein/54 cal, salmon ~6.3g protein/52 cal, rice ~0.7g protein/36 cal.

Calculate realistic macros. Aim for HIGH PROTEIN (40-55g). Target ~550-700 calories.

Respond ONLY with valid JSON, no markdown:
{"name":"Meal name","description":"Brief description","cal":625,"protein":52,"carbs":45,"fat":22,"portions":[{"ingredient":"Chicken breast","amount":"8 oz cooked","cal":368,"protein":70,"carbs":0,"fat":8}]}`
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

COOKED vs RAW — THIS IS IMPORTANT:
- If the user says "cooked" (e.g. "cooked chicken", "cooked rice"), use COOKED weight nutrition values.
- If the user does NOT specify, ASSUME COOKED weights since people typically weigh food as served.
- Always label amounts clearly as "cooked" or "raw" so the user knows which to measure.
- Cooked meat has more protein per oz than raw (water loss concentrates protein). Cooked grains have fewer cal per oz than dry.

Budget: exactly ~${mealBudget} calories for this ${mealType}. Do NOT exceed.
The meal: "${mealInput}"

Calculate exact portions. Prioritize HIGH PROTEIN. Be specific with amounts.
The sum of portion calories MUST equal the total cal.

Respond ONLY with valid JSON, no markdown:
{"name":"Meal name","description":"Brief description","cal":${mealBudget},"protein":38,"carbs":30,"fat":12,"portions":[{"ingredient":"Ground beef (93%)","amount":"5 oz cooked","cal":270,"protein":37,"carbs":0,"fat":13}]}`
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
