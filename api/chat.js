import { getRetrievedContextForQuery } from '../src/rag/chatContext.js';
import { assembleChatMessages } from '../src/rag/promptAssembly.js';

export default async function handler(req, res) {
  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const { message } = body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid message field' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY is not configured in Vercel environment' });
  }

  const systemPrompt = `You are the AI Assistant for Pandala Shiva's Professional Portfolio website. Answer questions politely, accurately, and concisely based on Shiva's portfolio details provided below.

PORTFOLIO DETAILS & CONTEXT:
- Full Name : Pandala Shiva
- Preferred Name: Shiva
- Location: Hyderabad, Telangana, India
- Role / Focus: Data Analyst, AI/ML Engineer, GenAI Developer, Workflow Automation Specialist
- Education: B.Tech in Computer Science Engineering (2026 Graduate) from MRCET (Malla Reddy College Of Engineering and Technology) Hyderabad.
- Key Experience & Internships:
  1. AICTE Shell Internship - Ranked in National Top 40 Interns.
  2. Google Cloud Internship / Certification.
  3. IBM Internship - Watsonx.ai & AutoAI hands-on work.
  4. Freelance Client Work - Full-stack React app & automation for Moonlight Cafe & Arena.
- Core Technical Skills:
  - Languages: Python, SQL
  - AI / ML / GenAI: IBM Watsonx.ai, Vertex AI, RAG Architecture, LangChain, Ollama, Scikit-learn, XGBoost, Streamlit, Groq API, AI Agents, Prompt Engineering
  - Data & Analytics: Power BI, Pandas, NumPy, MySQL, Advanced Excel, EDA, Visualization, Hypothesis Testing
  - AI Automation & Tools: n8n, Make.com, Apify, ElevenLabs, GCP, BigQuery, GitHub, Netlify
- Featured Projects:
  1. Digital Financial Literacy AI Agent: RAG-based GenAI chatbot built with IBM Watsonx.ai.
  2. AI Code Assistant & Explainer: Deep code analysis & optimization tool powered by Groq API.
  3. SBA Business Loan Approval Predictor: End-to-end loan analysis & XGBoost ML predictor with Groq AI explanations.
  4. EV Adoption Forecasting: Machine Learning regression model for sustainability trends.
  5. AI Video Generation System: End-to-end faceless content automation pipeline using n8n.
- Contact Information:
  - Email: pandalashivanetha@gmail.com
  - LinkedIn: https://linkedin.com/in/shiva-pandala
  - GitHub: https://github.com/ShivaNetha1

INSTRUCTIONS FOR ANSWERING:
- Be professional, helpful, polite, and enthusiastic.
- Keep answers clear and concise (2-4 sentences when possible).
- When listing skills, projects, experience, tools, or steps, format the answer with short bullet points on separate lines.
- If asked something unrelated to Shiva or his portfolio/skills, politely steer the conversation back to Shiva's skills, projects, and qualifications.
- Never make up information not present in his portfolio.`;

  try {
    const retrievedContext = await getRetrievedContextForQuery(message);
    const messages = assembleChatMessages({
      retrievedContext,
      systemPrompt,
      userMessage: message,
    });

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API Error Response:', groqResponse.status, errorText);
      
      // Fallback model attempt if primary model returns 404/error
      const fallbackResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages,
          temperature: 0.7,
          max_tokens: 400,
        }),
      });

      if (!fallbackResponse.ok) {
        const fallbackErr = await fallbackResponse.text();
        return res.status(502).json({ error: 'Groq request failed', details: fallbackErr });
      }

      const fallbackData = await fallbackResponse.json();
      const fallbackOutput = fallbackData.choices?.[0]?.message?.content;
      return res.status(200).json({ response: fallbackOutput || 'Sorry, I could not generate a response.' });
    }

    const data = await groqResponse.json();
    const output = data.choices?.[0]?.message?.content;

    return res.status(200).json({ response: output || 'Sorry, I could not generate a response.' });
  } catch (error) {
    console.error('chat handler error:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

