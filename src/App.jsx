import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  Plus,
  Trash2,
  Copy,
  CalendarDays,
  CheckCircle2,
  RotateCcw,
  Save,
  Wifi,
  WifiOff,
} from "lucide-react";
import "./style.css";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STORAGE_KEY = "staff-weekly-hours-rota-v3";
const ROTA_ID = "main-weekly-rota";

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

function makeEmptyShifts() {
  return Object.fromEntries(days.map((day) => [day, ""]));
}

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `staff-${Math.random().toString(36).slice(2)}`;
}

function createStaff(name) {
  return { id: makeId(), name, shifts: makeEmptyShifts() };
}

function createDefaultStaff() {
  return [
    createStaff("Staff 1"),
    createStaff("Staff 2"),
    createStaff("Staff 3"),
    createStaff("Staff 4"),
    createStaff("Staff 5"),
    createStaff("Staff 6"),
    createStaff("Staff 7"),
  ];
}

function createDefaultData() {
  return {
    week: "",
    staff: createDefaultStaff(),
    notes: "Please arrive 10 minutes before your shift starts. Message the manager if you need to swap.",
  };
}

export function parseHours(value) {
  if (!value || !value.includes("-")) return 0;

  const [start, end] = value.split("-").map((v) => v.trim());

  const toMinutes = (time) => {
    const [h, m = "0"] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return h * 60 + m;
  };

  const startMin = toMinutes(start);
  let endMin = toMinutes(end);

  if (startMin === null || endMin === null) return 0;
  if (endMin < startMin) endMin += 24 * 60;

  return Math.max(0, (endMin - startMin) / 60);
}

export function formatHours(hours) {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function runSelfTests() {
  const tests = [
    { input: "09:00-17:00", expected: 8, label: "standard full day" },
    { input: "09:30-14:00", expected: 4.5, label: "half-hour shift" },
    { input: "18:00-01:00", expected: 7, label: "overnight shift" },
    { input: "bad input", expected: 0, label: "invalid input" },
    { input: "25:00-26:00", expected: 0, label: "invalid time range" },
    { input: "", expected: 0, label: "empty shift" },
  ];

  tests.forEach((test) => {
    const actual = parseHours(test.input);
    console.assert(
      actual === test.expected,
      `parseHours failed for ${test.label}: expected ${test.expected}, got ${actual}`
    );
  });
}

function normalizeData(data) {
  const fallback = createDefaultData();
  return {
    week: data?.week || "",
    staff: Array.isArray(data?.staff) && data.staff.length ? data.staff : fallback.staff,
    notes: typeof data?.notes === "string" ? data.notes : fallback.notes,
  };
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultData();
    return normalizeData(JSON.parse(raw));
  } catch {
    return createDefaultData();
  }
}

function saveLocalData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

async function fetchOnlineRota() {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("rotas")
    .select("data")
    .eq("id", ROTA_ID)
    .maybeSingle();

  if (error) throw error;
  return data?.data ? normalizeData(data.data) : null;
}

