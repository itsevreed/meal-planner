'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { MealPlan, DayPlan, PersonMeal, MacroMeal, PortionItem, Dislikes, GroceryItem, MealIdea, PresetMeal, WeightEntry, ScannedFood } from '@/lib/types'
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
  evan: { label: 'Evan', key: 'his' as const, calTarget: 1820, proteinTarget: 160, emoji: '💪' },
  liv:  { label: 'Liv',  key: 'her' as const, calTarget: 1490, proteinTarget: 130, emoji: '✨' },
}

function emptyPersonMeal(): PersonMeal { return { input: '', meal: null } }
function emptyDay(meta: typeof DAYS_META[0]): DayPlan {
  return {
    day: meta.name, theme: meta.theme,
    his: { breakfast: emptyPersonMeal(), lunch: emptyPersonMeal(), snack: emptyPersonMeal() },
    her: { breakfast: emptyPersonMeal(), lunch: emptyPersonMeal(), snack: emptyPersonMeal() },
    dinner: emptyPersonMeal(),
  }
}

type Tab = 'plan' | 'ideas' | 'presets' | 'dislikes' | 'grocery' | 'weight' | 'scanned'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('meal-planner-user') : null
    if (saved === 'evan' || saved === 'liv') setUser(saved)
    // Load theme preference
    const savedTheme = typeof window !== 'undefined' ? localStorage.getItem('meal-planner-theme') : null
    if (savedTheme === 'dark' || savedTheme === 'light') {
      setTheme(savedTheme)
      document.documentElement.setAttribute('data-theme', savedTheme)
    } else if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark')
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('meal-planner-theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const selectUser = (u: User) => {
    localStorage.setItem('meal-planner-user', u)
    setUser(u)
  }

  const switchUser = () => {
    localStorage.removeItem('meal-planner-user')
    setUser(null)
  }

  if (!user) return <LoginScreen onSelect={selectUser} theme={theme} onToggleTheme={toggleTheme} />
  return <AppMain user={user} onSwitch={switchUser} theme={theme} onToggleTheme={toggleTheme} />
}

