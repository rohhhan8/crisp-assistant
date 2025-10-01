import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { generateQuestion, getInterviewFeedback } from '../services/aiService';

export const fetchQuestion = createAsyncThunk(
  'interview/fetchQuestion',
  async ({ difficulty, time }, { rejectWithValue }) => {
    try {
      const questionData = await generateQuestion(difficulty, time);
      if (!questionData || !questionData.questionText) {
        throw new Error('No question received from server.');
      }
      return { question: questionData, time };
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

export const evaluateInterview = createAsyncThunk(
  'interview/evaluateInterview',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { interviewQuestions, answers } = getState().interview;
      // Pass the entire answer object, including analysis, to the backend.
      const transcript = interviewQuestions.map((q, i) => ({
        question: q.questionText,
        answer: answers[i] || { text: '', analysis: null }, // Ensure a consistent object structure
      }));
      const feedback = await getInterviewFeedback(transcript);
      return feedback;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

const initialState = {
  candidateDetails: { name: null, email: null, phone: null },
  resumeUploaded: false,
  messages: [],
  status: 'gathering_info',
  isGeneratingQuestion: false,
  interviewQuestions: [],
  answers: [], // Will now hold objects { text: string, analysis: object | null }
  currentQuestionIndex: 0,
  timer: 0,
  finalScore: null,
  finalSummary: null,
};

export const interviewSlice = createSlice({
  name: 'interview',
  initialState,
  reducers: {
    setCandidateDetails: (state, action) => {
      state.candidateDetails = { ...state.candidateDetails, ...action.payload };
      state.resumeUploaded = true;
      const allDetailsPresent = ['name', 'email', 'phone'].every(field => !!state.candidateDetails[field]);
      if (allDetailsPresent) {
        state.status = 'details_confirmed';
      }
    },
    addMessage: (state, action) => {
      state.messages.push(action.payload);
    },
    updateMissingDetail: (state, action) => {
      const { field, value } = action.payload;
      state.candidateDetails[field] = value;
      const allDetailsPresent = ['name', 'email', 'phone'].every(field => !!state.candidateDetails[field]);
      if (allDetailsPresent) {
        state.status = 'details_confirmed';
      }
    },
    startInterview: (state) => {
      state.status = 'in_progress';
    },
    submitAnswer: (state, action) => {
      // The payload is now an object: { text: string, analysis: object | null }
      state.answers.push(action.payload);
      if (state.currentQuestionIndex < 5) {
        state.currentQuestionIndex += 1;
      } else {
        state.status = 'finished';
      }
    },
    decrementTimer: (state) => {
      if (state.timer > 0) {
        state.timer -= 1;
      }
    },
    resetInterview: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchQuestion.pending, (state) => {
        state.isGeneratingQuestion = true;
      })
      .addCase(fetchQuestion.fulfilled, (state, action) => {
        state.isGeneratingQuestion = false;
        const { question, time } = action.payload;
        state.interviewQuestions.push(question);
        state.messages.push({ text: question.questionText, sender: 'bot' });
        state.timer = time;
      })
      .addCase(fetchQuestion.rejected, (state, action) => {
        state.isGeneratingQuestion = false;
        state.messages.push({ text: `Sorry, an error occurred: ${action.payload}. Please try again later.`, sender: 'bot' });
        state.status = 'completed';
      })
      .addCase(evaluateInterview.pending, (state) => {
        state.status = 'evaluating';
      })
      .addCase(evaluateInterview.fulfilled, (state, action) => {
        const { score, summary } = action.payload;
        state.finalScore = score;
        state.finalSummary = summary;
        state.status = 'completed';
        state.messages.push({ text: `**Final Score: ${score}/100**`, sender: 'bot' });
        state.messages.push({ text: summary, sender: 'bot' });
      })
      .addCase(evaluateInterview.rejected, (state, action) => {
        state.messages.push({ text: `Sorry, an error occurred during evaluation: ${action.payload}.`, sender: 'bot' });
        state.status = 'completed';
      });
  },
});

export const {
  setCandidateDetails,
  addMessage,
  updateMissingDetail,
  startInterview,
  submitAnswer,
  decrementTimer,
  resetInterview,
} = interviewSlice.actions;

export default interviewSlice.reducer;