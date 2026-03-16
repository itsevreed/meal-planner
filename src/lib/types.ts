export interface MacroMeal {
  name: string
  description?: string
  cal: number
  protein: number
  carbs: number
  fat: number
  portions?: PortionItem[]
}

export interface PortionItem {
  ingredient: string
  amount: string
  cal: number
  protein: number
  carbs: number
  fat: number
}

export interface PersonMeal {
  input: string
  meal: MacroMeal | null
  eaten?: boolean
}

export interface DayPlan {
  day: string
  theme: string
  his: { breakfast: PersonMeal; lunch: PersonMeal; snack: PersonMeal }
  her: { breakfast: PersonMeal; lunch: PersonMeal; snack: PersonMeal }
  dinner: PersonMeal
}

export interface MealPlan {
  days: DayPlan[]
  weekId?: string // "2026-W12" format
}

export interface Dislikes {
  his: string[]
  her: string[]
}

export interface GroceryItem {
  name: string
  amount: string
  category: string
}

export interface MealIdea {
  name: string
  description: string
  cal: number
  protein: number
  carbs: number
  fat: number
  portions: PortionItem[]
}

export interface PresetMeal {
  id: string
  name: string
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  who: 'his' | 'her' | 'shared'
  cal: number
  protein: number
  carbs: number
  fat: number
  portions: PortionItem[]
  createdAt: string
}

export interface WeightEntry {
  id: string
  person: 'his' | 'her'
  weight: number
  date: string
  createdAt: string
}

export interface ScannedFood {
  id: string
  barcode: string
  name: string
  brand: string
  servingSize: string
  cal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
  sugar: number
  imageUrl: string
  createdAt: string
}

export interface WaterEntry {
  id: string
  person: 'his' | 'her'
  glasses: number
  date: string
}

export interface LockedMeal {
  id: string
  week_id: string
  day_index: number
  person: string
  meal_type: string
}
