import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useUsage } from '../../context/UsageContext';
import { getProcessingErrorMessage } from '../../utils/quotaError';

const ToolLayout = ({
  title,
  description,
  endpoint,
  children,
  onSubmit,
  acceptedFormats = "image/*",
  maxFileSize = 10,
  showPreview = true
}) => {
  const { token } = useAuth();
  const { refreshUsage } = useUsage();
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file size
      if (file.size > maxFileSize * 1024 * 1024) {
        toast.error(`文件大小不能超过 ${maxFileSize}MB。`);
        return;
      }

      setSelectedFile(file);
      setResult(null);

      if (showPreview && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target.result);
        reader.readAsDataURL(file);
      }
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) {
      handleFileSelect({ target: { files: [file] } });
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleSubmit = async (formData) => {
    if (!selectedFile) {
      toast.error('请先选择文件。');
      return;
    }

    setLoading(true);
    try {
      const data = new FormData();
      data.append('file', selectedFile);

      // Add additional form data if provided
      if (formData) {
        Object.entries(formData).forEach(([key, value]) => {
          data.append(key, value);
        });
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: data,
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type');

        if (contentType && contentType.includes('application/json')) {
          // Handle JSON response (e.g., OCR results)
          const jsonResult = await response.json();
          setResult({ type: 'json', data: jsonResult });
          toast.success('处理完成！');
        } else {
          // Handle image result - show preview first
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          setResult({ type: 'image', url, blob });
          toast.success('处理完成，请点击下载保存。');
        }
        await refreshUsage();
      } else {
        toast.error(await getProcessingErrorMessage(response));
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('处理失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-gray-900 dark:to-gray-800 py-4 sm:py-6 lg:py-8 px-3 sm:px-4 lg:px-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6 sm:mb-8 lg:mb-10">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold text-gray-800 dark:text-white mb-3 sm:mb-4 px-2">{title}</h1>
          <p className="text-sm sm:text-base lg:text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto px-4">{description}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          {/* Left Column - File Upload */}
          <div className="space-y-4 sm:space-y-6">
            {/* File Upload Area */}
            <div
              className="border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg p-4 sm:p-6 lg:p-8 text-center hover:border-purple-400 dark:hover:border-purple-500 transition-colors cursor-pointer bg-white dark:bg-gray-800"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptedFormats}
                onChange={handleFileSelect}
                className="hidden"
              />

              {!preview ? (
                <div>
                  <div className="text-4xl sm:text-5xl lg:text-6xl mb-3 sm:mb-4">📁</div>
                  <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-gray-700 dark:text-gray-200 mb-2 px-2">
                    选择文件，或将文件拖到这里
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
                    文件最大支持 {maxFileSize}MB
                  </p>
                  <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg transition-colors text-sm sm:text-base">
                    选择文件
                  </button>
                </div>
              ) : (
                <div>
                  <img
                    src={preview}
                    alt="文件预览"
                    className="max-w-full h-40 sm:h-52 lg:h-64 object-contain mx-auto rounded-lg shadow-lg"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                      setPreview(null);
                      setResult(null);
                    }}
                    className="mt-3 sm:mt-4 bg-red-500 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-red-600 transition-colors text-sm sm:text-base"
                  >
                    删除文件
                  </button>
                </div>
              )}
            </div>

            {/* File Info */}
            {selectedFile && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-lg">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-white">文件信息</h3>
                <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                  <div className="break-all"><span className="font-medium">文件名：</span> {selectedFile.name}</div>
                  <div><span className="font-medium">大小：</span> {(selectedFile.size / 1024).toFixed(1)} KB</div>
                  <div><span className="font-medium">类型：</span> {selectedFile.type}</div>
                </div>
              </div>
            )}

            {/* Results Display */}
            {result && result.type === 'json' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-lg">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-white">处理结果</h3>
                <pre className="bg-gray-100 dark:bg-gray-900 p-3 sm:p-4 rounded-lg text-xs sm:text-sm overflow-auto max-h-60 sm:max-h-96">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              </div>
            )}

            {/* Image Result Display */}
            {result && result.type === 'image' && (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 sm:p-6 shadow-lg">
                <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-gray-900 dark:text-white">处理结果</h3>
                <img
                  src={result.url}
                  alt="处理结果"
                  className="w-full h-64 object-contain rounded-lg bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 mb-4"
                />
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = result.url;
                    a.download = `processed_${selectedFile.name}`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    toast.success('文件下载成功！');
                  }}
                  className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg flex items-center justify-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  下载结果
                </button>
              </div>
            )}
          </div>

          {/* Right Column - Tool Settings */}
          <div className="space-y-4 sm:space-y-6">
            {/* Tool-specific settings passed as children */}
            {children && React.cloneElement(children, {
              selectedFile,
              loading,
              onSubmit: handleSubmit
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolLayout;
