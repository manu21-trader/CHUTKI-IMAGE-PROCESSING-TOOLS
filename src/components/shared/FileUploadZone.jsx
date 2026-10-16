import React, { useState, useRef } from 'react';

/**
 * Reusable File Upload Zone with Drag & Drop support
 * @param {Object} props
 * @param {File|null} props.file - Currently selected file
 * @param {Function} props.onFileSelect - Callback when file is selected
 * @param {string} props.preview - Preview URL for the file
 * @param {string} props.accept - File types to accept (default: "image/*")
 * @param {boolean} props.disabled - Whether the upload zone is disabled
 * @param {string} props.className - Additional CSS classes
 */
const FileUploadZone = ({ 
  file, 
  onFileSelect, 
  preview, 
  accept = "image/*",
  disabled = false,
  className = ""
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && onFileSelect) {
      onFileSelect(selectedFile);
    }
    // Reset so the same file can be re-selected on mobile
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === e.currentTarget) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;

    let files = [];
    if (e.dataTransfer.items) {
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        if (e.dataTransfer.items[i].kind === 'file') {
          const droppedFile = e.dataTransfer.items[i].getAsFile();
          if (droppedFile) files.push(droppedFile);
        }
      }
    } else {
      files = Array.from(e.dataTransfer.files);
    }
    if (files.length > 0 && onFileSelect) {
      onFileSelect(files[0]);
    }
  };

  // Separate handlers to prevent double-trigger on mobile:
  // The zone click opens the picker, the button click stops propagation then also opens it.
  const handleZoneClick = () => {
    if (!disabled) fileInputRef.current?.click();
  };

  const handleButtonClick = (e) => {
    e.stopPropagation(); // Prevent zone's onClick from also firing
    if (!disabled) fileInputRef.current?.click();
  };

  const handleRemove = (e) => {
    e.stopPropagation();
    if (onFileSelect) onFileSelect(null);
  };

  // Dynamic labels based on file type accepted
  const isPdf = accept && accept.includes('pdf');
  const uploadTitle = isPdf
    ? '选择 PDF，或将文件拖到这里'
    : '选择图片，或将文件拖到这里';
  const uploadHint = isPdf
    ? '支持 PDF 格式'
    : '支持 JPG、PNG、WEBP 等常用图片格式，单文件最大 8 MiB';
  const buttonLabel = isPdf ? '选择 PDF' : '选择图片';

  // Realistic SVG icons — camera for images, document for PDFs
  const UploadIcon = isPdf ? (
    // Realistic PDF document icon
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 sm:mb-3 drop-shadow-md" fill="none">
      <rect x="8" y="4" width="36" height="48" rx="4" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5"/>
      <path d="M36 4 L44 12 L36 12 Z" fill="#e2e8f0" stroke="#cbd5e1" strokeWidth="1.5"/>
      <rect x="14" y="22" width="24" height="3" rx="1.5" fill="#94a3b8"/>
      <rect x="14" y="29" width="18" height="3" rx="1.5" fill="#94a3b8"/>
      <rect x="14" y="36" width="21" height="3" rx="1.5" fill="#94a3b8"/>
      <rect x="10" y="38" width="30" height="16" rx="3" fill="#ef4444"/>
      <text x="25" y="50" textAnchor="middle" fill="white" fontSize="7" fontWeight="bold" fontFamily="Arial">PDF</text>
    </svg>
  ) : (
    // Realistic camera icon
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-2 sm:mb-3 drop-shadow-md" fill="none">
      <rect x="4" y="16" width="56" height="40" rx="6" fill="#334155" stroke="#475569" strokeWidth="1.5"/>
      <rect x="4" y="16" width="56" height="8" rx="3" fill="#1e293b"/>
      <rect x="10" y="18" width="14" height="4" rx="2" fill="#64748b"/>
      <circle cx="32" cy="38" r="13" fill="#1e293b" stroke="#475569" strokeWidth="1.5"/>
      <circle cx="32" cy="38" r="9" fill="#0f172a" stroke="#334155" strokeWidth="1"/>
      <circle cx="32" cy="38" r="5.5" fill="#7c3aed"/>
      <circle cx="29.5" cy="35.5" r="1.5" fill="white" opacity="0.5"/>
      <circle cx="50" cy="22" r="3" fill="#64748b" stroke="#94a3b8" strokeWidth="1"/>
      <rect x="22" y="13" width="8" height="5" rx="2" fill="#475569" stroke="#64748b" strokeWidth="1"/>
    </svg>
  );

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-4 sm:p-6 lg:p-8 text-center transition-all duration-200 cursor-pointer bg-white dark:bg-gray-800 min-h-[200px] sm:min-h-[250px] flex flex-col justify-center relative ${
        isDragOver
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-105'
          : 'border-purple-300 dark:border-purple-600 hover:border-purple-400 dark:hover:border-purple-500'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      onClick={handleZoneClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-sm border-4 border-dashed border-blue-500 rounded-lg flex items-center justify-center z-10 pointer-events-none">
          <div className="text-center text-blue-700 dark:text-blue-300">
            <svg className="w-16 h-16 mx-auto mb-2 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-semibold">松开即可上传文件</p>
          </div>
        </div>
      )}

      {/* Empty state — no file selected */}
      {!file && !preview ? (
        <div>
          {UploadIcon}
          <h3 className="text-lg sm:text-xl font-semibold text-gray-700 dark:text-gray-200 mb-2">
            {uploadTitle}
          </h3>
          <p className="text-sm sm:text-base text-gray-500 dark:text-gray-400 mb-3 sm:mb-4">
            {uploadHint}
          </p>
          <button
            type="button"
            className="bg-purple-600 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base font-medium"
            onClick={handleButtonClick}
          >
            {buttonLabel}
          </button>
        </div>
      ) : (
        /* File selected state */
        <div onClick={(e) => e.stopPropagation()}>
          {isPdf ? (
            /* PDF selected — show icon + filename (can't preview PDF as <img>) */
            <div className="flex flex-col items-center justify-center gap-3">
              <svg className="w-20 h-20 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
              </svg>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 break-all px-2">
                {file?.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {file ? `${(file.size / 1024).toFixed(1)} KB` : ''}
              </p>
            </div>
          ) : (
            /* Image selected — show preview */
            <img
              src={preview}
              alt="图片预览"
              className="max-w-full h-32 sm:h-48 lg:h-64 object-contain mx-auto rounded-lg shadow-lg"
            />
          )}
          <button
            type="button"
            onClick={handleRemove}
            className="mt-3 sm:mt-4 bg-red-500 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-red-600 transition-colors text-sm sm:text-base"
          >
            删除文件
          </button>
        </div>
      )}
    </div>
  );
};

export default FileUploadZone;
