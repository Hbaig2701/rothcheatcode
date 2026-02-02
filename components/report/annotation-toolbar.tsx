"use client";

import { useState } from "react";
import type { Tool } from "./annotation-types";
import {
  Pen,
  Highlighter,
  Circle,
  Square,
  ArrowRight,
  Type,
  Undo2,
  Redo2,
  Trash2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AnnotationToolbarProps {
  activeTool: Tool;
  color: string;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onDone: () => void;
}

const TOOLS: { id: Tool; icon: React.ElementType; label: string }[] = [
  { id: "pen", icon: Pen, label: "Pen (P)" },
  { id: "highlighter", icon: Highlighter, label: "Highlighter (H)" },
  { id: "circle", icon: Circle, label: "Circle (C)" },
  { id: "rectangle", icon: Square, label: "Rectangle (R)" },
  { id: "arrow", icon: ArrowRight, label: "Arrow (A)" },
  { id: "text", icon: Type, label: "Text (T)" },
];

const COLORS = [
  { id: "red", value: "#ef4444" },
  { id: "yellow", value: "#fbbf24" },
  { id: "blue", value: "#3b82f6" },
  { id: "green", value: "#22c55e" },
  { id: "orange", value: "#f97316" },
  { id: "purple", value: "#8b5cf6" },
  { id: "black", value: "#000000" },
  { id: "white", value: "#ffffff" },
];

export function AnnotationToolbar({
  activeTool,
  color,
  canUndo,
  canRedo,
  onToolChange,
  onColorChange,
  onUndo,
  onRedo,
  onClear,
  onDone,
}: AnnotationToolbarProps) {
  const [colorOpen, setColorOpen] = useState(false);

  return (
    <div className="sticky top-0 z-[60] flex items-center gap-1.5 bg-[#1A1A1A] border-b border-[#2A2A2A] px-4 py-2.5 rounded-t-lg">
      {/* Tool buttons */}
      <div className="flex items-center gap-1">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              title={tool.label}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-lg border transition-all",
                isActive
                  ? "bg-[#F5B800] border-[#F5B800] text-black"
                  : "bg-transparent border-transparent text-[#A0A0A0] hover:bg-[#2A2A2A] hover:border-[#3A3A3A] hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-7 bg-[#2A2A2A] mx-1.5" />

      {/* Color picker */}
      <div className="relative">
        <button
          onClick={() => setColorOpen(!colorOpen)}
          title="Color"
          className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#3A3A3A] hover:border-[#5A5A5A] transition-all"
        >
          <div
            className="w-5 h-5 rounded-sm border border-white/20"
            style={{ backgroundColor: color }}
          />
        </button>

        {colorOpen && (
          <div className="absolute top-full left-0 mt-1 grid grid-cols-4 gap-1.5 p-2.5 bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg shadow-xl z-[70]">
            {COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onColorChange(c.value);
                  setColorOpen(false);
                }}
                className={cn(
                  "w-7 h-7 rounded-sm border-2 transition-all hover:scale-110",
                  color === c.value
                    ? "border-[#F5B800]"
                    : "border-transparent hover:border-white/40"
                )}
                style={{ backgroundColor: c.value }}
                title={c.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="w-px h-7 bg-[#2A2A2A] mx-1.5" />

      {/* Undo / Redo / Clear */}
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[#A0A0A0] hover:bg-[#2A2A2A] hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#A0A0A0]"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[#A0A0A0] hover:bg-[#2A2A2A] hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#A0A0A0]"
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <button
          onClick={onClear}
          title="Clear All"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-[#A0A0A0] hover:bg-red-500/20 hover:text-red-400 transition-all"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Done button */}
      <button
        onClick={onDone}
        className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-black bg-[#F5B800] rounded-md hover:bg-[#DEAD00] hover:shadow-[0_0_20px_rgba(245,184,0,0.3)] transition-all"
      >
        <Check className="h-4 w-4" />
        Done
      </button>
    </div>
  );
}