async function saveOnlineRota(data) {
  if (!supabase) return;

  const { error } = await supabase.from("rotas").upsert({
    id: ROTA_ID,
    data,
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export default function StaffWeeklyHoursApp() {
  const [data, setData] = useState(createDefaultData);
  const [loaded, setLoaded] = useState(false);
  const [onlineReady, setOnlineReady] = useState(Boolean(supabase));
  const [status, setStatus] = useState(
    supabase ? "Connecting to live rota..." : "Offline setup: add Supabase keys in Vercel to make this shared."
  );
  const [copyMessage, setCopyMessage] = useState("Use the box below to copy and share the rota.");
  const shareTextRef = useRef(null);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    runSelfTests();

    async function start() {
      const localData = loadLocalData();
      setData(localData);

      if (!supabase) {
        setLoaded(true);
        return;
      }

      try {
        const onlineData = await fetchOnlineRota();
        if (onlineData) {
          setData(onlineData);
          saveLocalData(onlineData);
          setStatus("Live rota loaded. Edits save online for everyone using the link.");
        } else {
          await saveOnlineRota(localData);
          setStatus("Live rota created. Edits save online for everyone using the link.");
        }
        setOnlineReady(true);
      } catch (error) {
        console.error(error);
        setOnlineReady(false);
        setStatus("Could not connect to Supabase. Edits are saved only on this device for now.");
      } finally {
        setLoaded(true);
      }
    }

    start();
  }, []);

  useEffect(() => {
    if (!loaded) return;

    saveLocalData(data);

    if (!supabase) {
      setStatus("Saved on this device. Add Supabase keys in Vercel to make it shared online.");
      return;
    }

    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await saveOnlineRota(data);
        setOnlineReady(true);
        setStatus("Saved live. Everyone with the link can see the latest rota.");
      } catch (error) {
        console.error(error);
        setOnlineReady(false);
        setStatus("Online save failed. Your changes are still saved on this device.");
      }
    }, 500);

    return () => window.clearTimeout(saveTimerRef.current);
  }, [data, loaded]);

  const { week, staff, notes } = data;

  const totals = useMemo(() => {
    return staff.map((person) => ({
      id: person.id,
      name: person.name,
      total: days.reduce((sum, day) => sum + parseHours(person.shifts?.[day]), 0),
    }));
  }, [staff]);

  const weeklyTotal = totals.reduce((sum, person) => sum + person.total, 0);

  const setWeek = (weekValue) => setData((current) => ({ ...current, week: weekValue }));
  const setNotes = (notesValue) => setData((current) => ({ ...current, notes: notesValue }));

  const updateName = (id, name) => {
    setData((current) => ({
      ...current,
      staff: current.staff.map((person) => (person.id === id ? { ...person, name } : person)),
    }));
  };

  const updateShift = (id, day, value) => {
    setData((current) => ({
      ...current,
      staff: current.staff.map((person) =>
        person.id === id ? { ...person, shifts: { ...makeEmptyShifts(), ...person.shifts, [day]: value } } : person
      ),
    }));
  };

  const addStaff = () => {
    setData((current) => ({
      ...current,
      staff: [...current.staff, createStaff(`Staff ${current.staff.length + 1}`)],
    }));
  };

  const removeStaff = (id) => {
    setData((current) => ({ ...current, staff: current.staff.filter((person) => person.id !== id) }));
  };

  const resetRota = () => {
    const confirmed = window.confirm("Reset the rota back to 7 blank staff members?");
    if (!confirmed) return;
    setData(createDefaultData());
  };

  const refreshFromOnline = async () => {
    if (!supabase) return;
    try {
      setStatus("Refreshing live rota...");
      const onlineData = await fetchOnlineRota();
      if (onlineData) {
        setData(onlineData);
        saveLocalData(onlineData);
        setOnlineReady(true);
        setStatus("Live rota refreshed.");
      }
    } catch (error) {
      console.error(error);
      setOnlineReady(false);
      setStatus("Could not refresh from Supabase.");
    }
  };

  const shareText = useMemo(() => {
    const title = `Work rota${week ? ` - week starting ${week}` : ""}`;
    const lines = [title, ""];

    staff.forEach((person) => {
      const total = totals.find((t) => t.id === person.id)?.total || 0;
      lines.push(`${person.name || "Unnamed"} - ${formatHours(total)}`);

      days.forEach((day) => {
        const shift = person.shifts?.[day];
        if (shift) lines.push(`  ${day}: ${shift}`);
      });

      lines.push("");
    });

    if (notes) lines.push(`Notes: ${notes}`);
    return lines.join("\n");
  }, [staff, totals, notes, week]);

  const selectShareText = () => {
    if (!shareTextRef.current) return;
    shareTextRef.current.focus();
    shareTextRef.current.select();
    setCopyMessage("Rota text selected. Press Ctrl+C, or Command+C on Mac, to copy it.");
  };

  return (
    <main className="page">
      <section className="container">
        <div className="top-bar">
          <div>
            <div className="pill"><CalendarDays size={16} /> Weekly staff hours</div>
            <h1>Work Hours Rota</h1>
            <p className="subtext">Built for 7 staff. Everyone can edit shifts, names and notes from the same shared link.</p>
          </div>

          <div className="card small-card">
            <label>Week starting</label>
            <input type="date" value={week} onChange={(e) => setWeek(e.target.value)} />
          </div>
        </div>

        <div className="card status-card">
          <div className="status-left">
            {onlineReady ? <Wifi className="green" size={20} /> : <WifiOff className="amber" size={20} />}
            <span>{status}</span>
          </div>
          {supabase && <button className="button secondary" onClick={refreshFromOnline}>Refresh live rota</button>}
        </div>

        <div className="layout">
          <div className="card main-card">
            <div className="section-head">
              <div>
                <h2>Editable weekly rota</h2>
                <p>Type a shift as 09:00-17:00. Overnight shifts also work.</p>
              </div>
              <div className="actions">
                <button className="button" onClick={addStaff}><Plus size={16} /> Add staff</button>
                <button className="button secondary" onClick={selectShareText}><Copy size={16} /> Select share text</button>
                <button className="button secondary" onClick={resetRota}><RotateCcw size={16} /> Reset</button>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Staff</th>
                    {days.map((day) => <th key={day}>{day.slice(0, 3)}</th>)}
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((person) => {
                    const total = totals.find((t) => t.id === person.id)?.total || 0;
                    return (
                      <tr key={person.id}>
                        <td><input value={person.name} onChange={(e) => updateName(person.id, e.target.value)} /></td>
                        {days.map((day) => (
                          <td key={day}>
                            <input
                              placeholder="09:00-17:00"
                              value={person.shifts?.[day] || ""}
                              onChange={(e) => updateShift(person.id, day, e.target.value)}
                            />
                          </td>
                        ))}
                        <td className="total-cell">{formatHours(total)}</td>
                        <td>
                          <button className="icon-button" onClick={() => removeStaff(person.id)} aria-label={`Remove ${person.name || "staff member"}`}>
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="side">
            <div className="card">
              <div className="title-row"><Save size={20} /><h2>Summary</h2></div>
              <div className="total-box">
                <p>Total scheduled hours</p>
                <strong>{formatHours(weeklyTotal)}</strong>
              </div>
              <div className="staff-totals">
                {totals.map((person) => (
                  <div className="staff-total" key={person.id}>
                    <span>{person.name || "Unnamed"}</span>
                    <strong>{formatHours(person.total)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2>Staff notes</h2>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="card">
              <div className="title-row"><CheckCircle2 size={20} /><h2>Share preview</h2></div>
              <p className="subtext small">{copyMessage}</p>
              <textarea
                ref={shareTextRef}
                readOnly
                value={shareText}
                className="share-box"
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
