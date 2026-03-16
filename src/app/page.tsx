'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { MealPlan, Preferences, Dislikes, DayPlan, MacroMeal } from '@/lib/types'
import styles from './page.module.css'

const DAYS_META = [
  { key: 'mon', name: 'Monday', theme: 'Breakfast theme' },
  { key: 'tue', name: 'Tuesday', theme: 'Taco Tuesday' },
  { key: 'wed', name: 'Wednesday', theme: 'Asian Wednesday' },
  { key: 'thu', name: 'Thursday', theme: 'Steak & Potato' },
  { key: 'fri', name: 'Friday', theme: 'Salmon Friday' },
  { key: 'sat', name: 'Saturday', theme: 'Open choice' },
  { key: 'sun', name: 'Sunday', theme: 'Open choice' },
]

type Tab = 'plan' | 'prefs' | 'dislikes'

export default function Home() {
  const [tab, setTab] = useState<Tab>('plan')
  const [plan, setPlan] = useState<MealPlan | null>(null)
  const [prefs, setPrefs] = useState<Preferences>({ proteins: '', cuisines: '', notes: '' })
  const [dislikes, setDislikes] = useState<Dislikes>({ his: [], her: [] })
  const [generating, setGenerating] = useState(false)
  const [swapping, setSwapping] = useState<string | null>(null)
  const [hisInput, setHisInput] = useState('')
  const [herInput, setHerInput] = useState('')
  const [loading, setLoading] = useState(true)

  // Load all data from Supabase on mount
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // Load dislikes
      const { data: dislikesData } = await supabase.from('dislikes').select('*')
      if (dislikesData) {
        const his = dislikesData.filter((d) => d.person === 'his').map((d) => d.item)
        const her = dislikesData.filter((d) => d.person === 'her').map((d) => d.item)
        setDislikes({ his, her })
      }

      // Load preferences
      const { data: prefsData } = await supabase.from('preferences').select('*').limit(1).single()
      if (prefsData) {
        setPrefs({ proteins: prefsData.proteins, cuisines: prefsData.cuisines, notes: prefsData.notes })
      }

      // Load meal plan
      const { data: planData } = await supabase
        .from('meal_plan')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (planData) {
        setPlan(planData.plan as MealPlan)
      }
    } catch (e) {
      // No data yet, fresh start
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Save preferences to Supabase
  const savePrefs = async (newPrefs: Preferences) => {
    const { data: existing } = await supabase.from('preferences').select('id').limit(1).single()
    if (existing) {
      await supabase.from('preferences').update(newPrefs).eq('id', existing.id)
    } else {
      await supabase.from('preferences').insert(newPrefs)
    }
  }

  const addDislike = async (who: 'his' | 'her', item: string) => {
    const trimmed = item.trim().toLowerCase()
    if (!trimmed || dislikes[who].includes(trimmed)) return
    await supabase.from('dislikes').insert({ person: who, item: trimmed })
    setDislikes((prev) => ({ ...prev, [who]: [...prev[who], trimmed] }))
  }

  const removeDislike = async (who: 'his' | 'her', item: string) => {
    await supabase.from('dislikes').delete().eq('person', who).eq('item', item)
    setDislikes((prev) => ({ ...prev, [who]: prev[who].filter((x) => x !== item) }))
  }

  const generateWeek = async () => {
    setGenerating(true)
    setTab('plan')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: prefs, dislikes }),
      })
      const { plan: newPlan } = await res.json()

      // Save to Supabase — delete old, insert new
      await supabase.from('meal_plan').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('meal_plan').insert({ plan: newPlan })
      setPlan(newPlan)
    } catch (e) {
      alert('Something went wrong generating the plan. Please try again.')
    }
    setGenerating(false)
  }

  const swapMeal = async (di: number, who: string, mealType: string) => {
    if (!plan) return
    const key = `${who}-${mealType}-${di}`
    setSwapping(key)
    const day = plan.days[di]
    let currentMeal = ''
    if (who === 'shared') currentMeal = day.dinner.name
    else currentMeal = (day as any)[who][mealType].name

    try {
      const res = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, who, mealType, currentMeal, dislikes }),
      })
      const { meal } = await res.json()
      const newPlan = { ...plan, days: [...plan.days] }
      if (who === 'shared') {
        newPlan.days[di] = { ...newPlan.days[di], dinner: meal }
      } else {
        newPlan.days[di] = {
          ...newPlan.days[di],
          [who]: { ...(newPlan.days[di] as any)[who], [mealType]: meal },
        }
      }
      // Update in Supabase
      const { data: existing } = await supabase.from('meal_plan').select('id').limit(1).single()
      if (existing) await supabase.from('meal_plan').update({ plan: newPlan }).eq('id', existing.id)
      setPlan(newPlan)
    } catch (e) {
      alert('Failed to swap meal. Please try again.')
    }
    setSwapping(null)
  }

  return (
    <div className={styles.app}>
      <div className={styles.header}>
        <h1>Meal planner</h1>
        <p>Personalized weekly meals for two</p>
      </div>

      <div className={styles.tabs}>
        {(['plan', 'prefs', 'dislikes'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.active : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'plan' ? 'Meal plan' : t === 'prefs' ? 'Preferences' : 'Dislikes'}
          </button>
        ))}
      </div>

      {/* PLAN TAB */}
      {tab === 'plan' && (
        <div>
          <div className={styles.statsBar}>
            {[
              { label: "His daily target", value: "1,820", sub: "cal · 5'9\" 215 lbs" },
              { label: "Her daily target", value: "1,490", sub: "cal · 5'7\" 175 lbs" },
              { label: "Shared dinner", value: "~600", sub: "cal · midpoint" },
              { label: "Weekly deficit", value: "~3,500", sub: "cal each · ~1 lb/wk" },
            ].map((s) => (
              <div key={s.label} className={styles.statCard}>
                <div className={styles.statLabel}>{s.label}</div>
                <div className={styles.statValue}>{s.value}</div>
                <div className={styles.statSub}>{s.sub}</div>
              </div>
            ))}
          </div>

          <button className={styles.generateBtn} onClick={generateWeek} disabled={generating}>
            {generating ? 'Generating your plan...' : plan ? 'Regenerate meal plan' : 'Generate this week\'s meal plan'}
          </button>

          {loading ? (
            <div className={styles.emptyState}><p>Loading...</p></div>
          ) : !plan ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🍽</div>
              <p>Hit "Generate" above to create your personalized meal plan.<br />Add preferences and dislikes first for better results.</p>
            </div>
          ) : (
            <div className={styles.dayGrid}>
              {plan.days.map((day, di) => (
                <DayCard
                  key={day.day}
                  day={day}
                  di={di}
                  swapping={swapping}
                  onSwap={swapMeal}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* PREFS TAB */}
      {tab === 'prefs' && (
        <div className={styles.prefsPanel}>
          {[
            { key: 'proteins', label: 'Proteins & ingredients on hand', placeholder: 'e.g. chicken breast, ground turkey, salmon fillets, eggs, Greek yogurt...' },
            { key: 'cuisines', label: 'Cuisine & flavor preferences', placeholder: 'e.g. Mediterranean flavors, spicy foods this week, lighter lunches...' },
            { key: 'notes', label: 'Dietary notes', placeholder: 'e.g. quick breakfasts under 10 min, no cooking Monday, high protein lunches...' },
          ].map((field) => (
            <div key={field.key} className={styles.prefsSection}>
              <h2>{field.label}</h2>
              <textarea
                value={(prefs as any)[field.key]}
                placeholder={field.placeholder}
                onChange={(e) => setPrefs((p) => ({ ...p, [field.key]: e.target.value }))}
                onBlur={() => savePrefs(prefs)}
              />
            </div>
          ))}
          <button className={styles.generateBtn} onClick={() => { savePrefs(prefs); generateWeek() }}>
            Save & generate plan →
          </button>
        </div>
      )}

      {/* DISLIKES TAB */}
      {tab === 'dislikes' && (
        <div className={styles.dislikesGrid}>
          {(['his', 'her'] as const).map((who) => (
            <div key={who} className={styles.dislikeCol}>
              <h2>{who === 'his' ? 'His dislikes' : 'Her dislikes'}</h2>
              <div className={styles.dislikeInputRow}>
                <input
                  type="text"
                  value={who === 'his' ? hisInput : herInput}
                  placeholder="Add a food..."
                  onChange={(e) => who === 'his' ? setHisInput(e.target.value) : setHerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = who === 'his' ? hisInput : herInput
                      addDislike(who, val)
                      who === 'his' ? setHisInput('') : setHerInput('')
                    }
                  }}
                />
                <button
                  className={styles.addBtn}
                  onClick={() => {
                    const val = who === 'his' ? hisInput : herInput
                    addDislike(who, val)
                    who === 'his' ? setHisInput('') : setHerInput('')
                  }}
                >
                  Add
                </button>
              </div>
              <div className={styles.dislikeList}>
                {dislikes[who].length === 0 ? (
                  <span className={styles.noDislikes}>None added yet</span>
                ) : (
                  dislikes[who].map((item) => (
                    <span key={item} className={styles.dislikeTag}>
                      {item}
                      <button onClick={() => removeDislike(who, item)}>&times;</button>
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MealCard({ meal, swapKey, swapping, onSwap }: {
  meal: MacroMeal
  swapKey: string
  swapping: string | null
  onSwap: (di: number, who: string, mealType: string) => void
}) {
  const [di, who, mt] = swapKey.split('-')
  const isLoading = swapping === swapKey
  return (
    <div className={`${styles.mealCard} ${isLoading ? styles.mealLoading : ''}`}>
      <div className={styles.mealName}>{isLoading ? 'Finding a new meal...' : meal.name}</div>
      <div className={styles.mealMacros}>
        <span><strong>{meal.cal}</strong> cal</span>
        <span>P <strong>{meal.protein}g</strong></span>
        <span>C <strong>{meal.carbs}g</strong></span>
        <span>F <strong>{meal.fat}g</strong></span>
      </div>
      {!isLoading && (
        <button className={styles.swapBtn} onClick={() => onSwap(parseInt(di), who, mt)} title="Swap this meal">↺</button>
      )}
    </div>
  )
}

function DayCard({ day, di, swapping, onSwap }: {
  day: DayPlan
  di: number
  swapping: string | null
  onSwap: (di: number, who: string, mealType: string) => void
}) {
  const hisTot = day.his.breakfast.cal + day.his.lunch.cal + day.dinner.cal
  const herTot = day.her.breakfast.cal + day.her.lunch.cal + day.dinner.cal

  return (
    <div className={styles.dayCard}>
      <div className={styles.dayHeader}>
        <span className={styles.dayName}>{day.day}</span>
        <span className={styles.dayTheme}>{day.theme}</span>
      </div>
      <div className={styles.mealsGrid}>
        {(['his', 'her'] as const).map((who) => (
          <div key={who} className={styles.personCol}>
            <div className={styles.personLabel}>{who === 'his' ? 'His meals' : 'Her meals'}</div>
            {(['breakfast', 'lunch'] as const).map((mt) => (
              <div key={mt} className={styles.mealRow}>
                <div className={styles.mealType}>{mt.charAt(0).toUpperCase() + mt.slice(1)}</div>
                <MealCard
                  meal={day[who][mt]}
                  swapKey={`${di}-${who}-${mt}`}
                  swapping={swapping}
                  onSwap={onSwap}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className={styles.dinnerRow}>
        <div className={styles.dinnerLabel}>Shared dinner</div>
        <MealCard
          meal={day.dinner}
          swapKey={`${di}-shared-dinner`}
          swapping={swapping}
          onSwap={onSwap}
        />
      </div>
      <div className={styles.dailyTotals}>
        <span>His total: <strong>{hisTot} cal</strong></span>
        <span>Her total: <strong>{herTot} cal</strong></span>
      </div>
    </div>
  )
}
