import { GoogleGenAI, Type } from "@google/genai";
import { Memory, MusicalParams } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function generateMemoryMetadata(diary: string, date: string): Promise<{ keywords: string[], musicalParams: MusicalParams, title: string }> {
  try {
    const prompt = `
      Analyze this diary entry written on ${date}. 
      Diary: "${diary}"
      
      Tasks:
      1. Extract 3-5 single-word emotional keywords (English).
      2. Generate a short, poetic English title (max 4 words).
      3. Determine musical parameters for a generative PIANO soundscape:
         - Scale: major (happy), minor (sad), pentatonic (dreamy), chromatic (tense), wholeTone (dreamy/flashback).
         - Tempo: 50-140 BPM.
         - BaseFrequency: 200-500 Hz (Root note).
         - Complexity: 0.1 (sparse notes) to 1.0 (virtuoso).
         - Mood: melancholic (slow, deep), uplifting (arpeggios), ethereal (high pitch, spacious), mysterious (odd intervals).
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            title: { type: Type.STRING },
            musicalParams: {
              type: Type.OBJECT,
              properties: {
                scale: { type: Type.STRING, enum: ['major', 'minor', 'pentatonic', 'chromatic', 'wholeTone'] },
                baseFrequency: { type: Type.NUMBER },
                tempo: { type: Type.NUMBER },
                complexity: { type: Type.NUMBER },
                mood: { type: Type.STRING, enum: ['melancholic', 'uplifting', 'ethereal', 'mysterious'] }
              },
              required: ['scale', 'baseFrequency', 'tempo', 'complexity', 'mood']
            }
          },
          required: ['keywords', 'title', 'musicalParams']
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result;

  } catch (error) {
    console.error("Gemini analysis failed:", error);
    // Fallback
    return {
      keywords: ["Memory", "Time", "Life"],
      title: "Untitled Memory",
      musicalParams: {
        scale: 'pentatonic',
        baseFrequency: 261.63, // C4
        tempo: 80,
        complexity: 0.5,
        mood: 'ethereal'
      }
    };
  }
}

export async function chatWithGemini(history: {role: string, parts: {text: string}[]}[], message: string) {
    const chat = ai.chats.create({
        model: 'gemini-3-pro-preview',
        history: history,
        config: {
            systemInstruction: "You are the guardian of the Memory Orbs. You are gentle, philosophical, and observant. You help the user reflect on their memories. Keep responses concise and poetic.",
        }
    });

    const result = await chat.sendMessage({ message });
    return result.text;
}