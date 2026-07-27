import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Helper to clean Markdown code block wrappers from Gemini JSON output
function cleanJsonText(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

// Helper to get Gemini Client safely
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({ apiKey });
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY') });
});

// 1. AI Study Assistant Chat
app.post('/api/ai/chat', async (req, res) => {
  const { message, history = [], subject = 'General Study', level = 'simple' } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const ai = getGeminiClient();

  if (ai) {
    try {
      const systemInstruction = `You are AI StudyMate, an expert academic tutor and study partner.
Your goal is to explain concepts clearly, patiently, and in simple language when requested.
Subject Context: ${subject}
Explanation Style: ${level === 'simple' ? 'Explain like I am 12 years old, using easy analogies and bullet points.' : 'Comprehensive academic level with clear formulas and structured breakdowns.'}
Formatting: Use Markdown for formatting (bold, bullet points, headers, code blocks).
Be encouraging, structured, and give real-world examples.`;

      const promptHistory = history.slice(-6).map((item: { role: string; content: string }) => 
        `${item.role === 'user' ? 'Student' : 'Tutor'}: ${item.content}`
      ).join('\n');

      const fullPrompt = `${promptHistory ? promptHistory + '\n' : ''}Student: ${message}\nTutor:`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: fullPrompt,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      const reply = response.text || "I'm here to help you study! Could you clarify your question?";
      return res.json({ reply });
    } catch (err: any) {
      console.error('Gemini Chat Error:', err?.message || err);
      // Fallback response if API call encounters an error
    }
  }

  // Smart Fallback response
  let fallbackReply = `Here is a helpful explanation for **"${message}"** in simple terms:\n\n` +
    `1. **Core Concept**: When studying ${subject}, remember that core ideas build on fundamental rules.\n` +
    `2. **Simple Analogy**: Think of this concept like building blocks in a wall. Each block connects to the next.\n` +
    `3. **Key Step**: Break the problem into small, manageable parts.\n\n` +
    `*Tip: Try generating flashcards or a quiz on this topic in StudyMate to test your knowledge!*`;

  return res.json({ reply: fallbackReply });
});