// ═══════════ LOGIN SCREEN ═══════════
function LoginScreen({ onSelect, theme, onToggleTheme }: { onSelect: (u: User) => void; theme: string; onToggleTheme: () => void }) {
  return (
    <div className={styles.loginScreen}>
      <button className={styles.themeToggleFloat} onClick={onToggleTheme} title="Toggle dark/light mode">
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
      <div className={styles.loginCard}>
        <h1 className={styles.loginTitle}>Meal Planner</h1>
        <p className={styles.loginSub}>High-protein weekly meals · weight loss mode</p>
        <div className={styles.loginPrompt}>Who's planning?</div>
        <div className={styles.loginButtons}>
          <button className={styles.loginBtn} onClick={() => onSelect('evan')}>
            <span className={styles.loginEmoji}>💪</span>
            <span className={styles.loginName}>Evan</span>
            <span className={styles.loginStats}>1,820 cal · 160g protein</span>
          </button>
          <button className={styles.loginBtn} onClick={() => onSelect('liv')}>
            <span className={styles.loginEmoji}>✨</span>
            <span className={styles.loginName}>Liv</span>
            <span className={styles.loginStats}>1,490 cal · 130g protein</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════ MAIN APP ═══════════
function AppMain({ user, onSwitch, theme, onToggleTheme }: { user: User; onSwitch: () => void; theme: string; onToggleTheme: () => void }) {
  const profile = PROFILES[user]
  const personKey = profile.key // 'his' or 'her'

  const [tab, setTab] = useState<Tab>('plan')
  const [plan, setPlan] = useState<MealPlan>(() => ({ days: DAYS_META.map(emptyDay) }))
  const [dislikes, setDislikes] = useState<Dislikes>({ his: [], her: [] })
  const [dislikeInput, setDislikeInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState<string | null>(null)
  const [grocery, setGrocery] = useState<GroceryItem[] | null>(null)
  const [groceryLoading, setGroceryLoading] = useState(false)
  const [expandedDay, setExpandedDay] = useState<number>(0)

  // Ideas
  const [ideas, setIdeas] = useState<{ breakfast: MealIdea[], lunch: MealIdea[], dinner: MealIdea[] } | null>(null)
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [selectedIdeas, setSelectedIdeas] = useState<{ breakfast: number | null, lunch: number | null, dinner: number | null }>({ breakfast: null, lunch: null, dinner: null })

  // Presets
  const [presets, setPresets] = useState<PresetMeal[]>([])
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null)

  // Weight
  const [weightEntries, setWeightEntries] = useState<WeightEntry[]>([])
  const [weightInput, setWeightInput] = useState('')
  const [weightDate, setWeightDate] = useState(() => new Date().toISOString().split('T')[0])

  // Scanned foods
  const [scannedFoods, setScannedFoods] = useState<ScannedFood[]>([])
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [expandedScanned, setExpandedScanned] = useState<string | null>(null)

  // Locks
  const [lockedMeals, setLockedMeals] = useState<Set<string>>(new Set())
  const toggleLock = (di: number, who: string, mt: string) => {
    const key = `${di}-${who}-${mt}`
    setLockedMeals(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })
  }
  const isLocked = (di: number, who: string, mt: string) => lockedMeals.has(`${di}-${who}-${mt}`)

  // Copy
  const [copyTarget, setCopyTarget] = useState<{ meal: PersonMeal; who: string; mealType: string } | null>(null)
  const copyMealToDay = (targetDi: number) => {
    if (!copyTarget) return
    const { meal: pm, who, mealType } = copyTarget
    updateDay(targetDi, (d) => {
      if (mealType === 'dinner') return { ...d, dinner: { ...pm } }
      return { ...d, [who]: { ...(d as any)[who], [mealType]: { ...pm } } }
    })
    setCopyTarget(null)
  }

  // Preset picker
  const [presetPicker, setPresetPicker] = useState<{ di: number; mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' } | null>(null)

  const getMyDislikes = () => dislikes[personKey]
  const getAllDislikes = () => [...dislikes.his, ...dislikes.her]

  const sanitizePlan = (raw: any): MealPlan => {
    const safeMeal = (m: any): PersonMeal => ({ input: typeof m?.input === 'string' ? m.input : '', meal: m?.meal ?? null })
    return {
      days: DAYS_META.map((meta, i) => {
        const d = raw?.days?.[i] ?? {}
        return {
          day: meta.name, theme: meta.theme,
          his: { breakfast: safeMeal(d?.his?.breakfast), lunch: safeMeal(d?.his?.lunch), snack: safeMeal(d?.his?.snack) },
          her: { breakfast: safeMeal(d?.her?.breakfast), lunch: safeMeal(d?.her?.lunch), snack: safeMeal(d?.her?.snack) },
          dinner: safeMeal(d?.dinner),
        }
      })
    }
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const { data: dd } = await supabase.from('dislikes').select('*')
      if (dd) setDislikes({ his: dd.filter(d => d.person === 'his').map(d => d.item), her: dd.filter(d => d.person === 'her').map(d => d.item) })

      const { data: pd } = await supabase.from('meal_plan').select('*').order('created_at', { ascending: false }).limit(1).single()
      if (pd?.plan) setPlan(sanitizePlan(pd.plan))

      const { data: pr } = await supabase.from('preset_meals').select('*').order('created_at', { ascending: false })
      if (pr) setPresets(pr.map((p: any) => ({ id: p.id, name: p.name, mealType: p.meal_type, who: p.who, cal: p.cal, protein: p.protein, carbs: p.carbs, fat: p.fat, portions: p.portions || [], createdAt: p.created_at })))

      const { data: wd } = await supabase.from('weight_entries').select('*').order('date', { ascending: true })
      if (wd) setWeightEntries(wd.map((w: any) => ({ id: w.id, person: w.person, weight: w.weight, date: w.date, createdAt: w.created_at })))

      const { data: sf } = await supabase.from('scanned_foods').select('*').order('created_at', { ascending: false })
      if (sf) setScannedFoods(sf.map((s: any) => ({ id: s.id, barcode: s.barcode, name: s.name, brand: s.brand, servingSize: s.serving_size, cal: s.cal, protein: s.protein, carbs: s.carbs, fat: s.fat, fiber: s.fiber || 0, sugar: s.sugar || 0, imageUrl: s.image_url || '', createdAt: s.created_at })))
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

  // ── Calculate meal ──
  const calculateMeal = async (di: number, mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack', input: string) => {
    if (!input.trim()) return
    const who = mealType === 'dinner' ? 'shared' : personKey
    const key = `${di}-${who}-${mealType}`
    if (isLocked(di, who, mealType)) return
    setCalculating(key)

    const day = plan.days[di]
    const dinnerCal = day.dinner.meal?.cal || 0
    const remainingCals = profile.calTarget - dinnerCal
    const personDislikes = mealType === 'dinner' ? getAllDislikes() : getMyDislikes()

    // Check locked siblings (all of breakfast, lunch, snack except current)
    let lockedSiblingCals = 0
    if (mealType !== 'dinner') {
      const siblings = (['breakfast', 'lunch', 'snack'] as const).filter(m => m !== mealType)
      for (const sib of siblings) {
        if (isLocked(di, personKey, sib) && day[personKey][sib].meal) {
          lockedSiblingCals += day[personKey][sib].meal!.cal
        }
      }
    }

    // Pass scanned foods for accurate nutrition lookup
    const scannedFoodsData = scannedFoods.map(f => ({ name: f.name, brand: f.brand, servingSize: f.servingSize, cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat }))

    try {
      const res = await fetch('/api/calculate-meal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mealInput: input, mealType: mealType === 'snack' ? 'snack' : mealType,
          person: mealType === 'dinner' ? 'shared' : personKey,
          remainingCals, targetProtein: profile.proteinTarget,
          dinnerMacros: day.dinner.meal,
          dislikes: personDislikes,
          lockedMealsCals: lockedSiblingCals,
          scannedFoods: scannedFoodsData,
        }),
      })
      const { meal } = await res.json()
      updateDay(di, d => {
        if (mealType === 'dinner') return { ...d, dinner: { input, meal } }
        return { ...d, [personKey]: { ...d[personKey], [mealType]: { input, meal } } }
      })
    } catch { alert('Failed to calculate.') }
    setCalculating(null)
  }

  // ── Recalculate portion ──
  const recalculatePortions = async (di: number, mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack', portionIndex: number, newAmount: string) => {
    const who = mealType === 'dinner' ? 'shared' : personKey
    const day = plan.days[di]
    const pm: PersonMeal = mealType === 'dinner' ? day.dinner : day[personKey][mealType]
    if (!pm.meal?.portions) return
    try {
      const res = await fetch('/api/recalculate-portions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portions: pm.meal.portions, editedIndex: portionIndex, newAmount, originalMeal: pm.meal }),
      })
      const { result } = await res.json()
      if (!result) return
      updateDay(di, d => {
        const newMeal = { ...pm.meal!, portions: result.portions, cal: result.cal, protein: result.protein, carbs: result.carbs, fat: result.fat }
        if (mealType === 'dinner') return { ...d, dinner: { ...d.dinner, meal: newMeal } }
        return { ...d, [personKey]: { ...d[personKey], [mealType]: { ...d[personKey][mealType], meal: newMeal } } }
      })
    } catch {}
  }

  // ── Delete ingredient ──
  const deleteIngredient = (di: number, mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack', portionIndex: number) => {
    updateDay(di, d => {
      const pm: PersonMeal = mealType === 'dinner' ? d.dinner : d[personKey][mealType]
      if (!pm.meal?.portions) return d
      const newPortions = pm.meal.portions.filter((_, i) => i !== portionIndex)
      const totals = newPortions.reduce((a, p) => ({ cal: a.cal + p.cal, protein: a.protein + p.protein, carbs: a.carbs + p.carbs, fat: a.fat + p.fat }), { cal: 0, protein: 0, carbs: 0, fat: 0 })
      const newMeal = { ...pm.meal, portions: newPortions, ...totals }
      if (mealType === 'dinner') return { ...d, dinner: { ...d.dinner, meal: newMeal } }
      return { ...d, [personKey]: { ...d[personKey], [mealType]: { ...d[personKey][mealType], meal: newMeal } } }
    })
  }

  // ── Grocery ──
  const generateGrocery = async () => {
    setGroceryLoading(true); setTab('grocery')
    try {
      const res = await fetch('/api/grocery-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) })
      const { items } = await res.json()
      setGrocery(items)
    } catch { alert('Failed to generate grocery list.') }
    setGroceryLoading(false)
  }

  // ── Ideas ──
  const generateIdeas = async () => {
    setIdeasLoading(true); setSelectedIdeas({ breakfast: null, lunch: null, dinner: null }); setIdeas(null)
    const dinnerCal = Math.round(profile.calTarget * 0.33)
    const breakfastCal = Math.round((profile.calTarget - dinnerCal) * 0.42)
    const lunchCal = profile.calTarget - dinnerCal - breakfastCal
    try {
      const res = await fetch('/api/meal-ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ who: personKey, dislikes: getMyDislikes(), calBudget: { breakfast: breakfastCal, lunch: lunchCal, dinner: dinnerCal }, proteinTarget: profile.proteinTarget }) })
      const { ideas: ni } = await res.json()
      setIdeas(ni)
    } catch { alert('Failed to generate ideas.') }
    setIdeasLoading(false)
  }

  // ── Dislikes ──
  const addDislike = async (item: string) => {
    const t = item.trim().toLowerCase()
    if (!t || dislikes[personKey].includes(t)) return
    await supabase.from('dislikes').insert({ person: personKey, item: t })
    setDislikes(prev => ({ ...prev, [personKey]: [...prev[personKey], t] }))
  }
  const removeDislike = async (item: string) => {
    await supabase.from('dislikes').delete().eq('person', personKey).eq('item', item)
    setDislikes(prev => ({ ...prev, [personKey]: prev[personKey].filter(x => x !== item) }))
  }

  // ── Presets ──
  const saveAsPreset = async (meal: MacroMeal, mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
    const who = mealType === 'dinner' ? 'shared' : personKey
    const { data } = await supabase.from('preset_meals').insert({ name: meal.name, meal_type: mealType, who, cal: meal.cal, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, portions: meal.portions || [] }).select().single()
    if (data) setPresets(prev => [{ id: data.id, name: data.name, mealType: data.meal_type, who: data.who, cal: data.cal, protein: data.protein, carbs: data.carbs, fat: data.fat, portions: data.portions || [], createdAt: data.created_at }, ...prev])
  }
  const deletePreset = async (id: string) => { await supabase.from('preset_meals').delete().eq('id', id); setPresets(prev => prev.filter(p => p.id !== id)) }
  const applyPreset = (preset: PresetMeal, di: number, mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack') => {
    const meal: MacroMeal = { name: preset.name, cal: preset.cal, protein: preset.protein, carbs: preset.carbs, fat: preset.fat, portions: preset.portions }
    updateDay(di, d => {
      if (mealType === 'dinner') return { ...d, dinner: { input: preset.name, meal } }
      return { ...d, [personKey]: { ...d[personKey], [mealType]: { input: preset.name, meal } } }
    })
    setPresetPicker(null)
  }

  // ── Weight ──
  const addWeightEntry = async () => {
    const w = parseFloat(weightInput)
    if (isNaN(w) || w < 50 || w > 500) { alert('Enter a valid weight.'); return }
    const { data } = await supabase.from('weight_entries').insert({ person: personKey, weight: w, date: weightDate }).select().single()
    if (data) { setWeightEntries(prev => [...prev, { id: data.id, person: data.person, weight: data.weight, date: data.date, createdAt: data.created_at }].sort((a, b) => a.date.localeCompare(b.date))); setWeightInput('') }
  }
  const deleteWeightEntry = async (id: string) => { await supabase.from('weight_entries').delete().eq('id', id); setWeightEntries(prev => prev.filter(w => w.id !== id)) }

  // ── Barcode scanning ──
  const scanBarcode = async () => {
    if (!barcodeInput.trim()) return
    setScanning(true); setScanError('')
    try {
      const res = await fetch('/api/scan-barcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode: barcodeInput.trim() }) })
      const data = await res.json()
      if (data.error) { setScanError(data.error); setScanning(false); return }
      const f = data.food
      // Save to Supabase
      const { data: saved } = await supabase.from('scanned_foods').insert({
        barcode: f.barcode, name: f.name, brand: f.brand, serving_size: f.servingSize,
        cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, sugar: f.sugar, image_url: f.imageUrl,
      }).select().single()
      if (saved) {
        setScannedFoods(prev => [{ id: saved.id, barcode: saved.barcode, name: saved.name, brand: saved.brand, servingSize: saved.serving_size, cal: saved.cal, protein: saved.protein, carbs: saved.carbs, fat: saved.fat, fiber: saved.fiber || 0, sugar: saved.sugar || 0, imageUrl: saved.image_url || '', createdAt: saved.created_at }, ...prev])
      }
      setBarcodeInput('')
    } catch { setScanError('Failed to scan. Check the barcode and try again.') }
    setScanning(false)
  }
  const deleteScannedFood = async (id: string) => { await supabase.from('scanned_foods').delete().eq('id', id); setScannedFoods(prev => prev.filter(s => s.id !== id)) }

  // ── Computed ──
  const getDayTotals = (day: DayPlan) => {
    const meals = [day[personKey].breakfast.meal, day[personKey].lunch.meal, day[personKey].snack.meal, day.dinner.meal]
    return meals.reduce((a, m) => ({ cal: a.cal + (m?.cal || 0), protein: a.protein + (m?.protein || 0), carbs: a.carbs + (m?.carbs || 0), fat: a.fat + (m?.fat || 0) }), { cal: 0, protein: 0, carbs: 0, fat: 0 })
  }

  const getWeeklyProgress = () => {
    let total = 0, onTrack = 0
    plan.days.forEach(day => { const t = getDayTotals(day); if (t.cal > 0) { total++; if (t.cal <= profile.calTarget + 50) onTrack++ } })
    return { total, onTrack }
  }

  const getWeightStats = () => {
    const entries = weightEntries.filter(e => e.person === personKey).sort((a, b) => a.date.localeCompare(b.date))
    if (!entries.length) return null
    const latest = entries[entries.length - 1], first = entries[0]
    const last7 = entries.slice(-7), avg7 = last7.reduce((s, e) => s + e.weight, 0) / last7.length
    const thirtyAgo = new Date(); thirtyAgo.setDate(thirtyAgo.getDate() - 30)
    const last30 = entries.filter(e => new Date(e.date) >= thirtyAgo)
    const avg30 = last30.length > 0 ? last30.reduce((s, e) => s + e.weight, 0) / last30.length : avg7
    return { latest: latest.weight, first: first.weight, totalChange: latest.weight - first.weight, avg7: Math.round(avg7 * 10) / 10, avg30: Math.round(avg30 * 10) / 10, count: entries.length }
  }

  const GROCERY_CATEGORIES = ['Proteins', 'Produce', 'Dairy & Eggs', 'Pantry & Dry Goods', 'Condiments & Sauces', 'Other']

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /><p>Loading...</p></div>

  const progress = getWeeklyProgress()
  const wStats = getWeightStats()

  return (
    <div className={styles.app}>
      {/* HEADER */}
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1>{profile.emoji} {profile.label}'s Meal Planner</h1>
            <p>{profile.calTarget.toLocaleString()} cal · {profile.proteinTarget}g protein daily</p>
          </div>
          <button className={styles.switchBtn} onClick={onSwitch}>Switch user</button>
          <button className={styles.themeToggle} onClick={onToggleTheme} title="Toggle dark/light mode">
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
        {progress.total > 0 && (
          <div className={styles.headerProgress}>
            <div className={styles.progressBar}>
              <div className={styles.progressFill} style={{ width: `${(progress.onTrack / 7) * 100}%` }} />
              <span className={styles.progressText}>{progress.onTrack}/7 days on track this week</span>
            </div>
          </div>
        )}
      </div>

      {/* TABS */}
      <div className={styles.tabs}>
        {([['plan', '📋 Plan'], ['ideas', '💡 Ideas'], ['presets', '⭐ Presets'], ['scanned', '📷 Scanned'], ['dislikes', '🚫 Dislikes'], ['grocery', '🛒 Grocery'], ['weight', '⚖️ Weight']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.active : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {/* ═══ PLAN TAB ═══ */}
      {tab === 'plan' && (
        <div>
          <div className={styles.howTo}>
            <span className={styles.howToIcon}>→</span>
            <div><strong>How it works:</strong> Enter dinner first (shared with {user === 'evan' ? 'Liv' : 'Evan'}). Then add your breakfast, lunch &amp; optional snack. Claude calculates exact portions to hit your {profile.calTarget} cal target. 🔒 Lock a meal to fix it, then recalculate others to fill your remaining budget.</div>
          </div>

          <div className={styles.dayGrid}>
            {plan.days.map((day, di) => {
              const totals = getDayTotals(day)
              const isOpen = expandedDay === di
              const dinnerCal = day.dinner.meal?.cal || 0
              const remaining = profile.calTarget - dinnerCal
              const overBudget = totals.cal > profile.calTarget + 50

              return (
                <div key={day.day} className={`${styles.dayCard} ${isOpen ? styles.dayCardOpen : ''}`}>
                  <button className={styles.dayHeader} onClick={() => setExpandedDay(isOpen ? -1 : di)}>
                    <div className={styles.dayHeaderLeft}>
                      <span className={styles.dayName}>{day.day}</span>
                      <span className={styles.dayTheme}>{day.theme}</span>
                    </div>
                    <div className={styles.dayHeaderRight}>
                      {totals.cal > 0 && (
                        <span className={`${styles.dayTotalPill} ${overBudget ? styles.overBudget : ''}`}>
                          {totals.cal} cal · {totals.protein}g P
                        </span>
                      )}
                      <span className={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className={styles.dayBody}>
                      {/* DINNER (shared) */}
                      <div className={styles.mealBlock}>
                        <div className={styles.sectionLabel}>🍽️ Dinner (shared with {user === 'evan' ? 'Liv' : 'Evan'})</div>
                        <div className={styles.mealInputWithPreset}>
                          <MealInput
                            placeholder="e.g. sirloin steaks and baked potatoes"
                            value={day.dinner.input}
                            meal={day.dinner.meal}
                            calcKey={`${di}-shared-dinner`}
                            calculating={calculating}
                            onSubmit={input => calculateMeal(di, 'dinner', input)}
                            onChange={v => updateDay(di, d => ({ ...d, dinner: { ...d.dinner, input: v } }))}
                            editable={!isLocked(di, 'shared', 'dinner')}
                            locked={isLocked(di, 'shared', 'dinner')}
                            onToggleLock={day.dinner.meal ? () => toggleLock(di, 'shared', 'dinner') : undefined}
                            onRecalculate={(pi, amt) => recalculatePortions(di, 'dinner', pi, amt)}
                            onDeleteIngredient={pi => deleteIngredient(di, 'dinner', pi)}
                            onSavePreset={day.dinner.meal ? () => saveAsPreset(day.dinner.meal!, 'dinner') : undefined}
                            onCopy={day.dinner.meal ? () => setCopyTarget({ meal: day.dinner, who: 'shared', mealType: 'dinner' }) : undefined}
                          />
                          <button className={styles.presetPickerBtn} onClick={() => setPresetPicker({ di, mealType: 'dinner' })}>⭐</button>
                        </div>
                      </div>

                      {/* REMAINING BUDGET */}
                      {dinnerCal > 0 && (
                        <div className={`${styles.budgetBar} ${remaining < 0 ? styles.budgetOver : ''}`}>
                          {remaining > 0 ? `${remaining} cal remaining for breakfast + lunch + snack` : `${Math.abs(remaining)} cal over budget!`}
                        </div>
                      )}

                      {/* BREAKFAST */}
                      <div className={styles.mealBlock}>
                        <div className={styles.sectionLabel}>🌅 Breakfast</div>
                        <div className={styles.mealInputWithPreset}>
                          <MealInput
                            placeholder="e.g. scrambled eggs with turkey sausage"
                            value={day[personKey].breakfast.input}
                            meal={day[personKey].breakfast.meal}
                            calcKey={`${di}-${personKey}-breakfast`}
                            calculating={calculating}
                            onSubmit={input => calculateMeal(di, 'breakfast', input)}
                            onChange={v => updateDay(di, d => ({ ...d, [personKey]: { ...d[personKey], breakfast: { ...d[personKey].breakfast, input: v } } }))}
                            editable={!isLocked(di, personKey, 'breakfast')}
                            locked={isLocked(di, personKey, 'breakfast')}
                            onToggleLock={day[personKey].breakfast.meal ? () => toggleLock(di, personKey, 'breakfast') : undefined}
                            onRecalculate={(pi, amt) => recalculatePortions(di, 'breakfast', pi, amt)}
                            onDeleteIngredient={pi => deleteIngredient(di, 'breakfast', pi)}
                            onSavePreset={day[personKey].breakfast.meal ? () => saveAsPreset(day[personKey].breakfast.meal!, 'breakfast') : undefined}
                            onCopy={day[personKey].breakfast.meal ? () => setCopyTarget({ meal: day[personKey].breakfast, who: personKey, mealType: 'breakfast' }) : undefined}
                          />
                          <button className={styles.presetPickerBtn} onClick={() => setPresetPicker({ di, mealType: 'breakfast' })}>⭐</button>
                        </div>
                      </div>

                      {/* LUNCH */}
                      <div className={styles.mealBlock}>
                        <div className={styles.sectionLabel}>☀️ Lunch</div>
                        <div className={styles.mealInputWithPreset}>
                          <MealInput
                            placeholder="e.g. taco salad with ground beef, lettuce, cheese"
                            value={day[personKey].lunch.input}
                            meal={day[personKey].lunch.meal}
                            calcKey={`${di}-${personKey}-lunch`}
                            calculating={calculating}
                            onSubmit={input => calculateMeal(di, 'lunch', input)}
                            onChange={v => updateDay(di, d => ({ ...d, [personKey]: { ...d[personKey], lunch: { ...d[personKey].lunch, input: v } } }))}
                            editable={!isLocked(di, personKey, 'lunch')}
                            locked={isLocked(di, personKey, 'lunch')}
                            onToggleLock={day[personKey].lunch.meal ? () => toggleLock(di, personKey, 'lunch') : undefined}
                            onRecalculate={(pi, amt) => recalculatePortions(di, 'lunch', pi, amt)}
                            onDeleteIngredient={pi => deleteIngredient(di, 'lunch', pi)}
                            onSavePreset={day[personKey].lunch.meal ? () => saveAsPreset(day[personKey].lunch.meal!, 'lunch') : undefined}
                            onCopy={day[personKey].lunch.meal ? () => setCopyTarget({ meal: day[personKey].lunch, who: personKey, mealType: 'lunch' }) : undefined}
                          />
                          <button className={styles.presetPickerBtn} onClick={() => setPresetPicker({ di, mealType: 'lunch' })}>⭐</button>
                        </div>
                      </div>

                      {/* SNACK */}
                      <div className={styles.mealBlock}>
                        <div className={styles.sectionLabel}>🍎 Snack <span className={styles.sectionLabelSub}>(optional)</span></div>
                        <div className={styles.mealInputWithPreset}>
                          <MealInput
                            placeholder="e.g. protein shake, greek yogurt, almonds"
                            value={day[personKey].snack.input}
                            meal={day[personKey].snack.meal}
                            calcKey={`${di}-${personKey}-snack`}
                            calculating={calculating}
                            onSubmit={input => calculateMeal(di, 'snack', input)}
                            onChange={v => updateDay(di, d => ({ ...d, [personKey]: { ...d[personKey], snack: { ...d[personKey].snack, input: v } } }))}
                            editable={!isLocked(di, personKey, 'snack')}
                            locked={isLocked(di, personKey, 'snack')}
                            onToggleLock={day[personKey].snack.meal ? () => toggleLock(di, personKey, 'snack') : undefined}
                            onRecalculate={(pi, amt) => recalculatePortions(di, 'snack', pi, amt)}
                            onDeleteIngredient={pi => deleteIngredient(di, 'snack', pi)}
                            onSavePreset={day[personKey].snack.meal ? () => saveAsPreset(day[personKey].snack.meal!, 'snack') : undefined}
                            onCopy={day[personKey].snack.meal ? () => setCopyTarget({ meal: day[personKey].snack, who: personKey, mealType: 'snack' }) : undefined}
                          />
                          <button className={styles.presetPickerBtn} onClick={() => setPresetPicker({ di, mealType: 'snack' })}>⭐</button>
                        </div>
                      </div>

                      {/* DAY TOTALS */}
                      {totals.cal > 0 && (
                        <div className={`${styles.dayTotals} ${overBudget ? styles.dayTotalsOver : ''}`}>
                          <span>Total: <strong>{totals.cal}</strong> / {profile.calTarget} cal {overBudget && '⚠️'}</span>
                          <span>P: <strong className={totals.protein >= profile.proteinTarget ? styles.proteinGood : styles.proteinLow}>{totals.protein}g</strong> / {profile.proteinTarget}g</span>
                          <span>C: <strong>{totals.carbs}g</strong></span>
                          <span>F: <strong>{totals.fat}g</strong></span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button className={styles.groceryBtn} onClick={generateGrocery}>Generate grocery list →</button>
        </div>
      )}

      {/* ═══ IDEAS TAB ═══ */}
      {tab === 'ideas' && (
        <div>
          <div className={styles.sectionIntro}>
            <h2>Meal Ideas for {profile.label}</h2>
            <p>AI-generated meals that fit your {profile.calTarget} cal target with your dislikes excluded.</p>
          </div>
          {getMyDislikes().length > 0 && (
            <div className={styles.ideasExcluding}>
              <span className={styles.excludeLabel}>Excluding:</span>
              {getMyDislikes().map(d => <span key={d} className={styles.excludeTag}>{d}</span>)}
            </div>
          )}
          <button className={styles.generateIdeasBtn} onClick={generateIdeas} disabled={ideasLoading}>
            {ideasLoading ? <><span className={styles.btnSpinner} /> Generating...</> : '✨ Generate meal ideas'}
          </button>
          {ideasLoading && <div className={styles.loadingState}><div className={styles.spinner} /><p>Creating ideas for {profile.label}...</p></div>}
          {!ideasLoading && !ideas && <div className={styles.emptyState}><div className={styles.emptyIcon}>💡</div><p>Hit generate to get personalized meal ideas.</p></div>}
          {!ideasLoading && ideas && (
            <div className={styles.ideasResults}>
              {(['breakfast', 'lunch', 'dinner'] as const).map(mt => (
                <div key={mt} className={styles.ideasMealSection}>
                  <h3 className={styles.ideasMealTitle}>{mt === 'breakfast' ? '🌅' : mt === 'lunch' ? '☀️' : '🌙'} {mt.charAt(0).toUpperCase() + mt.slice(1)}</h3>
                  <div className={styles.ideasGrid}>
                    {ideas[mt]?.map((idea: MealIdea, idx: number) => {
                      const sel = selectedIdeas[mt] === idx
                      return (
                        <div key={idx} className={`${styles.ideaCard} ${sel ? styles.ideaCardSelected : ''}`} onClick={() => setSelectedIdeas(p => ({ ...p, [mt]: sel ? null : idx }))}>
                          <div className={styles.ideaName}>{idea.name}</div>
                          <div className={styles.ideaDesc}>{idea.description}</div>
                          <div className={styles.ideaMacros}>
                            <span><strong>{idea.cal}</strong> cal</span>
                            <span className={styles.ideaProtein}>P <strong>{idea.protein}g</strong></span>
                            <span>C <strong>{idea.carbs}g</strong></span>
                            <span>F <strong>{idea.fat}g</strong></span>
                          </div>
                          {sel && idea.portions && (
                            <div className={styles.ideaPortions}>
                              {idea.portions.map((p, pi) => (
                                <div key={pi} className={styles.ideaPortionRow}><span>{p.ingredient}</span><span className={styles.ideaPortionAmt}>{p.amount}</span><span className={styles.ideaPortionCal}>{p.cal} cal</span></div>
                              ))}
                            </div>
                          )}
                          {sel && <div className={styles.ideaSelectedBadge}>✓</div>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ PRESETS TAB ═══ */}
      {tab === 'presets' && (
        <div>
          <div className={styles.sectionIntro}><h2>Saved Presets</h2><p>Click to expand ingredients. Available to both users.</p></div>
          {presets.length === 0 ? <div className={styles.emptyState}><div className={styles.emptyIcon}>⭐</div><p>No presets yet. Save meals from the Plan tab.</p></div> : (
            <div className={styles.presetsList}>
              {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mt => {
                const items = presets.filter(p => p.mealType === mt)
                if (!items.length) return null
                return (
                  <div key={mt} className={styles.presetCategory}>
                    <h3>{mt === 'breakfast' ? '🌅' : mt === 'lunch' ? '☀️' : mt === 'snack' ? '🍎' : '🌙'} {mt.charAt(0).toUpperCase() + mt.slice(1)}</h3>
                    {items.map(p => (
                      <div key={p.id} className={`${styles.presetCard} ${expandedPreset === p.id ? styles.presetCardExpanded : ''}`}>
                        <div className={styles.presetCardHeader} onClick={() => setExpandedPreset(expandedPreset === p.id ? null : p.id)}>
                          <div><div className={styles.presetName}>{p.name}</div>
                            <div className={styles.presetMeta}><span>{p.who === 'shared' ? 'Shared' : p.who === 'his' ? 'Evan' : 'Liv'}</span> · <span><strong>{p.cal}</strong> cal</span> · <span className={styles.proteinVal}>P {p.protein}g</span></div>
                          </div>
                          <span className={styles.chevron}>{expandedPreset === p.id ? '▲' : '▼'}</span>
                        </div>
                        {expandedPreset === p.id && (
                          <div className={styles.presetBody}>
                            {p.portions.map((pt, i) => (
                              <div key={i} className={styles.presetPortionRow}><span>{pt.ingredient}</span><span>{pt.amount}</span><span className={styles.portionCal}>{pt.cal} cal</span></div>
                            ))}
                            <button className={styles.deletePresetBtn} onClick={() => deletePreset(p.id)}>Delete</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ DISLIKES TAB ═══ */}
      {tab === 'dislikes' && (
        <div>
          <div className={styles.sectionIntro}><h2>{profile.label}'s Dislikes</h2><p>These foods will never appear in your meal calculations or ideas.</p></div>
          <div className={styles.dislikeInputRow}>
            <input type="text" value={dislikeInput} placeholder="Add a food..." onChange={e => setDislikeInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { addDislike(dislikeInput); setDislikeInput('') } }} />
            <button className={styles.addBtn} onClick={() => { addDislike(dislikeInput); setDislikeInput('') }}>Add</button>
          </div>
          <div className={styles.dislikeList}>
            {getMyDislikes().length === 0 ? <span className={styles.noDislikes}>None added yet</span> : getMyDislikes().map(item => (
              <span key={item} className={styles.dislikeTag}>{item}<button onClick={() => removeDislike(item)}>×</button></span>
            ))}
          </div>
          <div className={styles.dislikeCount}>{getMyDislikes().length} item{getMyDislikes().length !== 1 ? 's' : ''}</div>
        </div>
      )}

      {/* ═══ GROCERY TAB ═══ */}
      {tab === 'grocery' && (
        <div>
          <div className={styles.groceryHeader}>
            <p>Grocery list for both Evan &amp; Liv's meals this week.</p>
            <button className={styles.regenBtn} onClick={generateGrocery} disabled={groceryLoading}>{groceryLoading ? 'Generating...' : '↺ Regenerate'}</button>
          </div>
          {groceryLoading && <div className={styles.loadingState}><div className={styles.spinner} /><p>Building list...</p></div>}
          {!groceryLoading && !grocery && <div className={styles.emptyState}><div className={styles.emptyIcon}>🛒</div><p>Fill in meals, then generate.</p></div>}
          {!groceryLoading && grocery && (
            <div className={styles.groceryList}>
              {GROCERY_CATEGORIES.map(cat => {
                const items = grocery.filter(i => i.category === cat)
                if (!items.length) return null
                return (<div key={cat} className={styles.groceryCategory}><h3>{cat}</h3><div className={styles.groceryItems}>{items.map((item, i) => (<div key={i} className={styles.groceryItem}><span className={styles.groceryName}>{item.name}</span><span className={styles.groceryAmount}>{item.amount}</span></div>))}</div></div>)
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ SCANNED FOODS TAB ═══ */}
      {tab === 'scanned' && (
        <div>
          <div className={styles.sectionIntro}>
            <h2>📷 Scanned Foods Database</h2>
            <p>Scan barcodes to build your personal food database. When you type ingredients in meal inputs, Claude will use exact nutrition data from your scans instead of estimates.</p>
          </div>

          {/* Barcode input */}
          <div className={styles.scanInputSection}>
            <div className={styles.scanInputRow}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={barcodeInput}
                placeholder="Enter barcode number..."
                onChange={e => { setBarcodeInput(e.target.value); setScanError('') }}
                onKeyDown={e => { if (e.key === 'Enter') scanBarcode() }}
                disabled={scanning}
              />
              <button className={styles.scanBtn} onClick={scanBarcode} disabled={scanning || !barcodeInput.trim()}>
                {scanning ? <><span className={styles.btnSpinner} /> Looking up...</> : '🔍 Look up'}
              </button>
            </div>
            {/* Camera scan button for mobile */}
            <div className={styles.cameraScanRow}>
              <label className={styles.cameraScanBtn}>
                📸 Scan with camera
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className={styles.hiddenInput}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setScanError('')
                    // Try BarcodeDetector API (Chrome/Edge/Safari 17+)
                    if ('BarcodeDetector' in window) {
                      try {
                        const bitmap = await createImageBitmap(file)
                        const detector = new (window as any).BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
                        const results = await detector.detect(bitmap)
                        if (results.length > 0) {
                          setBarcodeInput(results[0].rawValue)
                          // Auto-scan
                          setScanning(true)
                          try {
                            const res = await fetch('/api/scan-barcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode: results[0].rawValue }) })
                            const data = await res.json()
                            if (data.error) { setScanError(data.error) } else {
                              const f = data.food
                              const { data: saved } = await supabase.from('scanned_foods').insert({ barcode: f.barcode, name: f.name, brand: f.brand, serving_size: f.servingSize, cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, sugar: f.sugar, image_url: f.imageUrl }).select().single()
                              if (saved) setScannedFoods(prev => [{ id: saved.id, barcode: saved.barcode, name: saved.name, brand: saved.brand, servingSize: saved.serving_size, cal: saved.cal, protein: saved.protein, carbs: saved.carbs, fat: saved.fat, fiber: saved.fiber || 0, sugar: saved.sugar || 0, imageUrl: saved.image_url || '', createdAt: saved.created_at }, ...prev])
                              setBarcodeInput('')
                            }
                          } catch { setScanError('Failed to look up barcode.') }
                          setScanning(false)
                        } else {
                          setScanError('No barcode detected in the image. Try holding the camera closer to the barcode.')
                        }
                      } catch { setScanError('Could not read barcode from image. Try entering the number manually.') }
                    } else {
                      setScanError('Camera barcode scanning is not supported on this browser. Please enter the number manually.')
                    }
                    e.target.value = '' // reset file input
                  }}
                />
              </label>
            </div>
            {scanError && <div className={styles.scanError}>{scanError}</div>}
            <p className={styles.scanHint}>Tip: On mobile, use "Scan with camera" to photograph the barcode. On desktop, type the number below the barcode lines.</p>
          </div>

          {/* Scanned foods list */}
          {scannedFoods.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📷</div>
              <p>No foods scanned yet. Enter a barcode above to start building your database.</p>
            </div>
          ) : (
            <div className={styles.scannedList}>
              <div className={styles.scannedCount}>{scannedFoods.length} food{scannedFoods.length !== 1 ? 's' : ''} in your database</div>
              {scannedFoods.map(food => (
                <div key={food.id} className={`${styles.scannedCard} ${expandedScanned === food.id ? styles.scannedCardExpanded : ''}`}>
                  <div className={styles.scannedCardHeader} onClick={() => setExpandedScanned(expandedScanned === food.id ? null : food.id)}>
                    <div className={styles.scannedCardInfo}>
                      {food.imageUrl && <img src={food.imageUrl} alt="" className={styles.scannedImg} />}
                      <div>
                        <div className={styles.scannedName}>{food.name}</div>
                        {food.brand && <div className={styles.scannedBrand}>{food.brand}</div>}
                      </div>
                    </div>
                    <div className={styles.scannedMacrosPill}>
                      <span><strong>{food.cal}</strong> cal</span>
                      <span className={styles.proteinVal}>P {food.protein}g</span>
                    </div>
                  </div>
                  {expandedScanned === food.id && (
                    <div className={styles.scannedBody}>
                      <div className={styles.scannedMacroGrid}>
                        <div><span className={styles.scannedMacroLabel}>Serving</span><span className={styles.scannedMacroValue}>{food.servingSize}</span></div>
                        <div><span className={styles.scannedMacroLabel}>Calories</span><span className={styles.scannedMacroValue}>{food.cal}</span></div>
                        <div><span className={styles.scannedMacroLabel}>Protein</span><span className={`${styles.scannedMacroValue} ${styles.proteinVal}`}>{food.protein}g</span></div>
                        <div><span className={styles.scannedMacroLabel}>Carbs</span><span className={styles.scannedMacroValue}>{food.carbs}g</span></div>
                        <div><span className={styles.scannedMacroLabel}>Fat</span><span className={styles.scannedMacroValue}>{food.fat}g</span></div>
                        <div><span className={styles.scannedMacroLabel}>Fiber</span><span className={styles.scannedMacroValue}>{food.fiber}g</span></div>
                        <div><span className={styles.scannedMacroLabel}>Sugar</span><span className={styles.scannedMacroValue}>{food.sugar}g</span></div>
                        <div><span className={styles.scannedMacroLabel}>Barcode</span><span className={styles.scannedMacroValue}>{food.barcode}</span></div>
                      </div>
                      <button className={styles.deletePresetBtn} onClick={() => deleteScannedFood(food.id)}>Remove from database</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ WEIGHT TAB ═══ */}
      {tab === 'weight' && (
        <div>
          <div className={styles.sectionIntro}><h2>{profile.label}'s Weight Tracker</h2><p>Log daily to track trends. We average so daily fluctuations don't stress you.</p></div>
          <div className={styles.weightForm}>
            <div className={styles.weightInputRow}>
              <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)} className={styles.weightDateInput} />
              <div className={styles.weightNumInput}>
                <input type="number" value={weightInput} onChange={e => setWeightInput(e.target.value)} placeholder="Weight" step="0.1" onKeyDown={e => { if (e.key === 'Enter') addWeightEntry() }} />
                <span className={styles.weightUnit}>lbs</span>
              </div>
              <button className={styles.addBtn} onClick={addWeightEntry}>Log</button>
            </div>
          </div>

          {wStats && (
            <div className={styles.weightStatCard}>
              <div className={styles.weightStatGrid}>
                <div><div className={styles.weightStatLabel}>Current</div><div className={styles.weightStatValue}>{wStats.latest} lbs</div></div>
                <div><div className={styles.weightStatLabel}>7-day avg</div><div className={styles.weightStatValue}>{wStats.avg7} lbs</div></div>
                <div><div className={styles.weightStatLabel}>30-day avg</div><div className={styles.weightStatValue}>{wStats.avg30} lbs</div></div>
                <div><div className={styles.weightStatLabel}>Total change</div><div className={`${styles.weightStatValue} ${wStats.totalChange <= 0 ? styles.weightDown : styles.weightUp}`}>{wStats.totalChange > 0 ? '+' : ''}{Math.round(wStats.totalChange * 10) / 10} lbs</div></div>
              </div>
            </div>
          )}

          {(() => {
            const entries = weightEntries.filter(e => e.person === personKey).sort((a, b) => a.date.localeCompare(b.date))
            if (!entries.length) return null
            const minW = Math.min(...entries.map(e => e.weight)) - 2, maxW = Math.max(...entries.map(e => e.weight)) + 2, range = maxW - minW || 1
            return (
              <div className={styles.weightChartBlock}>
                <h4>Progress</h4>
                <div className={styles.weightChart}>
                  {entries.slice(-30).map((e, i) => {
                    const pct = ((e.weight - minW) / range) * 100
                    const prev = i > 0 ? entries[Math.max(0, entries.indexOf(e) - 1)].weight : e.weight
                    return (<div key={e.id} className={styles.weightBar} title={`${e.date}: ${e.weight}`}><div className={`${styles.weightBarFill} ${e.weight <= prev ? styles.weightBarDown : styles.weightBarUp}`} style={{ height: `${pct}%` }} /><div className={styles.weightBarLabel}>{e.weight}</div><div className={styles.weightBarDate}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}</div></div>)
                  })}
                </div>
              </div>
            )
          })()}

          {weightEntries.filter(e => e.person === personKey).length > 0 && (
            <div className={styles.weightLog}><h4>All Entries</h4><div className={styles.weightLogEntries}>
              {[...weightEntries].filter(e => e.person === personKey).reverse().map(e => (
                <div key={e.id} className={styles.weightLogEntry}>
                  <span className={styles.weightLogDate}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <span className={styles.weightLogValue}>{e.weight} lbs</span>
                  <button className={styles.weightLogDelete} onClick={() => deleteWeightEntry(e.id)}>×</button>
                </div>
              ))}
            </div></div>
          )}
        </div>
      )}

      {/* ═══ DIALOGS ═══ */}
      {copyTarget && (
        <div className={styles.dialogOverlay} onClick={() => setCopyTarget(null)}>
          <div className={styles.dialog} onClick={e => e.stopPropagation()}>
            <div className={styles.dialogHeader}><h3>Copy to which day?</h3><button className={styles.dialogClose} onClick={() => setCopyTarget(null)}>×</button></div>
            <div className={styles.dialogBody}>
              <div className={styles.copyMealInfo}><span className={styles.copyMealName}>{copyTarget.meal.meal?.name}</span><span className={styles.copyMealMacros}>{copyTarget.meal.meal?.cal} cal · {copyTarget.meal.meal?.protein}g P</span></div>
              <div className={styles.copyDayList}>{DAYS_META.map((m, di) => (<button key={di} className={styles.copyDayBtn} onClick={() => copyMealToDay(di)}><span>{m.name}</span><span className={styles.copyDayTheme}>{m.theme}</span></button>))}</div>
            </div>
          </div>
        </div>
      )}

      {presetPicker && (
        <div className={styles.dialogOverlay} onClick={() => setPresetPicker(null)}>
          <div className={styles.dialog} onClick={e => e.stopPropagation()}>
            <div className={styles.dialogHeader}><h3>Choose a Preset</h3><button className={styles.dialogClose} onClick={() => setPresetPicker(null)}>×</button></div>
            <div className={styles.dialogBody}>
              {(() => {
                const who = presetPicker.mealType === 'dinner' ? 'shared' : personKey
                const relevant = presets.filter(p => p.mealType === presetPicker.mealType && (p.who === who || p.who === 'shared'))
                if (!relevant.length) return <p className={styles.noDislikes}>No presets for this meal type.</p>
                return (<div className={styles.presetPickerList}>{relevant.map(p => (<button key={p.id} className={styles.presetPickerItem} onClick={() => applyPreset(p, presetPicker.di, presetPicker.mealType)}><div className={styles.presetPickerName}>{p.name}</div><div className={styles.presetPickerMacros}><span>{p.cal} cal</span><span className={styles.proteinVal}>P {p.protein}g</span></div></button>))}</div>)
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════ MealInput ═══════════
function MealInput({ placeholder, value, meal, calcKey, calculating, onSubmit, onChange, editable, locked, onToggleLock, onRecalculate, onDeleteIngredient, onSavePreset, onCopy }: {
  placeholder: string; value: string; meal: MacroMeal | null; calcKey: string; calculating: string | null
  onSubmit: (v: string) => void; onChange: (v: string) => void
  editable?: boolean; locked?: boolean; onToggleLock?: () => void
  onRecalculate?: (pi: number, amt: string) => void; onDeleteIngredient?: (pi: number) => void
  onSavePreset?: () => void; onCopy?: () => void
}) {
  const isCalc = calculating === calcKey
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editVal, setEditVal] = useState('')
  const [recalcing, setRecalcing] = useState(false)

  const commitEdit = async (i: number) => {
    if (editVal.trim() && onRecalculate) { setRecalcing(true); await onRecalculate(i, editVal.trim()); setRecalcing(false) }
    setEditIdx(null)
  }

  return (
    <div className={`${styles.mealInput} ${locked ? styles.mealInputLocked : ''}`}>
      <div className={styles.mealInputRow}>
        <input type="text" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && value.trim() && !locked) onSubmit(value) }} disabled={isCalc || locked} />
        {!locked ? <button className={styles.calcBtn} onClick={() => value.trim() && onSubmit(value)} disabled={isCalc || !value.trim()}>{isCalc ? '...' : meal ? '↺' : '→'}</button> : <div className={styles.lockedBadgeInline}>🔒</div>}
      </div>
      {isCalc && <div className={styles.calcLoading}><span className={styles.btnSpinner} /> Calculating...</div>}
      {!isCalc && meal && (
        <div className={`${styles.mealResult} ${locked ? styles.mealResultLocked : ''}`}>
          <div className={styles.mealResultHeader}>
            <div className={styles.mealResultName}>{locked && '🔒 '}{meal.name}</div>
            <div className={styles.mealResultActions}>
              {onCopy && <button className={styles.actionBtn} onClick={onCopy} title="Copy">📋</button>}
              {onToggleLock && <button className={`${styles.actionBtn} ${locked ? styles.actionBtnActive : ''}`} onClick={onToggleLock} title={locked ? 'Unlock' : 'Lock'}>{locked ? '🔓' : '🔒'}</button>}
              {onSavePreset && !locked && <button className={styles.actionBtn} onClick={onSavePreset} title="Save preset">⭐</button>}
            </div>
          </div>
          {meal.description && <div className={styles.mealResultDesc}>{meal.description}</div>}
          <div className={styles.mealResultMacros}>
            <span><strong>{meal.cal}</strong> cal</span>
            <span>P <strong className={styles.proteinVal}>{meal.protein}g</strong></span>
            <span>C <strong>{meal.carbs}g</strong></span>
            <span>F <strong>{meal.fat}g</strong></span>
          </div>
          {meal.portions && meal.portions.length > 0 && (
            <div className={styles.portionList}>
              {editable && !locked && <div className={styles.portionEditHint}>Tap amount to edit · × to remove</div>}
              {locked && <div className={styles.portionEditHint}>🔒 Locked — other meals fill remaining budget</div>}
              {recalcing && <div className={styles.calcLoading}><span className={styles.btnSpinner} /> Updating...</div>}
              {meal.portions.map((p, i) => (
                <div key={i} className={`${styles.portionItem} ${editable && !locked ? styles.portionItemEditable : ''}`}>
                  <span className={styles.portionIngredient}>{p.ingredient}</span>
                  {editable && !locked && editIdx === i ? (
                    <input className={styles.portionAmountInput} value={editVal} onChange={e => setEditVal(e.target.value)} onBlur={() => commitEdit(i)} onKeyDown={e => { if (e.key === 'Enter') commitEdit(i); if (e.key === 'Escape') setEditIdx(null) }} autoFocus />
                  ) : (
                    <span className={`${styles.portionAmount} ${editable && !locked ? styles.portionAmountClickable : ''}`} onClick={() => editable && !locked && (setEditIdx(i), setEditVal(p.amount))}>{p.amount}</span>
                  )}
                  <span className={styles.portionCal}>{p.cal} cal</span>
                  <span className={styles.portionProtein}>{p.protein}g P</span>
                  {editable && !locked && <button className={styles.portionDeleteBtn} onClick={() => onDeleteIngredient?.(i)}>×</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
