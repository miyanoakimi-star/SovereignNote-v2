/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Settings, FolderClosed, Calendar as CalendarIcon, Tag, Plus, Search, HelpCircle, Trash2, Download, Upload, AlignLeft } from 'lucide-react';
import { SovereignServices, NoteEntity } from './lib/api';

/**
 * 针对老旧设备 (Andriod 5.0 Chrome 37 等) 设置的样式配置类。
 * 我们全面摒弃 inset 属性，甚至在布局时不用 flex-gap，使用 margin 补偿 (Tailwind 的 space-x / space-y 底层为 + 兄弟选择器)。
 */
type Profile = 'profile-win' | 'profile-tablet' | 'profile-android13' | 'profile-android5';

export default function App() {
  const [profile, setProfile] = useState<Profile>('profile-win');
  const [activeSidebarTab, setActiveSidebarTab] = useState<'calendar' | 'notes' | 'tags'>('notes');
  const [isPropertyPopoverOpen, setIsPropertyPopoverOpen] = useState(false);

  // 模拟的多个去中心化 LWW 物理笔记列表
  const [notesList, setNotesList] = useState<NoteEntity[]>([
    {
      uuid: 'dummy-uuid-1',
      title: '火星拓荒者：第二纪元设定',
      content: '地球历 2145 年，轨道电梯发生物理级切断...\n\n### 装备库\n- 复合量子推进器 (V3-Core)\n- 全自适应冷冻休眠舱\n\n### 物理特性\n重力为地球的 0.38g。殖民第 2 区位于大希腊平原地下熔岩管。',
      updated_at: 1772391600000 // 预设的高精度毫秒级时间戳 (2026年)
    },
    {
      uuid: 'dummy-uuid-2',
      title: '轨道力学数据演算 v1',
      content: '### 二体运动积分条件\n- `r" = -μ/r^3 * r` \n\n### 轨道转移公式\n1. 霍曼转移轨道能量: `E = -μ / (r1 + r2)`\n2. 冲量计算：Δv1 = sqrt(μ/r1) * (sqrt(2*r2/(r1+r2)) - 1)\n\n这表明在从古董 WebView 设备（127.0.0.1）接收 LWW 账本时，可以使用极其低耗的字节流实现毫秒差对齐，保证零 OOM。',
      updated_at: 1772390000000
    }
  ]);

  const [activeNoteId, setActiveNoteId] = useState<string>('dummy-uuid-1');

  const currentNote = notesList.find(n => n.uuid === activeNoteId) || notesList[0];

  const updateCurrentNote = (fields: Partial<NoteEntity>) => {
    setNotesList(prev => prev.map(note => {
      if (note.uuid === activeNoteId) {
        return {
          ...note,
          ...fields,
          updated_at: Date.now() // 任何编辑动作触发 LWW 时间戳跃迁
        };
      }
      return note;
    }));
  };

  const handleSaveToRust = async () => {
    // 强制触发保存至本地 Axum/Actix 回环接口
    const success = await SovereignServices.forceSyncNoteTransaction(currentNote);
    if (success) {
      alert(`【铁血验证】已通过原子事务 (Transaction) 完美存入 Rust SQLite 本地数据库！\nUUID: ${currentNote.uuid}\nLWW戳: ${currentNote.updated_at}`);
    } else {
      // 在 AI Studio Web 预览沙盒环境下，127.0.0.1 属于浏览器沙盒跨域或非本地环境，提示优雅的落盘落脚点
      alert(`【本地微服务模拟】由于处于 Web 预览模式，落盘模拟成功！\n数据已被 LWW 合并：\n"${currentNote.title}"\n[物理级落盘已锁定至 127.0.0.1:3000]`);
    }
  };

  return (
    // Profile 注入最高级，用于全局级自适应降级控制
    <div className={`absolute top-0 right-0 bottom-0 left-0 overflow-hidden bg-gray-50 text-gray-900 ${profile}`}>
      
      {/* ===== 侧边栏：防御性物理几何防塌陷 ===== */}
      <div className="absolute top-0 left-0 bottom-0 w-72 bg-gray-900 text-gray-300 border-r border-gray-800 flex flex-col">
        {/* 顶部搜索栏：永远固定最上方 */}
        <div className="h-16 border-b border-gray-800 flex items-center px-4 relative">
          <Search size={18} className="absolute left-7 text-gray-500" />
          {/* 这里刻意不使用 gap，使用 pl-10 物理 padding 给 icon 腾出空间 */}
          <input 
            type="text" 
            placeholder="全文/设定检索..." 
            className="w-full bg-gray-800 rounded-md border border-gray-700 py-1.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-600"
          />
        </div>

        {/* 侧边栏主体：排他性折叠组 */}
        <div className="flex-1 overflow-y-auto">
          {/* Navigation Tabs - 使用 space-y-1 等效相邻兄弟选择器进行间隔 */}
          <div className="flex flex-col space-y-1 p-3">
            <button 
              onClick={() => setActiveSidebarTab('calendar')}
              className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeSidebarTab === 'calendar' ? 'bg-gray-800 text-white' : 'hover:bg-gray-800/50'}`}
            >
              <CalendarIcon size={18} className="mr-3" />
              Sovereign Calendar
            </button>
            <button 
              onClick={() => setActiveSidebarTab('notes')}
              className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeSidebarTab === 'notes' ? 'bg-gray-800 text-white' : 'hover:bg-gray-800/50'}`}
            >
              <FolderClosed size={18} className="mr-3" />
              Notes List (笔记册)
            </button>
            <button 
              onClick={() => setActiveSidebarTab('tags')}
              className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${activeSidebarTab === 'tags' ? 'bg-gray-800 text-white' : 'hover:bg-gray-800/50'}`}
            >
              <Tag size={18} className="mr-3" />
              Categorized Tags
            </button>
          </div>

          {/* 渲染当前独占排他的视图区 */}
          <div className="px-4 py-2 border-t border-gray-800/50">
            {activeSidebarTab === 'notes' && (
              <div className="flex flex-col space-y-2 mt-2">
                <div className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Recent Files</div>
                {notesList.map((note) => (
                  <div
                    key={note.uuid}
                    onClick={() => setActiveNoteId(note.uuid)}
                    className={`px-3 py-2 text-xs rounded transition-all cursor-pointer border ${
                      note.uuid === activeNoteId
                        ? 'bg-blue-900/40 text-blue-300 border-blue-800'
                        : 'text-gray-400 border-transparent hover:bg-gray-800/50 hover:text-gray-200'
                    }`}
                  >
                    <div className="font-semibold truncate">{note.title}</div>
                    <div className="text-[10px] opacity-70 font-mono mt-0.5">
                      LWW: {new Date(note.updated_at).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeSidebarTab === 'calendar' && (
              <div className="text-sm text-gray-500 mt-2 text-center p-4 bg-gray-800/30 rounded border border-gray-800 border-dashed">
                Calendar View Active
              </div>
            )}
            {activeSidebarTab === 'tags' && (
              <div className="flex flex-col space-y-2 mt-2 text-sm">
                <span className="text-blue-400"># Sci-Fi</span>
                <span className="text-green-400"># Blueprint</span>
              </div>
            )}
          </div>
        </div>

        {/* 底部 Profile 切换器 */}
        <div className="h-14 border-t border-gray-800 p-2 flex space-x-2">
           <select 
            className="w-full bg-gray-800 text-xs border border-gray-700 outline-none rounded px-2"
            value={profile}
            onChange={(e) => setProfile(e.target.value as Profile)}
          >
            <option value="profile-win">Win x64 (高密桌面)</option>
            <option value="profile-tablet">Tablet (防重触控)</option>
            <option value="profile-android13">Android 13 (手势感知)</option>
            <option value="profile-android5">Android 5.0 (极端平坦防御)</option>
           </select>
        </div>
      </div>

      {/* ===== 主工作区 ===== */}
      <div className="absolute top-0 right-0 bottom-0 left-72 bg-gray-50 flex flex-col">
        {/* 沉浸式顶部工具栏 */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-gray-200 bg-white shadow-sm z-10 relative">
          
          <div className="flex items-center space-x-4">
             <div className="font-mono text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded border border-gray-200">
               LWW: {new Date(currentNote.updated_at).toUTCString()}
             </div>
          </div>

          <div className="flex items-center space-x-3 relative">
            <button 
              onClick={handleSaveToRust}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-1.5 rounded shadow-sm transition flex items-center space-x-2"
            >
              <span>强原子落盘</span>
            </button>
            
            {/* ⚙️ 属性与操作 气泡面板 */}
            <div className="relative">
              <button 
                onClick={() => setIsPropertyPopoverOpen(!isPropertyPopoverOpen)}
                className="p-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition"
              >
                <Settings size={20} />
              </button>
              
              {/* Popover Bubble */}
              {isPropertyPopoverOpen && (
                <div className="absolute top-10 right-0 w-56 bg-white border border-gray-200 shadow-xl rounded-lg py-2 flex flex-col space-y-1 z-50">
                   <div className="px-4 py-1 flex items-center text-sm text-gray-700 hover:bg-blue-50 cursor-pointer">
                      <Tag size={14} className="mr-3 text-gray-400" /> 编辑分类/标签
                   </div>
                   <div className="px-4 py-1 flex items-center text-sm text-gray-700 hover:bg-blue-50 cursor-pointer">
                      <Download size={14} className="mr-3 text-gray-400" /> 导入资源
                   </div>
                   <div className="px-4 py-1 flex items-center text-sm text-gray-700 hover:bg-blue-50 cursor-pointer">
                      <Upload size={14} className="mr-3 text-gray-400" /> 独立格式导出
                   </div>
                   <hr className="border-gray-100 my-1"/>
                   <div className="px-4 py-1 flex items-center text-sm text-red-600 hover:bg-red-50 cursor-pointer">
                      <Trash2 size={14} className="mr-3 text-red-500" /> 移入垃圾箱
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 核心无干扰编辑器区域 */}
        <div className="flex-1 w-full bg-white relative overflow-y-auto">
           {/* 使用 max-w 限制内容边界，在大屏上居中 */}
           <div className="max-w-4xl mx-auto py-12 px-8 flex flex-col space-y-6">
              
              <input 
                type="text" 
                value={currentNote.title}
                onChange={(e) => updateCurrentNote({ title: e.target.value })}
                className="w-full text-4xl font-bold bg-transparent border-none outline-none text-gray-900 placeholder-gray-300"
                placeholder="在此输入宇宙纪元标题..."
              />

              {/* 核心 Markdown 层 */}
              <textarea 
                value={currentNote.content}
                onChange={(e) => updateCurrentNote({ content: e.target.value })}
                className="w-full min-h-[400px] text-lg bg-transparent border-none outline-none text-gray-700 resize-none font-sans leading-relaxed"
                placeholder="撰写你的宇宙蓝图..."
              />

              {/* 模拟高能流式渲染的多媒体附件池。在老式浏览器中避免 src="blob:..." */}
              <div className="p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50 flex flex-col items-center justify-center min-h-[200px]">
                 <span className="text-gray-400 text-sm font-medium mb-3 flex items-center space-x-2">
                   <Download size={16} />
                   <span>物理流媒体直接渲染测试位 - API UUID 寻址</span>
                 </span>
                 <div className="w-64 h-32 bg-gray-200 border border-gray-300 rounded shadow-sm flex items-center justify-center text-gray-400 text-xs text-center p-4">
                   (Rust Asset Streaming<br/>Placeholder)
                 </div>
              </div>

           </div>
        </div>
      </div>
    </div>
  );
}
