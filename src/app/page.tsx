'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { MealPlan, DayPlan, PersonMeal, MacroMeal, PortionItem, Dislikes, GroceryItem, MealIdea, PresetMeal, WeightEntry } from '@/lib/types'
import styles from './page.module.css'

const DAYS_META = [
  { name: 'Monday',    theme: 'Breakfast theme' },
  { name: 'Tuesday',   theme: 'Taco Tuesday' },
  { name: 'Wednesday', theme: 'Asian Wednesday' },
  { name: 'Thursday',  theme: 'Steak & Potato' },
  { name: 'Friday',    theme: 'Salmon Friday' },
  { name: 'Saturday',  theme: 'Open choice' },
  { name: 'Sunday',    theme: 'Open choice' },
]

const HIM = { label: 'Him', calTarget: 1820, proteinTarget: 160, breakfastCal: 420, lunchCal: 550 }
const HER = { label: 'Her', calTarget: 1490, proteinTarget: 130, breakfastCal: 330, lunchCal: 440 }

function emptyPersonMeal(): PersonMeal { return { input: '', meal: null } }

function emptyDay(meta: typeof DAYS_META[0]): DayPlan {
  return {
    day: meta.name, theme: meta.theme,
    his: { breakfast: emptyPersonMeal(), lunch: emptyPersonMeal() },
    her: { breakfast: emptyPersonMeal(), lunch: emptyPersonMeal() },
    dinner: emptyPersonMeal(),
  }
}

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

type Tab = 'plan' | 'ideas' | 'presets' | 'dislikes' | 'grocery' | 'weight'

