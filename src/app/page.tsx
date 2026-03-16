'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { MealPlan, DayPlan, PersonMeal, MacroMeal, PortionItem, Dislikes, GroceryItem, MealIdea, PresetMeal, WeightEntry, ScannedFood, WaterEntry, FavoriteMeal, WeekTemplate, UserSettings } from '@/lib/types'
import s from './page.module.css'

const DAYS = [
  { name: 'Monday', theme: 'Breakfast theme' }, { name: 'Tuesday', theme: 'Taco Tuesday' },
  { name: 'Wednesday', theme: 'Asian Wednesday' }, { name: 'Thursday', theme: 'Steak & Potato' },
  { name: 'Friday', theme: 'Salmon Friday' }, { name: 'Saturday', theme: 'Open choice' },
  { name: 'Sunday', theme: 'Open choice' },
]
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
type User = 'evan' | 'liv'
const DEFAULTS = {
  evan: { label: 'Evan', key: 'his' as const, cal: 1820, protein: 160, emoji: '💪', goal: 185 },
  liv: { label: 'Liv', key: 'her' as const, cal: 1490, protein: 130, emoji: '✨', goal: 145 },
}
function epm(): PersonMeal { return { input: '', meal: null, eaten: false } }
function eday(m: typeof DAYS[0]): DayPlan {
  return { day: m.name, theme: m.theme, his: { breakfast: epm(), lunch: epm(), snack: epm() }, her: { breakfast: epm(), lunch: epm(), snack: epm() }, dinner: epm() }
}
function weekIdFor(off = 0) {
  const d = new Date(); d.setDate(d.getDate() + off * 7)
  const y = d.getFullYear(), jan1 = new Date(y, 0, 1)
  const w = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
  return `${y}-W${String(w).padStart(2, '0')}`
}
function getTodayIndex(): number { const d = new Date().getDay(); return d === 0 ? 6 : d - 1 } // Mon=0...Sun=6

type Tab = 'today' | 'plan' | 'track' | 'ideas' | 'foods' | 'grocery' | 'coach' | 'settings'

// ═══════════ ROOT ═══════════
export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const u = localStorage.getItem('mp-user'); if (u === 'evan' || u === 'liv') setUser(u)
    const t = localStorage.getItem('mp-theme')
    if (t === 'dark' || t === 'light') { setTheme(t); document.documentElement.setAttribute('data-theme', t) }
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) { setTheme('dark'); document.documentElement.setAttribute('data-theme', 'dark') }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  const toggle = () => { const n = theme === 'light' ? 'dark' : 'light'; setTheme(n); localStorage.setItem('mp-theme', n); document.documentElement.setAttribute('data-theme', n) }
  const pick = (u: User) => { localStorage.setItem('mp-user', u); setUser(u) }

  if (!user) return (
    <div className={s.login}><button className={s.themeFloat} onClick={toggle}>{theme === 'light' ? '🌙' : '☀️'}</button>
      <div className={s.loginCard}><h1>Meal Planner</h1><p className={s.sub}>High-protein weekly meals for couples</p><div className={s.sub} style={{marginBottom:16}}>Who's planning?</div>
        {(['evan','liv'] as User[]).map(u => <button key={u} className={s.loginBtn} onClick={() => pick(u)}><span className={s.loginEmoji}>{DEFAULTS[u].emoji}</span><span className={s.loginName}>{DEFAULTS[u].label}</span><span className={s.sub}>{DEFAULTS[u].cal} cal · {DEFAULTS[u].protein}g P</span></button>)}
      </div></div>
  )
  return <App user={user} onSwitch={() => { localStorage.removeItem('mp-user'); setUser(null) }} theme={theme} onToggle={toggle} />
}

