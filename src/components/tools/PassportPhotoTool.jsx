import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import config from '../../config';
import FileUploadZone from '../shared/FileUploadZone';
import passportCountries from '../../data/passportCountries';
import { detectFace, checkCompliance } from '../../utils/faceDetection';
import FaceDetectionOverlay from '../FaceDetectionOverlay';
import { useAuth } from '../../context/AuthContext';
import { useUsage } from '../../context/UsageContext';
import { getProcessingErrorMessage } from '../../utils/quotaError';

const PassportPhotoTool = () => {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { refreshUsage } = useUsage();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);
  const [formData, setFormData] = useState({
    size: '2x2',
    dpi: '300',
    background: '#FFFFFF',
    quantity: '1',
    paperSize: '4x6',
    enhance: true,
    country: 'US',
    complianceCheck: true,
    headPositionCheck: true,
    lightingCheck: true,
    backgroundCheck: true
  });
  
  // Face detection state
  const [faceDetection, setFaceDetection] = useState(null);
  const [detectingFace, setDetectingFace] = useState(false);
  const [complianceResults, setComplianceResults] = useState(null);
  const imageRef = useRef(null);

  // Auto-update settings when country changes
  useEffect(() => {
    const countryData = passportCountries[formData.country];
    if (countryData) {
      const newSize = countryData.size.unit === 'inches' 
        ? `${countryData.size.width}x${countryData.size.height}` 
        : `${countryData.size.width}x${countryData.size.height}mm`;
      const newDpi = countryData.dpi.toString();
      const newBackground = countryData.background;
      
      // Only update if values actually changed
      if (formData.size !== newSize || formData.dpi !== newDpi || formData.background !== newBackground) {
        setFormData(prev => ({
          ...prev,
          size: newSize,
          dpi: newDpi,
          background: newBackground
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.country]);

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
      setFaceDetection(null);
      setComplianceResults(null);
    }
  };

  // Handle face detection
  const handleDetectFace = async () => {
    if (!preview || !imageRef.current) {
      toast.error('Please upload an image first');
      return;
    }

    setDetectingFace(true);
    toast.loading('Detecting face...', { id: 'face-detection' });

    try {
      // Create image element from preview
      const img = new Image();
      img.src = preview;
      
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      // Detect face
      const detection = await detectFace(img);

      if (!detection.success) {
        toast.error(detection.error || 'No face detected', { id: 'face-detection' });
        setFaceDetection(null);
        return;
      }

      setFaceDetection(detection);
      toast.success(`Face detected! Confidence: ${(detection.confidence * 100).toFixed(1)}%`, { id: 'face-detection' });

      // Check compliance
      const countryReqs = passportCountries[formData.country];
      if (countryReqs) {
        const compliance = checkCompliance(
          detection,
          { width: img.width, height: img.height },
          countryReqs
        );
        setComplianceResults(compliance);

        if (compliance.overall) {
          toast.success('✅ Photo meets all requirements!');
        } else {
          toast.error('⚠️ Photo has compliance issues');
        }
      }
    } catch (error) {
      console.error('Face detection error:', error);
      toast.error('Face detection failed', { id: 'face-detection' });
    } finally {
      setDetectingFace(false);
    }
  };

  // Handle auto-centering
  const handleAutoCenter = async () => {
    if (!faceDetection || !faceDetection.success) {
      toast.error('Please detect face first');
      return;
    }

    if (!preview) {
      toast.error('No image to center');
      return;
    }

    setLoading(true);
    toast.loading('Auto-centering face...', { id: 'auto-center' });

    try {
      // Create canvas to manipulate image
      const img = new Image();
      img.src = preview;
      
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      // Get country requirements
      const countryReqs = passportCountries[formData.country];
      const targetHeadSize = countryReqs?.headSize?.percentage || 70;
      const targetEyeLevel = countryReqs?.eyeLevel?.percentage || 60;

      // Calculate current face metrics
      const face = faceDetection.box;
      const currentHeadSize = (face.height / img.height) * 100;
      const currentEyeLevel = faceDetection.eyeLevel 
        ? ((faceDetection.eyeLevel.y / img.height) * 100)
        : ((face.y + face.height * 0.3) / img.height) * 100;

      // Calculate scale factor to match target head size
      const scaleFactor = targetHeadSize / currentHeadSize;
      
      // Calculate new dimensions
      const newWidth = img.width * scaleFactor;
      const newHeight = img.height * scaleFactor;
      
      // Calculate face center after scaling
      const scaledFaceX = face.x * scaleFactor + (face.width * scaleFactor) / 2;
      const scaledFaceY = face.y * scaleFactor + (face.height * scaleFactor) / 2;
      
      // Calculate target position (center horizontally, eye level at target percentage)
      const targetX = img.width / 2;
      const targetY = (img.height * targetEyeLevel) / 100;
      
      // Calculate offset needed
      const offsetX = targetX - scaledFaceX;
      const offsetY = targetY - scaledFaceY;

      // Set canvas to original image size
      canvas.width = img.width;
      canvas.height = img.height;

      // Fill with background color
      ctx.fillStyle = formData.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw scaled and centered image
      ctx.drawImage(
        img,
        offsetX,
        offsetY,
        newWidth,
        newHeight
      );

      // Convert to blob and create new file
      canvas.toBlob((blob) => {
        const centeredFile = new File([blob], file.name, { type: file.type });
        setFile(centeredFile);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result);
          toast.success('✅ Face auto-centered successfully!', { id: 'auto-center' });
          
          // Re-detect face to update overlay
          setTimeout(() => {
            handleDetectFace();
          }, 500);
        };
        reader.readAsDataURL(centeredFile);
      }, file.type);

    } catch (error) {
      console.error('Auto-center error:', error);
      toast.error('Auto-centering failed', { id: 'auto-center' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select an image');
      return;
    }

    setLoading(true);
    const data = new FormData();
    data.append('file', file);
    
    Object.keys(formData).forEach(key => {
      if (formData[key] !== null && formData[key] !== undefined) {
        data.append(key, formData[key]);
      }
    });

    try {
      const response = await fetch(`${config.API_BASE_URL}/api/tools/passport-photo`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: data
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        // Get compliance status from response headers
        let complianceStatus = null;
        try {
          const complianceHeader = response.headers.get('X-Compliance-Status');
          if (complianceHeader) {
            complianceStatus = JSON.parse(complianceHeader);
          }
        } catch (parseError) {
          console.log('Failed to parse compliance status');
        }
        
        setResult({
          url,
          compliance: complianceStatus
        });
        
        // Show compliance toast
        if (complianceStatus && !complianceStatus.passed) {
          toast.error('Photo may not meet all requirements. Please check compliance report.');
        } else {
          toast.success('Passport photos generated successfully!');
        }
        await refreshUsage();
      } else {
        toast.error(await getProcessingErrorMessage(response));
      }
    } catch (error) {
      toast.error('An error occurred');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (result && result.url) {
      const a = document.createElement('a');
      a.href = result.url;
      a.download = 'passport-photos-' + Date.now() + '.jpg';
      a.click();
    }
  };

  // Common passport sizes
  const passportSizes = [
    { label: '2x2 inches (51x51 mm)', value: '2x2' },
    { label: '1x1 inches (25x25 mm)', value: '1x1' },
    { label: '1.5x1.5 inches (38x38 mm)', value: '1.5x1.5' },
    { label: '35x45 mm', value: '35x45' },
    { label: '35x35 mm', value: '35x35' },
    { label: '45x45 mm', value: '45x45' },
    { label: '50x50 mm', value: '50x50' },
    { label: '51x51 mm', value: '51x51' }
  ];
  
  // Country options - dynamically generated from database
  const countryOptions = Object.keys(passportCountries).map(code => ({
    label: passportCountries[code].name,
    value: code
  })).sort((a, b) => a.label.localeCompare(b.label));

  // Paper sizes
  const paperSizes = [
    { label: '4x6 inches', value: '4x6' },
    { label: '5x7 inches', value: '5x7' },
    { label: '8x10 inches', value: '8x10' },
    { label: 'A4 (210x297 mm)', value: 'A4' },
    { label: 'A5 (148x210 mm)', value: 'A5' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 mb-4 flex items-center group"
          >
            <svg className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Dashboard
          </button>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Advanced Passport Photo Maker</h1>
          <p className="text-gray-600 dark:text-gray-400 text-lg">Create professional passport photos with face detection and enhancement</p>
          <span className="inline-block mt-3 px-4 py-1.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded-full text-sm font-medium">
            Image Editing
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
              Upload Photo & Customize Settings
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* File Upload Zone */}
              <FileUploadZone
                file={file}
                onFileSelect={handleFileChange}
                preview={preview}
                accept="image/jpeg, image/png"
              />

              {/* File Info */}
              {fileInfo && (
                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
                  <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">File Information</h3>
                  <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    <p><span className="font-medium">Name:</span> {fileInfo.name}</p>
                    <p><span className="font-medium">Size:</span> {fileInfo.size} KB</p>
                    <p><span className="font-medium">Type:</span> {fileInfo.type}</p>
                  </div>
                </div>
              )}

              {/* AI Face Detection Button */}
              {file && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleDetectFace}
                    disabled={detectingFace || loading}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-lg flex items-center justify-center"
                  >
                    {detectingFace ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Detecting Face...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        🤖 Detect Face with AI
                      </>
                    )}
                  </button>

                  {/* Auto-Center Button */}
                  {faceDetection && faceDetection.success && (
                    <button
                      type="button"
                      onClick={handleAutoCenter}
                      disabled={loading || detectingFace}
                      className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95 shadow-lg flex items-center justify-center"
                    >
                      {loading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Auto-Centering...
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          🎯 Auto-Center Face
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* Face Detection Results */}
              {faceDetection && faceDetection.success && (
                <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg border border-green-200 dark:border-green-800">
                  <h3 className="font-medium text-green-800 dark:text-green-200 mb-2 flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Face Detected Successfully!
                  </h3>
                  <div className="text-sm text-green-700 dark:text-green-300 space-y-1">
                    <p><span className="font-medium">Confidence:</span> {(faceDetection.confidence * 100).toFixed(1)}%</p>
                    <p><span className="font-medium">Face Size:</span> {faceDetection.box.width}×{faceDetection.box.height}px</p>
                    <p><span className="font-medium">Eye Level:</span> {faceDetection.eyeLevel.toFixed(0)}px</p>
                  </div>
                </div>
              )}

              {/* Compliance Results */}
              {complianceResults && (
                <div className={`p-4 rounded-lg border ${complianceResults.overall ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800'}`}>
                  <h3 className={`font-medium mb-2 flex items-center ${complianceResults.overall ? 'text-green-800 dark:text-green-200' : 'text-yellow-800 dark:text-yellow-200'}`}>
                    {complianceResults.overall ? '✅ Compliance Check: PASSED' : '⚠️ Compliance Check: ISSUES FOUND'}
                  </h3>
                  <div className={`text-sm space-y-2 ${complianceResults.overall ? 'text-green-700 dark:text-green-300' : 'text-yellow-700 dark:text-yellow-300'}`}>
                    {Object.entries(complianceResults.checks).map(([key, check]) => (
                      <div key={key} className="flex items-start">
                        <span className="mr-2">{check.passed ? '✅' : '❌'}</span>
                        <div>
                          <p className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                          <p className="text-xs">{check.message} (Value: {check.value}, Expected: {check.expected})</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Country Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Country/Region
                </label>
                <select
                  value={formData.country}
                  onChange={(e) => setFormData({...formData, country: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {countryOptions.map((country) => (
                    <option key={country.value} value={country.value}>{country.label}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Select your country for specific passport requirements</p>
              </div>

              {/* Country Requirements Info */}
              {passportCountries[formData.country] && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                        📋 {passportCountries[formData.country].name} Requirements
                      </h3>
                      <div className="space-y-2 text-xs text-blue-800 dark:text-blue-300">
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">📏 Size:</span>
                          <span>{passportCountries[formData.country].size.width} × {passportCountries[formData.country].size.height} {passportCountries[formData.country].size.unit}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">🎨 Background:</span>
                          <span className="inline-block w-4 h-4 rounded border border-gray-300" style={{backgroundColor: passportCountries[formData.country].background}}></span>
                          <span>{passportCountries[formData.country].background === '#FFFFFF' ? 'White' : passportCountries[formData.country].background === '#F0F0F0' ? 'Light Grey' : 'Custom'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium">🎯 DPI:</span>
                          <span>{passportCountries[formData.country].dpi}</span>
                        </div>
                      </div>
                      <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                        <p className="text-xs font-medium text-blue-900 dark:text-blue-200 mb-2">✅ Compliance Rules:</p>
                        <ul className="space-y-1 text-xs text-blue-700 dark:text-blue-300">
                          {passportCountries[formData.country].requirements.map((rule, index) => (
                            <li key={index} className="flex items-start">
                              <span className="mr-2">•</span>
                              <span>{rule}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Passport Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Passport Size
                </label>
                <select
                  value={formData.size}
                  onChange={(e) => setFormData({...formData, size: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {passportSizes.map((size) => (
                    <option key={size.value} value={size.value}>{size.label}</option>
                  ))}
                </select>
              </div>

              {/* DPI */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  DPI (Dots Per Inch)
                </label>
                <select
                  value={formData.dpi}
                  onChange={(e) => setFormData({...formData, dpi: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="72">72 DPI (Screen)</option>
                  <option value="150">150 DPI (Standard)</option>
                  <option value="300">300 DPI (High Quality)</option>
                  <option value="600">600 DPI (Professional)</option>
                </select>
              </div>

              {/* Background Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Background Color
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="color"
                    value={formData.background}
                    onChange={(e) => setFormData({...formData, background: e.target.value})}
                    className="w-12 h-12 border-0 rounded cursor-pointer"
                  />
                  <select
                    value={formData.background}
                    onChange={(e) => setFormData({...formData, background: e.target.value})}
                    className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  >
                    <option value="#FFFFFF">White</option>
                    <option value="#000000">Black</option>
                    <option value="#0000FF">Blue</option>
                    <option value="#FF0000">Red</option>
                    <option value="#00FF00">Green</option>
                    <option value="#FFFF00">Yellow</option>
                  </select>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Number of Photos
                </label>
                <select
                  value={formData.quantity}
                  onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {[1, 2, 4, 6, 8, 9, 10, 12, 16].map((num) => (
                    <option key={num} value={num}>{num} photos</option>
                  ))}
                </select>
              </div>

              {/* Paper Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Paper Size
                </label>
                <select
                  value={formData.paperSize}
                  onChange={(e) => setFormData({...formData, paperSize: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  {paperSizes.map((size) => (
                    <option key={size.value} value={size.value}>{size.label}</option>
                  ))}
                </select>
              </div>

              {/* Enhance */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enhance"
                  checked={formData.enhance}
                  onChange={(e) => setFormData({...formData, enhance: e.target.checked})}
                  className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="enhance" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                  Enhance photo quality (sharpen, adjust brightness)
                </label>
              </div>
              
              {/* Compliance Check */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="complianceCheck"
                  checked={formData.complianceCheck}
                  onChange={(e) => setFormData({...formData, complianceCheck: e.target.checked})}
                  className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="complianceCheck" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                  Enable compliance checking
                </label>
              </div>
              
              {/* Advanced Compliance Checks */}
              {formData.complianceCheck && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg space-y-3">
                  <h3 className="font-medium text-indigo-800 dark:text-indigo-200">Advanced Compliance Checks</h3>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="headPositionCheck"
                      checked={formData.headPositionCheck}
                      onChange={(e) => setFormData({...formData, headPositionCheck: e.target.checked})}
                      className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <label htmlFor="headPositionCheck" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                      Head position analysis
                    </label>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="lightingCheck"
                      checked={formData.lightingCheck}
                      onChange={(e) => setFormData({...formData, lightingCheck: e.target.checked})}
                      className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <label htmlFor="lightingCheck" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                      Lighting quality check
                    </label>
                  </div>
                  
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="backgroundCheck"
                      checked={formData.backgroundCheck}
                      onChange={(e) => setFormData({...formData, backgroundCheck: e.target.checked})}
                      className="w-4 h-4 text-indigo-600 bg-gray-100 border-gray-300 rounded focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <label htmlFor="backgroundCheck" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                      Background color validation
                    </label>
                  </div>
                </div>
              )}

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
                    Generating...
                  </span>
                ) : 'Generate Passport Photos'}
              </button>
            </form>
          </div>

          {/* Result Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6 flex items-center">
              <svg className="w-6 h-6 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Result
            </h2>
            
            {result ? (
              <div className="space-y-6">
                <img src={result.url} alt="Result" className="w-full h-80 object-contain rounded-lg bg-gray-100 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600" />
                
                {/* Compliance Report */}
                {result.compliance && (
                  <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
                    <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Compliance Report</h3>
                    <div className="text-sm text-blue-700 dark:text-blue-300">
                      <p className="flex items-center mb-2">
                        <span className={`inline-block w-3 h-3 rounded-full mr-2 ${result.compliance.passed ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        Status: {result.compliance.passed ? 'Passed' : 'Issues Detected'}
                      </p>
                      {result.compliance.issues && result.compliance.issues.length > 0 && (
                        <div className="mt-2">
                          <p className="font-medium">Issues:</p>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            {result.compliance.issues.map((issue, index) => (
                              <li key={index}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.compliance.suggestions && result.compliance.suggestions.length > 0 && (
                        <div className="mt-2">
                          <p className="font-medium">Suggestions:</p>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            {result.compliance.suggestions.map((suggestion, index) => (
                              <li key={index}>{suggestion}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {result.compliance.details && (
                        <div className="mt-2">
                          <p className="font-medium">Details:</p>
                          <ul className="list-disc pl-5 mt-1 space-y-1">
                            {Object.entries(result.compliance.details).map(([key, value]) => (
                              <li key={key}>{key.charAt(0).toUpperCase() + key.slice(1)}: {value.toString()}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={handleDownload}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-4 px-6 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download Photos
                  </button>
                  <button
                    onClick={() => {
                      // Simulate print order functionality
                      toast.success('Print order functionality would be implemented here');
                    }}
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-4 px-6 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-lg flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Order Prints
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-80 bg-white dark:bg-gray-700 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-500">
                {loading ? (
                  <>
                    <svg className="animate-spin h-12 w-12 text-indigo-600 mb-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-gray-600 dark:text-gray-300 font-medium">Generating your passport photos...</p>
                  </>
                ) : (
                  <>
                    <svg className="w-20 h-20 text-gray-400 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                      <polyline points="21 15 16 10 5 21" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    </svg>
                    <p className="text-gray-500 dark:text-gray-400 text-center text-base px-8">
                      Upload and process a photo to generate passport photos
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

export default PassportPhotoTool;
