'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { MealPlan, DayPlan, PersonMeal, MacroMeal, Dislikes, GroceryItem } from '@/lib/types'
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

const HIM  = { label: 'Him',  calTarget: 1820, proteinTarget: 160, breakfastCal: 420, lunchCal: 550 }
const HER  = { label: 'Her',  calTarget: 1490, proteinTarget: 130, breakfastCal: 330, lunchCal: 440 }

function emptyPersonMeal(): PersonMeal { return { input: '', meal: null } }

function emptyDay(meta: typeof DAYS_META[0]): DayPlan {
  return {
    day: meta.name,
    theme: meta.theme,
    his: { breakfast: emptyPersonMeal(), lunch: emptyPersonMeal() },
    her: { breakfast: emptyPersonMeal(), lunch: emptyPersonMeal() },
    dinner: emptyPersonMeal(),
  }
}

type Tab = 'plan' | 'dislikes' | 'grocery'

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
      if (planData?.plan) setPlan(planData.plan as MealPlan)
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

  const calculateMeal = async (
    di: number,
    who: 'his' | 'her' | 'shared',
    mealType: 'breakfast' | 'lunch' | 'dinner',
    input: string
  ) => {
    if (!input.trim()) return
    const key = `${di}-${who}-${mealType}`
    setCalculating(key)

    const day = plan.days[di]
    const dinnerMacros = day.dinner.meal
    const person = who === 'shared' ? 'shared' : who
    const profile = who === 'his' ? HIM : HER
    const dinnerCal = dinnerMacros?.cal || 0
    const remainingCals = profile.calTarget - dinnerCal

    try {
      const res = await fetch('/api/calculate-meal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealInput: input, mealType, person, remainingCals, targetProtein: profile.proteinTarget, dinnerMacros }),
      })
      const { meal } = await res.json()

      updateDay(di, (d) => {
        if (mealType === 'dinner') {
          return { ...d, dinner: { input, meal } }
        }
        return {
          ...d,
          [who]: {
            ...(d as any)[who],
            [mealType]: { input, meal },
          },
        }
      })
    } catch {
      alert('Failed to calculate. Please try again.')
    }
    setCalculating(null)
  }

  const generateGrocery = async () => {
    setGroceryLoading(true)
    setTab('grocery')
    try {
      const res = await fetch('/api/grocery-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const { items } = await res.json()
      setGrocery(items)
    } catch { alert('Failed to generate grocery list.') }
    setGroceryLoading(false)
  }

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

  // Totals for a person on a given day
  const getDayTotals = (day: DayPlan, who: 'his' | 'her') => {
    const meals = [day[who].breakfast.meal, day[who].lunch.meal, day.dinner.meal]
    return meals.reduce((acc, m) => ({
      cal: acc.cal + (m?.cal || 0),
      protein: acc.protein + (m?.protein || 0),
      carbs: acc.carbs + (m?.carbs || 0),
      fat: acc.fat + (m?.fat || 0),
    }), { cal: 0, protein: 0, carbs: 0, fat: 0 })
  }

  const GROCERY_CATEGORIES = ['Proteins', 'Produce', 'Dairy & Eggs', 'Pantry & Dry Goods', 'Condiments & Sauces', 'Other']

  if (loading) return <div className={styles.loadingScreen}><div className={styles.spinner} /><p>Loading your meal planner...</p></div>

  return (
    <div className={styles.app}>
      <div className={styles.header}>
        <h1>Meal planner</h1>
        <p>High-protein weekly meals for two</p>
      </div>

      <div className={styles.tabs}>
        {([['plan','Meal plan'],['dislikes','Dislikes'],['grocery','Grocery list']] as [Tab,string][]).map(([t,label]) => (
          <button key={t} className={`${styles.tab} ${tab===t?styles.active:''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>

      {/* PLAN TAB */}
      {tab === 'plan' && (
        <div>
          <div className={styles.statsBar}>
            {[
              { label: "His target", value: "1,820 cal", sub: "160g protein · 5'9\" 215 lbs" },
              { label: "Her target", value: "1,490 cal", sub: "130g protein · 5'7\" 175 lbs" },
              { label: "Goal", value: "~1 lb/wk", sub: "500 cal deficit each" },
            ].map(s => (
              <div key={s.label} className={styles.statCard}>
                <div className={styles.statLabel}>{s.label}</div>
                <div className={styles.statValue}>{s.value}</div>
                <div className={styles.statSub}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div className={styles.howTo}>
            <strong>How it works:</strong> For each day, enter your dinner first → then breakfast and lunch. Claude calculates exact portions and macros to hit your targets.
          </div>

          <div className={styles.dayGrid}>
            {plan.days.map((day, di) => {
              const hisTotals = getDayTotals(day, 'his')
              const herTotals = getDayTotals(day, 'her')
              const isOpen = expandedDay === di

              return (
                <div key={day.day} className={styles.dayCard}>
                  <button className={styles.dayHeader} onClick={() => setExpandedDay(isOpen ? -1 : di)}>
                    <div className={styles.dayHeaderLeft}>
                      <span className={styles.dayName}>{day.day}</span>
                      <span className={styles.dayTheme}>{day.theme}</span>
                    </div>
                    <div className={styles.dayHeaderRight}>
                      {hisTotals.cal > 0 && (
                        <span className={styles.dayTotalPill}>
                          Him {hisTotals.cal} cal · {hisTotals.protein}g P
                        </span>
                      )}
                      {herTotals.cal > 0 && (
                        <span className={styles.dayTotalPill}>
                          Her {herTotals.cal} cal · {herTotals.protein}g P
                        </span>
                      )}
                      <span className={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className={styles.dayBody}>
                      {/* DINNER — full width, enter first */}
                      <div className={styles.dinnerSection}>
                        <div className={styles.sectionLabel}>Shared dinner</div>
                        <MealInput
                          placeholder="e.g. sirloin steaks and baked potatoes from Costco"
                          value={day.dinner.input}
                          meal={day.dinner.meal}
                          calcKey={`${di}-shared-dinner`}
                          calculating={calculating}
                          onSubmit={(input) => calculateMeal(di, 'shared', 'dinner', input)}
                          onChange={(v) => updateDay(di, d => ({ ...d, dinner: { ...d.dinner, input: v } }))}
                        />
                      </div>

                      {/* BREAKFAST + LUNCH side by side per person */}
                      <div className={styles.personGrid}>
                        {(['his','her'] as const).map(who => {
                          const profile = who === 'his' ? HIM : HER
                          const dinnerCal = day.dinner.meal?.cal || 0
                          const remaining = profile.calTarget - dinnerCal
                          const totals = getDayTotals(day, who)
                          return (
                            <div key={who} className={styles.personCol}>
                              <div className={styles.personHeader}>
                                <span className={styles.personLabel}>{profile.label}</span>
                                {dinnerCal > 0 && (
                                  <span className={styles.remainingBadge}>
                                    {remaining} cal left for B+L
                                  </span>
                                )}
                              </div>

                              {(['breakfast','lunch'] as const).map(mt => (
                                <div key={mt} className={styles.mealSection}>
                                  <div className={styles.mealTypeLabel}>{mt.charAt(0).toUpperCase()+mt.slice(1)}</div>
                                  <MealInput
                                    placeholder={mt === 'breakfast'
                                      ? 'e.g. scrambled eggs with turkey and avocado'
                                      : 'e.g. taco salad with ground beef, lettuce, cheese, sour cream'
                                    }
                                    value={day[who][mt].input}
                                    meal={day[who][mt].meal}
                                    calcKey={`${di}-${who}-${mt}`}
                                    calculating={calculating}
                                    onSubmit={(input) => calculateMeal(di, who, mt, input)}
                                    onChange={(v) => updateDay(di, d => ({
                                      ...d,
                                      [who]: { ...d[who], [mt]: { ...d[who][mt], input: v } }
                                    }))}
                                  />
                                </div>
                              ))}

                              {totals.cal > 0 && (
                                <div className={styles.personTotals}>
                                  <span>Total: <strong>{totals.cal} cal</strong></span>
                                  <span>Protein: <strong className={totals.protein >= profile.proteinTarget ? styles.proteinGood : styles.proteinLow}>{totals.protein}g / {profile.proteinTarget}g</strong></span>
                                  <span>Carbs: <strong>{totals.carbs}g</strong></span>
                                  <span>Fat: <strong>{totals.fat}g</strong></span>
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

          <button className={styles.groceryBtn} onClick={generateGrocery}>
            Generate grocery list →
          </button>
        </div>
      )}

      {/* DISLIKES TAB */}
      {tab === 'dislikes' && (
        <div className={styles.dislikesGrid}>
          {(['his','her'] as const).map(who => (
            <div key={who} className={styles.dislikeCol}>
              <h2>{who === 'his' ? 'His dislikes' : 'Her dislikes'}</h2>
              <div className={styles.dislikeInputRow}>
                <input
                  type="text"
                  value={who === 'his' ? hisInput : herInput}
                  placeholder="Add a food..."
                  onChange={e => who === 'his' ? setHisInput(e.target.value) : setHerInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = who === 'his' ? hisInput : herInput
                      addDislike(who, val)
                      who === 'his' ? setHisInput('') : setHerInput('')
                    }
                  }}
                />
                <button className={styles.addBtn} onClick={() => {
                  const val = who === 'his' ? hisInput : herInput
                  addDislike(who, val)
                  who === 'his' ? setHisInput('') : setHerInput('')
                }}>Add</button>
              </div>
              <div className={styles.dislikeList}>
                {dislikes[who].length === 0
                  ? <span className={styles.noDislikes}>None added yet</span>
                  : dislikes[who].map(item => (
                    <span key={item} className={styles.dislikeTag}>
                      {item}
                      <button onClick={() => removeDislike(who, item)}>&times;</button>
                    </span>
                  ))
                }
              </div>
            </div>
          ))}
        </div>
      )}

      {/* GROCERY TAB */}
      {tab === 'grocery' && (
        <div>
          <div className={styles.groceryHeader}>
            <p>Based on your current week's meal plan. Update your meals first, then regenerate.</p>
            <button className={styles.regenBtn} onClick={generateGrocery} disabled={groceryLoading}>
              {groceryLoading ? 'Generating...' : 'Regenerate list'}
            </button>
          </div>

          {groceryLoading && (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Building your grocery list...</p>
            </div>
          )}

          {!groceryLoading && !grocery && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🛒</div>
              <p>Fill in your meals for the week, then click "Generate grocery list" on the plan tab.</p>
            </div>
          )}

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
    </div>
  )
}

// MealInput component — text input + calculate button + result display
function MealInput({ placeholder, value, meal, calcKey, calculating, onSubmit, onChange }: {
  placeholder: string
  value: string
  meal: MacroMeal | null
  calcKey: string
  calculating: string | null
  onSubmit: (input: string) => void
  onChange: (v: string) => void
}) {
  const isCalc = calculating === calcKey

  return (
    <div className={styles.mealInput}>
      <div className={styles.mealInputRow}>
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSubmit(value) }}
          disabled={isCalc}
        />
        <button
          className={styles.calcBtn}
          onClick={() => value.trim() && onSubmit(value)}
          disabled={isCalc || !value.trim()}
        >
          {isCalc ? '...' : meal ? '↺' : '→'}
        </button>
      </div>

      {isCalc && <div className={styles.calcLoading}>Calculating macros...</div>}

      {!isCalc && meal && (
        <div className={styles.mealResult}>
          <div className={styles.mealResultName}>{meal.name}</div>
          {meal.description && <div className={styles.mealResultDesc}>{meal.description}</div>}
          <div className={styles.mealResultMacros}>
            <span><strong>{meal.cal}</strong> cal</span>
            <span>P <strong className={styles.proteinVal}>{meal.protein}g</strong></span>
            <span>C <strong>{meal.carbs}g</strong></span>
            <span>F <strong>{meal.fat}g</strong></span>
          </div>
          {meal.portions && meal.portions.length > 0 && (
            <div className={styles.portionList}>
              {meal.portions.map((p, i) => (
                <div key={i} className={styles.portionItem}>
                  <span className={styles.portionIngredient}>{p.ingredient}</span>
                  <span className={styles.portionAmount}>{p.amount}</span>
                  <span className={styles.portionCal}>{p.cal} cal</span>
                  <span className={styles.portionProtein}>{p.protein}g P</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
