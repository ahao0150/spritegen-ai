import { GoogleGenAI, Modality } from "@google/genai";
import { ModelType, BackgroundOption } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateSpriteSheet = async (
  referenceImageBase64: string,
  prompt: string,
  background: BackgroundOption
): Promise<string> => {
  try {
    // Strip the data:image/png;base64, prefix if present
    const base64Data = referenceImageBase64.replace(/^data:image\/\w+;base64,/, "");
    const mimeType = referenceImageBase64.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)?.[0] || "image/png";

    const bgColorDescription = background === 'green' 
      ? 'solid bright green hex code #00FF00' 
      : 'solid white hex code #FFFFFF';

    // Construct a specialized prompt for sprite sheet generation
    const enhancedPrompt = `
      Create a 2D game sprite sheet based on the provided character reference. 
      Task: ${prompt}. 
      
      CRITICAL LAYOUT INSTRUCTIONS:
      1. Organize frames in a grid (e.g., 3x3 or 1x6).
      2. BACKGROUND MUST BE ${bgColorDescription}. 
      3. DO NOT draw a checkerboard pattern. DO NOT attempt to simulate transparency. Use a flat, solid color.
      4. Ensure there is ample spacing between frames so they don't overlap.
      
      Style: Maintain consistent character proportions, colors, and art style across all frames.
      Output: A high-resolution sprite sheet image.
    `;

    const response = await ai.models.generateContent({
      model: ModelType.GEMINI_FLASH_IMAGE,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64Data,
              mimeType: mimeType,
            },
          },
          {
            text: enhancedPrompt,
          },
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    // Extract the image from the response
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error("No content generated from Gemini.");
    }

    const imagePart = parts.find((part) => part.inlineData);
    if (!imagePart || !imagePart.inlineData) {
      throw new Error("No image data found in the response.");
    }

    return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;

  } catch (error: any) {
    console.error("Gemini API Error:", error);
    throw new Error(error.message || "Failed to generate sprite sheet");
  }
};