import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { plan } = await req.json()

  // Build a summary of all meals
  const mealSummary: string[] = []
  for (const day of plan.days) {
    mealSummary.push(`${day.day}:`)
    if (day.dinner?.meal?.portions?.length) {
      mealSummary.push(`  Dinner: ${day.dinner.meal.portions.map((p: any) => `${p.ingredient} (${p.amount})`).join(', ')}`)
    } else if (day.dinner?.meal?.name) {
      mealSummary.push(`  Dinner: ${day.dinner.meal.name}`)
    }
    if (day.his?.breakfast?.meal?.portions?.length) {
      mealSummary.push(`  His breakfast: ${day.his.breakfast.meal.portions.map((p: any) => `${p.ingredient} (${p.amount})`).join(', ')}`)
    }
    if (day.his?.lunch?.meal?.portions?.length) {
      mealSummary.push(`  His lunch: ${day.his.lunch.meal.portions.map((p: any) => `${p.ingredient} (${p.amount})`).join(', ')}`)
    }
    if (day.her?.breakfast?.meal?.portions?.length) {
      mealSummary.push(`  Her breakfast: ${day.her.breakfast.meal.portions.map((p: any) => `${p.ingredient} (${p.amount})`).join(', ')}`)
    }
    if (day.her?.lunch?.meal?.portions?.length) {
      mealSummary.push(`  Her lunch: ${day.her.lunch.meal.portions.map((p: any) => `${p.ingredient} (${p.amount})`).join(', ')}`)
    }
  }

  const prompt = `You are a smart grocery list generator. Based on this week's meal plan for two people, create a consolidated grocery list. Combine duplicate ingredients, scale quantities for the full week, and group by category.

Meal plan:
${mealSummary.join('\n')}

Rules:
- Combine the same ingredient across days (e.g. if chicken appears 3 times, total it up)
- Scale to realistic purchase quantities (e.g. "2 lbs ground beef", "1 dozen eggs")
- Group into these categories: Proteins, Produce, Dairy & Eggs, Pantry & Dry Goods, Condiments & Sauces, Other
- Keep amounts practical for grocery shopping

Respond ONLY with valid JSON, no markdown:
{
  "items": [
    { "name": "Ground beef (93% lean)", "amount": "3 lbs", "category": "Proteins" },
    { "name": "Chicken breast", "amount": "2 lbs", "category": "Proteins" },
    { "name": "Romaine lettuce", "amount": "2 heads", "category": "Produce" }
  ]
}`

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
    return NextResponse.json(result)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to generate grocery list' }, { status: 500 })
  }
}
