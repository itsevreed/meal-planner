'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { MealPlan, DayPlan, PersonMeal, MacroMeal, PortionItem, Dislikes, GroceryItem, MealIdea, PresetMeal, WeightEntry, ScannedFood, WaterEntry } from '@/lib/types'
import styles from './page.module.css'

const DAYS_META = [
  { name: 'Monday', theme: 'Breakfast theme' },
  { name: 'Tuesday', theme: 'Taco Tuesday' },
  { name: 'Wednesday', theme: 'Asian Wednesday' },
  { name: 'Thursday', theme: 'Steak & Potato' },
  { name: 'Friday', theme: 'Salmon Friday' },
  { name: 'Saturday', theme: 'Open choice' },
  { name: 'Sunday', theme: 'Open choice' },
]

type User = 'evan' | 'liv'
const PROFILES = {
  evan: { label: 'Evan', key: 'his' as const, calTarget: 1820, proteinTarget: 160, emoji: '💪', height: "5'9\"", startWeight: 215 },
  liv:  { label: 'Liv',  key: 'her' as const, calTarget: 1490, proteinTarget: 130, emoji: '✨', height: "5'7\"", startWeight: 175 },
}

function emptyPM(): PersonMeal { return { input: '', meal: null, eaten: false } }
function emptyDay(m: typeof DAYS_META[0]): DayPlan {
  return { day: m.name, theme: m.theme, his: { breakfast: emptyPM(), lunch: emptyPM(), snack: emptyPM() }, her: { breakfast: emptyPM(), lunch: emptyPM(), snack: emptyPM() }, dinner: emptyPM() }
}

