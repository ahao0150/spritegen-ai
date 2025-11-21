export interface SpriteConfig {
  rows: number;
  cols: number;
  fps: number;
  isPlaying: boolean;
  activeFrameCount: number; // New: Limit animation loop length
}

export interface GenerationState {
  isLoading: boolean;
  error: string | null;
  resultImage: string | null; // Base64 data URI
}

export enum ModelType {
  GEMINI_FLASH_IMAGE = 'gemini-2.5-flash-image',
  GEMINI_PRO_IMAGE = 'gemini-3-pro-image-preview',
}

export type BackgroundOption = 'white' | 'green';