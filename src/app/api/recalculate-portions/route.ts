import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { portions, editedIndex, newAmount, originalMeal } = await req.json()

  // portions: current PortionItem[]
  // editedIndex: which ingredient was changed
  // newAmount: the new amount string (e.g. "4 oz" instead of "8 oz")
  // originalMeal: { name, cal, protein, carbs, fat }

  const ingredientList = portions.map((p: any, i: number) => {
    if (i === editedIndex) {
      return `${p.ingredient}: ${newAmount} (CHANGED from ${p.amount})`
    }
    return `${p.ingredient}: ${p.amount} (${p.cal} cal, ${p.protein}g protein, ${p.carbs}g carbs, ${p.fat}g fat)`
  }).join('\n')

  const prompt = `You are a precise nutritionist. A user modified an ingredient amount in their meal. Recalculate ALL macros for the changed ingredient based on the new amount.

Original meal: "${originalMeal.name}"

Current ingredients:
${ingredientList}

The ingredient at position ${editedIndex} was changed to "${newAmount}".

Recalculate the macros for ONLY the changed ingredient based on the new amount. Keep all other ingredients exactly the same.

Respond ONLY with valid JSON, no markdown:
{
  "portions": [
    { "ingredient": "Name", "amount": "new amount", "cal": 100, "protein": 10, "carbs": 5, "fat": 3 }
  ],
  "cal": 500,
  "protein": 40,
  "carbs": 30,
  "fat": 15
}

The totals (cal, protein, carbs, fat) must equal the sum of all portions. Return ALL portions, not just the changed one.`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .map((b) => (b.type === 'text' ? b.text : ''))
      .join('')
      .replace(/```json|```/g, '')
      .trim()

    const result = JSON.parse(text)
    return NextResponse.json({ result })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to recalculate' }, { status: 500 })
  }
}
