import React, { useState, useEffect, useCallback, useMemo, useRef } from 'https://esm.sh/react@19.0.0';
import ReactDOM from 'https://esm.sh/react-dom@19.0.0/client';
import { HashRouter, Routes, Route, useLocation } from 'https://esm.sh/react-router-dom@7.1.3?deps=react@19.0.0';
import { 
  Image as ImageIcon, Search, ChevronDown, 
  Check, Zap, Link as LinkIcon, User, Eye, Send, RefreshCcw, Database, Sparkles, Trash2, Download, Upload, UserPlus, AlignVerticalJustifyStart, AlignVerticalJustifyEnd, Wifi,
  GripVertical, Layout
} from 'https://esm.sh/lucide-react@0.474.0?deps=react@19.0.0';

const PROTOCOL_VERSION = 'v6';
const REPO_OWNER = 'JouCoding';
const REPO_NAME = 'Coromon_Sprites-Skins';
const REPO_PATH = 'sprites';
const AVATAR_PATH = 'sprites_avatars';
const SPRITE_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${REPO_PATH}/`;
const AVATAR_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${AVATAR_PATH}/`;
const GITHUB_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${REPO_PATH}`;
const AVATAR_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${AVATAR_PATH}`;

const LOCAL_CHANNEL_NAME = 'coromon_hub_broadcast';

// Skin Mapping for better UX
const SKIN_MAP = {
  'd': 'Blue',
  'darkmagic': 'Crimsonite'
};

const REVERSE_SKIN_MAP = {
  'blue': 'd',
  'crimsonite': 'darkmagic'
};

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
  if (SKIN_MAP[skinLower]) {
    skin = SKIN_MAP[skinLower];
  } else if (skin !== 'Standard') {
    skin = skin.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  return { species, skin, potency, file: filename };
};

const parseAvatarFilename = (filename) => {
  const clean = filename.replace('.png', '').toLowerCase();
  const parts = clean.split('_');
  const species = parts[0];
  let potency = 'A';
  
  const pIdx = parts.findIndex(p => POTENCY_CODE_MAP[p]);
  if (pIdx !== -1) {
    potency = POTENCY_CODE_MAP[parts[pIdx]];
  }

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
  const potencyCode = member.potency.toLowerCase(); // a, b, c
  const check = (name) => avatarFiles.find(f => f.toLowerCase() === `${name.toLowerCase()}.png`);

  const isStandard = rawSkin === 'standard';

  // 1. Try Specific Skin Matches first to avoid falling back to standard species avatar
  if (!isStandard) {
    for (const skin of skinsToTry) {
      let match = null;
      // Pattern: species_potency_skin
      if (potencyWord) match = check(`${species}_${potencyWord}_${skin}`);
      if (!match) match = check(`${species}_${potencyCode}_${skin}`);
      // Pattern: species_skin (which is usually A potency for that skin)
      if (!match) match = check(`${species}_${skin}`);
      
      if (match) return `${AVATAR_BASE}${match}`;
    }
  }

  // 2. Try Standard/Potency Matches as fallback or if skin is Standard
  let match = null;
  if (potencyWord) match = check(`${species}_${potencyWord}`);
  if (!match) match = check(`${species}_${potencyCode}`);
  if (!match) match = check(species);
  
  if (match) return `${AVATAR_BASE}${match}`;

  // 3. Last resort fuzzy
  const fuzzy = avatarFiles.find(f => f.toLowerCase().startsWith(species));
  return fuzzy ? `${AVATAR_BASE}${fuzzy}` : null;
};

