import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL
const EMOJIS = ['🌷', '✨', '📚', '💻', '🏃', '🛒', '☕', '🎧', '💌', '🧹']
const MOODS = ['🥰', '😊', '😌', '😐', '🥺', '😴', '😤']
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const BOOT_TIME = new Date()
const INITIAL_MONTH = new Date(BOOT_TIME.getFullYear(), BOOT_TIME.getMonth(), 1)

const dateKey = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const prettyDate = (key) => {
  const date = new Date(`${key}T00:00:00`)
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAYS[date.getDay()]}요일`
}

const loadLocal = (key, fallback) => {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

const occursOn = (todo, info, targetKey) => {
  const start = info?.date || dateKey(new Date(todo.createdAt || Date.now()))
  if (targetKey < start) return false
  if (!info?.recurrence || info.recurrence === 'none') return start === targetKey

  const startDate = new Date(`${start}T00:00:00`)
  const target = new Date(`${targetKey}T00:00:00`)
  if (info.recurrence === 'daily') return true
  if (info.recurrence === 'weekdays') {
    return target.getDay() !== 0 && target.getDay() !== 6
  }
  if (info.recurrence === 'weekly') {
    return startDate.getDay() === target.getDay()
  }
  if (info.recurrence === 'monthly') {
    return startDate.getDate() === target.getDate()
  }
  return false
}

function Clock() {
  const [now, setNow] = useState(BOOT_TIME)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="clock">
      <span>{now.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</span>
      <strong>{now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
    </div>
  )
}

function Calendar({ month, setMonth, selectedDate, setSelectedDate, todos, meta }) {
  const calendarDays = useMemo(() => {
    const year = month.getFullYear()
    const monthIndex = month.getMonth()
    const firstDay = new Date(year, monthIndex, 1).getDay()
    const lastDate = new Date(year, monthIndex + 1, 0).getDate()
    const previousLast = new Date(year, monthIndex, 0).getDate()

    return Array.from({ length: 42 }, (_, index) => {
      if (index < firstDay) {
        return { date: new Date(year, monthIndex - 1, previousLast - firstDay + index + 1), muted: true }
      }
      if (index >= firstDay + lastDate) {
        return { date: new Date(year, monthIndex + 1, index - firstDay - lastDate + 1), muted: true }
      }
      return { date: new Date(year, monthIndex, index - firstDay + 1), muted: false }
    })
  }, [month])

  const moveMonth = (amount) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + amount, 1))
  }

  return (
    <section className="calendar card">
      <div className="section-heading calendar-heading">
        <div>
          <span className="eyebrow">MY CALENDAR</span>
          <h2>{month.getFullYear()}년 {month.getMonth() + 1}월</h2>
        </div>
        <div className="calendar-controls">
          <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button>
          <button type="button" className="today-button" onClick={() => {
            const today = new Date()
            setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
            setSelectedDate(dateKey(today))
          }}>오늘</button>
          <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)}>›</button>
        </div>
      </div>

      <div className="calendar-grid weekday-row">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-grid date-grid">
        {calendarDays.map(({ date, muted }) => {
          const key = dateKey(date)
          const count = todos.filter((todo) => occursOn(todo, meta[todo._id], key)).length
          const isToday = key === dateKey()
          const selected = key === selectedDate
          return (
            <button
              type="button"
              key={key}
              className={`date-cell ${muted ? 'muted' : ''} ${isToday ? 'is-today' : ''} ${selected ? 'selected' : ''}`}
              onClick={() => {
                setSelectedDate(key)
                if (muted) setMonth(new Date(date.getFullYear(), date.getMonth(), 1))
              }}
            >
              <span>{date.getDate()}</span>
              {count > 0 && <small>{count > 3 ? '•••' : '•'.repeat(count)}</small>}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function TodoPlanner() {
  const [todos, setTodos] = useState([])
  const [meta, setMeta] = useState(() => loadLocal('mooday-todo-meta', {}))
  const [selectedDate, setSelectedDate] = useState(dateKey())
  const [month, setMonth] = useState(INITIAL_MONTH)
  const [text, setText] = useState('')
  const [emoji, setEmoji] = useState('🌷')
  const [recurrence, setRecurrence] = useState('none')
  const [editingId, setEditingId] = useState(null)
  const [editingText, setEditingText] = useState('')
  const [draggedId, setDraggedId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(API_URL, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('할 일을 불러오지 못했어요.')
        return response.json()
      })
      .then((data) => {
        setTodos(data)
        setError('')
      })
      .catch((fetchError) => {
        if (fetchError.name !== 'AbortError') {
          setError('백엔드 서버와 연결할 수 없어요. localhost:5000 서버를 확인해 주세요.')
        }
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    localStorage.setItem('mooday-todo-meta', JSON.stringify(meta))
  }, [meta])

  const visibleTodos = useMemo(() => {
    return todos
      .filter((todo) => occursOn(todo, meta[todo._id], selectedDate))
      .sort((a, b) => {
        const aOrder = meta[a._id]?.order ?? Number.MAX_SAFE_INTEGER
        const bOrder = meta[b._id]?.order ?? Number.MAX_SAFE_INTEGER
        if (aOrder !== bOrder) return aOrder - bOrder
        return new Date(b.createdAt) - new Date(a.createdAt)
      })
  }, [todos, meta, selectedDate])

  const addTodo = async (event) => {
    event.preventDefault()
    const cleanText = text.trim()
    if (!cleanText) return

    setSaving(true)
    setError('')
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '할 일을 추가하지 못했어요.')
      setTodos((current) => [data, ...current])
      setMeta((current) => ({
        ...current,
        [data._id]: { date: selectedDate, emoji, recurrence, completed: false, order: 0 },
      }))
      setText('')
    } catch (requestError) {
      setError(requestError.message || '서버 연결을 확인해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async (id) => {
    const cleanText = editingText.trim()
    if (!cleanText) return
    setError('')
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '수정하지 못했어요.')
      setTodos((current) => current.map((todo) => (todo._id === id ? data : todo)))
      setEditingId(null)
    } catch (requestError) {
      setError(requestError.message || '서버 연결을 확인해 주세요.')
    }
  }

  const deleteTodo = async (id) => {
    setError('')
    try {
      const response = await fetch(`${API_URL}/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || '삭제하지 못했어요.')
      setTodos((current) => current.filter((todo) => todo._id !== id))
      setMeta((current) => {
        const next = { ...current }
        delete next[id]
        return next
      })
    } catch (requestError) {
      setError(requestError.message || '서버 연결을 확인해 주세요.')
    }
  }

  const toggleTodo = (id) => {
    setMeta((current) => ({
      ...current,
      [id]: { ...current[id], completed: !current[id]?.completed, date: current[id]?.date || selectedDate },
    }))
  }

  const dropTodo = (targetId) => {
    if (!draggedId || draggedId === targetId) return
    const ids = visibleTodos.map((todo) => todo._id)
    const from = ids.indexOf(draggedId)
    const to = ids.indexOf(targetId)
    ids.splice(to, 0, ids.splice(from, 1)[0])
    setMeta((current) => {
      const next = { ...current }
      ids.forEach((id, index) => {
        next[id] = { ...next[id], date: next[id]?.date || selectedDate, order: index }
      })
      return next
    })
    setDraggedId(null)
  }

  const completedCount = visibleTodos.filter((todo) => meta[todo._id]?.completed).length
  const recurrenceLabel = {
    daily: '매일',
    weekdays: '평일마다',
    weekly: '매주',
    monthly: '매월',
  }

  return (
    <div className="planner-view page-enter">
      <div className="welcome-row">
        <div>
          <span className="eyebrow">A LITTLE STEP, EVERY DAY</span>
          <h1>오늘도 천천히,<br /><em>나답게 채워가요.</em> 🌿</h1>
        </div>
        <div className="quote-bubble">
          <span>“</span>
          작은 할 일을 완료하는 기쁨을 모아봐요.
        </div>
      </div>

      <div className="planner-grid">
        <Calendar
          month={month}
          setMonth={setMonth}
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          todos={todos}
          meta={meta}
        />

        <section className="todo-panel card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">TODAY'S LIST</span>
              <h2>{prettyDate(selectedDate)}</h2>
            </div>
            <div className="progress-ring" style={{ '--progress': `${visibleTodos.length ? (completedCount / visibleTodos.length) * 360 : 0}deg` }}>
              <span>{completedCount}/{visibleTodos.length}</span>
            </div>
          </div>

          <form className="todo-form" onSubmit={addTodo}>
            <div className="todo-input-row">
              <button
                type="button"
                className="emoji-picker-button"
                onClick={() => {
                  const index = EMOJIS.indexOf(emoji)
                  setEmoji(EMOJIS[(index + 1) % EMOJIS.length])
                }}
                title="이모지 바꾸기"
              >
                {emoji}
              </button>
              <input
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="새로운 할 일을 적어보세요"
                maxLength={200}
              />
              <button className="add-button" type="submit" disabled={saving}>
                {saving ? '...' : '+'}
              </button>
            </div>
            <div className="form-options">
              <label>
                <span>📅 날짜</span>
                <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
              <label>
                <span>🔁 반복</span>
                <select value={recurrence} onChange={(event) => setRecurrence(event.target.value)}>
                  <option value="none">반복 없음</option>
                  <option value="daily">매일</option>
                  <option value="weekdays">평일마다</option>
                  <option value="weekly">매주</option>
                  <option value="monthly">매월</option>
                </select>
              </label>
            </div>
          </form>

          {error && <div className="error-message">🫧 {error}</div>}

          <div className="todo-list">
            {loading && <div className="empty-state"><span>⏳</span><p>할 일을 불러오는 중이에요</p></div>}
            {!loading && visibleTodos.length === 0 && (
              <div className="empty-state"><span>🪴</span><p>아직 할 일이 없어요.<br />가벼운 마음으로 하나 적어볼까요?</p></div>
            )}
            {visibleTodos.map((todo) => {
              const info = meta[todo._id] || {}
              return (
                <article
                  key={todo._id}
                  draggable
                  className={`todo-item ${info.completed ? 'completed' : ''} ${draggedId === todo._id ? 'dragging' : ''}`}
                  onDragStart={() => setDraggedId(todo._id)}
                  onDragEnd={() => setDraggedId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropTodo(todo._id)}
                >
                  <span className="drag-handle" aria-label="끌어서 순서 변경">⠿</span>
                  <button type="button" className="check-button" onClick={() => toggleTodo(todo._id)}>
                    {info.completed ? '✓' : ''}
                  </button>
                  <span className="todo-emoji">{info.emoji || '✨'}</span>
                  <div className="todo-content">
                    {editingId === todo._id ? (
                      <input
                        className="edit-input"
                        value={editingText}
                        maxLength={200}
                        autoFocus
                        onChange={(event) => setEditingText(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') saveEdit(todo._id)
                          if (event.key === 'Escape') setEditingId(null)
                        }}
                      />
                    ) : (
                      <p>{todo.text}</p>
                    )}
                    {info.recurrence && info.recurrence !== 'none' && (
                      <small>🔁 {recurrenceLabel[info.recurrence]}</small>
                    )}
                  </div>
                  <div className="todo-actions">
                    {editingId === todo._id ? (
                      <button type="button" onClick={() => saveEdit(todo._id)} title="저장">💾</button>
                    ) : (
                      <button type="button" onClick={() => {
                        setEditingId(todo._id)
                        setEditingText(todo.text)
                      }} title="수정">✎</button>
                    )}
                    <button type="button" onClick={() => deleteTodo(todo._id)} title="삭제">×</button>
                  </div>
                </article>
              )
            })}
          </div>
          <p className="drag-tip">⠿ 손잡이를 잡고 끌어 할 일 순서를 바꿀 수 있어요</p>
        </section>
      </div>
    </div>
  )
}

