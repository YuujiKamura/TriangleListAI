
import { GoogleGenAI } from "@google/genai";
import { Point, RenderedTriangle } from "../types";
import { distance } from "../utils/geometryUtils";

let aiClient: GoogleGenAI | null = null;

const getClient = () => {
  if (!aiClient && process.env.API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }
  return aiClient;
};

export const analyzeGeometry = async (
  points: Point[],
  triangles: RenderedTriangle[],
  userQuery?: string
): Promise<string> => {
  const client = getClient();
  if (!client) {
    return "API Key is missing. Please ensure the application is configured correctly.";
  }

  // Construct context specific to Area Unfolding / Triangulation (San-sha-ho)
  let context = "I have a set of triangles connected via the 'Area Unfolding' (Triangulation) method.\n\n";
  
  context += "Geometry Data:\n";
  triangles.forEach(t => {
    // Round coords for brevity
    const p1 = `(${t.p1.x.toFixed(1)}, ${t.p1.y.toFixed(1)})`;
    const p2 = `(${t.p2.x.toFixed(1)}, ${t.p2.y.toFixed(1)})`;
    const p3 = `(${t.p3.x.toFixed(1)}, ${t.p3.y.toFixed(1)})`;
    
    // Calculate side lengths
    const s1 = distance(t.p1, t.p2).toFixed(2);
    const s2 = distance(t.p2, t.p3).toFixed(2);
    const s3 = distance(t.p3, t.p1).toFixed(2);

    context += `- Triangle "${t.name}" (Area: ${t.area.toFixed(2)}). Vertices: [${p1}, ${p2}, ${p3}]. Sides: ${s1}, ${s2}, ${s3}.\n`;
  });
  
  const totalArea = triangles.reduce((sum, t) => sum + t.area, 0).toFixed(2);
  context += `\nTotal Calculated Area: ${totalArea}\n`;

  const prompt = userQuery 
    ? `User Question: "${userQuery}"\n\nAnswer based on the geometric data.` 
    : `Analyze this shape. Does it resemble a common land plot shape (e.g., L-shape, Rectangle)? Is the triangulation logic sound? Explain the total area.`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          text: context
        },
        {
          text: prompt
        }
      ],
      config: {
        systemInstruction: "You are an expert Surveyor and Geometry assistant. You specialize in 'Triangulation Method' (San-sha-ho) for land area calculation. Provide precise, professional, yet easy-to-understand insights.",
      }
    });

    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Failed to generate analysis. Please try again.";
  }
};
