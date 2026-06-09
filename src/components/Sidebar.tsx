import { Search, FileText, Tag, Calendar, Settings, ChevronLeft, Menu, Rocket } from 'lucide-react';
import { NavState } from '../types';

interface SidebarProps {
  navState: NavState;
  setNavState: (state: NavState) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  themeMode: 'day' | 'night';
  setThemeMode: (mode: 'day' | 'night') => void;
  deviceProfile: string;
  applyDevicePreset: (profile: string) => void;
  uiScale: number;
  setUiScale: (scale: number) => void;
  fontSizeLevel: number;
  setFontSizeLevel: (level: number) => void;
}

export default function Sidebar({ 
  navState, 
  setNavState, 
  isOpen, 
  setIsOpen, 
  searchQuery, 
  setSearchQuery,
  themeMode,
  setThemeMode,
  deviceProfile,
  applyDevicePreset,
  uiScale,
  setUiScale,
  fontSizeLevel,
  setFontSizeLevel
}: SidebarProps) {
  if (!isOpen) {
    return (
      <div className="w-14 shrink-0 flex flex-col items-center py-4 bg-slate-950 border-r border-slate-800">
        <button onClick={() => setIsOpen(true)} className="p-2 bg-slate-800 rounded text-slate-400 hover:text-white">
          <Menu className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col transition-all duration-300">
      <div className="h-14 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
        <span className="font-bold text-slate-100 flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-indigo-600 flex items-center justify-center text-xs">S</div>
          SovereignNote
        </span>
        <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 shrink-0">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="全局搜索..."
            className="w-full h-9 pl-9 pr-4 text-xs bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
        <NavItem active={navState === 'notes'} onClick={() => setNavState('notes')} icon={<FileText className="w-4 h-4 text-indigo-400" />} label="笔记" />
        <NavItem active={navState === 'tags'} onClick={() => setNavState('tags')} icon={<Tag className="w-4 h-4 text-pink-400" />} label="标签" />
        <NavItem active={navState === 'calendar'} onClick={() => setNavState('calendar')} icon={<Calendar className="w-4 h-4 text-emerald-400" />} label="日历" />
        
        {/* 🛠️ 小工具 Section */}
        <div className="pt-3 pb-1 px-3">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">🛠️ 小工具</span>
        </div>
        <NavItem active={navState === 'releases'} onClick={() => setNavState('releases')} icon={<Rocket className="w-4 h-4 text-amber-400 animate-pulse" />} label="版本发布 (Releases)" />

        {/* 🖥️ 多端环境与自适应 (Moved to here: below Tools and above Settings) */}
        <div className="my-2 px-1">
          <div className="bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/80 space-y-2.5">
            <h3 className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 uppercase tracking-wider">
              🖥️ 多端环境与自适应
            </h3>

            {/* Theme Toggle (☀️ Day / 🌙 Night) */}
            <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-slate-950/60 p-0.5 border border-slate-850">
              <button
                type="button"
                onClick={() => setThemeMode('day')}
                className={`py-1 text-[9px] font-bold rounded-md transition-all flex items-center justify-center gap-0.5 ${
                  themeMode === 'day'
                    ? 'bg-amber-500 text-slate-950 shadow font-extrabold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                ☀️ 日间
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('night')}
                className={`py-1 text-[9px] font-bold rounded-md transition-all flex items-center justify-center gap-0.5 ${
                  themeMode === 'night'
                    ? 'bg-indigo-600 text-slate-100 shadow border border-indigo-500/20 font-extrabold shadow'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                🌙 夜间
              </button>
            </div>

            {/* Device preset selector */}
            <div className="grid grid-cols-2 gap-1 bg-slate-950/30 p-1 rounded-lg border border-slate-800/40">
              {[
                { id: 'win-pc', label: '💻 Win 电脑' },
                { id: 'win-tablet', label: '📐 Win 平板' },
                { id: 'android-13', label: '📱 安卓 13' },
                { id: 'sharp-r2', label: '💎 夏普 R2' },
                { id: 'nokia-n1', label: '🎯 诺基亚 N1' }
              ].map((prof) => (
                <button
                  key={prof.id}
                  type="button"
                  onClick={() => applyDevicePreset(prof.id)}
                  className={`py-1 rounded-md text-[8px] font-extrabold transition-all text-center ${
                    deviceProfile === prof.id
                      ? 'bg-indigo-600/40 text-slate-100 shadow border border-indigo-500/30 font-black'
                      : 'bg-slate-950/40 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {prof.label}
                </button>
              ))}
            </div>

            {/* Adjustable sliders */}
            <div className="bg-slate-950/40 p-1.5 rounded-lg border border-slate-800/40 space-y-2 text-[8px] text-slate-400 font-mono">
              <div>
                <div className="flex justify-between items-center font-bold mb-1">
                  <span>字号缩放</span>
                  <span className="text-indigo-400 font-extrabold">{fontSizeLevel} 级</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>小</span>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={fontSizeLevel}
                    onChange={(e) => setFontSizeLevel(parseInt(e.target.value, 10))}
                    className="flex-1 accent-indigo-500 h-0.5 cursor-pointer bg-slate-800 rounded-lg"
                  />
                  <span>大</span>
                </div>
              </div>

              <div className="border-t border-slate-800/40 pt-1.5">
                <div className="flex justify-between items-center font-bold mb-1">
                  <span>UI 缩放比例</span>
                  <span className="text-emerald-400 font-extrabold">{uiScale.toFixed(2)}x</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span>0.5</span>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={uiScale}
                    onChange={(e) => setUiScale(parseFloat(e.target.value))}
                    className="flex-1 accent-emerald-500 h-0.5 cursor-pointer bg-slate-800 rounded-lg"
                  />
                  <span>2.0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="p-2 border-t border-slate-800 shrink-0">
        <NavItem active={navState === 'settings'} onClick={() => setNavState('settings')} icon={<Settings />} label="设置" />
      </div>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? 'bg-indigo-600/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
      }`}
    >
      <span className="w-5 h-5 flex items-center justify-center">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
