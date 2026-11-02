import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import {
  AudioLines, AudioWaveform, UploadCloud, Music2, Mic2, Drum, Piano,
  Guitar, Download, LoaderCircle, CheckCircle2, AlertCircle, FileAudio,
  Headphones, ShieldCheck, Sparkles
} from "lucide-react";
import "./style.css";

const API = import.meta.env.VITE_API_URL || "";
const ACCEPT = ".mp3,.wav,.flac,.m4a,.aac,.ogg";
const ICONS = {
  "Voz": Mic2,
  "Batería": Drum,
  "Bajo": AudioWaveform,
  "Piano": Piano,
  "Otros instrumentos": Guitar
};

function App() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [status, setStatus] = useState("idle");
  const [stems, setStems] = useState([]);
  const [error, setError] = useState("");
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(() => {
    if (!taskId || status === "completed" || status === "failed") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/separations/${taskId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail?.message || data.detail || "No se pudo consultar el proceso.");
        setStems(data.stems || []);
        if (data.status === "completed") {
          setStatus("completed");
          setBusy(false);
          clearInterval(timer);
        } else if (data.status === "failed") {
          setStatus("failed");
          setBusy(false);
          setError("Una o más pistas no pudieron procesarse. Revisa los detalles de la tarea o prueba otra canción.");
          clearInterval(timer);
        } else {
          setStatus("processing");
        }
      } catch (e) {
        setError(typeof e.message === "string" ? e.message : "Error consultando el proceso.");
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [taskId, status]);

  function chooseFile(next) {
    if (!next) return;
    const ext = "." + (next.name.split(".").pop() || "").toLowerCase();
    if (!ACCEPT.split(",").includes(ext)) {
      setError("Formato no admitido. Selecciona MP3, WAV, FLAC, M4A, AAC u OGG.");
      return;
    }
    setFile(next);
    setError("");
    setStems([]);
    setTaskId("");
    setStatus("idle");
  }

  async function startSeparation() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setStems([]);
    setStatus("uploading");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API}/api/separations`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "No se pudo iniciar la separación.");
      setTaskId(data.task_id);
      setStatus("processing");
    } catch (e) {
      setBusy(false);
      setStatus("failed");
      setError(String(e.message || e));
    }
  }

  async function downloadZip() {
    if (!taskId || !stems.length) return;
    setZipBusy(true);
    try {
      const res = await fetch(`${API}/api/separations/${taskId}/download`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "No se pudo crear el ZIP.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "STEMLAB-AI-pistas.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message || "No se pudo crear el ZIP. Descarga cada pista individualmente.");
    } finally {
      setZipBusy(false);
    }
  }

  const reset = () => {
    setFile(null); setStems([]); setTaskId(""); setStatus("idle"); setError(""); setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="STEMLAB AI inicio">
          <span className="brand-mark"><AudioWaveform size={21}/></span>
          <span>STEMLAB <b>AI</b></span>
        </a>
        <div className="top-right"><span className="live-dot"/> SEPARACIÓN INTELIGENTE</div>
      </header>

      <section className="hero">
        <div className="eyebrow"><Sparkles size={14}/> PRODUCCIÓN MUSICAL CON IA</div>
        <h1>Tu música.<br/><span>En pistas separadas.</span></h1>
        <p className="lead">Extrae voces e instrumentos de una canción y trabaja cada elemento por separado.</p>
      </section>

      <section className="workspace">
        <div className="section-head">
          <div><div className="step">01 / SUBIR AUDIO</div><h2>Elige una canción</h2></div>
          <div className="format-note"><ShieldCheck size={15}/> Tus archivos se procesan en un servidor seguro</div>
        </div>

        <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={e => chooseFile(e.target.files?.[0])}/>
        <div
          className={`dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); chooseFile(e.dataTransfer.files?.[0]); }}
          onClick={() => !busy && inputRef.current?.click()}
          role="button" tabIndex="0"
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
        >
          <div className="upload-icon">{file ? <FileAudio size={27}/> : <UploadCloud size={29}/>}</div>
          {file ? <><strong>{file.name}</strong><span>{(file.size / 1024 / 1024).toFixed(1)} MB · Archivo seleccionado</span></> :
            <><strong>Arrastra tu audio aquí</strong><span>o haz clic para buscar un archivo en tu dispositivo</span></>}
          <small>MP3 · WAV · FLAC · M4A · AAC · OGG</small>
        </div>

        {file && <div className="selected-file"><Music2 size={17}/><span>{file.name}</span><button onClick={reset} disabled={busy}>Quitar</button></div>}

        <div className="split-config">
          <div><span className="step">02 / CONFIGURACIÓN</span><h3>Separación de 5 pistas</h3></div>
          <span className="quality-pill"><span/> CALIDAD ALTA · WAV</span>
        </div>
        <div className="stem-grid">
          {[
            ["Voz", "Voces principales y coros", "#9a7cff"],
            ["Batería", "Percusión y batería", "#e5a44d"],
            ["Bajo", "Líneas de bajo", "#45b89b"],
            ["Piano", "Piano acústico", "#64a8e8"],
            ["Otros instrumentos", "Resto de instrumentos", "#df82a5"]
          ].map(([name, desc, color]) => {
            const Icon = ICONS[name];
            return <div className="stem-chip" key={name}><span className="stem-icon" style={{color}}><Icon size={19}/></span><span><b>{name}</b><small>{desc}</small></span><span className="check">✓</span></div>;
          })}
        </div>

        <button className="primary" onClick={startSeparation} disabled={!file || busy}>
          {busy ? <><LoaderCircle className="spin" size={18}/> Procesando canción…</> : <><AudioLines size={18}/> Separar mi canción</>}
        </button>
        <p className="consent">Al continuar, confirmas que tienes derecho o permiso para procesar este audio.</p>

        {(busy || status === "completed") && (
          <div className="progress-card">
            <div className="progress-top">
              <span className="progress-icon">{status === "completed" ? <CheckCircle2/> : <LoaderCircle className="spin"/>}</span>
              <div><b>{status === "completed" ? "¡Separación completada!" : status === "uploading" ? "Subiendo audio…" : "La IA está separando tu canción…"}</b><small>{status === "completed" ? "Tus pistas están listas para escuchar y descargar." : "El tiempo depende de la duración y la carga del servicio."}</small></div>
            </div>
            <div className="progress-track"><span className={status === "completed" ? "done" : "indeterminate"}/></div>
            {taskId && <small className="task-ref">Tarea: {taskId}</small>}
          </div>
        )}

        {error && <div className="error"><AlertCircle size={17}/><span>{String(error)}</span></div>}
      </section>

      {stems.length > 0 && (
        <section className="results">
          <div className="section-head">
            <div><div className="step">03 / RESULTADOS</div><h2>Tus pistas separadas</h2></div>
            <button className="zip-button" onClick={downloadZip} disabled={zipBusy}>{zipBusy ? <LoaderCircle className="spin" size={16}/> : <Download size={16}/>} Descargar ZIP</button>
          </div>
          <div className="result-list">
            {stems.map((stem, i) => {
              const Icon = ICONS[stem.name] || AudioWaveform;
              return <div className="result-row" key={`${stem.model}-${i}`}>
                <div className="result-name"><span className={`result-icon color-${i}`}><Icon size={18}/></span><span><b>{stem.name}</b><small>{(stem.format || "audio").toUpperCase()}</small></span></div>
                <audio controls preload="none" src={stem.url}/>
                <a className="download-link" href={stem.url} target="_blank" rel="noreferrer" download><Download size={16}/><span>Descargar</span></a>
              </div>;
            })}
          </div>
          <p className="results-note">La calidad de separación puede variar según la mezcla original. Escucha cada pista antes de usarla en tu producción.</p>
          <button className="secondary" onClick={reset}>Procesar otra canción</button>
        </section>
      )}

      <footer><span>© 2026 STEMLAB AI</span><span>Hecho para quienes crean música.</span></footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App/>);
