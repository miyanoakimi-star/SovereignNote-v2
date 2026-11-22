import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, FileDown, X } from 'lucide-react';
import { CalendarEvent, NavState, Note } from '../types';
import { getLunarInfo } from '../utils/lunar';
import { safeStorage } from '../utils/safeStorage';
import { universalExport } from '../utils/export';

interface CalendarViewProps {
  navState: NavState;
  setNavState: (state: NavState) => void;
  notes: Note[];
  setActiveNoteId: (id: string | null) => void;
  customEvents: CalendarEvent[];
  setCustomEvents: (events: CalendarEvent[]) => void;
  customFestivals: Record<string, string>;
  setCustomFestivals: (festivals: Record<string, string>) => void;
  noteTagsMap: Record<string, string[]>;
  handleCreateNote: (
    initialTitle?: string,
    initialContent?: string,
    folder?: string,
    extraFields?: Partial<Note>
  ) => void;
  notify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export default function CalendarView({
  navState,
  setNavState,
  notes,
  setActiveNoteId,
  customEvents,
  setCustomEvents,
  customFestivals,
  setCustomFestivals,
  noteTagsMap,
  handleCreateNote,
  notify,
}: CalendarViewProps) {
  const [calYear, setCalYear] = useState<number>(() => {
    const cachedState = safeStorage.getItem('calendar_state');
    if (cachedState) {
      try {
        const parsed = JSON.parse(cachedState);
        if (parsed && typeof parsed.year === 'number') return parsed.year;
      } catch {
        // ignore invalid storage cache
      }
    }
    const cachedY = safeStorage.getItem('calendar_year');
    if (cachedY) {
      const parsed = parseInt(cachedY, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return new Date().getFullYear();
  });

  const [calMonth, setCalMonth] = useState<number>(() => {
    const cachedState = safeStorage.getItem('calendar_state');
    if (cachedState) {
      try {
        const parsed = JSON.parse(cachedState);
        if (parsed && typeof parsed.month === 'number') return parsed.month;
      } catch {
        // ignore invalid storage cache
      }
    }
    const cachedM = safeStorage.getItem('calendar_month');
    if (cachedM) {
      const parsed = parseInt(cachedM, 10);
      if (!isNaN(parsed)) return parsed;
    }
    return new Date().getMonth() + 1;
  });

  const isFirstNavRef = useRef(true);

  useEffect(() => {
    safeStorage.setItem('calendar_year', String(calYear));
    safeStorage.setItem('calendar_month', String(calMonth));
    safeStorage.setItem('calendar_state', JSON.stringify({ year: calYear, month: calMonth }));
  }, [calYear, calMonth]);

  useEffect(() => {
    if (navState === 'calendar') {
      if (isFirstNavRef.current) {
        isFirstNavRef.current = false;
        return;
      }
      const today = new Date();
      setCalYear(today.getFullYear());
      setCalMonth(today.getMonth() + 1);
    }
  }, [navState]);

  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [newEventTitle, setNewEventTitle] = useState<string>('');
  const [newEventNoteId, setNewEventNoteId] = useState<string>('');
  const [newFestivalName, setNewFestivalName] = useState<string>('');

  const startDayOfMonth = useMemo(
    () => new Date(calYear, calMonth - 1, 1).getDay(),
    [calYear, calMonth]
  );

  const daysInMonth = useMemo(
    () => new Date(calYear, calMonth, 0).getDate(),
    [calYear, calMonth]
  );

  const activeDateEvents = useMemo(() => {
    if (!selectedCalendarDate) return [];
    return customEvents.filter((e) => e.date === selectedCalendarDate);
  }, [customEvents, selectedCalendarDate]);

  const activeDateLinkedNotes = useMemo(() => {
    if (!selectedCalendarDate) return [];
    const hashTag = '#' + selectedCalendarDate;
    return notes.filter((n) => {
      if (n.deleted) return false;
      const contentIncludes = n.content ? n.content.includes(hashTag) : false;
      const mapIncludes =
        noteTagsMap[n.id]?.some((tag) => {
          const cleanTag = tag.startsWith('#') ? tag : '#' + tag;
          return cleanTag === hashTag;
        }) || false;
      return contentIncludes || mapIncludes;
    });
  }, [notes, selectedCalendarDate, noteTagsMap]);

  const handleExportSchedules = () => {
    const jsonStr = JSON.stringify(customEvents, null, 2);
    const filename = `sovereign_schedules_backup_${new Date().toISOString().slice(0, 10)}.json`;
    universalExport(jsonStr, filename, 'application/json');
    notify('success', '日程数据已导出');
  };

  const handleImportSchedules = (jsonData: string) => {
    try {
      const parsed = JSON.parse(jsonData);
      if (Array.isArray(parsed)) {
        setCustomEvents(parsed);
        notify('success', `成功导入 ${parsed.length} 条自定义日程计划`);
      } else {
        notify('error', '导入失败：日程 JSON 格式应为事件数组');
      }
    } catch {
      notify('error', '日程格式解析失败，请检查 JSON 文件格式');
    }
  };

  return (
    <div className="flex-1 flex flex-col sn-canvas border-l sn-border overflow-hidden w-full select-none min-w-0">
      {/* CALENDAR HEADER */}
      <div className="h-14 px-6 lg:px-8 border-b sn-border flex items-center justify-between gap-3 shrink-0 sn-panel">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 sn-surface border sn-border rounded-lg p-1">
            <button
              type="button"
              onClick={() => {
                if (calMonth === 1) {
                  setCalYear(calYear - 1);
                  setCalMonth(12);
                } else {
                  setCalMonth(calMonth - 1);
                }
              }}
              className="p-1.5 rounded sn-muted hover:sn-text hover:bg-indigo-500/10"
              aria-label="上个月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold sn-text w-24 text-center tabular-nums">
              {calYear}年 {calMonth}月
            </span>
            <button
              type="button"
              onClick={() => {
                if (calMonth === 12) {
                  setCalYear(calYear + 1);
                  setCalMonth(1);
                } else {
                  setCalMonth(calMonth + 1);
                }
              }}
              className="p-1.5 rounded sn-muted hover:sn-text hover:bg-indigo-500/10"
              aria-label="下个月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              setCalYear(today.getFullYear());
              setCalMonth(today.getMonth() + 1);
            }}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            今天
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2 text-xs sn-muted">
          <span>农历对照</span>
          <span aria-hidden="true">·</span>
          <span>笔记双向日程联动</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportSchedules}
            className="flex items-center gap-1.5 py-1.5 px-3 sn-surface hover:border-indigo-500 rounded-lg text-xs font-semibold sn-text border sn-border-strong transition-colors"
          >
            <FileDown className="w-3.5 h-3.5 text-indigo-500" />
            <span>导出日程</span>
          </button>
          <label className="flex items-center gap-1.5 py-1.5 px-3 sn-surface hover:border-indigo-500 rounded-lg text-xs font-semibold sn-text border sn-border-strong cursor-pointer transition-colors">
            <FileDown className="w-3.5 h-3.5 text-indigo-500 rotate-180" />
            <span>导入日程</span>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const text = await file.text();
                  handleImportSchedules(text);
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>

      {/* CALENDAR GRID */}
      <div className="flex-1 p-4 lg:p-6 overflow-y-auto sn-canvas">
        <div className="grid grid-cols-7 gap-px sn-border border rounded-2xl overflow-hidden shadow-sm bg-[var(--sn-border)]">
          {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
            <div
              key={day}
              className="sn-panel p-3 text-center text-xs font-bold sn-muted uppercase tracking-wider"
            >
              {day}
            </div>
          ))}

          {Array.from({ length: startDayOfMonth }).map((_, idx) => (
            <div key={`empty-${idx}`} className="sn-panel min-h-[96px] opacity-60" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const formattedDate = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const lunarInfo = getLunarInfo(calYear, calMonth, day, customFestivals);
            const dayEvents = customEvents.filter((evt) => evt.date === formattedDate);
            const hasLinkedNotesWritten = notes.some((n) => {
              if (n.deleted) return false;
              const matchTagFormat = `#${formattedDate}`;
              const inMap = noteTagsMap[n.id]?.some((t) => (t.startsWith('#') ? t : `#${t}`) === matchTagFormat);
              return (n.content || '').includes(matchTagFormat) || Boolean(inMap);
            });
            const isToday =
              new Date().toDateString() === new Date(calYear, calMonth - 1, day).toDateString();

            return (
              <div
                key={`day-${day}`}
                onClick={() => setSelectedCalendarDate(formattedDate)}
                title={`公历: ${formattedDate}${lunarInfo.gzYear ? `\n农历: ${lunarInfo.gzYear} ${lunarInfo.lunarMonthName || ''}${lunarInfo.lunarDayName}` : ''}`}
                className={`sn-elevated p-2 min-h-[110px] group hover:bg-indigo-500/5 cursor-pointer transition-colors relative flex flex-col justify-between ${
                  isToday ? 'ring-2 ring-indigo-500 ring-inset bg-indigo-500/5' : ''
                }`}
              >
                <div className="flex justify-between items-start gap-1">
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      isToday ? 'text-indigo-500' : 'sn-text'
                    }`}
                  >
                    {day}
                  </span>
                  <div className="flex flex-col items-end text-right select-none max-w-[78%]">
                    {lunarInfo.gzYear && (
                      <span className="text-[9px] sn-muted leading-none mb-0.5 truncate">
                        {lunarInfo.gzYear}
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-medium whitespace-nowrap truncate ${
                        lunarInfo.festival
                          ? 'text-emerald-500 font-semibold'
                          : lunarInfo.isSolarTerm
                          ? 'text-amber-500 font-semibold'
                          : 'sn-muted'
                      }`}
                    >
                      {lunarInfo.festival ||
                        lunarInfo.solarTerm ||
                        `${lunarInfo.lunarMonthName || ''}${lunarInfo.lunarDayName}`}
                    </span>
                  </div>
                </div>

                <div className="flex-1 mt-1.5 space-y-1 overflow-hidden pointer-events-none">
                  {dayEvents.slice(0, 2).map((evt) => (
                    <div
                      key={evt.id}
                      className="px-1.5 py-0.5 bg-indigo-500/15 border border-indigo-500/25 rounded text-[10px] text-indigo-500 truncate font-medium"
                    >
                      {evt.title}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <div className="text-[10px] sn-muted font-mono tabular-nums">
                      +{dayEvents.length - 2} 项
                    </div>
                  )}
                  {hasLinkedNotesWritten && (
                    <div className="text-[10px] text-sky-500 font-medium truncate">
                      关联笔记
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DATE DETAIL MODAL */}
      {selectedCalendarDate &&
        (() => {
          const [yStr, mStr, dStr] = selectedCalendarDate.split('-');
          const selYear = parseInt(yStr, 10) || 2026;
          const selMonth = parseInt(mStr, 10) || 6;
          const selDay = parseInt(dStr, 10) || 1;
          const selLunar = getLunarInfo(selYear, selMonth, selDay, customFestivals);

          return (
            <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none">
              <div className="sn-elevated rounded-2xl border sn-border-strong p-6 w-full max-w-md shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b sn-border pb-3">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-bold sn-text text-sm tabular-nums">
                      {selectedCalendarDate} 日程与联动
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCalendarDate(null);
                      setNewEventTitle('');
                      setNewEventNoteId('');
                      setNewFestivalName('');
                    }}
                    className="sn-muted hover:sn-text p-1 rounded-lg"
                    aria-label="关闭弹窗"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Traditional / Era info */}
                <div className="flex flex-wrap items-center gap-2 text-xs sn-muted sn-surface px-3 py-2 rounded-lg border sn-border font-mono">
                  {selLunar.gzYear && (
                    <span>
                      农历 {selLunar.gzYear} {selLunar.lunarMonthName || ''}
                      {selLunar.lunarDayName}
                      {selLunar.festival ? ` (${selLunar.festival})` : ''}
                      {selLunar.solarTerm ? ` (${selLunar.solarTerm})` : ''}
                    </span>
                  )}
                  {selLunar.jpEra && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{selLunar.jpEra}</span>
                    </>
                  )}
                  {selLunar.kokiYear && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{selLunar.kokiYear}</span>
                    </>
                  )}
                </div>

                {/* Linked events & notes */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold sn-muted block">当日日程与关联笔记</span>

                  {activeDateEvents.length === 0 && activeDateLinkedNotes.length === 0 ? (
                    <p className="text-xs sn-muted py-1">暂无日程或直接关联的笔记。</p>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {activeDateEvents.map((evt) => {
                        const note = notes.find((n) => n.id === evt.noteId);
                        return (
                          <div
                            key={evt.id}
                            className="p-2.5 sn-surface rounded-lg border sn-border flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-semibold sn-text truncate">{evt.title}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              {evt.noteId && note && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveNoteId(note.id);
                                    setNavState('notes');
                                    setSelectedCalendarDate(null);
                                  }}
                                  className="px-2 py-1 bg-indigo-500/15 text-indigo-500 hover:bg-indigo-600 hover:text-white rounded text-[11px] font-semibold transition-colors"
                                >
                                  打开笔记
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setCustomEvents(customEvents.filter((e) => e.id !== evt.id))
                                }
                                className="px-1.5 py-1 text-rose-500 hover:bg-rose-500/10 rounded text-[11px] font-medium"
                              >
                                删除
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {activeDateLinkedNotes.map((note) => (
                        <div
                          key={note.id}
                          className="p-2.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20 flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-medium text-indigo-500 truncate">
                            关联笔记：{note.title || '无标题'}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveNoteId(note.id);
                              setNavState('notes');
                              setSelectedCalendarDate(null);
                            }}
                            className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-semibold shrink-0"
                          >
                            打开
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add Event */}
                <div className="sn-surface p-4 rounded-xl border sn-border space-y-3">
                  <span className="text-xs font-semibold sn-text block">新增日程计划</span>
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="例如：项目阶段评审会议"
                      value={newEventTitle}
                      onChange={(e) => setNewEventTitle(e.target.value)}
                      className="w-full sn-input border p-2 text-xs rounded-lg outline-none focus:border-indigo-500"
                    />

                    <div className="space-y-1">
                      <label className="text-[11px] sn-muted font-medium block">
                        绑定已有笔记（可选）
                      </label>
                      <select
                        value={newEventNoteId}
                        onChange={(e) => setNewEventNoteId(e.target.value)}
                        className="w-full sn-input border p-2 text-xs rounded-lg outline-none focus:border-indigo-500"
                      >
                        <option value="">-- 不绑定或创建新联动笔记 --</option>
                        {notes
                          .filter((n) => !n.deleted)
                          .map((n) => (
                            <option key={n.id} value={n.id}>
                              {n.title || '无标题'}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (!newEventTitle.trim()) return;
                          const newEvt: CalendarEvent = {
                            id: `event-${Date.now()}`,
                            title: newEventTitle.trim(),
                            date: selectedCalendarDate,
                            noteId: newEventNoteId || null,
                          };
                          setCustomEvents([...customEvents, newEvt]);
                          setNewEventTitle('');
                          setNewEventNoteId('');
                          notify('success', '已保存日程');
                        }}
                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors"
                      >
                        保存日程
                      </button>
                      {!newEventNoteId && newEventTitle.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            const customTitle = newEventTitle.trim();
                            const contentHead = `# ${customTitle}\n\n关于 ${selectedCalendarDate} 的日程：${customTitle}\n\n#${selectedCalendarDate}\n\n在下方记录备忘要点...`;
                            const newEvt: CalendarEvent = {
                              id: `event-${Date.now()}`,
                              title: customTitle,
                              date: selectedCalendarDate,
                              noteId: null,
                            };
                            setCustomEvents([...customEvents, newEvt]);
                            handleCreateNote(customTitle, contentHead);
                            setNavState('notes');
                            setSelectedCalendarDate(null);
                          }}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors"
                        >
                          保存并新建笔记
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Custom Festival */}
                <div className="sn-surface p-3.5 rounded-xl border sn-border space-y-2">
                  <span className="text-xs font-semibold sn-muted block">设为自定义纪念日 / 节日</span>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="例如：纪念日"
                      value={newFestivalName}
                      onChange={(e) => setNewFestivalName(e.target.value)}
                      className="flex-1 sn-input border p-2 text-xs rounded-lg outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newFestivalName.trim()) return;
                        const parts = selectedCalendarDate.split('-');
                        const mmDd = `${parts[1]}-${parts[2]}`;
                        setCustomFestivals({ ...customFestivals, [mmDd]: newFestivalName.trim() });
                        notify('success', `已设定纪念日：${newFestivalName.trim()}`);
                        setNewFestivalName('');
                      }}
                      className="px-3 sn-elevated border sn-border-strong hover:border-indigo-500 sn-text rounded-lg text-xs font-semibold transition-colors"
                    >
                      保存
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
