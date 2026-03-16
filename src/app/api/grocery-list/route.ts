import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { plan } = await req.json()

  const summary: string[] = []
  for (const day of plan.days) {
    summary.push(`${day.day}:`)
    const addMeal = (label: string, m: any) => {
      if (m?.meal?.portions?.length) {
        summary.push(`  ${label}: ${m.meal.portions.map((p: any) => `${p.ingredient} (${p.amount})`).join(', ')}`)
      } else if (m?.meal?.name) {
        summary.push(`  ${label}: ${m.meal.name}`)
      }
    }
    addMeal('Dinner', day.dinner)
    addMeal('His breakfast', day.his?.breakfast)
    addMeal('His lunch', day.his?.lunch)
    addMeal('His snack', day.his?.snack)
    addMeal('Her breakfast', day.her?.breakfast)
    addMeal('Her lunch', day.her?.lunch)
    addMeal('Her snack', day.her?.snack)
  }

  const prompt = `You are a grocery list generator. Based on this week's meal plan for two people, create a consolidated grocery list. Combine duplicates, scale quantities, group by category.

Meal plan:
${summary.join('\n')}

Rules:
- Combine same ingredients across days
- Scale to realistic purchase quantities
- Group: Proteins, Produce, Dairy & Eggs, Pantry & Dry Goods, Condiments & Sauces, Other

Respond ONLY with valid JSON, no markdown:
{"items":[{"name":"Ground beef (93%)","amount":"3 lbs","category":"Proteins"}]}`

  try {
    const msg = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] })
    const text = msg.content.map(b => b.type === 'text' ? b.text : '').join('').replace(/```json|```/g, '').trim()
    return NextResponse.json(JSON.parse(text))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to generate grocery list' }, { status: 500 })
  }
}
