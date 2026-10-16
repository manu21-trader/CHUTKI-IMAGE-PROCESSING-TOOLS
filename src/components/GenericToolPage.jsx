import React, { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toolsConfig } from "../toolsConfig";
import ScrollEffect from "./shared/ScrollEffect";
import FileUploadZone from "./shared/FileUploadZone";
import { useAuth } from "../context/AuthContext";
import { useUsage } from "../context/UsageContext";
import { getProcessingErrorMessage } from "../utils/quotaError";

const GenericToolPage = () => {
  const { toolName } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { refreshUsage } = useUsage();
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({});
  const [customFilename, setCustomFilename] = useState('');
  const fileInputRef = useRef(null);

  // Memoize tool lookup to prevent excessive re-renders
  const tool = useMemo(() => {
    if (!toolName) return null;
    const currentPath = `/tools/${toolName}`;
    const foundTool = Object.values(toolsConfig)
      .flat()
      .find(t => t.route === currentPath);
    
    // Debug logging to help identify issues
    if (!foundTool) {
      console.log('Tool not found for path:', currentPath);
      console.log('Available tools:', Object.values(toolsConfig).flat().map(t => t.route));
    }
    
    return foundTool;
  }, [toolName]);

  // Show loading while toolName is being resolved
  if (!toolName) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading tool...</p>
        </div>
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            Tool Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            The requested tool "{toolName}" could not be found.
          </p>
          <button
            onClick={() => navigate("/")}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            Go Back Home
          </button>
        </div>
      </div>
    );
  }

  const handleFileSelect = (file) => {
    if (file) {
      setSelectedFile(file);
      setError(null);
      setResult(null);
      // Only generate a preview for image files — PDFs cannot render as <img> src
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target.result);
        reader.readAsDataURL(file);
      } else {
        setPreview(null); // PDF or other: show filename instead of broken image
      }
    } else {
      // File was removed
      setSelectedFile(null);
      setPreview(null);
      setResult(null);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => {
      const newData = {
        ...prev,
        [field]: value
      };
      return newData;
    });
  };

  // Helper: fetch with timeout using AbortController
  const fetchWithTimeout = (url, options, timeoutMs = 60000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timer));
  };

  // Helper: wake up Render server before processing (prevents cold-start failures)
  const wakeUpServer = async () => {
    try {
      const apiBase = tool.endpoint.split('/api/')[0];
      await fetchWithTimeout(`${apiBase}/ping`, {}, 15000);
    } catch (_) {
      // Ignore — ping is best-effort only
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const noFileRequired = ['ai-face-generator'];
    if (!selectedFile && !noFileRequired.includes(toolName)) {
      setError("Please select a file");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    // Wake up the server first (handles Render free-tier cold starts)
    await wakeUpServer();

    const formDataToSend = new FormData();
    if (selectedFile) formDataToSend.append("file", selectedFile);
    Object.keys(formData).forEach(key => {
      if (formData[key] !== null && formData[key] !== undefined && formData[key] !== "") {
        formDataToSend.append(key, formData[key]);
      }
    });
    if (customFilename.trim()) {
      formDataToSend.append('customFilename', customFilename.trim());
    }

    // Retry up to 2 times to handle intermittent cold-start failures
    const MAX_RETRIES = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          setError(`⏳ Server is waking up... Retrying (${attempt}/${MAX_RETRIES})`);
          await new Promise(r => setTimeout(r, 3000)); // Wait 3s before retry
          setError(null);
        }

        const response = await fetchWithTimeout(tool.endpoint, {
          method: tool.method,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          body: formDataToSend,
        }, 60000); // 60s timeout per attempt

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await response.json();
            setResult({ type: 'json', data });
          } else if (contentType.includes('application/zip')) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const ext = customFilename.trim() ? `${customFilename.trim()}.zip` : `processed-${Date.now()}.zip`;
            const a = document.createElement('a'); a.href = url; a.download = ext;
            document.body.appendChild(a); a.click();
            window.URL.revokeObjectURL(url); document.body.removeChild(a);
            setResult({ type: 'success', message: 'ZIP downloaded successfully!' });
          } else if (contentType.includes('application/pdf')) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            setResult({ type: 'pdf', url, filename: customFilename.trim() ? `${customFilename.trim()}.pdf` : `processed-${Date.now()}.pdf` });
          } else {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const isPng = contentType.includes('png');
            setResult({ type: 'image', url, filename: customFilename.trim() ? `${customFilename.trim()}.${isPng?'png':'jpg'}` : `processed-${Date.now()}.${isPng?'png':'jpg'}` });
          }
          await refreshUsage();
          lastError = null;
          break; // Success — stop retrying
        } else {
          lastError = await getProcessingErrorMessage(response, `Server error (${response.status})`);
          if (response.status < 500) break; // Don't retry 4xx errors
        }
      } catch (err) {
        lastError = err.name === 'AbortError'
          ? 'Request timed out. The server may be starting up — please try again.'
          : 'Connection failed. Please check your internet and try again.';
        console.error(`[Attempt ${attempt}] Error:`, err);
      }
    }

    if (lastError) setError(lastError);
    setLoading(false);
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.filename || 'processed';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // Initialize form data with defaults from tool config
  React.useEffect(() => {
    if (tool) {
      const builtInDefaults = {
        dpi: '300', quality: '90', angle: '90', fontSize: '24', color: 'white',
        pixelSize: '10', scale: '2', targetKB: '100', targetMB: '1',
        targetSize: tool.defaults?.targetSize || '100',
        maxSize: '100', x: '100', y: '100', spacing: '0',
        rows: '3', cols: '3', opacity: '0.7', intensity: '10',
        contrast: '1.2', maintain: 'true', direction: 'horizontal',
        background: '#FFFFFF', format: 'jpeg', style: 'natural',
        gender: 'random', age: 'adult', language: 'eng', pageSize: 'A4',
        position: 'bottom', enhance: 'true',
      };
      const initial = { ...builtInDefaults, ...(tool.defaults || {}) };
      setFormData(initial);
    }
  }, [tool]);

  const cls = 'w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white text-sm';

  const renderFormField = (field) => {
    if (field === 'file' || field === 'files' || field === 'image') return null;

    const label = (l) => <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{l}</label>;
    const hint = (t) => <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t}</p>;
    const sel = (f, opts) => (
      <select value={formData[f] ?? ''} onChange={e => handleInputChange(f, e.target.value)} className={cls}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    );
    const num = (f, min, max, step=1) => (
      <input type="number" min={min} max={max} step={step} value={formData[f] ?? ''}
        onChange={e => handleInputChange(f, e.target.value)} className={cls} />
    );
    const slider = (f, min, max, step=1, suffix='') => (
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{min}{suffix}</span>
          <span className="font-semibold text-purple-600 dark:text-purple-400">{formData[f] ?? min}{suffix}</span>
          <span>{max}{suffix}</span>
        </div>
        <input type="range" min={min} max={max} step={step} value={formData[f] ?? min}
          onChange={e => handleInputChange(f, e.target.value)}
          className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-600" />
      </div>
    );

    switch (field) {
      // ── Quality slider ──
      case 'quality': return (
        <div key={field}>{label('Output Quality')}{slider('quality', 1, 100, 1, '%')}
        {hint('Higher = better quality, larger file size')}</div>
      );
      // ── DPI dropdown ──
      case 'dpi': return (
        <div key={field}>{label('DPI (Resolution)')}
        {sel('dpi', [['72','72 DPI — Screen / Web'],['96','96 DPI — Low Print'],['150','150 DPI — Standard Print'],['200','200 DPI — Good Quality'],['300','300 DPI — High Quality (Recommended)'],['600','600 DPI — Professional Print']])}
        {hint('300 DPI is recommended for most print applications')}</div>
      );
      // ── Target KB ──
      case 'targetKB': return (
        <div key={field}>{label('Target Size (KB)')}{num('targetKB', 1, 5000)}
        {hint('The output image will be compressed to this size')}</div>
      );
      // ── Target Size (for increase) ──
      case 'targetSize': return (
        <div key={field}>{label('Target Size (KB — Minimum)')}{num('targetSize', 50, 10000)}
        {hint('The output image will be padded/upscaled to meet this minimum size')}</div>
      );
      // ── Target MB ──
      case 'targetMB': return (
        <div key={field}>{label('Target Size (MB)')}
        <input type="number" min="0.1" max="20" step="0.1" value={formData['targetMB'] ?? '1'}
          onChange={e => handleInputChange('targetMB', e.target.value)} className={cls} />
        {hint('The output image will be compressed to this size in MB')}</div>
      );
      // ── Intensity slider ──
      case 'intensity': return (
        <div key={field}>{label('Effect Intensity')}{slider('intensity', 1, 50, 1)}
        {hint('Controls the strength of the applied effect')}</div>
      );
      // ── Contrast slider ──
      case 'contrast': return (
        <div key={field}>{label('Contrast')}{slider('contrast', 0.5, 3.0, 0.1, 'x')}
        {hint('1.0 = original, >1.0 = more contrast')}</div>
      );
      // ── Pixel size ──
      case 'pixelSize': return (
        <div key={field}>{label('Pixel Block Size')}{slider('pixelSize', 3, 80, 1, 'px')}
        {hint('Larger value = more pixelated look')}</div>
      );
      // ── Scale ──
      case 'scale': return (
        <div key={field}>{label('Upscale Factor')}
        {sel('scale', [['2','2x — Double resolution'],['3','3x — Triple resolution'],['4','4x — Quadruple resolution']])}
        {hint('Higher scale = larger output, more processing time')}</div>
      );
      // ── Opacity slider ──
      case 'opacity': return (
        <div key={field}>{label('Opacity')}{slider('opacity', 0.0, 1.0, 0.05)}
        {hint('0 = invisible, 1 = fully opaque')}</div>
      );
      // ── Angle ──
      case 'angle': return (
        <div key={field}>{label('Rotation Angle (degrees)')}
        {sel('angle', [['90','90 deg Clockwise'],['180','180 deg Flip'],['270','270 deg Counter-clockwise'],['45','45 deg Diagonal'],['custom','Custom...']])}
        {formData['angle'] === 'custom' && <input type="number" min="0" max="360" placeholder="Enter degrees" onChange={e => handleInputChange('angle', e.target.value)} className={`${cls} mt-2`} />}
        </div>
      );
      // ── Direction (flip/join) ──
      case 'direction': return (
        <div key={field}>{label('Direction')}
        {sel('direction', [['horizontal','Horizontal'],['vertical','Vertical']])}
        </div>
      );
      // ── Flip direction ──
      case 'flipDirection': return (
        <div key={field}>{label('Flip Direction')}
        {sel('flipDirection', [['horizontal','↔ Horizontal (Mirror)'],['vertical','↕ Vertical (Upside Down)']])}
        </div>
      );
      // ── Format ──
      case 'format': return (
        <div key={field}>{label('Output Format')}
        {sel('format', [['jpeg','JPEG — Best for photos'],['png','PNG — Lossless, supports transparency'],['webp','WEBP — Modern, small file size']])}
        </div>
      );
      // ── Background ──
      case 'background': return (
        <div key={field}>{label('Background Color')}
        <div className="flex gap-3 items-center">
          <input type="color" value={formData['background'] ?? '#FFFFFF'}
            onChange={e => handleInputChange('background', e.target.value)}
            className="h-10 w-16 border-0 rounded cursor-pointer" />
          {sel('background', [['#FFFFFF','White'],['#000000','Black'],['#0000FF','Blue'],['#F0F0F0','Light Grey'],['transparent','Transparent']])}
        </div></div>
      );
      // ── Maintain aspect ratio ──
      case 'maintain': return (
        <div key={field}>{label('Maintain Aspect Ratio')}
        {sel('maintain', [['true','Yes — Keep proportions'],['false','No — Stretch to fit']])}
        </div>
      );
      // ── Position ──
      case 'position': return (
        <div key={field}>{label('Position')}
        {sel('position', [['center','Center'],['bottom','Bottom'],['top','Top'],['top-left','Top Left'],['top-right','Top Right'],['bottom-left','Bottom Left'],['bottom-right','Bottom Right']])}
        </div>
      );
      // ── Language (OCR) ──
      case 'language': case 'lang': return (
        <div key={field}>{label('OCR Language')}
        {sel(field, [['eng','English'],['hin','Hindi'],['fra','French'],['spa','Spanish'],['deu','German'],['ita','Italian'],['por','Portuguese'],['chi_sim','Chinese (Simplified)']])}
        {hint('Select the language of text in the image for best OCR accuracy')}</div>
      );
      // ── Page size (PDF) ──
      case 'pageSize': return (
        <div key={field}>{label('Page Size')}
        {sel('pageSize', [['A4','A4 (210 x 297 mm)'],['Letter','Letter (8.5 x 11 inch)'],['A5','A5 (148 x 210 mm)'],['A3','A3 (297 x 420 mm)'],['Legal','Legal (8.5 x 14 inch)']])}
        </div>
      );
      // ── Width / Height numbers ──
      case 'width': return (
        <div key={field}>{label('Width')}{num('width', 1, 10000)}
        {hint('Enter width in the selected unit')}</div>
      );
      case 'height': return (
        <div key={field}>{label('Height')}{num('height', 1, 10000)}
        {hint('Enter height in the selected unit')}</div>
      );
      // ── Unit ──
      case 'unit': return (
        <div key={field}>{label('Unit')}
        {sel('unit', [['px','Pixels (px)'],['cm','Centimeters (cm)'],['mm','Millimeters (mm)'],['inch','Inches']])}
        </div>
      );
      // ── Rows / Cols ──
      case 'rows': return (
        <div key={field}>{label('Rows')}{sel('rows', [['1','1'],['2','2'],['3','3'],['4','4'],['5','5']])}</div>
      );
      case 'cols': return (
        <div key={field}>{label('Columns')}{sel('cols', [['1','1'],['2','2'],['3','3'],['4','4'],['5','5']])}</div>
      );
      // ── Spacing ──
      case 'spacing': return (
        <div key={field}>{label('↔ Spacing (px between images)')}{slider('spacing', 0, 60, 2, 'px')}</div>
      );
      // ── Text ──
      case 'text': return (
        <div key={field}>{label('Watermark Text')}
        <input type="text" placeholder="Enter watermark text" value={formData['text'] ?? ''}
          onChange={e => handleInputChange('text', e.target.value)} className={cls} />
        </div>
      );
      case 'name': return (
        <div key={field}>{label('Name')}
        <input type="text" placeholder="Enter full name" value={formData['name'] ?? ''}
          onChange={e => handleInputChange('name', e.target.value)} className={cls} />
        </div>
      );
      case 'dob': return (
        <div key={field}>{label('Date of Birth')}
        <input type="text" placeholder="DD/MM/YYYY" value={formData['dob'] ?? ''}
          onChange={e => handleInputChange('dob', e.target.value)} className={cls} />
        </div>
      );
      // ── Color text ──
      case 'color': return (
        <div key={field}>{label('Text / Watermark Color')}
        <div className="flex gap-3 items-center">
          <input type="color" value={formData['color'] ?? '#FFFFFF'}
            onChange={e => handleInputChange('color', e.target.value)}
            className="h-10 w-16 border-0 rounded cursor-pointer" />
          <input type="text" placeholder="e.g. white, #FF0000" value={formData['color'] ?? ''}
            onChange={e => handleInputChange('color', e.target.value)} className={cls} />
        </div></div>
      );
      // ── Font size ──
      case 'fontSize': return (
        <div key={field}>{label('Font Size (px)')}{num('fontSize', 8, 200)}</div>
      );
      // ── X / Y coords ──
      case 'x': return (
        <div key={field}>{label('X Position (px from left)')}{num('x', 0, 9999)}</div>
      );
      case 'y': return (
        <div key={field}>{label('Y Position (px from top)')}{num('y', 0, 9999)}</div>
      );
      // ── Border ──
      case 'border': return (
        <div key={field}>{label('Circle Border Style')}
        {sel('border', [['none','None'],['thin','Thin Border (2px)'],['thick','Thick Border (6px)']])}
        </div>
      );
      // ── Enhance checkbox ──
      case 'enhance': return (
        <div key={field} className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <input type="checkbox" id="enhance-cb" checked={formData['enhance'] === 'true' || formData['enhance'] === true}
            onChange={e => handleInputChange('enhance', e.target.checked ? 'true' : 'false')}
            className="w-4 h-4 text-purple-600 rounded" />
          <label htmlFor="enhance-cb" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            Auto-enhance quality (sharpen, brightness, contrast)
          </label>
        </div>
      );
      // ── Style ──
      case 'style': return (
        <div key={field}>{label('Signature Style')}
        {sel('style', [['natural','Natural'],['sharp','Sharp & Bold'],['smooth','Smooth & Thin']])}
        </div>
      );
      // ── Gender ──
      case 'gender': return (
        <div key={field}>{label('Gender')}
        {sel('gender', [['random','Random'],['male','Male'],['female','Female']])}
        </div>
      );
      // ── Age ──
      case 'age': return (
        <div key={field}>{label('Age Group')}
        {sel('age', [['adult','Adult (25-40)'],['young','Young (18-25)'],['senior','Senior (50+)'],['random','Random']])}
        </div>
      );
      // ── Max size ──
      case 'maxSize': return (
        <div key={field}>{label('Max Output Size (KB)')}{num('maxSize', 10, 5000)}</div>
      );
      default: return (
        <div key={field}>
          {label(field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()))}
          <input type="text" placeholder={field} value={formData[field] ?? ''}
            onChange={e => handleInputChange(field, e.target.value)} className={cls} />
        </div>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800 py-4 sm:py-8 px-2 sm:px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-800 dark:text-white mb-2 sm:mb-4">{tool.name}</h1>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto px-2">{tool.description}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          {/* Left — Upload + Settings */}
          <div className="space-y-4 sm:space-y-6">
            <FileUploadZone file={selectedFile} onFileSelect={handleFileSelect} preview={preview} accept={tool.accept || 'image/*'} />

            {selectedFile && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <div className="font-semibold text-gray-800 dark:text-white mb-1">File Info</div>
                <div className="break-all">{selectedFile.name}</div>
                <div>{(selectedFile.size / 1024).toFixed(1)} KB · {selectedFile.type}</div>
              </div>
            )}

            {/* Tool Settings */}
            {tool.fields && tool.fields.filter(f => f !== 'file' && f !== 'files').length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-lg">
                <h3 className="text-base sm:text-lg font-semibold mb-4 text-gray-900 dark:text-white">Tool Settings</h3>
                <div className="space-y-4">
                  {tool.fields.map(field => renderFormField(field))}
                </div>
              </div>
            )}

            {/* Output filename */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-lg">
              <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-900 dark:text-white">Output Settings</h3>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Custom Filename (optional)</label>
              <input type="text" placeholder="Enter filename without extension" value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white text-sm" />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Leave empty for auto-generated name</p>
            </div>

            {/* Process Button */}
            <button onClick={handleSubmit}
              disabled={(toolName !== 'ai-face-generator' && !selectedFile) || loading}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-4 rounded-lg shadow-lg transition-all duration-200 disabled:cursor-not-allowed text-base lg:text-lg">
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Processing... (may take up to 60s on first use)</span>
                </div>
              ) : `Process ${tool.name}`}
            </button>
          </div>

          {/* Right — Result Preview */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
              <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Result
            </h2>

            {error && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-700 dark:text-red-300 text-sm font-medium">❌ {error}</p>
              </motion.div>
            )}

            {!result && !error && (
              <div className="flex flex-col items-center justify-center h-72 bg-gray-50 dark:bg-gray-700 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-500">
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-600 border-t-transparent mb-4"></div>
                    <p className="text-gray-500 dark:text-gray-400 font-medium">Processing your image...</p>
                  </>
                ) : (
                  <>
                    <svg className="w-16 h-16 text-gray-300 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-500 dark:text-gray-400 text-center px-4">Upload an image and click Process to see the result here</p>
                  </>
                )}
              </div>
            )}

            {result && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {result.type === 'image' && (
                  <>
                    <img src={result.url} alt="Processed result" className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-600 object-contain max-h-96 bg-gray-50 dark:bg-gray-700" />
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">✅ Image processed successfully!</div>
                    <button onClick={handleDownload}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-4 rounded-lg shadow-lg flex items-center justify-center transition-all hover:scale-105">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Image
                    </button>
                  </>
                )}
                {result.type === 'pdf' && (
                  <>
                    <div className="flex flex-col items-center justify-center h-40 bg-red-50 dark:bg-red-900/20 rounded-xl border-2 border-red-200 dark:border-red-800">
                      <svg className="w-16 h-16 text-red-500 mb-2" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/></svg>
                      <p className="text-red-700 dark:text-red-300 font-medium">PDF Ready</p>
                    </div>
                    <button onClick={handleDownload}
                      className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold py-4 rounded-lg shadow-lg flex items-center justify-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download PDF
                    </button>
                  </>
                )}
                {result.type === 'json' && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-3">📊 Result</h4>
                    <pre className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-wrap overflow-auto max-h-64">{JSON.stringify(result.data, null, 2)}</pre>
                  </div>
                )}
                {result.type === 'success' && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg p-4">
                    <p className="text-green-700 dark:text-green-300 font-medium">✅ {result.message}</p>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GenericToolPage;