const getSpriteUrl = (member, manifest) => {
  if (!member.coromonName || !manifest) return null;
  const s = member.coromonName.toLowerCase();
  const sk = member.skin.toLowerCase();
  const p = member.potency;

  let match = manifest.find(m => m.species.toLowerCase() === s && m.skin.toLowerCase() === sk && m.potency === p);
  if (!match && sk !== 'standard') match = manifest.find(m => m.species.toLowerCase() === s && m.skin.toLowerCase() === sk);
  if (!match && p !== 'A') match = manifest.find(m => m.species.toLowerCase() === s && m.potency === p);
  if (!match) match = manifest.find(m => m.species.toLowerCase() === s);
  
  return match ? `${SPRITE_BASE}${match.file}` : null;
};

// --- PREVIEW RENDERER ---

const TeamRenderer = ({ team, settings, layout, manifest, manifestAvatars, scale = 1 }) => {
  const activeMembers = team.filter(m => m.isActive && m.coromonName);
  const gridTemplateColumns = useMemo(() => {
    if (layout === 'grid-2x3') return 'repeat(2, max-content)';
    if (layout === 'grid-3x2') return 'repeat(3, max-content)';
    return 'none';
  }, [layout]);

  const viewMode = settings.viewMode || 'sprites';
  const itemWidthHeight = (viewMode === 'avatars' ? 144 : 192) * scale;
  const scaledSpacingX = settings.spacingX * scale;
  const scaledSpacingY = settings.spacingY * scale;
  const scaledNameOffset = settings.nameOffset * scale;
  const scaledFontSize = 14 * scale; 
  const scaledPaddingX = 14 * scale;
  const scaledPaddingY = 10 * scale;

  const getContainerStyles = () => {
    const isGrid = layout.includes('grid');
    const isStack = layout === 'stack';
    let styles = {
      display: isGrid ? 'grid' : 'flex',
      flexDirection: isStack ? 'column' : 'row',
      gridTemplateColumns: gridTemplateColumns,
      gap: isGrid ? `${scaledSpacingY}px ${scaledSpacingX}px` : (isStack ? `${scaledSpacingY}px` : `${scaledSpacingX}px`),
      width: 'max-content',
      height: 'max-content',
      transition: 'gap 0.2s ease-out',
      justifyContent: 'flex-start',
      alignItems: 'flex-start'
    };
    return styles;
  };

  // Improved Glow Logic for OBS parity - layered drop shadows make it pop
  const glowValue = settings.glowIntensity || 0;
  const glowStyle = glowValue > 0 
    ? `drop-shadow(0 0 ${glowValue / 5}px rgba(255,255,255,${glowValue / 100})) drop-shadow(0 0 ${glowValue / 10}px rgba(255,255,255,0.8))` 
    : 'none';
    
  const namePos = settings.namePosition || 'below';

  return (
    <div style={getContainerStyles()}>
      {activeMembers.map((member) => {
        const imageUrl = viewMode === 'sprites' 
          ? getSpriteUrl(member, manifest)
          : getAvatarUrl(member, manifestAvatars);
        
        const nameElement = (
          <div 
            style={{ 
              marginTop: namePos === 'below' ? `${scaledNameOffset}px` : '0', 
              marginBottom: namePos === 'above' ? `${scaledNameOffset}px` : '0',
              padding: `${scaledPaddingY}px ${scaledPaddingX}px`, 
              borderRadius: `${4 * scale}px` 
            }} 
            className="bg-black/90 backdrop-blur-md border-2 border-white/20 shadow-2xl flex items-center justify-center shrink-0"
          >
            <span style={{ fontSize: `${scaledFontSize}px` }} className="font-pixel text-white uppercase leading-none whitespace-nowrap tracking-tighter">
              {member.nickname || member.coromonName}
            </span>
          </div>
        );

        return (
          <div key={member.id} className="flex flex-col items-center shrink-0">
            {namePos === 'above' && nameElement}
            <div 
              style={{ width: `${itemWidthHeight}px`, height: `${itemWidthHeight}px`, filter: glowStyle }} 
              className={`flex items-center justify-center transition-all duration-300`}
            >
              {imageUrl && (
                <img 
                  src={imageUrl} 
                  className={`max-w-full max-h-full pixelated ${viewMode === 'sprites' ? 'animate-bounce-soft' : 'scale-[3.0]'}`} 
                />
              )}
            </div>
            {namePos === 'below' && nameElement}
          </div>
        );
      })}
      {activeMembers.length === 0 && (
        <div className="text-gray-700 font-pixel text-[8px] uppercase tracking-widest animate-pulse">NO ACTIVE MEMBERS</div>
      )}
    </div>
  );
};