// 2. AI Quiz Generator
app.post('/api/ai/quiz', async (req, res) => {
  const { topic = 'General Science', notesText = '', count = 5, difficulty = 'Medium' } = req.body;
  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `Generate a ${count}-question multiple choice quiz on topic: "${topic}".
Difficulty: ${difficulty}.
${notesText ? `Reference Notes Content:\n"${notesText.substring(0, 1500)}"` : ''}

Output MUST be a JSON array of objects with the exact schema:
[
  {
    "question": "Clear question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "explanation": "Brief explanation of why this answer is correct",
    "hint": "A helpful nudge"
  }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                correctIndex: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
                hint: { type: Type.STRING },
              },
              required: ['question', 'options', 'correctIndex', 'explanation', 'hint'],
            },
          },
        },
      });

      if (response.text) {
        const cleanedText = cleanJsonText(response.text);
        const quizData = JSON.parse(cleanedText);
        return res.json({ quiz: quizData });
      }
    } catch (err: any) {
      console.error('Gemini Quiz Error:', err?.message || err);
    }
  }

  // Fallback sample quiz generator
  const mockQuiz = [
    {
      question: `What is a primary principle of ${topic}?`,
      options: [
        `Building on core foundational principles`,
        `Ignoring prior observations`,
        `Memorizing without understanding`,
        `Random guessing`
      ],
      correctIndex: 0,
      explanation: `Foundational principles form the cornerstone of understanding ${topic}.`,
      hint: `Think about what makes learning sustainable and deep.`
    },
    {
      question: `Which method is most effective for long-term retention in ${topic}?`,
      options: [
        `Active recall & Spaced repetition`,
        `Passive re-reading once`,
        `Cramming 10 minutes before the exam`,
        `Skipping self-assessment`
      ],
      correctIndex: 0,
      explanation: `Active recall actively retrieves information from memory, strengthening neural connections.`,
      hint: `It involves testing yourself repeatedly over time.`
    },
    {
      question: `How does active problem solving help in mastering ${topic}?`,
      options: [
        `It identifies knowledge gaps immediately`,
        `It makes studying slower without gain`,
        `It replaces the need for sleep`,
        `It guarantees 100% on all exams without effort`
      ],
      correctIndex: 0,
      explanation: `Solving problems highlights what you truly understand versus what needs review.`,
      hint: `Consider what happens when you attempt a practice problem.`
    },
    {
      question: `When preparing for a comprehensive assessment on ${topic}, what should you prioritize first?`,
      options: [
        `High-yield fundamental concepts`,
        `Obscure trivia that rarely appears`,
        `Font formatting in your notes`,
        `Only reading chapter titles`
      ],
      correctIndex: 0,
      explanation: `Mastering high-yield concepts gives you the highest return on study effort.`,
      hint: `Start with the big picture core ideas.`
    },
    {
      question: `What is the Feynman Technique for studying ${topic}?`,
      options: [
        `Explaining the concept simply as if teaching a beginner`,
        `Writing notes in secret shorthand code`,
        `Reading textbooks backwards`,
        `Highlighting every line on a page in neon yellow`
      ],
      correctIndex: 0,
      explanation: `The Feynman Technique forces you to translate complex ideas into clear, simple language.`,
      hint: `It is named after physicist Richard Feynman.`
    }
  ].slice(0, count);

  return res.json({ quiz: mockQuiz });
});

// 3. AI Notes Summarizer
app.post('/api/ai/summarize', async (req, res) => {
  const { notesText, style = 'bullet' } = req.body;

  if (!notesText || notesText.trim().length === 0) {
    return res.status(400).json({ error: 'Notes text is required' });
  }

  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `Summarize the following study notes in style "${style}".
Notes:
"${notesText}"

Format response in structured JSON with schema:
{
  "title": "Concise Topic Title",
  "keyTakeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3"],
  "summary": "Clear executive summary text",
  "keyTerms": [{"term": "Term Name", "definition": "Simple definition"}],
  "actionItems": ["Study tip or exam review question 1", "Review question 2"]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              keyTakeaways: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              summary: { type: Type.STRING },
              keyTerms: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    definition: { type: Type.STRING },
                  },
                },
              },
              actionItems: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
        },
      });

      if (response.text) {
        const cleanedText = cleanJsonText(response.text);
        return res.json(JSON.parse(cleanedText));
      }
    } catch (err: any) {
      console.error('Gemini Summarize Error:', err?.message || err);
    }
  }

  // Fallback summary engine
  const sentences = notesText.split(/(?<=[.!?])\s+/).filter((s: string) => s.length > 5);
  const titleCandidate = notesText.split('\n')[0].substring(0, 40) || 'Study Notes Summary';
  
  return res.json({
    title: titleCandidate,
    keyTakeaways: [
      sentences[0] || 'Core study material highlights primary definitions.',
      sentences[1] || 'Important relationships between topics need active review.',
      sentences[2] || 'Key formulas and principles form the core exam coverage.'
    ],
    summary: notesText.length > 300 ? notesText.substring(0, 300) + '...' : notesText,
    keyTerms: [
      { term: 'Core Concept', definition: 'The foundational idea around which all details revolve.' },
      { term: 'Synthesis', definition: 'Combining multiple ideas to form a coherent understanding.' },
      { term: 'Active Review', definition: 'Testing memory with retrieval practice rather than passive reading.' }
    ],
    actionItems: [
      'Create 5 flashcards on key definitions from these notes.',
      'Test yourself using the StudyMate Quiz Generator on this content.',
      'Explain this summary out loud in under 2 minutes.'
    ]
  });
});

// 4. AI Flashcards Generator
app.post('/api/ai/flashcards', async (req, res) => {
  const { topic = 'General Study', count = 6 } = req.body;
  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `Generate a set of ${count} flashcards for studying topic: "${topic}".
Output MUST be a JSON array of flashcards with schema:
[
  {
    "front": "Question or term on front",
    "back": "Clear concise answer or explanation on back",
    "hint": "Short memory clue",
    "topic": "${topic}"
  }
]`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING },
                back: { type: Type.STRING },
                hint: { type: Type.STRING },
                topic: { type: Type.STRING },
              },
              required: ['front', 'back', 'hint', 'topic'],
            },
          },
        },
      });

      if (response.text) {
        const cleanedText = cleanJsonText(response.text);
        return res.json({ flashcards: JSON.parse(cleanedText) });
      }
    } catch (err: any) {
      console.error('Gemini Flashcards Error:', err?.message || err);
    }
  }

  // Fallback Flashcards
  const mockCards = [
    {
      front: `What is the main definition of ${topic}?`,
      back: `${topic} refers to the systematic study, understanding, and application of foundational concepts in this discipline.`,
      hint: `Think of the baseline definition.`,
      topic,
    },
    {
      front: `Why is Active Recall superior to re-reading?`,
      back: `Active Recall forces your brain to retrieve knowledge from memory, creating stronger neural pathways and long-term retention.`,
      hint: `Retrieval vs Passive viewing.`,
      topic,
    },
    {
      front: `What is Spaced Repetition?`,
      back: `A learning technique where reviews are spaced out over increasing intervals to exploit the psychological spacing effect.`,
      hint: `Timing your reviews over days/weeks.`,
      topic,
    },
    {
      front: `What is the Feynman Technique?`,
      back: `Explaining a topic in plain language as if teaching a child, identifying gaps where jargon is used.`,
      hint: `Teach it simply.`,
      topic,
    },
    {
      front: `How do practice exams reduce test anxiety?`,
      back: `Simulating exam conditions builds familiarity, improves time management, and desensitizes stress response.`,
      hint: `Confidence through practice.`,
      topic,
    },
    {
      front: `What is the Pomodoro Technique?`,
      back: `Studying in intense 25-minute focus intervals followed by 5-minute restorative breaks.`,
      hint: `Tomato timer focus cycles.`,
      topic,
    },
  ].slice(0, count);

  return res.json({ flashcards: mockCards });
});

