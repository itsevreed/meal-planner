'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { MealPlan, DayPlan, PersonMeal, MacroMeal, PortionItem, Dislikes, GroceryItem, MealIdea } from '@/lib/types'
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

type Tab = 'plan' | 'ideas' | 'dislikes' | 'grocery'

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

  // Meal ideas state
  const [ideasWho, setIdeasWho] = useState<'his' | 'her'>('his')
  const [ideas, setIdeas] = useState<{ breakfast: MealIdea[], lunch: MealIdea[], dinner: MealIdea[] } | null>(null)
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [selectedIdeas, setSelectedIdeas] = useState<{ breakfast: number | null, lunch: number | null, dinner: number | null }>({ breakfast: null, lunch: null, dinner: null })

  // Sanitize plan shape
  const sanitizePlan = (raw: any): MealPlan => {
    const safeMeal = (m: any): PersonMeal => ({
      input: typeof m?.input === 'string' ? m.input : '',
      meal: m?.meal ?? null,
    })
    const days = DAYS_META.map((meta, i) => {
      const d = raw?.days?.[i] ?? {}
      return {
        day: meta.name,
        theme: meta.theme,
        his: {
          breakfast: safeMeal(d?.his?.breakfast),
          lunch: safeMeal(d?.his?.lunch),
        },
        her: {
          breakfast: safeMeal(d?.her?.breakfast),
          lunch: safeMeal(d?.her?.lunch),
        },
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

  // Editable ingredient handlers
  const updateIngredient = (
    di: number,
    who: 'his' | 'her' | 'shared',
    mealType: 'breakfast' | 'lunch' | 'dinner',
    portionIndex: number,
    field: 'amount',
    value: string
  ) => {
    updateDay(di, (d) => {
      const getMeal = (): PersonMeal => {
        if (mealType === 'dinner') return d.dinner
        return (d as any)[who][mealType]
      }
      const pm = getMeal()
      if (!pm.meal?.portions) return d

      const newPortions = [...pm.meal.portions]
      newPortions[portionIndex] = { ...newPortions[portionIndex], [field]: value }
      const newMeal = { ...pm.meal, portions: newPortions }

      if (mealType === 'dinner') {
        return { ...d, dinner: { ...d.dinner, meal: newMeal } }
      }
      return {
        ...d,
        [who]: {
          ...(d as any)[who],
          [mealType]: { ...(d as any)[who][mealType], meal: newMeal },
        },
      }
    })
  }

  const deleteIngredient = (
    di: number,
    who: 'his' | 'her' | 'shared',
    mealType: 'breakfast' | 'lunch' | 'dinner',
    portionIndex: number
  ) => {
    updateDay(di, (d) => {
      const getMeal = (): PersonMeal => {
        if (mealType === 'dinner') return d.dinner
        return (d as any)[who][mealType]
      }
      const pm = getMeal()
      if (!pm.meal?.portions) return d

      const newPortions = pm.meal.portions.filter((_, i) => i !== portionIndex)
      // Recalculate totals from remaining portions
      const totals = newPortions.reduce((acc, p) => ({
        cal: acc.cal + p.cal,
        protein: acc.protein + p.protein,
        carbs: acc.carbs + p.carbs,
        fat: acc.fat + p.fat,
      }), { cal: 0, protein: 0, carbs: 0, fat: 0 })

      const newMeal = { ...pm.meal, portions: newPortions, ...totals }

      if (mealType === 'dinner') {
        return { ...d, dinner: { ...d.dinner, meal: newMeal } }
      }
      return {
        ...d,
        [who]: {
          ...(d as any)[who],
          [mealType]: { ...(d as any)[who][mealType], meal: newMeal },
        },
      }
    })
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

  // Meal ideas generator
  const generateIdeas = async () => {
    setIdeasLoading(true)
    setSelectedIdeas({ breakfast: null, lunch: null, dinner: null })
    setIdeas(null)

    const profile = ideasWho === 'his' ? HIM : HER
    const dinnerCal = Math.round(profile.calTarget * 0.33)
    const breakfastCal = Math.round((profile.calTarget - dinnerCal) * 0.42)
    const lunchCal = profile.calTarget - dinnerCal - breakfastCal

    try {
      const res = await fetch('/api/meal-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          who: ideasWho,
          dislikes: dislikes[ideasWho],
          calBudget: { breakfast: breakfastCal, lunch: lunchCal, dinner: dinnerCal },
          proteinTarget: profile.proteinTarget,
        }),
      })
      const { ideas: newIdeas } = await res.json()
      setIdeas(newIdeas)
    } catch {
      alert('Failed to generate meal ideas.')
    }
    setIdeasLoading(false)
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

  // Weekly progress
  const getWeeklyProgress = (who: 'his' | 'her') => {
    const profile = who === 'his' ? HIM : HER
    let totalDays = 0
    let onTrackDays = 0
    plan.days.forEach(day => {
      const totals = getDayTotals(day, who)
      if (totals.cal > 0) {
        totalDays++
        if (totals.cal <= profile.calTarget + 50) onTrackDays++
      }
    })
    return { totalDays, onTrackDays }
  }

  const GROCERY_CATEGORIES = ['Proteins', 'Produce', 'Dairy & Eggs', 'Pantry & Dry Goods', 'Condiments & Sauces', 'Other']

  if (loading) return (
    <div className={styles.loadingScreen}>
      <div className={styles.spinner} />
      <p>Loading your meal planner...</p>
    </div>
  )

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
          ['dislikes', '🚫 Dislikes'],
          ['grocery', '🛒 Grocery'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.active : ''}`}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════ PLAN TAB ═══════════ */}
      {tab === 'plan' && (
        <div>
          {/* Progress cards */}
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

          {/* How-to */}
          <div className={styles.howTo}>
            <span className={styles.howToIcon}>→</span>
            <div>
              <strong>How it works:</strong> Enter dinner first, then breakfast &amp; lunch.
              Claude calculates exact portions to hit your calorie &amp; protein targets.
              You can edit ingredient amounts or remove items after calculating.
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
                          Him {hisTotals.cal} cal · {hisTotals.protein}g P
                        </span>
                      )}
                      {herTotals.cal > 0 && (
                        <span className={`${styles.dayTotalPill} ${herTotals.cal > HER.calTarget + 50 ? styles.overBudget : ''}`}>
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
                        <div className={styles.sectionLabel}>🍽️ Shared dinner — enter this first</div>
                        <MealInput
                          placeholder="e.g. sirloin steaks and baked potatoes"
                          value={day.dinner.input}
                          meal={day.dinner.meal}
                          calcKey={`${di}-shared-dinner`}
                          calculating={calculating}
                          onSubmit={(input) => calculateMeal(di, 'shared', 'dinner', input)}
                          onChange={(v) => updateDay(di, d => ({ ...d, dinner: { ...d.dinner, input: v } }))}
                          editable
                          onUpdateIngredient={(pi, field, val) => updateIngredient(di, 'shared', 'dinner', pi, field, val)}
                          onDeleteIngredient={(pi) => deleteIngredient(di, 'shared', 'dinner', pi)}
                        />
                      </div>

                      {/* BREAKFAST + LUNCH side by side per person */}
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
                                {dinnerCal > 0 && (
                                  <span className={`${styles.remainingBadge} ${remaining < 0 ? styles.overBudgetBadge : ''}`}>
                                    {remaining > 0 ? `${remaining} cal left` : `${Math.abs(remaining)} cal over!`}
                                  </span>
                                )}
                              </div>

                              {(['breakfast', 'lunch'] as const).map(mt => (
                                <div key={mt} className={styles.mealSection}>
                                  <div className={styles.mealTypeLabel}>{mt.charAt(0).toUpperCase() + mt.slice(1)}</div>
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
                                      ...d,
                                      [who]: { ...d[who], [mt]: { ...d[who][mt], input: v } }
                                    }))}
                                    editable={mt === 'breakfast'}
                                    onUpdateIngredient={(pi, field, val) => updateIngredient(di, who, mt, pi, field, val)}
                                    onDeleteIngredient={(pi) => deleteIngredient(di, who, mt, pi)}
                                  />
                                </div>
                              ))}

                              {totals.cal > 0 && (
                                <div className={`${styles.personTotals} ${overBudget ? styles.personTotalsOver : ''}`}>
                                  <span>Total: <strong>{totals.cal} cal</strong> {overBudget && <span className={styles.overIcon}>⚠️</span>}</span>
                                  <span>Protein: <strong className={totals.protein >= profile.proteinTarget ? styles.proteinGood : styles.proteinLow}>{totals.protein}g / {profile.proteinTarget}g</strong></span>
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

          <button className={styles.groceryBtn} onClick={generateGrocery}>
            Generate grocery list →
          </button>
        </div>
      )}

      {/* ═══════════ MEAL IDEAS TAB ═══════════ */}
      {tab === 'ideas' && (
        <div className={styles.ideasTab}>
          <div className={styles.ideasIntro}>
            <h2>Meal Ideas Generator</h2>
            <p>Get AI-generated breakfast, lunch &amp; dinner ideas that fit within your calorie and macro targets — with your dislikes automatically excluded.</p>
          </div>

          <div className={styles.ideasControls}>
            <div className={styles.ideasToggle}>
              <button
                className={`${styles.toggleBtn} ${ideasWho === 'his' ? styles.toggleActive : ''}`}
                onClick={() => setIdeasWho('his')}
              >
                Him · 1,820 cal
              </button>
              <button
                className={`${styles.toggleBtn} ${ideasWho === 'her' ? styles.toggleActive : ''}`}
                onClick={() => setIdeasWho('her')}
              >
                Her · 1,490 cal
              </button>
            </div>

            {dislikes[ideasWho].length > 0 && (
              <div className={styles.ideasExcluding}>
                <span className={styles.excludeLabel}>Excluding:</span>
                {dislikes[ideasWho].map(d => (
                  <span key={d} className={styles.excludeTag}>{d}</span>
                ))}
              </div>
            )}

            <button
              className={styles.generateIdeasBtn}
              onClick={generateIdeas}
              disabled={ideasLoading}
            >
              {ideasLoading ? (
                <><span className={styles.btnSpinner} /> Generating ideas...</>
              ) : (
                '✨ Generate meal ideas'
              )}
            </button>
          </div>

          {ideasLoading && (
            <div className={styles.loadingState}>
              <div className={styles.spinner} />
              <p>Creating personalized meal ideas...</p>
              <p className={styles.loadingSub}>Respecting your {(ideasWho === 'his' ? HIM : HER).calTarget} cal budget &amp; {dislikes[ideasWho].length} dislikes</p>
            </div>
          )}

          {!ideasLoading && !ideas && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>💡</div>
              <p>Choose who you're planning for, then hit "Generate meal ideas" to get personalized suggestions that fit your macro targets.</p>
            </div>
          )}

          {!ideasLoading && ideas && (
            <div className={styles.ideasResults}>
              {(['breakfast', 'lunch', 'dinner'] as const).map(mealType => (
                <div key={mealType} className={styles.ideasMealSection}>
                  <h3 className={styles.ideasMealTitle}>
                    {mealType === 'breakfast' ? '🌅' : mealType === 'lunch' ? '☀️' : '🌙'}{' '}
                    {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
                  </h3>
                  <div className={styles.ideasGrid}>
                    {ideas[mealType]?.map((idea: MealIdea, idx: number) => {
                      const isSelected = selectedIdeas[mealType] === idx
                      return (
                        <div
                          key={idx}
                          className={`${styles.ideaCard} ${isSelected ? styles.ideaCardSelected : ''}`}
                          onClick={() => setSelectedIdeas(prev => ({
                            ...prev,
                            [mealType]: isSelected ? null : idx,
                          }))}
                        >
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

                          {isSelected && (
                            <div className={styles.ideaSelectedBadge}>✓ Selected</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Daily totals for selected ideas */}
              {(selectedIdeas.breakfast !== null || selectedIdeas.lunch !== null || selectedIdeas.dinner !== null) && (
                <div className={styles.ideasDailyTotal}>
                  <h4>Selected day total</h4>
                  <div className={styles.ideasTotalMacros}>
                    {(() => {
                      const profile = ideasWho === 'his' ? HIM : HER
                      let totalCal = 0, totalP = 0, totalC = 0, totalF = 0
                      if (selectedIdeas.breakfast !== null && ideas.breakfast[selectedIdeas.breakfast]) {
                        const m = ideas.breakfast[selectedIdeas.breakfast]
                        totalCal += m.cal; totalP += m.protein; totalC += m.carbs; totalF += m.fat
                      }
                      if (selectedIdeas.lunch !== null && ideas.lunch[selectedIdeas.lunch]) {
                        const m = ideas.lunch[selectedIdeas.lunch]
                        totalCal += m.cal; totalP += m.protein; totalC += m.carbs; totalF += m.fat
                      }
                      if (selectedIdeas.dinner !== null && ideas.dinner[selectedIdeas.dinner]) {
                        const m = ideas.dinner[selectedIdeas.dinner]
                        totalCal += m.cal; totalP += m.protein; totalC += m.carbs; totalF += m.fat
                      }
                      const withinBudget = totalCal <= profile.calTarget
                      return (
                        <>
                          <span className={withinBudget ? styles.totalGood : styles.totalOver}>
                            <strong>{totalCal}</strong> / {profile.calTarget} cal
                          </span>
                          <span className={totalP >= profile.proteinTarget ? styles.proteinGood : styles.proteinLow}>
                            P: <strong>{totalP}g</strong> / {profile.proteinTarget}g
                          </span>
                          <span>C: <strong>{totalC}g</strong></span>
                          <span>F: <strong>{totalF}g</strong></span>
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

      {/* ═══════════ DISLIKES TAB ═══════════ */}
      {tab === 'dislikes' && (
        <div>
          <div className={styles.dislikesIntro}>
            <p>Foods listed here will be excluded from meal ideas and plan suggestions. Add anything you or your partner don't like or are allergic to.</p>
          </div>
          <div className={styles.dislikesGrid}>
            {(['his', 'her'] as const).map(who => (
              <div key={who} className={styles.dislikeCol}>
                <h2>{who === 'his' ? '🙋‍♂️ His dislikes' : '🙋‍♀️ Her dislikes'}</h2>
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
            <p>Based on your current week's meal plan. Update meals first, then regenerate.</p>
            <button className={styles.regenBtn} onClick={generateGrocery} disabled={groceryLoading}>
              {groceryLoading ? 'Generating...' : '↺ Regenerate'}
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

// ═══════════ MealInput Component ═══════════
function MealInput({ placeholder, value, meal, calcKey, calculating, onSubmit, onChange, editable, onUpdateIngredient, onDeleteIngredient }: {
  placeholder: string
  value: string
  meal: MacroMeal | null
  calcKey: string
  calculating: string | null
  onSubmit: (input: string) => void
  onChange: (v: string) => void
  editable?: boolean
  onUpdateIngredient?: (portionIndex: number, field: 'amount', value: string) => void
  onDeleteIngredient?: (portionIndex: number) => void
}) {
  const isCalc = calculating === calcKey
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const startEdit = (idx: number, currentAmount: string) => {
    setEditingIdx(idx)
    setEditValue(currentAmount)
  }

  const commitEdit = (idx: number) => {
    if (editValue.trim() && onUpdateIngredient) {
      onUpdateIngredient(idx, 'amount', editValue.trim())
    }
    setEditingIdx(null)
  }

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
          title={meal ? 'Recalculate' : 'Calculate macros'}
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
              {editable && (
                <div className={styles.portionEditHint}>Click amount to edit · × to remove</div>
              )}
              {meal.portions.map((p, i) => (
                <div key={i} className={`${styles.portionItem} ${editable ? styles.portionItemEditable : ''}`}>
                  <span className={styles.portionIngredient}>{p.ingredient}</span>
                  {editable && editingIdx === i ? (
                    <input
                      className={styles.portionAmountInput}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(i)}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(i); if (e.key === 'Escape') setEditingIdx(null) }}
                      autoFocus
                    />
                  ) : (
                    <span
                      className={`${styles.portionAmount} ${editable ? styles.portionAmountClickable : ''}`}
                      onClick={() => editable && startEdit(i, p.amount)}
                    >
                      {p.amount}
                    </span>
                  )}
                  <span className={styles.portionCal}>{p.cal} cal</span>
                  <span className={styles.portionProtein}>{p.protein}g P</span>
                  {editable && (
                    <button
                      className={styles.portionDeleteBtn}
                      onClick={() => onDeleteIngredient?.(i)}
                      title="Remove ingredient"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
