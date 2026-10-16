import React, { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toolsConfig } from "../toolsConfig";
import ScrollEffect from "./shared/ScrollEffect";
import FileUploadZone from "./shared/FileUploadZone";
import { useAuth } from "../context/AuthContext";
import { useUsage } from "../context/UsageContext";
import { getProcessingErrorMessage } from "../utils/quotaError";
import { getToolDescriptionZh, getToolNameZh } from "../utils/toolText";

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
          <p className="text-gray-600 dark:text-gray-400">正在加载工具...</p>
        </div>
      </div>
    );
  }

  if (!tool) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            未找到该工具
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            暂时找不到您请求的工具“{toolName}”。
          </p>
          <button
            onClick={() => navigate("/")}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors"
          >
            返回首页
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
      setError("请先选择文件。");
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
          setError(`⏳ 服务正在启动，正在重试（${attempt}/${MAX_RETRIES}）...`);
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
            setResult({ type: 'success', message: 'ZIP 文件下载成功！' });
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
          lastError = await getProcessingErrorMessage(response, `图片处理失败（状态码 ${response.status}）。`);
          if (response.status < 500) break; // Don't retry 4xx errors
        }
      } catch (err) {
        lastError = err.name === 'AbortError'
          ? '请求超时，服务可能正在启动，请稍后重试。'
          : '连接失败，请检查网络后重试。';
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
        <div key={field}>{label('输出质量')}{slider('quality', 1, 100, 1, '%')}
        {hint('数值越高，画质越好，文件也越大')}</div>
      );
      // ── DPI dropdown ──
      case 'dpi': return (
        <div key={field}>{label('DPI（分辨率）')}
        {sel('dpi', [['72','72 DPI — 屏幕 / 网页'],['96','96 DPI — 低清打印'],['150','150 DPI — 标准打印'],['200','200 DPI — 较高质量'],['300','300 DPI — 高质量（推荐）'],['600','600 DPI — 专业打印']])}
        {hint('大多数打印场景建议使用 300 DPI')}</div>
      );
      // ── Target KB ──
      case 'targetKB': return (
        <div key={field}>{label('目标大小（KB）')}{num('targetKB', 1, 5000)}
        {hint('输出图片将尽量压缩到该大小')}</div>
      );
      // ── Target Size (for increase) ──
      case 'targetSize': return (
        <div key={field}>{label('目标大小（KB，最低值）')}{num('targetSize', 50, 10000)}
        {hint('输出图片将通过填充或放大达到该最低大小')}</div>
      );
      // ── Target MB ──
      case 'targetMB': return (
        <div key={field}>{label('目标大小（MB）')}
        <input type="number" min="0.1" max="20" step="0.1" value={formData['targetMB'] ?? '1'}
          onChange={e => handleInputChange('targetMB', e.target.value)} className={cls} />
        {hint('输出图片将尽量压缩到该 MB 大小')}</div>
      );
      // ── Intensity slider ──
      case 'intensity': return (
        <div key={field}>{label('效果强度')}{slider('intensity', 1, 50, 1)}
        {hint('调整处理效果的强弱')}</div>
      );
      // ── Contrast slider ──
      case 'contrast': return (
        <div key={field}>{label('对比度')}{slider('contrast', 0.5, 3.0, 0.1, 'x')}
        {hint('1.0 为原始效果，大于 1.0 会增强对比度')}</div>
      );
      // ── Pixel size ──
      case 'pixelSize': return (
        <div key={field}>{label('像素块大小')}{slider('pixelSize', 3, 80, 1, 'px')}
        {hint('数值越大，像素化效果越明显')}</div>
      );
      // ── Scale ──
      case 'scale': return (
        <div key={field}>{label('放大倍数')}
        {sel('scale', [['2','2 倍分辨率'],['3','3 倍分辨率'],['4','4 倍分辨率']])}
        {hint('倍数越高，输出越大，处理时间也越长')}</div>
      );
      // ── Opacity slider ──
      case 'opacity': return (
        <div key={field}>{label('不透明度')}{slider('opacity', 0.0, 1.0, 0.05)}
        {hint('0 为完全透明，1 为完全不透明')}</div>
      );
      // ── Angle ──
      case 'angle': return (
        <div key={field}>{label('旋转角度')}
        {sel('angle', [['90','顺时针 90°'],['180','旋转 180°'],['270','逆时针 90°'],['45','旋转 45°'],['custom','自定义...']])}
        {formData['angle'] === 'custom' && <input type="number" min="0" max="360" placeholder="输入角度" onChange={e => handleInputChange('angle', e.target.value)} className={`${cls} mt-2`} />}
        </div>
      );
      // ── Direction (flip/join) ──
      case 'direction': return (
        <div key={field}>{label('方向')}
        {sel('direction', [['horizontal','水平'],['vertical','垂直']])}
        </div>
      );
      // ── Flip direction ──
      case 'flipDirection': return (
        <div key={field}>{label('翻转方向')}
        {sel('flipDirection', [['horizontal','↔ 水平翻转（镜像）'],['vertical','↕ 垂直翻转']])}
        </div>
      );
      // ── Format ──
      case 'format': return (
        <div key={field}>{label('输出格式')}
        {sel('format', [['jpeg','JPEG — 适合照片'],['png','PNG — 无损且支持透明背景'],['webp','WEBP — 文件体积较小']])}
        </div>
      );
      // ── Background ──
      case 'background': return (
        <div key={field}>{label('背景颜色')}
        <div className="flex gap-3 items-center">
          <input type="color" value={formData['background'] ?? '#FFFFFF'}
            onChange={e => handleInputChange('background', e.target.value)}
            className="h-10 w-16 border-0 rounded cursor-pointer" />
          {sel('background', [['#FFFFFF','白色'],['#000000','黑色'],['#0000FF','蓝色'],['#F0F0F0','浅灰色'],['transparent','透明']])}
        </div></div>
      );
      // ── Maintain aspect ratio ──
      case 'maintain': return (
        <div key={field}>{label('保持宽高比')}
        {sel('maintain', [['true','是 — 保持比例'],['false','否 — 拉伸适配']])}
        </div>
      );
      // ── Position ──
      case 'position': return (
        <div key={field}>{label('位置')}
        {sel('position', [['center','居中'],['bottom','底部'],['top','顶部'],['top-left','左上'],['top-right','右上'],['bottom-left','左下'],['bottom-right','右下']])}
        </div>
      );
      // ── Language (OCR) ──
      case 'language': case 'lang': return (
        <div key={field}>{label('OCR 文字语言')}
        {sel(field, [['eng','英语'],['hin','印地语'],['fra','法语'],['spa','西班牙语'],['deu','德语'],['ita','意大利语'],['por','葡萄牙语'],['chi_sim','简体中文']])}
        {hint('请选择图片中的文字语言，以提高 OCR 识别准确率')}</div>
      );
      // ── Page size (PDF) ──
      case 'pageSize': return (
        <div key={field}>{label('页面尺寸')}
        {sel('pageSize', [['A4','A4（210 × 297 mm）'],['Letter','Letter（8.5 × 11 英寸）'],['A5','A5（148 × 210 mm）'],['A3','A3（297 × 420 mm）'],['Legal','Legal（8.5 × 14 英寸）']])}
        </div>
      );
      // ── Width / Height numbers ──
      case 'width': return (
        <div key={field}>{label('宽度')}{num('width', 1, 10000)}
        {hint('请按所选单位输入宽度')}</div>
      );
      case 'height': return (
        <div key={field}>{label('高度')}{num('height', 1, 10000)}
        {hint('请按所选单位输入高度')}</div>
      );
      // ── Unit ──
      case 'unit': return (
        <div key={field}>{label('单位')}
        {sel('unit', [['px','像素（px）'],['cm','厘米（cm）'],['mm','毫米（mm）'],['inch','英寸']])}
        </div>
      );
      // ── Rows / Cols ──
      case 'rows': return (
        <div key={field}>{label('行数')}{sel('rows', [['1','1'],['2','2'],['3','3'],['4','4'],['5','5']])}</div>
      );
      case 'cols': return (
        <div key={field}>{label('列数')}{sel('cols', [['1','1'],['2','2'],['3','3'],['4','4'],['5','5']])}</div>
      );
      // ── Spacing ──
      case 'spacing': return (
        <div key={field}>{label('↔ 图片间距（px）')}{slider('spacing', 0, 60, 2, 'px')}</div>
      );
      // ── Text ──
      case 'text': return (
        <div key={field}>{label('水印文字')}
        <input type="text" placeholder="输入水印文字" value={formData['text'] ?? ''}
          onChange={e => handleInputChange('text', e.target.value)} className={cls} />
        </div>
      );
      case 'name': return (
        <div key={field}>{label('姓名')}
        <input type="text" placeholder="输入姓名" value={formData['name'] ?? ''}
          onChange={e => handleInputChange('name', e.target.value)} className={cls} />
        </div>
      );
      case 'dob': return (
        <div key={field}>{label('出生日期')}
        <input type="text" placeholder="日/月/年" value={formData['dob'] ?? ''}
          onChange={e => handleInputChange('dob', e.target.value)} className={cls} />
        </div>
      );
      // ── Color text ──
      case 'color': return (
        <div key={field}>{label('文字 / 水印颜色')}
        <div className="flex gap-3 items-center">
          <input type="color" value={formData['color'] ?? '#FFFFFF'}
            onChange={e => handleInputChange('color', e.target.value)}
            className="h-10 w-16 border-0 rounded cursor-pointer" />
          <input type="text" placeholder="例如 white 或 #FF0000" value={formData['color'] ?? ''}
            onChange={e => handleInputChange('color', e.target.value)} className={cls} />
        </div></div>
      );
      // ── Font size ──
      case 'fontSize': return (
        <div key={field}>{label('字号（px）')}{num('fontSize', 8, 200)}</div>
      );
      // ── X / Y coords ──
      case 'x': return (
        <div key={field}>{label('横向位置（距左侧 px）')}{num('x', 0, 9999)}</div>
      );
      case 'y': return (
        <div key={field}>{label('纵向位置（距顶部 px）')}{num('y', 0, 9999)}</div>
      );
      // ── Border ──
      case 'border': return (
        <div key={field}>{label('圆形边框样式')}
        {sel('border', [['none','无边框'],['thin','细边框（2px）'],['thick','粗边框（6px）']])}
        </div>
      );
      // ── Enhance checkbox ──
      case 'enhance': return (
        <div key={field} className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <input type="checkbox" id="enhance-cb" checked={formData['enhance'] === 'true' || formData['enhance'] === true}
            onChange={e => handleInputChange('enhance', e.target.checked ? 'true' : 'false')}
            className="w-4 h-4 text-purple-600 rounded" />
          <label htmlFor="enhance-cb" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            自动增强画质（锐化、亮度、对比度）
          </label>
        </div>
      );
      // ── Style ──
      case 'style': return (
        <div key={field}>{label('签名样式')}
        {sel('style', [['natural','自然'],['sharp','清晰粗体'],['smooth','平滑细体']])}
        </div>
      );
      // ── Gender ──
      case 'gender': return (
        <div key={field}>{label('性别')}
        {sel('gender', [['random','随机'],['male','男'],['female','女']])}
        </div>
      );
      // ── Age ──
      case 'age': return (
        <div key={field}>{label('年龄段')}
        {sel('age', [['adult','成年人（25～40 岁）'],['young','青年（18～25 岁）'],['senior','中老年（50 岁以上）'],['random','随机']])}
        </div>
      );
      // ── Max size ──
      case 'maxSize': return (
        <div key={field}>{label('最大输出大小（KB）')}{num('maxSize', 10, 5000)}</div>
      );
      default: return (
        <div key={field}>
          {label('参数设置')}
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
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-800 dark:text-white mb-2 sm:mb-4">{getToolNameZh(tool.name)}</h1>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto px-2">{getToolDescriptionZh(tool.name)}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          {/* Left — Upload + Settings */}
          <div className="space-y-4 sm:space-y-6">
            <FileUploadZone file={selectedFile} onFileSelect={handleFileSelect} preview={preview} accept={tool.accept || 'image/*'} />

            {selectedFile && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <div className="font-semibold text-gray-800 dark:text-white mb-1">文件信息</div>
                <div className="break-all">{selectedFile.name}</div>
                <div>{(selectedFile.size / 1024).toFixed(1)} KB · {selectedFile.type}</div>
              </div>
            )}

            {/* Tool Settings */}
            {tool.fields && tool.fields.filter(f => f !== 'file' && f !== 'files').length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-lg">
                <h3 className="text-base sm:text-lg font-semibold mb-4 text-gray-900 dark:text-white">工具设置</h3>
                <div className="space-y-4">
                  {tool.fields.map(field => renderFormField(field))}
                </div>
              </div>
            )}

            {/* Output filename */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-lg">
              <h3 className="text-base sm:text-lg font-semibold mb-3 text-gray-900 dark:text-white">输出设置</h3>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">自定义文件名（可选）</label>
              <input type="text" placeholder="输入文件名，不含扩展名" value={customFilename}
                onChange={(e) => setCustomFilename(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white text-sm" />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">留空则自动生成文件名</p>
            </div>

            {/* Process Button */}
            <button onClick={handleSubmit}
              disabled={(toolName !== 'ai-face-generator' && !selectedFile) || loading}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-4 rounded-lg shadow-lg transition-all duration-200 disabled:cursor-not-allowed text-base lg:text-lg">
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>正在处理...（首次使用可能需要约 60 秒）</span>
                </div>
              ) : `开始${getToolNameZh(tool.name)}`}
            </button>
          </div>

          {/* Right — Result Preview */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
              <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              处理结果
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
                    <p className="text-gray-500 dark:text-gray-400 font-medium">正在处理图片...</p>
                  </>
                ) : (
                  <>
                    <svg className="w-16 h-16 text-gray-300 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-500 dark:text-gray-400 text-center px-4">上传图片并点击处理，结果会显示在这里</p>
                  </>
                )}
              </div>
            )}

            {result && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {result.type === 'image' && (
                  <>
                    <img src={result.url} alt="处理结果" className="w-full rounded-xl border-2 border-gray-200 dark:border-gray-600 object-contain max-h-96 bg-gray-50 dark:bg-gray-700" />
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-sm text-green-700 dark:text-green-300">✅ 图片处理成功！</div>
                    <button onClick={handleDownload}
                      className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-4 rounded-lg shadow-lg flex items-center justify-center transition-all hover:scale-105">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      下载图片
                    </button>
                  </>
                )}
                {result.type === 'pdf' && (
                  <>
                    <div className="flex flex-col items-center justify-center h-40 bg-red-50 dark:bg-red-900/20 rounded-xl border-2 border-red-200 dark:border-red-800">
                      <svg className="w-16 h-16 text-red-500 mb-2" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/></svg>
                      <p className="text-red-700 dark:text-red-300 font-medium">PDF 已生成</p>
                    </div>
                    <button onClick={handleDownload}
                      className="w-full bg-gradient-to-r from-red-600 to-orange-600 text-white font-semibold py-4 rounded-lg shadow-lg flex items-center justify-center">
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      下载 PDF
                    </button>
                  </>
                )}
                {result.type === 'json' && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-200">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-3">📊 处理结果</h4>
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
