export type Tool = 'pen' | 'highlighter' | 'circle' | 'rectangle' | 'arrow' | 'text';

export interface Point {
  x: number;
  y: number;
}

export interface Annotation {
  id: string;
  type: Tool;
  color: string;
  strokeWidth: number;
  opacity: number;
  points?: Point[];    // For pen/highlighter
  start?: Point;       // For shapes/arrow/text
  end?: Point;         // For shapes/arrow
  text?: string;       // For text annotations
}
