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
  const uploadIcon = isPdf ? '📄' : '📷';
  const uploadTitle = isPdf
    ? 'Select Or Drag & Drop PDF Here'
    : 'Select Or Drag & Drop Image Here';
  const uploadHint = isPdf
    ? 'Supports PDF format'
    : 'Supports JPG, PNG, WEBP, HEIC formats';
  const buttonLabel = isPdf ? 'Select PDF' : 'Select Image';

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
            <p className="text-lg font-semibold">Drop your file here!</p>
          </div>
        </div>
      )}

      {/* Empty state — no file selected */}
      {!file && !preview ? (
        <div>
          <div className="text-4xl sm:text-5xl lg:text-6xl mb-2 sm:mb-4">{uploadIcon}</div>
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
              alt="Preview"
              className="max-w-full h-32 sm:h-48 lg:h-64 object-contain mx-auto rounded-lg shadow-lg"
            />
          )}
          <button
            type="button"
            onClick={handleRemove}
            className="mt-3 sm:mt-4 bg-red-500 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-red-600 transition-colors text-sm sm:text-base"
          >
            Remove File
          </button>
        </div>
      )}
    </div>
  );
};

export default FileUploadZone;
