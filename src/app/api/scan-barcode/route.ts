import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { barcode } = await req.json()

  if (!barcode || typeof barcode !== 'string') {
    return NextResponse.json({ error: 'Barcode is required' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,serving_size,nutriments,image_front_small_url,quantity`,
      { headers: { 'User-Agent': 'MealPlanner/1.0 (meal-planner-app)' } }
    )
    const data = await res.json()

    if (data.status === 0 || !data.product) {
      return NextResponse.json({ error: 'Product not found. Try a different barcode.' }, { status: 404 })
    }

    const p = data.product
    const n = p.nutriments || {}

    // Extract per-serving if available, otherwise per-100g
    const hasServing = n['energy-kcal_serving'] !== undefined
    const suffix = hasServing ? '_serving' : '_100g'

    const food = {
      barcode,
      name: p.product_name || 'Unknown product',
      brand: p.brands || '',
      servingSize: p.serving_size || (hasServing ? '1 serving' : '100g'),
      quantity: p.quantity || '',
      imageUrl: p.image_front_small_url || '',
      cal: Math.round(n[`energy-kcal${suffix}`] || n[`energy${suffix}`] / 4.184 || 0),
      protein: Math.round((n[`proteins${suffix}`] || 0) * 10) / 10,
      carbs: Math.round((n[`carbohydrates${suffix}`] || 0) * 10) / 10,
      fat: Math.round((n[`fat${suffix}`] || 0) * 10) / 10,
      fiber: Math.round((n[`fiber${suffix}`] || 0) * 10) / 10,
      sugar: Math.round((n[`sugars${suffix}`] || 0) * 10) / 10,
      sodium: Math.round((n[`sodium${suffix}`] || 0) * 1000) / 10, // convert to mg
      per: hasServing ? 'serving' : '100g',
    }

    return NextResponse.json({ food })
  } catch (e) {
    console.error('Barcode scan error:', e)
    return NextResponse.json({ error: 'Failed to look up barcode' }, { status: 500 })
  }
}