// ═══════════ MAIN APP ═══════════
function App({ user, onSwitch, theme, onToggle }: { user: User; onSwitch: () => void; theme: string; onToggle: () => void }) {
  const def = DEFAULTS[user]
  const pk = def.key
  const otherKey = pk === 'his' ? 'her' as const : 'his' as const
  const otherLabel = pk === 'his' ? 'Liv' : 'Evan'

  // User settings (editable targets)
  const [settings, setSettings] = useState<UserSettings>({ person: pk, calTarget: def.cal, proteinTarget: def.protein, goalWeight: def.goal })

  const [tab, setTab] = useState<Tab>('today')
  const [trackSub, setTrackSub] = useState<'summary' | 'weight' | 'water'>('summary')
  const [foodsSub, setFoodsSub] = useState<'favorites' | 'presets' | 'scanned' | 'dislikes'>('favorites')
  const [wOff, setWOff] = useState(0)
  const wid = weekIdFor(wOff)

  const [plan, setPlan] = useState<MealPlan>({ days: DAYS.map(eday), weekId: wid })
  const [dislikes, setDislikes] = useState<Dislikes>({ his: [], her: [] })
  const [loading, setLoading] = useState(true)
  const [calc, setCalc] = useState<string | null>(null)
  const [grocery, setGrocery] = useState<GroceryItem[] | null>(null)
  const [grocLoad, setGrocLoad] = useState(false)
  const [grocChecked, setGrocChecked] = useState<Set<number>>(() => {
    try { const s = localStorage.getItem('groc-checked'); return s ? new Set(JSON.parse(s)) : new Set() } catch { return new Set() }
  })
  const [expDay, setExpDay] = useState(0)

  const [ideas, setIdeas] = useState<Record<string, MealIdea[]> | null>(null)
  const [ideasLoad, setIdeasLoad] = useState(false)
  const [applyTarget, setApplyTarget] = useState<{ idea: MealIdea; mt: string } | null>(null)

  const [presets, setPresets] = useState<PresetMeal[]>([])
  const [favorites, setFavorites] = useState<FavoriteMeal[]>([])
  const [templates, setTemplates] = useState<WeekTemplate[]>([])
  const [expPreset, setExpPreset] = useState<string | null>(null)
  const [presetPick, setPresetPick] = useState<{ di: number; mt: string } | null>(null)

  const [scanned, setScanned] = useState<ScannedFood[]>([])
  const [bcInput, setBcInput] = useState(''); const [scanSearch, setScanSearch] = useState(''); const [scanLoading, setScanLoading] = useState(false); const [scanErr, setScanErr] = useState(''); const [expScan, setExpScan] = useState<string | null>(null)

  const [weights, setWeights] = useState<WeightEntry[]>([]); const [wInput, setWInput] = useState(''); const [wDate, setWDate] = useState(() => new Date().toISOString().split('T')[0])
  const [water, setWater] = useState<WaterEntry[]>([]); const today = new Date().toISOString().split('T')[0]
  const [locks, setLocks] = useState<Set<string>>(new Set()); const [copyTgt, setCopyTgt] = useState<{ meal: PersonMeal; who: string; mt: string } | null>(null); const [disInput, setDisInput] = useState('')
  const [editNotes, setEditNotes] = useState<{ di: number; mt: string } | null>(null); const [notesVal, setNotesVal] = useState('')

  // Toast
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null)
  const tRef = useRef<any>(null)
  const showToast = (msg: string, undo?: () => void) => { if (tRef.current) clearTimeout(tRef.current); setToast({ msg, undo }); tRef.current = setTimeout(() => setToast(null), 5000) }

  // Coach
  const [coachMsgs, setCoachMsgs] = useState<{ role: string; text: string }[]>([]); const [coachInput, setCoachInput] = useState(''); const [coachLoad, setCoachLoad] = useState(false)

  // Camera barcode bridge
  const [camBarcode, setCamBarcode] = useState<string | null>(null)
  useEffect(() => { if (camBarcode) { doScan(camBarcode); setCamBarcode(null) } }, [camBarcode])

  // Debounced save
  const saveRef = useRef<any>(null)
  const savePlan = useCallback((p: MealPlan) => {
    if (saveRef.current) clearTimeout(saveRef.current)
    saveRef.current = setTimeout(async () => { try { await supabase.from('meal_plan').upsert({ week_id: wid, plan: p }, { onConflict: 'week_id' }) } catch {} }, 1000)
  }, [wid])
  const updateDay = useCallback((di: number, fn: (d: DayPlan) => DayPlan) => {
    setPlan(prev => { const days = [...prev.days]; days[di] = fn(days[di]); const next = { ...prev, days }; savePlan(next); return next })
  }, [savePlan])

  // Helpers
  const eCal = settings.calTarget; const ePro = settings.proteinTarget
  const myDis = () => dislikes[pk]; const allDis = () => [...dislikes.his, ...dislikes.her]
  const scApi = useMemo(() => scanned.map(f => ({ name: f.name, brand: f.brand, servingSize: f.servingSize, cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat })), [scanned])

  const sanitize = (raw: any): MealPlan => {
    const sm = (m: any): PersonMeal => ({ input: m?.input || '', meal: m?.meal ?? null, eaten: m?.eaten ?? false })
    return { days: DAYS.map((meta, i) => { const d = raw?.days?.[i] ?? {}; return { day: meta.name, theme: meta.theme, his: { breakfast: sm(d?.his?.breakfast), lunch: sm(d?.his?.lunch), snack: sm(d?.his?.snack) }, her: { breakfast: sm(d?.her?.breakfast), lunch: sm(d?.her?.lunch), snack: sm(d?.her?.snack) }, dinner: sm(d?.dinner) } }), weekId: wid }
  }

  const lk = (di: number, who: string, mt: string) => `${wid}-${di}-${who}-${mt}`
  const isLk = (di: number, who: string, mt: string) => locks.has(lk(di, who, mt))
  const togLk = async (di: number, who: string, mt: string) => { const k = lk(di, who, mt), n = new Set(locks); if (n.has(k)) { n.delete(k); await supabase.from('locked_meals').delete().eq('week_id', wid).eq('day_index', di).eq('person', who).eq('meal_type', mt) } else { n.add(k); await supabase.from('locked_meals').insert({ week_id: wid, day_index: di, person: who, meal_type: mt }) }; setLocks(n) }

  // ── Load ──
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: dd }, { data: pd }, { data: pr2 }, { data: wd }, { data: sf }, { data: lkd }, { data: wa }, { data: fav }, { data: tpl }, { data: us }] = await Promise.all([
        supabase.from('dislikes').select('*'),
        supabase.from('meal_plan').select('*').eq('week_id', wid).limit(1).single(),
        supabase.from('preset_meals').select('*').order('created_at', { ascending: false }),
        supabase.from('weight_entries').select('*').order('date', { ascending: true }),
        supabase.from('scanned_foods').select('*').order('created_at', { ascending: false }),
        supabase.from('locked_meals').select('*').eq('week_id', wid),
        supabase.from('water_entries').select('*').order('date', { ascending: true }),
        supabase.from('favorites').select('*').order('use_count', { ascending: false }),
        supabase.from('week_templates').select('*').order('created_at', { ascending: false }),
        supabase.from('user_settings').select('*').eq('person', pk).limit(1).single(),
      ])
      if (dd) setDislikes({ his: dd.filter((d: any) => d.person === 'his').map((d: any) => d.item), her: dd.filter((d: any) => d.person === 'her').map((d: any) => d.item) })
      setPlan(pd?.plan ? sanitize(pd.plan) : { days: DAYS.map(eday), weekId: wid })
      if (pr2) setPresets(pr2.map((p: any) => ({ id: p.id, name: p.name, mealType: p.meal_type, who: p.who, cal: p.cal, protein: p.protein, carbs: p.carbs, fat: p.fat, portions: p.portions || [], createdAt: p.created_at })))
      if (wd) setWeights(wd.map((w: any) => ({ id: w.id, person: w.person, weight: w.weight, date: w.date, createdAt: w.created_at })))
      if (sf) setScanned(sf.map((x: any) => ({ id: x.id, barcode: x.barcode, name: x.name, brand: x.brand, servingSize: x.serving_size, cal: x.cal, protein: x.protein, carbs: x.carbs, fat: x.fat, fiber: x.fiber || 0, sugar: x.sugar || 0, imageUrl: x.image_url || '', createdAt: x.created_at })))
      if (lkd) setLocks(new Set(lkd.map((l: any) => `${l.week_id}-${l.day_index}-${l.person}-${l.meal_type}`)))
      if (wa) setWater(wa.map((w: any) => ({ id: w.id, person: w.person, glasses: w.glasses, date: w.date })))
      if (fav) setFavorites(fav.map((f: any) => ({ id: f.id, person: f.person, mealType: f.meal_type, name: f.name, input: f.input || f.name, cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, portions: f.portions || [], useCount: f.use_count || 0 })))
      if (tpl) setTemplates(tpl.map((t: any) => ({ id: t.id, name: t.name, plan: t.plan, createdAt: t.created_at })))
      if (us) setSettings({ person: pk, calTarget: us.cal_target || def.cal, proteinTarget: us.protein_target || def.protein, goalWeight: us.goal_weight || def.goal })
    } catch {}
    setLoading(false)
  }, [wid, pk])
  useEffect(() => { load() }, [load])

  // ── Computed ──
  const totals = useCallback((day: DayPlan) => [day[pk].breakfast.meal, day[pk].lunch.meal, day[pk].snack.meal, day.dinner.meal].reduce((a, m) => ({ cal: a.cal + (m?.cal || 0), protein: a.protein + (m?.protein || 0), carbs: a.carbs + (m?.carbs || 0), fat: a.fat + (m?.fat || 0) }), { cal: 0, protein: 0, carbs: 0, fat: 0 }), [pk])
  const liveBudget = useCallback((day: DayPlan) => eCal - (day.dinner.meal?.cal || 0) - (day[pk].breakfast.meal?.cal || 0) - (day[pk].lunch.meal?.cal || 0) - (day[pk].snack.meal?.cal || 0), [pk, eCal])

  const todayIdx = getTodayIndex()
  const todayDay = plan.days[todayIdx]
  const todayTotals = todayDay ? totals(todayDay) : { cal: 0, protein: 0, carbs: 0, fat: 0 }
  const todayBudget = todayDay ? liveBudget(todayDay) : eCal
  const todayW = water.find(w => w.person === pk && w.date === today)

  // Partner's today view
  const partnerTotals = todayDay ? [todayDay[otherKey].breakfast.meal, todayDay[otherKey].lunch.meal, todayDay[otherKey].snack.meal, todayDay.dinner.meal].reduce((a, m) => ({ cal: a.cal + (m?.cal || 0), protein: a.protein + (m?.protein || 0) }), { cal: 0, protein: 0 }) : { cal: 0, protein: 0 }

  // ── Actions ──
  const calcMeal = async (di: number, mt: string, input: string) => {
    if (!input.trim()) return; const who = mt === 'dinner' ? 'shared' : pk; if (isLk(di, who, mt)) return
    setCalc(`${di}-${who}-${mt}`); const day = plan.days[di], rem = eCal - (day.dinner.meal?.cal || 0)
    let sibCals = 0; if (mt !== 'dinner') { for (const sib of ['breakfast','lunch','snack']) { if (sib !== mt && isLk(di, pk, sib) && (day[pk] as any)[sib]?.meal) sibCals += (day[pk] as any)[sib].meal.cal } }
    try {
      const r = await fetch('/api/calculate-meal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mealInput: input, mealType: mt, person: mt === 'dinner' ? 'shared' : pk, remainingCals: rem, targetProtein: ePro, dinnerMacros: day.dinner.meal, dislikes: mt === 'dinner' ? allDis() : myDis(), lockedMealsCals: sibCals, scannedFoods: scApi }) })
      const { meal } = await r.json(); updateDay(di, d => mt === 'dinner' ? { ...d, dinner: { input, meal, eaten: false } } : { ...d, [pk]: { ...d[pk], [mt]: { input, meal, eaten: false } } })
    } catch { showToast('Failed to calculate') }
    setCalc(null)
  }

  const togEaten = (di: number, mt: string) => updateDay(di, d => mt === 'dinner' ? { ...d, dinner: { ...d.dinner, eaten: !d.dinner.eaten } } : { ...d, [pk]: { ...d[pk], [mt]: { ...(d[pk] as any)[mt], eaten: !(d[pk] as any)[mt].eaten } } })
  const resetDay = (di: number) => { const old = plan.days[di]; updateDay(di, () => eday(DAYS[di])); showToast(`${DAYS[di].name} cleared`, () => updateDay(di, () => old)) }
  const copyTo = (tdi: number) => { if (!copyTgt) return; updateDay(tdi, d => copyTgt.mt === 'dinner' ? { ...d, dinner: { ...copyTgt.meal } } : { ...d, [copyTgt.who]: { ...(d as any)[copyTgt.who], [copyTgt.mt]: { ...copyTgt.meal } } }); setCopyTgt(null); showToast('Copied') }

  // Notes
  const saveNotes = (di: number, mt: string, notes: string) => {
    updateDay(di, d => {
      const pm: PersonMeal = mt === 'dinner' ? d.dinner : (d[pk] as any)[mt]; if (!pm.meal) return d
      const nm = { ...pm.meal, notes }; return mt === 'dinner' ? { ...d, dinner: { ...d.dinner, meal: nm } } : { ...d, [pk]: { ...d[pk], [mt]: { ...(d[pk] as any)[mt], meal: nm } } }
    }); setEditNotes(null)
  }

  // Grocery
  const genGrocery = async () => { setGrocLoad(true); setTab('grocery'); try { const r = await fetch('/api/grocery-list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) }); const { items } = await r.json(); setGrocery(items); setGrocChecked(new Set()); localStorage.removeItem('groc-checked') } catch { showToast('Failed') }; setGrocLoad(false) }
  const toggleGrocItem = (i: number) => { const n = new Set(grocChecked); if (n.has(i)) n.delete(i); else n.add(i); setGrocChecked(n); localStorage.setItem('groc-checked', JSON.stringify([...n])) }
  const shareGrocery = () => { if (!grocery) return; const text = grocery.reduce((a, item) => a + `${item.name} — ${item.amount}\n`, 'Grocery List:\n\n'); if (navigator.share) navigator.share({ title: 'Grocery List', text }).catch(() => {}); else { navigator.clipboard.writeText(text); showToast('Copied!') } }

  // Ideas
  const genIdeas = async () => { setIdeasLoad(true); setIdeas(null); const dc = Math.round(eCal * 0.33), bc = Math.round((eCal - dc) * 0.37), sc = Math.round((eCal - dc) * 0.15), lc = eCal - dc - bc - sc; try { const r = await fetch('/api/meal-ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ who: pk, dislikes: myDis(), calBudget: { breakfast: bc, lunch: lc, dinner: dc, snack: sc }, proteinTarget: ePro }) }); const { ideas: ni } = await r.json(); setIdeas(ni) } catch { showToast('Failed') }; setIdeasLoad(false) }
  const applyIdea = (di: number) => { if (!applyTarget) return; const { idea, mt } = applyTarget; const meal: MacroMeal = { name: idea.name, description: idea.description, cal: idea.cal, protein: idea.protein, carbs: idea.carbs, fat: idea.fat, portions: idea.portions }; updateDay(di, d => mt === 'dinner' ? { ...d, dinner: { input: idea.name, meal, eaten: false } } : { ...d, [pk]: { ...d[pk], [mt]: { input: idea.name, meal, eaten: false } } }); setApplyTarget(null); showToast('Applied') }

  // Favorites
  const addFav = async (meal: MacroMeal, mt: string, input: string) => {
    const who = mt === 'dinner' ? 'shared' : pk
    const { data } = await supabase.from('favorites').insert({ person: who, meal_type: mt, name: meal.name, input, cal: meal.cal, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, portions: meal.portions || [], use_count: 1 }).select().single()
    if (data) { setFavorites(p => [{ id: data.id, person: data.person, mealType: data.meal_type, name: data.name, input: data.input || data.name, cal: data.cal, protein: data.protein, carbs: data.carbs, fat: data.fat, portions: data.portions || [], useCount: data.use_count || 0 }, ...p]); showToast('Added to favorites ❤️') }
  }
  const useFav = (fav: FavoriteMeal, di: number, mt: string) => {
    const meal: MacroMeal = { name: fav.name, cal: fav.cal, protein: fav.protein, carbs: fav.carbs, fat: fav.fat, portions: fav.portions }
    updateDay(di, d => mt === 'dinner' ? { ...d, dinner: { input: fav.input, meal, eaten: false } } : { ...d, [pk]: { ...d[pk], [mt]: { input: fav.input, meal, eaten: false } } })
    supabase.from('favorites').update({ use_count: fav.useCount + 1 }).eq('id', fav.id).then(() => {})
    showToast(`Using ${fav.name}`)
  }
  const delFav = async (id: string) => { await supabase.from('favorites').delete().eq('id', id); setFavorites(p => p.filter(x => x.id !== id)); showToast('Removed') }

  // Presets
  const savePr = async (meal: MacroMeal, mt: string) => { const { data } = await supabase.from('preset_meals').insert({ name: meal.name, meal_type: mt, who: mt === 'dinner' ? 'shared' : pk, cal: meal.cal, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, portions: meal.portions || [] }).select().single(); if (data) { setPresets(p => [{ id: data.id, name: data.name, mealType: data.meal_type, who: data.who, cal: data.cal, protein: data.protein, carbs: data.carbs, fat: data.fat, portions: data.portions || [], createdAt: data.created_at }, ...p]); showToast('Preset saved') } }
  const delPr = async (id: string) => { await supabase.from('preset_meals').delete().eq('id', id); setPresets(p => p.filter(x => x.id !== id)); showToast('Deleted') }
  const usePr = (p: PresetMeal, di: number, mt: string) => { const meal: MacroMeal = { name: p.name, cal: p.cal, protein: p.protein, carbs: p.carbs, fat: p.fat, portions: p.portions }; updateDay(di, d => mt === 'dinner' ? { ...d, dinner: { input: p.name, meal, eaten: false } } : { ...d, [pk]: { ...d[pk], [mt]: { input: p.name, meal, eaten: false } } }); setPresetPick(null); showToast('Applied') }

  // Templates
  const saveTemplate = async () => {
    const name = prompt('Name this template:'); if (!name?.trim()) return
    const { data } = await supabase.from('week_templates').insert({ name: name.trim(), plan }).select().single()
    if (data) { setTemplates(p => [{ id: data.id, name: data.name, plan: data.plan, createdAt: data.created_at }, ...p]); showToast('Template saved') }
  }
  const loadTemplate = (tpl: WeekTemplate) => { setPlan(sanitize(tpl.plan)); savePlan(sanitize(tpl.plan)); showToast(`Loaded "${tpl.name}"`) }
  const delTemplate = async (id: string) => { await supabase.from('week_templates').delete().eq('id', id); setTemplates(p => p.filter(x => x.id !== id)); showToast('Deleted') }

  // Weight
  const addW = async () => { const w = parseFloat(wInput); if (isNaN(w) || w < 50) return; const { data } = await supabase.from('weight_entries').insert({ person: pk, weight: w, date: wDate }).select().single(); if (data) { setWeights(p => [...p, { id: data.id, person: data.person, weight: data.weight, date: data.date, createdAt: data.created_at }].sort((a, b) => a.date.localeCompare(b.date))); setWInput(''); showToast(`Logged ${w} lbs`) } }
  const delW = async (id: string) => { await supabase.from('weight_entries').delete().eq('id', id); setWeights(p => p.filter(x => x.id !== id)); showToast('Deleted') }

  // Water
  const addWater = async () => { if (todayW) { const ng = todayW.glasses + 1; await supabase.from('water_entries').update({ glasses: ng }).eq('id', todayW.id); setWater(p => p.map(w => w.id === todayW.id ? { ...w, glasses: ng } : w)) } else { const { data } = await supabase.from('water_entries').insert({ person: pk, glasses: 1, date: today }).select().single(); if (data) setWater(p => [...p, { id: data.id, person: data.person, glasses: data.glasses, date: data.date }]) } }
  const subWater = async () => { if (!todayW || todayW.glasses <= 0) return; const ng = todayW.glasses - 1; await supabase.from('water_entries').update({ glasses: ng }).eq('id', todayW.id); setWater(p => p.map(w => w.id === todayW.id ? { ...w, glasses: ng } : w)) }

  // Dislikes
  const addDis = async (v: string) => { const t = v.trim().toLowerCase(); if (!t || dislikes[pk].includes(t)) return; await supabase.from('dislikes').insert({ person: pk, item: t }); setDislikes(p => ({ ...p, [pk]: [...p[pk], t] })) }
  const remDis = async (item: string) => { await supabase.from('dislikes').delete().eq('person', pk).eq('item', item); setDislikes(p => ({ ...p, [pk]: p[pk].filter(x => x !== item) })); showToast(`Removed "${item}"`) }

  // Barcode
  const doScan = async (code?: string) => { const bc = (code || bcInput).trim(); if (!bc) return; setScanLoading(true); setScanErr(''); try { const r = await fetch('/api/scan-barcode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ barcode: bc }) }); const data = await r.json(); if (data.error) { setScanErr(data.error); setScanLoading(false); return }; const f = data.food; const { data: saved } = await supabase.from('scanned_foods').insert({ barcode: f.barcode, name: f.name, brand: f.brand, serving_size: f.servingSize, cal: f.cal, protein: f.protein, carbs: f.carbs, fat: f.fat, fiber: f.fiber, sugar: f.sugar, image_url: f.imageUrl }).select().single(); if (saved) { setScanned(p => [{ id: saved.id, barcode: saved.barcode, name: saved.name, brand: saved.brand, servingSize: saved.serving_size, cal: saved.cal, protein: saved.protein, carbs: saved.carbs, fat: saved.fat, fiber: saved.fiber || 0, sugar: saved.sugar || 0, imageUrl: saved.image_url || '', createdAt: saved.created_at }, ...p]); showToast(`Added: ${f.name}`) }; setBcInput('') } catch { setScanErr('Failed') }; setScanLoading(false) }
  const delScan = async (id: string) => { await supabase.from('scanned_foods').delete().eq('id', id); setScanned(p => p.filter(x => x.id !== id)); showToast('Removed') }
  const filteredScanned = scanSearch ? scanned.filter(f => f.name.toLowerCase().includes(scanSearch.toLowerCase()) || f.brand.toLowerCase().includes(scanSearch.toLowerCase())) : scanned

  // Coach
  const sendCoach = async () => { if (!coachInput.trim()) return; const msg = coachInput.trim(); setCoachInput(''); setCoachMsgs(p => [...p, { role: 'user', text: msg }]); setCoachLoad(true); const wSt = weights.filter(e => e.person === pk); const ctx = `Name: ${def.label}, Cal: ${eCal}, Protein: ${ePro}g, Weight: ${wSt.length > 0 ? wSt[wSt.length - 1].weight : '?'} lbs, Goal: ${settings.goalWeight} lbs, Dislikes: ${myDis().join(', ') || 'none'}, Water: ${todayW?.glasses || 0}/8`; try { const r = await fetch('/api/ai-coach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, context: ctx }) }); const { reply } = await r.json(); setCoachMsgs(p => [...p, { role: 'ai', text: reply }]) } catch { setCoachMsgs(p => [...p, { role: 'ai', text: 'Sorry, try again.' }]) }; setCoachLoad(false) }

  // Recalc / delete ingredient
  const recalcP = async (di: number, mt: string, pi: number, amt: string) => { const day = plan.days[di]; const pm: PersonMeal = mt === 'dinner' ? day.dinner : (day[pk] as any)[mt]; if (!pm.meal?.portions) return; try { const r = await fetch('/api/recalculate-portions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portions: pm.meal.portions, editedIndex: pi, newAmount: amt, originalMeal: pm.meal }) }); const { result } = await r.json(); if (!result) return; const nm = { ...pm.meal, ...result }; updateDay(di, d => mt === 'dinner' ? { ...d, dinner: { ...d.dinner, meal: nm } } : { ...d, [pk]: { ...d[pk], [mt]: { ...(d[pk] as any)[mt], meal: nm } } }) } catch {} }
  const delIng = (di: number, mt: string, pi: number) => updateDay(di, d => { const pm: PersonMeal = mt === 'dinner' ? d.dinner : (d[pk] as any)[mt]; if (!pm.meal?.portions) return d; const np = pm.meal.portions.filter((_, i) => i !== pi); const t = np.reduce((a, p) => ({ cal: a.cal + p.cal, protein: a.protein + p.protein, carbs: a.carbs + p.carbs, fat: a.fat + p.fat }), { cal: 0, protein: 0, carbs: 0, fat: 0 }); const nm = { ...pm.meal, portions: np, ...t }; return mt === 'dinner' ? { ...d, dinner: { ...d.dinner, meal: nm } } : { ...d, [pk]: { ...d[pk], [mt]: { ...(d[pk] as any)[mt], meal: nm } } } })

  // Settings
  const saveSetting = async (field: string, val: number) => {
    const next = { ...settings, [field]: val }; setSettings(next)
    await supabase.from('user_settings').upsert({ person: pk, cal_target: next.calTarget, protein_target: next.proteinTarget, goal_weight: next.goalWeight }, { onConflict: 'person' })
  }

  // Weekly stats
  const weekStats = useMemo(() => { let tc = 0, tp = 0, dc = 0, ot = 0, ec = 0, tm = 0; plan.days.forEach(day => { const t = totals(day); if (t.cal > 0) { tc += t.cal; tp += t.protein; dc++; if (t.cal <= eCal + 50) ot++ }; [day[pk].breakfast, day[pk].lunch, day[pk].snack, day.dinner].forEach(m => { if (m.meal) { tm++; if (m.eaten) ec++ } }) }); return { avgCal: dc > 0 ? Math.round(tc / dc) : 0, avgP: dc > 0 ? Math.round(tp / dc) : 0, dc, ot, ec, tm, adh: tm > 0 ? Math.round(ec / tm * 100) : 0 } }, [plan, pk, eCal, totals])
  const wStats = useMemo(() => { const e = weights.filter(x => x.person === pk).sort((a, b) => a.date.localeCompare(b.date)); if (!e.length) return null; const l = e[e.length - 1], l7 = e.slice(-7), a7 = Math.round(l7.reduce((s2, x) => s2 + x.weight, 0) / l7.length * 10) / 10; const ago = new Date(); ago.setDate(ago.getDate() - 30); const l30 = e.filter(x => new Date(x.date) >= ago); const a30 = l30.length > 0 ? Math.round(l30.reduce((s2, x) => s2 + x.weight, 0) / l30.length * 10) / 10 : a7; return { cur: l.weight, a7, a30, toG: Math.round((l.weight - settings.goalWeight) * 10) / 10 } }, [weights, pk, settings.goalWeight])

  const CATS = ['Proteins', 'Produce', 'Dairy & Eggs', 'Pantry & Dry Goods', 'Condiments & Sauces', 'Other']

  if (loading) return <div className={s.loading}><div className={s.spinner} /><p>Loading...</p></div>

  // ── Render helper for a meal slot ──
  const renderMeal = (di: number, mt: string) => {
    const who = mt === 'dinner' ? 'shared' : pk
    const pm: PersonMeal = mt === 'dinner' ? plan.days[di].dinner : (plan.days[di][pk] as any)[mt]
    const locked = isLk(di, who, mt); const isC = calc === `${di}-${who}-${mt}`
    const label = mt === 'dinner' ? '🍽️ Dinner (shared)' : mt === 'breakfast' ? '🌅 Breakfast' : mt === 'lunch' ? '☀️ Lunch' : '🍎 Snack'
    const ph = mt === 'dinner' ? 'e.g. steak and potatoes' : mt === 'breakfast' ? 'e.g. eggs and turkey sausage' : mt === 'lunch' ? 'e.g. chicken salad' : 'e.g. protein shake'
    const myFavs = favorites.filter(f => f.mealType === mt && (f.person === who || f.person === 'shared')).slice(0, 3)

    return <div key={mt} className={s.mealBlock}>
      <div className={s.mealLabel}>{label}{pm.meal && <button className={`${s.eatenBtn} ${pm.eaten ? s.eatenAct : ''}`} onClick={() => togEaten(di, mt)}>{pm.eaten ? '✅' : '○'}</button>}</div>
      {/* Favorites quick picks */}
      {!pm.meal && myFavs.length > 0 && <div className={s.favRow}>{myFavs.map(f => <button key={f.id} className={s.favBtn} onClick={() => useFav(f, di, mt)}><span className={s.favName}>{f.name}</span><span className={s.sub}>{f.cal}cal</span></button>)}</div>}
      <div className={s.mealRow}>
        <MealInputField key={`${di}-${mt}`} initial={pm.input} placeholder={ph} disabled={isC || locked} onSubmit={v => calcMeal(di, mt, v)} onSync={v => updateDay(di, d => mt === 'dinner' ? { ...d, dinner: { ...d.dinner, input: v } } : { ...d, [pk]: { ...d[pk], [mt]: { ...(d[pk] as any)[mt], input: v } } })} />
        {!locked ? <button className={s.calcBtn} onClick={() => pm.input.trim() && calcMeal(di, mt, pm.input)} disabled={isC || !pm.input.trim()}>{isC ? '…' : pm.meal ? '↺' : '→'}</button> : <div className={s.lockBadge}>🔒</div>}
        <button className={s.preBtn} onClick={() => setPresetPick({ di, mt })}>⭐</button>
      </div>
      {isC && <div className={s.calcMsg}><span className={s.spin2} /> Calculating...</div>}
      {!isC && pm.meal && <div className={`${s.result} ${locked ? s.resultLock : ''} ${pm.eaten ? s.resultEaten : ''}`}>
        <div className={s.resultHdr}>
          <div className={s.resultName}>{locked && '🔒 '}{pm.meal.name}</div>
          <div className={s.resultAct}>
            <button className={s.actBtn} onClick={() => addFav(pm.meal!, mt, pm.input)} title="Favorite">❤️</button>
            <button className={s.actBtn} onClick={() => setCopyTgt({ meal: pm, who, mt })}>📋</button>
            <button className={`${s.actBtn} ${locked ? s.actBtnOn : ''}`} onClick={() => togLk(di, who, mt)}>{locked ? '🔓' : '🔒'}</button>
            <button className={s.actBtn} onClick={() => { setEditNotes({ di, mt }); setNotesVal(pm.meal?.notes || '') }}>📝</button>
          </div>
        </div>
        <div className={s.macros}><span><b>{pm.meal.cal}</b> cal</span><span className={s.green}>P <b>{pm.meal.protein}g</b></span><span>C <b>{pm.meal.carbs}g</b></span><span>F <b>{pm.meal.fat}g</b></span></div>
        {pm.meal.notes && <div className={s.mealNotes}>📝 {pm.meal.notes}</div>}
        {pm.meal.portions?.length! > 0 && <Portions portions={pm.meal.portions!} edit={!locked} onRecalc={(pi, a) => recalcP(di, mt, pi, a)} onDel={pi => delIng(di, mt, pi)} />}
      </div>}
      {mt === 'dinner' && plan.days[di].dinner.meal && <div className={`${s.budgetBar} ${liveBudget(plan.days[di]) < 0 ? s.budgetWarn : ''}`}>{liveBudget(plan.days[di]) >= 0 ? `${liveBudget(plan.days[di])} cal left` : `${Math.abs(liveBudget(plan.days[di]))} over!`}</div>}
    </div>
  }

  // ════════════ RENDER ════════════
  return (
    <div className={s.app}>
      {toast && <div className={s.toast}><span>{toast.msg}</span>{toast.undo && <button onClick={() => { toast.undo?.(); setToast(null) }}>Undo</button>}<button onClick={() => setToast(null)}>×</button></div>}

      {/* Header */}
      <div className={s.hdr}>
        <div className={s.hdrTop}>
          <div><h1>{def.emoji} {def.label}</h1><p className={s.sub}>{eCal} cal · {ePro}g P</p></div>
          <div className={s.hdrAct}><button className={s.switchBtn} onClick={onSwitch}>Switch</button><button className={s.themeBtn} onClick={onToggle}>{theme === 'light' ? '🌙' : '☀️'}</button></div>
        </div>
        <div className={s.hdrMini}>
          <div className={s.waterPill}><button onClick={subWater}>−</button><span>💧 {todayW?.glasses || 0}/8</span><button onClick={addWater}>+</button></div>
          {weekStats.dc > 0 && <div className={s.progBar}><div className={s.progFill} style={{ width: `${weekStats.ot / 7 * 100}%` }} /><span className={s.progTxt}>{weekStats.ot}/7</span></div>}
        </div>
      </div>

      {/* Tabs */}
      <div className={s.tabs}>
        {([['today','🏠 Today'],['plan','📋 Week'],['track','📊 Track'],['ideas','💡 Ideas'],['foods','🍎 Foods'],['grocery','🛒 List'],['coach','🤖 Coach'],['settings','⚙️']] as [Tab,string][]).map(([t, l]) =>
          <button key={t} className={`${s.tab} ${tab === t ? s.active : ''}`} onClick={() => setTab(t)}>{l}</button>
        )}
      </div>

      {/* ═══ TODAY ═══ */}
      {tab === 'today' && <div>
        <h2 className={s.secTitle}>{DAY_NAMES[new Date().getDay()]}'s Plan</h2>
        <div className={s.todayBudget}>
          <div className={s.todayBudgetMain}><span className={`${s.todayBudgetNum} ${todayBudget < 0 ? s.warn : s.green}`}>{todayBudget}</span><span className={s.sub}>cal remaining</span></div>
          <div className={s.todayStats}><span>{todayTotals.cal}/{eCal} cal</span><span className={todayTotals.protein >= ePro ? s.green : s.warn}>P {todayTotals.protein}g/{ePro}g</span></div>
        </div>

        {/* My meals */}
        {(['dinner','breakfast','lunch','snack'] as const).map(mt => renderMeal(todayIdx, mt))}

        {/* Partner visibility */}
        <div className={s.partnerSection}>
          <h3 className={s.subHd}>{otherLabel}'s meals today</h3>
          {(['breakfast','lunch','snack'] as const).map(mt => {
            const pm = todayDay[otherKey][mt]
            return pm.meal ? <div key={mt} className={s.partnerMeal}><span className={s.sub}>{mt}</span><span>{pm.meal.name}</span><span className={s.sub}>{pm.meal.cal} cal</span></div> : null
          })}
          {todayDay.dinner.meal && <div className={s.partnerMeal}><span className={s.sub}>dinner</span><span>{todayDay.dinner.meal.name} (shared)</span><span className={s.sub}>{todayDay.dinner.meal.cal} cal</span></div>}
          {partnerTotals.cal === 0 && <p className={s.sub}>{otherLabel} hasn't planned today yet.</p>}
          {partnerTotals.cal > 0 && <p className={s.sub}>Total: {partnerTotals.cal} cal · {partnerTotals.protein}g P</p>}
        </div>
      </div>}

      {/* ═══ PLAN (full week) ═══ */}
      {tab === 'plan' && <div>
        <div className={s.weekNav}><button onClick={() => setWOff(o => o - 1)}>←</button><span className={s.weekLbl}>{wOff === 0 ? 'This week' : wOff === 1 ? 'Next week' : wOff === -1 ? 'Last week' : wid}<br/><small className={s.sub}>{wid}</small></span><button onClick={() => setWOff(o => o + 1)}>→</button></div>
        {/* Template actions */}
        <div className={s.tplRow}><button className={s.secBtn} onClick={saveTemplate}>💾 Save as template</button>
          {templates.length > 0 && templates.slice(0, 3).map(t => <button key={t.id} className={s.secBtn} onClick={() => loadTemplate(t)}>📂 {t.name}</button>)}
        </div>

        <div className={s.dayGrid}>
          {plan.days.map((day, di) => {
            const t = totals(day), open = expDay === di, over = t.cal > eCal + 50
            return <div key={di} className={`${s.dayCard} ${open ? s.dayOpen : ''} ${di === todayIdx ? s.dayToday : ''}`}>
              <button className={s.dayHdr} onClick={() => setExpDay(open ? -1 : di)}>
                <div className={s.dayL}><span className={s.dayN}>{di === todayIdx ? `📍 ${day.day}` : day.day}</span><span className={s.dayTh}>{day.theme}</span></div>
                <div className={s.dayR}>{t.cal > 0 && <span className={`${s.pill} ${over ? s.pillWarn : ''}`}>{t.cal} · {t.protein}g P</span>}<span className={s.chev}>{open ? '▲' : '▼'}</span></div>
              </button>
              {open && <div className={s.dayBody}>
                {(['dinner','breakfast','lunch','snack'] as const).map(mt => renderMeal(di, mt))}
                {t.cal > 0 && <div className={`${s.dayTotals} ${over ? s.totalsWarn : ''}`}><span><b>{t.cal}</b>/{eCal} cal</span><span className={t.protein >= ePro ? s.green : s.warn}>P <b>{t.protein}g</b>/{ePro}g</span></div>}
                <button className={s.resetBtn} onClick={() => resetDay(di)}>🗑️ Clear day</button>
              </div>}
            </div>
          })}
        </div>
        <button className={s.primaryBtn} onClick={genGrocery}>Generate grocery list →</button>
      </div>}

      {/* ═══ TRACK ═══ */}
      {tab === 'track' && <div>
        <div className={s.subTabs}>{([['summary','📊 Summary'],['weight','⚖️ Weight'],['water','💧 Water']] as const).map(([k,l]) => <button key={k} className={`${s.subTab} ${trackSub === k ? s.active : ''}`} onClick={() => setTrackSub(k)}>{l}</button>)}</div>
        {trackSub === 'summary' && <><div className={s.grid4}><div className={s.card}><small>Avg cal</small><b className={weekStats.avgCal <= eCal ? s.green : s.warn}>{weekStats.avgCal}<small>/{eCal}</small></b></div><div className={s.card}><small>Avg protein</small><b className={weekStats.avgP >= ePro ? s.green : s.warn}>{weekStats.avgP}g<small>/{ePro}g</small></b></div><div className={s.card}><small>On target</small><b>{weekStats.ot}/7</b></div><div className={s.card}><small>Adherence</small><b>{weekStats.adh}%</b></div></div>
          <h3 className={s.subHd}>Daily breakdown</h3>
          {plan.days.map((day, di) => { const t = totals(day), ok = t.cal > 0 && t.cal <= eCal + 50; return <div key={di} className={`${s.sumRow} ${t.cal === 0 ? s.sumEmpty : ok ? s.sumGood : s.sumOver}`}><span className={s.sumDay}>{di === todayIdx ? `📍 ${day.day}` : day.day}</span><span>{t.cal > 0 ? `${t.cal} cal · ${t.protein}g P` : '—'}</span><span>{t.cal > 0 ? (ok ? '✅' : '⚠️') : ''}</span></div> })}
        </>}
        {trackSub === 'weight' && <><div className={s.inputRow}><input type="date" value={wDate} onChange={e => setWDate(e.target.value)} /><input type="number" value={wInput} onChange={e => setWInput(e.target.value)} placeholder="lbs" step="0.1" className={s.numInput} onKeyDown={e => { if (e.key === 'Enter') addW() }} /><button className={s.addBtn} onClick={addW}>Log</button></div>
          {wStats && <div className={s.grid4}><div className={s.card}><small>Current</small><b>{wStats.cur} lbs</b></div><div className={s.card}><small>7d avg</small><b>{wStats.a7}</b></div><div className={s.card}><small>30d avg</small><b>{wStats.a30}</b></div><div className={s.card}><small>To goal</small><b className={wStats.toG <= 0 ? s.green : s.warn}>{wStats.toG > 0 ? '-' : '+'}{Math.abs(wStats.toG)}</b></div></div>}
          {(() => { const e = weights.filter(x => x.person === pk).sort((a, b) => a.date.localeCompare(b.date)); if (!e.length) return null; const mn = Math.min(...e.map(x => x.weight), settings.goalWeight) - 3, mx = Math.max(...e.map(x => x.weight)) + 3, rg = mx - mn || 1, gp = ((settings.goalWeight - mn) / rg) * 100; return <div className={s.chartBlock}><h3 className={s.subHd}>Progress</h3><div className={s.chart}><div className={s.goalLine} style={{ bottom: `${gp}%` }}><span>Goal: {settings.goalWeight}</span></div>{e.slice(-30).map((x, i) => { const p = ((x.weight - mn) / rg) * 100; const prev = i > 0 ? e[Math.max(0, e.indexOf(x) - 1)].weight : x.weight; return <div key={x.id} className={s.bar}><div className={`${s.barFill} ${x.weight <= prev ? s.barDown : s.barUp}`} style={{ height: `${p}%` }} /><small>{x.weight}</small><small className={s.sub}>{new Date(x.date + 'T12:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}</small></div> })}</div></div> })()}
          {weights.filter(x => x.person === pk).length > 0 && <div><h3 className={s.subHd}>Log</h3>{[...weights].filter(x => x.person === pk).reverse().slice(0, 15).map(e => <div key={e.id} className={s.logRow}><span className={s.sub}>{new Date(e.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })}</span><b>{e.weight} lbs</b><button className={s.delBtn} onClick={() => delW(e.id)}>×</button></div>)}</div>}
        </>}
        {trackSub === 'water' && <><div className={s.waterMain}><div className={s.waterBig}>{todayW?.glasses || 0}</div><p className={s.sub}>glasses today</p><p className={s.green}>{(todayW?.glasses || 0) >= 8 ? '✅ Goal!' : `${8 - (todayW?.glasses || 0)} more`}</p><div className={s.waterBtns}><button className={s.waterMinBtn} onClick={subWater}>−</button><button className={s.waterAddBtn} onClick={addWater}>+ Add glass</button></div></div>
          <h3 className={s.subHd}>Last 7 days</h3>
          <div className={s.waterHist}>{Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); const ds = d.toISOString().split('T')[0]; const en = water.find(w => w.person === pk && w.date === ds); return <div key={ds} className={s.waterDay}><small className={s.sub}>{d.toLocaleDateString('en', { weekday: 'short' })}</small><div className={`${s.waterBar} ${(en?.glasses || 0) >= 8 ? s.waterFull : ''}`} style={{ height: Math.min((en?.glasses || 0) / 8, 1) * 60 }} /><small>{en?.glasses || 0}</small></div> })}</div>
        </>}
      </div>}

      {/* ═══ IDEAS ═══ */}
      {tab === 'ideas' && <div>
        <h2 className={s.secTitle}>💡 Ideas for {def.label}</h2>
        <button className={s.primaryBtn} onClick={genIdeas} disabled={ideasLoad}>{ideasLoad ? '⏳ Generating...' : '✨ Generate ideas'}</button>
        {ideasLoad && <div className={s.loading}><div className={s.spinner}/></div>}
        {!ideasLoad && ideas && <div className={s.ideasWrap}>{(['breakfast','lunch','dinner','snack'] as const).map(mt => <div key={mt}><h3 className={s.subHd}>{mt[0].toUpperCase() + mt.slice(1)}</h3><div className={s.ideasGrid}>{(ideas as any)[mt]?.map((idea: MealIdea, i: number) => <div key={i} className={s.ideaCard}><div className={s.ideaName}>{idea.name}</div><div className={s.sub}>{idea.description}</div><div className={s.macros}><span><b>{idea.cal}</b> cal</span><span className={s.green}>P {idea.protein}g</span></div><button className={s.useBtn} onClick={() => setApplyTarget({ idea, mt })}>Use this →</button></div>)}</div></div>)}</div>}
      </div>}

      {/* ═══ FOODS ═══ */}
      {tab === 'foods' && <div>
        <div className={s.subTabs}>{([['favorites','❤️ Favorites'],['presets','⭐ Presets'],['scanned','📷 Scanned'],['dislikes','🚫 Dislikes']] as const).map(([k,l]) => <button key={k} className={`${s.subTab} ${foodsSub === k ? s.active : ''}`} onClick={() => setFoodsSub(k)}>{l}</button>)}</div>

        {foodsSub === 'favorites' && <>
          <p className={s.sub}>Your most-used meals. Tap to use again. Shows as quick-picks on each meal slot.</p>
          {favorites.length === 0 ? <p className={s.empty}>No favorites yet. Tap ❤️ on any calculated meal.</p> : favorites.map(f => <div key={f.id} className={s.favCard}><div className={s.favCardInfo}><b>{f.name}</b><br/><small className={s.sub}>{f.mealType} · {f.cal} cal · P {f.protein}g · Used {f.useCount}x</small></div><button className={s.delBtn} onClick={() => delFav(f.id)}>×</button></div>)}
        </>}

        {foodsSub === 'presets' && <>
          {presets.length === 0 ? <p className={s.empty}>No presets yet.</p> : (['breakfast','lunch','dinner','snack'] as const).map(mt => { const items = presets.filter(p => p.mealType === mt); if (!items.length) return null; return <div key={mt}><h3 className={s.subHd}>{mt[0].toUpperCase() + mt.slice(1)}</h3>{items.map(p => <div key={p.id} className={s.preCard}><div className={s.preHdr} onClick={() => setExpPreset(expPreset === p.id ? null : p.id)}><div><b>{p.name}</b><br/><small className={s.sub}>{p.who === 'shared' ? 'Shared' : p.who === 'his' ? 'Evan' : 'Liv'} · {p.cal} cal</small></div><span className={s.chev}>{expPreset === p.id ? '▲' : '▼'}</span></div>{expPreset === p.id && <div className={s.preBody}>{p.portions.map((pt, i) => <div key={i} className={s.preRow}><span>{pt.ingredient}</span><span className={s.sub}>{pt.amount} · {pt.cal} cal</span></div>)}<button className={s.dangerBtn} onClick={() => delPr(p.id)}>Delete</button></div>}</div>)}</div> })}
        </>}

        {foodsSub === 'scanned' && <>
          <div className={s.scanRow}><input type="text" inputMode="numeric" value={bcInput} placeholder="Barcode #" onChange={e => { setBcInput(e.target.value); setScanErr('') }} onKeyDown={e => { if (e.key === 'Enter') doScan() }} /><button className={s.scanBtn} onClick={() => doScan()} disabled={scanLoading || !bcInput.trim()}>{scanLoading ? '…' : '🔍'}</button></div>
          <button className={s.camBtn} onClick={async () => {
            const vid = document.createElement('video'); vid.setAttribute('autoplay', ''); vid.setAttribute('playsinline', '')
            const overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;'
            const closeBtn = document.createElement('button'); closeBtn.textContent = '✕ Close'; closeBtn.style.cssText = 'position:absolute;top:env(safe-area-inset-top,20px);right:20px;padding:12px 20px;font-size:16px;background:#fff;border:none;border-radius:8px;cursor:pointer;z-index:10;margin-top:20px;'
            const statusEl = document.createElement('div'); statusEl.textContent = 'Loading scanner...'; statusEl.style.cssText = 'position:absolute;bottom:calc(40px + env(safe-area-inset-bottom,0px));color:#fff;font-size:16px;font-weight:600;text-align:center;padding:0 20px;'
            vid.style.cssText = 'width:100%;max-height:80vh;object-fit:cover;'; overlay.appendChild(closeBtn); overlay.appendChild(vid); overlay.appendChild(statusEl); document.body.appendChild(overlay)
            let stopped = false; const cleanup = () => { stopped = true; const tracks = vid.srcObject as MediaStream; tracks?.getTracks().forEach(t => t.stop()); overlay.remove() }; closeBtn.onclick = cleanup
            try { const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); vid.srcObject = stream; await vid.play(); statusEl.textContent = 'Point camera at barcode...'
              const { BarcodeDetector } = await import('barcode-detector/ponyfill'); const det = new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128'] })
              let scanning2 = false; const scan2 = async () => { if (stopped || scanning2) return; scanning2 = true; try { const res = await det.detect(vid); if (res.length > 0) { statusEl.textContent = `Found: ${res[0].rawValue}`; const c = res[0].rawValue; cleanup(); setBcInput(c); setCamBarcode(c); scanning2 = false; return } } catch {}; scanning2 = false; if (!stopped) setTimeout(() => requestAnimationFrame(scan2), 150) }; scan2()
            } catch { statusEl.textContent = 'Camera failed. Enter manually.'; setTimeout(cleanup, 2500) }
          }}>📸 Open camera scanner</button>
          {scanErr && <p className={s.warn}>{scanErr}</p>}
          <input type="text" className={s.searchInput} placeholder="🔍 Search..." value={scanSearch} onChange={e => setScanSearch(e.target.value)} />
          {filteredScanned.length === 0 ? <p className={s.empty}>{scanSearch ? 'No matches.' : 'No foods scanned.'}</p> : <div className={s.scanList}><small className={s.sub}>{filteredScanned.length} foods</small>{filteredScanned.map(f => <div key={f.id} className={s.scanCard}><div className={s.scanHdr} onClick={() => setExpScan(expScan === f.id ? null : f.id)}><div className={s.scanInfo}>{f.imageUrl && <img src={f.imageUrl} alt="" className={s.scanImg} />}<div><b>{f.name}</b>{f.brand && <br/>}{f.brand && <small className={s.sub}>{f.brand}</small>}</div></div><small className={s.sub}><b>{f.cal}</b> cal</small></div>{expScan === f.id && <div className={s.scanBody}><div className={s.grid4}><div><small>Serving</small><b>{f.servingSize}</b></div><div><small>Carbs</small><b>{f.carbs}g</b></div><div><small>Fat</small><b>{f.fat}g</b></div><div><small>Fiber</small><b>{f.fiber}g</b></div></div><button className={s.dangerBtn} onClick={() => delScan(f.id)}>Remove</button></div>}</div>)}</div>}
        </>}

        {foodsSub === 'dislikes' && <>
          <div className={s.inputRow}><input type="text" value={disInput} placeholder="Add food..." onChange={e => setDisInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { addDis(disInput); setDisInput('') } }} /><button className={s.addBtn} onClick={() => { addDis(disInput); setDisInput('') }}>Add</button></div>
          <div className={s.tagList}>{myDis().length === 0 ? <span className={s.sub}>None</span> : myDis().map(i => <span key={i} className={s.tag}>{i}<button onClick={() => remDis(i)}>×</button></span>)}</div>
        </>}
      </div>}

      {/* ═══ GROCERY ═══ */}
      {tab === 'grocery' && <div>
        <div className={s.grocHdr}><div className={s.grocAct}><button className={s.secBtn} onClick={genGrocery} disabled={grocLoad}>{grocLoad ? '…' : '↺ Generate'}</button>{grocery && <button className={s.secBtn} onClick={shareGrocery}>📤 Share</button>}</div></div>
        {grocLoad && <div className={s.loading}><div className={s.spinner}/></div>}
        {!grocLoad && !grocery && <p className={s.empty}>Fill in meals, then generate.</p>}
        {!grocLoad && grocery && <div className={s.grocList}>{CATS.map(cat => { const items = grocery.filter(i => i.category === cat); if (!items.length) return null; let offset = grocery.indexOf(items[0]); return <div key={cat}><h3 className={s.catHd}>{cat}</h3><div className={s.grocItems}>{items.map((item, i) => { const gi = offset + i; return <div key={gi} className={`${s.grocItem} ${grocChecked.has(gi) ? s.grocChecked : ''}`} onClick={() => toggleGrocItem(gi)}><span className={s.grocCheck}>{grocChecked.has(gi) ? '☑️' : '⬜'}</span><span className={grocChecked.has(gi) ? s.grocStrike : ''}>{item.name}</span><span className={s.sub}>{item.amount}</span></div> })}</div></div> })}{grocery && <p className={s.sub} style={{textAlign:'center',marginTop:12}}>{grocChecked.size}/{grocery.length} checked</p>}</div>}
      </div>}

      {/* ═══ COACH ═══ */}
      {tab === 'coach' && <div>
        <h2 className={s.secTitle}>🤖 AI Coach</h2><p className={s.sub}>Knows your targets, weight, and dislikes.</p>
        <div className={s.chatBox}>{coachMsgs.length === 0 && <p className={s.empty}>Try: "Am I eating enough protein?" or "What can I swap for fewer carbs?"</p>}{coachMsgs.map((m, i) => <div key={i} className={`${s.chatMsg} ${m.role === 'user' ? s.chatUser : s.chatAi}`}>{m.text}</div>)}{coachLoad && <div className={s.chatMsg + ' ' + s.chatAi}><span className={s.spin2} /> Thinking...</div>}</div>
        <div className={s.chatInput}><input type="text" value={coachInput} placeholder="Ask your coach..." onChange={e => setCoachInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendCoach() }} /><button className={s.scanBtn} onClick={sendCoach} disabled={coachLoad || !coachInput.trim()}>Send</button></div>
      </div>}

      {/* ═══ SETTINGS ═══ */}
      {tab === 'settings' && <div>
        <h2 className={s.secTitle}>⚙️ Settings</h2>
        <div className={s.settingsSection}>
          <h3 className={s.subHd}>Daily targets for {def.label}</h3>
          <div className={s.settingRow}><span>Calorie target</span><input type="number" value={settings.calTarget} onChange={e => saveSetting('calTarget', +e.target.value || 0)} className={s.numInput} /><span className={s.sub}>cal</span></div>
          <div className={s.settingRow}><span>Protein target</span><input type="number" value={settings.proteinTarget} onChange={e => saveSetting('proteinTarget', +e.target.value || 0)} className={s.numInput} /><span className={s.sub}>g</span></div>
          <div className={s.settingRow}><span>Goal weight</span><input type="number" value={settings.goalWeight} onChange={e => saveSetting('goalWeight', +e.target.value || 0)} className={s.numInput} /><span className={s.sub}>lbs</span></div>
        </div>
        <div className={s.settingsSection}>
          <h3 className={s.subHd}>Week templates</h3>
          {templates.length === 0 ? <p className={s.sub}>No templates. Save one from the Week tab.</p> : templates.map(t => <div key={t.id} className={s.tplCard}><div><b>{t.name}</b><br/><small className={s.sub}>{new Date(t.createdAt).toLocaleDateString()}</small></div><div className={s.tplAct}><button className={s.secBtn} onClick={() => { loadTemplate(t); setTab('plan') }}>Load</button><button className={s.delBtn} onClick={() => delTemplate(t.id)}>×</button></div></div>)}
        </div>
      </div>}

      {/* ═══ DIALOGS ═══ */}
      {copyTgt && <div className={s.overlay} onClick={() => setCopyTgt(null)}><div className={s.dialog} onClick={e => e.stopPropagation()}><div className={s.dHdr}><h3>Copy to?</h3><button onClick={() => setCopyTgt(null)}>×</button></div><div className={s.dBody}>{DAYS.map((m, di) => <button key={di} className={s.dBtn} onClick={() => copyTo(di)}>{m.name}</button>)}</div></div></div>}
      {applyTarget && <div className={s.overlay} onClick={() => setApplyTarget(null)}><div className={s.dialog} onClick={e => e.stopPropagation()}><div className={s.dHdr}><h3>Add to?</h3><button onClick={() => setApplyTarget(null)}>×</button></div><div className={s.dBody}>{DAYS.map((m, di) => <button key={di} className={s.dBtn} onClick={() => applyIdea(di)}>{m.name}</button>)}</div></div></div>}
      {presetPick && <div className={s.overlay} onClick={() => setPresetPick(null)}><div className={s.dialog} onClick={e => e.stopPropagation()}><div className={s.dHdr}><h3>Choose</h3><button onClick={() => setPresetPick(null)}>×</button></div><div className={s.dBody}>{(() => { const who = presetPick.mt === 'dinner' ? 'shared' : pk; const rel = [...favorites.filter(f => f.mealType === presetPick.mt && (f.person === who || f.person === 'shared')).map(f => ({ ...f, type: 'fav' as const })), ...presets.filter(p => p.mealType === presetPick.mt && (p.who === who || p.who === 'shared')).map(p => ({ ...p, type: 'pre' as const }))]; return rel.length === 0 ? <p className={s.sub}>None saved.</p> : rel.map((p, i) => <button key={i} className={s.dBtn} onClick={() => p.type === 'fav' ? (useFav(p as any, presetPick.di, presetPick.mt), setPresetPick(null)) : usePr(p as any, presetPick.di, presetPick.mt)}>{p.type === 'fav' ? '❤️ ' : '⭐ '}{p.name}<small className={s.sub}>{p.cal} cal</small></button>) })()}</div></div></div>}
      {editNotes && <div className={s.overlay} onClick={() => setEditNotes(null)}><div className={s.dialog} onClick={e => e.stopPropagation()}><div className={s.dHdr}><h3>Meal Notes</h3><button onClick={() => setEditNotes(null)}>×</button></div><div className={s.dBody}><textarea className={s.notesInput} value={notesVal} onChange={e => setNotesVal(e.target.value)} placeholder="Add prep notes, cooking instructions..." rows={4} /><button className={s.primaryBtn} onClick={() => saveNotes(editNotes.di, editNotes.mt, notesVal)}>Save notes</button></div></div></div>}
    </div>
  )
}

// ═══════════ MEAL INPUT ═══════════
function MealInputField({ initial, placeholder, disabled, onSubmit, onSync }: { initial: string; placeholder: string; disabled: boolean; onSubmit: (v: string) => void; onSync: (v: string) => void }) {
  const [val, setVal] = useState(initial)
  useEffect(() => { setVal(initial) }, [initial])
  return <input type="text" placeholder={placeholder} value={val} className={s.mealInput} onChange={e => setVal(e.target.value)} onBlur={() => { if (val !== initial) onSync(val) }} onKeyDown={e => { if (e.key === 'Enter' && val.trim()) { onSync(val); onSubmit(val) } }} disabled={disabled} />
}

// ═══════════ PORTIONS ═══════════
function Portions({ portions, edit, onRecalc, onDel }: { portions: PortionItem[]; edit: boolean; onRecalc: (i: number, a: string) => void; onDel: (i: number) => void }) {
  const [ei, setEi] = useState<number | null>(null); const [ev, setEv] = useState('')
  const commit = async (i: number) => { if (ev.trim()) await onRecalc(i, ev.trim()); setEi(null) }
  return <div className={s.portions}>{portions.map((p, i) => <div key={i} className={`${s.portRow} ${edit ? s.portEdit : ''}`}><span className={s.portIng}>{p.ingredient}</span>{edit && ei === i ? <input className={s.portInput} value={ev} onChange={e => setEv(e.target.value)} onBlur={() => commit(i)} onKeyDown={e => { if (e.key === 'Enter') commit(i) }} autoFocus /> : <span className={`${s.portAmt} ${edit ? s.portAmtClick : ''}`} onClick={() => edit && (setEi(i), setEv(p.amount))}>{p.amount}</span>}<span className={s.portCal}>{p.cal}cal</span>{edit && <button className={s.delBtn} onClick={() => onDel(i)}>×</button>}</div>)}</div>
}
