require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const { AssemblyAI } = require('assemblyai');

const app = express();
const PORT = 5000;

// --- Multer setup for file uploads ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

// --- API Clients ---
const openRouterClient = axios.create({
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
  }
});

const assemblyClient = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY
});

// --- Helper function for polling AssemblyAI ---
const pollTranscript = async (transcriptId) => {
  const pollingEndpoint = `https://api.assemblyai.com/v2/transcript/${transcriptId}`;
  while (true) {
    const pollingResponse = await axios.get(pollingEndpoint, {
      headers: { authorization: process.env.ASSEMBLYAI_API_KEY }
    });
    const transcript = pollingResponse.data;
    if (transcript.status === 'completed') {
      return transcript;
    } else if (transcript.status === 'error') {
      throw new Error(`Transcription failed: ${transcript.error}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds before polling again
  }
};

// --- API Endpoints ---

// 1. Resume Upload Endpoint
app.post('/api/upload-resume', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }
  
  const apiKey = process.env.APILAYER_API_KEY;
  if (!apiKey) {
    console.error("APILayer API Key not found in .env file.");
    return res.json({ success: true, data: { name: null, email: null, phone: null } });
  }

  try {
    const response = await axios.post('https://api.apilayer.com/resume_parser/upload', req.file.buffer, {
      headers: {
        'apikey': apiKey,
        'Content-Type': req.file.mimetype
      }
    });
    const { name, email, phone } = response.data;
    res.json({ success: true, data: { name: name || null, email: email || null, phone: phone || null } });
  } catch (error) {
    console.error('Error calling APILayer:', error.response ? error.response.data : error.message);
    res.json({ success: true, data: { name: null, email: null, phone: null } });
  }
});

// 2. Generate Question Endpoint
app.post('/api/generate-question', async (req, res) => {
  const { difficulty } = req.body;
  const prompt = `You are an expert interviewer. Generate one ${difficulty} interview question for a Full Stack (React/Node.js) role. Your response must be ONLY a valid JSON object with two keys: "questionText" (the question itself) and "questionType". The "questionType" must be one of two strings: 'conceptual' (if the answer is expected to be verbal) or 'problem-solving' (if the answer requires typing code or a detailed written explanation).`;

  try {
    const completion = await openRouterClient.post('/chat/completions', {
      model: 'openai/gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: "json_object" },
    });

    const questionObject = JSON.parse(completion.data.choices[0].message.content);
    res.json(questionObject); 
  } catch (error) {
    console.error("Error calling OpenRouter:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to generate question from AI service.' });
  }
});

// 3. Evaluate Interview Endpoint
app.post('/api/evaluate-interview', async (req, res) => {
  const { transcript } = req.body;

  // Build a detailed string for the prompt, including vocal analysis if available
  const transcriptString = transcript.map(item => {
    let entry = `Q: ${item.question}\nA: ${item.answer.text}`;
    if (item.answer.analysis) {
        const { sentiment, confidence, filler_word_count } = item.answer.analysis;
        entry += `\n[Vocal Analysis: Sentiment: ${sentiment}, Confidence: ${(confidence * 100).toFixed(0)}%, Filler Words: ${filler_word_count}]`;
    }
    return entry;
  }).join('\n\n');

  const prompt = `You are an expert interviewer for a Full Stack role. Below is an interview transcript. For each answer, vocal analysis data (sentiment, confidence, filler words) may be provided.

Your task is to:
1. Evaluate the technical accuracy and depth of the answers.
2. Evaluate the candidate's communication skills using the provided vocal analysis. Comment on their clarity, confidence, and professionalism.
3. Provide a final score out of 100.
4. Write a 3-4 sentence summary of the candidate's overall performance, integrating both technical and communication feedback.

Return your response ONLY as a valid JSON object with two keys: "score" (as a number) and "summary" (as a string).

Transcript:
${transcriptString}`;

  try {
    const completion = await openRouterClient.post('/chat/completions', {
      model: 'deepseek/deepseek-chat-v3.1:free',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: "json_object" },
    });
    const aiResponse = JSON.parse(completion.data.choices[0].message.content);
    res.json(aiResponse);
  } catch (error) {
    console.error("Error calling OpenRouter for evaluation:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Failed to evaluate interview from AI service.' });
  }
});

// 4. Analyze Audio Endpoint
app.post('/api/analyze-audio', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded.' });
  }

  try {
    // 1. Upload the audio file to AssemblyAI
    const uploadUrl = await assemblyClient.files.upload(req.file.buffer);

    // 2. Submit the audio for transcription and analysis
    const transcript = await assemblyClient.transcripts.create({
      audio_url: uploadUrl,
      sentiment_analysis: true,
      disfluencies: true, // To detect filler words
    });

    // 3. Poll for the result
    const completedTranscript = await pollTranscript(transcript.id);

    // 4. Extract relevant data
    const fillerWords = completedTranscript.words.filter(word => word.word_type === 'filler');
    const analysis = {
      sentiment: completedTranscript.sentiment_analysis_results?.reduce((acc, curr) => acc + curr.sentiment, "") || 'NEUTRAL',
      confidence: completedTranscript.confidence,
      filler_word_count: fillerWords.length,
      filler_words: fillerWords.map(w => w.text),
    };

    res.json(analysis);

  } catch (error) {
    console.error("Error with AssemblyAI analysis:", error);
    res.status(500).json({ error: 'Failed to analyze audio.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
