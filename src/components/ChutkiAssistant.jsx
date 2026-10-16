import React, { useState, useEffect, useRef, useCallback, lazy, Suspense, useMemo } from "react";
import { FaTimes, FaMicrophone, FaPaperPlane, FaUpload, FaCopy, FaTrash, FaExpand, FaCompress, FaSpinner } from "react-icons/fa";
import { motion, AnimatePresence } from "framer-motion";
import SpeechRecognition, { useSpeechRecognition } from "react-speech-recognition";
import config from '../config';
import { toolsConfig, getAllTools, searchTools, getToolByName } from '../toolsConfig';
import { useAuth } from '../context/AuthContext';
import { useUsage } from '../context/UsageContext';
import { getProcessingErrorMessage } from '../utils/quotaError';

// Lazy load heavy components
const EmojiPicker = lazy(() => import("emoji-picker-react"));

const ChutkiAssistant = React.memo(() => {
  const { user, isAuthenticated, token } = useAuth();
  const { refreshUsage } = useUsage();
  
  // Consolidated UI state
  const [uiState, setUiState] = useState({
    open: false,
    isExpanded: false,
    showEmojiPicker: false,
    isTyping: false,
    copiedMessageId: null,
    processingTool: null, // Track current tool processing
    showToolList: false // Show available tools
  });

  // Chat state with ULTRA-ADVANCED Predictive AI + Auto-Learning
  const [chatState, setChatState] = useState({
    messages: [],
    note: "",
    selectedFile: null,
    userIntent: null, // Track user's current intent
    suggestedTools: [], // AI-suggested tools based on context
    conversationContext: {}, // Remember key details from conversation
    userProfile: { // ULTRA-ADVANCED: Predictive Learning Profile
      preferredTools: {}, // Track tool usage frequency
      commonTasks: [], // Learn user's common workflows
      filePatterns: {}, // Remember typical file sizes/formats
      compressionPreferences: {}, // Learn preferred compression levels
      lastUsedParams: {}, // Remember last used parameters for each tool
      // NEW: Predictive Intelligence
      timePatterns: {}, // Learn when user uses which tools (time-based prediction)
      intentHistory: [], // Track intent evolution to predict next action
      successfulWorkflows: [], // Remember which workflows gave best results
      quickActions: [], // Auto-generated shortcuts based on 3+ repeated actions
      skillLevel: 'beginner', // Adaptive: beginner → intermediate → expert
      sessionGoals: [], // Predict user's session objective
      smartDefaults: {} // Learn user's preferred defaults per tool
    }
  });

  // ULTRA-ADVANCED: Load profile + Analyze session context on mount
  useEffect(() => {
    const savedProfile = localStorage.getItem('chutkiUserProfile');
    if (savedProfile) {
      try {
        const profile = JSON.parse(savedProfile);
        
        // AUTO-ANALYZE: Determine skill level from interaction count
        const totalInteractions = Object.values(profile.preferredTools || {}).reduce((sum, t) => sum + t.count, 0);
        let skillLevel = 'beginner';
        if (totalInteractions > 50) skillLevel = 'expert';
        else if (totalInteractions > 15) skillLevel = 'intermediate';
        
        // AUTO-GENERATE: Quick actions from repeated workflows
        const quickActions = [];
        if (profile.commonTasks && profile.commonTasks.length >= 3) {
          const workflows = {};
          profile.commonTasks.forEach(task => {
            if (task.tools && task.tools.length >= 2) {
              const pattern = task.tools.join(' → ');
              workflows[pattern] = (workflows[pattern] || 0) + 1;
            }
          });
          
          Object.entries(workflows).forEach(([pattern, count]) => {
            if (count >= 3) {
              quickActions.push({
                name: pattern.split(' → ').slice(0, 2).join(' + '),
                workflow: pattern.split(' → '),
                frequency: count,
                lastUsed: new Date()
              });
            }
          });
        }
        
        setChatState(prev => ({ 
          ...prev, 
          userProfile: { 
            ...prev.userProfile, 
            ...profile,
            skillLevel,
            quickActions
          }
        }));
        
        // PREDICTIVE: Show personalized welcome for returning users
        if (totalInteractions >= 5) {
          const currentHour = new Date().getHours();
          let greeting = 'Welcome back';
          if (currentHour >= 5 && currentHour < 12) greeting = 'Good morning';
          else if (currentHour >= 12 && currentHour < 17) greeting = 'Good afternoon';
          else if (currentHour >= 17 && currentHour < 22) greeting = 'Good evening';
          else greeting = 'Working late';
          
          setTimeout(() => {
            const quickActionsText = quickActions.length > 0 
              ? '\n\n**Quick Actions Available:**\n' + quickActions.slice(0, 2).map((qa, i) => `${i+1}. ${qa.name} (used ${qa.frequency}x)`).join('\n')
              : '';
            
            const welcomeBack = {
              id: Date.now(),
              role: 'assistant',
              content: `**${greeting}!**

I've learned from your **${totalInteractions} interactions**. I'm now at **${skillLevel}** mode to better assist you.${quickActionsText}

*What would you like to work on today?*`,
              timestamp: new Date()
            };
            setChatState(prev => ({ ...prev, messages: [welcomeBack] }));
          }, 500);
        }
      } catch (error) {
        console.log('No saved profile found, starting fresh');
      }
    }
  }, []);

  // ADVANCED: Save user profile to localStorage whenever it changes
  useEffect(() => {
    if (chatState.userProfile && Object.keys(chatState.userProfile.preferredTools).length > 0) {
      localStorage.setItem('chutkiUserProfile', JSON.stringify(chatState.userProfile));
    }
  }, [chatState.userProfile]);

  const [time, setTime] = useState("");
  const [currentIntroIndex, setCurrentIntroIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const timeIntervalRef = useRef(null);
  const introIntervalRef = useRef(null);

  // ALL 100+ TOOLS integrated from toolsConfig
  const allTools = useMemo(() => getAllTools(), []);
  
  // Memoized welcome message with REAL project capabilities
  const welcomeMessage = useMemo(() => ({
    id: Date.now(),
    role: 'assistant',
    content: `Hi! I'm **Chutki AI** — your image assistant with **${allTools.length} tools** ready.

Upload an image and try:
- **"Compress to 100KB"** — reduce file size
- **"Resize to 600x600"** — change dimensions
- **"Convert HEIC to JPG"** — change format
- **"Make passport photo"** — 35x45mm, 2x2 inch, etc.
- **"Remove background"** — AI cutout
- **"Extract text"** — OCR from image
- **"Show all tools"** — browse everything

Just upload and tell me what you need!`,
    timestamp: new Date()
  }), [allTools.length]);

  // Welcome message on first load
  useEffect(() => {
    if (chatState.messages.length === 0) {
      setChatState(prev => ({ ...prev, messages: [welcomeMessage] }));
    }
  }, [chatState.messages.length, welcomeMessage]);



  // Optimized copy message function
  const copyMessage = useCallback((content) => {
    navigator.clipboard.writeText(content);
    const copyId = Date.now();
    setUiState(prev => ({ ...prev, copiedMessageId: copyId }));
    setTimeout(() => {
      setUiState(prev => ({ ...prev, copiedMessageId: null }));
    }, 2000);
  }, []);

  // Optimized clear chat function
  const clearChat = useCallback(() => {
    const welcomeMessage = {
      id: Date.now(),
      role: 'assistant',
      content: 'Chat cleared. Upload an image and tell me what to do!',
      timestamp: new Date()
    };
    setChatState(prev => ({ ...prev, messages: [welcomeMessage] }));
  }, []);

  const { transcript, resetTranscript, listening: isListening } = useSpeechRecognition();

  // Optimized time & greeting with proper cleanup
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = now.getHours();
      const mins = now.getMinutes().toString().padStart(2, "0");
      const secs = now.getSeconds().toString().padStart(2, "0");
      const ampm = hrs >= 12 ? "PM" : "AM";
      const hour12 = hrs % 12 || 12;

      let greeting = "";
      if (hrs >= 5 && hrs < 12) greeting = "Good Morning";
      else if (hrs === 12) greeting = "Good Noon";
      else if (hrs > 12 && hrs < 17) greeting = "Good Afternoon";
      else if (hrs >= 17 && hrs < 21) greeting = "Good Evening";
      else greeting = "Good Night";

      setTime(`${greeting}, it's ${hour12}:${mins}:${secs} ${ampm}`);
    };

    updateTime();
    timeIntervalRef.current = setInterval(updateTime, 1000);

    return () => {
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
      }
    };
  }, []);

  // Optimized typewriter effect with smoother performance
  useEffect(() => {
    const introMessages = [
    "Hello!",
    "I'm Chutki Assistant",
    "What's needed today?",
    "AI Powered Assistant"
    ];

    let animationId;
    let lastTime = 0;
    const typingSpeed = 120; // Natural typing speed
    const deletingSpeed = 80; // Moderate deleting speed
    const pauseDuration = 2100; // Comfortable reading pause

    const animate = (currentTime) => {
      const currentMessage = introMessages[currentIntroIndex];

      if (currentTime - lastTime >= (isDeleting ? deletingSpeed : typingSpeed)) {
        if (isTyping && !isDeleting) {
          // Typing phase
          if (displayedText.length < currentMessage.length) {
            setDisplayedText(prev => currentMessage.slice(0, prev.length + 1));
          } else {
            // Finished typing, start pause
            setIsTyping(false);
            setTimeout(() => setIsDeleting(true), pauseDuration);
          }
        } else if (isDeleting) {
          // Deleting phase
          if (displayedText.length > 0) {
            setDisplayedText(prev => prev.slice(0, -1));
          } else {
            // Finished deleting, move to next
            setIsDeleting(false);
            setIsTyping(true);
            setCurrentIntroIndex(prev => (prev + 1) % introMessages.length);
          }
        }
        lastTime = currentTime;
      }

      animationId = requestAnimationFrame(animate);
    };

    animationId = requestAnimationFrame(animate);

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [currentIntroIndex, displayedText, isTyping, isDeleting]);

  // Get current displayed text for typewriter effect
  const getCurrentIntroMessage = () => {
    return displayedText;
  };

  // ULTRA-ADVANCED: Update profile + Predictive learning + Auto-optimization
  const updateUserProfile = useCallback((toolName, params = {}) => {
    setChatState(prev => {
      const newProfile = { ...prev.userProfile };
      
      // Track tool usage frequency
      if (!newProfile.preferredTools[toolName]) {
        newProfile.preferredTools[toolName] = { count: 0, lastUsed: new Date(), avgTime: 0 };
      }
      newProfile.preferredTools[toolName].count += 1;
      newProfile.preferredTools[toolName].lastUsed = new Date();
      
      // NEW: Time-based pattern learning (predict when user uses which tool)
      const currentHour = new Date().getHours();
      if (!newProfile.timePatterns[toolName]) {
        newProfile.timePatterns[toolName] = {};
      }
      newProfile.timePatterns[toolName][currentHour] = (newProfile.timePatterns[toolName][currentHour] || 0) + 1;
      
      // NEW: Smart defaults learning (remember successful parameter combinations)
      if (Object.keys(params).length > 0) {
        if (!newProfile.smartDefaults[toolName]) {
          newProfile.smartDefaults[toolName] = [];
        }
        newProfile.smartDefaults[toolName].push({ params, timestamp: new Date() });
        // Keep only last 5 successful params
        if (newProfile.smartDefaults[toolName].length > 5) {
          newProfile.smartDefaults[toolName] = newProfile.smartDefaults[toolName].slice(-5);
        }
        newProfile.lastUsedParams[toolName] = params;
      }
      
      // Track common tasks (workflows)
      if (newProfile.commonTasks.length > 0) {
        const lastTask = newProfile.commonTasks[newProfile.commonTasks.length - 1];
        if (Date.now() - new Date(lastTask.timestamp).getTime() < 300000) { // Within 5 min
          lastTask.tools.push(toolName);
          // NEW: Track workflow success
          if (!lastTask.success) lastTask.success = 0;
          lastTask.success += 1;
        } else {
          newProfile.commonTasks.push({ tools: [toolName], timestamp: new Date(), success: 1 });
        }
      } else {
        newProfile.commonTasks.push({ tools: [toolName], timestamp: new Date(), success: 1 });
      }
      
      // NEW: Identify successful workflows (3+ tools with high success rate)
      const recentWorkflows = newProfile.commonTasks.slice(-10);
      recentWorkflows.forEach(task => {
        if (task.tools.length >= 2 && task.success >= 2) {
          const workflowKey = task.tools.join(' → ');
          const existing = (newProfile.successfulWorkflows || []).find(w => w.pattern === workflowKey);
          if (existing) {
            existing.count += 1;
            existing.lastUsed = new Date();
          } else {
            if (!newProfile.successfulWorkflows) newProfile.successfulWorkflows = [];
            newProfile.successfulWorkflows.push({
              pattern: workflowKey,
              tools: task.tools,
              count: 1,
              lastUsed: new Date()
            });
          }
        }
      });
      
      // Keep only last 20 tasks to prevent bloat
      if (newProfile.commonTasks.length > 20) {
        newProfile.commonTasks = newProfile.commonTasks.slice(-20);
      }
      
      // NEW: Auto-calculate skill level progression
      const totalInteractions = Object.values(newProfile.preferredTools).reduce((sum, t) => sum + t.count, 0);
      if (totalInteractions > 50) newProfile.skillLevel = 'expert';
      else if (totalInteractions > 15) newProfile.skillLevel = 'intermediate';
      else newProfile.skillLevel = 'beginner';
      
      return { ...prev, userProfile: newProfile };
    });
  }, []);

  // ULTRA-ADVANCED: Predictive recommendations with time-based AI + context prediction
  const getPersonalizedRecommendations = useCallback(() => {
    const { preferredTools, commonTasks, lastUsedParams, timePatterns, successfulWorkflows, smartDefaults, skillLevel, intentHistory } = chatState.userProfile;
    const recommendations = [];
    const currentHour = new Date().getHours();
    
    // NEW: Time-based predictions (predict tools based on current time)
    const timePredictions = [];
    Object.entries(timePatterns || {}).forEach(([tool, hours]) => {
      const usageAtThisHour = hours[currentHour] || 0;
      if (usageAtThisHour >= 2) {
        timePredictions.push({
          tool,
          score: usageAtThisHour,
          reason: `You usually use this at ${currentHour}:00 (${usageAtThisHour}x)`
        });
      }
    });
    
    // Add time-based predictions first (highest priority)
    timePredictions.sort((a, b) => b.score - a.score).slice(0, 1).forEach(pred => {
      recommendations.push({
        tool: pred.tool,
        reason: pred.reason,
        params: smartDefaults?.[pred.tool]?.[0]?.params || lastUsedParams[pred.tool] || {},
        priority: 'time-based',
        predictive: true
      });
    });
    
    // Get top most used tools
    const sortedTools = Object.entries(preferredTools || {})
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);
    
    sortedTools.forEach(([tool, data]) => {
      // Skip if already recommended by time-based prediction
      if (timePredictions.find(p => p.tool === tool)) return;
      
      // NEW: Show smart defaults if available
      const defaults = smartDefaults?.[tool];
      let paramInfo = '';
      if (defaults && defaults.length > 0) {
        const mostCommon = defaults[defaults.length - 1].params;
        paramInfo = ` | Default: ${JSON.stringify(mostCommon).slice(0, 30)}`;
      }
      
      recommendations.push({
        tool,
        reason: `Used ${data.count}x${paramInfo}`,
        params: defaults?.[0]?.params || lastUsedParams[tool] || {},
        priority: 'high'
      });
    });
    
    // NEW: Successful workflow predictions
    if (successfulWorkflows && successfulWorkflows.length > 0) {
      const topWorkflow = successfulWorkflows
        .sort((a, b) => b.count - a.count)[0];
      
      if (topWorkflow && topWorkflow.count >= 2) {
        recommendations.push({
          workflow: topWorkflow.pattern,
          tools: topWorkflow.tools,
          reason: `Proven workflow (${topWorkflow.count}x success)`,
          priority: 'workflow',
          predictive: true
        });
      }
    }
    
    // NEW: Intent-based next action prediction
    if (intentHistory && intentHistory.length >= 2) {
      const lastIntent = intentHistory[intentHistory.length - 1];
      const intentSequences = {};
      
      for (let i = 0; i < intentHistory.length - 1; i++) {
        const sequence = `${intentHistory[i]} → ${intentHistory[i + 1]}`;
        intentSequences[sequence] = (intentSequences[sequence] || 0) + 1;
      }
      
      const likelyNext = Object.entries(intentSequences)
        .filter(([seq]) => seq.startsWith(lastIntent))
        .sort((a, b) => b[1] - a[1])[0];
      
      if (likelyNext && likelyNext[1] >= 2) {
        const nextIntent = likelyNext[0].split(' → ')[1];
        recommendations.push({
          intent: nextIntent,
          reason: `You usually do "${nextIntent}" after "${lastIntent}" (${likelyNext[1]}x)`,
          priority: 'predictive',
          predictive: true
        });
      }
    }
    
    return recommendations;
  }, [chatState.userProfile]);

  // NEW: Direct tool execution function
  const executeToolDirectly = useCallback(async (toolName, params = {}) => {
    if (!chatState.selectedFile || chatState.selectedFile.length === 0) {
      const errorMsg = {
        id: Date.now(),
        role: 'assistant',
        content: `**No Image Uploaded**

Please upload an image first, then I can process it with **${toolName}**!

*Click the upload button or drag & drop your image.*`,
        timestamp: new Date()
      };
      setChatState(prev => ({ ...prev, messages: [...prev.messages, errorMsg] }));
      return;
    }

    const tool = getToolByName(toolName);
    if (!tool) {
      const errorMsg = {
        id: Date.now(),
        role: 'assistant',
        content: `**Tool Not Found**\n\nCouldn't find tool: ${toolName}`,
        timestamp: new Date()
      };
      setChatState(prev => ({ ...prev, messages: [...prev.messages, errorMsg] }));
      return;
    }

    setUiState(prev => ({ ...prev, processingTool: toolName }));
    
    const processingMsg = {
      id: Date.now(),
      role: 'assistant',
      content: `**Processing with ${toolName}...**\n\nPlease wait while I process your image${Object.keys(params).length > 0 ? ` with parameters: ${JSON.stringify(params)}` : ''}.`,
      timestamp: new Date()
    };
    setChatState(prev => ({ ...prev, messages: [...prev.messages, processingMsg] }));

    try {
      const formData = new FormData();
      formData.append('file', chatState.selectedFile[0]);
      
      // Add parameters
      Object.keys(params).forEach(key => {
        formData.append(key, params[key]);
      });

      const response = await fetch(tool.endpoint, {
        method: tool.method,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });

      if (response.ok) {
        // Update user profile with tool usage
        updateUserProfile(toolName, params);
        
        if (tool.returnsJson) {
          const data = await response.json();
          const resultMsg = {
            id: Date.now(),
            role: 'assistant',
            content: `**Processing Complete — ${toolName}**

**Result:**
${JSON.stringify(data, null, 2)}

*Processing completed successfully!*`,
            timestamp: new Date()
          };
          setChatState(prev => ({ ...prev, messages: [...prev.messages, resultMsg] }));
        } else {
          // Download the processed file
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${toolName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.${tool.name.includes('PDF') ? 'pdf' : 'jpg'}`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          
          const successMsg = {
            id: Date.now(),
            role: 'assistant',
            content: `**Done — ${toolName}**

**Your image has been processed and downloaded!**

*Want to process another image? Just upload and tell me what you need!*`,
            timestamp: new Date()
          };
          setChatState(prev => ({ ...prev, messages: [...prev.messages, successMsg] }));
        }
        await refreshUsage();
      } else {
        const errorMessage = await getProcessingErrorMessage(response);
        const errorMsg = {
          id: Date.now(),
          role: 'assistant',
          content: `**处理失败**

**提示：** ${errorMessage}

*请稍后重试，或选择其他图片工具。*`,
          timestamp: new Date()
        };
        setChatState(prev => ({ ...prev, messages: [...prev.messages, errorMsg] }));
      }
    } catch (error) {
      console.error('Tool execution error:', error);
      const errorMsg = {
        id: Date.now(),
        role: 'assistant',
        content: `**❌ Connection Error**

Failed to connect to the tool server. Please check your internet connection and try again.

*Error: ${error.message}*`,
        timestamp: new Date()
      };
      setChatState(prev => ({ ...prev, messages: [...prev.messages, errorMsg] }));
    } finally {
      setUiState(prev => ({ ...prev, processingTool: null }));
    }
  }, [chatState.selectedFile, refreshUsage, token, updateUserProfile]);

  // NEW: Show all tools list
  const showAllTools = useCallback(() => {
    const categories = Object.keys(toolsConfig);
    let toolsList = `**All ${allTools.length} Available Tools:**\n\n`;
    
    categories.forEach(category => {
      const tools = toolsConfig[category];
      toolsList += `**${category}** (${tools.length} tools)\n`;
      tools.slice(0, 5).forEach((tool, i) => {
        toolsList += `${i + 1}. ${tool.name}\n`;
      });
      if (tools.length > 5) {
        toolsList += `... and ${tools.length - 5} more\n`;
      }
      toolsList += `\n`;
    });
    
    toolsList += `Say **"use [tool name]"** with an uploaded image to run it directly.`;
    
    const toolsMsg = {
      id: Date.now(),
      role: 'assistant',
      content: toolsList,
      timestamp: new Date()
    };
    setChatState(prev => ({ ...prev, messages: [...prev.messages, toolsMsg] }));
  }, [allTools.length]);

  const analyzeUserIntent = useCallback((message) => {
    const lowerMessage = message.toLowerCase();
    const suggestions = [];
    let intent = 'general';
    
    // ULTRA-ADVANCED: Predictive + context-aware recommendations + REAL TOOL PROCESSING
    const personalRecs = getPersonalizedRecommendations();
    
    // NEW: Auto-suggest even without explicit request (if predictive flag is set)
    const shouldAutoSuggest = personalRecs.some(r => r.predictive) || /recommend|suggest|help|what|how|show.*tool/i.test(message);
    
    // NEW: Check for direct tool execution commands
    const commandMatch = message.match(/^(compress|convert|resize|remove|extract|create|make|generate)\s+(.+)/i);
    if (commandMatch) {
      const action = commandMatch[1].toLowerCase();
      const params = commandMatch[2];
      
      // Parse compression commands: "compress to 100KB"
      if (action === 'compress' && /to\s+(\d+)\s*kb/i.test(params)) {
        const targetKB = parseInt(params.match(/to\s+(\d+)\s*kb/i)[1]);
        intent = 'compression';
        suggestions.push({
          tool: 'Reduce Image Size in KB',
          reason: `Direct command detected: Compress to ${targetKB}KB`,
          params: { targetKB },
          executable: true,
          priority: 'command'
        });
      }
      // "convert HEIC to JPG"
      else if (action === 'convert' && /heic.*jpg/i.test(params)) {
        intent = 'conversion';
        suggestions.push({
          tool: 'HEIC to JPG',
          reason: 'Direct command: HEIC to JPG conversion',
          executable: true,
          priority: 'command'
        });
      }
      // "remove background"
      else if (action === 'remove' && /background/i.test(params)) {
        intent = 'background';
        suggestions.push({
          tool: 'Remove Image Background',
          reason: 'Direct command: Background removal',
          executable: true,
          priority: 'command'
        });
      }
      // "extract text" or "OCR"
      else if ((action === 'extract' && /text/i.test(params)) || /ocr/i.test(message)) {
        intent = 'ocr';
        suggestions.push({
          tool: 'JPG to Text',
          reason: 'Direct command: Text extraction (OCR)',
          executable: true,
          priority: 'command'
        });
      }
      // "make passport photo 35x45mm"
      else if ((action === 'make' || action === 'create' || action === 'generate') && /passport/i.test(params)) {
        intent = 'passport';
        const sizeMatch = params.match(/(\d+)\s*x\s*(\d+)\s*mm/i);
        suggestions.push({
          tool: 'Passport Photo Maker',
          reason: sizeMatch ? `Direct command: Passport photo ${sizeMatch[0]}` : 'Direct command: Passport photo generator',
          params: sizeMatch ? { size: `${sizeMatch[1]}x${sizeMatch[2]}` } : {},
          executable: true,
          priority: 'command'
        });
      }
    }
    
    // NEW: "show all tools" command
    if (/show.*tool|list.*tool|all.*tool|available.*tool|what.*can.*you/i.test(message)) {
      intent = 'browse';
      suggestions.push({
        action: 'showToolList',
        reason: '📋 Showing all available tools',
        priority: 'command'
      });
    }
    
    if (personalRecs.length > 0 && shouldAutoSuggest) {
      personalRecs.forEach(rec => {
        if (rec.tool) {
          suggestions.push({
            tool: rec.tool,
            reason: rec.reason,
            params: rec.params,
            personalized: true,
            predictive: rec.predictive || false,
            priority: rec.priority
          });
        } else if (rec.workflow) {
          suggestions.push({
            workflow: rec.workflow,
            tools: rec.tools,
            reason: rec.reason,
            priority: rec.priority,
            predictive: true
          });
        } else if (rec.intent) {
          intent = rec.intent; // Override detected intent with predicted intent
        }
      });
    }
    
    // NEW: Track intent for future predictions
    setChatState(prev => ({
      ...prev,
      userProfile: {
        ...prev.userProfile,
        intentHistory: [...(prev.userProfile.intentHistory || []), intent].slice(-15)
      }
    }));

    // Compression intent detection
    if (/compress|reduce|smaller|size|kb|mb/i.test(message)) {
      intent = 'compression';
      const sizeMatch = message.match(/(\d+)\s*(kb|mb)/i);
      if (sizeMatch) {
        suggestions.push({
          tool: 'Smart Compression',
          reason: `Detected target size: ${sizeMatch[0]}`,
          endpoint: '/api/tools/reduce-size-kb',
          params: { targetKB: sizeMatch[2] === 'mb' ? parseInt(sizeMatch[1]) * 1024 : parseInt(sizeMatch[1]) }
        });
      } else {
        suggestions.push(
          { tool: 'Compress 100KB', reason: 'Popular choice for web optimization' },
          { tool: 'Compress 50KB', reason: 'Great for email attachments' },
          { tool: 'Compress 20KB', reason: 'Ultra-light compression' }
        );
      }
    }

    // Format conversion intent
    if (/convert|change|format|heic|webp|png|jpg|jpeg/i.test(message)) {
      intent = 'conversion';
      if (/heic/i.test(message)) {
        suggestions.push({ tool: 'HEIC to JPG', reason: 'iPhone photo format conversion' });
      }
      if (/webp/i.test(message)) {
        suggestions.push({ tool: 'WEBP to JPG', reason: 'Modern web format to universal JPG' });
      }
      if (/png.*jpg|jpg.*png/i.test(message)) {
        suggestions.push(
          { tool: 'PNG to JPEG', reason: 'Reduce file size with background' },
          { tool: 'JPEG to PNG', reason: 'Get transparency support' }
        );
      }
    }

    // Background removal intent
    if (/background|remove|transparent|cutout/i.test(message)) {
      intent = 'background';
      suggestions.push(
        { tool: 'Remove Background', reason: 'AI-powered background removal' },
        { tool: 'JPEG to PNG', reason: 'Convert to support transparency' }
      );
    }

    // Passport photo intent
    if (/passport|photo|visa|id|2x2|3x4|4x6/i.test(message)) {
      intent = 'passport';
      const sizeMatch = message.match(/(\d+)\s*x\s*(\d+)/i);
      suggestions.push({
        tool: 'Passport Photo Generator',
        reason: sizeMatch ? `Custom size: ${sizeMatch[0]}` : 'Standard passport photo sizes',
        params: sizeMatch ? { size: `${sizeMatch[1]}x${sizeMatch[2]}` } : {}
      });
    }

    // OCR/Text extraction intent
    if (/text|ocr|extract|read|words|document/i.test(message)) {
      intent = 'ocr';
      suggestions.push({ tool: 'OCR Text Extraction', reason: 'Extract text from images using Tesseract' });
    }

    // Resize intent
    if (/resize|dimensions|pixel|width|height|scale/i.test(message)) {
      intent = 'resize';
      const dimensionMatch = message.match(/(\d+)\s*x\s*(\d+)\s*(px|pixel)?/i);
      suggestions.push({
        tool: 'Resize Image',
        reason: dimensionMatch ? `Target: ${dimensionMatch[0]}` : 'Custom dimensions',
        params: dimensionMatch ? { width: dimensionMatch[1], height: dimensionMatch[2] } : {}
      });
    }

    // PDF intent
    if (/pdf|document|merge/i.test(message)) {
      intent = 'pdf';
      suggestions.push(
        { tool: 'Image to PDF', reason: 'Convert images to PDF document' },
        { tool: 'PDF Compression', reason: 'Reduce PDF file size' }
      );
    }

    // Watermark intent
    if (/watermark|copyright|logo|brand/i.test(message)) {
      intent = 'watermark';
      suggestions.push({ tool: 'Add Watermark', reason: 'Protect your images with custom watermark' });
    }

    // Effects intent
    if (/gray|black.*white|pixelate|blur|effect|filter/i.test(message)) {
      intent = 'effects';
      if (/gray/i.test(message)) suggestions.push({ tool: 'Grayscale', reason: 'Convert to black & white' });
      if (/pixel/i.test(message)) suggestions.push({ tool: 'Pixelate', reason: 'Create pixel art effect' });
      if (/circle/i.test(message)) suggestions.push({ tool: 'Circle Crop', reason: 'Round profile picture' });
    }

    // Batch processing intent
    if (/multiple|batch|all|several/i.test(message)) {
      suggestions.push({ tool: 'Batch Processing', reason: 'Process multiple images at once' });
    }

    // ADVANCED: Learn from file patterns if files are uploaded
    if (chatState.selectedFile && chatState.selectedFile.length > 0) {
      const files = Array.from(chatState.selectedFile);
      const avgSize = files.reduce((sum, f) => sum + f.size, 0) / files.length / 1024; // KB
      const formats = [...new Set(files.map(f => f.type.split('/')[1]))];
      
      // Update file pattern learning
      setChatState(prev => ({
        ...prev,
        userProfile: {
          ...prev.userProfile,
          filePatterns: {
            avgFileSize: avgSize,
            commonFormats: formats,
            lastUploadCount: files.length
          }
        }
      }));
      
      // Smart suggestions based on file size
      if (avgSize > 2000 && intent === 'general') {
        intent = 'compression';
        suggestions.unshift({
          tool: 'Smart Compression',
          reason: `Large files detected (avg ${(avgSize/1024).toFixed(1)}MB) — Compression recommended`,
          smart: true
        });
      }
    }
    
    return { intent, suggestions };
  }, []);

  // Enhanced send message with intelligent context tracking + Smart Learning
  const sendChatMessage = useCallback(async (message) => {
    if (!message.trim()) return;

    // Analyze intent before sending
    const { intent, suggestions } = analyzeUserIntent(message);
    
    // ADVANCED: Track interaction patterns
    const interactionTime = new Date().getHours();
    setChatState(prev => ({
      ...prev,
      userProfile: {
        ...prev.userProfile,
        interactionPatterns: {
          ...prev.userProfile.interactionPatterns,
          peakHours: [...(prev.userProfile.interactionPatterns?.peakHours || []), interactionTime]
        }
      }
    }));

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: message,
      timestamp: new Date()
    };
    
    // Update context with detected intent and suggestions
    setChatState(prev => ({ 
      ...prev, 
      messages: [...prev.messages, userMessage], 
      note: '',
      userIntent: intent,
      suggestedTools: suggestions,
      conversationContext: {
        ...prev.conversationContext,
        lastIntent: intent,
        lastMessage: message,
        fileCount: prev.selectedFile?.length || 0
      }
    }));
    
    setUiState(prev => ({ ...prev, isTyping: true }));

    try {
      // Build enriched context for AI
      let contextMessage = message;
      
      // Add file context
      if (chatState.selectedFile && chatState.selectedFile.length > 0) {
        const fileInfo = Array.from(chatState.selectedFile).map(f => 
          `${f.name} (${f.type}, ${(f.size / 1024).toFixed(1)}KB)`
        ).join(', ');
        contextMessage += `\n\n[Context: User has ${chatState.selectedFile.length} file(s) uploaded: ${fileInfo}]`;
      }

      // Add detected intent context
      if (suggestions.length > 0) {
        contextMessage += `\n[Detected Intent: ${intent}]`;
        contextMessage += `\n[Suggested Tools: ${suggestions.map(s => s.tool).join(', ')}]`;
      }

      // Add conversation history context
      if (chatState.conversationContext.lastIntent) {
        contextMessage += `\n[Previous Intent: ${chatState.conversationContext.lastIntent}]`;
      }

      const response = await fetch(`${config.API_BASE_URL}/api/chatgpt/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: contextMessage,
          conversationHistory: chatState.messages.slice(-10).map(m => ({ 
            role: m.role, 
            content: m.content 
          }))
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Enhanced AI response with tool suggestions + Smart Learning
        let aiResponse = data.response;
        
        // Check for direct tool execution request
        const executableSugs = suggestions.filter(s => s.executable);
        const showToolListAction = suggestions.find(s => s.action === 'showToolList');
        
        if (showToolListAction) {
          // Show all available tools
          showAllTools();
          return;
        }
        
        if (executableSugs.length > 0 && chatState.selectedFile && chatState.selectedFile.length > 0) {
          // Execute tool directly if user uploaded image and gave clear command
          const toolToExecute = executableSugs[0];
          await executeToolDirectly(toolToExecute.tool, toolToExecute.params || {});
          return;
        }
        
        // Enhanced AI response with tool suggestions + Smart Learning
        const { preferredTools, commonTasks, skillLevel, successfulWorkflows, quickActions } = chatState.userProfile;
        const totalInteractions = Object.values(preferredTools || {}).reduce((sum, t) => sum + t.count, 0);
        
        // NEW: Skill-adaptive responses (different detail levels for different users)
        const isExpert = skillLevel === 'expert';
        const isIntermediate = skillLevel === 'intermediate';
        
        // Show advanced insights for returning users
        if (totalInteractions >= 5 && suggestions.length > 0) {
          const predictiveSugs = suggestions.filter(s => s.predictive);
          const personalizedSugs = suggestions.filter(s => s.personalized && !s.predictive);
          const smartSugs = suggestions.filter(s => s.smart);
          const workflowSugs = suggestions.filter(s => s.workflow);
          
          // NEW: Show predictive suggestions first (AI's predictions)
          if (predictiveSugs.length > 0) {
            aiResponse += `\n\n**AI Predictions (Based on your patterns):**\n`;
            predictiveSugs.slice(0, 2).forEach((s, i) => {
              if (s.tool) {
                aiResponse += `${i + 1}. **${s.tool}** - ${s.reason}`;
                if (s.params && Object.keys(s.params).length > 0 && isExpert) {
                  aiResponse += ` \`${JSON.stringify(s.params)}\``;
                }
                aiResponse += `\n`;
              } else if (s.workflow) {
                aiResponse += `${i + 1}. **Quick Workflow:** ${s.tools.join(' → ')} - ${s.reason}\n`;
              }
            });
          }
          
          // Show favorite tools
          if (personalizedSugs.length > 0) {
            aiResponse += `\n**Your Top Tools (${totalInteractions} total uses):**\n`;
            personalizedSugs.slice(0, 2).forEach((s, i) => {
              aiResponse += `${i + 1}. **${s.tool}** - ${s.reason}\n`;
            });
          }
          
          // NEW: Show successful workflows with success rate
          if (successfulWorkflows && successfulWorkflows.length > 0) {
            const topWorkflow = successfulWorkflows.sort((a, b) => b.count - a.count)[0];
            if (topWorkflow.count >= 2) {
              aiResponse += `\n**Proven Workflow:** ${topWorkflow.pattern} \n*Success: ${topWorkflow.count}x | Last used: ${new Date(topWorkflow.lastUsed).toLocaleDateString()}*\n`;
            }
          }
          
          // NEW: Quick actions for expert users
          if (isExpert && quickActions && quickActions.length > 0) {
            aiResponse += `\n**Quick Actions Available:**\n`;
            quickActions.slice(0, 2).forEach((qa, i) => {
              aiResponse += `${i + 1}. **${qa.name}** - Used ${qa.frequency}x\n`;
            });
          }
          
          // Smart file-based suggestions
          if (smartSugs.length > 0) {
            aiResponse += `\n**Smart File Analysis:**\n`;
            smartSugs.slice(0, 2).forEach((s, i) => {
              aiResponse += `${i + 1}. **${s.tool}** - ${s.reason}\n`;
            });
          }
          
          // NEW: Skill-based tips
          if (isIntermediate) {
            aiResponse += `\n*Tip: You're at intermediate level! Try batch processing for efficiency.*`;
          } else if (isExpert) {
            aiResponse += `\n*Expert mode active! I'll provide advanced parameter suggestions.*`;
          }
        } else if (suggestions.length > 0) {
          // Beginner-friendly suggestions
          aiResponse += `\n\n**Recommended for You:**\n`;
          suggestions.slice(0, 3).forEach((s, i) => {
            if (s.tool) {
              aiResponse += `${i + 1}. **${s.tool}** - ${s.reason}\n`;
            }
          });
          aiResponse += `\n*I'm learning your preferences! The more you use, the smarter I get.*`;
        } else if (executableSugs.length > 0) {
          aiResponse += `\n\n**Quick Execute:** Upload an image and say "go" or "process" to execute **${executableSugs[0].tool}** immediately!`;
        }
        
        if (suggestions.length > 0) {
          aiResponse += `\n\n*Upload images to get started! Say "go" or "use [tool name]" to process.*`;
        }

        const aiMessage = {
          id: Date.now(),
          role: 'assistant',
          content: aiResponse,
          timestamp: new Date(),
          suggestions // Store suggestions with message
        };
        setChatState(prev => ({ ...prev, messages: [...prev.messages, aiMessage] }));
      } else {
        const errorData = await response.json();
        const errorMessage = {
          id: Date.now(),
          role: 'assistant',
          content: `**Error:** ${errorData.error}\n\nPlease check your OpenAI API key configuration in backend/.env`,
          timestamp: new Date()
        };
        setChatState(prev => ({ ...prev, messages: [...prev.messages, errorMessage] }));
      }
    } catch (error) {
      const errorMessage = {
        id: Date.now(),
        role: 'assistant',
        content: '**Connection Error**\n\nI\'m having trouble connecting to the server. Please check your internet connection and ensure the backend is running.',
        timestamp: new Date()
      };
      setChatState(prev => ({ ...prev, messages: [...prev.messages, errorMessage] }));
    } finally {
      setUiState(prev => ({ ...prev, isTyping: false }));
    }
  }, [chatState.selectedFile, chatState.messages, chatState.conversationContext, chatState.userProfile, analyzeUserIntent, getPersonalizedRecommendations, executeToolDirectly, showAllTools]);

  // Voice Commands - send to AI chat
  useEffect(() => {
    if (!isListening && transcript) {
      sendChatMessage(transcript);
      resetTranscript();
    }
  }, [isListening, transcript, sendChatMessage, resetTranscript]);

  const handleFileSelect = useCallback((event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const fileNames = Array.from(files).map(f => f.name).join(', ');
      
      // ULTRA-ADVANCED: Intelligent file analysis + predictive workflow
      const filesArray = Array.from(files);
      const avgSize = filesArray.reduce((sum, f) => sum + f.size, 0) / files.length / 1024; // KB
      const formats = [...new Set(filesArray.map(f => f.type.split('/')[1] || 'unknown'))];
      const totalSize = filesArray.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024; // MB
      const minSize = Math.min(...filesArray.map(f => f.size / 1024));
      const maxSize = Math.max(...filesArray.map(f => f.size / 1024));
      
      // Get predictive recommendations
      const personalRecs = getPersonalizedRecommendations();
      const { skillLevel, smartDefaults, successfulWorkflows } = chatState.userProfile;
      
      let smartSuggestions = '';
      let predictedAction = null;
      
      // NEW: Predict user's goal based on file characteristics + history
      if (avgSize > 2000) {
        predictedAction = 'compression';
        smartSuggestions += `\n\n**AI Analysis:** Large files (${(avgSize/1024).toFixed(1)}MB avg, ${(maxSize/1024).toFixed(1)}MB max)`;
        
        // Smart compression target based on user's past preferences
        const compressionDefaults = smartDefaults?.['Smart Compression'] || smartDefaults?.['Compress 100KB'];
        if (compressionDefaults && compressionDefaults.length > 0) {
          const lastTarget = compressionDefaults[compressionDefaults.length - 1].params.targetKB;
          smartSuggestions += `\n**Predicted Action:** Compress to ${lastTarget}KB (your usual preference)`;
        } else {
          smartSuggestions += `\n**AI Suggests:** Compress to 100KB for web, or 50KB for thumbnails`;
        }
      } else if (avgSize > 500) {
        predictedAction = 'optimization';
        smartSuggestions += `\n\n**AI Analysis:** Medium files (${avgSize.toFixed(0)}KB avg)`;
        smartSuggestions += `\n**AI Suggests:** Light compression to 100KB or format optimization`;
      } else {
        smartSuggestions += `\n\n**AI Analysis:** Optimized files (${avgSize.toFixed(0)}KB avg)`;
      }
      
      // Format-specific predictions
      if (formats.includes('heic')) {
        predictedAction = 'conversion';
        smartSuggestions += `\nHEIC Detected: iPhone format — JPG conversion recommended`;
      }
      if (formats.includes('png') && avgSize > 1000) {
        smartSuggestions += `\nPNG Detected: Consider JPEG conversion to reduce size by ~70%`;
      }
      
      // NEW: Predict workflow based on successful patterns
      if (successfulWorkflows && successfulWorkflows.length > 0) {
        const relevantWorkflow = successfulWorkflows.find(w => 
          w.pattern.toLowerCase().includes(predictedAction || '')
        );
        if (relevantWorkflow) {
          smartSuggestions += `\n\n**Recommended Workflow (${relevantWorkflow.count}x proven):**`;
          relevantWorkflow.tools.forEach((tool, i) => {
            smartSuggestions += `\n${i + 1}. ${tool}`;
          });
        }
      }
      
      // NEW: Show time-based predictions
      const currentHour = new Date().getHours();
      const timeBased = personalRecs.find(r => r.priority === 'time-based');
      if (timeBased) {
        smartSuggestions += `\n\n**Time Pattern:** ${timeBased.reason}`;
      }
      
      // Personalized quick actions (skill-adaptive)
      if (personalRecs.length > 0) {
        if (skillLevel === 'expert') {
          smartSuggestions += `\n\n**Your Quick Actions (Expert Mode):**`;
        } else {
          smartSuggestions += `\n\n**Based on Your History:**`;
        }
        personalRecs.slice(0, 3).forEach((rec, i) => {
          if (rec.tool) {
            smartSuggestions += `\n${i + 1}. **${rec.tool}** - ${rec.reason}`;
          } else if (rec.workflow) {
            smartSuggestions += `\n${i + 1}. **Workflow:** ${rec.tools?.join(' → ') || rec.workflow}`;
          }
        });
      }
      
      // NEW: Auto-track this upload for future predictions
      setChatState(prev => ({
        ...prev,
        userProfile: {
          ...prev.userProfile,
          filePatterns: {
            avgFileSize: avgSize,
            commonFormats: formats,
            lastUploadCount: files.length,
            sizeRange: { min: minSize, max: maxSize },
            timestamp: new Date()
          },
          sessionGoals: [...(prev.userProfile.sessionGoals || []), predictedAction].filter(Boolean)
        }
      }));
      
      const fileMessage = {
        id: Date.now(),
        role: 'assistant',
        content: `Got **${files.length} file(s)** — ${formats.join(', ')} — ${totalSize.toFixed(1)} MB total.${smartSuggestions}

What should I do? *(compress, resize, convert, extract text, remove background, create PDF...)*`,
        timestamp: new Date()
      };
      setChatState(prev => ({
        ...prev,
        selectedFile: files,
        messages: [...prev.messages, fileMessage]
      }));
    }
  }, [getPersonalizedRecommendations]);

  // Remove handleAction - everything goes through AI chat now

  // Remove inferActionFromText - AI will handle intent detection

  // Remove inferOptionsFromText - AI will handle parameter extraction

  const handleNoteCommand = useCallback(async () => {
    if (!chatState.note.trim()) return;
    await sendChatMessage(chatState.note.trim());
  }, [chatState.note, sendChatMessage]);

  const toggleListening = useCallback(() => {
    if (SpeechRecognition.browserSupportsSpeechRecognition()) {
      if (isListening) {
        SpeechRecognition.stopListening();
      } else {
        SpeechRecognition.startListening();
      }
    }
  }, [isListening]);

  const sendNote = useCallback(() => {
    if (!chatState.note.trim()) return;
    handleNoteCommand();
    setChatState(prev => ({ ...prev, note: "" }));
  }, [chatState.note, handleNoteCommand]);

  const onEmojiClick = useCallback((emojiData) => {
    setChatState(prev => ({ ...prev, note: prev.note + emojiData.emoji }));
    setUiState(prev => ({ ...prev, showEmojiPicker: false }));
  }, []);

  const clearSelection = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    const clearMessage = {
      id: Date.now(),
      role: 'assistant',
      content: 'Files cleared. Ready for new uploads.',
      timestamp: new Date()
    };
    setChatState(prev => ({
      ...prev,
      selectedFile: null,
      messages: [...prev.messages, clearMessage]
    }));
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatState.messages, scrollToBottom]);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {uiState.open ? (
          <motion.div
            key="chatbox"
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            className={`bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 shadow-2xl rounded-3xl border border-gray-200 dark:border-gray-700 backdrop-blur-sm ${uiState.isExpanded
              ? 'fixed inset-4 w-auto h-auto max-w-none max-h-none'
              : 'w-full max-w-[90vw] sm:w-80 sm:max-w-sm max-h-[70vh]'
              } p-0 flex flex-col overflow-hidden transition-all duration-200 relative`}
          >
            {/* Modern Header */}
            <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 p-4 rounded-t-3xl relative">
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">CHUTKI AI</h3>
                    <div className="relative h-5 overflow-hidden">
                      {/* Typewriter text with cursor */}
                      <div className="flex items-center">
                        <p className="text-white text-xs font-medium bg-gradient-to-r from-white via-yellow-100 to-white bg-clip-text text-transparent">
                          {getCurrentIntroMessage()}
                        </p>
                        {/* Blinking cursor */}
                        <span className={`ml-0.5 w-0.5 h-3 bg-white inline-block ${isTyping || isDeleting ? 'animate-pulse' : 'animate-ping'
                          }`}></span>
                      </div>

                      {/* Optimized sparkles with reduced animations */}
                      <div className={`absolute -top-1 -right-2 w-1 h-1 bg-yellow-300 rounded-full transition-opacity duration-300 ${!isTyping && !isDeleting && displayedText.length > 0 ? 'opacity-100' : 'opacity-0'
                        }`}></div>

                      {/* Minimal glow effect */}
                      <div className={`absolute inset-0 bg-gradient-to-r from-pink-400/10 via-purple-400/5 to-blue-400/10 rounded-md transition-opacity duration-300 ${displayedText.length > 0 ? 'opacity-100' : 'opacity-0'
                        }`}></div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setUiState(prev => ({ ...prev, isExpanded: !prev.isExpanded }))}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-all"
                    title={uiState.isExpanded ? 'Minimize' : 'Expand'}
                  >
                    {uiState.isExpanded ? <FaCompress size={14} /> : <FaExpand size={14} />}
                  </button>
                  <button
                    onClick={clearChat}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-all"
                    title="Clear Chat"
                  >
                    <FaTrash size={14} />
                  </button>
                  <button
                    onClick={() => setUiState(prev => ({ ...prev, open: false }))}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-all"
                  >
                    <FaTimes size={14} />
                  </button>
                </div>
              </div>

              {/* Status indicators */}
              <div className="flex items-center justify-between mt-3 text-white/90 text-xs">
                <div className="flex items-center space-x-4">
                  <span>{time}</span>
                  {chatState.selectedFile && chatState.selectedFile.length > 0 && (
                    <span className="bg-white/20 px-2 py-1 rounded-full flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                      </svg>
                      {chatState.selectedFile.length} files
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {uiState.isTyping && (
                    <span className="bg-white/20 px-2 py-1 rounded-full animate-pulse flex items-center gap-1">
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                      Thinking...
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* NEW: Processing Indicator */}
            {uiState.processingTool && (
              <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/30">
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-sm">
                  <FaSpinner className="animate-spin" />
                  <span>Processing with {uiState.processingTool}...</span>
                </div>
              </div>
            )}

            {/* NEW: File Ready Indicator */}
            {!uiState.processingTool && chatState.selectedFile && chatState.selectedFile.length > 0 && (
              <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-green-50 dark:bg-green-900/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    <span className="text-green-600 dark:text-green-400 font-medium">
                      {chatState.selectedFile.length} file(s) ready
                    </span>
                    <span className="text-gray-500 dark:text-gray-400">
                      Say "go" or "process" to execute
                    </span>
                  </div>
                  <button
                    onClick={clearSelection}
                    className="p-1.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors text-xs"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {chatState.selectedFile && chatState.selectedFile.length > 0 && (
              <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={clearSelection}
                  className="w-full p-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors text-sm"
                >
                  Clear {chatState.selectedFile.length} file(s)
                </button>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />



            {/* Modern Input Box */}
            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
              <div className="bg-white dark:bg-gray-700 rounded-2xl border border-gray-200 dark:border-gray-600 shadow-sm flex items-end space-x-2 p-2 relative">
                <textarea
                  value={chatState.note}
                  onChange={(e) => setChatState(prev => ({ ...prev, note: e.target.value }))}
                  placeholder="Ask me anything about image processing... "
                  rows={1}
                  className="flex-1 text-sm bg-transparent text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 resize-none focus:outline-none max-h-32 py-2 px-2"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendNote();
                    }
                  }}
                  style={{ minHeight: '40px' }}
                />

                {uiState.showEmojiPicker && (
                  <div className="absolute bottom-16 right-0 z-50">
                    <Suspense fallback={<div className="p-4 text-center">Loading...</div>}>
                      <EmojiPicker
                        onEmojiClick={onEmojiClick}
                        theme="auto"
                        height={300}
                        width={280}
                      />
                    </Suspense>
                  </div>
                )}

                <div className="flex items-center justify-center space-x-2">
                  <button
                    className="p-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full transition-colors flex items-center justify-center"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload files"
                  >
                    <FaUpload size={18} />
                  </button>
                  <button
                    className={`p-2.5 rounded-full transition-colors ${isListening
                      ? 'text-red-500 bg-red-50 dark:bg-red-900/30 animate-pulse'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400'
                      }`}
                    onClick={toggleListening}
                    title={isListening ? 'Stop listening' : 'Start voice input'}
                  >
                    <FaMicrophone size={16} />
                  </button>
                  <button
                    className="p-2.5 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full hover:from-pink-600 hover:to-purple-600 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    onClick={sendNote}
                    disabled={!chatState.note.trim() || uiState.isTyping}
                    title="Send message"
                  >
                    <FaPaperPlane size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Enhanced Chat Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatState.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}>
                  <div className={`group relative max-w-[85%] ${msg.role === 'user'
                    ? 'bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-2xl rounded-br-md'
                    : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-800 dark:text-gray-200 rounded-2xl rounded-bl-md shadow-sm'
                    } p-4`}>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center space-x-2 mb-2">
                        <div className="w-7 h-7 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full flex items-center justify-center">
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Chutki AI</span>
                      </div>
                    )}
                    <div className="prose prose-sm max-w-none">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed">
                        {msg.content.split('**').map((part, i) =>
                          i % 2 === 0 ? part : <strong key={i} className="font-semibold">{part}</strong>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className={`text-xs opacity-70 ${msg.role === 'user' ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                        }`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => copyMessage(msg.content)}
                          className={`p-1.5 rounded-full transition-colors flex items-center justify-center ${msg.role === 'user'
                            ? 'hover:bg-white/20 text-white/80'
                            : 'hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400'
                            }`}
                          title="Copy message"
                        >
                          <FaCopy size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Enhanced typing indicator */}
              {uiState.isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl rounded-bl-md shadow-sm p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <div className="w-7 h-7 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full flex items-center justify-center">
                        <FaSpinner className="text-white text-sm animate-spin" />
                      </div>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Chutki AI is thinking...</span>
                    </div>
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-gradient-to-r from-pink-400 to-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

          </motion.div>
        ) : (
          <motion.button
            key="fab"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setUiState(prev => ({ ...prev, open: true }))}
            className="w-16 h-16 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 text-white rounded-full shadow-2xl hover:shadow-3xl transition-all duration-300 flex items-center justify-center group"
          >
            <div className="relative">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            </div>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ChutkiAssistant;
