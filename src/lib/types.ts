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
  input: string          // what the user typed
  meal: MacroMeal | null // calculated result
}

export interface DayPlan {
  day: string
  theme: string
  his: {
    breakfast: PersonMeal
    lunch: PersonMeal
  }
  her: {
    breakfast: PersonMeal
    lunch: PersonMeal
  }
  dinner: PersonMeal     // shared, manual input
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

// Meal Ideas types
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
