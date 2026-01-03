import React, { useState, useEffect, useCallback, useMemo, useRef } from 'https://esm.sh/react@19.0.0';
import ReactDOM from 'https://esm.sh/react-dom@19.0.0/client';
import { HashRouter, Routes, Route, useLocation } from 'https://esm.sh/react-router-dom@7.1.3?deps=react@19.0.0';
import { 
  Image as ImageIcon, Search, ChevronDown, 
  Check, Zap, Link as LinkIcon, User, Eye, Send, RefreshCcw, Database, Sparkles, Trash2, Download, Upload, UserPlus, AlignVerticalJustifyStart, AlignVerticalJustifyEnd, Wifi,
  GripVertical, Layout, ExternalLink
} from 'https://esm.sh/lucide-react@0.474.0?deps=react@19.0.0';

const REPO_OWNER = 'JouCoding';
const REPO_NAME = 'Coromon_Sprites-Skins';
const REPO_PATH = 'sprites';
const AVATAR_PATH = 'sprites_avatars';
const SPRITE_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${REPO_PATH}/`;
const AVATAR_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${AVATAR_PATH}/`;
const GITHUB_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${REPO_PATH}`;
const AVATAR_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${AVATAR_PATH}`;

// Remote Sync Config (ntfy.sh is a free, public, no-auth-needed pub/sub service)
const NTFY_BASE = 'https://ntfy.sh';
const SYNC_PREFIX = 'coromon_sync_v8_';

// Skin Mapping
const SKIN_MAP = { 'd': 'Blue', 'darkmagic': 'Crimsonite' };
const REVERSE_SKIN_MAP = { 'blue': 'd', 'crimsonite': 'darkmagic' };
const POTENCY_CODE_MAP = { 'a': 'A', 'b': 'B', 'c': 'C', 'potent': 'B', 'perfect': 'C' };

const safeStorage = {
  get: (key) => { try { return localStorage.getItem(key); } catch(e) { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, val); } catch(e) {} }
};

const createEmptyTeam = () => Array.from({ length: 6 }, () => ({ id: Math.random().toString(36).substring(7), coromonName: '', nickname: '', potency: 'A', skin: 'Standard', isActive: true }));

const parseSpriteFilename = (filename) => {
  const clean = filename.replace('.gif', '').replace('_front', '');
  const parts = clean.split('_');
  const species = parts[0];
  const potencies = ['A', 'B', 'C'];
  let potency = 'A', skin = 'Standard';
  const pIdx = parts.findIndex(p => potencies.includes(p.toUpperCase()));
  if (pIdx !== -1) {
    potency = parts[pIdx].toUpperCase();
    const skinParts = parts.filter((_, i) => i !== 0 && i !== pIdx);
    if (skinParts.length > 0) skin = skinParts.join(' ');
  } else if (parts.length > 1) {
    skin = parts.slice(1).join(' ');
  }
  const skinLower = skin.toLowerCase();
  if (SKIN_MAP[skinLower]) skin = SKIN_MAP[skinLower];
  else if (skin !== 'Standard') skin = skin.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { species, skin, potency, file: filename };
};

