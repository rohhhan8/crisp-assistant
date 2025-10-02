
import axios from 'axios';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

export const uploadResume = async (file) => {
  const formData = new FormData();
  formData.append('resume', file);
  const response = await apiClient.post('/upload-resume', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const generateQuestion = async (difficulty) => {
  // The backend expects an object with a 'difficulty' key
  const response = await apiClient.post('/generate-question', { difficulty });
  // We return response.data directly, which is the { questionText, questionType } object
  return response.data;
};

export const getInterviewFeedback = async (transcript) => {
  const response = await apiClient.post('/evaluate-interview', { transcript });
  return response.data;
};
