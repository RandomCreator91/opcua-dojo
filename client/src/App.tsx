import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  Terminal, Server, Folder, FileCode, Zap, Trash2, 
  Edit3, Save, X, ChevronRight, ChevronDown, Activity, 
  Lock, User, Cpu, ShieldCheck, RefreshCw, Monitor, LayoutDashboard
} from 'lucide-react';

// --- TYPE DEFINITIONS ---
interface TreeNode {
  nodeId: string;
  displayName: string;
  nodeClass: string; 
  children?: TreeNode[];
  isOpen?: boolean;
}

interface MonitoredItem {
  nodeId: string;
  value: any;
  dataType: number;
  timestamp: string;
}

interface LogEntry {
  type: 'info' | 'success' | 'warning' | 'error';
  msg: string;
}

// --- CONFIGURATION ---
// WinCC Unified WebRH URL
const HMI_URL = "https://steuerung99.weckenmann.local/WebRH";

const SOCKET_URL = "http://localhost:3000";
const socket: Socket = io(SOCKET_URL);

// --- COMPONENT: RECURSIVE TREE ITEM ---
const TreeItem = ({ node, onToggle, onSelect }: { node: TreeNode, onToggle: (node: TreeNode) => void, onSelect: (id: string) => void }) => {
  const isFolder = !node.nodeClass.includes("Variable"); 

  return (
    <div className="pl-4 select-none animate-[fadeIn_0.1s_ease-out]">
      <div 
        className={`flex items-center gap-2 py-1 px-2 rounded-md cursor-pointer transition-all border border-transparent whitespace-nowrap
          ${isFolder 
            ? 'text-slate-400 hover:bg-white/5 hover:text-white' 
            : 'text-auto-blue hover:bg-auto-blue/10 hover:border-auto-blue/20'}`}
        onClick={(e) => {
          e.stopPropagation();
          isFolder ? onToggle(node) : onSelect(node.nodeId);
        }}
      >
        {isFolder ? (
          <>
            {node.isOpen ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
            <Folder className={`w-3.5 h-3.5 ${node.isOpen ? 'text-auto-orange' : 'text-slate-600'}`} />
          </>
        ) : (
          <>
            <div className="w-3" />
            <FileCode className="w-3.5 h-3.5 opacity-70" />
          </>
        )}
        <span className="text-xs font-mono tracking-tight">{node.displayName}</span>
      </div>
      
      {node.isOpen && node.children && (
        <div className="border-l border-white/10 ml-2.5">
          {node.children.map((child) => (
            <TreeItem key={child.nodeId} node={child} onToggle={onToggle} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

// --- MAIN APPLICATION COMPONENT ---
function App() {
  const [ip, setIp] = useState("192.168.0.100");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false); 
  const [isConnecting, setIsConnecting] = useState(false);
  
  // View State: 'explorer' (OPC UA) or 'hmi' (WinCC Unified)
  const [activeView, setActiveView] = useState<'explorer' | 'hmi'>('explorer');

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [watchlist, setWatchlist] = useState<MonitoredItem[]>([]);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const logsEndRef = useRef<HTMLDivElement>(null);

  // --- SOCKET EVENT HANDLERS ---
  useEffect(() => {
    socket.on("log", (data: LogEntry) => {
      setLogs(prev => [...prev, data]);
      if (data.msg.includes("SESSION ACTIVE")) {
        setIsAuthenticated(true);
        setIsConnecting(false);
      }
      if (data.type === 'error') setIsConnecting(false);
    });

    socket.on("browse-result", ({ parentId, children }) => {
      setTreeData(prevTree => {
        if (parentId === "ObjectsFolder") return children;
        
        // Recursively find parent and update children
        const updateTree = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map(node => {
            if (node.nodeId === parentId) return { ...node, children: children, isOpen: true };
            if (node.children) return { ...node, children: updateTree(node.children) };
            return node;
          });
        };
        return updateTree(prevTree);
      });
    });

    socket.on("item-update", (data) => {
      setWatchlist(prev => {
        const existing = prev.find(item => item.nodeId === data.nodeId);
        if (existing) return prev.map(item => item.nodeId === data.nodeId ? { ...item, ...data } : item);
        return [...prev, { ...data }];
      });
    });

    return () => { socket.removeAllListeners(); };
  }, []);

  // Auto-fetch root tree upon authentication
  useEffect(() => {
    if (isAuthenticated) setTimeout(() => socket.emit("browse-node", "ObjectsFolder"), 300);
  }, [isAuthenticated]);

  // Auto-scroll logs to bottom
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs]);

  // --- USER ACTIONS ---
  const handleConnect = () => {
    setIsConnecting(true);
    setLogs([]); 
    socket.emit("connect-plc", { ip, username, password });
  };

  const handleDisconnect = () => window.location.reload(); 
  const handleRefreshTree = () => socket.emit("browse-node", "ObjectsFolder");
  
  // Smart Toggle: Closes if open, Fetches if closed & empty, Opens if closed & has data
  const handleToggleNode = (targetNode: TreeNode) => {
    setTreeData(prevTree => {
      const toggleRecursive = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map(node => {
          if (node.nodeId === targetNode.nodeId) {
            // Case 1: Closing
            if (node.isOpen) return { ...node, isOpen: false };
            
            // Case 2: Opening (Data already fetched)
            if (node.children && node.children.length > 0) return { ...node, isOpen: true };
            
            // Case 3: Opening (No data) -> Fetch from server
            socket.emit("browse-node", node.nodeId);
            return { ...node, isOpen: true }; // Optimistic open
          }
          if (node.children) return { ...node, children: toggleRecursive(node.children) };
          return node;
        });
      };
      return toggleRecursive(prevTree);
    });
  };
  
  const handleAddToWatchlist = (nodeId: string) => {
    if (!watchlist.find(w => w.nodeId === nodeId)) socket.emit("monitor-item", nodeId);
  };

  const handleWrite = (item: MonitoredItem) => {
    socket.emit("write-value", { nodeId: item.nodeId, value: editValue, dataType: item.dataType });
    setEditingNode(null);
  };

  // --- VIEW 1: LOGIN PAGE ---
  if (!isAuthenticated) {
    return (
      <div className="h-screen w-full flex items-center justify-center p-4 relative bg-factory-dark overflow-hidden">
        {/* Background Ambient Effects */}
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-auto-blue/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-auto-red/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md bg-[#0a0a0f]/90 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl relative z-10 overflow-hidden animate-[fadeIn_0.5s_ease-out]">
          {/* Neon Bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-[#4285F4] via-[#EA4335] to-[#34A853] relative">
              <div className="absolute inset-0 bg-inherit blur-sm opacity-70"></div>
          </div>
          <div className="p-8">
            <div className="text-center mb-8">
              <div className="mx-auto w-14 h-14 bg-auto-blue/10 rounded-2xl flex items-center justify-center border border-auto-blue/30 mb-5 shadow-[0_0_25px_rgba(0,162,255,0.15)]">
                <Cpu className="w-7 h-7 text-auto-blue" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">OPC UA Dojo</h1>
              <p className="text-xs text-slate-500 uppercase tracking-[0.2em] mt-2 font-medium">Secure Industrial Gateway</p>
            </div>
            <div className="space-y-5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 mb-1 block">Endpoint URL</label>
                <div className="relative group">
                  <Server className="absolute left-4 top-3 w-4 h-4 text-slate-600 group-focus-within:text-auto-blue transition-colors" />
                  <input type="text" value={ip} onChange={(e) => setIp(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm font-mono text-white focus:border-auto-blue focus:bg-black/60 outline-none transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 mb-1 block">User</label>
                  <div className="relative group">
                    <User className="absolute left-4 top-3 w-4 h-4 text-slate-600 group-focus-within:text-auto-blue transition-colors" />
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm text-white focus:border-auto-blue outline-none transition-all" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1 mb-1 block">Pass</label>
                  <div className="relative group">
                    <Lock className="absolute left-4 top-3 w-4 h-4 text-slate-600 group-focus-within:text-auto-blue transition-colors" />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm text-white focus:border-auto-blue outline-none transition-all" />
                  </div>
                </div>
              </div>
              <button onClick={handleConnect} disabled={isConnecting} className="w-full mt-4 bg-gradient-to-r from-auto-blue to-blue-600 hover:to-auto-blue text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 text-sm tracking-wide">
                {isConnecting ? <Activity className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                {isConnecting ? 'INITIATING HANDSHAKE...' : 'CONNECT TO PLC'}
              </button>
            </div>
            
            {logs.length > 0 && (
              <div className="mt-8 pt-4 border-t border-white/5 h-24 overflow-y-auto scrollbar-hide text-[10px] font-mono text-slate-500 bg-black/30 rounded-lg p-3">
                 {logs.map((l, i) => (
                   <div key={i} className={`mb-1.5 flex gap-2 ${l.type === 'error' ? 'text-auto-red' : 'text-slate-400'}`}>
                     <span className="opacity-50">{l.type === 'error' ? '✖' : '>'}</span>
                     <span className="break-all">{l.msg}</span>
                   </div>
                 ))}
                 <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- VIEW 2: DASHBOARD ---
  return (
    <div className="h-screen w-full flex flex-col bg-factory-dark text-slate-200 overflow-hidden animate-[fadeIn_0.5s_ease-out]">
      {/* NAVBAR */}
      <header className="h-14 bg-[#0a0a0f] border-b border-white/10 flex items-center px-6 justify-between shrink-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-auto-green/10 rounded border border-auto-green/30 shadow-[0_0_15px_rgba(0,255,157,0.15)]">
            <ShieldCheck className="w-5 h-5 text-auto-green" />
          </div>
          <h1 className="font-bold tracking-wide text-lg text-white">OPC UA <span className="text-slate-500 font-light">EXPLORER</span></h1>
        </div>
        <button onClick={handleDisconnect} className="text-xs font-bold text-auto-red hover:text-white transition-colors uppercase tracking-wider px-3 py-1 rounded border border-transparent hover:border-auto-red/30">
          Disconnect
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        {/* SIDEBAR NAVIGATION (LEFT) */}
        <aside className="w-16 bg-[#050508] border-r border-white/10 flex flex-col items-center py-4 gap-4 z-40">
           {/* Tab 1: Explorer */}
           <button 
             onClick={() => setActiveView('explorer')}
             className={`p-3 rounded-xl transition-all ${activeView === 'explorer' ? 'bg-auto-blue text-white shadow-[0_0_15px_rgba(0,162,255,0.4)]' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
             title="OPC UA Explorer"
           >
             <LayoutDashboard className="w-6 h-6" />
           </button>
           
           {/* Tab 2: HMI / WinCC */}
           <button 
             onClick={() => setActiveView('hmi')}
             className={`p-3 rounded-xl transition-all ${activeView === 'hmi' ? 'bg-auto-orange text-white shadow-[0_0_15px_rgba(255,157,0,0.4)]' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}
             title="WinCC Unified HMI"
           >
             <Monitor className="w-6 h-6" />
           </button>
        </aside>

        {/* --- DYNAMIC CONTENT AREA --- */}
        {activeView === 'explorer' ? (
          // === SUB-VIEW: OPC UA EXPLORER ===
          <div className="flex-1 flex overflow-hidden">
             {/* Tree (Left Sub-panel) */}
             <div className="w-1/4 min-w-[280px] max-w-sm border-r border-white/5 bg-[#08080c] flex flex-col">
                <div className="p-3 border-b border-white/5 bg-white/[0.02] flex justify-between items-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Folder className="w-3 h-3" /> Address Space
                  </span>
                  <button onClick={handleRefreshTree} className="text-slate-500 hover:text-auto-blue transition-colors" title="Reload Tree">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2 scrollbar-hide relative">
                  {treeData.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 gap-2 opacity-50">
                      <Activity className="w-8 h-8" />
                      <span className="text-xs font-mono">Loading Nodes...</span>
                    </div>
                  ) : (
                    treeData.map(node => <TreeItem key={node.nodeId} node={node} onToggle={handleToggleNode} onSelect={handleAddToWatchlist} />)
                  )}
                </div>
             </div>

             {/* Main Content (Right Sub-panel) */}
             <main className="flex-1 flex flex-col relative bg-gradient-to-br from-[#050508] to-[#0f0f15]">
                <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
                <div className="flex-1 overflow-y-auto p-6 z-10 scrollbar-hide">
                  {watchlist.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50">
                      <Activity className="w-16 h-16 mb-4 stroke-1" />
                      <p className="text-sm tracking-widest font-mono">SELECT A VARIABLE FROM LEFT TREE</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {watchlist.map((item) => (
                          <div key={item.nodeId} className="bg-[#0a0a0f]/80 backdrop-blur border border-white/10 p-4 rounded-xl shadow-lg hover:border-auto-blue/50 transition-all animate-[fadeIn_0.3s_ease-out]">
                            <div className="flex justify-between items-start mb-4">
                              <div className="text-[10px] text-slate-500 font-mono break-all pr-2">{item.nodeId}</div>
                              <button onClick={() => setWatchlist(prev => prev.filter(w => w.nodeId !== item.nodeId))} className="text-slate-600 hover:text-auto-red transition-colors"><Trash2 className="w-4 h-4"/></button>
                            </div>
                            <div className="mb-2">
                              {editingNode === item.nodeId ? (
                                <div className="flex items-center gap-2">
                                  <input autoFocus className="w-full bg-black border border-auto-blue text-white font-mono px-2 py-1 rounded outline-none" defaultValue={String(item.value)} onChange={(e) => setEditValue(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') handleWrite(item) }} />
                                  <button onClick={() => handleWrite(item)} className="text-auto-green hover:scale-110 transition-transform"><Save className="w-5 h-5"/></button>
                                  <button onClick={() => setEditingNode(null)} className="text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5"/></button>
                                </div>
                              ) : (
                                <div className="text-2xl font-mono text-auto-green font-bold cursor-pointer hover:text-white transition-colors flex items-center gap-2 group w-full overflow-hidden" onClick={() => { setEditingNode(item.nodeId); setEditValue(String(item.value)); }}>
                                  {/* Responsive array rendering with horizontal scroll */}
                                  <div className="overflow-x-auto scrollbar-hide whitespace-nowrap max-w-full">
                                      {String(item.value)}
                                  </div>
                                  <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 shrink-0" />
                                </div>
                              )}
                            </div>
                            <div className="pt-3 border-t border-white/5 text-[9px] font-mono text-slate-500 flex justify-between">
                              <span>Type: {item.dataType}</span>
                              <span className="text-auto-blue">{item.timestamp.split('T')[1]?.split('.')[0]}</span>
                            </div>
                          </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="h-36 bg-[#020203] border-t border-white/10 flex flex-col z-20">
                  <div className="px-4 py-1.5 bg-white/5 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Terminal className="w-3 h-3" /> System Stream
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1 scrollbar-hide">
                    <div ref={logsEndRef} />
                    {logs.map((l, i) => (
                      <div key={i} className={`flex gap-2 mb-0.5 ${l.type === 'error' ? 'text-auto-red' : l.type === 'success' ? 'text-auto-green' : 'text-slate-400'}`}>
                        <span className="opacity-30 select-none">[{new Date().toLocaleTimeString()}]</span>
                        <span className="break-all">{l.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
             </main>
          </div>
        ) : (
          // === SUB-VIEW: WINCC UNIFIED LAUNCHER ===
          <div className="flex-1 bg-[#050508] relative flex flex-col items-center justify-center p-8">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-auto-orange/5 rounded-full blur-[100px]" />
            </div>

            <div className="relative z-10 max-w-2xl w-full bg-[#0a0a0f]/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-10 text-center shadow-2xl animate-[fadeIn_0.4s_ease-out]">
                
                <div className="mx-auto w-20 h-20 bg-auto-orange/10 rounded-3xl flex items-center justify-center border border-auto-orange/20 mb-6 shadow-[0_0_30px_rgba(255,157,0,0.15)]">
                   <Monitor className="w-10 h-10 text-auto-orange" />
                </div>

                <h2 className="text-3xl font-bold text-white mb-3 tracking-tight">WinCC Unified HMI</h2>
                <p className="text-slate-400 text-sm mb-8 leading-relaxed max-w-md mx-auto">
                  This operator panel requires a dedicated security context.
                  <br/>
                  Launch the WebRH session in a secure window to ensure WebSocket stability.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left">
                    <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-auto-green animate-pulse" />
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold">Target System</div>
                            <div className="text-sm font-mono text-slate-200">S7-1500 / PC Runtime</div>
                        </div>
                    </div>
                    <div className="bg-black/40 p-4 rounded-xl border border-white/5 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-auto-blue" />
                        <div>
                            <div className="text-[10px] text-slate-500 uppercase font-bold">Protocol</div>
                            <div className="text-sm font-mono text-slate-200">HTTPS / WSS (Secure)</div>
                        </div>
                    </div>
                </div>

                <a 
                  href={HMI_URL} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="group relative w-full inline-flex items-center justify-center gap-3 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-bold py-4 px-8 rounded-xl transition-all transform active:scale-[0.98] shadow-lg shadow-orange-900/20 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 group-hover:translate-x-full duration-1000 transition-transform -translate-x-full skew-x-12" />
                  <Monitor className="w-5 h-5" />
                  <span>LAUNCH HMI INTERFACE</span>
                  <div className="bg-white/20 p-1 rounded-md ml-2">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </div>
                </a>

                <p className="text-[10px] text-slate-600 mt-6 font-mono">
                    NOTE: Please accept the Siemens security certificate if prompted.
                </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;