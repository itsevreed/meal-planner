export interface MacroMeal {
  name: string
  cal: number
  protein: number
  carbs: number
  fat: number
}

export interface DayPlan {
  day: string
  theme: string
  his: { breakfast: MacroMeal; lunch: MacroMeal }
  her: { breakfast: MacroMeal; lunch: MacroMeal }
  dinner: MacroMeal
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