const parseAvatarFilename = (filename) => {
  const clean = filename.replace('.png', '').toLowerCase();
  const parts = clean.split('_');
  const species = parts[0];
  let potency = 'A';
  const pIdx = parts.findIndex(p => POTENCY_CODE_MAP[p]);
  if (pIdx !== -1) potency = POTENCY_CODE_MAP[parts[pIdx]];
  const skinParts = parts.filter((p, i) => i !== 0 && !POTENCY_CODE_MAP[p]);
  let skin = 'Standard';
  if (skinParts.length > 0) {
    const rawSkin = skinParts.join(' ');
    skin = SKIN_MAP[rawSkin] || rawSkin.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  return { species, skin, potency, file: filename };
};

const getAvatarUrl = (member, avatarFiles) => {
  if (!member.coromonName || !avatarFiles || avatarFiles.length === 0) return null;
  const species = member.coromonName.toLowerCase().trim();
  const rawSkin = member.skin.toLowerCase().trim();
  const skinsToTry = [rawSkin.replace(/ /g, '_')];
  if (REVERSE_SKIN_MAP[rawSkin]) skinsToTry.push(REVERSE_SKIN_MAP[rawSkin]);
  const potencyWord = member.potency === 'B' ? 'potent' : member.potency === 'C' ? 'perfect' : null;
  const potencyCode = member.potency.toLowerCase();
  const check = (name) => avatarFiles.find(f => f.toLowerCase() === `${name.toLowerCase()}.png`);
  if (rawSkin !== 'standard') {
    for (const skin of skinsToTry) {
      let m = null;
      if (potencyWord) m = check(`${species}_${potencyWord}_${skin}`);
      if (!m) m = check(`${species}_${potencyCode}_${skin}`);
      if (!m) m = check(`${species}_${skin}`);
      if (m) return `${AVATAR_BASE}${m}`;
    }
  }
  let m = null;
  if (potencyWord) m = check(`${species}_${potencyWord}`);
  if (!m) m = check(`${species}_${potencyCode}`);
  if (!m) m = check(species);
  if (m) return `${AVATAR_BASE}${m}`;
  const fuzzy = avatarFiles.find(f => f.toLowerCase().startsWith(species));
  return fuzzy ? `${AVATAR_BASE}${fuzzy}` : null;
};

const getSpriteUrl = (member, manifest) => {
  if (!member.coromonName || !manifest) return null;
  const s = member.coromonName.toLowerCase();
  const sk = member.skin.toLowerCase();
  const p = member.potency;
  let m = manifest.find(x => x.species.toLowerCase() === s && x.skin.toLowerCase() === sk && x.potency === p);
  if (!m && sk !== 'standard') m = manifest.find(x => x.species.toLowerCase() === s && x.skin.toLowerCase() === sk);
  if (!m && p !== 'A') m = manifest.find(x => x.species.toLowerCase() === s && x.potency === p);
  if (!m) m = manifest.find(x => x.species.toLowerCase() === s);
  return m ? `${SPRITE_BASE}${m.file}` : null;
};

// --- RENDERER ---

const TeamRenderer = ({ team, settings, layout, manifest, manifestAvatars, scale = 1 }) => {
  const activeMembers = team.filter(m => m.isActive && m.coromonName);
  const gridTemplateColumns = useMemo(() => {
    if (layout === 'grid-2x3') return 'repeat(2, max-content)';
    if (layout === 'grid-3x2') return 'repeat(3, max-content)';
    return 'none';
  }, [layout]);

  const viewMode = settings.viewMode || 'sprites';
  const itemSize = (viewMode === 'avatars' ? 144 : 192) * scale;
  const sx = settings.spacingX * scale;
  const sy = settings.spacingY * scale;
  const no = settings.nameOffset * scale;
  const fs = 14 * scale;
  const px = 14 * scale;
  const py = 10 * scale;

  const glowVal = settings.glowIntensity || 0;
  const glow = glowVal > 0 
    ? `drop-shadow(0 0 ${glowVal / 5}px rgba(255,255,255,${glowVal / 100})) drop-shadow(0 0 ${glowVal / 10}px rgba(255,255,255,0.8))` 
    : 'none';
    
  const namePos = settings.namePosition || 'below';

  return (
    <div 
      style={{
        display: layout.includes('grid') ? 'grid' : 'flex',
        flexDirection: layout === 'stack' ? 'column' : 'row',
        gridTemplateColumns,
        gap: layout.includes('grid') ? `${sy}px ${sx}px` : (layout === 'stack' ? `${sy}px` : `${sx}px`),
        justifyContent: 'flex-start', // 1st slot anchor
        alignItems: 'flex-start', // 1st slot anchor
        width: 'max-content',
        height: 'max-content'
      }}
    >
      {activeMembers.map((m) => {
        const url = viewMode === 'sprites' ? getSpriteUrl(m, manifest) : getAvatarUrl(m, manifestAvatars);
        const nameNode = (
          <div 
            style={{ 
              marginTop: namePos === 'below' ? `${no}px` : '0', 
              marginBottom: namePos === 'above' ? `${no}px` : '0',
              padding: `${py}px ${px}px`, 
              borderRadius: `${4 * scale}px` 
            }} 
            className="bg-black/90 backdrop-blur-md border-2 border-white/20 flex items-center justify-center shrink-0"
          >
            <span style={{ fontSize: `${fs}px` }} className="font-pixel text-white uppercase leading-none whitespace-nowrap tracking-tighter">
              {m.nickname || m.coromonName}
            </span>
          </div>
        );

        return (
          <div key={m.id} className="flex flex-col items-center shrink-0">
            {namePos === 'above' && nameNode}
            <div style={{ width: `${itemSize}px`, height: `${itemSize}px`, filter: glow }} className="flex items-center justify-center transition-all duration-300">
              {url && <img src={url} className={`max-w-full max-h-full pixelated ${viewMode === 'sprites' ? 'animate-bounce-soft' : 'scale-[3.0]'}`} />}
            </div>
            {namePos === 'below' && nameNode}
          </div>
        );
      })}
      {activeMembers.length === 0 && <div className="text-gray-700 font-pixel text-[8px] uppercase tracking-widest animate-pulse">NO ACTIVE MEMBERS</div>}
    </div>
  );
};

// --- OBS VIEW ---

const ObsView = ({ manifest, manifestAvatars }) => {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const rawU = params.get('u') || 'unnamed';
  const u = rawU.toLowerCase().trim(); // Ensure consistency
  const l = params.get('l') || 'row';
  const d = params.get('d');
  
  const [data, setData] = useState(() => {
    if (d) { try { return JSON.parse(atob(d)); } catch(e) { return null; } }
    return null;
  });

  const lastTsRef = useRef(data?.ts || 0);

  useEffect(() => {
    // 1. Local Sync (Same Browser)
    const localChannel = new BroadcastChannel(`${SYNC_PREFIX}${u}`);
    localChannel.onmessage = (e) => {
      const { team, settings, ts } = e.data;
      if (ts > lastTsRef.current) {
        lastTsRef.current = ts;
        setData({ team, settings, ts });
      }
    };

    // 2. Remote Sync (Across Browsers/OBS)
    // We use EventSource for ultra-low latency listening to ntfy.sh
    const remoteUrl = `${NTFY_BASE}/${SYNC_PREFIX}${u}/sse`;
    const eventSource = new EventSource(remoteUrl);
    
    eventSource.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.message) {
          const remoteData = JSON.parse(payload.message);
          if (remoteData.ts > lastTsRef.current) {
            lastTsRef.current = remoteData.ts;
            setData(remoteData);
          }
        }
      } catch(err) {}
    };

    return () => {
      localChannel.close();
      eventSource.close();
    };
  }, [u]);

  if (!data) return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-transparent">
      <div className="w-16 h-16 rounded-full border-4 border-blue-600/20 border-t-blue-500 animate-spin" />
      <div className="text-center">
        <h1 className="text-white font-pixel text-[10px] uppercase animate-pulse">Initializing...</h1>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 flex items-start justify-start p-10 overflow-hidden bg-transparent">
      <TeamRenderer team={data.team} settings={data.settings} layout={l} manifest={manifest} manifestAvatars={manifestAvatars} scale={1} />
    </div>
  );
};