// 5. AI Study Planner Generator
app.post('/api/ai/study-plan', async (req, res) => {
  const { examName = 'Upcoming Exam', targetDate = 'In 2 weeks', subjects = ['Math', 'Science'], hoursPerDay = 3 } = req.body;
  const ai = getGeminiClient();

  if (ai) {
    try {
      const prompt = `Create a high-productivity study schedule for exam: "${examName}", Target Date: ${targetDate}.
Subjects: ${subjects.join(', ')}. Hours per day: ${hoursPerDay}.

Output JSON object with schema:
{
  "planTitle": "Structured study plan title",
  "overview": "Encouraging strategy statement",
  "dailySessions": [
    {
      "day": "Day 1",
      "focusSubject": "Subject name",
      "duration": "1.5 hours",
      "task": "Specific study task & active recall topic",
      "technique": "Pomodoro / Flashcards / Practice Quiz"
    }
  ],
  "examDayTips": ["Tip 1", "Tip 2"]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              planTitle: { type: Type.STRING },
              overview: { type: Type.STRING },
              dailySessions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    day: { type: Type.STRING },
                    focusSubject: { type: Type.STRING },
                    duration: { type: Type.STRING },
                    task: { type: Type.STRING },
                    technique: { type: Type.STRING },
                  },
                },
              },
              examDayTips: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
          },
        },
      });

      if (response.text) {
        const cleanedText = cleanJsonText(response.text);
        return res.json(JSON.parse(cleanedText));
      }
    } catch (err: any) {
      console.error('Gemini Study Plan Error:', err?.message || err);
    }
  }

  // Fallback Study Plan
  return res.json({
    planTitle: `${examName} Master Study Roadmap`,
    overview: `A personalized ${hoursPerDay}-hour daily study plan focusing on active recall, spaced repetition, and practice quizzes.`,
    dailySessions: [
      {
        day: 'Day 1',
        focusSubject: subjects[0] || 'Primary Subject',
        duration: `${Math.min(hoursPerDay, 2)} hours`,
        task: 'Review foundational concepts & generate AI summary notes',
        technique: 'Notes Summarizer & Mind Mapping'
      },
      {
        day: 'Day 2',
        focusSubject: subjects[1] || subjects[0] || 'Secondary Subject',
        duration: `${hoursPerDay} hours`,
        task: 'Create flashcards & practice active recall deck',
        technique: 'Spaced Repetition Flashcards'
      },
      {
        day: 'Day 3',
        focusSubject: 'Cross-Topic Mastery',
        duration: `${hoursPerDay} hours`,
        task: 'Take timed AI Quiz Generator challenge & review mistakes',
        technique: 'Active Practice Test'
      },
      {
        day: 'Day 4',
        focusSubject: subjects[0] || 'Review',
        duration: `${hoursPerDay} hours`,
        task: 'Ask AI Assistant for simple explanations on weak areas',
        technique: 'Feynman Technique with AI Tutor'
      },
      {
        day: 'Day 5',
        focusSubject: 'Mock Exam Prep',
        duration: `${hoursPerDay} hours`,
        task: 'Full length timed simulation test & rapid review',
        technique: 'Simulated Exam Mode'
      }
    ],
    examDayTips: [
      'Get at least 7-8 hours of sleep the night before.',
      'Stay hydrated and eat a protein-rich meal before entering the exam room.',
      'Read all question instructions twice before answering.'
    ]
  });
});

// Serve frontend assets
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