// --- OBS VIEW ---

const ObsView = ({ manifest, manifestAvatars }) => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const user = searchParams.get('u')?.toLowerCase() || 'unnamed';
  const layoutOverride = searchParams.get('l'); 
  const dataParam = searchParams.get('d'); 
  
  const [syncedData, setSyncedData] = useState(() => {
    if (dataParam) {
        try { return JSON.parse(atob(dataParam)); } catch(e) { return null; }
    }
    return null;
  });
  
  const lastTsRef = useRef(0);

  useEffect(() => {
    const localChannel = new BroadcastChannel(LOCAL_CHANNEL_NAME);
    localChannel.onmessage = (event) => {
        const { team, settings, user: msgUser, ts } = event.data;
        if (msgUser.toLowerCase() === user && ts > lastTsRef.current) {
            lastTsRef.current = ts;
            setSyncedData({ team, settings });
        }
    };
    return () => { localChannel.close(); };
  }, [user]);

  if (!syncedData) {
      return (
          <div className="fixed inset-0 bg-transparent flex flex-col items-center justify-center gap-4">
              <div className="w-16 h-16 rounded-full border-4 border-blue-600/20 border-t-blue-500 animate-spin" />
              <div className="text-center space-y-2">
                  <h1 className="text-white font-pixel text-[10px] uppercase animate-pulse">Waiting for Team Data...</h1>
                  <p className="text-blue-500/50 font-pixel text-[8px] uppercase tracking-widest">Channel: {user}</p>
              </div>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 overflow-hidden flex items-start justify-start p-10">
      <TeamRenderer 
        team={syncedData.team} 
        settings={syncedData.settings} 
        layout={layoutOverride || syncedData.settings.layoutMode || 'row'} 
        manifest={manifest} 
        manifestAvatars={manifestAvatars}
        scale={1}
      />
    </div>
  );
};

// --- CORE UI COMPONENTS ---