export default function Home() {
  const [tab, setTab] = useState<Tab>('plan')
  const [plan, setPlan] = useState<MealPlan>(() => ({ days: DAYS_META.map(emptyDay) }))
  const [dislikes, setDislikes] = useState<Dislikes>({ his: [], her: [] })
  const [hisInput, setHisInput] = useState('')
  const [herInput, setHerInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState<string | null>(null)
  const [grocery, setGrocery] = useState<GroceryItem[] | null>(null)
  const [groceryLoading, setGroceryLoading] = useState(false)
  const [expandedDay, setExpandedDay] = useState<number>(0)

  // Meal ideas
  const [ideasWho, setIdeasWho] = useState<'his' | 'her'>('his')
  const [ideas, setIdeas] = useState<{ breakfast: MealIdea[], lunch: MealIdea[], dinner: MealIdea[] } | null>(null)
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [selectedIdeas, setSelectedIdeas] = useState<{ breakfast: number | null, lunch: number | null, dinner: number | null }>({ breakfast: null, lunch: null, dinner: null })

  // Presets
  const [presets, setPresets] = useState<PresetMeal[]>([])
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null)

  // Weight tracking
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([])
  const [weightWho, setWeightWho] = useState<'his' | 'her'>('his')
  const [weightInput, setWeightInput] = useState('')
  const [weightDate, setWeightDate] = useState(() => new Date().toISOString().split('T')[0])

  // Dialog for B/L input
  const [mealDialog, setMealDialog] = useState<{
    open: boolean
    di: number
    who: 'his' | 'her'
    breakfastInput: string
    lunchInput: string
  } | null>(null)

  // Preset picker
  const [presetPicker, setPresetPicker] = useState<{
    open: boolean
    di: number
    who: 'his' | 'her' | 'shared'
    mealType: 'breakfast' | 'lunch' | 'dinner'
  } | null>(null)

  const sanitizePlan = (raw: any): MealPlan => {
    const safeMeal = (m: any): PersonMeal => ({
      input: typeof m?.input === 'string' ? m.input : '',
      meal: m?.meal ?? null,
    })
    const days = DAYS_META.map((meta, i) => {
      const d = raw?.days?.[i] ?? {}
      return {
        day: meta.name, theme: meta.theme,
        his: { breakfast: safeMeal(d?.his?.breakfast), lunch: safeMeal(d?.his?.lunch) },
        her: { breakfast: safeMeal(d?.her?.breakfast), lunch: safeMeal(d?.her?.lunch) },
        dinner: safeMeal(d?.dinner),
      }
    })
    return { days }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: dislikesData } = await supabase.from('dislikes').select('*')
      if (dislikesData) {
        setDislikes({
          his: dislikesData.filter(d => d.person === 'his').map(d => d.item),
          her: dislikesData.filter(d => d.person === 'her').map(d => d.item),
        })
      }
      const { data: planData } = await supabase
        .from('meal_plan').select('*').order('created_at', { ascending: false }).limit(1).single()
      if (planData?.plan) setPlan(sanitizePlan(planData.plan))

      // Load presets
      const { data: presetData } = await supabase.from('preset_meals').select('*').order('created_at', { ascending: false })
      if (presetData) setPresets(presetData.map((p: any) => ({
        id: p.id, name: p.name, mealType: p.meal_type, who: p.who,
        cal: p.cal, protein: p.protein, carbs: p.carbs, fat: p.fat,
        portions: p.portions || [], createdAt: p.created_at,
      })))

      // Load weight entries
      const { data: weightData } = await supabase.from('weight_entries').select('*').order('date', { ascending: true })
      if (weightData) setWeightEntries(weightData.map((w: any) => ({
        id: w.id, person: w.person, weight: w.weight, date: w.date, createdAt: w.created_at,
      })))
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const savePlan = async (newPlan: MealPlan) => {
    try {
      await supabase.from('meal_plan').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('meal_plan').insert({ plan: newPlan })
    } catch {}
  }

  const updateDay = (di: number, updater: (day: DayPlan) => DayPlan) => {
    setPlan(prev => {
      const days = [...prev.days]
      days[di] = updater(days[di])
      const next = { days }
      savePlan(next)
      return next
    })
  }

  // ── Calculate single meal ──
  const calculateMeal = async (
    di: number, who: 'his' | 'her' | 'shared',
    mealType: 'breakfast' | 'lunch' | 'dinner', input: string
  ) => {
    if (!input.trim()) return
    const key = `${di}-${who}-${mealType}`
    setCalculating(key)

    const day = plan.days[di]
    const dinnerMacros = day.dinner.meal
    const profile = who === 'his' ? HIM : HER
    const dinnerCal = dinnerMacros?.cal || 0
    const remainingCals = profile.calTarget - dinnerCal

    try {
      const res = await fetch('/api/calculate-meal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealInput: input, mealType,
          person: who === 'shared' ? 'shared' : who,
          remainingCals, targetProtein: profile.proteinTarget, dinnerMacros
        }),
      })
      const { meal } = await res.json()
      updateDay(di, (d) => {
        if (mealType === 'dinner') return { ...d, dinner: { input, meal } }
        return { ...d, [who]: { ...(d as any)[who], [mealType]: { input, meal } } }
      })
    } catch { alert('Failed to calculate. Please try again.') }
    setCalculating(null)
  }

  // ── Calculate breakfast + lunch together from dialog ──
  const calculateBothMeals = async (di: number, who: 'his' | 'her', breakfastInput: string, lunchInput: string) => {
    if (!breakfastInput.trim() || !lunchInput.trim()) {
      alert('Please enter both breakfast and lunch.')
      return
    }

    const keyB = `${di}-${who}-breakfast`
    const keyL = `${di}-${who}-lunch`
    setCalculating(keyB)

    const day = plan.days[di]
    const profile = who === 'his' ? HIM : HER
    const dinnerCal = day.dinner.meal?.cal || 0
    const dinnerProtein = day.dinner.meal?.protein || 0
    const remainingCals = profile.calTarget - dinnerCal
    const remainingProtein = profile.proteinTarget - dinnerProtein

    // Calculate breakfast first (42% of remaining)
    try {
      const bRes = await fetch('/api/calculate-meal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealInput: breakfastInput, mealType: 'breakfast',
          person: who, remainingCals, targetProtein: profile.proteinTarget,
          dinnerMacros: day.dinner.meal
        }),
      })
      const { meal: breakfastMeal } = await bRes.json()

      setCalculating(keyL)
      // Calculate lunch with exact remaining budget after breakfast
      const lunchBudget = remainingCals - (breakfastMeal?.cal || 0)
      const lunchProteinTarget = remainingProtein - (breakfastMeal?.protein || 0)

      const lRes = await fetch('/api/calculate-meal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealInput: lunchInput, mealType: 'lunch',
          person: who,
          remainingCals: lunchBudget + (breakfastMeal?.cal || 0), // send total remaining so API splits correctly
          targetProtein: profile.proteinTarget,
          dinnerMacros: day.dinner.meal,
          exactLunchBudget: lunchBudget, // extra hint
        }),
      })
      const { meal: lunchMeal } = await lRes.json()

      updateDay(di, (d) => ({
        ...d,
        [who]: {
          breakfast: { input: breakfastInput, meal: breakfastMeal },
          lunch: { input: lunchInput, meal: lunchMeal },
        },
      }))
    } catch { alert('Failed to calculate meals.') }
    setCalculating(null)
    setMealDialog(null)
  }

  // ── Recalculate portions via API when user edits an ingredient ──
  const recalculatePortions = async (
    di: number, who: 'his' | 'her' | 'shared',
    mealType: 'breakfast' | 'lunch' | 'dinner',
    portionIndex: number, newAmount: string
  ) => {
    const day = plan.days[di]
    const pm: PersonMeal = mealType === 'dinner' ? day.dinner : (day as any)[who][mealType]
    if (!pm.meal?.portions) return

    try {
      const res = await fetch('/api/recalculate-portions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portions: pm.meal.portions,
          editedIndex: portionIndex,
          newAmount,
          originalMeal: { name: pm.meal.name, cal: pm.meal.cal, protein: pm.meal.protein, carbs: pm.meal.carbs, fat: pm.meal.fat },
        }),
      })
      const { result } = await res.json()
      if (!result) return

      updateDay(di, (d) => {
        const newMeal = {
          ...pm.meal!,
          portions: result.portions,
          cal: result.cal,
          protein: result.protein,
          carbs: result.carbs,
          fat: result.fat,
        }
        if (mealType === 'dinner') return { ...d, dinner: { ...d.dinner, meal: newMeal } }
        return { ...d, [who]: { ...(d as any)[who], [mealType]: { ...(d as any)[who][mealType], meal: newMeal } } }
      })
    } catch { /* silently fail, user can re-edit */ }
  }

  // ── Delete ingredient ──
  const deleteIngredient = (
    di: number, who: 'his' | 'her' | 'shared',
    mealType: 'breakfast' | 'lunch' | 'dinner', portionIndex: number
  ) => {
    updateDay(di, (d) => {
      const pm: PersonMeal = mealType === 'dinner' ? d.dinner : (d as any)[who][mealType]
      if (!pm.meal?.portions) return d
      const newPortions = pm.meal.portions.filter((_, i) => i !== portionIndex)
      const totals = newPortions.reduce((acc, p) => ({
        cal: acc.cal + p.cal, protein: acc.protein + p.protein,
        carbs: acc.carbs + p.carbs, fat: acc.fat + p.fat,
      }), { cal: 0, protein: 0, carbs: 0, fat: 0 })
      const newMeal = { ...pm.meal, portions: newPortions, ...totals }
      if (mealType === 'dinner') return { ...d, dinner: { ...d.dinner, meal: newMeal } }
      return { ...d, [who]: { ...(d as any)[who], [mealType]: { ...(d as any)[who][mealType], meal: newMeal } } }
    })
  }

  // ── Grocery ──
  const generateGrocery = async () => {
    setGroceryLoading(true); setTab('grocery')
    try {
      const res = await fetch('/api/grocery-list', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const { items } = await res.json()
      setGrocery(items)
    } catch { alert('Failed to generate grocery list.') }
    setGroceryLoading(false)
  }

  // ── Meal ideas ──
  const generateIdeas = async () => {
    setIdeasLoading(true); setSelectedIdeas({ breakfast: null, lunch: null, dinner: null }); setIdeas(null)
    const profile = ideasWho === 'his' ? HIM : HER
    const dinnerCal = Math.round(profile.calTarget * 0.33)
    const breakfastCal = Math.round((profile.calTarget - dinnerCal) * 0.42)
    const lunchCal = profile.calTarget - dinnerCal - breakfastCal
    try {
      const res = await fetch('/api/meal-ideas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          who: ideasWho, dislikes: dislikes[ideasWho],
          calBudget: { breakfast: breakfastCal, lunch: lunchCal, dinner: dinnerCal },
          proteinTarget: profile.proteinTarget,
        }),
      })
      const { ideas: newIdeas } = await res.json()
      setIdeas(newIdeas)
    } catch { alert('Failed to generate meal ideas.') }
    setIdeasLoading(false)
  }

  // ── Dislikes ──
  const addDislike = async (who: 'his' | 'her', item: string) => {
    const trimmed = item.trim().toLowerCase()
    if (!trimmed || dislikes[who].includes(trimmed)) return
    await supabase.from('dislikes').insert({ person: who, item: trimmed })
    setDislikes(prev => ({ ...prev, [who]: [...prev[who], trimmed] }))
  }
  const removeDislike = async (who: 'his' | 'her', item: string) => {
    await supabase.from('dislikes').delete().eq('person', who).eq('item', item)
    setDislikes(prev => ({ ...prev, [who]: prev[who].filter(x => x !== item) }))
  }

  // ── Presets ──
  const saveAsPreset = async (meal: MacroMeal, mealType: 'breakfast' | 'lunch' | 'dinner', who: 'his' | 'her' | 'shared') => {
    const preset: any = {
      name: meal.name, meal_type: mealType, who,
      cal: meal.cal, protein: meal.protein, carbs: meal.carbs, fat: meal.fat,
      portions: meal.portions || [],
    }
    const { data } = await supabase.from('preset_meals').insert(preset).select().single()
    if (data) {
      setPresets(prev => [{
        id: data.id, name: data.name, mealType: data.meal_type, who: data.who,
        cal: data.cal, protein: data.protein, carbs: data.carbs, fat: data.fat,
        portions: data.portions || [], createdAt: data.created_at,
      }, ...prev])
    }
  }

  const deletePreset = async (id: string) => {
    await supabase.from('preset_meals').delete().eq('id', id)
    setPresets(prev => prev.filter(p => p.id !== id))
  }

  const applyPreset = (preset: PresetMeal, di: number, who: 'his' | 'her' | 'shared', mealType: 'breakfast' | 'lunch' | 'dinner') => {
    const meal: MacroMeal = {
      name: preset.name, cal: preset.cal, protein: preset.protein,
      carbs: preset.carbs, fat: preset.fat, portions: preset.portions,
    }
    updateDay(di, (d) => {
      if (mealType === 'dinner') return { ...d, dinner: { input: preset.name, meal } }
      return { ...d, [who]: { ...(d as any)[who], [mealType]: { input: preset.name, meal } } }
    })
    setPresetPicker(null)
  }

  // ── Weight tracking ──
  const addWeightEntry = async () => {
    const w = parseFloat(weightInput)
    if (isNaN(w) || w < 50 || w > 500) { alert('Enter a valid weight.'); return }
    const { data } = await supabase.from('weight_entries').insert({
      person: weightWho, weight: w, date: weightDate,
    }).select().single()
    if (data) {
      setWeightEntries(prev => [...prev, {
        id: data.id, person: data.person, weight: data.weight, date: data.date, createdAt: data.created_at,
      }].sort((a, b) => a.date.localeCompare(b.date)))
      setWeightInput('')
    }
  }

  const deleteWeightEntry = async (id: string) => {
    await supabase.from('weight_entries').delete().eq('id', id)
    setWeightEntries(prev => prev.filter(w => w.id !== id))
  }

  // ── Computed ──
  const getDayTotals = (day: DayPlan, who: 'his' | 'her') => {
    const meals = [day[who].breakfast.meal, day[who].lunch.meal, day.dinner.meal]
    return meals.reduce((acc, m) => ({
      cal: acc.cal + (m?.cal || 0), protein: acc.protein + (m?.protein || 0),
      carbs: acc.carbs + (m?.carbs || 0), fat: acc.fat + (m?.fat || 0),
    }), { cal: 0, protein: 0, carbs: 0, fat: 0 })
  }

  const getWeeklyProgress = (who: 'his' | 'her') => {
    const profile = who === 'his' ? HIM : HER
    let totalDays = 0, onTrackDays = 0
    plan.days.forEach(day => {
      const totals = getDayTotals(day, who)
      if (totals.cal > 0) { totalDays++; if (totals.cal <= profile.calTarget + 50) onTrackDays++ }
    })
    return { totalDays, onTrackDays }
  }

  const getWeightStats = (who: 'his' | 'her') => {
    const entries = weightEntries.filter(e => e.person === who).sort((a, b) => a.date.localeCompare(b.date))
    if (entries.length === 0) return null
    const latest = entries[entries.length - 1]
    const first = entries[0]
    const totalChange = latest.weight - first.weight
    // 7-day average
    const last7 = entries.slice(-7)
    const avg7 = last7.reduce((s, e) => s + e.weight, 0) / last7.length
    // 30-day average
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const last30 = entries.filter(e => new Date(e.date) >= thirtyDaysAgo)
    const avg30 = last30.length > 0 ? last30.reduce((s, e) => s + e.weight, 0) / last30.length : avg7
    return { latest: latest.weight, first: first.weight, totalChange, avg7: Math.round(avg7 * 10) / 10, avg30: Math.round(avg30 * 10) / 10, count: entries.length }
  }

  const GROCERY_CATEGORIES = ['Proteins', 'Produce', 'Dairy & Eggs', 'Pantry & Dry Goods', 'Condiments & Sauces', 'Other']

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /><p>Loading your meal planner...</p></div>

  const hisProgress = getWeeklyProgress('his')
  const herProgress = getWeeklyProgress('her')

  return (
    <div className={styles.app}>
      <div className={styles.header}>
        <h1>Meal planner</h1>
        <p>High-protein weekly meals for two · weight loss mode</p>
      </div>

      {/* TABS */}
      <div className={styles.tabs}>
        {([
          ['plan', '📋 Plan'],
          ['ideas', '💡 Ideas'],
          ['presets', '⭐ Presets'],
          ['dislikes', '🚫 Dislikes'],
          ['grocery', '🛒 Grocery'],
          ['weight', '⚖️ Weight'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.active : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {/* ═══════════ PLAN TAB ═══════════ */}
      {tab === 'plan' && (
        <div>
          <div className={styles.statsBar}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>His daily target</div>
              <div className={styles.statValue}>1,820 <span className={styles.statUnit}>cal</span></div>
              <div className={styles.statSub}>160g protein · 5′9″ 215 lbs</div>
              {hisProgress.totalDays > 0 && (
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${(hisProgress.onTrackDays / 7) * 100}%` }} />
                  <span className={styles.progressText}>{hisProgress.onTrackDays}/7 days on track</span>
                </div>
              )}
            </div>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>Her daily target</div>
              <div className={styles.statValue}>1,490 <span className={styles.statUnit}>cal</span></div>
              <div className={styles.statSub}>130g protein · 5′7″ 175 lbs</div>
              {herProgress.totalDays > 0 && (
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${(herProgress.onTrackDays / 7) * 100}%` }} />
                  <span className={styles.progressText}>{herProgress.onTrackDays}/7 days on track</span>
                </div>
              )}
            </div>
            <div className={`${styles.statCard} ${styles.goalCard}`}>
              <div className={styles.statLabel}>Weekly goal</div>
              <div className={styles.statValue}>~1 <span className={styles.statUnit}>lb/wk</span></div>
              <div className={styles.statSub}>500 cal deficit each</div>
            </div>
          </div>

          <div className={styles.howTo}>
            <span className={styles.howToIcon}>→</span>
            <div>
              <strong>How it works:</strong> Enter dinner first. Then click <strong>"Plan B+L"</strong> to enter both breakfast &amp; lunch — Claude auto-calculates portions so you don't exceed your calorie goal. You can edit amounts or remove ingredients after. Save any meal as a preset to reuse later.
            </div>
          </div>

          {/* Day cards */}
          <div className={styles.dayGrid}>
            {plan.days.map((day, di) => {
              const hisTotals = getDayTotals(day, 'his')
              const herTotals = getDayTotals(day, 'her')
              const isOpen = expandedDay === di

              return (
                <div key={day.day} className={`${styles.dayCard} ${isOpen ? styles.dayCardOpen : ''}`}>
                  <button className={styles.dayHeader} onClick={() => setExpandedDay(isOpen ? -1 : di)}>
                    <div className={styles.dayHeaderLeft}>
                      <span className={styles.dayName}>{day.day}</span>
                      <span className={styles.dayTheme}>{day.theme}</span>
                    </div>
                    <div className={styles.dayHeaderRight}>
                      {hisTotals.cal > 0 && (
                        <span className={`${styles.dayTotalPill} ${hisTotals.cal > HIM.calTarget + 50 ? styles.overBudget : ''}`}>
                          Him {hisTotals.cal} · {hisTotals.protein}g P
                        </span>
                      )}
                      {herTotals.cal > 0 && (
                        <span className={`${styles.dayTotalPill} ${herTotals.cal > HER.calTarget + 50 ? styles.overBudget : ''}`}>
                          Her {herTotals.cal} · {herTotals.protein}g P
                        </span>
                      )}
                      <span className={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className={styles.dayBody}>
                      {/* DINNER */}
                      <div className={styles.dinnerSection}>
                        <div className={styles.sectionLabel}>🍽️ Shared dinner — enter this first</div>
                        <div className={styles.mealInputWithPreset}>
                          <MealInput
                            placeholder="e.g. sirloin steaks and baked potatoes"
                            value={day.dinner.input}
                            meal={day.dinner.meal}
                            calcKey={`${di}-shared-dinner`}
                            calculating={calculating}
                            onSubmit={(input) => calculateMeal(di, 'shared', 'dinner', input)}
                            onChange={(v) => updateDay(di, d => ({ ...d, dinner: { ...d.dinner, input: v } }))}
                            editable
                            onRecalculate={(pi, amt) => recalculatePortions(di, 'shared', 'dinner', pi, amt)}
                            onDeleteIngredient={(pi) => deleteIngredient(di, 'shared', 'dinner', pi)}
                            onSavePreset={day.dinner.meal ? () => saveAsPreset(day.dinner.meal!, 'dinner', 'shared') : undefined}
                          />
                          <button className={styles.presetPickerBtn} onClick={() => setPresetPicker({ open: true, di, who: 'shared', mealType: 'dinner' })} title="Use a preset">⭐</button>
                        </div>
                      </div>

                      {/* PER PERSON */}
                      <div className={styles.personGrid}>
                        {(['his', 'her'] as const).map(who => {
                          const profile = who === 'his' ? HIM : HER
                          const dinnerCal = day.dinner.meal?.cal || 0
                          const remaining = profile.calTarget - dinnerCal
                          const totals = getDayTotals(day, who)
                          const overBudget = totals.cal > profile.calTarget + 50

                          return (
                            <div key={who} className={styles.personCol}>
                              <div className={styles.personHeader}>
                                <span className={styles.personLabel}>{profile.label}</span>
                                <div className={styles.personHeaderRight}>
                                  {dinnerCal > 0 && (
                                    <span className={`${styles.remainingBadge} ${remaining < 0 ? styles.overBudgetBadge : ''}`}>
                                      {remaining > 0 ? `${remaining} cal left` : `${Math.abs(remaining)} over!`}
                                    </span>
                                  )}
                                  {dinnerCal > 0 && (
                                    <button
                                      className={styles.planBLBtn}
                                      onClick={() => setMealDialog({
                                        open: true, di, who,
                                        breakfastInput: day[who].breakfast.input,
                                        lunchInput: day[who].lunch.input,
                                      })}
                                    >
                                      Plan B+L
                                    </button>
                                  )}
                                </div>
                              </div>

                              {(['breakfast', 'lunch'] as const).map(mt => (
                                <div key={mt} className={styles.mealSection}>
                                  <div className={styles.mealTypeLabel}>{mt.charAt(0).toUpperCase() + mt.slice(1)}</div>
                                  <div className={styles.mealInputWithPreset}>
                                    <MealInput
                                      placeholder={mt === 'breakfast'
                                        ? 'e.g. scrambled eggs with turkey and avocado'
                                        : 'e.g. taco salad with ground beef, lettuce, cheese'
                                      }
                                      value={day[who][mt].input}
                                      meal={day[who][mt].meal}
                                      calcKey={`${di}-${who}-${mt}`}
                                      calculating={calculating}
                                      onSubmit={(input) => calculateMeal(di, who, mt, input)}
                                      onChange={(v) => updateDay(di, d => ({
                                        ...d, [who]: { ...d[who], [mt]: { ...d[who][mt], input: v } }
                                      }))}
                                      editable
                                      onRecalculate={(pi, amt) => recalculatePortions(di, who, mt, pi, amt)}
                                      onDeleteIngredient={(pi) => deleteIngredient(di, who, mt, pi)}
                                      onSavePreset={day[who][mt].meal ? () => saveAsPreset(day[who][mt].meal!, mt, who) : undefined}
                                    />
                                    <button className={styles.presetPickerBtn} onClick={() => setPresetPicker({ open: true, di, who, mealType: mt })} title="Use a preset">⭐</button>
                                  </div>
                                </div>
                              ))}

                              {totals.cal > 0 && (
                                <div className={`${styles.personTotals} ${overBudget ? styles.personTotalsOver : ''}`}>
                                  <span>Total: <strong>{totals.cal} cal</strong> {overBudget && <span className={styles.overIcon}>⚠️</span>}</span>
                                  <span>P: <strong className={totals.protein >= profile.proteinTarget ? styles.proteinGood : styles.proteinLow}>{totals.protein}g / {profile.proteinTarget}g</strong></span>
                                  <span>C: <strong>{totals.carbs}g</strong></span>
                                  <span>F: <strong>{totals.fat}g</strong></span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button className={styles.groceryBtn} onClick={generateGrocery}>Generate grocery list →</button>
        </div>
      )}

      {/* ═══════════ MEAL IDEAS TAB ═══════════ */}
      {tab === 'ideas' && (
        <div className={styles.ideasTab}>
          <div className={styles.ideasIntro}>
            <h2>Meal Ideas Generator</h2>
            <p>AI-generated breakfast, lunch &amp; dinner ideas that fit your calorie/macro targets with dislikes excluded.</p>
          </div>
          <div className={styles.ideasControls}>
            <div className={styles.ideasToggle}>
              <button className={`${styles.toggleBtn} ${ideasWho === 'his' ? styles.toggleActive : ''}`} onClick={() => setIdeasWho('his')}>Him · 1,820 cal</button>
              <button className={`${styles.toggleBtn} ${ideasWho === 'her' ? styles.toggleActive : ''}`} onClick={() => setIdeasWho('her')}>Her · 1,490 cal</button>
            </div>
            {dislikes[ideasWho].length > 0 && (
              <div className={styles.ideasExcluding}>
                <span className={styles.excludeLabel}>Excluding:</span>
                {dislikes[ideasWho].map(d => <span key={d} className={styles.excludeTag}>{d}</span>)}
              </div>
            )}
            <button className={styles.generateIdeasBtn} onClick={generateIdeas} disabled={ideasLoading}>
              {ideasLoading ? <><span className={styles.btnSpinner} /> Generating...</> : '✨ Generate meal ideas'}
            </button>
          </div>
          {ideasLoading && <div className={styles.loadingState}><div className={styles.spinner} /><p>Creating personalized meal ideas...</p></div>}
          {!ideasLoading && !ideas && <div className={styles.emptyState}><div className={styles.emptyIcon}>💡</div><p>Choose who you're planning for, then generate ideas that fit your macro targets.</p></div>}
          {!ideasLoading && ideas && (
            <div className={styles.ideasResults}>
              {(['breakfast', 'lunch', 'dinner'] as const).map(mealType => (
                <div key={mealType} className={styles.ideasMealSection}>
                  <h3 className={styles.ideasMealTitle}>{mealType === 'breakfast' ? '🌅' : mealType === 'lunch' ? '☀️' : '🌙'} {mealType.charAt(0).toUpperCase() + mealType.slice(1)}</h3>
                  <div className={styles.ideasGrid}>
                    {ideas[mealType]?.map((idea: MealIdea, idx: number) => {
                      const isSelected = selectedIdeas[mealType] === idx
                      return (
                        <div key={idx} className={`${styles.ideaCard} ${isSelected ? styles.ideaCardSelected : ''}`} onClick={() => setSelectedIdeas(prev => ({ ...prev, [mealType]: isSelected ? null : idx }))}>
                          <div className={styles.ideaName}>{idea.name}</div>
                          <div className={styles.ideaDesc}>{idea.description}</div>
                          <div className={styles.ideaMacros}>
                            <span><strong>{idea.cal}</strong> cal</span>
                            <span className={styles.ideaProtein}>P <strong>{idea.protein}g</strong></span>
                            <span>C <strong>{idea.carbs}g</strong></span>
                            <span>F <strong>{idea.fat}g</strong></span>
                          </div>
                          {isSelected && idea.portions && (
                            <div className={styles.ideaPortions}>
                              <div className={styles.ideaPortionsTitle}>Ingredients</div>
                              {idea.portions.map((p, pi) => (
                                <div key={pi} className={styles.ideaPortionRow}>
                                  <span>{p.ingredient}</span>
                                  <span className={styles.ideaPortionAmt}>{p.amount}</span>
                                  <span className={styles.ideaPortionCal}>{p.cal} cal</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {isSelected && <div className={styles.ideaSelectedBadge}>✓ Selected</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {/* Daily total */}
              {(selectedIdeas.breakfast !== null || selectedIdeas.lunch !== null || selectedIdeas.dinner !== null) && (
                <div className={styles.ideasDailyTotal}>
                  <h4>Selected day total</h4>
                  <div className={styles.ideasTotalMacros}>
                    {(() => {
                      const profile = ideasWho === 'his' ? HIM : HER
                      let tc = 0, tp = 0, tca = 0, tf = 0
                      ;(['breakfast','lunch','dinner'] as const).forEach(mt => {
                        const idx = selectedIdeas[mt]
                        if (idx !== null && ideas[mt]?.[idx]) { const m = ideas[mt][idx]; tc += m.cal; tp += m.protein; tca += m.carbs; tf += m.fat }
                      })
                      return (
                        <>
                          <span className={tc <= profile.calTarget ? styles.totalGood : styles.totalOver}><strong>{tc}</strong> / {profile.calTarget} cal</span>
                          <span className={tp >= profile.proteinTarget ? styles.proteinGood : styles.proteinLow}>P: <strong>{tp}g</strong> / {profile.proteinTarget}g</span>
                          <span>C: <strong>{tca}g</strong></span>
                          <span>F: <strong>{tf}g</strong></span>
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ PRESETS TAB ═══════════ */}
      {tab === 'presets' && (
        <div>
          <div className={styles.presetsIntro}>
            <h2>Saved Meal Presets</h2>
            <p>Meals you've saved for quick reuse. Click any preset to see the full ingredient breakdown.</p>
          </div>
          {presets.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>⭐</div>
              <p>No presets saved yet. Calculate a meal on the Plan tab, then click "Save as preset" to add it here.</p>
            </div>
          ) : (
            <div className={styles.presetsList}>
              {(['breakfast', 'lunch', 'dinner'] as const).map(mt => {
                const items = presets.filter(p => p.mealType === mt)
                if (!items.length) return null
                return (
                  <div key={mt} className={styles.presetCategory}>
                    <h3>{mt === 'breakfast' ? '🌅' : mt === 'lunch' ? '☀️' : '🌙'} {mt.charAt(0).toUpperCase() + mt.slice(1)}</h3>
                    <div className={styles.presetCards}>
                      {items.map(p => (
                        <div key={p.id} className={`${styles.presetCard} ${expandedPreset === p.id ? styles.presetCardExpanded : ''}`}>
                          <div className={styles.presetCardHeader} onClick={() => setExpandedPreset(expandedPreset === p.id ? null : p.id)}>
                            <div>
                              <div className={styles.presetName}>{p.name}</div>
                              <div className={styles.presetMeta}>
                                <span>{p.who === 'shared' ? 'Shared' : p.who === 'his' ? 'Him' : 'Her'}</span>
                                <span><strong>{p.cal}</strong> cal</span>
                                <span className={styles.proteinVal}>P {p.protein}g</span>
                                <span>C {p.carbs}g</span>
                                <span>F {p.fat}g</span>
                              </div>
                            </div>
                            <span className={styles.chevron}>{expandedPreset === p.id ? '▲' : '▼'}</span>
                          </div>
                          {expandedPreset === p.id && (
                            <div className={styles.presetBody}>
                              {p.portions.length > 0 && (
                                <div className={styles.presetPortions}>
                                  {p.portions.map((pt, i) => (
                                    <div key={i} className={styles.presetPortionRow}>
                                      <span>{pt.ingredient}</span>
                                      <span className={styles.presetPortionAmt}>{pt.amount}</span>
                                      <span className={styles.presetPortionCal}>{pt.cal} cal · {pt.protein}g P</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <button className={styles.deletePresetBtn} onClick={() => deletePreset(p.id)}>Delete preset</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ DISLIKES TAB ═══════════ */}
      {tab === 'dislikes' && (
        <div>
          <div className={styles.dislikesIntro}><p>Foods listed here will be excluded from meal ideas and suggestions.</p></div>
          <div className={styles.dislikesGrid}>
            {(['his', 'her'] as const).map(who => (
              <div key={who} className={styles.dislikeCol}>
                <h2>{who === 'his' ? '🙋‍♂️ His dislikes' : '🙋‍♀️ Her dislikes'}</h2>
                <div className={styles.dislikeInputRow}>
                  <input type="text" value={who === 'his' ? hisInput : herInput} placeholder="Add a food..."
                    onChange={e => who === 'his' ? setHisInput(e.target.value) : setHerInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { const val = who === 'his' ? hisInput : herInput; addDislike(who, val); who === 'his' ? setHisInput('') : setHerInput('') } }}
                  />
                  <button className={styles.addBtn} onClick={() => { const val = who === 'his' ? hisInput : herInput; addDislike(who, val); who === 'his' ? setHisInput('') : setHerInput('') }}>Add</button>
                </div>
                <div className={styles.dislikeList}>
                  {dislikes[who].length === 0
                    ? <span className={styles.noDislikes}>None added yet</span>
                    : dislikes[who].map(item => (
                      <span key={item} className={styles.dislikeTag}>{item}<button onClick={() => removeDislike(who, item)}>&times;</button></span>
                    ))
                  }
                </div>
                <div className={styles.dislikeCount}>{dislikes[who].length} item{dislikes[who].length !== 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ GROCERY TAB ═══════════ */}
      {tab === 'grocery' && (
        <div>
          <div className={styles.groceryHeader}>
            <p>Based on your current week's meal plan.</p>
            <button className={styles.regenBtn} onClick={generateGrocery} disabled={groceryLoading}>{groceryLoading ? 'Generating...' : '↺ Regenerate'}</button>
          </div>
          {groceryLoading && <div className={styles.loadingState}><div className={styles.spinner} /><p>Building your grocery list...</p></div>}
          {!groceryLoading && !grocery && <div className={styles.emptyState}><div className={styles.emptyIcon}>🛒</div><p>Fill in your meals, then click "Generate grocery list" on the plan tab.</p></div>}
          {!groceryLoading && grocery && (
            <div className={styles.groceryList}>
              {GROCERY_CATEGORIES.map(cat => {
                const items = grocery.filter(i => i.category === cat)
                if (!items.length) return null
                return (
                  <div key={cat} className={styles.groceryCategory}>
                    <h3>{cat}</h3>
                    <div className={styles.groceryItems}>
                      {items.map((item, i) => (
                        <div key={i} className={styles.groceryItem}>
                          <span className={styles.groceryName}>{item.name}</span>
                          <span className={styles.groceryAmount}>{item.amount}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ WEIGHT TAB ═══════════ */}
      {tab === 'weight' && (
        <div>
          <div className={styles.weightIntro}>
            <h2>Weight Tracker</h2>
            <p>Log your weight regularly to track progress over time. We'll calculate running averages so daily fluctuations don't stress you out.</p>
          </div>

          {/* Input form */}
          <div className={styles.weightForm}>
            <div className={styles.ideasToggle}>
              <button className={`${styles.toggleBtn} ${weightWho === 'his' ? styles.toggleActive : ''}`} onClick={() => setWeightWho('his')}>Him</button>
              <button className={`${styles.toggleBtn} ${weightWho === 'her' ? styles.toggleActive : ''}`} onClick={() => setWeightWho('her')}>Her</button>
            </div>
            <div className={styles.weightInputRow}>
              <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)} className={styles.weightDateInput} />
              <div className={styles.weightNumInput}>
                <input type="number" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="Weight" step="0.1"
                  onKeyDown={e => { if (e.key === 'Enter') addWeightEntry() }}
                />
                <span className={styles.weightUnit}>lbs</span>
              </div>
              <button className={styles.addBtn} onClick={addWeightEntry}>Log</button>
            </div>
          </div>

          {/* Stats cards */}
          <div className={styles.weightStatsRow}>
            {(['his', 'her'] as const).map(who => {
              const stats = getWeightStats(who)
              const profile = who === 'his' ? HIM : HER
              return (
                <div key={who} className={styles.weightStatCard}>
                  <h3>{profile.label}</h3>
                  {!stats ? (
                    <p className={styles.weightNoData}>No entries yet</p>
                  ) : (
                    <div className={styles.weightStatGrid}>
                      <div>
                        <div className={styles.weightStatLabel}>Current</div>
                        <div className={styles.weightStatValue}>{stats.latest} lbs</div>
                      </div>
                      <div>
                        <div className={styles.weightStatLabel}>7-day avg</div>
                        <div className={styles.weightStatValue}>{stats.avg7} lbs</div>
                      </div>
                      <div>
                        <div className={styles.weightStatLabel}>30-day avg</div>
                        <div className={styles.weightStatValue}>{stats.avg30} lbs</div>
                      </div>
                      <div>
                        <div className={styles.weightStatLabel}>Total change</div>
                        <div className={`${styles.weightStatValue} ${stats.totalChange <= 0 ? styles.weightDown : styles.weightUp}`}>
                          {stats.totalChange > 0 ? '+' : ''}{Math.round(stats.totalChange * 10) / 10} lbs
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Weight chart (simple bar/visual) */}
          {weightEntries.length > 0 && (
            <div className={styles.weightChartSection}>
              {(['his', 'her'] as const).map(who => {
                const entries = weightEntries.filter(e => e.person === who).sort((a, b) => a.date.localeCompare(b.date))
                if (!entries.length) return null
                const minW = Math.min(...entries.map(e => e.weight)) - 2
                const maxW = Math.max(...entries.map(e => e.weight)) + 2
                const range = maxW - minW || 1
                const profile = who === 'his' ? HIM : HER

                return (
                  <div key={who} className={styles.weightChartBlock}>
                    <h4>{profile.label}'s Progress</h4>
                    <div className={styles.weightChart}>
                      {entries.slice(-30).map((e, i) => {
                        const pct = ((e.weight - minW) / range) * 100
                        const prevWeight = i > 0 ? entries[Math.max(0, entries.indexOf(e) - 1)].weight : e.weight
                        const isDown = e.weight <= prevWeight
                        return (
                          <div key={e.id} className={styles.weightBar} title={`${e.date}: ${e.weight} lbs`}>
                            <div className={`${styles.weightBarFill} ${isDown ? styles.weightBarDown : styles.weightBarUp}`} style={{ height: `${pct}%` }} />
                            <div className={styles.weightBarLabel}>{e.weight}</div>
                            <div className={styles.weightBarDate}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Entry log */}
          {weightEntries.length > 0 && (
            <div className={styles.weightLog}>
              <h4>All Entries</h4>
              <div className={styles.weightLogEntries}>
                {[...weightEntries].reverse().map(e => (
                  <div key={e.id} className={styles.weightLogEntry}>
                    <span className={styles.weightLogPerson}>{e.person === 'his' ? 'Him' : 'Her'}</span>
                    <span className={styles.weightLogDate}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    <span className={styles.weightLogValue}>{e.weight} lbs</span>
                    <button className={styles.weightLogDelete} onClick={() => deleteWeightEntry(e.id)}>×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ MEAL DIALOG (B+L planner) ═══════════ */}
      {mealDialog && (
        <div className={styles.dialogOverlay} onClick={() => setMealDialog(null)}>
          <div className={styles.dialog} onClick={e => e.stopPropagation()}>
            <div className={styles.dialogHeader}>
              <h3>Plan Breakfast &amp; Lunch</h3>
              <button className={styles.dialogClose} onClick={() => setMealDialog(null)}>×</button>
            </div>
            <div className={styles.dialogBody}>
              {(() => {
                const profile = mealDialog.who === 'his' ? HIM : HER
                const day = plan.days[mealDialog.di]
                const dinnerCal = day.dinner.meal?.cal || 0
                const remaining = profile.calTarget - dinnerCal
                return (
                  <>
                    <div className={styles.dialogBudget}>
                      <span>{profile.label} · {day.day}</span>
                      <span>Dinner: {dinnerCal} cal</span>
                      <span className={styles.dialogBudgetRemaining}><strong>{remaining} cal</strong> left for B+L</span>
                    </div>
                    <div className={styles.dialogFields}>
                      <div>
                        <label>🌅 Breakfast — what do you want?</label>
                        <input type="text" placeholder="e.g. scrambled eggs with turkey sausage"
                          value={mealDialog.breakfastInput}
                          onChange={e => setMealDialog(prev => prev ? { ...prev, breakfastInput: e.target.value } : null)}
                        />
                      </div>
                      <div>
                        <label>☀️ Lunch — what do you want?</label>
                        <input type="text" placeholder="e.g. chicken caesar salad"
                          value={mealDialog.lunchInput}
                          onChange={e => setMealDialog(prev => prev ? { ...prev, lunchInput: e.target.value } : null)}
                        />
                      </div>
                    </div>
                    <p className={styles.dialogHint}>Claude will calculate exact portions for both meals to fit within your {remaining} cal budget.</p>
                    <button className={styles.generateIdeasBtn}
                      disabled={calculating !== null}
                      onClick={() => calculateBothMeals(mealDialog.di, mealDialog.who, mealDialog.breakfastInput, mealDialog.lunchInput)}
                    >
                      {calculating ? <><span className={styles.btnSpinner} /> Calculating...</> : 'Calculate both meals'}
                    </button>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ PRESET PICKER DIALOG ═══════════ */}
      {presetPicker && (
        <div className={styles.dialogOverlay} onClick={() => setPresetPicker(null)}>
          <div className={styles.dialog} onClick={e => e.stopPropagation()}>
            <div className={styles.dialogHeader}>
              <h3>Choose a Preset</h3>
              <button className={styles.dialogClose} onClick={() => setPresetPicker(null)}>×</button>
            </div>
            <div className={styles.dialogBody}>
              {(() => {
                const relevant = presets.filter(p =>
                  p.mealType === presetPicker.mealType &&
                  (presetPicker.who === 'shared' ? p.who === 'shared' : (p.who === presetPicker.who || p.who === 'shared'))
                )
                if (!relevant.length) return <p className={styles.noDislikes}>No presets saved for this meal type yet.</p>
                return (
                  <div className={styles.presetPickerList}>
                    {relevant.map(p => (
                      <button key={p.id} className={styles.presetPickerItem}
                        onClick={() => applyPreset(p, presetPicker.di, presetPicker.who, presetPicker.mealType)}
                      >
                        <div className={styles.presetPickerName}>{p.name}</div>
                        <div className={styles.presetPickerMacros}>
                          <span>{p.cal} cal</span>
                          <span className={styles.proteinVal}>P {p.protein}g</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════ MealInput Component ═══════════
function MealInput({ placeholder, value, meal, calcKey, calculating, onSubmit, onChange, editable, onRecalculate, onDeleteIngredient, onSavePreset }: {
  placeholder: string; value: string; meal: MacroMeal | null; calcKey: string; calculating: string | null
  onSubmit: (input: string) => void; onChange: (v: string) => void
  editable?: boolean
  onRecalculate?: (portionIndex: number, newAmount: string) => void
  onDeleteIngredient?: (portionIndex: number) => void
  onSavePreset?: () => void
}) {
  const isCalc = calculating === calcKey
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [recalcing, setRecalcing] = useState(false)

  const startEdit = (idx: number, currentAmount: string) => { setEditingIdx(idx); setEditValue(currentAmount) }

  const commitEdit = async (idx: number) => {
    if (editValue.trim() && onRecalculate) {
      setRecalcing(true)
      await onRecalculate(idx, editValue.trim())
      setRecalcing(false)
    }
    setEditingIdx(null)
  }

  return (
    <div className={styles.mealInput}>
      <div className={styles.mealInputRow}>
        <input type="text" placeholder={placeholder} value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSubmit(value) }}
          disabled={isCalc}
        />
        <button className={styles.calcBtn} onClick={() => value.trim() && onSubmit(value)}
          disabled={isCalc || !value.trim()} title={meal ? 'Recalculate' : 'Calculate macros'}>
          {isCalc ? '...' : meal ? '↺' : '→'}
        </button>
      </div>

      {isCalc && <div className={styles.calcLoading}><span className={styles.btnSpinner} /> Calculating macros...</div>}

      {!isCalc && meal && (
        <div className={styles.mealResult}>
          <div className={styles.mealResultHeader}>
            <div>
              <div className={styles.mealResultName}>{meal.name}</div>
              {meal.description && <div className={styles.mealResultDesc}>{meal.description}</div>}
            </div>
            {onSavePreset && (
              <button className={styles.savePresetBtn} onClick={onSavePreset} title="Save as preset">⭐ Save</button>
            )}
          </div>
          <div className={styles.mealResultMacros}>
            <span><strong>{meal.cal}</strong> cal</span>
            <span>P <strong className={styles.proteinVal}>{meal.protein}g</strong></span>
            <span>C <strong>{meal.carbs}g</strong></span>
            <span>F <strong>{meal.fat}g</strong></span>
          </div>
          {meal.portions && meal.portions.length > 0 && (
            <div className={styles.portionList}>
              {editable && <div className={styles.portionEditHint}>Click amount to edit (recalculates macros) · × to remove</div>}
              {recalcing && <div className={styles.calcLoading}><span className={styles.btnSpinner} /> Updating macros...</div>}
              {meal.portions.map((p, i) => (
                <div key={i} className={`${styles.portionItem} ${editable ? styles.portionItemEditable : ''}`}>
                  <span className={styles.portionIngredient}>{p.ingredient}</span>
                  {editable && editingIdx === i ? (
                    <input className={styles.portionAmountInput} value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(i)}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(i); if (e.key === 'Escape') setEditingIdx(null) }}
                      autoFocus
                    />
                  ) : (
                    <span className={`${styles.portionAmount} ${editable ? styles.portionAmountClickable : ''}`}
                      onClick={() => editable && startEdit(i, p.amount)}>{p.amount}</span>
                  )}
                  <span className={styles.portionCal}>{p.cal} cal</span>
                  <span className={styles.portionProtein}>{p.protein}g P</span>
                  {editable && <button className={styles.portionDeleteBtn} onClick={() => onDeleteIngredient?.(i)} title="Remove">×</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