// --- DASHBOARD COMPONENTS ---

const TeamSlot = ({ member, idx, onUpdate, manifest, manifestAvatars, onDragStart, onDragOver, onDrop, onDragEnd, isDragging, viewMode }) => {
  const pMap = { Standard: 'A', Potent: 'B', Perfect: 'C', A: 'Standard', B: 'Potent', C: 'Perfect' };
  const currentAvatars = useMemo(() => {
    if (!manifestAvatars || !member.coromonName) return [];
    const s = member.coromonName.toLowerCase();
    return manifestAvatars.filter(f => f.toLowerCase().startsWith(s)).map(parseAvatarFilename);
  }, [manifestAvatars, member.coromonName]);

  const skins = useMemo(() => {
    if (!member.coromonName) return ['Standard'];
    const s = member.coromonName.toLowerCase();
    const set = new Set(['Standard']);
    if (viewMode === 'sprites' && manifest) manifest.filter(m => m.species.toLowerCase() === s).forEach(m => set.add(m.skin));
    else currentAvatars.forEach(m => set.add(m.skin));
    return Array.from(set).sort((a,b) => a === 'Standard' ? -1 : b === 'Standard' ? 1 : a.localeCompare(b));
  }, [manifest, currentAvatars, member.coromonName, viewMode]);

  const potencies = useMemo(() => {
    if (!member.coromonName) return ['A'];
    const s = member.coromonName.toLowerCase();
    const sk = member.skin.toLowerCase();
    const set = new Set(['A']);
    if (viewMode === 'sprites' && manifest) manifest.filter(m => m.species.toLowerCase() === s && m.skin.toLowerCase() === sk).forEach(m => set.add(m.potency));
    else currentAvatars.filter(m => m.skin.toLowerCase() === sk).forEach(m => set.add(m.potency));
    return Array.from(set).sort((a,b) => a === 'A' ? -1 : b === 'A' ? 1 : a.localeCompare(b));
  }, [manifest, currentAvatars, member.coromonName, member.skin, viewMode]);
  
  const preview = viewMode === 'sprites' ? getSpriteUrl(member, manifest) : getAvatarUrl(member, manifestAvatars);

  return (
    <div 
      draggable onDragStart={e => onDragStart(e, idx)} onDragOver={e => onDragOver(e, idx)} onDrop={e => onDrop(e, idx)} onDragEnd={onDragEnd}
      className={`p-6 rounded-[2.5rem] border transition-all select-none group/slot ${isDragging ? 'opacity-30 scale-95 border-blue-500' : member.isActive ? 'bg-gray-900 border-blue-500/40 shadow-2xl' : 'bg-gray-950 border-gray-900 opacity-60'} hover:border-blue-400/50`}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="cursor-grab active:cursor-grabbing p-1 text-gray-700 group-hover/slot:text-blue-500"><GripVertical size={18} /></div>
          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">SLOT {idx + 1}</span>
        </div>
        <input type="checkbox" checked={member.isActive} onChange={e => onUpdate({ isActive: e.target.checked })} className="w-6 h-6 rounded-lg bg-black text-blue-600 focus:ring-0 cursor-pointer" />
      </div>
      <div className="flex gap-6">
        <div className="w-32 h-32 bg-black rounded-3xl border border-gray-800 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
          {member.coromonName ? <img src={preview} className={`max-w-[85%] max-h-[85%] pixelated pointer-events-none ${viewMode === 'avatars' ? 'scale-[3.0]' : ''}`} /> : <ImageIcon className="opacity-5" size={32} />}
        </div>
        <div className="flex-1 space-y-4">
          <SpeciesSelector manifest={manifest} manifestAvatars={manifestAvatars} viewMode={viewMode} value={member.coromonName} onChange={v => onUpdate({ coromonName: v, isActive: true, skin: 'Standard', potency: 'A' })} />
          <div className="grid grid-cols-2 gap-3">
            <select value={member.skin} disabled={!member.coromonName} onChange={e => onUpdate({ skin: e.target.value })} className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white uppercase outline-none focus:border-blue-500/50 appearance-none">
              {skins.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={pMap[member.potency]} disabled={!member.coromonName || potencies.length <= 1} onChange={e => onUpdate({ potency: pMap[e.target.value] })} className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white uppercase outline-none focus:border-blue-500/50 appearance-none">
              {potencies.map(c => <option key={c} value={pMap[c]}>{pMap[c]}</option>)}
            </select>
          </div>
          <input type="text" placeholder="Nickname..." maxLength={12} value={member.nickname || ''} onChange={e => onUpdate({ nickname: e.target.value })} className="w-full bg-black border border-gray-800 rounded-xl px-4 py-2.5 text-[11px] font-bold text-white outline-none focus:border-blue-500" />
        </div>
      </div>
    </div>
  );
};

const SpeciesSelector = ({ value, onChange, manifest, manifestAvatars, viewMode }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [term, setTerm] = useState('');
  const ref = useRef(null);
  const list = useMemo(() => manifest ? Array.from(new Set(manifest.map(m => m.species))).sort() : [], [manifest]);
  useEffect(() => { const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setIsOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setIsOpen(!isOpen)} className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-[12px] font-bold text-white flex justify-between items-center cursor-pointer shadow-inner hover:border-gray-600 transition-all">
        <span className={value ? 'text-white truncate' : 'text-gray-600 truncate'}>{value || 'Select Coromon...'}</span>
        <ChevronDown size={16} className={isOpen ? 'rotate-180 text-blue-500' : 'text-gray-700'} />
      </div>
      {isOpen && (
        <div className="absolute z-[100] mt-1 w-full bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="p-4 border-b border-gray-800 bg-black flex items-center gap-3 text-gray-500 focus-within:text-blue-500"><Search size={16} /><input autoFocus value={term} onChange={e => setTerm(e.target.value)} placeholder="Search..." className="bg-transparent border-none text-[12px] text-white w-full outline-none font-bold" /></div>
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            {list.filter(s => s.toLowerCase().includes(term.toLowerCase())).map(s => {
              const icon = viewMode === 'sprites' ? getSpriteUrl({ coromonName: s, skin: 'Standard', potency: 'A' }, manifest) : getAvatarUrl({ coromonName: s, skin: 'Standard', potency: 'A' }, manifestAvatars);
              return (
                <div key={s} onClick={() => { onChange(s); setIsOpen(false); }} className="flex items-center gap-4 px-5 py-3 hover:bg-blue-600/30 cursor-pointer border-b border-white/5 group">
                  <div className="w-10 h-10 flex items-center justify-center shrink-0 overflow-hidden bg-black/40 rounded-lg">
                    {icon && <img src={icon} className={`max-w-full max-h-full pixelated object-contain ${viewMode === 'avatars' ? 'w-[23px] h-[23px]' : 'scale-[0.8]'}`} />}
                  </div>
                  <span className="text-[12px] font-bold uppercase text-gray-400 group-hover:text-white tracking-widest">{s}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// --- APP ---

const App = () => {
  const [user, setUser] = useState(() => safeStorage.get('coromon-username') || 'trainer-' + Math.random().toString(36).substring(7));
  const [profiles, setProfiles] = useState(() => {
    const saved = safeStorage.get('coromon-profiles-v2');
    return saved ? JSON.parse(saved) : [{ id: 'default', name: 'Standard Profile', team: createEmptyTeam() }];
  });
  const [activeProfileId, setActiveProfileId] = useState(() => safeStorage.get('coromon-active-profile') || 'default');
  const [draggedIdx, setDraggedIdx] = useState(null);
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const team = activeProfile.team;
  const [settings, setSettings] = useState(() => {
    const saved = safeStorage.get('coromon-settings-v2');
    return saved ? JSON.parse(saved) : { layoutMode: 'row', spacingX: 32, spacingY: 32, nameOffset: 8, glowIntensity: 50, namePosition: 'below', viewMode: 'sprites' };
  });
  const [manifest, setManifest] = useState(null);
  const [manifestAvatars, setManifestAvatars] = useState([]);
  const [previewLayout, setPreviewLayout] = useState('row');
  const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, error

  const localChannelRef = useRef(null);

  useEffect(() => {
    const u = user.toLowerCase().trim();
    localChannelRef.current = new BroadcastChannel(`${SYNC_PREFIX}${u}`);
    return () => localChannelRef.current?.close();
  }, [user]);

  // Unified Broadcast Function
  const broadcast = useCallback(async (payload) => {
    const u = user.toLowerCase().trim();
    const data = { ...payload, ts: Date.now() };

    // 1. Local (same browser tabs)
    localChannelRef.current?.postMessage(data);

    // 2. Remote (OBS / other browsers)
    setSyncStatus('syncing');
    try {
      await fetch(`${NTFY_BASE}/${SYNC_PREFIX}${u}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
      setSyncStatus('idle');
    } catch(err) {
      setSyncStatus('error');
    }
  }, [user]);

  useEffect(() => {
    safeStorage.set('coromon-profiles-v2', JSON.stringify(profiles));
    safeStorage.set('coromon-active-profile', activeProfileId);
    safeStorage.set('coromon-settings-v2', JSON.stringify(settings));
    safeStorage.set('coromon-username', user);
    broadcast({ team, settings });
  }, [profiles, activeProfileId, settings, user, team, broadcast]);

  useEffect(() => { 
    fetch(GITHUB_API).then(r => r.json()).then(d => Array.isArray(d) && setManifest(d.filter(i => i.name.endsWith('.gif')).map(i => parseSpriteFilename(i.name))));
    fetch(AVATAR_API).then(r => r.json()).then(d => Array.isArray(d) && setManifestAvatars(d.filter(i => i.name.endsWith('.png')).map(i => i.name)));
  }, []);

  const getLink = (l) => {
    const base = window.location.href.split('#')[0].split('?')[0];
    const u = user.toLowerCase().trim();
    const data = btoa(JSON.stringify({ team, settings, ts: Date.now() }));
    return `${base}#/obs?u=${u}&l=${l}&d=${data}`;
  };

  const updateSlot = (idx, up) => {
    const np = profiles.map(p => {
      if (p.id !== activeProfileId) return p;
      let nt = [...p.team];
      nt[idx] = { ...nt[idx], ...up };
      if (Object.prototype.hasOwnProperty.call(up, 'coromonName')) {
        const filled = nt.filter(m => m.coromonName !== '');
        nt = [...filled, ...Array.from({ length: 6 - filled.length }, () => ({ id: Math.random().toString(36).substring(7), coromonName: '', nickname: '', potency: 'A', skin: 'Standard', isActive: true }))];
      }
      return { ...p, team: nt };
    });
    setProfiles(np);
  };

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={
          <div className="h-screen flex flex-col bg-[#020617] text-gray-100 overflow-hidden">
            <nav className="bg-gray-950/90 backdrop-blur-2xl border-b border-gray-800 px-10 py-5 flex items-center justify-between z-[100] shadow-2xl">
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center" style={{ transform: 'rotate(-5deg)' }}><Zap size={26} className="text-white fill-current" /></div>
                <h1 className="text-base font-black uppercase tracking-[0.4em] text-white italic">Coromon Team Display</h1>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${syncStatus === 'syncing' ? 'bg-blue-500 animate-pulse' : syncStatus === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                  <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{syncStatus === 'syncing' ? 'Syncing OBS...' : syncStatus === 'error' ? 'Sync Error' : 'OBS Synced'}</span>
                </div>
                <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 px-5 py-2.5 rounded-2xl focus-within:border-blue-500">
                  <User size={16} className="text-gray-500" />
                  <input type="text" value={user} onChange={e => setUser(e.target.value)} className="bg-transparent border-none outline-none text-[11px] font-black uppercase tracking-widest w-40 text-white placeholder-gray-700" />
                  <button onClick={() => setUser('trainer-' + Math.random().toString(36).substring(7))} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-600 hover:text-blue-500"><RefreshCcw size={12} /></button>
                </div>
              </div>
            </nav>
            <div className="flex-1 flex overflow-hidden">
              <aside className="w-[30rem] bg-gray-950/50 border-r border-gray-800/40 p-8 flex flex-col gap-10 overflow-y-auto custom-scrollbar">
                <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-[2.5rem]"><p className="text-[10px] text-blue-400 font-bold uppercase italic text-center leading-relaxed">Changes sync to OBS instantly via Background Cloud Sync!</p></div>
                <div className="space-y-6">
                  <h2 className="text-[11px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-3"><User size={14} className="text-blue-500" /> Profiles</h2>
                  <div className="bg-gray-900/40 border border-gray-800 rounded-[2.5rem] p-6 space-y-6">
                    <select value={activeProfileId} onChange={e => setActiveProfileId(e.target.value)} className="w-full bg-black border border-gray-800 rounded-2xl px-5 py-3 text-[12px] font-bold text-white uppercase outline-none focus:border-blue-500 appearance-none">{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => { const n = prompt('Name?'); if(n) { const id = Math.random().toString(36).substring(7); setProfiles([...profiles, {id, name: n, team: createEmptyTeam()}]); setActiveProfileId(id); } }} className="flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-blue-600 rounded-xl text-[9px] font-black uppercase"><UserPlus size={14} /> New</button>
                      <button onClick={() => { if(profiles.length > 1 && confirm('Delete?')) { const n = profiles.filter(p => p.id !== activeProfileId); setProfiles(n); setActiveProfileId(n[0].id); } }} className="flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-red-600 rounded-xl text-[9px] font-black uppercase"><Trash2 size={14} /> Delete</button>
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <h2 className="text-[11px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-3"><LinkIcon size={14} className="text-blue-500" /> Smart Overlay Links</h2>
                  <div className="grid grid-cols-1 gap-4">
                    {['row', 'stack', 'grid-2x3', 'grid-3x2'].map(l => (
                      <div key={l} className="p-5 bg-gray-900/40 border border-gray-800 rounded-[2.5rem] hover:border-blue-500/30 transition-all flex flex-col gap-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">{l.replace('-', ' ')}</span>
                        <div className="flex gap-2">
                          <button onClick={() => { navigator.clipboard.writeText(getLink(l)); alert('Copied Smart Link!'); }} className="flex-1 flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-emerald-600 rounded-xl text-[9px] font-black uppercase whitespace-nowrap"><Database size={14} /> Copy Smart Link</button>
                          <button onClick={() => window.open(getLink(l), '_blank')} className="px-4 flex items-center justify-center bg-gray-800 hover:bg-blue-600 rounded-xl text-white transition-all" title="Open in New Tab"><ExternalLink size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-8">
                  <h2 className="text-[11px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-3"><Sparkles size={14} className="text-blue-500" /> Styles</h2>
                  <div className="space-y-8 px-1">
                    <div className="space-y-3">
                      <div className="flex justify-between text-[9px] font-black text-gray-600 uppercase tracking-widest"><span>Position</span><span className="text-blue-500">{settings.namePosition}</span></div>
                      <div className="flex gap-2 p-1 bg-gray-900/40 border border-gray-800 rounded-xl">
                        {['above', 'below'].map(p => <button key={p} onClick={() => setSettings({...settings, namePosition: p})} className={`flex-1 py-2 text-[8px] font-black uppercase rounded-lg transition-all ${settings.namePosition === p ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>{p}</button>)}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-[9px] font-black text-gray-600 uppercase tracking-widest"><span>Glow</span><span className="text-blue-500">{settings.glowIntensity}%</span></div>
                      <input type="range" value={settings.glowIntensity} onChange={e => setSettings({...settings, glowIntensity: parseInt(e.target.value)})} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-blue-600 cursor-pointer" />
                    </div>
                    {[ ['Spacing X', 'spacingX', 400], ['Spacing Y', 'spacingY', 400], ['Name Offset', 'nameOffset', 100] ].map(([label, key, max]) => (
                      <div key={key} className="space-y-3">
                        <div className="flex justify-between text-[9px] font-black text-gray-600 uppercase tracking-widest"><span>{label}</span><span className="text-blue-500">{settings[key]}px</span></div>
                        <input type="range" min={key === 'nameOffset' ? -50 : 0} max={max} value={settings[key]} onChange={e => setSettings({ ...settings, [key]: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-blue-600 cursor-pointer" />
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
              <main className="flex-1 flex flex-col bg-black overflow-y-auto custom-scrollbar">
                <div className="p-10 bg-gray-950/20">
                  <div className="flex items-center gap-8 mb-8">
                    <h2 className="text-[11px] font-black uppercase text-gray-500 tracking-[0.3em] flex-1 flex items-center gap-4"><div className="h-px flex-1 bg-gray-900" /> COMPOSITION <div className="h-px flex-1 bg-gray-900" /></h2>
                    <div className="flex bg-gray-900 rounded-2xl p-1 border border-gray-800">
                      {['sprites', 'avatars'].map(m => <button key={m} onClick={() => setSettings({...settings, viewMode: m})} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase ${settings.viewMode === m ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-500'}`}>{m}</button>)}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8">
                    {team.map((m, i) => <TeamSlot key={m.id} member={m} idx={i} manifest={manifest} manifestAvatars={manifestAvatars} onUpdate={up => updateSlot(i, up)} onDragStart={(e, idx) => { setDraggedIdx(idx); e.dataTransfer.effectAllowed = 'move'; }} onDragOver={e => e.preventDefault()} onDrop={(e, idx) => { if (draggedIdx === null || draggedIdx === idx) return; const np = profiles.map(p => { if (p.id !== activeProfileId) return p; const nt = [...p.team]; const [mv] = nt.splice(draggedIdx, 1); nt.splice(idx, 0, mv); return { ...p, team: nt }; }); setProfiles(np); setDraggedIdx(null); }} onDragEnd={() => setDraggedIdx(null)} isDragging={draggedIdx === i} viewMode={settings.viewMode} />)}
                  </div>
                </div>
                <div className="min-h-[600px] border-t border-gray-800/60 bg-[#020617] relative flex flex-col">
                  <div className="absolute top-6 left-6 z-10 flex items-center gap-4">
                    <div className="bg-black/80 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-3 text-[10px] font-black uppercase text-white"><Eye size={14} className="text-blue-500" /> Live Preview</div>
                    <div className="flex gap-2 p-1 bg-black/60 rounded-xl border border-white/5">
                      {['row', 'stack', 'grid-2x3', 'grid-3x2'].map(l => <button key={l} onClick={() => setPreviewLayout(l)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${previewLayout === l ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-500'}`}>{l.replace('-', ' ')}</button>)}
                    </div>
                  </div>
                  <div className="flex-1 w-full overflow-auto p-12 flex flex-col items-start justify-start">
                    <div className="min-h-min min-w-min bg-blue-500/5 p-8 rounded-[3rem] border border-blue-500/10">
                      <TeamRenderer team={team} settings={settings} layout={previewLayout} manifest={manifest} manifestAvatars={manifestAvatars} scale={0.65} />
                    </div>
                  </div>
                </div>
                <div className="h-20" /> 
              </main>
            </div>
          </div>
        } />
        <Route path="/obs" element={<ObsView manifest={manifest} manifestAvatars={manifestAvatars} />} />
      </Routes>
    </HashRouter>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