const TeamSlot = ({ member, idx, onUpdate, manifest, manifestAvatars, onDragStart, onDragOver, onDrop, onDragEnd, isDragging, viewMode }) => {
  const pMap = { Standard: 'A', Potent: 'B', Perfect: 'C', A: 'Standard', B: 'Potent', C: 'Perfect' };
  
  const prioritySort = (items, topValue) => {
    return [...items].sort((a, b) => {
      if (a === topValue) return -1;
      if (b === topValue) return 1;
      return a.localeCompare(b);
    });
  };

  const currentManifestAvatars = useMemo(() => {
     if (!manifestAvatars || !member.coromonName) return [];
     const s = member.coromonName.toLowerCase();
     return manifestAvatars.filter(f => f.toLowerCase().startsWith(s)).map(parseAvatarFilename);
  }, [manifestAvatars, member.coromonName]);

  const skins = useMemo(() => {
    if (!member.coromonName) return ['Standard'];
    const speciesLower = member.coromonName.toLowerCase();
    let foundSkins = new Set(['Standard']);

    if (viewMode === 'sprites' && manifest) {
      manifest.filter(m => m.species.toLowerCase() === speciesLower).forEach(m => foundSkins.add(m.skin));
    } else {
      currentManifestAvatars.forEach(m => foundSkins.add(m.skin));
    }
    
    return prioritySort(Array.from(foundSkins), 'Standard');
  }, [manifest, currentManifestAvatars, member.coromonName, viewMode]);

  const potencies = useMemo(() => {
    if (!member.coromonName) return ['A'];
    const speciesLower = member.coromonName.toLowerCase();
    const skinLower = member.skin.toLowerCase();
    let foundPotencies = new Set(['A']);

    if (viewMode === 'sprites' && manifest) {
      manifest.filter(m => m.species.toLowerCase() === speciesLower && m.skin.toLowerCase() === skinLower).forEach(m => foundPotencies.add(m.potency));
    } else {
      currentManifestAvatars.filter(m => m.skin.toLowerCase() === skinLower).forEach(m => foundPotencies.add(m.potency));
    }

    return prioritySort(Array.from(foundPotencies), 'A');
  }, [manifest, currentManifestAvatars, member.coromonName, member.skin, viewMode]);
  
  const preview = useMemo(() => {
    if (!member.coromonName) return null;
    return viewMode === 'sprites' 
      ? getSpriteUrl(member, manifest)
      : getAvatarUrl(member, manifestAvatars);
  }, [manifest, manifestAvatars, member.coromonName, member.skin, member.potency, viewMode]);

  return (
    <div 
      draggable="true"
      onDragStart={e => onDragStart(e, idx)}
      onDragOver={e => onDragOver(e, idx)}
      onDrop={e => onDrop(e, idx)}
      onDragEnd={onDragEnd}
      className={`p-6 rounded-[2.5rem] border transition-all cursor-default select-none group/slot ${isDragging ? 'opacity-30 scale-95 border-blue-500' : member.isActive ? 'bg-gray-900 border-blue-500/40 shadow-2xl' : 'bg-gray-950 border-gray-900 opacity-60'} hover:border-blue-400/50`}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="cursor-grab active:cursor-grabbing p-1 hover:bg-white/5 rounded-lg transition-colors text-gray-700 group-hover/slot:text-blue-500">
             <GripVertical size={18} />
          </div>
          <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">SLOT {idx + 1}</span>
        </div>
        <input type="checkbox" checked={member.isActive} onChange={e => onUpdate({ isActive: e.target.checked })} className="w-6 h-6 rounded-lg border-gray-800 bg-black text-blue-600 focus:ring-0 cursor-pointer" />
      </div>
      <div className="flex gap-6">
        <div className="w-32 h-32 bg-black rounded-3xl border border-gray-800 flex items-center justify-center shrink-0 overflow-hidden shadow-inner ring-1 ring-white/5">
          {member.coromonName ? (
            <img 
              src={preview} 
              className={`max-w-[85%] max-h-[85%] pixelated pointer-events-none transition-transform ${viewMode === 'avatars' ? 'scale-[3.0]' : ''}`} 
            />
          ) : (
            <ImageIcon className="opacity-5" size={32} />
          )}
        </div>
        <div className="flex-1 space-y-4">
          <SpeciesSelector manifest={manifest} manifestAvatars={manifestAvatars} viewMode={viewMode} value={member.coromonName} onChange={val => onUpdate({ coromonName: val, isActive: true, skin: 'Standard', potency: 'A' })} />
          <div className="grid grid-cols-2 gap-3">
            <select value={member.skin} disabled={!member.coromonName} onChange={e => onUpdate({ skin: e.target.value })} className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white uppercase outline-none focus:border-blue-500/50 appearance-none">
              {skins.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={pMap[member.potency]} disabled={!member.coromonName || potencies.length <= 1} onChange={e => onUpdate({ potency: pMap[e.target.value] })} className="w-full bg-black border border-gray-800 rounded-xl px-3 py-2.5 text-[10px] font-bold text-white uppercase outline-none focus:border-blue-500/50 appearance-none">
              {potencies.map(code => <option key={code} value={pMap[code]}>{pMap[code]}</option>)}
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
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef(null);
  const list = useMemo(() => manifest ? Array.from(new Set(manifest.map(m => m.species))).sort() : [], [manifest]);
  useEffect(() => { const h = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  
  return (
    <div className="relative" ref={wrapperRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="w-full bg-black border border-gray-800 rounded-xl px-4 py-3 text-[12px] font-bold text-white flex justify-between items-center cursor-pointer shadow-inner hover:border-gray-600 transition-all">
        <span className={value ? 'text-white truncate' : 'text-gray-600 truncate'}>{value || 'Select Coromon...'}</span>
        <ChevronDown size={16} className={isOpen ? 'rotate-180 text-blue-500' : 'text-gray-700'} />
      </div>
      {isOpen && (
        <div className="absolute z-[100] mt-1 w-full bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="p-4 border-b border-gray-800 bg-black flex items-center gap-3 text-gray-500 focus-within:text-blue-500"><Search size={16} /><input autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="bg-transparent border-none text-[12px] text-white w-full outline-none font-bold" /></div>
          <div className="max-h-72 overflow-y-auto custom-scrollbar">
            {list.filter(s => s.toLowerCase().includes(searchTerm.toLowerCase())).map(s => {
              const dummyMember = { coromonName: s, skin: 'Standard', potency: 'A' };
              const iconUrl = viewMode === 'sprites' 
                ? getSpriteUrl(dummyMember, manifest)
                : getAvatarUrl(dummyMember, manifestAvatars);

              return (
                <div key={s} onClick={() => { onChange(s); setIsOpen(false); }} className="flex items-center gap-4 px-5 py-3 hover:bg-blue-600/30 cursor-pointer border-b border-white/5 group">
                  <div className="w-10 h-10 flex items-center justify-center shrink-0 overflow-hidden bg-black/40 rounded-lg">
                    {iconUrl && <img src={iconUrl} className={`max-w-full max-h-full pixelated object-contain ${viewMode === 'avatars' ? 'w-[23px] h-[23px]' : 'scale-[0.8]'}`} />}
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

// --- DASHBOARD ---

const App = () => {
  const [userName, setUserName] = useState(() => safeStorage.get('coromon-username') || 'trainer-' + Math.random().toString(36).substring(7));
  
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
    return saved ? JSON.parse(saved) : { layoutMode: 'row', spacingX: 32, spacingY: 32, nameOffset: 8, liveSync: true, glowIntensity: 50, namePosition: 'below', viewMode: 'sprites' };
  });

  const [manifest, setManifest] = useState(null);
  const [manifestAvatars, setManifestAvatars] = useState([]);
  const [previewLayout, setPreviewLayout] = useState('row');
  
  const localChannelRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { localChannelRef.current = new BroadcastChannel(LOCAL_CHANNEL_NAME); return () => localChannelRef.current?.close(); }, []);

  const broadcastChanges = useCallback(() => {
    localChannelRef.current?.postMessage({ team, settings, user: userName, ts: Date.now() });
  }, [team, settings, userName]);

  useEffect(() => {
    safeStorage.set('coromon-profiles-v2', JSON.stringify(profiles));
    safeStorage.set('coromon-active-profile', activeProfileId);
    safeStorage.set('coromon-settings-v2', JSON.stringify(settings));
    safeStorage.set('coromon-username', userName);
    broadcastChanges();
  }, [profiles, activeProfileId, settings, userName, broadcastChanges]);

  useEffect(() => { 
    fetch(GITHUB_API)
      .then(r => r.json())
      .then(data => { 
        if (Array.isArray(data)) {
          setManifest(
            data
              .filter(i => i.name.endsWith('.gif'))
              .map(i => parseSpriteFilename(i.name))
          ); 
        }
      })
      .catch(() => {});

    fetch(AVATAR_API)
      .then(r => r.json())
      .then(data => { 
        if (Array.isArray(data)) {
          const avatars = data.filter(i => i.name.endsWith('.png')).map(i => i.name);
          setManifestAvatars(avatars);
        }
      })
      .catch(() => {});
  }, []);

  const getLayoutLink = (layout) => {
    const base = window.location.href.split('#')[0].split('?')[0];
    const u = userName || 'unnamed';
    const data = btoa(JSON.stringify({ team, settings }));
    return `${base}#/obs?u=${u}&l=${layout}&d=${data}`;
  };

  const updateSlot = (idx, up) => {
    const newProfiles = profiles.map(p => {
      if (p.id !== activeProfileId) return p;
      let nt = [...p.team];
      nt[idx] = { ...nt[idx], ...up };
      if (Object.prototype.hasOwnProperty.call(up, 'coromonName')) {
        const filled = nt.filter(m => m.coromonName !== '');
        nt = [...filled, ...Array.from({ length: 6 - filled.length }, () => ({ id: Math.random().toString(36).substring(7), coromonName: '', nickname: '', potency: 'A', skin: 'Standard', isActive: true }))];
      }
      return { ...p, team: nt };
    });
    setProfiles(newProfiles);
  };

  const handleDragStart = (e, index) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => { e.preventDefault(); };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;
    const newProfiles = profiles.map(p => {
      if (p.id !== activeProfileId) return p;
      const newTeam = [...p.team];
      const itemToMove = newTeam[draggedIdx];
      newTeam.splice(draggedIdx, 1);
      newTeam.splice(index, 0, itemToMove);
      return { ...p, team: newTeam };
    });
    setProfiles(newProfiles);
    setDraggedIdx(null);
  };

  const createProfile = () => {
    const name = prompt('Profile Name?');
    if (!name) return;
    const id = Math.random().toString(36).substring(7);
    const newProfile = { id, name, team: createEmptyTeam() };
    setProfiles([...profiles, newProfile]);
    setActiveProfileId(id);
  };

  const deleteProfile = () => {
    if (profiles.length <= 1) return alert("Cannot delete the only profile!");
    if (!confirm(`Delete "${activeProfile.name}"?`)) return;
    const newProfiles = profiles.filter(p => p.id !== activeProfileId);
    setProfiles(newProfiles);
    setActiveProfileId(newProfiles[0].id);
  };

  const exportProfile = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeProfile));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${activeProfile.name}_profile.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const importProfile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (re) => {
      try {
        const imported = JSON.parse(re.target.result);
        if (!imported.team) throw new Error();
        imported.id = Math.random().toString(36).substring(7);
        setProfiles([...profiles, imported]);
        setActiveProfileId(imported.id);
      } catch(e) { alert("Invalid profile file!"); }
    };
    reader.readAsText(file);
  };

  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={
          <div className="h-screen flex flex-col bg-[#020617] text-gray-100 overflow-hidden">
            <nav className="bg-gray-950/90 backdrop-blur-2xl border-b border-gray-800 px-10 py-5 flex items-center justify-between z-[100] shadow-2xl">
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-900/40" style={{ transform: 'rotate(-5deg)' }}>
                  <Zap size={26} className="text-white fill-current" />
                </div>
                <div>
                  <h1 className="text-base font-black uppercase tracking-[0.4em] text-white italic">Coromon Team Display</h1>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className={`flex items-center gap-3 bg-gray-900 border px-5 py-2.5 rounded-2xl transition-all border-gray-800 focus-within:border-blue-500`}>
                  <User size={16} className="text-gray-500" />
                  <input type="text" placeholder="Trainer Nickname..." value={userName} onChange={e => setUserName(e.target.value)} className="bg-transparent border-none outline-none text-[11px] font-black uppercase tracking-widest w-40 text-white placeholder-gray-700" />
                  <button onClick={() => setUserName('trainer-' + Math.random().toString(36).substring(7))} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-gray-600 hover:text-blue-500" title="Rotate Channel">
                    <RefreshCcw size={12} />
                  </button>
                </div>
              </div>
            </nav>

            <div className="flex-1 flex overflow-hidden">
              <aside className="w-[30rem] bg-gray-950/50 border-r border-gray-800/40 p-8 flex flex-col gap-10 overflow-y-auto custom-scrollbar">
                <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-[2.5rem]">
                  <p className="text-[10px] text-blue-400 font-bold uppercase italic text-center leading-relaxed">
                    Changes sync instantly via BroadcastChannel if dashboard is open in another tab!
                  </p>
                </div>

                <div className="space-y-6">
                  <h2 className="text-[11px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-3">
                    <User size={14} className="text-blue-500" /> Profiles
                  </h2>
                  <div className="bg-gray-900/40 border border-gray-800 rounded-[2.5rem] p-6 space-y-6">
                    <div className="relative">
                      <select 
                        value={activeProfileId} 
                        onChange={(e) => setActiveProfileId(e.target.value)}
                        className="w-full bg-black border border-gray-800 rounded-2xl px-5 py-3 text-[12px] font-bold text-white uppercase outline-none focus:border-blue-500 appearance-none shadow-inner"
                      >
                        {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <ChevronDown size={14} className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button onClick={createProfile} className="flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                        <UserPlus size={14} /> New
                      </button>
                      <button onClick={deleteProfile} className="flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                        <Trash2 size={14} /> Delete
                      </button>
                      <button onClick={exportProfile} className="flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                        <Download size={14} /> Export
                      </button>
                      <button onClick={() => fileInputRef.current.click()} className="flex items-center justify-center gap-2 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                        <Upload size={14} /> Import
                      </button>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={importProfile} className="hidden" accept=".json" />
                  </div>
                </div>

                <div className="space-y-6">
                  <h2 className="text-[11px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-3">
                    <LinkIcon size={14} className="text-blue-500" /> Overlay Links
                  </h2>
                  <div className="grid grid-cols-1 gap-4">
                    {['row', 'stack', 'grid-2x3', 'grid-3x2'].map(l => (
                      <div key={l} className="group flex flex-col gap-3 p-5 bg-gray-900/40 border border-gray-800 rounded-[2.5rem] hover:border-blue-500/30 transition-all">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 group-hover:text-blue-400 transition-colors">
                          {l.replace('-', ' ')}
                        </span>
                        <button 
                          onClick={() => { navigator.clipboard.writeText(getLayoutLink(l)); alert(`Overlay Link Copied!`); }} 
                          className="w-full flex items-center justify-center gap-2 py-3 bg-gray-800 hover:bg-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                        >
                          <Database size={14} /> Copy OBS Browser Source Link
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-8">
                  <h2 className="text-[11px] font-black uppercase text-gray-500 tracking-widest flex items-center gap-3">
                    <Sparkles size={14} className="text-blue-500" /> Visual Styles
                  </h2>
                  <div className="space-y-8 px-1">
                    <div className="space-y-3">
                        <div className="flex justify-between text-[9px] font-black text-gray-600 uppercase tracking-widest">
                          <span>Name Position</span>
                          <span className="text-blue-500 uppercase">{settings.namePosition}</span>
                        </div>
                        <div className="flex gap-2 p-1 bg-gray-900/40 border border-gray-800 rounded-xl">
                          <button onClick={() => setSettings({...settings, namePosition: 'above'})} className={`flex-1 py-2 flex items-center justify-center gap-2 rounded-lg transition-all ${settings.namePosition === 'above' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                            <AlignVerticalJustifyStart size={12} /> <span className="text-[8px] font-black uppercase">Above</span>
                          </button>
                          <button onClick={() => setSettings({...settings, namePosition: 'below'})} className={`flex-1 py-2 flex items-center justify-center gap-2 rounded-lg transition-all ${settings.namePosition === 'below' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                            <AlignVerticalJustifyEnd size={12} /> <span className="text-[8px] font-black uppercase">Below</span>
                          </button>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <div className="flex justify-between text-[9px] font-black text-gray-600 uppercase tracking-widest">
                          <span>Coromon Glow</span>
                          <span className="text-blue-500">{settings.glowIntensity}%</span>
                        </div>
                        <input type="range" min="0" max="100" value={settings.glowIntensity} onChange={e => setSettings({ ...settings, glowIntensity: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-blue-600 cursor-pointer" />
                    </div>
                    {[ ['Spacing X', 'spacingX', 400], ['Spacing Y', 'spacingY', 400], ['Name Offset', 'nameOffset', 100] ].map(([label, key, max]) => (
                      <div key={key} className="space-y-3">
                        <div className="flex justify-between text-[9px] font-black text-gray-600 uppercase tracking-widest">
                          <span>{label}</span>
                          <span className="text-blue-500">{settings[key]}px</span>
                        </div>
                        <input type="range" min={key === 'nameOffset' ? -50 : 0} max={max} value={settings[key]} onChange={e => setSettings({ ...settings, [key]: parseInt(e.target.value) })} className="w-full h-1.5 bg-gray-800 rounded-full appearance-none accent-blue-600 cursor-pointer" />
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <main className="flex-1 flex flex-col bg-black overflow-y-auto custom-scrollbar">
                <div className="p-10 bg-gray-950/20">
                   <div className="flex items-center gap-8 mb-8">
                      <h2 className="text-[11px] font-black uppercase text-gray-500 tracking-[0.3em] flex-1 flex items-center gap-4">
                        <div className="h-px flex-1 bg-gray-900" /> TEAM COMPOSITION <div className="h-px flex-1 bg-gray-900" />
                      </h2>
                      <div className="flex bg-gray-900 rounded-2xl p-1 border border-gray-800 shadow-2xl">
                        <button 
                          onClick={() => setSettings({...settings, viewMode: 'sprites'})}
                          className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${settings.viewMode === 'sprites' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-500 hover:text-gray-400'}`}
                        >
                          Sprites
                        </button>
                        <button 
                          onClick={() => setSettings({...settings, viewMode: 'avatars'})}
                          className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase transition-all ${settings.viewMode === 'avatars' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-500 hover:text-gray-400'}`}
                        >
                          Avatars
                        </button>
                      </div>
                   </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8">
                    {team.map((m, idx) => ( 
                      <TeamSlot 
                        key={m.id} 
                        member={m} 
                        idx={idx} 
                        manifest={manifest} 
                        manifestAvatars={manifestAvatars}
                        onUpdate={up => updateSlot(idx, up)}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onDragEnd={() => setDraggedIdx(null)}
                        isDragging={draggedIdx === idx}
                        viewMode={settings.viewMode}
                      /> 
                    ))}
                  </div>
                </div>

                <div className="min-h-[600px] border-t border-gray-800/60 bg-[#020617] relative group overflow-hidden flex flex-col">
                  <div className="absolute top-6 left-6 z-10 flex items-center gap-4">
                    <div className="bg-black/80 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-3 shadow-2xl text-[10px] font-black uppercase tracking-widest text-white">
                      <Eye size={14} className="text-blue-500" /> Real-time Preview
                    </div>
                    <div className="flex gap-2 p-1 bg-black/60 backdrop-blur-md rounded-xl border border-white/5 shadow-2xl">
                      {['row', 'stack', 'grid-2x3', 'grid-3x2'].map(l => (
                        <button key={l} onClick={() => setPreviewLayout(l)} className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${previewLayout === l ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-gray-500 hover:text-gray-300'}`}>
                          {l.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={`flex-1 w-full overflow-auto custom-scrollbar p-12 flex flex-col items-start justify-start`}>
                    <div className="min-h-min min-w-min bg-blue-500/5 p-8 rounded-[3rem] border border-blue-500/10">
                      <TeamRenderer 
                        team={team} 
                        settings={settings} 
                        layout={previewLayout} 
                        manifest={manifest} 
                        manifestAvatars={manifestAvatars}
                        scale={0.65} 
                      />
                    </div>
                  </div>
                  <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
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
