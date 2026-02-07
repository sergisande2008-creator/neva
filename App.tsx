
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Category, MenuItem, CartItem, Order } from './types';
import { MENU_ITEMS, CATEGORIES } from './constants';

// --- Funciones de Utilidad para Audio (Base64) ---
function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) { binary += String.fromCharCode(bytes[i]); }
  return btoa(binary);
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
  return bytes;
}

async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const WEBHOOKS = {
  CREATED: 'https://n8n-nevada-n8n.rjsdsx.easypanel.host/webhook/397935c2-1cde-4281-89ae-68ed6c39c4a8',
  ACCEPTED: 'https://n8n-nevada-n8n.rjsdsx.easypanel.host/webhook/59bf7612-fcb4-4d78-a4b5-657048b2b48f',
  DELIVERED: 'https://n8n-nevada-n8n.rjsdsx.easypanel.host/webhook/51d0a199-d465-4481-90bf-4dfc99793c4h'
};

export default function App() {
  const [view, setView] = useState<'landing' | 'table-select' | 'diners' | 'diners-app' | 'kds'>('landing');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [dinersCount, setDinersCount] = useState<number>(2);
  const [activeTab, setActiveTab] = useState<'comanda' | 'carta'>('comanda');
  const [selectedCategory, setSelectedCategory] = useState<Category>("Todos");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentTime, setCurrentTime] = useState('');

  // Estados para Ramiro
  const [isRamiroActive, setIsRamiroActive] = useState(false);
  const [ramiroText, setRamiroText] = useState('Pulse para hablar con Ramiro');
  
  const cartRef = useRef(cart);
  useEffect(() => { cartRef.current = cart; }, [cart]);

  // Refs para Audio Live API
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const currentOutputTranscriptionRef = useRef('');

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })), 1000);
    return () => clearInterval(t);
  }, []);

  // --- Lógica de Pedidos ---
  const triggerWebhook = useCallback(async (order: Order, type: keyof typeof WEBHOOKS) => {
    const payload = {
      Numero_Pedido: order.id,
      Numero_Mesa: order.table,
      Pedido: order.items.map(i => `${i.quantity}x ${i.menuItem.name}`).join(', '),
      Hora_Pedido: order.timestamp,
      Hora_Aceptado: order.acceptedAt || '',
      Hora_Entrega: order.deliveredAt || '',
      Estado: order.status,
      Notas_especiales: order.items.map(i => i.note || '').filter(n => n).join(' | '),
      Comensales: order.diners,
      Total_Pedido: `${order.total.toFixed(2)}€`
    };
    try {
      await fetch(WEBHOOKS[type], { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) });
    } catch (e) { console.error(e); }
  }, []);

  const confirmOrder = useCallback(async () => {
    if (cartRef.current.length === 0) return;
    const order: Order = {
      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
      table: selectedTable,
      items: [...cartRef.current],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'Nuevo',
      total: cartRef.current.reduce((a, c) => a + c.menuItem.price * c.quantity, 0),
      diners: dinersCount
    };
    setOrders(prev => [order, ...prev]);
    setCart([]);
    triggerWebhook(order, 'CREATED');
  }, [selectedTable, dinersCount, triggerWebhook]);

  const updateStatus = (id: string) => {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setOrders(prev => prev.map(o => {
      if (o.id === id) {
        if (o.status === 'Nuevo') {
          const updated = { ...o, status: 'Cocinando' as const, acceptedAt: now };
          triggerWebhook(updated, 'ACCEPTED');
          return updated;
        }
        if (o.status === 'Cocinando') {
          const updated = { ...o, status: 'Completado' as const, deliveredAt: now };
          triggerWebhook(updated, 'DELIVERED');
          return updated;
        }
      }
      return o;
    }));
  };

  // --- Lógica de Ramiro (Gemini Live) ---
  const stopRamiro = () => {
    setIsRamiroActive(false);
    setRamiroText('Pulse para hablar con Ramiro');
    if (audioContextRef.current) audioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    for (const s of sourcesRef.current) s.stop();
    sourcesRef.current.clear();
  };

  const startRamiro = async () => {
    setIsRamiroActive(true);
    setRamiroText('Ramiro está escuchando...');
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const sessionPromise = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      callbacks: {
        onopen: () => {
          const source = audioContextRef.current!.createMediaStreamSource(stream);
          const scriptProcessor = audioContextRef.current!.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) { int16[i] = inputData[i] * 32768; }
            const pcmBlob = { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
            sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(audioContextRef.current!.destination);
        },
        onmessage: async (message: LiveServerMessage) => {
          // Procesar Transcripción para detectar [COMANDA_JSON]
          if (message.serverContent?.outputTranscription) {
            currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
            if (currentOutputTranscriptionRef.current.includes('[/COMANDA_JSON]')) {
              const match = currentOutputTranscriptionRef.current.match(/\[COMANDA_JSON\]([\s\S]*?)\[\/COMANDA_JSON\]/);
              if (match) {
                try {
                  const data = JSON.parse(match[1]);
                  if (data.items) {
                    setCart(prev => {
                      let updated = [...prev];
                      data.items.forEach((item: any) => {
                        const menuMatch = MENU_ITEMS.find(m => m.name.toLowerCase().includes(item.producto.toLowerCase()));
                        if (!menuMatch) return;
                        
                        const isRemoval = item.accion === 'quitar' || item.status === 'eliminado' || item.status === 'quitar';
                        const quantity = item.cantidad || 1;
                        const existingIdx = updated.findIndex(u => u.menuItem.id === menuMatch.id);

                        if (isRemoval) {
                          if (existingIdx !== -1) {
                            updated[existingIdx].quantity -= quantity;
                            if (updated[existingIdx].quantity <= 0) updated.splice(existingIdx, 1);
                          }
                        } else {
                          if (existingIdx !== -1) updated[existingIdx].quantity += quantity;
                          else updated.push({ menuItem: menuMatch, quantity, note: item.notas });
                        }
                      });
                      return updated;
                    });
                  }
                  if (data.confirmar_pedido_final === true) {
                    confirmOrder();
                  }
                } catch (e) { console.error("Error parsing Ramiro JSON", e); }
                currentOutputTranscriptionRef.current = '';
              }
            }
          }

          // Procesar Audio de Salida
          const audioBase64 = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audioBase64 && outputAudioContextRef.current) {
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
            const buffer = await decodeAudioData(decode(audioBase64), outputAudioContextRef.current, 24000, 1);
            const source = outputAudioContextRef.current.createBufferSource();
            source.buffer = buffer;
            source.connect(outputAudioContextRef.current.destination);
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
            sourcesRef.current.add(source);
            source.onended = () => sourcesRef.current.delete(source);
          }

          if (message.serverContent?.interrupted) {
            for (const s of sourcesRef.current) s.stop();
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          }
        },
        onclose: () => stopRamiro(),
        onerror: (e) => { console.error(e); stopRamiro(); }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } },
        systemInstruction: `
          ### ROL
          Eres "RAMIRO", un asistente inteligente de toma de pedidos para el restaurante NEVADA. Tu objetivo es ser amable, rápido y extremadamente preciso al gestionar la carta y las comandas.

          ### CONTEXTO OPERATIVO
          - Interactúas con clientes en dispositivos móviles.
          - Tu salida de voz debe ser natural y breve (menos de 20 segundos).
          - Debes sincronizar cada pedido con el sistema mediante bloques JSON.

          ### REGLAS DE LA CARTA
          1. Verifica siempre en la carta: ${JSON.stringify(MENU_ITEMS)}.
          2. Si piden algo que no está, ofrece una alternativa similar de forma persuasiva.
          3. Pregunta opciones (término de carne, tamaño bebida) antes de cerrar.

          ### PROTOCOLO DE COMANDA (Output Estructurado)
          Cada vez que el cliente confirme, agregue, quite algo o quiera finalizar el pedido, genera este bloque al final:
          [COMANDA_JSON]
          {
            "status": "confirmado",
            "items": [
              {"producto": "Nombre exacto", "cantidad": 1, "accion": "agregar" | "quitar", "notas": "opcional"}
            ],
            "confirmar_pedido_final": true | false
          }
          [/COMANDA_JSON]

          ### TONO Y ESTILO
          - Saludo: "¡Hola! Bienvenido a Nevada. ¿Qué le gustaría probar hoy?"
          - Confirmación: "¿Entonces marchamos [plato]? ¿Correcto?"
          - Finalización: "¡Perfecto! Tu pedido ya está en cocina."
        `
      }
    });
  };

  // --- Vistas ---

  if (view === 'landing') return (
    <div className="h-full bg-[#000814] flex flex-col items-center justify-center px-8 text-center">
        <div className="mb-8 p-4 rounded-[2.5rem] bg-gradient-to-b from-[#051125] to-[#000814] shadow-[0_0_60px_rgba(0,71,255,0.1)]">
            <img src="https://v3b.fal.media/files/b/tiger/qez6Lf9wm8CQAm5vABT7p.jpg" className="w-32 rounded-2xl" />
        </div>
        <h1 className="font-serif text-3xl text-white mb-2 font-black italic">Nevada</h1>
        <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.4em] mb-12">Automations</p>
        <div className="w-full space-y-3 max-w-[260px]">
            <button onClick={() => setView('table-select')} className="btn-primary">Entrar</button>
            <button onClick={() => setView('kds')} className="btn-secondary">Cocina</button>
        </div>
    </div>
  );

  if (view === 'table-select') return (
    <div className="h-full bg-white flex flex-col items-center justify-center p-8 text-center">
        <button onClick={() => setView('landing')} className="absolute top-10 left-6 text-gray-200 text-xl"><i className="fas fa-chevron-left"></i></button>
        <h2 className="font-serif text-4xl font-black mb-1">Mesa</h2>
        <p className="text-[#0047FF] font-black text-[9px] uppercase tracking-[0.2em] mb-12 italic">Seleccione Ubicación</p>
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
            {["01", "02", "03", "04"].map(t => (
                <button key={t} onClick={() => { setSelectedTable(t); setView('diners'); }} className="aspect-square bg-[#fafafa] rounded-[1.75rem] flex flex-col items-center justify-center border border-gray-100 shadow-sm active:scale-95 transition-standard">
                    <span className="text-[8px] font-black uppercase text-gray-300 mb-1 tracking-widest">Nº</span>
                    <span className="text-5xl font-black text-black leading-none">{t}</span>
                </button>
            ))}
        </div>
    </div>
  );

  if (view === 'diners') return (
    <div className="h-full bg-white flex flex-col items-center justify-center p-8 text-center">
        <button onClick={() => setView('table-select')} className="absolute top-10 left-6 text-gray-200 text-xl"><i className="fas fa-chevron-left"></i></button>
        <h2 className="font-serif text-4xl font-black mb-1">Invitados</h2>
        <p className="text-[#0047FF] font-black text-[9px] uppercase tracking-[0.2em] mb-16 italic">Mesa {selectedTable}</p>
        <div className="flex items-center gap-6 mb-20">
            <button onClick={() => setDinersCount(Math.max(1, dinersCount-1))} className="w-12 h-12 rounded-full border border-gray-100 flex items-center justify-center text-xl text-gray-300 active:bg-gray-50"><i className="fas fa-minus"></i></button>
            <span className="text-8xl font-black leading-none text-black tracking-tighter w-24">{dinersCount}</span>
            <button onClick={() => setDinersCount(dinersCount+1)} className="w-12 h-12 rounded-full border border-gray-100 flex items-center justify-center text-xl text-gray-300 active:bg-gray-50"><i className="fas fa-plus"></i></button>
        </div>
        <button onClick={() => setView('diners-app')} className="btn-secondary !bg-black !py-4.5 !max-w-[240px]">
            Empezar
        </button>
    </div>
  );

  if (view === 'kds') return (
    <div className="h-full bg-black flex flex-col text-white">
        <header className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-[#050505]">
            <button onClick={() => setView('landing')} className="text-gray-400 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest">
                <i className="fas fa-arrow-left"></i> Salir
            </button>
            <span className="font-mono text-[10px] opacity-40 tracking-widest">{currentTime}</span>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {orders.filter(o => o.status !== 'Completado').length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-5">
                    <i className="fas fa-utensils text-4xl mb-4"></i>
                    <p className="text-[9px] uppercase font-black tracking-[0.4em]">Sin comandas</p>
                </div>
            ) : (
                orders.filter(o => o.status !== 'Completado').map(o => (
                    <div key={o.id} className="bg-[#0a0a0a] rounded-[1.5rem] border border-white/5 overflow-hidden shadow-2xl">
                        <div className="p-5 bg-[#111] flex justify-between items-center border-b border-white/5">
                            <h2 className="text-2xl font-black italic">Mesa {o.table}</h2>
                            <span className="text-gray-600 font-mono text-[9px] uppercase">{o.timestamp}</span>
                        </div>
                        <div className="p-5 space-y-3">
                            {o.items.map((it, idx) => (
                                <div key={idx} className="flex gap-4 items-center">
                                    <span className="text-blue-600 font-black text-lg leading-none">{it.quantity}x</span>
                                    <p className="text-sm font-bold uppercase tracking-tight text-gray-200">{it.menuItem.name}</p>
                                </div>
                            ))}
                        </div>
                        <div className="px-5 pb-5">
                            <button onClick={() => updateStatus(o.id)} className="w-full py-3 bg-white text-black rounded-lg font-black text-[9px] uppercase tracking-widest active:bg-blue-600 active:text-white transition-standard">
                                {o.status === 'Nuevo' ? 'Confirmar' : 'Entregar'}
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      <header className="px-6 pt-12 pb-6 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-20">
        <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-black rounded-xl overflow-hidden shadow-xl border border-gray-100 shrink-0">
                <img src="https://v3b.fal.media/files/b/tiger/qez6Lf9wm8CQAm5vABT7p.jpg" className="w-full h-full object-cover" />
            </div>
            <div>
                <h1 className="font-black text-xl uppercase leading-none tracking-tighter mb-0.5">Nevada</h1>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                    Mesa {selectedTable}
                  </span>
                  <span className="opacity-20 text-[10px] text-gray-400">•</span>
                  <span className="text-blue-600 font-black text-[10px] uppercase tracking-widest">{dinersCount} Pax</span>
                </div>
            </div>
        </div>
        <button onClick={() => setView('landing')} className="w-11 h-11 rounded-full bg-[#fcfcfc] flex items-center justify-center text-gray-200 text-lg shadow-sm active:scale-95 transition-standard border border-gray-50"><i className="fas fa-home"></i></button>
      </header>

      <div className="px-6 py-4 flex gap-3 bg-gray-50/50">
        <button onClick={() => setActiveTab('comanda')} className={`flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-standard ${activeTab === 'comanda' ? 'bg-white shadow-premium text-black' : 'text-gray-300'}`}>Mi Comanda</button>
        <button onClick={() => setActiveTab('carta')} className={`flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-standard ${activeTab === 'carta' ? 'bg-white shadow-premium text-black' : 'text-gray-300'}`}>La Carta</button>
      </div>

      <main className="flex-1 overflow-y-auto px-6 pb-24 no-scrollbar">
        {/* ASISTENTE DE VOZ RAMIRO */}
        <div className="py-4">
            <div className={`relative overflow-hidden bg-gradient-to-br ${isRamiroActive ? 'from-blue-600 to-blue-900' : 'from-gray-900 to-black'} rounded-[2.5rem] p-7 shadow-2xl transition-all duration-500 border border-white/10`}>
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-4">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${isRamiroActive ? 'bg-white/20 scale-110 shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-white/5'}`}>
                            <i className={`fas fa-microphone-alt ${isRamiroActive ? 'text-white' : 'text-blue-500'} text-2xl`}></i>
                        </div>
                        <div>
                            <h4 className="text-white font-black text-[11px] uppercase tracking-[0.3em]">Asistente Ramiro</h4>
                            <p className="text-white/40 text-[9px] font-black uppercase tracking-widest">{isRamiroActive ? 'Servicio Activo' : 'Pulse para iniciar'}</p>
                        </div>
                    </div>
                    {isRamiroActive && (
                        <div className="flex gap-1.5 items-end h-8">
                            {[1,2,3,4,5].map(i => (
                                <div key={i} className={`w-1.5 bg-blue-400 rounded-full animate-bounce`} style={{ height: `${20 + Math.random()*60}%`, animationDuration: `${0.5 + Math.random()}s` }}></div>
                            ))}
                        </div>
                    )}
                </div>
                
                <p className="text-white text-[13px] font-medium mb-8 leading-relaxed italic opacity-80 h-10 flex items-center line-clamp-2">
                    "{ramiroText}"
                </p>

                <button 
                  onClick={isRamiroActive ? stopRamiro : startRamiro}
                  className={`w-full py-5 ${isRamiroActive ? 'bg-white/10 text-white border border-white/20' : 'bg-blue-600 text-white'} rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] transition-all active:scale-95 shadow-xl flex items-center justify-center gap-3`}
                >
                    {isRamiroActive ? 'Finalizar Sesión' : 'Pedir con Ramiro'}
                </button>
            </div>
        </div>

        {activeTab === 'comanda' ? (
            <div className="py-2">
                <div className="bg-white rounded-[1.75rem] border border-gray-50 shadow-premium p-6 text-center">
                    <h3 className="font-serif text-3xl font-black mb-1 leading-none">Mi Pedido</h3>
                    <p className="text-[9px] text-blue-600 font-black uppercase tracking-[0.2em] mb-8 italic">Detalles de la comanda</p>
                    
                    {cart.length === 0 ? (
                        <div className="py-12 flex flex-col items-center opacity-10">
                            <img src="https://v3b.fal.media/files/b/tiger/qez6Lf9wm8CQAm5vABT7p.jpg" className="w-16 grayscale mb-3" />
                            <p className="text-[10px] uppercase font-black tracking-[0.3em]">Cesta Vacía</p>
                        </div>
                    ) : (
                        <div className="space-y-4 text-left">
                            <div className="max-h-[340px] overflow-y-auto no-scrollbar pr-1">
                                {cart.map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center border-b border-gray-50 py-4 last:border-0">
                                        <div className="flex gap-4 items-center">
                                            <span className="text-blue-600 font-black text-2xl">x{item.quantity}</span>
                                            <p className="text-[14px] font-black uppercase tracking-tight text-gray-800 truncate max-w-[160px]">{item.menuItem.name}</p>
                                        </div>
                                        <button onClick={() => setCart(prev => prev.filter((_, i) => i !== idx))} className="text-gray-200 active:text-red-500 transition-standard p-2"><i className="fas fa-times-circle text-2xl"></i></button>
                                    </div>
                                ))}
                            </div>
                            <div className="pt-6 flex justify-between items-center border-t border-gray-100">
                                <div className="flex flex-col">
                                    <span className="text-[10px] text-gray-300 font-black uppercase tracking-widest mb-0.5">Total</span>
                                    <span className="text-3xl font-black tracking-tighter leading-none">{cart.reduce((a,c)=>a+c.menuItem.price*c.quantity, 0).toFixed(2)}€</span>
                                </div>
                                <button onClick={confirmOrder} className="bg-black text-white px-10 py-4 rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-standard shadow-lg">Enviar</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        ) : (
            <div className="space-y-4 pt-5">
                <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
                    {CATEGORIES.map(c => (
                        <button key={c} onClick={() => setSelectedCategory(c)} className={`px-6 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-standard whitespace-nowrap ${selectedCategory === c ? 'bg-black text-white shadow-md scale-105' : 'bg-white text-gray-300 border border-gray-100 shadow-sm'}`}>
                            {c}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-1 gap-3.5">
                    {MENU_ITEMS.filter(i => selectedCategory === "Todos" || i.category === selectedCategory).map(item => (
                        <div key={item.id} className="card-menu flex gap-4 items-center active:bg-gray-50 transition-standard">
                            <div className="w-20 h-20 rounded-xl overflow-hidden shadow-sm shrink-0 border border-gray-50">
                                <img src={item.image} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 py-0.5 flex flex-col justify-between min-w-0">
                                <div className="mb-1">
                                    <h3 className="text-[13px] font-black uppercase mb-0.5 text-gray-900 truncate">{item.name}</h3>
                                    <p className="text-[9px] text-gray-400 font-medium line-clamp-1 italic leading-tight">{item.description}</p>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-lg font-black text-black tracking-tight">{item.price.toFixed(2)}€</span>
                                    <button 
                                        onClick={() => setCart(prev => {
                                            const ex = prev.find(p => p.menuItem.id === item.id);
                                            if (ex) return prev.map(p => p.menuItem.id === item.id ? {...p, quantity: p.quantity+1} : p);
                                            return [...prev, { menuItem: item, quantity: 1 }];
                                        })} 
                                        className="w-10 h-10 rounded-lg bg-[#fcfcfc] flex items-center justify-center text-gray-300 active:bg-black active:text-white transition-standard border border-gray-100 shadow-sm"
                                    >
                                        <i className="fas fa-plus text-[12px]"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
      </main>
    </div>
  );
}
