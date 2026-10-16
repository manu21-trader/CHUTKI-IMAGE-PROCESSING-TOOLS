import React, { useState } from 'react';
import { useNavigate, useNavigationType } from 'react-router-dom';
import toast from 'react-hot-toast';
import config from '../../config';
import FileUploadZone from '../shared/FileUploadZone';
import { useAuth } from '../../context/AuthContext';
import { useUsage } from '../../context/UsageContext';
import { getProcessingErrorMessage } from '../../utils/quotaError';

const ResizePixelTool = () => {
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { token } = useAuth();
  const { refreshUsage } = useUsage();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [formData, setFormData] = useState({
    width: '',
    height: '',
    maintainAspectRatio: true,
    quality: '90',
    format: 'jpeg',
    resizeMethod: 'lanczos3',
    upscaling: false,
    smartCrop: false
  });

  const handleFileChange = (selectedFile) => {
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result);
      reader.readAsDataURL(selectedFile);
      
      // Get file info
      const sizeInKB = (selectedFile.size / 1024).toFixed(2);
      setFileInfo({
        name: selectedFile.name,
        size: sizeInKB,
        type: selectedFile.type
      });
    } else {
      // File was removed
      setFile(null);
      setPreview(null);
      setFileInfo(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('请先选择图片。');
      return;
    }

    if (!formData.width || !formData.height) {
      toast.error('请输入宽度和高度。');
      return;
    }

    setLoading(true);
    const data = new FormData();
    data.append('file', file);
    
    // Map frontend formData to backend parameters
    data.append('width', formData.width);
    data.append('height', formData.height);
    data.append('maintain', formData.maintainAspectRatio ? 'true' : 'false');
    data.append('quality', formData.quality);
    data.append('format', formData.format);
    data.append('resizeMethod', formData.resizeMethod);
    data.append('upscaling', formData.upscaling ? 'true' : 'false');
    data.append('smartCrop', formData.smartCrop ? 'true' : 'false');

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tools/resize-pixel`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: data
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        // Get resize info from response headers
        let resizeInfo = null;
        try {
          const resizeHeader = response.headers.get('X-Resize-Info');
          if (resizeHeader) {
            resizeInfo = JSON.parse(resizeHeader);
          }
        } catch (parseError) {
          console.log('Failed to parse resize info');
        }
        
        setResult({
          url,
          resizeInfo
        });
        
        // Show resize results toast
        if (resizeInfo) {
          toast.success(`图片已从 ${resizeInfo.originalWidth} × ${resizeInfo.originalHeight} 调整为 ${resizeInfo.targetWidth} × ${resizeInfo.targetHeight}`);
        } else {
          toast.success('图片尺寸调整成功！');
        }
        await refreshUsage();
      } else {
        toast.error(await getProcessingErrorMessage(response, '图片尺寸调整失败，请稍后重试。'));
      }
    } catch (error) {
      toast.error('处理时发生错误，请稍后重试。');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (result && result.url) {
      const a = document.createElement('a');
      a.href = result.url;
      const extension = formData.format === 'png' ? '.png' : formData.format === 'webp' ? '.webp' : '.jpg';
      a.download = 'resized-' + Date.now() + extension;
      a.click();
    }
  };



  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 mb-4 flex items-center group"
          >
            <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            返回
          </button>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">按像素调整图片尺寸</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">精确设置图片宽高，并选择输出质量和缩放方式</p>
          <span className="inline-block mt-3 px-4 py-1.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded-full text-sm font-medium">
            图片编辑
          </span>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
              <svg className="w-6 h-6 mr-2 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              上传图片与尺寸设置
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* File Upload Zone */}
              <FileUploadZone
                file={file}
                onFileSelect={handleFileChange}
                preview={preview}
                accept="image/jpeg, image/png, image/webp"
              />

              {/* File Info */}
              {fileInfo && (
                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
                  <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">文件信息</h3>
                  <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <p><span className="font-medium">文件名：</span> {fileInfo.name}</p>
                    <p><span className="font-medium">大小：</span> {fileInfo.size} KB</p>
                    <p><span className="font-medium">类型：</span> {fileInfo.type}</p>
                  </div>
                </div>
              )}

              {/* Width and Height */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    宽度（px）
                  </label>
                  <input
                    type="number"
                    value={formData.width}
                    onChange={(e) => setFormData({...formData, width: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="输入宽度"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    高度（px）
                  </label>
                  <input
                    type="number"
                    value={formData.height}
                    onChange={(e) => setFormData({...formData, height: e.target.value})}
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="输入高度"
                    min="1"
                  />
                </div>
              </div>

              {/* Maintain Aspect Ratio */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="maintainAspectRatio"
                  checked={formData.maintainAspectRatio}
                  onChange={(e) => setFormData({...formData, maintainAspectRatio: e.target.checked})}
                  className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="maintainAspectRatio" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                  保持宽高比
                </label>
              </div>

              {/* Smart Crop */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="smartCrop"
                  checked={formData.smartCrop}
                  onChange={(e) => setFormData({...formData, smartCrop: e.target.checked})}
                  className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="smartCrop" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                  智能裁剪（保持精确尺寸）
                </label>
              </div>

              {/* Quality */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  输出质量：{formData.quality}%
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={formData.quality}
                  onChange={(e) => setFormData({...formData, quality: e.target.value})}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                  <span>较低质量</span>
                  <span>较高质量</span>
                </div>
              </div>

              {/* Resize Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  缩放方式
                </label>
                <select
                  value={formData.resizeMethod}
                  onChange={(e) => setFormData({...formData, resizeMethod: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="lanczos3">Lanczos3（最佳质量）</option>
                  <option value="nearest">Nearest（适合像素画）</option>
                  <option value="cubic">Cubic（质量与速度均衡）</option>
                  <option value="mitchell">Mitchell（更锐利）</option>
                </select>
              </div>

              {/* Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  输出格式
                </label>
                <select
                  value={formData.format}
                  onChange={(e) => setFormData({...formData, format: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="jpeg">JPEG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || !file}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold py-4 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-lg"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    正在调整尺寸...
                  </span>
                ) : '调整图片尺寸'}
              </button>
            </form>
          </div>

          {/* Result Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
              <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              处理结果
            </h2>
            
            {result ? (
              <div className="space-y-6">
                <img src={result.url} alt="尺寸调整结果" className="w-full h-80 object-contain rounded-lg bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
                
                {/* Resize Info */}
                {result.resizeInfo && (
                  <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg">
                    <h3 className="font-medium text-green-800 dark:text-green-200 mb-2">尺寸调整信息</h3>
                    <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                      <p><span className="font-medium">原始尺寸：</span> {result.resizeInfo.originalWidth} × {result.resizeInfo.originalHeight} 像素</p>
                      <p><span className="font-medium">调整后尺寸：</span> {result.resizeInfo.targetWidth} × {result.resizeInfo.targetHeight} 像素</p>
                      <p><span className="font-medium">质量：</span> {result.resizeInfo.quality}%</p>
                      <p><span className="font-medium">格式：</span> {result.resizeInfo.format.toUpperCase()}</p>
                      <p><span className="font-medium">缩放方式：</span> {formData.resizeMethod}</p>
                      <p><span className="font-medium">宽高比：</span> {formData.maintainAspectRatio ? '已保持' : '未保持'}</p>
                      <p><span className="font-medium">智能裁剪：</span> {formData.smartCrop ? '已启用' : '未启用'}</p>
                      <p><span className="font-medium">允许放大：</span> {formData.upscaling ? '是' : '否'}</p>
                      {result.resizeInfo.upscaled && (
                        <p className="text-yellow-600 dark:text-yellow-400 font-medium">⚠️ 图片已被放大，可能影响画质</p>
                      )}
                      {result.resizeInfo.aspectRatioChanged && (
                        <p className="text-yellow-600 dark:text-yellow-400 font-medium">⚠️ 图片宽高比已改变</p>
                      )}
                    </div>
                  </div>
                )}
                
                <button
                  onClick={handleDownload}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-4 px-6 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg flex items-center justify-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  下载调整后的图片
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-80 bg-white dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-500">
                {loading ? (
                  <>
                    <svg className="animate-spin h-12 w-12 text-indigo-600 mb-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-gray-600 dark:text-gray-300 font-medium">正在调整图片尺寸...</p>
                  </>
                ) : (
                  <>
                    <svg className="w-20 h-20 text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-gray-500 dark:text-gray-400 text-center text-base px-8">
                      上传图片并开始处理，结果会显示在这里
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResizePixelTool;