function Budget() {
  const [records, setRecords] = useState(() => loadLocal('mooday-budget', []))
  const [type, setType] = useState('expense')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('식비')
  const [recordDate, setRecordDate] = useState(dateKey())

  useEffect(() => {
    localStorage.setItem('mooday-budget', JSON.stringify(records))
  }, [records])

  const summary = records.reduce((total, record) => {
    total[record.type] += Number(record.amount)
    return total
  }, { income: 0, expense: 0 })

  const addRecord = (event) => {
    event.preventDefault()
    if (!description.trim() || !amount || Number(amount) <= 0) return
    setRecords((current) => [{
      id: crypto.randomUUID(),
      type,
      description: description.trim(),
      amount: Number(amount),
      category,
      date: recordDate,
    }, ...current])
    setDescription('')
    setAmount('')
  }

  return (
    <div className="sub-page page-enter">
      <div className="sub-hero budget-hero">
        <span className="hero-emoji">🧺</span>
        <div>
          <span className="eyebrow">MY LITTLE BUDGET</span>
          <h1>차곡차곡 가계부</h1>
          <p>오늘의 소비를 가볍게 기록하고, 내 생활의 흐름을 살펴봐요.</p>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-card income"><span>이번 기록의 수입</span><strong>+ {summary.income.toLocaleString()}원</strong><i>🌱</i></div>
        <div className="summary-card expense"><span>이번 기록의 지출</span><strong>- {summary.expense.toLocaleString()}원</strong><i>🛍️</i></div>
        <div className="summary-card balance"><span>현재 남은 금액</span><strong>{(summary.income - summary.expense).toLocaleString()}원</strong><i>🐷</i></div>
      </div>

      <div className="budget-grid">
        <form className="card record-form" onSubmit={addRecord}>
          <div className="section-heading"><div><span className="eyebrow">NEW RECORD</span><h2>내역 추가하기</h2></div></div>
          <div className="segmented">
            <button type="button" className={type === 'expense' ? 'active' : ''} onClick={() => setType('expense')}>지출</button>
            <button type="button" className={type === 'income' ? 'active' : ''} onClick={() => setType('income')}>수입</button>
          </div>
          <label><span>날짜</span><input type="date" value={recordDate} onChange={(event) => setRecordDate(event.target.value)} /></label>
          <label><span>내용</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="무엇에 사용했나요?" /></label>
          <label><span>금액</span><div className="won-input"><input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" /><b>원</b></div></label>
          <label><span>분류</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {(type === 'expense' ? ['식비', '카페', '쇼핑', '교통', '생활', '취미', '기타'] : ['월급', '용돈', '부수입', '기타']).map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <button className="primary-button" type="submit">내역 기록하기 ✨</button>
        </form>

        <section className="card record-list-card">
          <div className="section-heading"><div><span className="eyebrow">HISTORY</span><h2>최근 내역</h2></div><span className="record-count">{records.length}건</span></div>
          <div className="record-list">
            {records.length === 0 && <div className="empty-state"><span>🪙</span><p>아직 기록된 내역이 없어요.</p></div>}
            {records.map((record) => (
              <article className="record-item" key={record.id}>
                <span className={`record-icon ${record.type}`}>{record.type === 'income' ? '💰' : '🧾'}</span>
                <div><strong>{record.description}</strong><small>{record.date} · {record.category}</small></div>
                <b className={record.type}>{record.type === 'income' ? '+' : '-'} {record.amount.toLocaleString()}원</b>
                <button type="button" onClick={() => setRecords((current) => current.filter((item) => item.id !== record.id))}>×</button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Diary() {
  const initialDate = dateKey()
  const [entries, setEntries] = useState(() => loadLocal('mooday-diary', {}))
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [mood, setMood] = useState(() => entries[initialDate]?.mood || '😊')
  const [content, setContent] = useState(() => entries[initialDate]?.content || '')
  const [saved, setSaved] = useState(false)

  const selectDiaryDate = (nextDate) => {
    const entry = entries[nextDate]
    setSelectedDate(nextDate)
    setMood(entry?.mood || '😊')
    setContent(entry?.content || '')
    setSaved(false)
  }

  const saveDiary = () => {
    if (!content.trim()) return
    const next = { ...entries, [selectedDate]: { mood, content: content.trim(), updatedAt: new Date().toISOString() } }
    setEntries(next)
    localStorage.setItem('mooday-diary', JSON.stringify(next))
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  const entryList = Object.entries(entries).sort(([a], [b]) => b.localeCompare(a))

  return (
    <div className="sub-page page-enter">
      <div className="sub-hero diary-hero">
        <span className="hero-emoji">💌</span>
        <div>
          <span className="eyebrow">DEAR MY DAY</span>
          <h1>오늘의 마음 일기</h1>
          <p>좋았던 일도, 조금 힘들었던 마음도 이곳에 조용히 내려놓아요.</p>
        </div>
      </div>

      <div className="diary-grid">
        <section className="card diary-editor">
          <div className="diary-paper-top">
            <label><span>기록할 날짜</span><input type="date" value={selectedDate} onChange={(event) => selectDiaryDate(event.target.value)} /></label>
            <div className="weather-doodle">☁️　🌤️　🌿</div>
          </div>
          <div className="mood-question">
            <h2>오늘은 어떤 하루였나요?</h2>
            <div className="mood-list">
              {MOODS.map((item) => (
                <button type="button" key={item} className={mood === item ? 'selected' : ''} onClick={() => setMood(item)}>{item}</button>
              ))}
            </div>
          </div>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={'오늘 하루 중 기억하고 싶은 순간은 무엇인가요?\n천천히, 솔직한 마음을 적어보세요.'}
          />
          <div className="diary-footer">
            <span>{content.length}자 · 나만 볼 수 있는 소중한 기록이에요 🔒</span>
            <button type="button" className="primary-button" onClick={saveDiary}>{saved ? '저장했어요! 🌷' : '오늘의 일기 저장'}</button>
          </div>
        </section>

        <aside className="card diary-archive">
          <div className="section-heading"><div><span className="eyebrow">MEMORIES</span><h2>지난 마음들</h2></div></div>
          <div className="archive-list">
            {entryList.length === 0 && <div className="empty-state"><span>📖</span><p>첫 번째 이야기를 기다리고 있어요.</p></div>}
            {entryList.map(([key, entry]) => (
              <button type="button" key={key} className={selectedDate === key ? 'active' : ''} onClick={() => selectDiaryDate(key)}>
                <span>{entry.mood}</span>
                <div><strong>{prettyDate(key)}</strong><p>{entry.content}</p></div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

function App() {
  const [activePage, setActivePage] = useState('planner')

  const navigation = [
    { id: 'planner', label: '할 일과 달력', icon: '🌷' },
    { id: 'budget', label: '차곡 가계부', icon: '🪙' },
    { id: 'diary', label: '마음 일기', icon: '💌' },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button type="button" className="brand" onClick={() => setActivePage('planner')}>
          <span>moo</span>day<i>✿</i>
        </button>
        <p className="brand-caption">나의 하루를 사랑하는 방법</p>

        <nav>
          {navigation.map((item) => (
            <button
              type="button"
              key={item.id}
              className={activePage === item.id ? 'active' : ''}
              onClick={() => setActivePage(item.id)}
            >
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span>🌼</span>
          <p>오늘의 작은 기록이<br />내일의 나를 만들어요.</p>
        </div>
        <div className="sidebar-decoration">✿　·　₊˚　❀</div>
      </aside>

      <main>
        <header className="topbar">
          <div className="mobile-brand">mooday ✿</div>
          <Clock />
          <div className="topbar-message"><span>🍀</span> 오늘도 좋은 하루 보내요!</div>
          <div className="profile">ME</div>
        </header>

        <div className="mobile-nav">
          {navigation.map((item) => (
            <button type="button" key={item.id} className={activePage === item.id ? 'active' : ''} onClick={() => setActivePage(item.id)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </div>

        <div className="page-container">
          {activePage === 'planner' && <TodoPlanner />}
          {activePage === 'budget' && <Budget />}
          {activePage === 'diary' && <Diary />}
        </div>
      </main>
    </div>
  )
}

export default App