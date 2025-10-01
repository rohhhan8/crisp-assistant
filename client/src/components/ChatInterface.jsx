import React, { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Input, Button, Skeleton, notification } from 'antd';
import { AudioOutlined, AudioMutedOutlined } from '@ant-design/icons';
import axios from 'axios'; // Import axios
import {
  addMessage,
  updateMissingDetail,
  startInterview,
  fetchQuestion,
  submitAnswer,
  decrementTimer,
  evaluateInterview,
  resetInterview,
} from '../features/interviewSlice';
import { addCandidate } from '../features/candidatesSlice';
import Timer from './Timer';
import './ChatInterface.css';

// --- Helper for rendering text with bold tags ---
const renderMessageText = (text) => {
  if (!text) return '';
  const parts = text.split(/(\*{1,2}[^*]+\*{1,2})/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <strong key={i}>{part.slice(1, -1)}</strong>;
    }
    return part;
  });
};

// --- Speech Recognition setup ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
} else {
  console.log('Speech Recognition not supported in this browser.');
}

const ChatInterface = () => {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false); // For audio analysis loading state
  const dispatch = useDispatch();
  const interview = useSelector((state) => state.interview);
  const { messages, status, timer, isGeneratingQuestion, currentQuestionIndex, interviewQuestions } = interview;
  
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // --- Voice Input & Recording Logic ---
  useEffect(() => {
    if (!recognition) return;

    const handleResult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      setInputValue(finalTranscript || interimTranscript);
    };

    const handleError = (event) => {
      if (event.error === 'no-speech') {
        console.warn('Speech recognition: No speech detected.');
        return;
      }
      console.error('Speech recognition error', event.error);
      notification.error({
        message: 'Voice Input Error',
        description: `An error occurred: ${event.error}. Please check your microphone permissions.`, 
      });
      setIsListening(false);
    };

    const handleEnd = () => {
      if (isListening) {
        try {
          recognition.start();
        } catch (e) {
          console.error("Speech recognition restart failed", e);
          setIsListening(false);
        }
      }
    };

    recognition.addEventListener('result', handleResult);
    recognition.addEventListener('error', handleError);
    recognition.addEventListener('end', handleEnd);

    return () => {
      recognition.removeEventListener('result', handleResult);
      recognition.removeEventListener('error', handleError);
      recognition.removeEventListener('end', handleEnd);
    };
  }, [isListening]);

  const setupMediaRecorder = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      notification.error({ message: "Media devices not supported in this browser." });
      return null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = []; // Clear chunks for next recording
        
        let analysis = null;
        if (audioBlob.size > 1000) { // Only analyze if there is meaningful audio
          setIsAnalyzing(true);
          const formData = new FormData();
          formData.append('audio', audioBlob);
          try {
            const { data } = await axios.post('http://localhost:5000/api/analyze-audio', formData);
            analysis = data;
            notification.success({ message: "Vocal analysis complete!" });
          } catch (error) {
            console.error("Audio analysis failed", error);
            notification.error({ message: 'Could not analyze audio.' });
          }
        }
        // Dispatch the answer with or without analysis
        dispatch(submitAnswer({ text: inputValue, analysis }));
        setInputValue('');
        setIsAnalyzing(false);
      };
    } catch (err) {
      notification.error({ message: "Microphone access denied.", description: "Please allow microphone access to use voice input." });
      return null;
    }
  };

  const toggleListening = async () => {
    if (!recognition) {
      notification.error({ message: 'Voice input is not supported in this browser.' });
      return;
    }

    if (!mediaRecorderRef.current) {
      await setupMediaRecorder();
      if (!mediaRecorderRef.current) return; // Exit if setup failed
    }

    if (!isListening) {
      try {
        setInputValue('');
        audioChunksRef.current = [];
        recognition.start();
        mediaRecorderRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("Could not start recognition or recording", e);
        notification.error({ message: 'Could not start voice recognition.' });
      }
    } else {
      recognition.stop();
      if (mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      setIsListening(false);
    }
  };

  const handleSendMessage = () => {
    if (!inputValue.trim() || isAnalyzing) return;

    if (status === 'gathering_info') {
      const currentMissingField = ['name', 'email', 'phone'].find(field => !interview.candidateDetails[field]);
      dispatch(addMessage({ text: inputValue, sender: 'user' }));
      if (currentMissingField) {
        dispatch(updateMissingDetail({ field: currentMissingField, value: inputValue }));
      }
      setInputValue('');
    } else if (status === 'in_progress') {
      if (isListening) {
        // This will trigger recorder.onstop, which handles analysis and submission
        toggleListening();
      } else {
        // If user typed the answer, submit without analysis
        dispatch(submitAnswer({ text: inputValue, analysis: null }));
        setInputValue('');
      }
    }
  };

  // --- Interview Flow & Lifecycle Hooks ---
  useEffect(() => {
    if (status === 'gathering_info' && messages.length === 0) {
      dispatch(addMessage({ text: 'Hello! Thanks for uploading your resume.', sender: 'bot' }));
      setTimeout(() => {
        const missingField = ['name', 'email', 'phone'].find(field => !interview.candidateDetails[field]);
        if (missingField) {
          dispatch(addMessage({ text: `I couldn\'t find your ${missingField}. Could you please provide it?`, sender: 'bot' }));
        }
      }, 200);
    }
  }, [status, messages.length, dispatch, interview.candidateDetails]);

  useEffect(() => {
    if (status === 'details_confirmed') {
      const alreadySent = messages.some(m => m.text.includes('Great, I have all your details'));
      if (!alreadySent) {
        dispatch(addMessage({ text: 'Great, I have all your details. Let\'s begin the interview.', sender: 'bot' }));
        dispatch(startInterview());
      }
    }
  }, [status, messages, dispatch]);

  useEffect(() => {
    if (status === 'in_progress' && currentQuestionIndex < 6 && interviewQuestions.length <= currentQuestionIndex) {
      const difficulties = ['Easy', 'Easy', 'Medium', 'Medium', 'Hard', 'Hard'];
      const times = [60, 60, 120, 120, 240, 240];
      dispatch(fetchQuestion({ difficulty: difficulties[currentQuestionIndex], time: times[currentQuestionIndex] }));
    }
  }, [status, currentQuestionIndex, interviewQuestions.length, dispatch]);

  useEffect(() => {
    if (status === 'in_progress' && timer > 0) {
      const interval = setInterval(() => dispatch(decrementTimer()), 1000);
      return () => clearInterval(interval);
    } else if (status === 'in_progress' && timer === 0 && interviewQuestions.length > currentQuestionIndex) {
      dispatch(submitAnswer({ text: 'No answer provided within the time limit.', analysis: null }));
    } else if (status === 'finished') {
      dispatch(evaluateInterview());
    }
  }, [status, timer, dispatch, currentQuestionIndex, interviewQuestions.length]);

  useEffect(() => {
    if (status === 'completed' && interview.finalScore !== null) {
      dispatch(addCandidate({
        details: interview.candidateDetails,
        questions: interview.interviewQuestions.map(q => q.questionText),
        answers: interview.answers,
        score: interview.finalScore,
        summary: interview.finalSummary,
      }));
      const timer = setTimeout(() => dispatch(resetInterview()), 5000);
      return () => clearTimeout(timer);
    }
  }, [status, interview, dispatch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isGeneratingQuestion, status]);

  // --- Conditional Rendering Logic ---
  const currentQuestion = interviewQuestions[currentQuestionIndex];
  const showVoiceButton = recognition && status === 'in_progress' && currentQuestion?.questionType === 'conceptual';

  return (
    <div className="chat-container">
      {(status === 'in_progress' || status === 'finished' || status === 'evaluating') && <Timer seconds={timer} />}
      {(status === 'completed') && <div className="finished-message">Interview Complete! Thank you. The session will reset shortly.</div>}
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            {renderMessageText(msg.text)}
          </div>
        ))}
        {isGeneratingQuestion && <div className="message bot"><Skeleton active paragraph={{ rows: 2 }} title={false} /></div>}
        {status === 'evaluating' && <div className="message bot"><Skeleton active paragraph={{ rows: 4 }} /></div>}
        <div ref={messagesEndRef} />
      </div>
      {status !== 'finished' && status !== 'completed' && status !== 'evaluating' && (
        <div className="chat-input">
          <Input
            placeholder={isListening ? 'Listening...' : (status === 'in_progress' ? 'Your answer...' : 'Type your message...')}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={handleSendMessage}
            disabled={status !== 'gathering_info' && status !== 'in_progress' || isGeneratingQuestion || isAnalyzing}
          />
          {showVoiceButton && (
            <Button
              icon={isListening ? <AudioMutedOutlined /> : <AudioOutlined />}
              onClick={toggleListening}
              danger={isListening}
              type={isListening ? 'primary' : 'default'}
              disabled={isAnalyzing}
            />
          )}
          <Button 
            type="primary" 
            onClick={handleSendMessage} 
            disabled={isGeneratingQuestion || !inputValue.trim() || isAnalyzing}
            loading={isAnalyzing}
          >
            {status === 'in_progress' ? 'Submit Answer' : 'Send'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default ChatInterface;