function getWeekId(offset = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offset * 7)
  const jan1 = new Date(d.getFullYear(), 0, 1)
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000)
  const week = Math.ceil((days + jan1.getDay() + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function getWeekLabel(weekId: string, offset: number): string {
  if (offset === 0) return 'This week'
  if (offset === 1) return 'Next week'
  if (offset === -1) return 'Last week'
  return weekId
}

type Tab = 'plan' | 'summary' | 'ideas' | 'presets' | 'scanned' | 'dislikes' | 'grocery' | 'weight' | 'water'

// ═══════════════════════════════════════
export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const u = typeof window !== 'undefined' ? localStorage.getItem('meal-planner-user') : null
    if (u === 'evan' || u === 'liv') setUser(u)
    const t = typeof window !== 'undefined' ? localStorage.getItem('meal-planner-theme') : null
    if (t === 'dark' || t === 'light') { setTheme(t); document.documentElement.setAttribute('data-theme', t) }
    else if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) { setTheme('dark'); document.documentElement.setAttribute('data-theme', 'dark') }
  }, [])

  const toggleTheme = () => {
    const n = theme === 'light' ? 'dark' : 'light'
    setTheme(n); localStorage.setItem('meal-planner-theme', n); document.documentElement.setAttribute('data-theme', n)
  }
  const selectUser = (u: User) => { localStorage.setItem('meal-planner-user', u); setUser(u) }
  const switchUser = () => { localStorage.removeItem('meal-planner-user'); setUser(null) }

  if (!user) return (
    <div className={styles.loginScreen}>
      <button className={styles.themeToggleFloat} onClick={toggleTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
      <div className={styles.loginCard}>
        <h1 className={styles.loginTitle}>Meal Planner</h1>
        <p className={styles.loginSub}>High-protein weekly meals · weight loss mode</p>
        <div className={styles.loginPrompt}>Who's planning?</div>
        <div className={styles.loginButtons}>
          {(['evan', 'liv'] as User[]).map(u => (
            <button key={u} className={styles.loginBtn} onClick={() => selectUser(u)}>
              <span className={styles.loginEmoji}>{PROFILES[u].emoji}</span>
              <span className={styles.loginName}>{PROFILES[u].label}</span>
              <span className={styles.loginStats}>{PROFILES[u].calTarget.toLocaleString()} cal · {PROFILES[u].proteinTarget}g protein</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
  return <AppMain user={user} onSwitch={switchUser} theme={theme} onToggleTheme={toggleTheme} />
}

// ═══════════════════════════════════════
function AppMain({ user, onSwitch, theme, onToggleTheme }: { user: User; onSwitch: () => void; theme: string; onToggleTheme: () => void }) {
  const profile = PROFILES[user]
  const pk = profile.key

  const [tab, setTab] = useState<Tab>('plan')
  const [weekOffset, setWeekOffset] = useState(0)
  const weekId = getWeekId(weekOffset)

  const [plan, setPlan] = useState<MealPlan>(() => ({ days: DAYS_META.map(emptyDay), weekId }))
  const [dislikes, setDislikes] = useState<Dislikes>({ his: [], her: [] })
  const [dislikeInput, setDislikeInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState<string | null>(null)
  const [grocery, setGrocery] = useState<GroceryItem[] | null>(null)
  const [groceryLoading, setGroceryLoading] = useState(false)
  const [expandedDay, setExpandedDay] = useState<number>(0)

  // Ideas
  const [ideas, setIdeas] = useState<Record<string, MealIdea[]> | null>(null)
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [applyIdeaTarget, setApplyIdeaTarget] = useState<{ idea: MealIdea; mealType: string } | null>(null)

  // Presets
  const [presets, setPresets] = useState<PresetMeal[]>([])
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null)
  const [presetPicker, setPresetPicker] = useState<{ di: number; mealType: string } | null>(null)

  // Scanned foods
  const [scannedFoods, setScannedFoods] = useState<ScannedFood[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [expandedScanned, setExpandedScanned] = useState<string | null>(null)

  // Weight
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([])
  const [weightInput, setWeightInput] = useState('')
  const [weightDate, setWeightDate] = useState(() => new Date().toISOString().split('T')[0])
  const [goalWeight, setGoalWeight] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const g = localStorage.getItem(`goal-weight-${user}`)
      return g ? parseFloat(g) : (user === 'evan' ? 185 : 145)
    }
    return user === 'evan' ? 185 : 145
  })

  // Water
  const [waterEntries, setWaterEntries] = useState<WaterEntry[]>([])
  const todayStr = new Date().toISOString().split('T')[0]

  // Locks (persisted via Supabase)
  const [lockedSet, setLockedSet] = useState<Set<string>>(new Set())
  const lockKey = (di: number, who: string, mt: string) => `${weekId}-${di}-${who}-${mt}`
  const isLocked = (di: number, who: string, mt: string) => lockedSet.has(lockKey(di, who, mt))
  const toggleLock = async (di: number, who: string, mt: string) => {
    const k = lockKey(di, who, mt)
    const next = new Set(lockedSet)
    if (next.has(k)) {
      next.delete(k)
      await supabase.from('locked_meals').delete().eq('week_id', weekId).eq('day_index', di).eq('person', who).eq('meal_type', mt)
    } else {
      next.add(k)
      await supabase.from('locked_meals').insert({ week_id: weekId, day_index: di, person: who, meal_type: mt })
    }
    setLockedSet(next)
  }

  // Copy
  const [copyTarget, setCopyTarget] = useState<{ meal: PersonMeal; who: string; mealType: string } | null>(null)

  // ── Helpers ──
  const getMyDislikes = () => dislikes[pk]
  const getAllDislikes = () => [...dislikes.his, ...dislikes.her]
  const scannedForApi = useMemo(() => scannedFoods.map(f => ({ name: f.name, brand: f.brand, servingSize: f.servingSize, cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat })), [scannedFoods])

  const sanitizePlan = (raw: any): MealPlan => {
    const sm = (m: any): PersonMeal => ({ input: m?.input || '', meal: m?.meal ?? null, eaten: m?.eaten ?? false })
    return { days: DAYS_META.map((meta, i) => {
      const d = raw?.days?.[i] ?? {}
      return { day: meta.name, theme: meta.theme, his: { breakfast: sm(d?.his?.breakfast), lunch: sm(d?.his?.lunch), snack: sm(d?.his?.snack) }, her: { breakfast: sm(d?.her?.breakfast), lunch: sm(d?.her?.lunch), snack: sm(d?.her?.snack) }, dinner: sm(d?.dinner) }
    }), weekId: raw?.weekId || weekId }
  }

  // ── Load data ──
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: dd }, { data: pd }, { data: pr }, { data: wd }, { data: sf }, { data: lk }, { data: wa }] = await Promise.all([
        supabase.from('dislikes').select('*'),
        supabase.from('meal_plan').select('*').eq('week_id', weekId).limit(1).single(),
        supabase.from('preset_meals').select('*').order('created_at', { ascending: false }),
        supabase.from('weight_entries').select('*').order('date', { ascending: true }),
        supabase.from('scanned_foods').select('*').order('created_at', { ascending: false }),
        supabase.from('locked_meals').select('*').eq('week_id', weekId),
        supabase.from('water_entries').select('*').order('date', { ascending: true }),
      ])
      if (dd) setDislikes({ his: dd.filter((d: any) => d.person === 'his').map((d: any) => d.item), her: dd.filter((d: any) => d.person === 'her').map((d: any) => d.item) })
      if (pd?.plan) setPlan(sanitizePlan(pd.plan))
      else setPlan({ days: DAYS_META.map(emptyDay), weekId })
      if (pr) setPresets(pr.map((p: any) => ({ id: p.id, name: p.name, mealType: p.meal_type, who: p.who, cal: p.cal, protein: p.protein, carbs: p.carbs, fat: p.fat, portions: p.portions || [], createdAt: p.created_at })))
      if (wd) setWeightEntries(wd.map((w: any) => ({ id: w.id, person: w.person, weight: w.weight, date: w.date, createdAt: w.created_at })))
      if (sf) setScannedFoods(sf.map((s: any) => ({ id: s.id, barcode: s.barcode, name: s.name, brand: s.brand, servingSize: s.serving_size, cal: s.cal, protein: s.protein, carbs: s.carbs, fat: s.fat, fiber: s.fiber || 0, sugar: s.sugar || 0, imageUrl: s.image_url || '', createdAt: s.created_at })))
      if (lk) setLockedSet(new Set(lk.map((l: any) => `${l.week_id}-${l.day_index}-${l.person}-${l.meal_type}`)))
      if (wa) setWaterEntries(wa.map((w: any) => ({ id: w.id, person: w.person, glasses: w.glasses, date: w.date })))
    } catch {}
    setLoading(false)
  }, [weekId])

  useEffect(() => { loadData() }, [loadData])

  // ── Save plan ──
  const savePlan = async (p: MealPlan) => {
    try {
      await supabase.from('meal_plan').upsert({ week_id: weekId, plan: p }, { onConflict: 'week_id' })
    } catch {}
  }

  const updateDay = (di: number, fn: (d: DayPlan) => DayPlan) => {
    setPlan(prev => {
      const days = [...prev.days]; days[di] = fn(days[di])
      const next = { ...prev, days }; savePlan(next); return next
    })
  }

  // ── Adaptive calorie target ──
  const getAdaptiveTarget = () => {
    const entries = weightEntries.filter(e => e.person === pk).sort((a, b) => a.date.localeCompare(b.date))
    if (entries.length < 14) return profile.calTarget // need 2 weeks of data
    const recent = entries.slice(-14)
    const avgRecent = recent.reduce((s, e) => s + e.weight, 0) / recent.length
    const older = entries.slice(-28, -14)
    if (older.length < 7) return profile.calTarget
    const avgOlder = older.reduce((s, e) => s + e.weight, 0) / older.length
    const weeklyLoss = (avgOlder - avgRecent) / 2 // over ~2 weeks
    if (weeklyLoss > 1.5) return profile.calTarget + 100 // losing too fast, eat more
    if (weeklyLoss < 0.3) return Math.max(profile.calTarget - 100, 1200) // stalled, eat less
    return profile.calTarget
  }
  const effectiveCal = getAdaptiveTarget()

  // ── Calculate meal ──
  const calculateMeal = async (di: number, mealType: string, input: string) => {
    if (!input.trim()) return
    const who = mealType === 'dinner' ? 'shared' : pk
    if (isLocked(di, who, mealType)) return
    setCalculating(`${di}-${who}-${mealType}`)
    const day = plan.days[di]
    const dinnerCal = day.dinner.meal?.cal || 0
    const remaining = effectiveCal - dinnerCal

    let lockedSibCals = 0
    if (mealType !== 'dinner') {
      for (const sib of ['breakfast', 'lunch', 'snack']) {
        if (sib !== mealType && isLocked(di, pk, sib) && (day[pk] as any)[sib]?.meal)
          lockedSibCals += (day[pk] as any)[sib].meal.cal
      }
    }

    try {
      const res = await fetch('/api/calculate-meal', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealInput: input, mealType, person: mealType === 'dinner' ? 'shared' : pk, remainingCals: remaining, targetProtein: profile.proteinTarget, dinnerMacros: day.dinner.meal, dislikes: mealType === 'dinner' ? getAllDislikes() : getMyDislikes(), lockedMealsCals: lockedSibCals, scannedFoods: scannedForApi }) })
      const { meal } = await res.json()
      updateDay(di, d => {
        if (mealType === 'dinner') return { ...d, dinner: { input, meal, eaten: false } }
        return { ...d, [pk]: { ...d[pk], [mealType]: { input, meal, eaten: false } } }
      })
    } catch { alert('Failed to calculate.') }
    setCalculating(null)
  }

  // ── Recalculate portion ──
  const recalcPortion = async (di: number, mt: string, pi: number, newAmt: string) => {
    const day = plan.days[di]
    const pm: PersonMeal = mt === 'dinner' ? day.dinner : (day[pk] as any)[mt]
    if (!pm.meal?.portions) return
    try {
      const res = await fetch('/api/recalculate-portions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portions: pm.meal.portions, editedIndex: pi, newAmount: newAmt, originalMeal: pm.meal }) })
      const { result } = await res.json()
      if (!result) return
      const newMeal = { ...pm.meal, ...result }
      updateDay(di, d => mt === 'dinner' ? { ...d, dinner: { ...d.dinner, meal: newMeal } } : { ...d, [pk]: { ...d[pk], [mt]: { ...(d[pk] as any)[mt], meal: newMeal } } })
    } catch {}
  }

  // ── Delete ingredient ──
  const delIngredient = (di: number, mt: string, pi: number) => {
    updateDay(di, d => {
      const pm: PersonMeal = mt === 'dinner' ? d.dinner : (d[pk] as any)[mt]
      if (!pm.meal?.portions) return d
      const np = pm.meal.portions.filter((_, i) => i !== pi)
      const t = np.reduce((a, p) => ({ cal: a.cal + p.cal, protein: a.protein + p.protein, carbs: a.carbs + p.carbs, fat: a.fat + p.fat }), { cal: 0, protein: 0, carbs: 0, fat: 0 })
      const nm = { ...pm.meal, portions: np, ...t }
      return mt === 'dinner' ? { ...d, dinner: { ...d.dinner, meal: nm } } : { ...d, [pk]: { ...d[pk], [mt]: { ...(d[pk] as any)[mt], meal: nm } } }
    })
  }

  // ── Toggle eaten ──
  const toggleEaten = (di: number, mt: string) => {
    updateDay(di, d => {
      if (mt === 'dinner') return { ...d, dinner: { ...d.dinner, eaten: !d.dinner.eaten } }
      const cur = (d[pk] as any)[mt]
      return { ...d, [pk]: { ...d[pk], [mt]: { ...cur, eaten: !cur.eaten } } }
    })
  }

  // ── Reset day ──
  const resetDay = (di: number) => {
    if (!confirm('Clear all meals for this day?')) return
    updateDay(di, d => ({ ...d, [pk]: { breakfast: emptyPM(), lunch: emptyPM(), snack: emptyPM() }, dinner: emptyPM() }))
  }

  // ── Copy meal ──
  const copyMealToDay = (tdi: number) => {
    if (!copyTarget) return
    const { meal: pm, who, mealType } = copyTarget
    updateDay(tdi, d => mealType === 'dinner' ? { ...d, dinner: { ...pm } } : { ...d, [who]: { ...(d as any)[who], [mealType]: { ...pm } } })
    setCopyTarget(null)
  }

  // ── Grocery ──
  const generateGrocery = async () => {
    setGroceryLoading(true); setTab('grocery')
    try {
      const res = await fetch('/api/grocery-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) })
      const { items } = await res.json(); setGrocery(items)
    } catch { alert('Failed.') }
    setGroceryLoading(false)
  }

  // ── Ideas ──
  const generateIdeas = async () => {
    setIdeasLoading(true); setIdeas(null)
    const dc = Math.round(effectiveCal * 0.33), bc = Math.round((effectiveCal - dc) * 0.37), sc = Math.round((effectiveCal - dc) * 0.15), lc = effectiveCal - dc - bc - sc
    try {
      const res = await fetch('/api/meal-ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who: pk, dislikes: getMyDislikes(), calBudget: { breakfast: bc, lunch: lc, dinner: dc, snack: sc }, proteinTarget: profile.proteinTarget }) })
      const { ideas: ni } = await res.json(); setIdeas(ni)
    } catch { alert('Failed.') }
    setIdeasLoading(false)
  }

  // ── Apply idea to day ──
  const applyIdea = (di: number) => {
    if (!applyIdeaTarget) return
    const { idea, mealType } = applyIdeaTarget
    const meal: MacroMeal = { name: idea.name, description: idea.description, cal: idea.cal, protein: idea.protein, carbs: idea.carbs, fat: idea.fat, portions: idea.portions }
    updateDay(di, d => mealType === 'dinner' ? { ...d, dinner: { input: idea.name, meal, eaten: false } } : { ...d, [pk]: { ...d[pk], [mealType]: { input: idea.name, meal, eaten: false } } })
    setApplyIdeaTarget(null)
  }

  // ── Dislikes ──
  const addDislike = async (item: string) => { const t = item.trim().toLowerCase(); if (!t || dislikes[pk].includes(t)) return; await supabase.from('dislikes').insert({ person: pk, item: t }); setDislikes(p => ({ ...p, [pk]: [...p[pk], t] })) }
  const removeDislike = async (item: string) => { await supabase.from('dislikes').delete().eq('person', pk).eq('item', item); setDislikes(p => ({ ...p, [pk]: p[pk].filter(x => x !== item) })) }

  // ── Presets ──
  const savePreset = async (meal: MacroMeal, mt: string) => {
    const who = mt === 'dinner' ? 'shared' : pk
    const { data } = await supabase.from('preset_meals').insert({ name: meal.name, meal_type: mt, who, cal: meal.cal, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, portions: meal.portions || [] }).select().single()
    if (data) setPresets(p => [{ id: data.id, name: data.name, mealType: data.meal_type, who: data.who, cal: data.cal, protein: data.protein, carbs: data.carbs, fat: data.fat, portions: data.portions || [], createdAt: data.created_at }, ...p])
  }
  const deletePreset = async (id: string) => { await supabase.from('preset_meals').delete().eq('id', id); setPresets(p => p.filter(x => x.id !== id)) }
  const applyPreset = (preset: PresetMeal, di: number, mt: string) => {
    const meal: MacroMeal = { name: preset.name, cal: preset.cal, protein: preset.protein, carbs: preset.carbs, fat: preset.fat, portions: preset.portions }
    updateDay(di, d => mt === 'dinner' ? { ...d, dinner: { input: preset.name, meal, eaten: false } } : { ...d, [pk]: { ...d[pk], [mt]: { input: preset.name, meal, eaten: false } } })
    setPresetPicker(null)
  }

  // ── Weight ──
  const addWeight = async () => {
    const w = parseFloat(weightInput); if (isNaN(w) || w < 50 || w > 500) return
    const { data } = await supabase.from('weight_entries').insert({ person: pk, weight: w, date: weightDate }).select().single()
    if (data) { setWeightEntries(p => [...p, { id: data.id, person: data.person, weight: data.weight, date: data.date, createdAt: data.created_at }].sort((a, b) => a.date.localeCompare(b.date))); setWeightInput('') }
  }
  const delWeight = async (id: string) => { await supabase.from('weight_entries').delete().eq('id', id); setWeightEntries(p => p.filter(x => x.id !== id)) }

  const setGoal = (v: number) => { setGoalWeight(v); localStorage.setItem(`goal-weight-${user}`, String(v)) }

  // ── Water ──
  const todayWater = waterEntries.find(w => w.person === pk && w.date === todayStr)
  const addWater = async () => {
    if (todayWater) {
      const ng = todayWater.glasses + 1
      await supabase.from('water_entries').update({ glasses: ng }).eq('id', todayWater.id)
      setWaterEntries(p => p.map(w => w.id === todayWater.id ? { ...w, glasses: ng } : w))
    } else {
      const { data } = await supabase.from('water_entries').insert({ person: pk, glasses: 1, date: todayStr }).select().single()
      if (data) setWaterEntries(p => [...p, { id: data.id, person: data.person, glasses: data.glasses, date: data.date }])
    }
  }
  const subWater = async () => {
    if (!todayWater || todayWater.glasses <= 0) return
    const ng = todayWater.glasses - 1
    await supabase.from('water_entries').update({ glasses: ng }).eq('id', todayWater.id)
    setWaterEntries(p => p.map(w => w.id === todayWater.id ? { ...w, glasses: ng } : w))
  }

  // ── Barcode ──
  const scanBarcode = async (code?: string) => {
    const bc = (code || barcodeInput).trim(); if (!bc) return
    setScanning(true); setScanError('')
    try {
      const res = await fetch('/api/scan-barcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode: bc }) })
      const data = await res.json()
      if (data.error) { setScanError(data.error); setScanning(false); return }
      const f = data.food
      const { data: saved } = await supabase.from('scanned_foods').insert({ barcode: f.barcode, name: f.name, brand: f.brand, serving_size: f.servingSize, cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, sugar: f.sugar, image_url: f.imageUrl }).select().single()
      if (saved) setScannedFoods(p => [{ id: saved.id, barcode: saved.barcode, name: saved.name, brand: saved.brand, servingSize: saved.serving_size, cal: saved.cal, protein: saved.protein, carbs: saved.carbs, fat: saved.fat, fiber: saved.fiber || 0, sugar: saved.sugar || 0, imageUrl: saved.image_url || '', createdAt: saved.created_at }, ...p])
      setBarcodeInput('')
    } catch { setScanError('Failed to scan.') }
    setScanning(false)
  }
  const delScanned = async (id: string) => { if (!confirm('Remove this food?')) return; await supabase.from('scanned_foods').delete().eq('id', id); setScannedFoods(p => p.filter(x => x.id !== id)) }

  // ── Computed ──
  const getDayTotals = (day: DayPlan) => {
    const meals = [day[pk].breakfast.meal, day[pk].lunch.meal, day[pk].snack.meal, day.dinner.meal]
    return meals.reduce((a, m) => ({ cal: a.cal + (m?.cal || 0), protein: a.protein + (m?.protein || 0), carbs: a.carbs + (m?.carbs || 0), fat: a.fat + (m?.fat || 0) }), { cal: 0, protein: 0, carbs: 0, fat: 0 })
  }

  const getLiveBudget = (day: DayPlan) => {
    const dinCal = day.dinner.meal?.cal || 0
    const bCal = day[pk].breakfast.meal?.cal || 0
    const lCal = day[pk].lunch.meal?.cal || 0
    const sCal = day[pk].snack.meal?.cal || 0
    return effectiveCal - dinCal - bCal - lCal - sCal
  }

  const weekProgress = useMemo(() => {
    let total = 0, onTrack = 0, eatenCount = 0, totalMeals = 0
    plan.days.forEach(day => {
      const t = getDayTotals(day)
      if (t.cal > 0) { total++; if (t.cal <= effectiveCal + 50) onTrack++ }
      const meals = [day[pk].breakfast, day[pk].lunch, day[pk].snack, day.dinner]
      meals.forEach(m => { if (m.meal) { totalMeals++; if (m.eaten) eatenCount++ } })
    })
    return { total, onTrack, eatenCount, totalMeals }
  }, [plan, pk, effectiveCal])

  // Weekly summary data
  const weeklySummary = useMemo(() => {
    let totalCal = 0, totalProtein = 0, daysWithData = 0
    plan.days.forEach(day => {
      const t = getDayTotals(day)
      if (t.cal > 0) { totalCal += t.cal; totalProtein += t.protein; daysWithData++ }
    })
    const avgCal = daysWithData > 0 ? Math.round(totalCal / daysWithData) : 0
    const avgProtein = daysWithData > 0 ? Math.round(totalProtein / daysWithData) : 0
    const adherence = weekProgress.totalMeals > 0 ? Math.round((weekProgress.eatenCount / weekProgress.totalMeals) * 100) : 0
    return { avgCal, avgProtein, daysWithData, adherence, onTrack: weekProgress.onTrack }
  }, [plan, pk, weekProgress])

  const wStats = useMemo(() => {
    const entries = weightEntries.filter(e => e.person === pk).sort((a, b) => a.date.localeCompare(b.date))
    if (!entries.length) return null
    const latest = entries[entries.length - 1], first = entries[0]
    const last7 = entries.slice(-7), avg7 = Math.round((last7.reduce((s, e) => s + e.weight, 0) / last7.length) * 10) / 10
    const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30)
    const last30 = entries.filter(e => new Date(e.date) >= thirtyAgo)
    const avg30 = last30.length > 0 ? Math.round((last30.reduce((s, e) => s + e.weight, 0) / last30.length) * 10) / 10 : avg7
    return { latest: latest.weight, first: first.weight, change: Math.round((latest.weight - first.weight) * 10) / 10, avg7, avg30, count: entries.length, toGoal: Math.round((latest.weight - goalWeight) * 10) / 10 }
  }, [weightEntries, pk, goalWeight])

  const CATS = ['Proteins', 'Produce', 'Dairy & Eggs', 'Pantry & Dry Goods', 'Condiments & Sauces', 'Other']

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /><p>Loading...</p></div>

  // ── Render helper for a meal block ──
  const MealBlock = ({ di, mt, label, placeholder }: { di: number; mt: string; label: string; placeholder: string }) => {
    const who = mt === 'dinner' ? 'shared' : pk
    const pm: PersonMeal = mt === 'dinner' ? plan.days[di].dinner : (plan.days[di][pk] as any)[mt]
    const locked = isLocked(di, who, mt)
    const isCalc = calculating === `${di}-${who}-${mt}`

    return (
      <div className={styles.mealBlock}>
        <div className={styles.sectionLabel}>
          {label}
          {pm.meal && (
            <button className={`${styles.eatenBtn} ${pm.eaten ? styles.eatenBtnActive : ''}`} onClick={() => toggleEaten(di, mt)}>
              {pm.eaten ? '✅ Eaten' : '○ Mark eaten'}
            </button>
          )}
        </div>
        <div className={styles.mealInputWithActions}>
          <div className={styles.mealInputRow}>
            <input type="text" placeholder={placeholder} value={pm.input}
              onChange={e => updateDay(di, d => mt === 'dinner' ? { ...d, dinner: { ...d.dinner, input: e.target.value } } : { ...d, [pk]: { ...d[pk], [mt]: { ...(d[pk] as any)[mt], input: e.target.value } } })}
              onKeyDown={e => { if (e.key === 'Enter' && pm.input.trim() && !locked) calculateMeal(di, mt, pm.input) }}
              disabled={isCalc || locked} />
            {!locked ? (
              <button className={styles.calcBtn} onClick={() => pm.input.trim() && calculateMeal(di, mt, pm.input)} disabled={isCalc || !pm.input.trim()}>{isCalc ? '...' : pm.meal ? '↺' : '→'}</button>
            ) : <div className={styles.lockedBadge}>🔒</div>}
            <button className={styles.presetPickerBtn} onClick={() => setPresetPicker({ di, mealType: mt })}>⭐</button>
          </div>
          {isCalc && <div className={styles.calcLoading}><span className={styles.btnSpinner} /> Calculating...</div>}
          {!isCalc && pm.meal && (
            <div className={`${styles.mealResult} ${locked ? styles.mealResultLocked : ''} ${pm.eaten ? styles.mealResultEaten : ''}`}>
              <div className={styles.mealResultHeader}>
                <div className={styles.mealResultName}>{locked && '🔒 '}{pm.meal.name}</div>
                <div className={styles.mealResultActions}>
                  {pm.meal && <button className={styles.actionBtn} onClick={() => setCopyTarget({ meal: pm, who, mealType: mt })} title="Copy">📋</button>}
                  <button className={`${styles.actionBtn} ${locked ? styles.actionBtnActive : ''}`} onClick={() => toggleLock(di, who, mt)}>{locked ? '🔓' : '🔒'}</button>
                  {!locked && <button className={styles.actionBtn} onClick={() => savePreset(pm.meal!, mt)}>⭐</button>}
                </div>
              </div>
              {pm.meal.description && <div className={styles.mealResultDesc}>{pm.meal.description}</div>}
              <div className={styles.mealResultMacros}>
                <span><strong>{pm.meal.cal}</strong> cal</span>
                <span>P <strong className={styles.proteinVal}>{pm.meal.protein}g</strong></span>
                <span>C <strong>{pm.meal.carbs}g</strong></span>
                <span>F <strong>{pm.meal.fat}g</strong></span>
              </div>
              {pm.meal.portions && pm.meal.portions.length > 0 && (
                <PortionsList portions={pm.meal.portions} editable={!locked} onRecalc={(pi, amt) => recalcPortion(di, mt, pi, amt)} onDelete={pi => delIngredient(di, mt, pi)} />
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.app}>
      {/* HEADER */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1>{profile.emoji} {profile.label}'s Meal Planner</h1>
            <p>{effectiveCal.toLocaleString()} cal · {profile.proteinTarget}g protein{effectiveCal !== profile.calTarget && <span className={styles.adaptiveBadge}> (adaptive)</span>}</p>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.switchBtn} onClick={onSwitch}>Switch</button>
            <button className={styles.themeToggle} onClick={onToggleTheme}>{theme === 'light' ? '🌙' : '☀️'}</button>
          </div>
        </div>
        {/* Quick water + progress */}
        <div className={styles.headerMini}>
          <div className={styles.waterMini}>
            <button onClick={subWater} className={styles.waterMiniBtn}>−</button>
            <span>💧 {todayWater?.glasses || 0}/8</span>
            <button onClick={addWater} className={styles.waterMiniBtn}>+</button>
          </div>
          {weekProgress.total > 0 && (
            <div className={styles.progressBarMini}>
              <div className={styles.progressFill} style={{ width: `${(weekProgress.onTrack / 7) * 100}%` }} />
              <span className={styles.progressText}>{weekProgress.onTrack}/7 on track</span>
            </div>
          )}
        </div>
      </div>

      {/* TABS */}
      <div className={styles.tabs}>
        {([['plan', '📋 Plan'], ['summary', '📊 Summary'], ['ideas', '💡 Ideas'], ['presets', '⭐ Presets'], ['scanned', '📷 Scan'], ['dislikes', '🚫 Dislikes'], ['grocery', '🛒 Grocery'], ['weight', '⚖️ Weight'], ['water', '💧 Water']] as [Tab, string][]).map(([t, l]) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.active : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {/* ═══ PLAN ═══ */}
      {tab === 'plan' && (<div>
        {/* Week nav */}
        <div className={styles.weekNav}>
          <button onClick={() => setWeekOffset(o => o - 1)}>← Prev</button>
          <span className={styles.weekLabel}>{getWeekLabel(weekId, weekOffset)}<br/><span className={styles.weekId}>{weekId}</span></span>
          <button onClick={() => setWeekOffset(o => o + 1)}>Next →</button>
        </div>

        <div className={styles.howTo}>
          <strong>How it works:</strong> Dinner first (shared). Then B + L + Snack. Lock meals to fix them. Remaining budget updates live. {effectiveCal !== profile.calTarget && `Your target auto-adjusted to ${effectiveCal} cal based on weight trend.`}
        </div>

        <div className={styles.dayGrid}>
          {plan.days.map((day, di) => {
            const totals = getDayTotals(day)
            const live = getLiveBudget(day)
            const isOpen = expandedDay === di
            const over = totals.cal > effectiveCal + 50

            return (
              <div key={day.day} className={`${styles.dayCard} ${isOpen ? styles.dayCardOpen : ''}`}>
                <button className={styles.dayHeader} onClick={() => setExpandedDay(isOpen ? -1 : di)}>
                  <div className={styles.dayHeaderLeft}>
                    <span className={styles.dayName}>{day.day}</span>
                    <span className={styles.dayTheme}>{day.theme}</span>
                  </div>
                  <div className={styles.dayHeaderRight}>
                    {totals.cal > 0 && <span className={`${styles.dayTotalPill} ${over ? styles.overBudget : ''}`}>{totals.cal} cal · {totals.protein}g P</span>}
                    <span className={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className={styles.dayBody}>
                    <MealBlock di={di} mt="dinner" label={`🍽️ Dinner (shared with ${user === 'evan' ? 'Liv' : 'Evan'})`} placeholder="e.g. sirloin steaks and baked potatoes" />

                    {/* Live budget bar */}
                    <div className={`${styles.budgetBar} ${live < 0 ? styles.budgetOver : ''}`}>
                      {live >= 0 ? `${live} cal remaining` : `${Math.abs(live)} cal over!`}
                    </div>

                    <MealBlock di={di} mt="breakfast" label="🌅 Breakfast" placeholder="e.g. scrambled eggs with turkey sausage" />
                    <MealBlock di={di} mt="lunch" label="☀️ Lunch" placeholder="e.g. taco salad with ground beef, lettuce, cheese" />
                    <MealBlock di={di} mt="snack" label="🍎 Snack (optional)" placeholder="e.g. protein shake, greek yogurt" />

                    {/* Day totals */}
                    {totals.cal > 0 && (
                      <div className={`${styles.dayTotals} ${over ? styles.dayTotalsOver : ''}`}>
                        <span>Total: <strong>{totals.cal}</strong> / {effectiveCal} cal {over && '⚠️'}</span>
                        <span>P: <strong className={totals.protein >= profile.proteinTarget ? styles.proteinGood : styles.proteinLow}>{totals.protein}g</strong>/{profile.proteinTarget}g</span>
                        <span>C: <strong>{totals.carbs}g</strong></span>
                        <span>F: <strong>{totals.fat}g</strong></span>
                      </div>
                    )}
                    <button className={styles.resetDayBtn} onClick={() => resetDay(di)}>🗑️ Clear day</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <button className={styles.groceryBtn} onClick={generateGrocery}>Generate grocery list →</button>
      </div>)}

      {/* ═══ SUMMARY ═══ */}
      {tab === 'summary' && (<div>
        <div className={styles.sectionIntro}><h2>📊 Weekly Summary</h2><p>{getWeekLabel(weekId, weekOffset)} · {weekId}</p></div>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Avg daily calories</div>
            <div className={`${styles.summaryValue} ${weeklySummary.avgCal <= effectiveCal ? styles.proteinGood : styles.proteinLow}`}>{weeklySummary.avgCal}<span className={styles.summaryUnit}>/{effectiveCal}</span></div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Avg daily protein</div>
            <div className={`${styles.summaryValue} ${weeklySummary.avgProtein >= profile.proteinTarget ? styles.proteinGood : styles.proteinLow}`}>{weeklySummary.avgProtein}g<span className={styles.summaryUnit}>/{profile.proteinTarget}g</span></div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Days on target</div>
            <div className={styles.summaryValue}>{weeklySummary.onTrack}<span className={styles.summaryUnit}>/7</span></div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Meals eaten</div>
            <div className={styles.summaryValue}>{weeklySummary.adherence}%<span className={styles.summaryUnit}> ({weekProgress.eatenCount}/{weekProgress.totalMeals})</span></div>
          </div>
        </div>
        {/* Per-day breakdown */}
        <h3 className={styles.summarySubhead}>Daily breakdown</h3>
        <div className={styles.summaryDays}>
          {plan.days.map((day, di) => {
            const t = getDayTotals(day)
            const ok = t.cal > 0 && t.cal <= effectiveCal + 50
            return (
              <div key={di} className={`${styles.summaryDayRow} ${t.cal === 0 ? styles.summaryDayEmpty : ok ? styles.summaryDayGood : styles.summaryDayOver}`}>
                <span className={styles.summaryDayName}>{day.day}</span>
                <span>{t.cal > 0 ? `${t.cal} cal · ${t.protein}g P` : '—'}</span>
                <span>{t.cal > 0 ? (ok ? '✅' : '⚠️') : ''}</span>
              </div>
            )
          })}
        </div>
        {wStats && (<div className={styles.summaryWeightSection}>
          <h3 className={styles.summarySubhead}>Weight trend</h3>
          <p className={styles.summaryWeightLine}>Current: <strong>{wStats.latest} lbs</strong> · 7d avg: <strong>{wStats.avg7}</strong> · Goal: <strong>{goalWeight}</strong> · To go: <strong className={wStats.toGoal <= 0 ? styles.proteinGood : ''}>{wStats.toGoal} lbs</strong></p>
        </div>)}
      </div>)}

      {/* ═══ IDEAS ═══ */}
      {tab === 'ideas' && (<div>
        <div className={styles.sectionIntro}><h2>Meal Ideas for {profile.label}</h2><p>AI-generated meals within your {effectiveCal} cal target. Now includes snack ideas.</p></div>
        {getMyDislikes().length > 0 && <div className={styles.ideasExcluding}><span className={styles.excludeLabel}>Excluding:</span>{getMyDislikes().map(d => <span key={d} className={styles.excludeTag}>{d}</span>)}</div>}
        <button className={styles.primaryBtn} onClick={generateIdeas} disabled={ideasLoading}>{ideasLoading ? <><span className={styles.btnSpinner} /> Generating...</> : '✨ Generate meal ideas'}</button>
        {ideasLoading && <div className={styles.loadingState}><div className={styles.spinner} /><p>Creating ideas...</p></div>}
        {!ideasLoading && !ideas && <div className={styles.emptyState}><div className={styles.emptyIcon}>💡</div><p>Hit generate for personalized ideas.</p></div>}
        {!ideasLoading && ideas && (
          <div className={styles.ideasResults}>
            {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mt => (
              <div key={mt} className={styles.ideasSection}>
                <h3>{mt === 'breakfast' ? '🌅' : mt === 'lunch' ? '☀️' : mt === 'snack' ? '🍎' : '🌙'} {mt.charAt(0).toUpperCase() + mt.slice(1)}</h3>
                <div className={styles.ideasGrid}>
                  {(ideas as any)[mt]?.map((idea: MealIdea, idx: number) => (
                    <div key={idx} className={styles.ideaCard}>
                      <div className={styles.ideaName}>{idea.name}</div>
                      <div className={styles.ideaDesc}>{idea.description}</div>
                      <div className={styles.ideaMacros}><span><strong>{idea.cal}</strong> cal</span><span className={styles.proteinVal}>P {idea.protein}g</span><span>C {idea.carbs}g</span><span>F {idea.fat}g</span></div>
                      <button className={styles.useIdeaBtn} onClick={() => setApplyIdeaTarget({ idea, mealType: mt })}>Use this →</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>)}

      {/* ═══ PRESETS ═══ */}
      {tab === 'presets' && (<div>
        <div className={styles.sectionIntro}><h2>Saved Presets</h2><p>Click to expand. Shared between both users.</p></div>
        {presets.length === 0 ? <div className={styles.emptyState}><div className={styles.emptyIcon}>⭐</div><p>No presets yet.</p></div> : (
          <div className={styles.presetsList}>
            {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mt => {
              const items = presets.filter(p => p.mealType === mt); if (!items.length) return null
              return (<div key={mt}><h3 className={styles.presetCatTitle}>{mt === 'breakfast' ? '🌅' : mt === 'lunch' ? '☀️' : mt === 'snack' ? '🍎' : '🌙'} {mt.charAt(0).toUpperCase() + mt.slice(1)}</h3>
                {items.map(p => (<div key={p.id} className={styles.presetCard}>
                  <div className={styles.presetCardHeader} onClick={() => setExpandedPreset(expandedPreset === p.id ? null : p.id)}>
                    <div><div className={styles.presetName}>{p.name}</div><div className={styles.presetMeta}>{p.who === 'shared' ? 'Shared' : p.who === 'his' ? 'Evan' : 'Liv'} · <strong>{p.cal}</strong> cal · <span className={styles.proteinVal}>P {p.protein}g</span></div></div>
                    <span className={styles.chevron}>{expandedPreset === p.id ? '▲' : '▼'}</span>
                  </div>
                  {expandedPreset === p.id && (<div className={styles.presetBody}>{p.portions.map((pt, i) => (<div key={i} className={styles.presetRow}><span>{pt.ingredient}</span><span>{pt.amount}</span><span className={styles.portionCal}>{pt.cal} cal</span></div>))}<button className={styles.dangerBtn} onClick={() => deletePreset(p.id)}>Delete</button></div>)}
                </div>))}
              </div>)
            })}
          </div>
        )}
      </div>)}

      {/* ═══ SCANNED ═══ */}
      {tab === 'scanned' && (<div>
        <div className={styles.sectionIntro}><h2>📷 Scanned Foods</h2><p>Barcode data feeds into meal calculations for accuracy.</p></div>
        <div className={styles.scanInputSection}>
          <div className={styles.scanInputRow}>
            <input type="text" inputMode="numeric" value={barcodeInput} placeholder="Barcode number..." onChange={e => { setBarcodeInput(e.target.value); setScanError('') }} onKeyDown={e => { if (e.key === 'Enter') scanBarcode() }} disabled={scanning} />
            <button className={styles.scanBtn} onClick={() => scanBarcode()} disabled={scanning || !barcodeInput.trim()}>{scanning ? '...' : '🔍'}</button>
          </div>
          <label className={styles.cameraScanBtn}>📸 Scan with camera<input type="file" accept="image/*" capture="environment" className={styles.hidden}
            onChange={async (e) => {
              const file = e.target.files?.[0]; if (!file) return; setScanError('')
              if ('BarcodeDetector' in window) {
                try {
                  const bmp = await createImageBitmap(file)
                  const det = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
                  const res = await det.detect(bmp)
                  if (res.length > 0) { setBarcodeInput(res[0].rawValue); await scanBarcode(res[0].rawValue) }
                  else setScanError('No barcode found in image.')
                } catch { setScanError('Could not read barcode.') }
              } else setScanError('Camera scanning not supported. Enter manually.')
              e.target.value = ''
            }} /></label>
          {scanError && <div className={styles.scanError}>{scanError}</div>}
        </div>
        {scannedFoods.length === 0 ? <div className={styles.emptyState}><div className={styles.emptyIcon}>📷</div><p>No foods scanned yet.</p></div> : (
          <div className={styles.scannedList}><div className={styles.scannedCount}>{scannedFoods.length} foods</div>
            {scannedFoods.map(f => (<div key={f.id} className={styles.scannedCard}>
              <div className={styles.scannedHeader} onClick={() => setExpandedScanned(expandedScanned === f.id ? null : f.id)}>
                <div className={styles.scannedInfo}>{f.imageUrl && <img src={f.imageUrl} alt="" className={styles.scannedImg} />}<div><div className={styles.scannedName}>{f.name}</div>{f.brand && <div className={styles.scannedBrand}>{f.brand}</div>}</div></div>
                <div className={styles.scannedPill}><strong>{f.cal}</strong> cal · <span className={styles.proteinVal}>P {f.protein}g</span></div>
              </div>
              {expandedScanned === f.id && (<div className={styles.scannedBody}>
                <div className={styles.macroGrid}><div><small>Serving</small><strong>{f.servingSize}</strong></div><div><small>Carbs</small><strong>{f.carbs}g</strong></div><div><small>Fat</small><strong>{f.fat}g</strong></div><div><small>Fiber</small><strong>{f.fiber}g</strong></div></div>
                <button className={styles.dangerBtn} onClick={() => delScanned(f.id)}>Remove</button>
              </div>)}
            </div>))}
          </div>
        )}
      </div>)}

      {/* ═══ DISLIKES ═══ */}
      {tab === 'dislikes' && (<div>
        <div className={styles.sectionIntro}><h2>{profile.label}'s Dislikes</h2><p>Excluded from all calculations and ideas.</p></div>
        <div className={styles.inputRow}><input type="text" value={dislikeInput} placeholder="Add a food..." onChange={e => setDislikeInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { addDislike(dislikeInput); setDislikeInput('') } }} /><button className={styles.addBtn} onClick={() => { addDislike(dislikeInput); setDislikeInput('') }}>Add</button></div>
        <div className={styles.tagList}>{getMyDislikes().length === 0 ? <span className={styles.muted}>None added</span> : getMyDislikes().map(i => <span key={i} className={styles.tag}>{i}<button onClick={() => removeDislike(i)}>×</button></span>)}</div>
      </div>)}

      {/* ═══ GROCERY ═══ */}
      {tab === 'grocery' && (<div>
        <div className={styles.groceryHeader}><p>Both Evan & Liv's meals including snacks.</p><button className={styles.secondaryBtn} onClick={generateGrocery} disabled={groceryLoading}>{groceryLoading ? '...' : '↺ Regenerate'}</button></div>
        {groceryLoading && <div className={styles.loadingState}><div className={styles.spinner} /><p>Building list...</p></div>}
        {!groceryLoading && !grocery && <div className={styles.emptyState}><div className={styles.emptyIcon}>🛒</div><p>Fill in meals, then generate.</p></div>}
        {!groceryLoading && grocery && <div className={styles.groceryList}>{CATS.map(cat => { const items = grocery.filter(i => i.category === cat); if (!items.length) return null; return (<div key={cat}><h3 className={styles.groceryCat}>{cat}</h3><div className={styles.groceryItems}>{items.map((item, i) => (<div key={i} className={styles.groceryItem}><span>{item.name}</span><span className={styles.muted}>{item.amount}</span></div>))}</div></div>) })}</div>}
      </div>)}

      {/* ═══ WEIGHT ═══ */}
      {tab === 'weight' && (<div>
        <div className={styles.sectionIntro}><h2>{profile.label}'s Weight</h2><p>Log regularly. We show running averages + trend toward your goal.</p></div>
        <div className={styles.inputRow}>
          <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)} />
          <input type="number" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="lbs" step="0.1" className={styles.weightNumField} onKeyDown={e => { if (e.key === 'Enter') addWeight() }} />
          <button className={styles.addBtn} onClick={addWeight}>Log</button>
        </div>
        <div className={styles.inputRow} style={{ marginTop: 8 }}>
          <span className={styles.muted}>Goal:</span>
          <input type="number" value={goalWeight} onChange={e => setGoal(parseFloat(e.target.value) || 0)} step="1" className={styles.goalWeightInput} />
          <span className={styles.muted}>lbs</span>
        </div>
        {wStats && (<div className={`${styles.summaryGrid} ${styles.weightStatsGrid}`}>
          <div className={styles.summaryCard}><div className={styles.summaryLabel}>Current</div><div className={styles.summaryValue}>{wStats.latest} lbs</div></div>
          <div className={styles.summaryCard}><div className={styles.summaryLabel}>7d avg</div><div className={styles.summaryValue}>{wStats.avg7}</div></div>
          <div className={styles.summaryCard}><div className={styles.summaryLabel}>30d avg</div><div className={styles.summaryValue}>{wStats.avg30}</div></div>
          <div className={styles.summaryCard}><div className={styles.summaryLabel}>To goal</div><div className={`${styles.summaryValue} ${wStats.toGoal <= 0 ? styles.proteinGood : styles.proteinLow}`}>{wStats.toGoal > 0 ? '-' : '+'}{Math.abs(wStats.toGoal)} lbs</div></div>
        </div>)}
        {(() => {
          const entries = weightEntries.filter(e => e.person === pk).sort((a, b) => a.date.localeCompare(b.date))
          if (!entries.length) return null
          const minW = Math.min(...entries.map(e => e.weight), goalWeight) - 3
          const maxW = Math.max(...entries.map(e => e.weight)) + 3
          const range = maxW - minW || 1
          const goalPct = ((goalWeight - minW) / range) * 100
          return (<div className={styles.weightChartBlock}><h4>Progress (last 30 entries)</h4>
            <div className={styles.weightChart} style={{ position: 'relative' }}>
              <div className={styles.goalLine} style={{ bottom: `${goalPct}%` }}><span>Goal: {goalWeight}</span></div>
              {entries.slice(-30).map((e, i) => {
                const pct = ((e.weight - minW) / range) * 100
                const prev = i > 0 ? entries[Math.max(0, entries.indexOf(e) - 1)].weight : e.weight
                return (<div key={e.id} className={styles.weightBar}><div className={`${styles.weightBarFill} ${e.weight <= prev ? styles.weightBarDown : styles.weightBarUp}`} style={{ height: `${pct}%` }} /><div className={styles.weightBarLabel}>{e.weight}</div><div className={styles.weightBarDate}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div></div>)
              })}
            </div>
          </div>)
        })()}
        {weightEntries.filter(e => e.person === pk).length > 0 && (
          <div className={styles.logList}><h4>All entries</h4>{[...weightEntries].filter(e => e.person === pk).reverse().map(e => (
            <div key={e.id} className={styles.logRow}><span className={styles.muted}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</span><span><strong>{e.weight}</strong> lbs</span><button className={styles.delBtn} onClick={() => delWeight(e.id)}>×</button></div>
          ))}</div>
        )}
      </div>)}

      {/* ═══ WATER ═══ */}
      {tab === 'water' && (<div>
        <div className={styles.sectionIntro}><h2>💧 Water Tracker</h2><p>Aim for 8 glasses (64 oz) daily. Staying hydrated helps with satiety and weight loss.</p></div>
        <div className={styles.waterMain}>
          <div className={styles.waterCount}>{todayWater?.glasses || 0}</div>
          <div className={styles.waterLabel}>glasses today</div>
          <div className={styles.waterTarget}>{(todayWater?.glasses || 0) >= 8 ? '✅ Goal reached!' : `${8 - (todayWater?.glasses || 0)} more to go`}</div>
          <div className={styles.waterBtns}>
            <button className={styles.waterBtn} onClick={subWater}>−</button>
            <button className={styles.waterBtnAdd} onClick={addWater}>+ Add glass</button>
          </div>
        </div>
        {/* 7-day history */}
        <h4 style={{ marginTop: 24, marginBottom: 8, fontSize: 13, fontWeight: 600 }}>Last 7 days</h4>
        <div className={styles.waterHistory}>
          {Array.from({ length: 7 }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (6 - i))
            const ds = d.toISOString().split('T')[0]
            const entry = waterEntries.find(w => w.person === pk && w.date === ds)
            return (<div key={ds} className={styles.waterHistDay}>
              <div className={styles.waterHistLabel}>{d.toLocaleDateString('en', { weekday: 'short' })}</div>
              <div className={`${styles.waterHistBar} ${(entry?.glasses || 0) >= 8 ? styles.waterHistFull : ''}`} style={{ height: `${Math.min((entry?.glasses || 0) / 8, 1) * 60}px` }} />
              <div className={styles.waterHistCount}>{entry?.glasses || 0}</div>
            </div>)
          })}
        </div>
      </div>)}

      {/* ═══ DIALOGS ═══ */}
      {copyTarget && (<div className={styles.overlay} onClick={() => setCopyTarget(null)}><div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.dialogHeader}><h3>Copy to which day?</h3><button className={styles.dialogClose} onClick={() => setCopyTarget(null)}>×</button></div>
        <div className={styles.dialogBody}>
          <div className={styles.dialogInfo}>{copyTarget.meal.meal?.name} · {copyTarget.meal.meal?.cal} cal</div>
          {DAYS_META.map((m, di) => (<button key={di} className={styles.dialogDayBtn} onClick={() => copyMealToDay(di)}>{m.name}<span className={styles.muted}>{m.theme}</span></button>))}
        </div>
      </div></div>)}

      {applyIdeaTarget && (<div className={styles.overlay} onClick={() => setApplyIdeaTarget(null)}><div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.dialogHeader}><h3>Add to which day?</h3><button className={styles.dialogClose} onClick={() => setApplyIdeaTarget(null)}>×</button></div>
        <div className={styles.dialogBody}>
          <div className={styles.dialogInfo}>{applyIdeaTarget.idea.name} · {applyIdeaTarget.idea.cal} cal</div>
          {DAYS_META.map((m, di) => (<button key={di} className={styles.dialogDayBtn} onClick={() => applyIdea(di)}>{m.name}<span className={styles.muted}>{m.theme}</span></button>))}
        </div>
      </div></div>)}

      {presetPicker && (<div className={styles.overlay} onClick={() => setPresetPicker(null)}><div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <div className={styles.dialogHeader}><h3>Choose a Preset</h3><button className={styles.dialogClose} onClick={() => setPresetPicker(null)}>×</button></div>
        <div className={styles.dialogBody}>
          {(() => { const who = presetPicker.mealType === 'dinner' ? 'shared' : pk; const rel = presets.filter(p => p.mealType === presetPicker.mealType && (p.who === who || p.who === 'shared')); return rel.length === 0 ? <p className={styles.muted}>No presets for this meal type.</p> : rel.map(p => (<button key={p.id} className={styles.dialogDayBtn} onClick={() => applyPreset(p, presetPicker.di, presetPicker.mealType)}>{p.name}<span className={styles.muted}>{p.cal} cal · P {p.protein}g</span></button>)) })()}
        </div>
      </div></div>)}
    </div>
  )
}

// ═══════════ PORTIONS LIST ═══════════
function PortionsList({ portions, editable, onRecalc, onDelete }: { portions: PortionItem[]; editable: boolean; onRecalc: (pi: number, amt: string) => void; onDelete: (pi: number) => void }) {
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const commit = async (i: number) => { if (editVal.trim()) await onRecalc(i, editVal.trim()); setEditIdx(null) }

  return (
    <div className={styles.portionList}>
      {editable && <div className={styles.portionHint}>Tap amount to edit · × to remove</div>}
      {portions.map((p, i) => (
        <div key={i} className={`${styles.portionItem} ${editable ? styles.portionItemEdit : ''}`}>
          <span className={styles.portionIng}>{p.ingredient}</span>
          {editable && editIdx === i ? (
            <input className={styles.portionInput} value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => commit(i)} onKeyDown={e => { if (e.key === 'Enter') commit(i); if (e.key === 'Escape') setEditIdx(null) }} autoFocus />
          ) : (
            <span className={`${styles.portionAmt} ${editable ? styles.portionAmtClick : ''}`} onClick={() => editable && (setEditIdx(i), setEditVal(p.amount))}>{p.amount}</span>
          )}
          <span className={styles.portionCal}>{p.cal} cal</span>
          <span className={styles.proteinVal}>{p.protein}g P</span>
          {editable && <button className={styles.delBtn} onClick={() => onDelete(i)}>×</button>}
        </div>
      ))}
    </div>
  )
}
