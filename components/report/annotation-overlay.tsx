"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Undo2,
  Redo2,
  Trash2,
  Circle,
  Square,
  Minus,
  ArrowRight,
  Pencil,
  Type,
  MousePointer2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = "select" | "pen" | "line" | "arrow" | "rectangle" | "circle" | "text";
type AnnotationShape = {
  id: string;
  tool: Tool;
  color: string;
  strokeWidth: number;
  points?: { x: number; y: number }[];
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  text?: string;
};

interface AnnotationOverlayProps {
  onExit: () => void;
}

const COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#ffffff", // white
];

const STROKE_WIDTHS = [2, 4, 6, 8];

export function AnnotationOverlay({ onExit }: AnnotationOverlayProps) {
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [annotations, setAnnotations] = useState<AnnotationShape[]>([]);
  const [history, setHistory] = useState<AnnotationShape[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<AnnotationShape | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus text input when it appears
  useEffect(() => {
    if (textInput && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [textInput]);

  // Handle scroll pass-through - find and scroll the dashboard container
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      // Find the scrollable dashboard element (has overflow-y-auto and h-full)
      const scrollContainers = document.querySelectorAll('.overflow-y-auto');
      for (const container of scrollContainers) {
        const rect = container.getBoundingClientRect();
        // Check if this container is visible and large enough to be the main scroll area
        if (rect.height > 200 && rect.width > 200) {
          (container as HTMLElement).scrollTop += e.deltaY;
          break;
        }
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  const saveToHistory = useCallback((newAnnotations: AnnotationShape[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setAnnotations(history[historyIndex - 1]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setAnnotations(history[historyIndex + 1]);
    }
  };

  const clearAll = () => {
    setAnnotations([]);
    saveToHistory([]);
  };

  const getMousePosition = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // In select mode, don't draw
    if (tool === "select") return;

    if (tool === "text") {
      const pos = getMousePosition(e);
      setTextInput({ x: pos.x, y: pos.y });
      setTextValue("");
      return;
    }

    setIsDrawing(true);
    const pos = getMousePosition(e);
    const id = `annotation-${Date.now()}`;

    if (tool === "pen") {
      setCurrentShape({
        id,
        tool,
        color,
        strokeWidth,
        points: [{ x: pos.x, y: pos.y }],
      });
    } else {
      setCurrentShape({
        id,
        tool,
        color,
        strokeWidth,
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing || !currentShape) return;
    const pos = getMousePosition(e);

    if (tool === "pen" && currentShape.points) {
      setCurrentShape({
        ...currentShape,
        points: [...currentShape.points, { x: pos.x, y: pos.y }],
      });
    } else {
      setCurrentShape({
        ...currentShape,
        endX: pos.x,
        endY: pos.y,
      });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentShape) return;
    setIsDrawing(false);
    const newAnnotations = [...annotations, currentShape];
    setAnnotations(newAnnotations);
    saveToHistory(newAnnotations);
    setCurrentShape(null);
  };

  const handleTextSubmit = () => {
    if (textInput && textValue.trim()) {
      const newAnnotation: AnnotationShape = {
        id: `annotation-${Date.now()}`,
        tool: "text",
        color,
        strokeWidth,
        startX: textInput.x,
        startY: textInput.y,
        text: textValue,
      };
      const newAnnotations = [...annotations, newAnnotation];
      setAnnotations(newAnnotations);
      saveToHistory(newAnnotations);
    }
    setTextInput(null);
    setTextValue("");
  };

  const renderShape = (shape: AnnotationShape, isPreview = false) => {
    const opacity = isPreview ? 0.7 : 1;

    switch (shape.tool) {
      case "pen":
        if (!shape.points || shape.points.length < 2) return null;
        const pathData = shape.points.reduce((acc, point, i) => {
          return acc + (i === 0 ? `M ${point.x} ${point.y}` : ` L ${point.x} ${point.y}`);
        }, "");
        return (
          <path
            key={shape.id}
            d={pathData}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={opacity}
          />
        );

      case "line":
        return (
          <line
            key={shape.id}
            x1={shape.startX}
            y1={shape.startY}
            x2={shape.endX}
            y2={shape.endY}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            strokeLinecap="round"
            opacity={opacity}
          />
        );

      case "arrow":
        const dx = (shape.endX ?? 0) - (shape.startX ?? 0);
        const dy = (shape.endY ?? 0) - (shape.startY ?? 0);
        const angle = Math.atan2(dy, dx);
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;
        const x1 = (shape.endX ?? 0) - arrowLength * Math.cos(angle - arrowAngle);
        const y1 = (shape.endY ?? 0) - arrowLength * Math.sin(angle - arrowAngle);
        const x2 = (shape.endX ?? 0) - arrowLength * Math.cos(angle + arrowAngle);
        const y2 = (shape.endY ?? 0) - arrowLength * Math.sin(angle + arrowAngle);
        return (
          <g key={shape.id} opacity={opacity}>
            <line
              x1={shape.startX}
              y1={shape.startY}
              x2={shape.endX}
              y2={shape.endY}
              stroke={shape.color}
              strokeWidth={shape.strokeWidth}
              strokeLinecap="round"
            />
            <polygon
              points={`${shape.endX},${shape.endY} ${x1},${y1} ${x2},${y2}`}
              fill={shape.color}
            />
          </g>
        );

      case "rectangle":
        const rectX = Math.min(shape.startX ?? 0, shape.endX ?? 0);
        const rectY = Math.min(shape.startY ?? 0, shape.endY ?? 0);
        const rectW = Math.abs((shape.endX ?? 0) - (shape.startX ?? 0));
        const rectH = Math.abs((shape.endY ?? 0) - (shape.startY ?? 0));
        return (
          <rect
            key={shape.id}
            x={rectX}
            y={rectY}
            width={rectW}
            height={rectH}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            fill="none"
            opacity={opacity}
          />
        );

      case "circle":
        const cx = ((shape.startX ?? 0) + (shape.endX ?? 0)) / 2;
        const cy = ((shape.startY ?? 0) + (shape.endY ?? 0)) / 2;
        const rx = Math.abs((shape.endX ?? 0) - (shape.startX ?? 0)) / 2;
        const ry = Math.abs((shape.endY ?? 0) - (shape.startY ?? 0)) / 2;
        return (
          <ellipse
            key={shape.id}
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            stroke={shape.color}
            strokeWidth={shape.strokeWidth}
            fill="none"
            opacity={opacity}
          />
        );

      case "text":
        return (
          <text
            key={shape.id}
            x={shape.startX}
            y={shape.startY}
            fill={shape.color}
            fontSize={shape.strokeWidth * 5}
            fontFamily="system-ui, sans-serif"
            fontWeight="600"
            opacity={opacity}
          >
            {shape.text}
          </text>
        );

      default:
        return null;
    }
  };

  const tools: { id: Tool; icon: React.ReactNode; label: string }[] = [
    { id: "select", icon: <MousePointer2 className="h-4 w-4" />, label: "Select (scroll)" },
    { id: "pen", icon: <Pencil className="h-4 w-4" />, label: "Pen" },
    { id: "line", icon: <Minus className="h-4 w-4" />, label: "Line" },
    { id: "arrow", icon: <ArrowRight className="h-4 w-4" />, label: "Arrow" },
    { id: "rectangle", icon: <Square className="h-4 w-4" />, label: "Rectangle" },
    { id: "circle", icon: <Circle className="h-4 w-4" />, label: "Circle" },
    { id: "text", icon: <Type className="h-4 w-4" />, label: "Text" },
  ];

  const getCursor = () => {
    if (tool === "select") return "default";
    if (tool === "text") return "text";
    return "crosshair";
  };

  return (
    <div ref={containerRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 50 }}>
      {/* Toolbar - Fixed at top */}
      <div
        className="pointer-events-auto fixed top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#1a1a1a] border border-[rgba(255,255,255,0.1)] rounded-xl p-1.5 shadow-2xl"
        style={{ zIndex: 60 }}
      >
        {/* Tools */}
        <div className="flex items-center gap-0.5 pr-2 border-r border-[rgba(255,255,255,0.1)]">
          {tools.map((t) => (
            <button
              key={t.id}
              onClick={() => setTool(t.id)}
              className={cn(
                "p-2 rounded-lg transition-colors",
                tool === t.id
                  ? "bg-gold text-[#0c0c0c]"
                  : "text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.08)]"
              )}
              title={t.label}
            >
              {t.icon}
            </button>
          ))}
        </div>

        {/* Colors */}
        <div className="flex items-center gap-1 px-2 border-r border-[rgba(255,255,255,0.1)]">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn(
                "w-6 h-6 rounded-full transition-all",
                color === c && "ring-2 ring-offset-2 ring-offset-[#1a1a1a] ring-white"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Stroke Width */}
        <div className="flex items-center gap-1 px-2 border-r border-[rgba(255,255,255,0.1)]">
          {STROKE_WIDTHS.map((sw) => (
            <button
              key={sw}
              onClick={() => setStrokeWidth(sw)}
              className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                strokeWidth === sw
                  ? "bg-[rgba(255,255,255,0.15)]"
                  : "hover:bg-[rgba(255,255,255,0.08)]"
              )}
              title={`${sw}px`}
            >
              <div
                className="rounded-full bg-white"
                style={{ width: sw + 2, height: sw + 2 }}
              />
            </button>
          ))}
        </div>

        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5 px-2 border-r border-[rgba(255,255,255,0.1)]">
          <button
            onClick={undo}
            disabled={historyIndex <= 0}
            className={cn(
              "p-2 rounded-lg transition-colors",
              historyIndex <= 0
                ? "text-[rgba(255,255,255,0.2)] cursor-not-allowed"
                : "text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.08)]"
            )}
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            className={cn(
              "p-2 rounded-lg transition-colors",
              historyIndex >= history.length - 1
                ? "text-[rgba(255,255,255,0.2)] cursor-not-allowed"
                : "text-[rgba(255,255,255,0.6)] hover:bg-[rgba(255,255,255,0.08)]"
            )}
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>

        {/* Trash */}
        <button
          onClick={clearAll}
          className="p-2 rounded-lg text-[rgba(255,255,255,0.6)] hover:bg-[rgba(248,113,113,0.15)] hover:text-[#f87171] transition-colors"
          title="Clear All"
        >
          <Trash2 className="h-4 w-4" />
        </button>

        {/* Exit */}
        <button
          onClick={onExit}
          className="ml-1 p-2 rounded-lg bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.8)] hover:bg-[rgba(255,255,255,0.12)] transition-colors"
          title="Exit Annotation Mode"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Drawing Canvas */}
      <svg
        ref={svgRef}
        className={cn(
          "absolute inset-0 w-full h-full",
          tool !== "select" && "pointer-events-auto"
        )}
        style={{ cursor: getCursor() }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Rendered annotations */}
        {annotations.map((shape) => renderShape(shape))}
        {/* Current shape being drawn */}
        {currentShape && renderShape(currentShape, true)}
      </svg>

      {/* Text input overlay */}
      {textInput && (
        <div
          className="fixed pointer-events-auto"
          style={{ left: textInput.x, top: textInput.y, zIndex: 70 }}
        >
          <input
            ref={textInputRef}
            type="text"
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTextSubmit();
              if (e.key === "Escape") {
                setTextInput(null);
                setTextValue("");
              }
            }}
            onBlur={handleTextSubmit}
            className="bg-[rgba(0,0,0,0.8)] border border-[rgba(255,255,255,0.2)] rounded px-2 py-1 text-white outline-none min-w-[150px]"
            style={{
              fontSize: strokeWidth * 5,
              color: color,
            }}
            placeholder="Type and press Enter"
          />
        </div>
      )}

      {/* Select mode hint */}
      {tool === "select" && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[rgba(0,0,0,0.8)] text-white text-sm px-4 py-2 rounded-lg" style={{ zIndex: 60 }}>
          Select mode: Click and scroll normally. Switch to a drawing tool to annotate.
        </div>
      )}
    </div>
  );
}
