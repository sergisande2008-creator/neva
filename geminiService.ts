
import { GoogleGenAI, Type } from "@google/genai";
import { MENU_ITEMS } from "./constants";

// Correct GoogleGenAI initialization to use process.env.API_KEY directly.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const processNevadaCommand = async (prompt: string, currentCart: any[]) => {
  const systemInstruction = `
    Eres Nevada, un asistente virtual de servicio premium para un restaurante de alta cocina, desarrollado por Nevada Automations.
    Tu objetivo es ayudar al cliente a navegar por el menú, sugerir platos y gestionar su pedido con un tono extremadamente profesional, elegante y eficiente.
    
    Tienes conocimiento total de la carta, sus ingredientes y alérgenos:
    ${JSON.stringify(MENU_ITEMS)}
    
    Reglas:
    - Sé amable, profesional y servicial.
    - Si el usuario pregunta por ingredientes, responde con la información detallada disponible en el menú proporcionado.
    - Identifica los platos para añadirlos a la comanda si el usuario lo solicita.
    - Devuelve una respuesta estructurada en JSON.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reply: {
            type: Type.STRING,
            description: "Respuesta textual de Nevada al cliente."
          },
          action: {
            type: Type.STRING,
            description: "Acción a realizar: 'ADD_TO_CART', 'NAVIGATE_CATEGORY', 'NONE'."
          },
          targetId: {
            type: Type.STRING,
            description: "ID del plato si la acción es ADD_TO_CART, o nombre de categoría si es NAVIGATE_CATEGORY."
          },
          note: {
            type: Type.STRING,
            description: "Nota adicional para el plato (ej: 'sin cebolla')."
          }
        },
        required: ["reply", "action"]
      }
    }
  });

  try {
    const text = response.text || '{}';
    return JSON.parse(text);
  } catch (e) {
    console.error("Error parsing Gemini response", e);
    return { reply: "Lo siento, no he podido entenderle bien. ¿Podría repetirlo?", action: "NONE" };
  }
};
