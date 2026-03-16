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
}

export interface DayPlan {
  day: string
  theme: string
  his: {
    breakfast: PersonMeal
    lunch: PersonMeal
    snack: PersonMeal
  }
  her: {
    breakfast: PersonMeal
    lunch: PersonMeal
    snack: PersonMeal
  }
  dinner: PersonMeal
}

export interface MealPlan {
  days: DayPlan[]
}

export interface Preferences {
  proteins: string
  cuisines: string
  notes: string
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

export interface MealIdeasResponse {
  breakfast: MealIdea[]
  lunch: MealIdea[]
  dinner: MealIdea[]
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
